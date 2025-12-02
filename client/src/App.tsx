import React, { useEffect, useState } from "react";
import axios from "axios";
import { FormRenderer } from "./FormRenderer";
import { ResponseViewer } from "./ResponseViewer";

// --- GLOBAL CONFIGURATION ---
// Base URL for API calls. Vercel injects the Render URL here.
const API_URL = process.env.REACT_APP_API_URL;
axios.defaults.withCredentials = true;

// Only allow these Airtable field types to keep things simple
const ALLOWED_TYPES = [
  "singleLineText",
  "multilineText",
  "singleSelect",
  "multipleSelects",
];

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [view, setView] = useState<"BUILDER" | "RENDERER" | "RESPONSES">(
    "BUILDER"
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

  // 1. On Mount: Check if logged in
  useEffect(() => {
    // We check for the cookie set by the backend
    if (document.cookie.includes("userId")) {
      setIsConnected(true);
      fetchBases();
      fetchSavedForms();
    }
  }, []);

  // --- API Helpers ---
  const fetchBases = async () => {
    try {
      // FIX: Use API_URL constant with base path
      const res = await axios.get(`${API_URL}/api/bases`);
      setBases(res.data);
    } catch (e) {
      console.error("Error fetching bases. Token expired or API down.", e);
    }
  };

  const fetchSavedForms = async () => {
    try {
      // FIX: Use API_URL constant with base path
      const res = await axios.get(`${API_URL}/api/forms`);
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
        // FIX: Use API_URL constant with interpolation
        const res = await axios.get(
          `${API_URL}/api/bases/${baseId}/tables`
        );
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
    if (formFields.length === 0) return;
    try {
      // FIX: Use API_URL constant with base path
      await axios.post(`${API_URL}/api/forms`, {
        baseId: selectedBase,
        tableId: selectedTable,
        title: "Conditional Form " + new Date().toLocaleTimeString(),
        fields: formFields,
      });
      // Replace alert with custom message box in a real application
      alert("Form Saved Successfully! Webhook Registered.");
      fetchSavedForms();
    } catch (e) {
      console.error("Error saving form:", e);
      // Replace alert with custom message box in a real application
      alert("Error saving form");
    }
  };

  // --- VIEW: RENDERER (The Preview Mode) ---
  if (view === "RENDERER" && activeForm) {
    return <FormRenderer form={activeForm} onBack={() => setView("BUILDER")} />;
  }

  // --- VIEW: RESPONSES (The Results Mode) ---
  if (view === "RESPONSES" && activeForm) {
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
        {!isConnected && (
          <button
            // FINAL FIX: Pass the current Vercel domain to the backend using 'returnTo' parameter
            onClick={() => {
              const returnTo = encodeURIComponent(window.location.origin);
              window.location.href = `${API_URL}/auth/login?returnTo=${returnTo}`;
            }}
            style={styles.connectBtn}
          >
            Connect Airtable
          </button>
        )}
      </div>

      {isConnected && (
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
              <div key={form._id} style={styles.formCard}>
                <strong style={{ display: "block", marginBottom: "5px" }}>
                  {form.title}
                </strong>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => {
                      setActiveForm(form);
                      setView("RENDERER");
                    }}
                    style={styles.viewBtn}
                  >
                    👁 View
                  </button>
                  <button
                    onClick={() => {
                      setActiveForm(form);
                      setView("RESPONSES");
                    }}
                    style={{
                      ...styles.viewBtn,
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
                  <label style={styles.label}>Select Base</label>
                  <select
                    onChange={handleBaseChange}
                    value={selectedBase}
                    style={styles.select}
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
                  <label style={styles.label}>Select Table</label>
                  <select
                    onChange={handleTableChange}
                    value={selectedTable}
                    style={styles.select}
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
                            ...styles.fieldRow,
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
                            <span style={styles.typeTag}>{field.type}</span>
                          </div>

                          {/* Logic Button (Only shows if field is selected) */}
                          {isSelected && (
                            <div
                              style={{ display: "flex", alignItems: "center" }}
                            >
                              {isSelected.logic.rules.conditions.length > 0 && (
                                <span style={styles.logicBadge}>
                                  ⚡ {isSelected.logic.rules.conditions.length}{" "}
                                  Rules
                                </span>
                              )}
                              <button
                                onClick={() => setEditingFieldId(field.id)}
                                style={styles.logicBtn}
                              >
                                ⚙️ Add Logic
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={saveForm} style={styles.saveBtn}>
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
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ marginTop: 0 }}>Add Logic Rule</h3>
            <p>
              Show this question <strong>ONLY IF</strong>:
            </p>

            <div style={{ marginBottom: "15px" }}>
              <label style={styles.label}>Depending on Field:</label>
              <select
                style={styles.select}
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
              <label style={styles.label}>Operator:</label>
              <select
                style={styles.select}
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
              <label style={styles.label}>Value to match:</label>
              <input
                placeholder="e.g. Engineer"
                style={styles.select} // reusing input style
                onChange={(e) =>
                  setLogicRule({ ...logicRule, value: e.target.value })
                }
              />
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                onClick={() => setEditingFieldId(null)}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button onClick={saveLogic} style={styles.addRuleBtn}>
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Inline Styles for Simplicity ---
const styles = {
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
};

export default App;
