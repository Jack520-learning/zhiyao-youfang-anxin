import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";

const AddMedicationPage = lazy(() =>
  import("./pages/AddMedicationPage").then((module) => ({
    default: module.AddMedicationPage
  }))
);
const ChatPage = lazy(() =>
  import("./pages/ChatPage").then((module) => ({ default: module.ChatPage }))
);
const CatalogDetailPage = lazy(() =>
  import("./pages/CatalogDetailPage").then((module) => ({
    default: module.CatalogDetailPage
  }))
);
const CatalogPage = lazy(() =>
  import("./pages/CatalogPage").then((module) => ({
    default: module.CatalogPage
  }))
);
const EmergencyCardPage = lazy(() =>
  import("./pages/EmergencyCardPage").then((module) => ({
    default: module.EmergencyCardPage
  }))
);
const EvaluationPage = lazy(() =>
  import("./pages/EvaluationPage").then((module) => ({
    default: module.EvaluationPage
  }))
);
const FamilyPage = lazy(() =>
  import("./pages/FamilyPage").then((module) => ({
    default: module.FamilyPage
  }))
);
const HomePage = lazy(() =>
  import("./pages/HomePage").then((module) => ({ default: module.HomePage }))
);
const ImpactPage = lazy(() =>
  import("./pages/ImpactPage").then((module) => ({
    default: module.ImpactPage
  }))
);
const HerbDetailPage = lazy(() =>
  import("./pages/HerbDetailPage").then((module) => ({
    default: module.HerbDetailPage
  }))
);
const HerbsPage = lazy(() =>
  import("./pages/HerbsPage").then((module) => ({ default: module.HerbsPage }))
);
const MedicationDetailPage = lazy(() =>
  import("./pages/MedicationDetailPage").then((module) => ({
    default: module.MedicationDetailPage
  }))
);
const MedicationsPage = lazy(() =>
  import("./pages/MedicationsPage").then((module) => ({
    default: module.MedicationsPage
  }))
);
const MultiDrugPage = lazy(() =>
  import("./pages/MultiDrugPage").then((module) => ({
    default: module.MultiDrugPage
  }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({
    default: module.NotFoundPage
  }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((module) => ({
    default: module.ProfilePage
  }))
);
const ReminderPage = lazy(() =>
  import("./pages/ReminderPage").then((module) => ({
    default: module.ReminderPage
  }))
);
const RoleHome = lazy(() =>
  import("./pages/RoleHome").then((module) => ({ default: module.RoleHome }))
);
const SafetyPage = lazy(() =>
  import("./pages/SafetyPage").then((module) => ({
    default: module.SafetyPage
  }))
);

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-dot" aria-hidden="true" />
      正在载入页面…
    </div>
  );
}

function loadRoute(element: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={loadRoute(<RoleHome />)} />
        <Route path="today" element={loadRoute(<HomePage />)} />
        <Route path="home" element={loadRoute(<HomePage />)} />
        <Route path="chat" element={loadRoute(<ChatPage />)} />
        <Route path="catalog" element={loadRoute(<CatalogPage />)} />
        <Route
          path="catalog/:slug"
          element={loadRoute(<CatalogDetailPage />)}
        />
        <Route path="herbs" element={loadRoute(<HerbsPage />)} />
        <Route path="herbs/:id" element={loadRoute(<HerbDetailPage />)} />
        <Route path="multi-drug" element={loadRoute(<MultiDrugPage />)} />
        <Route path="impact" element={loadRoute(<ImpactPage />)} />
        <Route path="evaluation" element={loadRoute(<EvaluationPage />)} />
        <Route path="medications" element={loadRoute(<MedicationsPage />)} />
        <Route
          path="medications/:id"
          element={loadRoute(<MedicationDetailPage />)}
        />
        <Route
          path="emergency-card"
          element={loadRoute(<EmergencyCardPage />)}
        />
        <Route
          path="add-medication"
          element={loadRoute(<AddMedicationPage />)}
        />
        <Route path="reminder/:id" element={loadRoute(<ReminderPage />)} />
        <Route path="family" element={loadRoute(<FamilyPage />)} />
        <Route path="profile" element={loadRoute(<ProfilePage />)} />
        <Route path="safety" element={loadRoute(<SafetyPage />)} />
        <Route path="*" element={loadRoute(<NotFoundPage />)} />
      </Route>
    </Routes>
  );
}
