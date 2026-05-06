import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { hasSupabaseConfig } from "@/lib/supabase-client";
import {
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/supabase-auth";

export default function Login() {
  const navigate = useNavigate();
  const { session, isLoading } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user) {
      navigate("/");
    }
  }, [navigate, session]);

  const submit = async (mode: "signIn" | "signUp") => {
    if (!hasSupabaseConfig) {
      setError("Supabase env vars are missing.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    const action =
      mode === "signIn" ? signInWithPassword : signUpWithPassword;
    const { data, error: authError } = await action(email, password);

    if (authError) {
      setError(authError.message);
    } else if (data.session) {
      navigate("/");
    } else if (mode === "signUp") {
      setNotice(
        "Account created. Check your email if confirmation is enabled in Supabase.",
      );
    } else {
      setNotice("Signed in. Redirecting...");
    }

    setIsSubmitting(false);
  };

  const canSubmit = Boolean(hasSupabaseConfig && !isSubmitting && email && password);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-[radial-gradient(circle_at_top,_rgba(107,135,174,0.12),_transparent_42%),linear-gradient(180deg,_#f8f3ea_0%,_#eef1f4_100%)]">
      <Card className="w-full max-w-md border-[#d8d1c3]/80 bg-white/90 shadow-[0_20px_80px_rgba(36,49,60,0.12)] backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-[#6b87ae]/25 bg-[#6b87ae]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5e7ea4]">
            Supabase Auth
          </div>
          <div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <p className="mt-2 text-sm text-[#6f685f]">
              Use your Supabase email and password. The old OAuth flow is gone.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#6f685f]">
              <Loader2 size={14} className="animate-spin" />
              Checking your session...
            </div>
          ) : null}

          {!hasSupabaseConfig ? (
            <div className="rounded-lg border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-sm text-[#9a6b1f]">
              Supabase env vars are missing, so sign-in is disabled.
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("signIn");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!hasSupabaseConfig || isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!hasSupabaseConfig || isSubmitting}
                minLength={8}
              />
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-[#c97a73]/30 bg-[#c97a73]/10 px-3 py-2 text-sm text-[#b8625c]">
                <AlertCircle className="mt-0.5" size={14} />
                <span>{error}</span>
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-lg border border-[#6b87ae]/25 bg-[#6b87ae]/10 px-3 py-2 text-sm text-[#5e7ea4]">
                {notice}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canSubmit}
                className="w-full"
                onClick={() => {
                  void submit("signUp");
                }}
              >
                Create account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
