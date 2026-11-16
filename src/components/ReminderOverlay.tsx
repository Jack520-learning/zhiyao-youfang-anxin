import { BellRing, Clock3, PhoneCall, X } from "lucide-react";
import { useEffect, useState } from "react";
import { speakText, stopSpeaking } from "../lib/speech";
import { formatTime, getNextDose, humanizeRelation } from "../lib/time";
import { useAppStore } from "../store/useAppStore";

export function ReminderOverlay() {
  const medications = useAppStore((state) => state.medications);
  const role = useAppStore((state) => state.role);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const preferences = useAppStore((state) => state.preferences);
  const profile = useAppStore((state) => state.profile);
  const contacts = useAppStore((state) => state.emergencyContacts);
  const updateDose = useAppStore((state) => state.updateDose);
  const nextDose = getNextDose(
    medications,
    doseEvents,
    new Date(),
    profile.timeZone
  );
  const [dismissedDoseId, setDismissedDoseId] = useState("");

  // Allow the chat header "取消提醒" button to dismiss the current overlay.
  useEffect(() => {
    function onDismiss() {
      if (nextDose) setDismissedDoseId(nextDose.doseId);
    }
    window.addEventListener("dismiss-reminder", onDismiss);
    return () => window.removeEventListener("dismiss-reminder", onDismiss);
  }, [nextDose]);

  const minutesFromNow = nextDose
    ? (new Date(nextDose.scheduledAt).getTime() - Date.now()) / 60000
    : Number.POSITIVE_INFINITY;
  const due = Boolean(nextDose && minutesFromNow <= 15 && minutesFromNow >= -90);
  const open = Boolean(nextDose && due && dismissedDoseId !== nextDose.doseId);
  const reminderKey = nextDose?.doseId ?? "";

  useEffect(() => {
    if (!open || !nextDose) return;
    navigator.vibrate?.([180, 100, 180]);
    speakText(
      `到吃药时间啦。${humanizeRelation(
        nextDose.medication.relation
      )}，${nextDose.medication.name}，${nextDose.medication.dosage}。`,
      preferences.soundEnabled && profile.voiceEnabled,
      preferences.voiceMode,
      preferences.customVoiceId
    );
  }, [
    open,
    reminderKey,
    preferences.soundEnabled,
    preferences.voiceMode,
    preferences.customVoiceId,
    profile.voiceEnabled
  ]);

  if (role !== "elder" || !open || !nextDose) return null;

  function closeTemporarily() {
    setDismissedDoseId(nextDose!.doseId);
  }

  function record(status: "taken" | "later") {
    updateDose(
      nextDose!.medication.id,
      nextDose!.scheduledAt,
      status,
      nextDose!.doseId
    );
    navigator.vibrate?.(status === "taken" ? [80] : [40, 60, 40]);
    closeTemporarily();
  }

  return (
    <div className="reminder-backdrop" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
      <section className="reminder-screen">
        <button className="icon-btn reminder-close" type="button" aria-label="稍后处理" onClick={closeTemporarily}>
          <X size={22} />
        </button>
        <div className="reminder-kicker">
          <BellRing size={22} aria-hidden="true" />
          到吃药时间啦
        </div>
        <h2 id="reminder-title">{nextDose.medication.name}</h2>
        <p className="reminder-dose">
          {humanizeRelation(nextDose.medication.relation)}，{nextDose.medication.dosage}
        </p>
        <div className="reminder-time">
          <Clock3 size={23} aria-hidden="true" />
          {formatTime(new Date(nextDose.scheduledAt), profile.timeZone)}
        </div>
        <div className="reminder-actions">
          <button className="btn btn-primary btn-large" type="button" onClick={() => record("taken")}>
            已经吃啦
          </button>
          <button className="btn btn-large" type="button" onClick={() => record("later")}>
            等会儿提醒
          </button>
        </div>
        {contacts[0] ? (
          <a className="btn btn-ghost" href={`tel:${contacts[0].phone}`}>
            <PhoneCall size={18} aria-hidden="true" />
            需要帮助，联系 {contacts[0].name}
          </a>
        ) : null}
        <button
          className="btn btn-ghost"
          type="button"
          onClick={stopSpeaking}
        >
          停止朗读
        </button>
        <p className="field-hint" style={{ textAlign: "center", marginTop: 8 }}>
          这里只是提醒，不会替您决定停药或调整剂量。
        </p>
      </section>
    </div>
  );
}
