import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { login } from "../../shared/api/client";
import { useGsapTransition } from "../../shared/hooks/useGsapTransition";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "../../shared/ui";
import { ChibiMascot } from "../../widgets/mascot/ChibiMascot";

interface AuthOverlayProps {
  onAuthenticated: () => void;
}

export function AuthOverlay({ onAuthenticated }: AuthOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { pageRef, animateIn } = useGsapTransition("auth");

  useEffect(() => {
    animateIn();
  }, [animateIn]);

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
    <div ref={pageRef} className="flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/30 shadow-lg shadow-primary/10">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <ChibiMascot variant="peeking" size="sm" />
          </div>
          <CardTitle>Admin Access Required</CardTitle>
          <CardDescription>
            Enter the admin password to access Voice and Media controls.
          </CardDescription>
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
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password}
            >
              {loading ? "Authenticating..." : "Unlock Controls"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
