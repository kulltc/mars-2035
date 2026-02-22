import React from "react";

export function ConnectionLostModal() {
  return (
    <div className="tutorial-congrats-overlay">
      <div className="tutorial-congrats">
        <div className="tutorial-congrats-title">Connection Lost</div>
        <p className="tutorial-congrats-text">
          Lost connection to the server. Attempting to reconnect...
        </p>
        <button
          className="btn btn-accent"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
