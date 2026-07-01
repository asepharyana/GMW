import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./shared/ui";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
