import React, { useState } from "react";
import axios from "axios";
// Ensure this import matches your filename exactly (logicEngine vs logicengine)
import { shouldShowQuestion } from "./logicengine";

interface FormRendererProps {
  form: any;
  onBack: () => void;
}

export const FormRenderer: React.FC<FormRendererProps> = ({ form, onBack }) => {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update state when user types/selects
  const handleChange = (fieldId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    // 1. VALIDATION
    // We filter for fields that are:
    // a) Visible (according to logic rules)
    // b) Required
    // c) Currently empty/undefined in answers
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
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/forms/${form._id}/submit`,
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
          // Should we show this field based on previous answers?
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
                  style={styles.input}
                  value={answers[field.fieldId] || ""}
                  onChange={(e) => handleChange(field.fieldId, e.target.value)}
                  placeholder="Your answer..."
                  disabled={isSubmitting}
                />
              )}

              {field.type === "singleSelect" && (
                <select
                  style={styles.select}
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
            ...styles.submitBtn,
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

// Simple inline styles
const styles = {
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
  select: {
    width: "100%",
    padding: "10px",
    fontSize: "15px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    backgroundColor: "white",
    boxSizing: "border-box" as const,
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
