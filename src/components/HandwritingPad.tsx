import { Eraser, LoaderCircle, PenLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recognizeHandwritingImage } from "../lib/handwriting";

export function HandwritingPad({
  open,
  onClose,
  onText
}: {
  open: boolean;
  onClose: () => void;
  onText: (text: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [recognizing, setRecognizing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  function clearCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#172b25";
    context.lineWidth = 9;
    context.lineCap = "round";
    context.lineJoin = "round";
    setError("");
    setProgress("");
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(clearCanvas, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  function pointerPosition(
    event: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    };
  }

  async function recognize() {
    const canvas = canvasRef.current;
    if (!canvas || recognizing) return;
    setRecognizing(true);
    setError("");
    try {
      const text = await recognizeHandwritingImage(
        canvas.toDataURL("image/png"),
        setProgress
      );
      if (!text) {
        setError("没有辨认出文字，请写大一些、慢一些后重试。");
        return;
      }
      onText(text);
      onClose();
    } catch {
      setError("手写识别暂未完成，请检查网络或重新书写。");
    } finally {
      setRecognizing(false);
      setProgress("");
    }
  }

  return (
    <div className="handwriting-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="handwriting-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="handwriting-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="handwriting-header">
          <div>
            <p className="eyebrow">手写输入</p>
            <h2 id="handwriting-title">在这里写药名或问题</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭手写输入"
            onClick={onClose}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <canvas
          ref={canvasRef}
          className="handwriting-canvas"
          width={1000}
          height={360}
          aria-label="手写输入画板"
          onPointerDown={(event) => {
            const point = pointerPosition(event);
            const context = canvasRef.current?.getContext("2d");
            if (!point || !context) return;
            drawingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            context.beginPath();
            context.moveTo(point.x, point.y);
          }}
          onPointerMove={(event) => {
            if (!drawingRef.current) return;
            const point = pointerPosition(event);
            const context = canvasRef.current?.getContext("2d");
            if (!point || !context) return;
            context.lineTo(point.x, point.y);
            context.stroke();
          }}
          onPointerUp={() => {
            drawingRef.current = false;
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
          }}
        />
        <p className="field-hint">
          请用手指、触控笔或鼠标书写；识别后会填入搜索框，再点击搜索确认。
        </p>
        {progress ? (
          <div className="notice" aria-live="polite">
            <LoaderCircle size={19} className="spin" aria-hidden="true" />
            {progress}
          </div>
        ) : null}
        {error ? (
          <div className="notice warm" role="alert">
            {error}
          </div>
        ) : null}
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary btn-large"
            disabled={recognizing}
            onClick={() => void recognize()}
          >
            {recognizing ? (
              <LoaderCircle size={20} className="spin" aria-hidden="true" />
            ) : (
              <PenLine size={20} aria-hidden="true" />
            )}
            {recognizing ? "正在识别手写" : "识别手写并填入"}
          </button>
          <button
            type="button"
            className="btn btn-large"
            disabled={recognizing}
            onClick={clearCanvas}
          >
            <Eraser size={20} aria-hidden="true" />
            清除重写
          </button>
        </div>
      </section>
    </div>
  );
}
