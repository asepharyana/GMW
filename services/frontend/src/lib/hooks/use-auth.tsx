"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { login } from "@/lib/api";

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const password = localStorage.getItem("admin-password");
    if (password) {
      // Verify stored password still works
      login(password)
        .then((ok) => {
          setAuthenticated(ok);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem("admin-password");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = useCallback(async (password: string) => {
    const ok = await login(password);
    if (ok) {
      localStorage.setItem("admin-password", password);
      setAuthenticated(true);
    }
    return ok;
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("admin-password");
    setAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        loading,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
