import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AddMedicationPage } from "./pages/AddMedicationPage";
import { ChatPage } from "./pages/ChatPage";
import { CatalogDetailPage } from "./pages/CatalogDetailPage";
import { CatalogPage } from "./pages/CatalogPage";
import { FamilyPage } from "./pages/FamilyPage";
import { HomePage } from "./pages/HomePage";
import { HerbDetailPage } from "./pages/HerbDetailPage";
import { HerbsPage } from "./pages/HerbsPage";
import { MedicationDetailPage } from "./pages/MedicationDetailPage";
import { MedicationsPage } from "./pages/MedicationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReminderPage } from "./pages/ReminderPage";
import { RoleHome } from "./pages/RoleHome";
import { SafetyPage } from "./pages/SafetyPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RoleHome />} />
        <Route path="home" element={<HomePage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="catalog/:slug" element={<CatalogDetailPage />} />
        <Route path="herbs" element={<HerbsPage />} />
        <Route path="herbs/:id" element={<HerbDetailPage />} />
        <Route path="medications" element={<MedicationsPage />} />
        <Route path="medications/:id" element={<MedicationDetailPage />} />
        <Route path="add-medication" element={<AddMedicationPage />} />
        <Route path="reminder/:id" element={<ReminderPage />} />
        <Route path="family" element={<FamilyPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="safety" element={<SafetyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
