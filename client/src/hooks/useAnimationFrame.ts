import { useEffect, useState } from "react";

/**
 * Triggers re-renders at ~30fps via requestAnimationFrame.
 * Returns a frame counter that increments each rendered frame.
 */
export function useAnimationFrame(): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let id: number;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 33) { // ~30fps
        last = now;
        setFrame((f) => f + 1);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  return frame;
}
