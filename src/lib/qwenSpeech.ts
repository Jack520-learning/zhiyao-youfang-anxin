import { useEffect, useRef, useState } from "react";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("音频文件读取失败"));
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
          let payload: { text?: string; error?: string } = {};
          try {
            payload = (await response.json()) as {
              text?: string;
              error?: string;
            };
          } catch {
            // 后端可能返回非 JSON，忽略解析错误
          }
          if (!response.ok || !payload.text) {
            // 所有错误信息强制本地化，不暴露后端英文
            const raw = payload.error || "";
            const code = (raw.match(/error|failed|invalid|unauthorized|quota|limit/i) || [])[0];
            let friendly = "语音识别暂时不可用，请改用文字输入。";
            if (code && /quota|limit/i.test(code)) {
              friendly = "语音识别额度已用完，请稍后再试。";
            } else if (code && /unauthorized|auth/i.test(code)) {
              friendly = "语音服务未授权，请联系管理员。";
            } else if (code && /invalid/i.test(code)) {
              friendly = "语音格式不支持，请换一种输入方式。";
            }
            throw new Error(friendly);
          }
          callbackRef.current(payload.text);
        } catch (transcriptionError) {
          setError(
            transcriptionError instanceof Error
              ? transcriptionError.message
              : "语音识别暂时不可用，请改用文字输入。"
          );
        } finally {
          setProcessing(false);
          setInterim("");
        }
      };
      recorderRef.current = recorder;
      recorder.start(180);
      setListening(true);
    } catch (err) {
      holdingRef.current = false;
      setListening(false);
      // 区分用户拒绝 vs 其他硬件错误
      const name = err instanceof Error ? err.name : "";
      const msg = err instanceof Error ? err.message : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("麦克风权限被拒绝，请在浏览器地址栏点击锁图标允许麦克风权限。");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("没有找到可用的麦克风设备。");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("麦克风被其他程序占用，请关闭后再试。");
      } else if (name === "OverconstrainedError") {
        setError("当前麦克风不支持所需格式，请检查设备。");
      } else {
        setError("无法使用麦克风，请检查浏览器权限和设备。");
      }
      // 静默清理可能残留的 stream
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
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
