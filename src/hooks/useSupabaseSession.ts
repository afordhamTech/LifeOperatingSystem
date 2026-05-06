import { useEffect, useState } from "react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

type SupabaseSession = {
  user: {
    id: string;
    email?: string;
  } | null;
};

export function useSupabaseSession() {
  const [session, setSession] = useState<SupabaseSession | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!supabase) {
        if (active) {
          setSession(null);
        }
        return;
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!active) return;

      setSession(currentSession as SupabaseSession | null);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession as SupabaseSession | null);
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    let cleanup: (() => void) | undefined;
    void bootstrap().then((maybeCleanup) => {
      cleanup = maybeCleanup;
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  return {
    hasSupabaseConfig,
    isLoading: session === undefined,
    session: session ?? null,
    userId: session?.user?.id ?? null,
  };
}
