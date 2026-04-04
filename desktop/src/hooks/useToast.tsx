import { notifications } from "@mantine/notifications";

export function useToast() {
  return {
    showToast: (msg: string, isError = false) => {
      notifications.show({
        message: msg,
        color: isError ? "red" : "blue",
        withBorder: true,
        autoClose: 2500,
      });
    },
  };
}
