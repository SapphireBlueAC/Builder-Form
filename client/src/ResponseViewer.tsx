import React, { useEffect, useState } from "react";
import axios from "axios";

interface ResponseViewerProps {
  form: any;
  onBack: () => void;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({
  form,
  onBack,
}) => {
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResponses = async () => {
      try {
        // Fetch responses for this specific form ID
        const res = await axios.get(
          `process.env.REACT_APP_API_URL/api/forms/${form._id}/responses`
        );
        setResponses(res.data);
      } catch (err) {
        console.error(err);
        alert("Failed to load responses");
      } finally {
        setLoading(false);
      }
    };
    fetchResponses();
  }, [form._id]);

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "800px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <button
        onClick={onBack}
        style={{
          marginBottom: "15px",
          cursor: "pointer",
          border: "none",
          background: "transparent",
          color: "#007bff",
        }}
      >
        ← Back to Dashboard
      </button>

      <h2>Responses for: {form.title}</h2>

      {loading ? (
        <p>Loading data...</p>
      ) : responses.length === 0 ? (
        <p>No responses yet. Go submit the form!</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "10px",
          }}
        >
          <thead>
            <tr style={{ background: "#f8f9fa", textAlign: "left" }}>
              <th style={styles.th}>Submitted At</th>
              <th style={styles.th}>Airtable ID</th>
              <th style={styles.th}>Answers (JSON)</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((r) => (
              <tr key={r._id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={styles.td}>
                  {new Date(r.submittedAt).toLocaleString()}
                </td>
                <td style={styles.td}>
                  <span
                    style={{
                      background: "#e6f7ff",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "12px",
                    }}
                  >
                    {r.airtableRecordId}
                  </span>
                </td>
                <td style={styles.td}>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "12px",
                      background: "#f5f5f5",
                      padding: "5px",
                      borderRadius: "4px",
                    }}
                  >
                    {JSON.stringify(r.answers, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const styles = {
  th: { padding: "12px", borderBottom: "2px solid #ddd" },
  td: { padding: "12px", verticalAlign: "top" },
};
