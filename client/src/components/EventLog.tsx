import React, { useEffect, useRef } from "react";
import { useGameStore } from "../state/store.js";

export function EventLog() {
  const events = useGameStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Event Log</h3>
      <div
        ref={scrollRef}
        style={{
          maxHeight: 200,
          overflowY: "auto",
          fontSize: 11,
          fontFamily: "monospace",
        }}
      >
        {events.length === 0 && (
          <div style={{ color: "#666" }}>No events yet</div>
        )}
        {events.map((evt) => (
          <div
            key={evt.seq}
            style={{
              padding: "2px 0",
              borderBottom: "1px solid #1a1a2e",
              color: getEventColor(evt.type),
            }}
          >
            <span style={{ color: "#666" }}>T{evt.tick} </span>
            <span>{evt.type}</span>
            <span style={{ color: "#888", marginLeft: 6 }}>
              {formatEventData(evt.type, evt.data)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getEventColor(type: string): string {
  switch (type) {
    case "production": return "#81c784";
    case "building_placed": return "#4fc3f7";
    case "upkeep_charged": return "#ffb74d";
    case "building_suspended": return "#e57373";
    case "tax_charged": return "#ba68c8";
    case "transfer": return "#90caf9";
    case "export": return "#a5d6a7";
    default: return "#e0e0e0";
  }
}

function formatEventData(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "production":
      return `+${(data.amount as number).toFixed(1)} ${data.material}`;
    case "building_placed":
      return `${data.building_class}`;
    case "upkeep_charged":
      return `-${data.amount} money`;
    case "tax_charged":
      return `-${(data.amount as number).toFixed(1)} money`;
    case "transfer":
      return `${data.direction} ${data.material} x${data.amount}`;
    case "export":
      return `${data.material} x${data.amount}`;
    case "tick_complete":
      return `tick ${data.tick}`;
    default:
      return JSON.stringify(data).slice(0, 60);
  }
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
};
