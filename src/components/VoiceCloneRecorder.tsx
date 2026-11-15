import { CircleStop, LoaderCircle, Mic, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  onCreated
}: {
  onCreated: (voiceId: string, name: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const elapsedRef = useRef(0);

  function release() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => release, []);

  async function start() {
    setError("");
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
        void upload(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorderRef.current = recorder;
      recorder.start(250);
      elapsedRef.current = 0;
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setSeconds(elapsedRef.current);
        if (elapsedRef.current >= 20) stop();
      }, 1000);
    } catch {
      setError("无法使用麦克风，请检查浏览器麦克风权限");
    }
  }

  function stop() {
    if (!recorderRef.current || recorderRef.current.state !== "recording") {
      return;
    }
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (elapsedRef.current < 5) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      release();
      setError("录音太短，请连续朗读至少 5 秒，推荐 10 到 20 秒");
      return;
    }
    recorderRef.current?.stop();
    release();
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
      onCreated(payload.voiceId, `我的专属音色 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
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
          {recording ? `结束录音 ${seconds} 秒` : "开始录制声音"}
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
