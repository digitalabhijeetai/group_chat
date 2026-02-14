import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Member } from "@shared/schema";

interface AuthContextType {
  member: Member | null;
  isLoading: boolean;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
  login: (member: Member) => void;
  logout: () => void;
  refetchMember: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMember(data);
      } else {
        setMember(null);
      }
    } catch {
      setMember(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = (m: Member) => setMember(m);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMember(null);
  };

  const isAdmin = member?.role === "admin" || member?.role === "sub-admin";
  const isPrimaryAdmin = member?.role === "admin";

  return (
    <AuthContext.Provider value={{ member, isLoading, isAdmin, isPrimaryAdmin, login, logout, refetchMember: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
