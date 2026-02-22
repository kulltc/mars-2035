import React from "react";

interface BankruptModalProps {
  onStartOver: () => void;
}

export function BankruptModal({ onStartOver }: BankruptModalProps) {
  return (
    <div className="tutorial-congrats-overlay">
      <div className="tutorial-congrats" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-congrats-title" style={{ color: "var(--danger)" }}>
          Bankruptcy
        </div>
        <p className="tutorial-congrats-text">
          Your colony ran out of money and all buildings were lost.
          You went bankrupt.
        </p>
        <button className="btn btn-accent" onClick={onStartOver}>
          Start Over
        </button>
      </div>
    </div>
  );
}
