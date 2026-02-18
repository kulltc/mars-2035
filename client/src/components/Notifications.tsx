import React, { useEffect } from "react";
import { useGameStore } from "../state/store.js";

export function Notifications() {
  const notifications = useGameStore((s) => s.notifications);
  const dismissNotification = useGameStore((s) => s.dismissNotification);

  // Auto-dismiss
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const n of notifications) {
      if (n.duration > 0) {
        const remaining = n.duration - (Date.now() - n.createdAt);
        if (remaining > 0) {
          timers.push(setTimeout(() => dismissNotification(n.id), remaining));
        } else {
          dismissNotification(n.id);
        }
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [notifications, dismissNotification]);

  if (notifications.length === 0) return null;

  return (
    <div className="notifications">
      {notifications.map((n) => (
        <div key={n.id} className={`toast ${n.type}`}>
          <span className="toast-dot" />
          <span className="toast-text">{n.text}</span>
          <button className="toast-dismiss" onClick={() => dismissNotification(n.id)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
