import { Navigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";

export function RoleHome() {
  const role = useAppStore((state) => state.role);
  return (
    <Navigate to={role === "family" ? "/family" : "/chat"} replace />
  );
}
