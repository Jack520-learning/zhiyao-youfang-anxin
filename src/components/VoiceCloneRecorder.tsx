import {
  CircleStop,
  LoaderCircle,
  Mic,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stopSpeaking } from "../lib/speech";

const READING_TEXT =
  "今天天气很好，我正在使用智药有方核对今天的用药。请按照医生和说明书的安排服药。";

async function audioBlobToWavDataUrl(blob: Blob): Promise<string> {
  const sourceBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
  await audioContext.close();
  const sampleRate = 24000;
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(decoded.duration * sampleRate)),
    sampleRate
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const channel = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + channel.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + channel.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, channel.length * 2, true);
  let offset = 44;
  for (const sample of channel) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
    offset += 2;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(new Blob([buffer], { type: "audio/wav" }));
  });
}

export function VoiceCloneRecorder({
  onCreated,
  customVoices,
  selectedVoiceId,
  onSelect,
  onDelete
}: {
  onCreated: (voiceId: string, name: string) => void;
  customVoices: Array<{ id: string; name: string; createdAt: string }>;
  selectedVoiceId?: string;
  onSelect: (voiceId: string, name: string) => void;
  onDelete: (voiceId: string) => Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceFramesRef = useRef(0);
  const checkedFramesRef = useRef(0);

  function release() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => release, []);

  async function start() {
    setError("");
    stopSpeaking();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("当前浏览器不支持录音，请使用 Chrome 或 Safari");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      voiceFramesRef.current = 0;
      checkedFramesRef.current = 0;
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        release();
        void upload(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorderRef.current = recorder;
      recorder.start(250);
      elapsedRef.current = 0;
      startedAtRef.current = performance.now();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const analyserNode = analyserRef.current;
        if (analyserNode) {
          const values = new Uint8Array(analyserNode.fftSize);
          analyserNode.getByteTimeDomainData(values);
          const rms = Math.sqrt(
            values.reduce((sum, value) => {
              const centered = (value - 128) / 128;
              return sum + centered * centered;
            }, 0) / values.length
          );
          checkedFramesRef.current += 1;
          if (rms > 0.012) voiceFramesRef.current += 1;
        }
        elapsedRef.current =
          (performance.now() - startedAtRef.current) / 1000;
        if (elapsedRef.current >= 20) stop();
      }, 250);
    } catch {
      release();
      setRecording(false);
      setError("无法使用麦克风，请检查浏览器麦克风权限");
    }
  }

  function stop() {
    if (!recorderRef.current || recorderRef.current.state !== "recording") {
      return;
    }
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    elapsedRef.current = (performance.now() - startedAtRef.current) / 1000;
    if (elapsedRef.current < 5) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      release();
      setError("录音太短，请连续朗读至少 5 秒，推荐 10 到 20 秒");
      return;
    }
    if (
      checkedFramesRef.current > 0 &&
      voiceFramesRef.current / checkedFramesRef.current < 0.18
    ) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      release();
      setError("没有检测到持续清晰的人声，请在安静环境中靠近麦克风重新录制");
      return;
    }
    recorderRef.current?.stop();
  }

  async function upload(blob: Blob) {
    setProcessing(true);
    setError("");
    try {
      const audioDataUrl = await audioBlobToWavDataUrl(blob);
      const response = await fetch("/api/voice-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioDataUrl })
      });
      const payload = (await response.json()) as {
        voiceId?: string;
        error?: string;
      };
      if (!response.ok || !payload.voiceId) {
        throw new Error(payload.error || "专属音色创建失败");
      }
      onCreated(payload.voiceId, `我的专属音色 ${customVoices.length + 1}`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "专属音色创建失败，请重新录制"
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="voice-clone-recorder">
      <div className="section-heading">
        <div>
          <h3>创建我的专属音色</h3>
          <p>请在安静环境朗读下面这段话，建议录制 10 到 20 秒。</p>
        </div>
        <ShieldCheck size={20} color="var(--primary)" aria-hidden="true" />
      </div>
      <blockquote>{READING_TEXT}</blockquote>
      {customVoices.length ? (
        <div className="custom-voice-library">
          <h4>已创建的专属音色</h4>
          {customVoices.map((voice) => (
            <div className="custom-voice-row" key={voice.id}>
              <button
                type="button"
                className={
                  selectedVoiceId === voice.id ? "custom-voice-pick active" : "custom-voice-pick"
                }
                onClick={() => onSelect(voice.id, voice.name)}
              >
                <Mic size={17} aria-hidden="true" />
                <span>{voice.name}</span>
                {selectedVoiceId === voice.id ? <small>使用中</small> : null}
              </button>
              <button
                type="button"
                className="custom-voice-delete"
                aria-label={`删除音色 ${voice.name}`}
                disabled={deletingId === voice.id}
                onClick={async () => {
                  setDeletingId(voice.id);
                  try {
                    await onDelete(voice.id);
                  } finally {
                    setDeletingId("");
                  }
                }}
              >
                {deletingId === voice.id ? (
                  <LoaderCircle size={17} className="spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={17} aria-hidden="true" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="voice-record-actions">
        <button
          type="button"
          className={recording ? "btn btn-danger" : "btn btn-primary"}
          disabled={processing}
          onClick={recording ? stop : start}
        >
          {recording ? (
            <CircleStop size={19} aria-hidden="true" />
          ) : (
            <Mic size={19} aria-hidden="true" />
          )}
          {recording ? "结束录音" : "开始录制声音"}
        </button>
        {processing ? (
          <span className="voice-record-status">
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            正在分析并生成专属音色，可能需要几十秒
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="field-hint">
        仅录制本人声音或已获得授权的声音，录音只用于创建当前账号的音色。
      </p>
    </section>
  );
}
