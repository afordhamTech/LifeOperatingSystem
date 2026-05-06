import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  buildSupabaseUserProfile,
  signOutSupabase,
} from "@/lib/supabase-auth";
import { supabase } from "@/lib/supabase-client";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const { session, isLoading: sessionLoading } = useSupabaseSession();
  const user = useMemo(() => buildSupabaseUserProfile(session?.user), [session]);
  const logout = useCallback(() => {
    void (async () => {
      try {
        await signOutSupabase();
      } finally {
        navigate(redirectPath);
      }
    })();
  }, [navigate, redirectPath]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !sessionLoading && !user) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, sessionLoading, user, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: sessionLoading,
      error: null,
      logout,
      refresh: async () => {
        if (!supabase) {
          return null;
        }

        return supabase.auth.getSession();
      },
    }),
    [user, sessionLoading, logout],
  );
}
