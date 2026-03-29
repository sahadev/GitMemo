import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./hooks/useI18n";
import { SyncProvider } from "./hooks/useSync";
import { ToastProvider } from "./hooks/useToast";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <SyncProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SyncProvider>
    </I18nProvider>
  </React.StrictMode>
);
