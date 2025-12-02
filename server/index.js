const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto'); 

// --- Global Configuration Check ---
if (!process.env.AIRTABLE_CLIENT_ID) {
  console.error("❌ FATAL ERROR: Missing AIRTABLE_CLIENT_ID in server/.env file.");
  process.exit(1);
}

const ALLOWED_ORIGIN = process.env.VERCEL_FRONTEND_URL || 'http://localhost:3000'; 
const app = express();

// --- CORS Configuration ---
// We no longer need credentials: true because we aren't using cookies!
app.use(cors({ 
    origin: ALLOWED_ORIGIN,
})); 
app.use(express.json());

// --- DB Connection ---
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/airtable-builder")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err.message));

// --- Security Helpers ---
const base64URLEncode = (str) => str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest();
const generateRandomString = (length = 32) => base64URLEncode(crypto.randomBytes(length));

// --- Models ---
const userSchema = new mongoose.Schema({
  airtableUserId: String,
  email: String,
  accessToken: String,
  refreshToken: String,
  tokenExpiresAt: Date,
});
const User = mongoose.model('User', userSchema);

const formSchema = new mongoose.Schema({
  userId: String,
  baseId: String,
  tableId: String,
  title: String,
  webhookId: String,
  fields: [] 
}, { strict: false }); 
const Form = mongoose.model('Form', formSchema);

const responseSchema = new mongoose.Schema({
  formId: String,
  airtableRecordId: String,
  answers: mongoose.Schema.Types.Mixed,
  submittedAt: { type: Date, default: Date.now }
});
const Response = mongoose.model('Response', responseSchema);

// --- Middleware (Updated for Token Auth) ---
const requireAuth = async (req, res, next) => {
  // NEW: Check Authorization Header instead of Cookies
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) return res.status(401).json({ error: "Unauthorized: No token provided" });

  // In this simple version, the "token" is just the userId. 
  // In a complex app, this would be a JWT.
  const user = await User.findById(token);
  if (!user) return res.status(401).json({ error: "User not found" });
  req.user = user;
  next();
};

// --- Auth Routes ---

app.get('/auth/login', (req, res) => {
  const verifier = generateRandomString();
  const challenge = base64URLEncode(sha256(verifier));
  
  // We can still use a cookie for the temporary verifier (short lived)
  res.cookie('auth_verifier', verifier, { httpOnly: true, maxAge: 300000, secure: true, sameSite: 'None' }); 

  const frontendUrl = req.query.returnTo ? decodeURIComponent(req.query.returnTo.toString()) : 'http://localhost:3000/';
  const securityState = generateRandomString();
  const state = `${securityState}--${base64URLEncode(Buffer.from(frontendUrl))}`;
  
  const scopes = 'data.records:read data.records:write schema.bases:read webhook:manage user.email:read';
  const CLIENT_ID = process.env.AIRTABLE_CLIENT_ID.trim();
  const REDIRECT_URI = process.env.AIRTABLE_REDIRECT_URI.trim();

  const authUrl = `https://airtable.com/oauth2/v1/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;
  const verifier = req.cookies.auth_verifier;

  if (error) return res.status(400).send(`Error: ${error_description}`);
  if (!code) return res.status(400).send("No code received.");
  if (!verifier) return res.status(400).send("Session expired. Connect again.");

  try {
    const CLIENT_ID = process.env.AIRTABLE_CLIENT_ID.trim();
    const CLIENT_SECRET = process.env.AIRTABLE_CLIENT_SECRET.trim();
    const REDIRECT_URI = process.env.AIRTABLE_REDIRECT_URI.trim();
    
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post('https://airtable.com/oauth2/v1/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier 
      }), 
      { headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token } = response.data;
    const meRes = await axios.get('https://api.airtable.com/v0/meta/whoami', { headers: { Authorization: `Bearer ${access_token}` } });
    
    const user = await User.findOneAndUpdate(
      { airtableUserId: meRes.data.id },
      { email: meRes.data.email, accessToken: access_token, refreshToken: refresh_token, tokenExpiresAt: new Date(Date.now() + 3600 * 1000) },
      { new: true, upsert: true }
    );

    let finalRedirectUrl = 'http://localhost:3000/'; 
    if (state && typeof state === 'string' && state.includes('--')) {
        const parts = state.split('--');
        if (parts.length === 2) {
            finalRedirectUrl = Buffer.from(parts[1], 'base64').toString('utf8');
        }
    }

    res.clearCookie('auth_verifier');
    
    // NEW STRATEGY: Pass the token (userId) in the URL Query Param
    // The frontend will pluck this out and save it.
    const redirectWithToken = `${finalRedirectUrl}?token=${user._id.toString()}`;
    res.redirect(redirectWithToken);

  } catch (error) {
    console.error("Auth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Auth failed" });
  }
});

// --- Main API Routes ---

app.get('/api/bases', requireAuth, async (req, res) => {
  try {
    const response = await axios.get('https://api.airtable.com/v0/meta/bases', { headers: { Authorization: `Bearer ${req.user.accessToken}` } });
    res.json(response.data.bases);
  } catch (error) { res.status(500).json({ error: "Failed to fetch bases" }); }
});

app.get('/api/bases/:baseId/tables', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`https://api.airtable.com/v0/meta/bases/${req.params.baseId}/tables`, { headers: { Authorization: `Bearer ${req.user.accessToken}` } });
    res.json(response.data.tables);
  } catch (error) { res.status(500).json({ error: "Failed to fetch tables" }); }
});

app.post('/api/forms', requireAuth, async (req, res) => {
  try {
    const newForm = await Form.create({ userId: req.user._id.toString(), ...req.body });
    const NGROK_URL = process.env.NGROK_URL; 

    if (NGROK_URL && NGROK_URL.startsWith('http')) {
      try {
        const webhookUrl = `${NGROK_URL}/webhooks/airtable/${newForm._id}`;
        const hookRes = await axios.post(
          `https://api.airtable.com/v0/bases/${newForm.baseId}/webhooks`,
          {
            notificationUrl: webhookUrl,
            specification: { options: { filters: { dataTypes: ["tableData"] } } }
          },
          { headers: { Authorization: `Bearer ${req.user.accessToken}`, 'Content-Type': 'application/json' } }
        );
        newForm.webhookId = hookRes.data.id;
        await newForm.save();
      } catch (hookErr) { console.error("Webhook Failed"); }
    }
    res.json(newForm);
  } catch (error) { res.status(500).json({ error: "Failed to save form" }); }
});

app.post('/api/forms/:formId/submit', async (req, res) => {
  const { formId } = req.params;
  const userAnswers = req.body;
  try {
    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ error: "Form not found" });
    const user = await User.findById(form.userId);
    
    const airtableFields = {};
    form.fields.forEach(f => { if (userAnswers[f.fieldId]) airtableFields[f.fieldId] = userAnswers[f.fieldId]; });

    const airtableRes = await axios.post(
      `https://api.airtable.com/v0/${form.baseId}/${form.tableId}`,
      { fields: airtableFields },
      { headers: { Authorization: `Bearer ${user.accessToken}` } }
    );
    await Response.create({ formId, airtableRecordId: airtableRes.data.id, answers: userAnswers });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: "Submission failed" }); }
});

app.get('/api/forms', requireAuth, async (req, res) => {
  const forms = await Form.find({ userId: req.user._id.toString() });
  res.json(forms);
});

app.get('/api/forms/:formId/responses', requireAuth, async (req, res) => {
  const responses = await Response.find({ formId: req.params.formId }).sort({ submittedAt: -1 });
  res.json(responses);
});

app.post('/webhooks/airtable/:formId', async (req, res) => {
  res.status(200).send('OK');
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));
