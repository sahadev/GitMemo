import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ToastContextType {
  showToast: (msg: string, isError?: boolean) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState("");
  const [isError, setIsError] = useState(false);

  const showToast = useCallback((msg: string, error = false) => {
    setToast(msg);
    setIsError(error);
    setTimeout(() => setToast(""), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 999,
          background: isError ? "var(--red)" : "var(--accent)",
          color: "#fff", boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
          pointerEvents: "none",
        }}>
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
