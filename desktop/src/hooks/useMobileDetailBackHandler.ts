import { useEffect, type RefObject } from "react";

interface UseMobileDetailBackHandlerOptions {
  isMobile: boolean;
  registerMobileBackHandler?: (handler: (() => boolean) | null) => void;
  hasDetail: boolean;
  closeDetail: () => void;
  openedFromCrossPageRef?: RefObject<boolean>;
  editing?: boolean;
  cancelEdit?: () => void;
  beforeDetailBack?: () => boolean;
}

export function useMobileDetailBackHandler({
  isMobile,
  registerMobileBackHandler,
  hasDetail,
  closeDetail,
  openedFromCrossPageRef,
  editing = false,
  cancelEdit,
  beforeDetailBack,
}: UseMobileDetailBackHandlerOptions) {
  useEffect(() => {
    if (!isMobile || !registerMobileBackHandler) return;
    registerMobileBackHandler(() => {
      if (beforeDetailBack?.()) return true;
      if (!hasDetail) return false;
      if (editing && cancelEdit) {
        cancelEdit();
        return true;
      }
      if (openedFromCrossPageRef?.current) {
        closeDetail();
        return false;
      }
      closeDetail();
      return true;
    });
    return () => registerMobileBackHandler(null);
  }, [
    beforeDetailBack,
    cancelEdit,
    closeDetail,
    editing,
    hasDetail,
    isMobile,
    openedFromCrossPageRef,
    registerMobileBackHandler,
  ]);
}
