import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import type { InsertUser, User } from "@db/schema";
import { env } from "./env";
import { findUserByAuthUserId, upsertUser } from "../queries/users";

type SupabaseClient = ReturnType<typeof createClient>;

const supabaseClient: SupabaseClient | null =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

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
  return (
    readString(metadata?.avatar_url) ??
    readString(metadata?.picture) ??
    null
  );
}

export function extractBearerToken(headers: Headers): string | null {
  const value = headers.get("authorization")?.trim();
  if (!value) return null;

  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || null;
}

export function buildUserRecordFromSupabaseUser(
  user: SupabaseUser,
  now: Date = new Date(),
): InsertUser {
  return {
    authUserId: user.id,
    name: resolveDisplayName(user),
    email: readString(user.email),
    avatar: resolveAvatarUrl(user),
    role: "user",
    lastSignInAt: now,
  };
}

export async function authenticateRequest(headers: Headers): Promise<User | undefined> {
  if (!supabaseClient) {
    return undefined;
  }

  const token = extractBearerToken(headers);
  if (!token) {
    return undefined;
  }

  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data.user) {
    return undefined;
  }

  const nextUser = buildUserRecordFromSupabaseUser(data.user);
  const existing = await findUserByAuthUserId(nextUser.authUserId);

  const shouldUpsert =
    !existing ||
    existing.name !== nextUser.name ||
    existing.email !== nextUser.email ||
    existing.avatar !== nextUser.avatar ||
    (nextUser.authUserId === env.ownerAuthUserId && existing.role !== "admin");

  if (shouldUpsert) {
    await upsertUser(nextUser);
    return (await findUserByAuthUserId(nextUser.authUserId)) ?? undefined;
  }

  return existing;
}
