import { useEffect, useRef, useState } from "react";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useQwenSpeechRecognition(
  onFinalTranscript: (text: string) => void
) {
  const callbackRef = useRef(onFinalTranscript);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdingRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function start() {
    if (!supported || holdingRef.current) return;
    setError("");
    holdingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        },
        video: false
      });
      if (!holdingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4"
      ];
      const mimeType = preferredTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        releaseStream();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm"
        });
        if (!blob.size) {
          setError("没有录到声音，请再按住说一次。");
          return;
        }
        setProcessing(true);
        setInterim("正在用千问整理语音…");
        try {
          const audioDataUrl = await blobToDataUrl(blob);
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioDataUrl,
              mimeType: blob.type
            })
          });
          const payload = (await response.json()) as {
            text?: string;
            error?: string;
          };
          if (!response.ok || !payload.text) {
            throw new Error(payload.error || "千问没有返回语音文字");
          }
          callbackRef.current(payload.text);
        } catch (transcriptionError) {
          setError(
            transcriptionError instanceof Error
              ? transcriptionError.message
              : "语音识别失败，请改用文字输入。"
          );
        } finally {
          setProcessing(false);
          setInterim("");
        }
      };
      recorderRef.current = recorder;
      recorder.start(180);
      setListening(true);
    } catch {
      holdingRef.current = false;
      setListening(false);
      setError("无法使用麦克风，请检查浏览器权限。");
    }
  }

  function stop() {
    holdingRef.current = false;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      releaseStream();
    }
    setListening(false);
  }

  return {
    supported,
    listening,
    processing,
    interim,
    error,
    clearError: () => setError(""),
    start,
    stop
  };
}
