import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const oauthUrl = getOAuthUrl();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            disabled={!oauthUrl}
            onClick={() => {
              if (!oauthUrl) return;
              window.location.href = oauthUrl;
            }}
          >
            {oauthUrl ? "Sign in with Kimi" : "Missing login config"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
