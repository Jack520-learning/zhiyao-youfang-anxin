import { useEffect, useRef, useState } from "react";
import {
  fetchFamilySnapshot,
  syncCloudSnapshot
} from "../lib/cloud";
import { cloudSnapshotFingerprint } from "../lib/cloudSnapshot";
import { useAppStore } from "../store/useAppStore";
import { isChatGenerationActive } from "../lib/chatSyncGuard";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export function useCloudSync() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [connectionTick, setConnectionTick] = useState(0);
  const lastFamilyUpdateRef = useRef("");
  const lastElderContactUpdateRef = useRef("");
  const initialSyncDoneRef = useRef<Record<string, boolean>>({});
  const lastUploadedElderFingerprintRef = useRef("");
  const pendingElderWriteRef = useRef(false);
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
  const conversations = useAppStore((state) => state.conversations);
  const preferences = useAppStore((state) => state.preferences);

  useEffect(() => {
    lastElderContactUpdateRef.current = "";
    lastFamilyUpdateRef.current = "";
    lastUploadedElderFingerprintRef.current = "";
    pendingElderWriteRef.current = false;
  }, [sessionAccountId, familyCode, role]);

  useEffect(() => {
    const retry = () => setConnectionTick((value) => value + 1);
    window.addEventListener("online", retry);
    window.addEventListener("offline", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", retry);
    };
  }, []);

  // After login/register, push local data to server immediately if the server
  // doesn't have a snapshot yet. This ensures cross-device accounts see data
  // on first login too — not only after the elder makes a future edit.
  useEffect(() => {
    if (
      !hydrated ||
      !sessionAccountId ||
      !familyCode ||
      role === "admin"
    ) {
      return;
    }
    const key = `${sessionAccountId}:${familyCode}`;
    if (initialSyncDoneRef.current[key]) return;

    async function bootstrapSync() {
      try {
        const existing = await fetchFamilySnapshot(familyCode);
        // If the server already has data, no need to push empty initial state.
        // Only push when server is empty — that's the first-login case.
        if (!existing) {
          const snapshot = useAppStore.getState().getCloudSnapshot();
          const revision = await syncCloudSnapshot(
            snapshot
          );
          lastUploadedElderFingerprintRef.current =
            cloudSnapshotFingerprint(snapshot);
          useAppStore.getState().markSynced(revision);
        }
        initialSyncDoneRef.current[key] = true;
      } catch {
        // Non-blocking — the regular writer/polling loops will catch up.
      }
    }
    void bootstrapSync();
  }, [hydrated, sessionAccountId, familyCode, role]);

  // The elder device is the writer. Debouncing prevents one request for every
  // keystroke or short-lived status change.
  useEffect(() => {
    if (!hydrated || !sessionAccountId || !familyCode || role !== "elder") {
      return;
    }
    pendingElderWriteRef.current = true;
    const timer = window.setTimeout(async () => {
      if (!navigator.onLine) {
        pendingElderWriteRef.current = false;
        setStatus("offline");
        return;
      }
      setStatus((current) => (current === "synced" ? current : "syncing"));
      try {
        const snapshot = useAppStore.getState().getCloudSnapshot();
        const fingerprint = cloudSnapshotFingerprint(snapshot);
        if (fingerprint === lastUploadedElderFingerprintRef.current) {
          setStatus("synced");
          return;
        }
        const revision = await syncCloudSnapshot(snapshot);
        lastUploadedElderFingerprintRef.current = fingerprint;
        useAppStore.getState().markSynced(revision);
        setStatus("synced");
      } catch {
        setStatus("offline");
      } finally {
        pendingElderWriteRef.current = false;
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      pendingElderWriteRef.current = false;
    };
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
    familyAlerts,
    conversations,
    preferences,
    connectionTick
  ]);

  // Every elder device is a writer and a reader. This keeps conversations,
  // medications, reminders and profile data consistent across phone and web.
  useEffect(() => {
    if (!hydrated || !sessionAccountId || !familyCode || role !== "elder") {
      lastElderContactUpdateRef.current = "";
      return;
    }

    let cancelled = false;
    lastElderContactUpdateRef.current = "";

    async function loadElderSnapshot() {
      if (isChatGenerationActive()) return;
      try {
        const snapshot = await fetchFamilySnapshot(familyCode);
        if (
          cancelled ||
          !snapshot ||
          isChatGenerationActive()
        ) {
          return;
        }
        if (snapshot.updatedAt === lastElderContactUpdateRef.current) return;
        lastElderContactUpdateRef.current = snapshot.updatedAt;
        if (pendingElderWriteRef.current) return;
        const localFingerprint = cloudSnapshotFingerprint(
          useAppStore.getState().getCloudSnapshot()
        );
        const remoteFingerprint = cloudSnapshotFingerprint(snapshot);
        if (remoteFingerprint === localFingerprint) {
          lastUploadedElderFingerprintRef.current = remoteFingerprint;
          setStatus("synced");
          return;
        }
        lastUploadedElderFingerprintRef.current = remoteFingerprint;
        useAppStore.getState().mergeFamilySummary(snapshot);
        setStatus("synced");
      } catch {
        // The regular writer reports connection status.
      }
    }

    void loadElderSnapshot();
    const source = new EventSource(
      `/api/family/${encodeURIComponent(familyCode.toUpperCase())}/events`
    );
    source.onmessage = () => {
      void loadElderSnapshot();
    };
    source.onerror = () => {
      if (!cancelled) setStatus("offline");
    };
    const interval = window.setInterval(() => {
      void loadElderSnapshot();
    }, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadElderSnapshot();
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      source.close();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hydrated, sessionAccountId, role, familyCode, connectionTick]);

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
    const source = new EventSource(
      `/api/family/${encodeURIComponent(familyCode.toUpperCase())}/events`
    );
    source.onmessage = () => {
      void loadFamily(false);
    };
    source.onerror = () => {
      if (!cancelled) setStatus("offline");
    };
    const interval = window.setInterval(() => {
      void loadFamily(false);
    }, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadFamily(false);
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      source.close();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hydrated, sessionAccountId, role, familyCode, connectionTick]);

  return status;
}
