import { useAppStore } from "../store/useAppStore";
import { FamilyPage } from "./FamilyPage";
import { HomePage } from "./HomePage";

export function RoleHome() {
  const role = useAppStore((state) => state.role);
  return role === "family" ? <FamilyPage /> : <HomePage />;
}
