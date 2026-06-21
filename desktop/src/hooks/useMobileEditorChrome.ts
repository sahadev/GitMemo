import { useEffect, useId } from "react";
import { useAppStore } from "./useAppStore";

interface UseMobileEditorChromeOptions {
  active: boolean;
  id?: string;
}

export function useMobileEditorChrome({ active, id }: UseMobileEditorChromeOptions) {
  const generatedId = useId();
  const chromeId = id ?? generatedId;
  const registerMobileEditorChrome = useAppStore((s) => s.registerMobileEditorChrome);
  const unregisterMobileEditorChrome = useAppStore((s) => s.unregisterMobileEditorChrome);

  useEffect(() => {
    if (!active) return;

    registerMobileEditorChrome(chromeId);
    return () => unregisterMobileEditorChrome(chromeId);
  }, [active, chromeId, registerMobileEditorChrome, unregisterMobileEditorChrome]);
}
