import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithPasswordMock, signUpWithPasswordMock, signOutMock } =
  vi.hoisted(() => ({
    signInWithPasswordMock: vi.fn(),
    signUpWithPasswordMock: vi.fn(),
    signOutMock: vi.fn(),
  }));

vi.mock("./supabase-client", () => ({
  hasSupabaseConfig: true,
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpWithPasswordMock,
      signOut: signOutMock,
    },
  },
}));

import {
  buildSupabaseUserProfile,
  signInWithPassword,
} from "./supabase-auth";

describe("supabase auth helpers", () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    signUpWithPasswordMock.mockReset();
    signOutMock.mockReset();
  });

  it("builds a display user from Supabase metadata", () => {
    expect(
      buildSupabaseUserProfile({
        id: "11111111-2222-3333-4444-555555555555",
        email: "ada@example.com",
        user_metadata: { full_name: "Ada Lovelace", avatar_url: null },
      } as never),
    ).toEqual({
      id: "11111111-2222-3333-4444-555555555555",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatar: null,
    });
  });

  it("signs in with Supabase using a trimmed email address", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });

    await signInWithPassword("  ada@example.com ", "secret-password");

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret-password",
    });
  });
});
