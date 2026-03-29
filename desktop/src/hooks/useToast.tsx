import { createContext, useContext, useCallback, type ReactNode } from "react";
import { notifications } from "@mantine/notifications";

interface ToastContextType {
  showToast: (msg: string, isError?: boolean) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback((msg: string, isError = false) => {
    notifications.show({
      message: msg,
      color: isError ? "red" : "blue",
      withBorder: true,
      autoClose: 2500,
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
