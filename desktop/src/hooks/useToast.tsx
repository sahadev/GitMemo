import { useCallback, type ReactNode } from "react";
import { notifications } from "@mantine/notifications";

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface ToastOptions {
  action?: ToastAction;
  autoClose?: boolean | number;
}

interface ToastMessageProps {
  message: ReactNode;
  action?: ToastAction;
  onAction: () => void;
}

function ToastMessage({ message, action, onAction }: ToastMessageProps) {
  return (
    <div className="gm-notification-content" data-has-action={action ? "true" : "false"}>
      <div className="gm-notification-message">{message}</div>
      {action ? (
        <button type="button" className="gm-notification-action" onClick={onAction}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function useToast() {
  const showToast = useCallback((msg: ReactNode, isError = false, options?: ToastOptions) => {
    let notificationId = "";
    const action = options?.action;
    const handleAction = () => {
      void action?.onClick();
      if (notificationId) notifications.hide(notificationId);
    };

    notificationId = notifications.show({
      message: <ToastMessage message={msg} action={action} onAction={handleAction} />,
      color: isError ? "red" : "blue",
      withBorder: true,
      autoClose: options?.autoClose ?? 2500,
    });
  }, []);

  return { showToast };
}
