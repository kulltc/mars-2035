import React, { useEffect, useRef, useState } from "react";
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
import { SectorWelcomeModal } from "./components/SectorWelcomeModal.js";
import { TaxPanel } from "./components/TaxPanel.js";
import { ProtectionEndedModal } from "./components/ProtectionEndedModal.js";
import { BankruptModal } from "./components/BankruptModal.js";

export function App() {
  const setWorld = useGameStore((s) => s.setWorld);
  const currentMap = useGameStore((s) => s.currentMap);
  const setCurrentMap = useGameStore((s) => s.setCurrentMap);
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const world = useGameStore((s) => s.world);
  const tiles = useGameStore((s) => s.tiles);
  const events = useGameStore((s) => s.events);
  const token = useGameStore((s) => s.token);
  const logout = useGameStore((s) => s.logout);
  const showTechTree = useGameStore((s) => s.showTechTree);
  const showMarket = useGameStore((s) => s.showMarket);
  const showWorkers = useGameStore((s) => s.showWorkers);
  const showMapSelector = useGameStore((s) => s.showMapSelector);
  const showTaxPanel = useGameStore((s) => s.showTaxPanel);
  const showProtectionEndedModal = useGameStore((s) => s.showProtectionEndedModal);
  const closeProtectionEndedModal = useGameStore((s) => s.closeProtectionEndedModal);
  const showBankruptModal = useGameStore((s) => s.showBankruptModal);
  const openBankruptModal = useGameStore((s) => s.openBankruptModal);
  const closeBankruptModal = useGameStore((s) => s.closeBankruptModal);
  const showBuildSheet = useGameStore((s) => s.showBuildSheet);
  const toggleBuildSheet = useGameStore((s) => s.toggleBuildSheet);
  const isMobile = useIsMobile();
  const [showSectorWelcome, setShowSectorWelcome] = useState(false);

  const prevPlayerIdRef = useRef<string | null>(null);
  const prevMapAccountCountRef = useRef<number>(0);

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

  useEffect(() => {
    if (!player) {
      prevPlayerIdRef.current = null;
      prevMapAccountCountRef.current = 0;
      setShowSectorWelcome(false);
      return;
    }

    const mapAccountCount = Object.keys(player.map_accounts ?? {}).length;
    const isIntroState = player.tutorial_step === 1 && mapAccountCount === 0;
    const samePlayer = prevPlayerIdRef.current === player.entity_id;
    const switchedPlayer = prevPlayerIdRef.current !== player.entity_id;
    const justForfeited =
      samePlayer &&
      prevMapAccountCountRef.current > 0 &&
      mapAccountCount === 0 &&
      player.tutorial_step === 1;

    if (isIntroState && (switchedPlayer || justForfeited)) {
      setShowSectorWelcome(true);
    }

    prevPlayerIdRef.current = player.entity_id;
    prevMapAccountCountRef.current = mapAccountCount;
  }, [player]);

  // Show bankrupt modal when player is flagged bankrupt
  useEffect(() => {
    if (player?.bankrupt) {
      openBankruptModal();
    }
  }, [player?.bankrupt]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {showTaxPanel && <TaxPanel />}
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
      {showSectorWelcome && world && currentMap && (
        <SectorWelcomeModal
          world={world}
          currentMap={currentMap}
          tiles={tiles}
          onClose={() => setShowSectorWelcome(false)}
        />
      )}
      {showProtectionEndedModal && (
        <ProtectionEndedModal onClose={closeProtectionEndedModal} />
      )}
      {showBankruptModal && (
        <BankruptModal onStartOver={() => {
          closeBankruptModal();
          if (player) {
            setPlayer({ ...player, bankrupt: undefined });
          }
        }} />
      )}
    </div>
  );
}
