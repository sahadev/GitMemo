import { createTheme } from "@mantine/core";

export const gitmemoTheme = createTheme({
  primaryColor: "gitmemo",
  fontFamily: "var(--gm-font-sans)",
  fontFamilyMonospace: "var(--gm-font-mono)",
  defaultRadius: "sm",
  colors: {
    gitmemo: [
      "#eef6ff",
      "#d9eaff",
      "#b8d8ff",
      "#88bbff",
      "#5c9bff",
      "#3f7ff2",
      "#2f6fe4",
      "#255cc0",
      "#214e9a",
      "#1f437d",
    ],
  },
  components: {
    Button: {
      defaultProps: {
        radius: "sm",
      },
    },
    ActionIcon: {
      defaultProps: {
        radius: "sm",
      },
    },
    Modal: {
      defaultProps: {
        radius: "md",
        overlayProps: {
          backgroundOpacity: 0.62,
          blur: 8,
        },
      },
    },
    Notification: {
      defaultProps: {
        radius: "sm",
      },
    },
    TextInput: {
      defaultProps: {
        radius: "sm",
      },
    },
    Textarea: {
      defaultProps: {
        radius: "sm",
      },
    },
    Select: {
      defaultProps: {
        radius: "sm",
      },
    },
  },
});
