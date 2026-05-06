import { describe, expect, it } from "vitest";
import {
  buildUserRecordFromSupabaseUser,
  extractBearerToken,
} from "./supabase-auth";

describe("supabase auth helpers", () => {
  it("extracts a bearer token from the authorization header", () => {
    expect(extractBearerToken(new Headers({ authorization: "Bearer abc123" }))).toBe(
      "abc123",
    );
    expect(extractBearerToken(new Headers({ authorization: "Basic nope" }))).toBeNull();
    expect(extractBearerToken(new Headers())).toBeNull();
  });

  it("maps a supabase user into an app user record", () => {
    const record = buildUserRecordFromSupabaseUser({
      id: "11111111-2222-3333-4444-555555555555",
      email: "ada@example.com",
      user_metadata: {
        full_name: "Ada Lovelace",
        avatar_url: "https://example.com/avatar.png",
      },
    } as never);

    expect(record.authUserId).toBe("11111111-2222-3333-4444-555555555555");
    expect(record.email).toBe("ada@example.com");
    expect(record.name).toBe("Ada Lovelace");
    expect(record.avatar).toBe("https://example.com/avatar.png");
    expect(record.role).toBe("user");
    expect(record.lastSignInAt).toBeInstanceOf(Date);
  });
});
