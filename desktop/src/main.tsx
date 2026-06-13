import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSyncListeners } from "./hooks/useSync";
import { initAppListeners } from "./hooks/useAppStore";
import { gitmemoTheme } from "./theme";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./index.css";

function FrontendLoadedSignal() {
  React.useEffect(() => {
    void invoke("frontend_loaded").catch(() => {});
  }, []);

  return null;
}

// Global unhandled error / rejection logging
window.addEventListener("error", (e) => {
  console.error("[GlobalError]", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[UnhandledRejection]", e.reason);
});

// Initialize zustand store side effects (event listeners, initial data load)
initSyncListeners();
initAppListeners();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FrontendLoadedSignal />
    <ErrorBoundary>
      <MantineProvider theme={gitmemoTheme} defaultColorScheme="auto">
        <Notifications position="bottom-center" autoClose={2500} />
        <App />
      </MantineProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
