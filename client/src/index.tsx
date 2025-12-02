import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Find the root element in the HTML
const rootElement = document.getElementById("root");

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  // Render the Main App Component
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error(
    "Failed to find the root element. Make sure public/index.html exists and has <div id='root'></div>"
  );
}
