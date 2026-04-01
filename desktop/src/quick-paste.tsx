import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { I18nProvider } from "./hooks/useI18n";
import { SyncProvider } from "./hooks/useSync";
import { ToastProvider } from "./hooks/useToast";
import QuickPaste from "./QuickPaste";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./index.css";

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "inherit",
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="bottom-center" autoClose={2500} />
      <I18nProvider>
        <SyncProvider>
          <ToastProvider>
            <QuickPaste />
          </ToastProvider>
        </SyncProvider>
      </I18nProvider>
    </MantineProvider>
  </React.StrictMode>
);
