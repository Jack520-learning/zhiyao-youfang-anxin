import { Camera, ImagePlus, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fileToCompressedDataUrl } from "../lib/image";

export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
  eyebrow = "拍照识药",
  title = "把药品包装或中药材放在画面中间"
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  eyebrow?: string;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const systemCameraInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [captured, setCaptured] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    setError("");
    setLibraryError("");
    setCaptured("");
    let permissionTimer: number | undefined;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("当前浏览器不支持摄像头取景，请从相册选择照片。");
        return;
      }
      try {
        permissionTimer = window.setTimeout(() => {
          if (cancelled) return;
          setStatus("error");
          setError(
            "摄像头没有响应。请检查浏览器摄像头权限后重试，或从相册选择照片。"
          );
        }, 9000);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1440 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (permissionTimer) window.clearTimeout(permissionTimer);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("ready");
      } catch (cameraError) {
        if (permissionTimer) window.clearTimeout(permissionTimer);
        setStatus("error");
        setError(
          cameraError instanceof DOMException &&
            cameraError.name === "NotAllowedError"
            ? "摄像头权限未开启。请在浏览器设置中允许访问摄像头，或从相册选择照片。"
            : "没有找到可用的摄像头，请从相册选择照片。"
        );
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      if (permissionTimer) window.clearTimeout(permissionTimer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, retryKey]);

  if (!open) return null;

  function close() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    onClose();
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    const maxDimension = 2400;
    const scale = Math.min(
      1,
      maxDimension / Math.max(video.videoWidth, video.videoHeight)
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(imageDataUrl);
  }

  async function useLibrary(file: File | undefined) {
    if (!file) return;
    try {
      setLibraryError("");
      const imageDataUrl = await fileToCompressedDataUrl(file);
      onCapture(imageDataUrl);
    } catch {
      setLibraryError("这张图片无法读取，请换一张清晰的药品或中药材照片。");
    }
  }

  return (
    <div className="camera-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="camera-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="camera-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="camera-title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭相机" onClick={close}>
            <X size={22} />
          </button>
        </div>

        {captured ? (
          <img className="camera-preview" src={captured} alt="刚拍摄的药品或中药材照片" />
        ) : (
          <div className="camera-live">
            <video ref={videoRef} playsInline muted aria-label="摄像头实时画面" />
            {status === "loading" ? (
              <div className="camera-state">
                <LoaderCircle size={26} className="spin" aria-hidden="true" />
                正在打开摄像头
              </div>
            ) : null}
            {status === "error" ? (
              <div className="camera-state">
                <Camera size={28} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>
        )}

        <div className="camera-actions">
          {captured ? (
            <>
              <button className="btn btn-primary btn-large" type="button" onClick={() => onCapture(captured)}>
                使用这张照片
              </button>
              <button className="btn btn-large" type="button" onClick={() => setCaptured("")}>
                <RotateCcw size={19} aria-hidden="true" />
                重新拍
              </button>
            </>
          ) : (
            <>
              {status === "error" ? (
                <>
                  <button
                    className="btn btn-primary btn-large"
                    type="button"
                    onClick={() => setRetryKey((value) => value + 1)}
                  >
                    <RotateCcw size={20} aria-hidden="true" />
                    重试摄像头
                  </button>
                  <button
                    className="btn btn-large"
                    type="button"
                    onClick={() => systemCameraInputRef.current?.click()}
                  >
                    <Camera size={20} aria-hidden="true" />
                    使用手机系统相机
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary btn-large"
                  type="button"
                  disabled={status !== "ready"}
                  onClick={takePhoto}
                >
                  <Camera size={21} aria-hidden="true" />
                  拍摄并识别
                </button>
              )}
            </>
          )}
          <button
            className="btn btn-large"
            type="button"
            onClick={() => albumInputRef.current?.click()}
          >
            <ImagePlus size={20} aria-hidden="true" />
            从相册选择
          </button>
        </div>
        <input
          ref={albumInputRef}
          className="visually-hidden-file"
          type="file"
          accept="image/*"
          aria-label="从相册选择药品或中药材照片"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void useLibrary(file);
          }}
        />
        <input
          ref={systemCameraInputRef}
          className="visually-hidden-file"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="使用手机系统相机拍摄药品或中药材"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void useLibrary(file);
          }}
        />
        {libraryError ? (
          <p className="camera-library-error" role="alert">
            {libraryError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
