import React, { useEffect, useState } from "react";
import axios from "axios";

// --- GLOBAL CONFIGURATION ---
// !!! IMPORTANT: THIS IS SET TO THE URL FOUND IN YOUR RENDER LOGS !!!
const API_URL = "https://builder-form.onrender.com"; // <--- **YOUR LIVE RENDER URL**
const isPlaceholderActive = false;

if (!isPlaceholderActive) {
  axios.defaults.withCredentials = true; // This ensures cookies are sent with every request
  axios.defaults.baseURL = API_URL;
}

// Only allow these Airtable field types
const ALLOWED_TYPES = [
  "singleLineText",
  "multilineText",
  "singleSelect",
  "multipleSelects",
];

// -----------------------------------------------------------------------------
// --- 1. LOGIC ENGINE ---
// -----------------------------------------------------------------------------

export type Operator = "equals" | "notEquals" | "contains";

export interface Condition {
  questionKey: string;
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
  if (!rules || !rules.conditions || rules.conditions.length === 0) return true;

  const results = rules.conditions.map((condition) => {
    const userAnswer = answersSoFar[condition.questionKey];
    if (userAnswer === undefined || userAnswer === null) return false;

    switch (condition.operator) {
      case "equals":
        return String(userAnswer) === String(condition.value);
      case "notEquals":
        return String(userAnswer) !== String(condition.value);
      case "contains":
        if (Array.isArray(userAnswer))
          return userAnswer.includes(condition.value);
        return String(userAnswer).includes(condition.value);
      default:
        return false;
    }
  });

  if (rules.logic === "AND") return results.every((res) => res === true);
  else return results.some((res) => res === true);
}

// -----------------------------------------------------------------------------
// --- 2. FORM RENDERER ---
// -----------------------------------------------------------------------------

interface FormRendererProps {
  form: any;
  onBack: () => void;
}

const FormRenderer: React.FC<FormRendererProps> = ({ form, onBack }) => {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (fieldId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    if (isPlaceholderActive)
      return alert("Configuration Error: API_URL not set.");

    // VALIDATION
    const missingFields = form.fields.filter((field: any) => {
      const isVisible = shouldShowQuestion(field.logic?.rules, answers);
      return isVisible && field.required && !answers[field.fieldId];
    });

    if (missingFields.length > 0) {
      alert(
        `Please fill in required fields: ${missingFields
          .map((f: any) => f.label)
          .join(", ")}`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await axios.post(`/api/forms/${form._id}/submit`, answers);
      alert("✅ Success! Response saved.");
      onBack();
    } catch (error: any) {
      console.error("Submission Error:", error);
      alert(`Failed to submit: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={AppStyles.rendererContainer}>
      <button onClick={onBack} style={AppStyles.backBtn}>
        ← Back to Forms
      </button>
      <h2 style={AppStyles.header}>{form.title}</h2>
      <form onSubmit={(e) => e.preventDefault()}>
        {form.fields.map((field: any) => {
          const isVisible = shouldShowQuestion(field.logic?.rules, answers);
          if (!isVisible) return null;

          return (
            <div key={field.fieldId} style={{ marginBottom: "20px" }}>
              <label style={AppStyles.label}>
                {field.label}{" "}
                {field.required && <span style={{ color: "red" }}>*</span>}
              </label>

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
                  <option value="">-- Select --</option>
                  {field.options &&
                    field.options.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                </select>
              )}
            </div>
          );
        })}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={AppStyles.submitBtn}
        >
          {isSubmitting ? "Sending..." : "Submit Form"}
        </button>
      </form>
    </div>
  );
};

// -----------------------------------------------------------------------------
// --- 3. RESPONSE VIEWER ---
// -----------------------------------------------------------------------------

interface ResponseViewerProps {
  form: any;
  onBack: () => void;
}

const ResponseViewer: React.FC<ResponseViewerProps> = ({ form, onBack }) => {
  return (
    <div style={AppStyles.rendererContainer}>
      <button onClick={onBack} style={AppStyles.backBtn}>
        ← Back
      </button>
      <h2 style={{ color: "#28a745" }}>📊 Responses for: {form.title}</h2>
      <div
        style={{ padding: "20px", background: "#e9f7ef", borderRadius: "8px" }}
      >
        <p>
          To view responses, ensure your backend implements the response
          fetching endpoint.
        </p>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// --- 4. MAIN APP COMPONENT ---
// -----------------------------------------------------------------------------

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [view, setView] = useState<"BUILDER" | "RENDERER" | "RESPONSES">(
    "BUILDER"
  );
  const [connectionMessage, setConnectionMessage] = useState<string | null>(
    isPlaceholderActive
      ? "Configuration Error: API_URL not set."
      : "Checking connection..."
  );

  // Data State
  const [bases, setBases] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [savedForms, setSavedForms] = useState<any[]>([]);
  const [activeForm, setActiveForm] = useState<any>(null);

  // Builder State
  const [selectedBase, setSelectedBase] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableFields, setTableFields] = useState<any[]>([]);
  const [formFields, setFormFields] = useState<any[]>([]);

  // Logic Modal State
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [logicRule, setLogicRule] = useState({
    triggerFieldId: "",
    operator: "equals",
    value: "",
  });

  // --- AUTH CHECK: The Critical Fix ---
  useEffect(() => {
    if (isPlaceholderActive) return;
    verifyConnection();
  }, []);

  const verifyConnection = async () => {
    try {
      // Instead of checking local cookies, we TRY to fetch data from the backend.
      // Because 'withCredentials' is true, the cookie travels to Render.
      // If Render accepts it, we are logged in.
      await axios.get("/api/forms");

      // If the above line didn't throw an error, we are connected!
      setIsConnected(true);
      setConnectionMessage(null);

      // Now fetch the rest of the data
      fetchBases();
      fetchSavedForms();
    } catch (e) {
      // If we get a 401 error, it means we aren't logged in.
      console.log("Not connected yet.");
      setIsConnected(false);
      setConnectionMessage("Please connect your Airtable account.");
    }
  };

  const fetchBases = async () => {
    try {
      const res = await axios.get(`/api/bases`);
      setBases(res.data);
    } catch (e) {
      console.error("Error fetching bases", e);
    }
  };

  const fetchSavedForms = async () => {
    try {
      const res = await axios.get(`/api/forms`);
      setSavedForms(res.data);
    } catch (e) {
      console.error("Error fetching forms", e);
    }
  };

  // --- Handlers ---

  const handleBaseChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const baseId = e.target.value;
    setSelectedBase(baseId);
    setTables([]);
    setSelectedTable("");
    if (baseId) {
      try {
        const res = await axios.get(`/api/bases/${baseId}/tables`);
        setTables(res.data);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tableId = e.target.value;
    setSelectedTable(tableId);
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      const supported = table.fields.filter((f: any) =>
        ALLOWED_TYPES.includes(f.type)
      );
      setTableFields(supported);
      setFormFields([]);
    }
  };

  const toggleField = (field: any) => {
    const exists = formFields.find((f) => f.fieldId === field.id);
    if (exists) {
      setFormFields(formFields.filter((f) => f.fieldId !== field.id));
    } else {
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

  const saveLogic = () => {
    if (!editingFieldId) return;
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
    setEditingFieldId(null);
    setLogicRule({ triggerFieldId: "", operator: "equals", value: "" });
  };

  const saveForm = async () => {
    if (formFields.length === 0) return;
    try {
      await axios.post(`/api/forms`, {
        baseId: selectedBase,
        tableId: selectedTable,
        title: "Conditional Form " + new Date().toLocaleTimeString(),
        fields: formFields,
      });
      alert("Form Saved Successfully!");
      fetchSavedForms();
    } catch (e) {
      alert("Error saving form");
    }
  };

  if (view === "RENDERER" && activeForm)
    return <FormRenderer form={activeForm} onBack={() => setView("BUILDER")} />;
  if (view === "RESPONSES" && activeForm)
    return (
      <ResponseViewer form={activeForm} onBack={() => setView("BUILDER")} />
    );

  return (
    <div style={AppStyles.container}>
      <div style={AppStyles.topBar}>
        <h1 style={{ margin: 0 }}>Airtable Form Builder</h1>

        {!isConnected && (
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <span style={{ color: "#666" }}>{connectionMessage}</span>
            {!isPlaceholderActive && (
              <button
                onClick={() => {
                  const returnTo = encodeURIComponent(window.location.origin);
                  window.location.href = `${API_URL}/auth/login?returnTo=${returnTo}`;
                }}
                style={AppStyles.connectBtn}
              >
                Connect Airtable
              </button>
            )}
          </div>
        )}

        {isConnected && (
          <span style={{ color: "green", fontWeight: "bold" }}>
            ● Connected
          </span>
        )}
      </div>

      {isConnected && (
        <div style={AppStyles.mainGrid}>
          {/* LEFT SIDEBAR */}
          <div style={AppStyles.sidebar}>
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
                      color: "#28a745",
                      borderColor: "#28a745",
                    }}
                  >
                    📊 Results
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* MAIN CREATOR */}
          <div style={AppStyles.creatorBox}>
            <h2 style={{ marginTop: 0 }}>🛠 Create New Form</h2>
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

            {tableFields.length > 0 && (
              <div>
                <h3>Select Fields:</h3>
                <div style={AppStyles.fieldList}>
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
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            onChange={() => toggleField(field)}
                            style={{ marginRight: "10px" }}
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
                        {isSelected && (
                          <button
                            onClick={() => setEditingFieldId(field.id)}
                            style={AppStyles.logicBtn}
                          >
                            {isSelected.logic.rules.conditions.length > 0
                              ? "⚡ Rules"
                              : "⚙️ Logic"}
                          </button>
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
      )}

      {/* MODAL */}
      {editingFieldId && (
        <div style={AppStyles.modalOverlay}>
          <div style={AppStyles.modal}>
            <h3>Add Logic Rule</h3>
            <div style={{ marginBottom: "15px" }}>
              <label style={AppStyles.label}>Depending on Field:</label>
              <select
                style={AppStyles.select}
                onChange={(e) =>
                  setLogicRule({ ...logicRule, triggerFieldId: e.target.value })
                }
              >
                <option value="">-- Select --</option>
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
                <option value="equals">Equals</option>
                <option value="notEquals">Does Not Equal</option>
                <option value="contains">Contains</option>
              </select>
            </div>
            <div style={{ marginBottom: "25px" }}>
              <label style={AppStyles.label}>Value:</label>
              <input
                style={AppStyles.select}
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

const AppStyles = {
  container: {
    maxWidth: "1000px",
    margin: "20px auto",
    fontFamily: "sans-serif",
    padding: "20px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  mainGrid: { display: "grid", gridTemplateColumns: "1fr 3fr", gap: "30px" },
  sidebar: {
    background: "#f8f9fa",
    padding: "15px",
    borderRadius: "8px",
    height: "fit-content",
  },
  creatorBox: {
    padding: "25px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    background: "white",
  },
  rendererContainer: {
    padding: "30px",
    maxWidth: "600px",
    margin: "0 auto",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    background: "#fff",
    fontFamily: "sans-serif",
  },
  connectBtn: {
    padding: "10px 20px",
    background: "#2D7FF9",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  formCard: {
    padding: "15px",
    background: "white",
    marginBottom: "10px",
    borderRadius: "6px",
    border: "1px solid #ddd",
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
    borderRadius: "4px",
    border: "1px solid #ccc",
    boxSizing: "border-box" as const,
  },
  label: {
    display: "block",
    marginBottom: "5px",
    fontWeight: "600",
    color: "#555",
  },
  saveBtn: {
    padding: "12px",
    background: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    width: "100%",
    marginTop: "20px",
    fontWeight: "bold",
  },
  fieldList: {
    border: "1px solid #eee",
    borderRadius: "4px",
    maxHeight: "500px",
    overflowY: "auto" as const,
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
  header: {
    marginTop: 0,
    marginBottom: "20px",
    borderBottom: "1px solid #f0f0f0",
    paddingBottom: "15px",
  },
  backBtn: {
    marginBottom: "20px",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "#007bff",
  },
  input: {
    width: "100%",
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    boxSizing: "border-box" as const,
  },
  submitBtn: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "5px",
    fontWeight: "bold",
    marginTop: "15px",
  },
};

export default App;
