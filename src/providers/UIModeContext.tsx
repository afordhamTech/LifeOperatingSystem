import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type UIMode = "simple" | "advanced";

type UIModeContextValue = {
  mode: UIMode;
  isSimple: boolean;
  isAdvanced: boolean;
  setMode: (mode: UIMode) => void;
  toggleMode: () => void;
};

const STORAGE_KEY = "lifeee.uiMode";

const UIModeContext = createContext<UIModeContextValue | null>(null);

function readInitialMode(): UIMode {
  if (typeof window === "undefined") return "simple";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "advanced" || stored === "simple") return stored;
  } catch {
    /* ignore */
  }
  return "simple";
}

export function UIModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UIMode>(readInitialMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const setMode = useCallback((next: UIMode) => setModeState(next), []);
  const toggleMode = useCallback(
    () => setModeState((p) => (p === "simple" ? "advanced" : "simple")),
    [],
  );

  const value = useMemo<UIModeContextValue>(
    () => ({
      mode,
      isSimple: mode === "simple",
      isAdvanced: mode === "advanced",
      setMode,
      toggleMode,
    }),
    [mode, setMode, toggleMode],
  );

  return <UIModeContext.Provider value={value}>{children}</UIModeContext.Provider>;
}

export function useUIMode(): UIModeContextValue {
  const ctx = useContext(UIModeContext);
  if (!ctx) {
    // Safe fallback so components never crash if used outside the provider.
    return {
      mode: "simple",
      isSimple: true,
      isAdvanced: false,
      setMode: () => {},
      toggleMode: () => {},
    };
  }
  return ctx;
}
