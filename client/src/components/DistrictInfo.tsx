import React, { useEffect } from "react";
import { useGameStore } from "../state/store.js";
import { fetchDistrict } from "../api/client.js";

export function DistrictInfo() {
  const currentMap = useGameStore((s) => s.currentMap);
  const district = useGameStore((s) => s.district);
  const setDistrict = useGameStore((s) => s.setDistrict);
  const events = useGameStore((s) => s.events);

  // Refresh district on tick events
  useEffect(() => {
    if (!currentMap) return;
    fetchDistrict(currentMap.dx, currentMap.dy).then(setDistrict);
  }, [currentMap, events.length, setDistrict]);

  if (!district) return null;

  const maxScore = Math.max(1, ...Object.values(district.influence_scores));

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>
        District ({district.district_id})
      </h3>
      <div>
        Owner: {district.owner_id ?? "None"}
        {district.contested && (
          <span style={{ color: "#e57373", marginLeft: 8 }}>CONTESTED</span>
        )}
      </div>

      {Object.keys(district.influence_scores).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Influence</div>
          {Object.entries(district.influence_scores)
            .sort(([, a], [, b]) => b - a)
            .map(([pid, score]) => (
              <div key={pid} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11 }}>
                  {pid}: {score}
                </div>
                <div
                  style={{
                    height: 6,
                    backgroundColor: "#0f3460",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(score / maxScore) * 100}%`,
                      backgroundColor: "#4fc3f7",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
};
