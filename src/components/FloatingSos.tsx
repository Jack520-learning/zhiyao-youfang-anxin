import { GripHorizontal, Minus, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function FloatingSos({ onOpen }: { onOpen: () => void }) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(16, window.innerWidth - 248),
    y: Math.max(120, Math.round(window.innerHeight * 0.42))
  }));
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    function keepInsideViewport() {
      setPosition((current) => ({
        x: Math.min(Math.max(12, current.x), Math.max(12, window.innerWidth - 230)),
        y: Math.min(Math.max(12, current.y), Math.max(12, window.innerHeight - 150))
      }));
    }
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, []);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    };
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.min(
        Math.max(12, drag.originX + event.clientX - drag.startX),
        Math.max(12, window.innerWidth - 230)
      ),
      y: Math.min(
        Math.max(12, drag.originY + event.clientY - drag.startY),
        Math.max(12, window.innerHeight - 150)
      )
    });
  }

  function stopDrag() {
    dragRef.current = null;
  }

  return (
    <aside
      className={`sos-floating ${minimized ? "minimized" : ""}`}
      style={{ left: position.x, top: position.y }}
      aria-label="可拖动的紧急求助悬浮窗"
    >
      <div
        className="sos-floating-handle"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <GripHorizontal size={18} aria-hidden="true" />
        <span>SOS 求助</span>
        <button
          type="button"
          aria-label={minimized ? "展开求助悬浮窗" : "收起求助悬浮窗"}
          onClick={() => setMinimized((value) => !value)}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
      </div>
      {!minimized ? (
        <div className="sos-floating-body">
          <ShieldAlert size={27} aria-hidden="true" />
          <p>身体不舒服时，先打开求助面板</p>
          <button type="button" onClick={onOpen}>
            立即打开求助
          </button>
          <small>拖动上方把手可移动</small>
        </div>
      ) : null}
    </aside>
  );
}
