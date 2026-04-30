import { useCallback } from "react";
import { notifications } from "@mantine/notifications";

export function useToast() {
  const showToast = useCallback((msg: string, isError = false) => {
    notifications.show({
      message: msg,
      color: isError ? "red" : "blue",
      withBorder: true,
      autoClose: 2500,
    });
  }, []);

  return { showToast };
}
