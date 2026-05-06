import type { User as SupabaseUser } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "./supabase-client";

export type PublicSupabaseUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveDisplayName(user: SupabaseUser): string {
  const metadata = user.user_metadata as Record<string, unknown> | null;
  const candidates = [
    readString(metadata?.full_name),
    readString(metadata?.name),
    readString(metadata?.preferred_username),
    readString(metadata?.username),
    readString(user.email),
  ].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return "User";
  }

  const primary = candidates[0];
  if (!primary) {
    return "User";
  }

  return primary.includes("@") ? primary.split("@")[0] || "User" : primary;
}

function resolveAvatarUrl(user: SupabaseUser): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | null;
  return readString(metadata?.avatar_url) ?? readString(metadata?.picture);
}

export function buildSupabaseUserProfile(
  user: SupabaseUser | null | undefined,
): PublicSupabaseUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: resolveDisplayName(user),
    email: readString(user.email),
    avatar: resolveAvatarUrl(user),
  };
}

export async function signInWithPassword(email: string, password: string) {
  if (!hasSupabaseConfig || !supabase) {
    return {
      data: { session: null, user: null },
      error: new Error("Supabase is not configured."),
    };
  }

  return supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
}

export async function signUpWithPassword(email: string, password: string) {
  if (!hasSupabaseConfig || !supabase) {
    return {
      data: { session: null, user: null },
      error: new Error("Supabase is not configured."),
    };
  }

  return supabase.auth.signUp({
    email: email.trim(),
    password,
  });
}

export async function signOutSupabase() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}
