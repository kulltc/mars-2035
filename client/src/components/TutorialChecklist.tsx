import React from "react";
import { useGameStore } from "../state/store.js";
import { submitCommand } from "../api/client.js";

const STEPS = [
  "Build an admin outpost",
  "Build a mine",
  "Build a trade center & set a route by holding and dragging from mine to trade center",
  "Sell at least 1 unit of material (make sure to enable the material for sale in the trade center UI)",
  "Ship money from trade center back to outpost",
];

export function TutorialChecklist() {
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const tutorialStep = useGameStore((s) => s.player?.tutorial_step);

  function handleDismissTutorial() {
    if (player) {
      setPlayer({ ...player, tutorial_step: undefined });
    }
    void submitCommand("dismiss_tutorial", {});
  }

  if (tutorialStep === undefined) return null;

  // Congratulations state
  if (tutorialStep === 6) {
    return (
      <div className="tutorial-congrats-overlay">
        <div className="tutorial-congrats">
          <div className="tutorial-congrats-title">Well done!</div>
          <p className="tutorial-congrats-text">
            You've completed your first cash cycle. Money is now flowing from
            mine → trade center → outpost. Keep expanding, but don't run out of cash! 
            Every building and worker costs upkeep, make sure they're worth it.
          </p>
          <button
            className="btn btn-accent"
            onClick={handleDismissTutorial}
          >
            Got it!
          </button>
        </div>
      </div>
    );
  }

  if (tutorialStep < 1 || tutorialStep > 5) return null;

  return (
    <div className="tutorial-checklist">
      <div className="tutorial-header">Tutorial</div>
      <ol className="tutorial-steps">
        {STEPS.map((text, i) => {
          const stepNum = i + 1;
          const done = stepNum < tutorialStep;
          const current = stepNum === tutorialStep;
          return (
            <li
              key={stepNum}
              className={`tutorial-step${done ? " done" : ""}${current ? " current" : ""}`}
            >
              <span className="tutorial-marker">
                {done ? "✓" : current ? "→" : " "}
              </span>
              {text}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
