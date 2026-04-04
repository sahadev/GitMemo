import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSyncListeners } from "./hooks/useSync";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./index.css";

// Global unhandled error / rejection logging
window.addEventListener("error", (e) => {
  console.error("[GlobalError]", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[UnhandledRejection]", e.reason);
});

// Initialize zustand store side effects (event listeners, initial data load)
initSyncListeners();

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "inherit",
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <Notifications position="bottom-center" autoClose={2500} />
        <App />
      </MantineProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
