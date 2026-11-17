import { useEffect, useRef, useState } from "react";
import {
  CloudRevisionConflictError,
  fetchFamilySnapshotState,
  syncCloudSnapshot
} from "../lib/cloud";
import {
  AccountRequestError,
  fetchAdminOverview,
  fetchServerAccounts
} from "../lib/accountApi";
import {
  cloudSnapshotFingerprint,
  mergeConversationHistory
} from "../lib/cloudSnapshot";
import { useAppStore } from "../store/useAppStore";
import {
  isChatGenerationActive,
  subscribeChatGenerationEnded
} from "../lib/chatSyncGuard";

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
  const sessionToken = useAppStore(
    (state) =>
      state.accounts.find((account) => account.id === state.sessionAccountId)
        ?.sessionToken || ""
  );
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
    initialSyncDoneRef.current = {};
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

  useEffect(
    () =>
      subscribeChatGenerationEnded(() =>
        setConnectionTick((value) => value + 1)
      ),
    []
  );

  useEffect(() => {
    if (!hydrated || !sessionToken || role === "admin") return;
    let cancelled = false;

    async function refreshAccounts() {
      try {
        const result = await fetchServerAccounts(sessionToken);
        if (cancelled) return;
        useAppStore
          .getState()
          .syncServerAccounts(result.accounts, sessionToken);
      } catch (error) {
        if (
          !cancelled &&
          error instanceof AccountRequestError &&
          [401, 403].includes(error.status)
        ) {
          useAppStore.getState().logoutAccount();
        }
      }
    }

    void refreshAccounts();
    const interval = window.setInterval(refreshAccounts, 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAccounts();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hydrated, role, sessionToken, connectionTick]);

  useEffect(() => {
    if (role !== "admin") return;
    if (!sessionToken) {
      setStatus("idle");
      return;
    }
    let cancelled = false;

    async function verifyAdminSync() {
      if (!navigator.onLine) {
        if (!cancelled) setStatus("offline");
        return;
      }
      setStatus((current) => (current === "synced" ? current : "syncing"));
      try {
        await fetchAdminOverview(sessionToken);
        if (!cancelled) setStatus("synced");
      } catch (error) {
        if (cancelled) return;
        if (
          error instanceof AccountRequestError &&
          [401, 403].includes(error.status)
        ) {
          useAppStore.getState().logoutAccount();
          return;
        }
        setStatus("offline");
      }
    }

    void verifyAdminSync();
    const interval = window.setInterval(verifyAdminSync, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void verifyAdminSync();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [role, sessionToken, connectionTick]);

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
        const existing = await fetchFamilySnapshotState(familyCode);
        if (existing) {
          const remoteFingerprint = cloudSnapshotFingerprint(
            existing.snapshot
          );
          lastUploadedElderFingerprintRef.current = remoteFingerprint;
          useAppStore.getState().mergeFamilySummary(existing.snapshot);
          useAppStore.getState().markSynced(existing.revision);
        } else {
          const snapshot = useAppStore.getState().getCloudSnapshot();
          const revision = await syncCloudSnapshot(
            snapshot,
            useAppStore.getState().cloudRevision ?? 0
          );
          lastUploadedElderFingerprintRef.current =
            cloudSnapshotFingerprint(snapshot);
          useAppStore.getState().markSynced(revision);
        }
        initialSyncDoneRef.current[key] = true;
        setConnectionTick((value) => value + 1);
      } catch {
        initialSyncDoneRef.current[key] = false;
      }
    }
    void bootstrapSync();
  }, [hydrated, sessionAccountId, familyCode, role, connectionTick]);

  // The elder device is the writer. Debouncing prevents one request for every
  // keystroke or short-lived status change.
  useEffect(() => {
    if (!hydrated || !sessionAccountId || !familyCode || role !== "elder") {
      return;
    }
    if (isChatGenerationActive()) return;
    const key = `${sessionAccountId}:${familyCode}`;
    if (!initialSyncDoneRef.current[key]) return;
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
        const revision = await syncCloudSnapshot(
          snapshot,
          useAppStore.getState().cloudRevision
        );
        lastUploadedElderFingerprintRef.current = fingerprint;
        useAppStore.getState().markSynced(revision);
        setStatus("synced");
      } catch (error) {
        if (error instanceof CloudRevisionConflictError) {
          const localSnapshot = useAppStore.getState().getCloudSnapshot();
          const mergedSnapshot = {
            ...error.snapshot,
            conversations: mergeConversationHistory(
              error.snapshot.conversations,
              localSnapshot.conversations
            )
          };
          lastUploadedElderFingerprintRef.current = "";
          useAppStore.getState().mergeFamilySummary(mergedSnapshot);
          useAppStore.getState().markSynced(error.revision);
          setStatus("syncing");
          window.setTimeout(
            () => setConnectionTick((value) => value + 1),
            250
          );
          return;
        }
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
        const remote = await fetchFamilySnapshotState(familyCode);
        const snapshot = remote?.snapshot;
        if (
          cancelled ||
          !snapshot ||
          !remote ||
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
          useAppStore.getState().markSynced(remote.revision);
          setStatus("synced");
          return;
        }
        lastUploadedElderFingerprintRef.current = remoteFingerprint;
        useAppStore.getState().mergeFamilySummary(snapshot);
        useAppStore.getState().markSynced(remote.revision);
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
        const remote = await fetchFamilySnapshotState(familyCode);
        const snapshot = remote?.snapshot;
        if (cancelled) return;
        if (!remote || !snapshot) {
          setStatus("idle");
          return;
        }
        if (snapshot.updatedAt !== lastFamilyUpdateRef.current) {
          lastFamilyUpdateRef.current = snapshot.updatedAt;
          useAppStore.getState().mergeFamilySummary(snapshot);
        }
        useAppStore.getState().markSynced(remote.revision);
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
