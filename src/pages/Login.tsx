import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  if (!kimiAuthUrl || !appID) {
    return null;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
    url.searchParams.set("client_id", appID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "profile");
    url.searchParams.set("state", state);

    return url.toString();
  } catch {
    return null;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const oauthUrl = getOAuthUrl();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active && session) navigate("/");
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handlePasswordAuth = async () => {
    if (!supabase) {
      setError("Sign-in is unavailable right now.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const credentials = { email: email.trim(), password };
    const { data, error: authError } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.session) {
      navigate("/");
      return;
    }

    setMessage("Check your email to confirm the account, then sign in.");
  };

  const handleMagicLink = async () => {
    if (!supabase) {
      setError("Sign-in is unavailable right now.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setMessage("Check your email for the login link.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Sign in to Lifeee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasSupabaseConfig ? (
            <>
              <div className="space-y-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-muted-foreground">{message}</p>}

              <Button
                className="w-full"
                size="lg"
                disabled={isSubmitting || !email.trim() || !password}
                onClick={() => void handlePasswordAuth()}
              >
                {isSubmitting ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "sign-in" ? "secondary" : "outline"}
                  onClick={() => setMode("sign-in")}
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant={mode === "sign-up" ? "secondary" : "outline"}
                  onClick={() => setMode("sign-up")}
                >
                  Sign up
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isSubmitting || !email.trim()}
                onClick={() => void handleMagicLink()}
              >
                Email me a magic link
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign-in is unavailable right now.
            </p>
          )}

          {oauthUrl && (
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={() => {
                window.location.href = oauthUrl;
              }}
            >
              Sign in with Kimi
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
