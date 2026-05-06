import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

export function useSupabaseSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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

      setSession(currentSession);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
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
