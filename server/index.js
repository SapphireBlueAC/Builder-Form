const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// --- 🟢 PASTE YOUR NGROK URL HERE ---
const NGROK_URL = "https://atonally-reprobative-eulalia.ngrok-free.dev"; 
// ------------------------------------

// Check Keys
if (!process.env.AIRTABLE_CLIENT_ID) {
  console.error("❌ ERROR: Missing keys in server/.env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/airtable-builder")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// --- Helpers ---
const base64URLEncode = (str) => str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest();

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

// --- Middleware ---
const requireAuth = async (req, res, next) => {
  const { userId } = req.cookies;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ error: "User not found" });
  req.user = user;
  next();
};

// --- Auth Routes ---
app.get('/auth/login', (req, res) => {
  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(sha256(verifier));
  res.cookie('auth_verifier', verifier, { httpOnly: true, maxAge: 300000 }); 

  const scopes = 'data.records:read data.records:write schema.bases:read webhook:manage user.email:read';
  const state = 'random123';
  
  const authUrl = `https://airtable.com/oauth2/v1/authorize?client_id=${process.env.AIRTABLE_CLIENT_ID.trim()}&redirect_uri=${encodeURIComponent(process.env.AIRTABLE_REDIRECT_URI.trim())}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  const verifier = req.cookies.auth_verifier;

  if (error) return res.status(400).send(`Error: ${error_description}`);
  if (!code) return res.status(400).send("No code received.");
  if (!verifier) return res.status(400).send("Session expired.");

  try {
    const credentials = Buffer.from(`${process.env.AIRTABLE_CLIENT_ID.trim()}:${process.env.AIRTABLE_CLIENT_SECRET.trim()}`).toString('base64');
    
    const response = await axios.post('https://airtable.com/oauth2/v1/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: process.env.AIRTABLE_REDIRECT_URI.trim(),
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

    res.clearCookie('auth_verifier');
    res.cookie('userId', user._id.toString(), { httpOnly: false });
    res.redirect('http://localhost:3000/');
  } catch (error) {
    console.error("Auth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Auth failed" });
  }
});

// --- Main Routes ---

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

// Save Form & Register Webhook
app.post('/api/forms', requireAuth, async (req, res) => {
  try {
    const newForm = await Form.create({ userId: req.user._id.toString(), ...req.body });
    
    // Webhook Registration Logic
    if (NGROK_URL) {
      try {
        const webhookUrl = `${NGROK_URL}/webhooks/airtable/${newForm._id}`;
        console.log("🔗 Registering webhook:", webhookUrl);

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
        console.log("✅ Webhook Registered! ID:", hookRes.data.id);
      } catch (hookErr) {
        console.error("⚠️ Webhook Failed:", hookErr.response?.data?.error?.message || hookErr.message);
      }
    }

    res.json(newForm);
  } catch (error) { 
    console.error("Save Error:", error.message);
    res.status(500).json({ error: "Failed to save form" }); 
  }
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

// --- Webhook Receiver ---
app.post('/webhooks/airtable/:formId', async (req, res) => {
  const { formId } = req.params;
  console.log(`\n🔔 BEEP BEEP! Webhook received for Form ${formId}`);
  // In a real app, parse `req.body` to sync data.
  res.status(200).send('OK');
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));