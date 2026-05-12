import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PromptBuilderContext } from "@/lib/prompt-builders";

type PromptContextValue = {
  context: PromptBuilderContext;
  setContext: (next: PromptBuilderContext) => void;
};

const PromptContext = createContext<PromptContextValue | null>(null);

export function PromptContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<PromptBuilderContext>({});
  const value = useMemo(() => ({ context, setContext }), [context]);
  return <PromptContext.Provider value={value}>{children}</PromptContext.Provider>;
}

export function useSharedPromptContext(): PromptBuilderContext {
  const value = useContext(PromptContext);
  return value?.context ?? {};
}

export function usePushPromptContext(partial: PromptBuilderContext) {
  const value = useContext(PromptContext);
  const setter = value?.setContext;
  const signature = JSON.stringify(partial);

  useEffect(() => {
    if (!setter) return;
    setter({ ...partial });
    // signature captures all primitive fields in partial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setter, signature]);
}
