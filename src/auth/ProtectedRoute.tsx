import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();

  if (loading) return null; // vagy: <div className="empty">Betöltés…</div>

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}