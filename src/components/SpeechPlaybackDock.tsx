import { LoaderCircle, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getSpeechStatus,
  stopSpeaking,
  type SpeechStatus
} from "../lib/speech";

export function SpeechPlaybackDock() {
  const [status, setStatus] = useState<SpeechStatus>("idle");

  useEffect(() => {
    const update = () => setStatus(getSpeechStatus());
    update();
    window.addEventListener("speech-state-change", update);
    const timer = window.setInterval(update, 250);
    return () => {
      window.removeEventListener("speech-state-change", update);
      window.clearInterval(timer);
    };
  }, []);

  if (status === "idle") return null;

  return (
    <aside className="speech-playback-dock" aria-live="polite">
      <span>
        {status === "loading" ? (
          <LoaderCircle className="spin" size={19} aria-hidden="true" />
        ) : (
          <Volume2 size={19} aria-hidden="true" />
        )}
        {status === "loading"
          ? "正在准备朗读"
          : status === "paused"
            ? "朗读已暂停"
            : "正在朗读"}
      </span>
      <button type="button" onClick={stopSpeaking}>
        停止朗读
      </button>
    </aside>
  );
}
