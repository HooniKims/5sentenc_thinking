import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AdminDashboard } from "./components/AdminDashboard";
import { LegalPage } from "./components/LegalPage";

const root = document.getElementById("root");
const studentSessionId = new URLSearchParams(window.location.search).get("session");

if (!root) {
  throw new Error("앱 루트를 찾을 수 없습니다.");
}

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/admin" ? <AdminDashboard /> : window.location.pathname === "/terms" ? <LegalPage document="terms" /> : window.location.pathname === "/privacy" ? <LegalPage document="privacy" /> : <App sessionId={studentSessionId} />}
  </StrictMode>
);
