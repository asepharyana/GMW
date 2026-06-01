import { useState } from "react";
import { login } from "../../shared/api/client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../../shared/ui";
import { Lock } from "lucide-react";

interface AuthOverlayProps {
  onAuthenticated: () => void;
}

export function AuthOverlay({ onAuthenticated }: AuthOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(password);
      localStorage.setItem("admin-password", password);
      onAuthenticated();
    } catch {
      setError("Invalid password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle>Admin Access Required</CardTitle>
          <CardDescription>Enter the admin password to access Voice and Media controls.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? "Authenticating..." : "Unlock Controls"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
