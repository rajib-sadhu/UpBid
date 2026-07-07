import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { LoginInput, LoginResponse, PublicUser } from "shared";
import { apiFetch } from "../../api/client.js";
import { clearToken, getToken, setToken } from "../../lib/auth-storage.js";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  /** Swap in a fresh token+user (e.g. after a password change). */
  adoptSession: (session: LoginResponse) => void;
  /** Replace the cached user after a profile edit (token unchanged). */
  updateUser: (user: PublicUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Refresh-on-load: if a token is present, re-validate it by fetching the user.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    apiFetch<PublicUser>("/api/auth/me")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(input: LoginInput): Promise<void> {
    const res = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setToken(res.token);
    setUser(res.user);
  }

  function logout(): void {
    clearToken();
    setUser(null);
  }

  function adoptSession(session: LoginResponse): void {
    setToken(session.token);
    setUser(session.user);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, adoptSession, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
