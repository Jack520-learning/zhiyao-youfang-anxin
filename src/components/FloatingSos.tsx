import { ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function FloatingSos({ onOpen }: { onOpen: () => void }) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(16, window.innerWidth - 126),
    y: Math.max(110, Math.round(window.innerHeight * 0.44))
  }));
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    function keepInsideViewport() {
      setPosition((current) => ({
        x: Math.min(Math.max(12, current.x), Math.max(12, window.innerWidth - 96)),
        y: Math.min(Math.max(12, current.y), Math.max(12, window.innerHeight - 70))
      }));
    }
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, []);

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false
    };
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.moved = true;
    setPosition({
      x: Math.min(
        Math.max(12, drag.originX + deltaX),
        Math.max(12, window.innerWidth - 96)
      ),
      y: Math.min(
        Math.max(12, drag.originY + deltaY),
        Math.max(12, window.innerHeight - 70)
      )
    });
  }

  function stopDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) onOpen();
  }

  return (
    <button
      type="button"
      className="sos-floating-button"
      style={{ left: position.x, top: position.y }}
      aria-label="紧急求助，可拖动"
      title="紧急求助（可拖动）"
      onClick={(event) => {
        if (event.detail === 0) onOpen();
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ShieldAlert size={19} aria-hidden="true" />
      <span>求助</span>
    </button>
  );
}
