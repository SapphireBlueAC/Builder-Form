import React, { useEffect, useState } from "react";
import axios from "axios";

// The FormRenderer and ResponseViewer components are now defined later in this file
// to resolve the 'Could not resolve' import errors.

// --- GLOBAL CONFIGURATION (FIXED) ---
// !!! IMPORTANT: THIS MUST BE YOUR ACTUAL RENDER BACKEND URL !!!
const API_URL = 'https://conditional-form-backend.onrender.com'; // <--- **YOUR LIVE RENDER URL HERE**
const isPlaceholderActive = false; // We hardcoded the URL, so the placeholder check is removed.

if (!isPlaceholderActive) {
    axios.defaults.withCredentials = true;
    axios.defaults.baseURL = API_URL;
}

// Only allow these Airtable field types to keep things simple
const ALLOWED_TYPES = [
  "singleLineText",
  "multilineText",
  "singleSelect",
  "multipleSelects",
];

// -----------------------------------------------------------------------------
// --- 1. LOGIC ENGINE (Moved to the main file) ---
// -----------------------------------------------------------------------------

export type Operator = "equals" | "notEquals" | "contains";

export interface Condition {
  questionKey: string; // The ID of the field we are checking
  operator: Operator;
  value: any;
}

export interface ConditionalRules {
  logic: "AND" | "OR";
  conditions: Condition[];
}

export function shouldShowQuestion(
  rules: ConditionalRules | null | undefined,
  answersSoFar: Record<string, any>
): boolean {
  // 1. If no rules exist, always show the question
  if (!rules || !rules.conditions || rules.conditions.length === 0) {
    return true;
  }

  // 2. Evaluate every condition
  const results = rules.conditions.map((condition) => {
    const userAnswer = answersSoFar[condition.questionKey];

    // If the user hasn't answered the dependency yet, it's a mismatch
    if (userAnswer === undefined || userAnswer === null) return false;

    switch (condition.operator) {
      case "equals":
        // usage: answers['role'] === 'Engineer'
        return String(userAnswer) === String(condition.value);

      case "notEquals":
        return String(userAnswer) !== String(condition.value);

      case "contains":
        // Handle arrays (Multi-select) or Strings
        if (Array.isArray(userAnswer)) {
          return userAnswer.includes(condition.value);
        }
        return String(userAnswer).includes(condition.value);

      default:
        return false;
    }
  });

  // 3. Combine results based on AND / OR
  if (rules.logic === "AND") {
    return results.every((res) => res === true);
  } else {
    // OR logic
    return results.some((res) => res === true);
  }
}

// -----------------------------------------------------------------------------
// --- 2. FORM RENDERER (Moved to the main file) ---
// Based on the content of FormRenderer.tsx
// -----------------------------------------------------------------------------

interface FormRendererProps {
  form: any;
  onBack: () => void;
}

const FormRenderer: React.FC<FormRendererProps> = ({ form, onBack }) => {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update state when user types/selects
  const handleChange = (fieldId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    // We can no longer check against API_URL_PLACEHOLDER, so we use the boolean flag
    if (isPlaceholderActive) {
        alert("Configuration Error: Please set the actual API_URL in App.tsx before submitting.");
        return;
    }
      
    // 1. VALIDATION
    const missingFields = form.fields.filter((field: any) => {
      const isVisible = shouldShowQuestion(field.logic?.rules, answers);
      return isVisible && field.required && !answers[field.fieldId];
    });

    if (missingFields.length > 0) {
      const fieldNames = missingFields.map((f: any) => f.label).join(", ");
      alert(`Please fill in the following required fields: ${fieldNames}`);
      return;
    }

    setIsSubmitting(true);

    try {
      console.log("📤 Submitting form...", answers);

      // 2. SUBMIT TO SERVER
      // Using relative path, relying on axios.defaults.baseURL set globally.
      await axios.post(
        `/api/forms/${form._id}/submit`,
        answers
      );

      alert("✅ Success! Response saved to Airtable & Database.");
      onBack(); // Return to main list
    } catch (error: any) {
      console.error("❌ Submission Error:", error);
      const msg =
        error.response?.data?.error || error.message || "Unknown error";
      alert(`Failed to submit: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: "30px",
        maxWidth: "600px",
        margin: "0 auto",
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        background: "#fff",
        fontFamily: "sans-serif",
        boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
      }}
    >
      <button
        onClick={onBack}
        style={{
          marginBottom: "20px",
          cursor: "pointer",
          border: "none",
          background: "transparent",
          color: "#007bff",
          fontSize: "14px",
        }}
      >
        ← Back to Forms
      </button>

      <h2
        style={{
          marginTop: 0,
          marginBottom: "20px",
          borderBottom: "1px solid #f0f0f0",
          paddingBottom: "15px",
        }}
      >
        {form.title}
      </h2>

      <form onSubmit={(e) => e.preventDefault()}>
        {form.fields.map((field: any) => {
          // --- LOGIC ENGINE CHECK ---
          const isVisible = shouldShowQuestion(field.logic?.rules, answers);

          if (!isVisible) return null; // Hide completely if logic says so
          // --------------------------

          return (
            <div key={field.fieldId} style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#333",
                }}
              >
                {field.label}{" "}
                {field.required && (
                  <span style={{ color: "red", marginLeft: "2px" }}>*</span>
                )}
              </label>

              {/* Render Inputs based on Airtable Type */}

              {(field.type === "singleLineText" ||
                field.type === "multilineText") && (
                <input
                  type="text"
                  style={AppStyles.input}
                  value={answers[field.fieldId] || ""}
                  onChange={(e) => handleChange(field.fieldId, e.target.value)}
                  placeholder="Your answer..."
                  disabled={isSubmitting}
                />
              )}

              {field.type === "singleSelect" && (
                <select
                  style={AppStyles.select}
                  value={answers[field.fieldId] || ""}
                  onChange={(e) => handleChange(field.fieldId, e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">-- Select an option --</option>
                  {field.options &&
                    field.options.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                </select>
              )}

              {/* Fallback for others */}
              {!["singleLineText", "multilineText", "singleSelect"].includes(
                field.type
              ) && (
                <div
                  style={{
                    padding: "10px",
                    background: "#fff3cd",
                    color: "#856404",
                    borderRadius: "4px",
                    fontSize: "13px",
                  }}
                >
                  Input type <strong>{field.type}</strong> is not fully
                  supported in this preview.
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            ...AppStyles.submitBtn,
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Sending to Airtable..." : "Submit Form"}
        </button>
      </form>
    </div>
  );
};


// -----------------------------------------------------------------------------
// --- 3. RESPONSE VIEWER (Placeholder) ---
// -----------------------------------------------------------------------------

interface ResponseViewerProps {
  form: any;
  onBack: () => void;
}

const ResponseViewer: React.FC<ResponseViewerProps> = ({ form, onBack }) => {
    // In a real app, this component would fetch form submissions from the backend.
    return (
        <div style={{ padding: "30px", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
            <button
                onClick={onBack}
                style={{
                    marginBottom: "20px",
                    cursor: "pointer",
                    border: "none",
                    background: "transparent",
                    color: "#007bff",
                    fontSize: "14px",
                }}
            >
                ← Back to Forms
            </button>
            <h2 style={{ color: "#28a745" }}>📊 Responses for: {form.title}</h2>
            <div style={{ padding: '20px', background: '#e9f7ef', borderRadius: '8px' }}>
                <p><strong>Status:</strong> Response viewer functionality is pending.</p>
                <p>To view responses, the backend needs an endpoint to fetch submissions from the database (MongoDB) based on the form ID, and display them here.</p>
                <p>This is currently a placeholder to resolve the compilation error.</p>
            </div>
        </div>
    );
};


// -----------------------------------------------------------------------------
// --- 4. MAIN APP COMPONENT (The original App.tsx logic) ---
// -----------------------------------------------------------------------------

function App() {
  // If the placeholder is active, we cannot reliably check for auth, so we start disconnected
  const [isConnected, setIsConnected] = useState(false); 
  const [view, setView] = useState<"BUILDER" | "RENDERER" | "RESPONSES">(
    "BUILDER"
  );
  const [connectionMessage, setConnectionMessage] = useState<string | null>(
    isPlaceholderActive ? "Configuration Error: API_URL not set." : null
  );

  // --- Data State ---
  const [bases, setBases] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [savedForms, setSavedForms] = useState<any[]>([]);
  const [activeForm, setActiveForm] = useState<any>(null);

  // --- Builder State (Selection) ---
  const [selectedBase, setSelectedBase] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableFields, setTableFields] = useState<any[]>([]);
  const [formFields, setFormFields] = useState<any[]>([]);

  // --- Logic Modal State ---
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [logicRule, setLogicRule] = useState({
    triggerFieldId: "",
    operator: "equals",
    value: "",
  });

  // 1. On Mount: Check if logged in & fetch initial data
  useEffect(() => {
    if (isPlaceholderActive) return;

    // We check for the cookie set by the backend
    if (document.cookie.includes("userId")) {
      setIsConnected(true);
      setConnectionMessage(null);
      fetchBases();
      fetchSavedForms();
    } else {
      // If the URL is set but the cookie is missing (auth required)
      setConnectionMessage("Please connect your Airtable account.");
    }
  }, []);

  // --- API Helpers ---
  const fetchBases = async () => {
    try {
      const res = await axios.get(`/api/bases`);
      setBases(res.data);
    } catch (e) {
      console.error("Error fetching bases. Token expired or API down.", e);
      // alert("Error fetching bases. Check if your auth token is expired.");
    }
  };

  const fetchSavedForms = async () => {
    try {
      const res = await axios.get(`/api/forms`);
      setSavedForms(res.data);
    } catch (e) {
      console.error("Error fetching saved forms.", e);
    }
  };

  // --- Event Handlers ---

  // When User Selects a Base -> Fetch Tables
  const handleBaseChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const baseId = e.target.value;
    setSelectedBase(baseId);
    setTables([]);
    setSelectedTable("");

    if (baseId && baseId !== "-- Choose Base --") {
      try {
        const res = await axios.get(`/api/bases/${baseId}/tables`);
        setTables(res.data);
      } catch (e) {
        console.error("Error fetching tables.", e);
      }
    }
  };

  // When User Selects a Table -> Fetch Fields
  const handleTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tableId = e.target.value;
    setSelectedTable(tableId);

    const table = tables.find((t) => t.id === tableId);
    if (table) {
      // Filter out unsupported types (like Rollups, Formulas, Lookup)
      const supported = table.fields.filter((f: any) =>
        ALLOWED_TYPES.includes(f.type)
      );
      setTableFields(supported);
      setFormFields([]); // Reset current selection when table changes
    }
  };

  // Toggle Field Selection (Check/Uncheck)
  const toggleField = (field: any) => {
    const exists = formFields.find((f) => f.fieldId === field.id);

    if (exists) {
      // Remove field
      setFormFields(formFields.filter((f) => f.fieldId !== field.id));
    } else {
      // Add field with default structure (empty logic)
      setFormFields([
        ...formFields,
        {
          fieldId: field.id,
          label: field.name,
          type: field.type,
          options: field.options
            ? field.options.choices.map((c: any) => c.name)
            : [],
          required: false,
          logic: { rules: { logic: "AND", conditions: [] } },
        },
      ]);
    }
  };

  // Save a new Logic Rule to the 'editingFieldId'
  const saveLogic = () => {
    if (!editingFieldId) return;

    // Update the specific field in our state with the new rule
    setFormFields((prev) =>
      prev.map((f) => {
        if (f.fieldId === editingFieldId) {
          return {
            ...f,
            logic: {
              ...f.logic,
              rules: {
                ...f.logic.rules,
                conditions: [
                  ...f.logic.rules.conditions,
                  {
                    questionKey: logicRule.triggerFieldId,
                    operator: logicRule.operator,
                    value: logicRule.value,
                  },
                ],
              },
            },
          };
        }
        return f;
      })
    );
    setEditingFieldId(null); // Close modal
    // Reset logic rule state
    setLogicRule({ triggerFieldId: "", operator: "equals", value: "" });
  };

  // Save the entire form to MongoDB and register webhook
  const saveForm = async () => {
    if (isPlaceholderActive) return alert(connectionMessage);
    if (formFields.length === 0) return;
    try {
      await axios.post(`/api/forms`, {
        baseId: selectedBase,
        tableId: selectedTable,
        title: "Conditional Form " + new Date().toLocaleTimeString(),
        fields: formFields,
      });
      alert("Form Saved Successfully! Webhook Registered.");
      fetchSavedForms();
    } catch (e) {
      console.error("Error saving form:", e);
      alert("Error saving form");
    }
  };

  // --- VIEW: RENDERER (The Preview Mode) ---
  if (view === "RENDERER" && activeForm) {
    // Uses the now-defined local component
    return <FormRenderer form={activeForm} onBack={() => setView("BUILDER")} />;
  }

  // --- VIEW: RESPONSES (The Results Mode) ---
  if (view === "RESPONSES" && activeForm) {
    // Uses the now-defined local component
    return (
      <ResponseViewer form={activeForm} onBack={() => setView("BUILDER")} />
    );
  }

  // --- VIEW: BUILDER (The Main UI) ---
  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "20px auto",
        fontFamily: "sans-serif",
        padding: "20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1 style={{ margin: 0 }}>Airtable Form Builder</h1>
        {isPlaceholderActive && (
          <div style={AppStyles.errorBanner}>
            {connectionMessage}
          </div>
        )}
        {!isConnected && !isPlaceholderActive && (
          <button
            // FINAL FIX: Pass the current Vercel domain to the backend using 'returnTo' parameter
            onClick={() => {
              const returnTo = encodeURIComponent(window.location.origin);
              // CRITICAL: Redirect is only attempted if the placeholder is inactive
              window.location.href = `${API_URL}/auth/login?returnTo=${returnTo}`; 
            }}
            style={AppStyles.connectBtn}
          >
            Connect Airtable
          </button>
        )}
      </div>

      {isConnected && !isPlaceholderActive && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 3fr",
            gap: "30px",
          }}
        >
          {/* LEFT SIDEBAR: Saved Forms List */}
          <div
            style={{
              background: "#f8f9fa",
              padding: "15px",
              borderRadius: "8px",
              height: "fit-content",
            }}
          >
            <h3 style={{ marginTop: 0 }}>📂 Your Forms</h3>
            {savedForms.length === 0 && (
              <p style={{ color: "#666" }}>No forms yet.</p>
            )}

            {savedForms.map((form) => (
              <div key={form._id} style={AppStyles.formCard}>
                <strong style={{ display: "block", marginBottom: "5px" }}>
                  {form.title}
                </strong>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => {
                      setActiveForm(form);
                      setView("RENDERER");
                    }}
                    style={AppStyles.viewBtn}
                  >
                    👁 View
                  </button>
                  <button
                    onClick={() => {
                      setActiveForm(form);
                      setView("RESPONSES");
                    }}
                    style={{
                      ...AppStyles.viewBtn,
                      borderColor: "#28a745",
                      color: "#28a745",
                    }}
                  >
                    📊 Results
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* MAIN AREA: Form Creator */}
          <div>
            <div
              style={{
                padding: "25px",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                background: "white",
              }}
            >
              <h2 style={{ marginTop: 0 }}>🛠 Create New Form</h2>

              {/* Selectors */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "15px",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <label style={AppStyles.label}>Select Base</label>
                  <select
                    onChange={handleBaseChange}
                    value={selectedBase}
                    style={AppStyles.select}
                  >
                    <option value="">-- Choose Base --</option>
                    {bases.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={AppStyles.label}>Select Table</label>
                  <select
                    onChange={handleTableChange}
                    value={selectedTable}
                    style={AppStyles.select}
                    disabled={!selectedBase}
                  >
                    <option value="">-- Choose Table --</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Field List */}
              {tableFields.length > 0 && (
                <div>
                  <h3>Select Fields to Include:</h3>
                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "4px",
                      maxHeight: "500px",
                      overflowY: "auto",
                    }}
                  >
                    {tableFields.map((field) => {
                      const isSelected = formFields.find(
                        (f) => f.fieldId === field.id
                      );
                      return (
                        <div
                          key={field.id}
                          style={{
                            ...AppStyles.fieldRow,
                            background: isSelected ? "#f0f7ff" : "white",
                          }}
                        >
                          <div
                            style={{ display: "flex", alignItems: "center" }}
                          >
                            <input
                              type="checkbox"
                              checked={!!isSelected}
                              onChange={() => toggleField(field)}
                              style={{
                                transform: "scale(1.2)",
                                marginRight: "10px",
                                cursor: "pointer",
                              }}
                            />
                            <span
                              style={{
                                fontWeight: isSelected ? "bold" : "normal",
                              }}
                            >
                              {field.name}
                            </span>
                            <span style={AppStyles.typeTag}>{field.type}</span>
                          </div>

                          {/* Logic Button (Only shows if field is selected) */}
                          {isSelected && (
                            <div
                              style={{ display: "flex", alignItems: "center" }}
                            >
                              {isSelected.logic.rules.conditions.length > 0 && (
                                <span style={AppStyles.logicBadge}>
                                  ⚡ {isSelected.logic.rules.conditions.length}{" "}
                                  Rules
                                </span>
                              )}
                              <button
                                onClick={() => setEditingFieldId(field.id)}
                                style={AppStyles.logicBtn}
                              >
                                ⚙️ Add Logic
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={saveForm} style={AppStyles.saveBtn}>
                    Save Form Schema
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Add Logic Rule --- */}
      {editingFieldId && (
        <div style={AppStyles.modalOverlay}>
          <div style={AppStyles.modal}>
            <h3 style={{ marginTop: 0 }}>Add Logic Rule</h3>
            <p>
              Show this question <strong>ONLY IF</strong>:
            </p>

            <div style={{ marginBottom: "15px" }}>
              <label style={AppStyles.label}>Depending on Field:</label>
              <select
                style={AppStyles.select}
                onChange={(e) =>
                  setLogicRule({ ...logicRule, triggerFieldId: e.target.value })
                }
              >
                <option value="">-- Select Field --</option>
                {formFields
                  .filter((f) => f.fieldId !== editingFieldId)
                  .map((f) => (
                    <option key={f.fieldId} value={f.fieldId}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <label style={AppStyles.label}>Operator:</label>
              <select
                style={AppStyles.select}
                onChange={(e) =>
                  setLogicRule({ ...logicRule, operator: e.target.value })
                }
              >
                <option value="equals">Equals (=)</option>
                <option value="notEquals">Does Not Equal (!=)</option>
                <option value="contains">Contains (for Multi-select)</option>
              </select>
            </div>

            <div style={{ marginBottom: "25px" }}>
              <label style={AppStyles.label}>Value to match:</label>
              <input
                placeholder="e.g. Engineer"
                style={AppStyles.select} // reusing input style
                onChange={(e) =>
                  setLogicRule({ ...logicRule, value: e.target.value })
                }
              />
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                onClick={() => setEditingFieldId(null)}
                style={AppStyles.cancelBtn}
              >
                Cancel
              </button>
              <button onClick={saveLogic} style={AppStyles.addRuleBtn}>
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Inline Styles for Simplicity (Renamed to AppStyles to avoid collision in FormRenderer) ---
const AppStyles = {
  connectBtn: {
    padding: "10px 20px",
    background: "#2D7FF9",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  errorBanner: {
    padding: "10px 20px",
    background: "#ffdddd",
    color: "#d8000c",
    border: "1px solid #fdd",
    borderRadius: "5px",
    fontWeight: "bold",
  },
  formCard: {
    padding: "15px",
    background: "white",
    marginBottom: "10px",
    borderRadius: "6px",
    border: "1px solid #ddd",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  viewBtn: {
    flex: 1,
    padding: "8px",
    background: "transparent",
    border: "1px solid #007bff",
    color: "#007bff",
    borderRadius: "4px",
    cursor: "pointer",
    marginTop: "5px",
  },
  select: {
    width: "100%",
    padding: "10px",
    fontSize: "14px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    boxSizing: "border-box" as const,
  },
  label: {
    display: "block",
    marginBottom: "5px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#555",
  },
  saveBtn: {
    padding: "12px 20px",
    background: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "bold",
    width: "100%",
    marginTop: "20px",
  },
  fieldRow: {
    padding: "12px",
    borderBottom: "1px solid #eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeTag: {
    fontSize: "12px",
    color: "#888",
    marginLeft: "10px",
    background: "#eee",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  logicBadge: {
    fontSize: "12px",
    color: "#d35400",
    marginRight: "10px",
    fontWeight: "bold",
  },
  logicBtn: {
    padding: "5px 10px",
    fontSize: "12px",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "4px",
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    background: "white",
    padding: "25px",
    borderRadius: "8px",
    width: "400px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
  cancelBtn: {
    marginRight: "10px",
    padding: "8px 16px",
    cursor: "pointer",
    border: "1px solid #ccc",
    background: "white",
    borderRadius: "4px",
  },
  addRuleBtn: {
    padding: "8px 20px",
    background: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  // FormRenderer Styles moved here and renamed for local use
  input: {
    width: "100%",
    padding: "10px",
    fontSize: "15px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border 0.2s",
  },
  submitBtn: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "5px",
    fontSize: "16px",
    fontWeight: "bold",
    marginTop: "15px",
    transition: "background-color 0.2s",
  },
};

export default App;
