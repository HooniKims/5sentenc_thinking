import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AdminDashboard } from "./components/AdminDashboard";

const root = document.getElementById("root");

if (!root) {
  throw new Error("앱 루트를 찾을 수 없습니다.");
}

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/admin" ? <AdminDashboard /> : <App />}
  </StrictMode>
);
