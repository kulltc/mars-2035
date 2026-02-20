import React, { useEffect } from "react";
import { useGameStore } from "./state/store.js";
import { useMapSubscription } from "./hooks/useMapSubscription.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { fetchWorld, fetchPlayer, getMe } from "./api/client.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { MapCanvas } from "./components/MapCanvas.js";
import { TopBar } from "./components/TopBar.js";
import { BuildToolbar } from "./components/BuildToolbar.js";
import { BuildingDetail } from "./components/BuildingDetail.js";
import { WorkerDetail } from "./components/WorkerDetail.js";
import { Notifications } from "./components/Notifications.js";
import { ResourcePicker } from "./components/ResourcePicker.js";
import { TechTree } from "./components/TechTree.js";
import { MarketPanel } from "./components/MarketPanel.js";
import { WorkerListPanel } from "./components/WorkerListPanel.js";
import { TileDetail } from "./components/TileDetail.js";
import { MapSelector } from "./components/MapSelector.js";
import { TutorialChecklist } from "./components/TutorialChecklist.js";

export function App() {
  const setWorld = useGameStore((s) => s.setWorld);
  const setCurrentMap = useGameStore((s) => s.setCurrentMap);
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const world = useGameStore((s) => s.world);
  const events = useGameStore((s) => s.events);
  const token = useGameStore((s) => s.token);
  const logout = useGameStore((s) => s.logout);
  const showTechTree = useGameStore((s) => s.showTechTree);
  const showMarket = useGameStore((s) => s.showMarket);
  const showWorkers = useGameStore((s) => s.showWorkers);
  const showMapSelector = useGameStore((s) => s.showMapSelector);
  const showBuildSheet = useGameStore((s) => s.showBuildSheet);
  const toggleBuildSheet = useGameStore((s) => s.toggleBuildSheet);
  const isMobile = useIsMobile();

  // Connect to map via WS
  useMapSubscription();

  // Initialize
  useEffect(() => {
    fetchWorld().then((w) => {
      setWorld(w);
      setCurrentMap({ dx: 0, dy: 0, mx: 0, my: 0 });
    });
  }, [setWorld, setCurrentMap]);

  // Restore session from token
  useEffect(() => {
    if (!token) return;
    getMe()
      .then((data) => setPlayer(data.player))
      .catch(() => logout());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh player data on tick events
  useEffect(() => {
    if (!player || !token) return;
    fetchPlayer(player.entity_id).then(setPlayer).catch(() => {});
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!world) {
    return (
      <div className="login-screen">
        <div className="login-title">MARS 2035</div>
        <div className="login-subtitle" style={{ opacity: 0.5 }}>Connecting to server...</div>
      </div>
    );
  }

  if (!player) {
    return <LoginScreen />;
  }

  return (
    <div className={`game${isMobile ? " is-mobile" : ""}`}>
      <TopBar />
      <div className="game-main">
        <MapCanvas />
        <BuildingDetail />
        <TileDetail />
        <WorkerDetail />
        <ResourcePicker />
        {showMarket && <MarketPanel />}
        {showTechTree && <TechTree />}
        {showWorkers && <WorkerListPanel />}
        <TutorialChecklist />
      </div>
      {isMobile ? (
        <>
          {!showBuildSheet && (
            <button className="build-fab" onClick={toggleBuildSheet} title="Build">
              +
            </button>
          )}
          {showBuildSheet && <BuildToolbar />}
        </>
      ) : (
        <BuildToolbar />
      )}
      <Notifications />
      {showMapSelector && <MapSelector />}
    </div>
  );
}
