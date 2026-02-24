import React from "react";
import { AmbassadorInfoContent } from "./AmbassadorInfo.js";

interface ProtectionEndedModalProps {
  onClose: () => void;
}

export function ProtectionEndedModal({ onClose }: ProtectionEndedModalProps) {
  return (
    <div className="tutorial-congrats-overlay" onClick={onClose}>
      <div className="tutorial-congrats" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-congrats-title">Protection Window Closed</div>
        <p className="tutorial-congrats-text">
          Mission control has lifted your tax shield. From this tick onward,
          your colonies are subject to standard sector taxes.
        </p>
        <p className="tutorial-congrats-text">
          Other players can now send <strong>ambassadors</strong> to your
          buildings — and you can do the same to theirs.
        </p>
        <AmbassadorInfoContent />
        <button className="btn btn-accent" onClick={onClose}>
          Acknowledged
        </button>
      </div>
    </div>
  );
}
