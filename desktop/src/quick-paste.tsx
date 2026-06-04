import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import QuickPaste from "./QuickPaste";
import { gitmemoTheme } from "./theme";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={gitmemoTheme} defaultColorScheme="auto">
      <Notifications position="bottom-center" autoClose={2500} />
      <QuickPaste />
    </MantineProvider>
  </React.StrictMode>
);
