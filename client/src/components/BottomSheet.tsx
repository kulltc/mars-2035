import React, { useCallback, useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  onClose: () => void;
  maxHeight?: string;
  children: React.ReactNode;
}

export function BottomSheet({ onClose, maxHeight = "60vh", children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const [closing, setClosing] = useState(false);

  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = y;
    dragCurrentY.current = y;
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (dragStartY.current === 0) return;
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragCurrentY.current = y;
    const dy = y - dragStartY.current;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    const dy = dragCurrentY.current - dragStartY.current;
    dragStartY.current = 0;
    if (dy > 80) {
      setClosing(true);
      setTimeout(onClose, 200);
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="bottom-sheet-backdrop" onMouseDown={onClose} onTouchEnd={onClose}>
      <div
        ref={sheetRef}
        className={`bottom-sheet${closing ? " closing" : ""}`}
        style={{ maxHeight }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div
          className="bottom-sheet-handle"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
        >
          <div className="bottom-sheet-handle-bar" />
        </div>
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </div>
  );
}
