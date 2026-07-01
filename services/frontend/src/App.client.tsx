// ─── App.client.tsx — Astro React island entry point ────────────────────────
// DILOAD OLEH Astro client:only="react"
// Menyediakan <div id="root"> dan mount App dengan provider yang diperlukan
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import App from "./App";
import { ToastProvider } from "./shared/ui";

export default function AppClient() {
  return (
    <React.StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </React.StrictMode>
  );
}
