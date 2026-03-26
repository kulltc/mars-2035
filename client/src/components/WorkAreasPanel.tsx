import React, { useState } from "react";
import { useGameStore } from "../state/store.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { BottomSheet } from "./BottomSheet.js";
import { submitCommand } from "../api/client.js";

export const AREA_COLORS = [
  "#ef5350", "#ff9800", "#ffd54f", "#66bb6a",
  "#26c6da", "#42a5f5", "#ab47bc", "#ec407a",
];

export function WorkAreasPanel() {
  const isMobile = useIsMobile();
  const workAreas = useGameStore((s) => s.workAreas);
  const workers = useGameStore((s) => s.workers);
  const selectedAreaId = useGameStore((s) => s.selectedAreaId);
  const setSelectedAreaId = useGameStore((s) => s.setSelectedAreaId);
  const setWorkAreaDrawMode = useGameStore((s) => s.setWorkAreaDrawMode);
  const toggleWorkAreas = useGameStore((s) => s.toggleWorkAreas);
  const addNotification = useGameStore((s) => s.addNotification);
  const currentMap = useGameStore((s) => s.currentMap);
  const workAreaEditMode = useGameStore((s) => s.workAreaEditMode);
  const setWorkAreaEditMode = useGameStore((s) => s.setWorkAreaEditMode);
  const editingAreaId = useGameStore((s) => s.editingAreaId);
  const setEditingAreaId = useGameStore((s) => s.setEditingAreaId);
  const pendingAreaRects = useGameStore((s) => s.pendingAreaRects);
  const setPendingAreaRects = useGameStore((s) => s.setPendingAreaRects);

  // Local edit state
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(AREA_COLORS[0]);

  const getWorkerCount = (areaId: string) =>
    workers.filter((w) => w.work_area_id === areaId).length;

  const handleDelete = (areaId: string, areaName: string) => {
    if (!confirm(`Delete work area "${areaName}"? Workers assigned to it will be unassigned.`)) return;
    submitCommand("delete_work_area", { id: areaId }).then((res) => {
      if (res.error) {
        addNotification(`Delete failed: ${res.error}`, "error");
      } else {
        addNotification(`Work area deleted`, "warning");
        if (selectedAreaId === areaId) setSelectedAreaId(null);
      }
    });
  };

  const enterNewArea = () => {
    const usedColors = new Set(workAreas.map((a) => a.color));
    const nextColor = AREA_COLORS.find((c) => !usedColors.has(c)) ?? AREA_COLORS[workAreas.length % AREA_COLORS.length];
    setEditName(`Area ${workAreas.length + 1}`);
    setEditColor(nextColor);
    setEditingAreaId("__new__");
    setPendingAreaRects([]);
    setWorkAreaDrawMode(true);
  };

  const enterEditArea = (areaId: string) => {
    const area = workAreas.find((a) => a.id === areaId);
    if (!area) return;
    setEditName(area.name);
    setEditColor(area.color);
    setEditingAreaId(area.id);
    setPendingAreaRects([...area.rects]);
    setWorkAreaDrawMode(true);
  };

  const handleSave = () => {
    if (!editName.trim()) return;
    const mapKey = currentMap
      ? `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`
      : "";
    const id = editingAreaId === "__new__" ? `area_${Date.now()}` : editingAreaId!;
    submitCommand("upsert_work_area", {
      id,
      name: editName.trim(),
      map_key: mapKey,
      color: editColor,
      rects: pendingAreaRects,
    }).then((res) => {
      if (res.error) {
        addNotification(`Save failed: ${res.error}`, "error");
      } else {
        addNotification(`Work area saved`, "success");
        if (editingAreaId === "__new__") {
          // ensure panel is open
        }
      }
    });
    cancelEdit();
  };

  const cancelEdit = () => {
    setEditingAreaId(null);
    setPendingAreaRects([]);
    setWorkAreaDrawMode(false);
  };

  const isEditing = editingAreaId !== null;

  // ── Editing mode ──
  const editingContent = (
    <div
      className={isMobile ? "worker-detail mobile" : "worker-detail"}
      style={isMobile ? undefined : {
        bottom: 8,
        left: 8,
        right: "auto",
        maxWidth: 280,
        minWidth: 240,
      }}
    >
      <div className="wd-header">
        <strong>{editingAreaId === "__new__" ? "New Work Area" : "Edit Work Area"}</strong>
        <button className="wd-close" onClick={cancelEdit}>&times;</button>
      </div>

      {/* Name input */}
      <div style={{ marginBottom: 8 }}>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Area name"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--bg-input, rgba(255,255,255,0.06))",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 13,
            padding: "5px 8px",
          }}
        />
      </div>

      {/* Color picker */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Color</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {AREA_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setEditColor(c)}
              style={{
                width: 18, height: 18, borderRadius: "50%",
                background: c,
                border: editColor === c ? "2px solid #fff" : "2px solid transparent",
                cursor: "pointer", padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Draw mode toggle */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Draw mode</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn btn-sm"
            style={{
              flex: 1,
              background: workAreaEditMode === "add" ? "rgba(79,195,247,0.25)" : undefined,
              border: workAreaEditMode === "add" ? "1px solid #4fc3f7" : undefined,
            }}
            onClick={() => setWorkAreaEditMode("add")}
          >
            + Add
          </button>
          <button
            className="btn btn-sm"
            style={{
              flex: 1,
              background: workAreaEditMode === "sub" ? "rgba(239,83,80,0.25)" : undefined,
              border: workAreaEditMode === "sub" ? "1px solid #ef5350" : undefined,
            }}
            onClick={() => setWorkAreaEditMode("sub")}
          >
            - Remove
          </button>
        </div>
      </div>

      {/* Rect count + clear */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {pendingAreaRects.length} rect{pendingAreaRects.length !== 1 ? "s" : ""} drawn
        </span>
        <button
          className="btn btn-sm"
          style={{ fontSize: 11 }}
          onClick={() => setPendingAreaRects([])}
        >
          Clear
        </button>
      </div>

      {/* Save / Cancel */}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" style={{ flex: 1 }} onClick={cancelEdit}>
          Cancel
        </button>
        <button
          className="btn btn-accent btn-sm"
          style={{ flex: 1 }}
          disabled={!editName.trim()}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );

  // ── List mode ──
  const listContent = (
    <div
      className={isMobile ? "worker-detail mobile" : "worker-detail"}
      style={isMobile ? undefined : {
        bottom: 8,
        left: 8,
        right: "auto",
        maxWidth: 260,
        minWidth: 220,
      }}
    >
      <div className="wd-header">
        <strong>Work Areas</strong>
        <button className="wd-close" onClick={toggleWorkAreas}>&times;</button>
      </div>

      <button
        className="btn btn-accent btn-sm"
        style={{ width: "100%", marginBottom: 8 }}
        onClick={enterNewArea}
      >
        + New Area
      </button>

      {workAreas.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "4px 0" }}>
          No areas yet. Click New Area to draw one.
        </div>
      ) : (
        <div>
          {workAreas.map((area) => {
            const count = getWorkerCount(area.id);
            const isSelected = selectedAreaId === area.id;
            return (
              <div
                key={area.id}
                onClick={() => setSelectedAreaId(isSelected ? null : area.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px",
                  marginBottom: 2,
                  borderRadius: 4,
                  cursor: "pointer",
                  background: isSelected ? "rgba(255,255,255,0.06)" : "transparent",
                  border: isSelected ? `1px solid ${area.color}40` : "1px solid transparent",
                }}
              >
                {/* Color dot */}
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: area.color,
                  flexShrink: 0,
                }} />
                {/* Name */}
                <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {area.name}
                </span>
                {/* Worker count */}
                {count > 0 && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)", background: "rgba(255,255,255,0.08)", borderRadius: 3, padding: "1px 4px" }}>
                    {count}w
                  </span>
                )}
                {/* Edit button */}
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 10, padding: "1px 5px", opacity: 0.8, lineHeight: 1.4 }}
                  onClick={(e) => { e.stopPropagation(); enterEditArea(area.id); }}
                  title="Edit area"
                >
                  Edit
                </button>
                {/* Delete button */}
                <button
                  className="wd-close"
                  style={{ fontSize: 12, opacity: 0.6, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(area.id, area.name); }}
                  title="Delete area"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    if (isEditing) {
      // No backdrop in draw mode — user needs to touch the map canvas
      return (
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 41,
          background: "var(--bg-panel-solid)",
          borderTop: "1px solid var(--border-bright)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
          padding: "8px 12px 12px",
          maxHeight: "50vh",
          overflowY: "auto",
        }}>
          {editingContent}
        </div>
      );
    }
    return <BottomSheet onClose={toggleWorkAreas} maxHeight="60vh">{listContent}</BottomSheet>;
  }
  return isEditing ? editingContent : listContent;
}
