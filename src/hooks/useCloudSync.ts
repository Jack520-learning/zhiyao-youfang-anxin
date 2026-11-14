import { useEffect, useRef, useState } from "react";
import {
  fetchFamilySnapshot,
  syncCloudSnapshot
} from "../lib/cloud";
import { useAppStore } from "../store/useAppStore";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export function useCloudSync() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const lastFamilyUpdateRef = useRef("");
  const hydrated = useAppStore((state) => state.hydrated);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const role = useAppStore((state) => state.role);
  const familyCode = useAppStore((state) => state.familyCode);
  const medications = useAppStore((state) => state.medications);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const profile = useAppStore((state) => state.profile);
  const consent = useAppStore((state) => state.consent);
  const emergencyContacts = useAppStore((state) => state.emergencyContacts);
  const familyAlerts = useAppStore((state) => state.familyAlerts);

  // The elder device is the writer. Debouncing prevents one request for every
  // keystroke or short-lived status change.
  useEffect(() => {
    if (!hydrated || !sessionAccountId || !familyCode || role !== "elder") {
      return;
    }
    const timer = window.setTimeout(async () => {
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      setStatus((current) => (current === "synced" ? current : "syncing"));
      try {
        const revision = await syncCloudSnapshot(
          useAppStore.getState().getCloudSnapshot()
        );
        useAppStore.getState().markSynced(revision);
        setStatus("synced");
      } catch {
        setStatus("offline");
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    sessionAccountId,
    role,
    familyCode,
    medications,
    doseEvents,
    riskChecks,
    profile,
    consent,
    emergencyContacts,
    familyAlerts
  ]);

  // The family device is a reader. Polling depends only on the connection and
  // family code; merging snapshots must not restart the interval or make the
  // sync labels alternate on every poll.
  useEffect(() => {
    if (!hydrated || !sessionAccountId || !familyCode || role !== "family") {
      lastFamilyUpdateRef.current = "";
      return;
    }

    let cancelled = false;
    lastFamilyUpdateRef.current = "";
    setStatus("syncing");

    async function loadFamily(firstLoad = false) {
      if (!navigator.onLine) {
        if (!cancelled) setStatus("offline");
        return;
      }
      try {
        const snapshot = await fetchFamilySnapshot(familyCode);
        if (cancelled) return;
        if (!snapshot) {
          setStatus("idle");
          return;
        }
        if (snapshot.updatedAt !== lastFamilyUpdateRef.current) {
          lastFamilyUpdateRef.current = snapshot.updatedAt;
          useAppStore.getState().mergeFamilySummary(snapshot);
        }
        setStatus("synced");
      } catch {
        if (!cancelled && firstLoad) setStatus("error");
      }
    }

    void loadFamily(true);
    const interval = window.setInterval(() => {
      void loadFamily(false);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hydrated, sessionAccountId, role, familyCode]);

  return status;
}
