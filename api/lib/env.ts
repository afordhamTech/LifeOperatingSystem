import { config } from "dotenv";

config({ path: ".env.local" });
config();

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function firstOf(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Missing required environment variable: one of ${names.join(", ")}`,
    );
  }
  return "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  supabaseUrl: firstOf(["SUPABASE_URL", "VITE_SUPABASE_URL"]),
  supabaseAnonKey: firstOf([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]),
  ownerAuthUserId: process.env.OWNER_SUPABASE_USER_ID?.trim() ?? "",
};
