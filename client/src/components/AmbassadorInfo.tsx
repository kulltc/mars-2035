import React from "react";

interface AmbassadorInfoModalProps {
  onClose: () => void;
}

interface ProtectionActiveModalProps {
  onClose: () => void;
  countdown: string;
}

export function AmbassadorInfoContent() {
  return (
    <>
      <p className="tutorial-congrats-text">
        Your embassy lets you send an <strong>ambassador</strong> to a rival
        player's building. When the ambassador arrives, it compares your
        recent tax contributions with theirs.
      </p>
      <p className="tutorial-congrats-text">
        If your economy is stronger (higher tax revenue), the ambassador
        claims a percentage of the cash stored in the target building and
        carries it back to your embassy. If your economy is weaker, you
        pay them instead.
      </p>
      <p className="tutorial-congrats-text">
        Researching <strong>Foreign Affairs II</strong> and{" "}
        <strong>III</strong> raises the maximum claim from ±10% up to ±50%.
      </p>
    </>
  );
}

export function AmbassadorInfoModal({ onClose }: AmbassadorInfoModalProps) {
  return (
    <div className="tutorial-congrats-overlay" onClick={onClose}>
      <div className="tutorial-congrats" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-congrats-title">How Ambassadors Work</div>
        <AmbassadorInfoContent />
        <button className="btn btn-accent" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

export function ProtectionActiveModal({ onClose, countdown }: ProtectionActiveModalProps) {
  return (
    <div className="tutorial-congrats-overlay" onClick={onClose}>
      <div className="tutorial-congrats" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-congrats-title">🛡 Protection Active</div>
        <p className="tutorial-congrats-text">
          You're currently under protection from mission control. This means
          no taxes are collected from your colony and other players cannot
          send ambassadors to your buildings.
        </p>
        <p className="tutorial-congrats-text">
          Protection expires in <strong>{countdown}</strong>. Once it ends,
          you'll be subject to standard sector taxes and ambassador visits.
        </p>
        <AmbassadorInfoContent />
        <button className="btn btn-accent" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
