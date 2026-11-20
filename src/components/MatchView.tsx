import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Heart, MessageCircle, Play, Shield, Sparkles, X } from 'lucide-react';
import { ROLE_LABELS } from '../engine/formations';
import { MatchEngine } from '../engine/MatchEngine';
import { soundEngine } from '../engine/soundEngine';
import { MatchViewport } from '../scene/MatchViewport';
import {
  buildClubPresetFromFm2,
  extractFm2ResultFromSnapshot,
  resolveKitColors,
  syncEngineTacticsToFm2Settings,
} from '../services/matchEngineBridge';
import { getBenchSizeForCompetition, world } from '../services/worldManager';
import { useMatchStore } from '../stores/matchStore';
import {
  Club,
  Fixture,
  MatchEvent as Fm2MatchEvent,
  Player,
  PlayerMatchStats,
  Tactic,
  TacticSettings,
} from '../types';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  LightingMood,
  MatchSnapshot,
  PlayerInstruction,
  PlayerIntent,
  ShoutType,
  TeamSide,
  TeamTactics,
  VisualLayers,
} from '../types/match';
import { CommentaryTab } from './CommentaryTab';
import { DebugLogTab } from './DebugLogTab';
import { FmSidebar } from './FmSidebar';
import { SquadBenchTab } from './SquadBenchTab';
import { StatsAnalyticsTab } from './StatsAnalyticsTab';
import { TacticalBoardTab } from './TacticalBoardTab';
import { FmView, TopScoreboard } from './TopScoreboard';

interface MatchViewProps {
  homeTeam: Club;
  awayTeam: Club;
  homePlayers: Player[];
  awayPlayers: Player[];
  onFinish: (
    homeScore: number,
    awayScore: number,
    matchStats: Record<string, PlayerMatchStats>,
    events: Fm2MatchEvent[],
    penalties?: { penaltyHome: number; penaltyAway: number }
  ) => void;
  currentDate: Date;
  userClubId: string;
  fixture?: Fixture;
  tacticOverride?: Tactic;
  settingsOverride?: TacticSettings;
  isNationalMatch?: boolean;
}

const INTENT_LABELS: Record<PlayerIntent, string> = {
  posicional: 'Equilibrio táctico',
  apoyo_corto: 'Apoyo en corto',
  desmarque_ruptura: 'Ruptura curva al espacio',
  amplitud: 'Dando amplitud / Doblaje',
  pared: 'Pared ofensiva',
  llegada_area: 'Llegando al área',
  arrastre: 'Desmarque de arrastre',
  controlando: 'Amortiguando / Control',
  escaneando: 'Parado / Leyendo opciones',
  conduccion: 'Conduciendo al espacio',
  temporizacion_ofensiva: 'Pausa / Protegiendo balón',
  temporizando: 'Temporizando 1v1',
  presion: 'Arco de presión',
  cobertura: 'Cobertura / Línea de pase',
  marcaje: 'Marcaje cercano',
  repliegue: 'Repliegue en embudo',
  salto_aereo: 'Disputa aérea',
  entrada: 'Entrada al suelo',
  desequilibrio: 'Recuperando equilibrio',
  portero: 'Vigilancia portería',
  portero_libero: 'Salida de portero líbero',
};

const VIEW_TITLES: Record<FmView, string> = {
  pitch: 'Campo 2D',
  stats_resumen: 'Estadísticas',
  stats_mapas: 'Zonas y Mapas de Acción',
  stats_boxscore: 'Box Score Individual y Notas',
  pizarra: 'Pizarra Táctica e Instrucciones',
  banquillo: 'Plantilla y Sustituciones',
  cronica: 'Crónica del Partido',
  log: 'Telemetría y Log Copiable',
};

export const MatchView: React.FC<MatchViewProps> = ({
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  onFinish,
  currentDate,
  userClubId,
  fixture,
  tacticOverride,
  settingsOverride,
  isNationalMatch = false,
}) => {
  const userSide: TeamSide = userClubId === homeTeam.id ? 'home' : 'away';
  const competitionObj = fixture
    ? world.competitions.find((c) => c.id === fixture.competitionId) ?? null
    : null;
  const benchLimit = isNationalMatch ? 12 : getBenchSizeForCompetition(competitionObj);
  const maxSubs = 5;
  const isKnockout = Boolean(
    fixture &&
      ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'].includes(
        fixture.stage
      )
  );

  // Build authoritative MatchEngine instance directly from FM2 clubs/national teams, players (1-20), and active tactic
  const engineRef = useRef<MatchEngine>(null as unknown as MatchEngine);
  if (!engineRef.current) {
    const userTactic = tacticOverride || world.getActiveTactic();
    const { homeColors, awayColors } = resolveKitColors(homeTeam, awayTeam);

    const homePreset = buildClubPresetFromFm2(
      homeTeam,
      homePlayers,
      homeColors,
      userSide === 'home' ? userTactic : undefined,
      userSide === 'home' ? settingsOverride : undefined,
      benchLimit
    );
    const awayPreset = buildClubPresetFromFm2(
      awayTeam,
      awayPlayers,
      awayColors,
      userSide === 'away' ? userTactic : undefined,
      userSide === 'away' ? settingsOverride : undefined,
      benchLimit
    );

    const eng = new MatchEngine(homePreset, awayPreset);
    eng.maxSubs = maxSubs;
    eng.aiControlledSides = {
      home: userSide !== 'home',
      away: userSide !== 'away',
    };
    engineRef.current = eng;
  }

  const [snapshot, setSnapshot] = useState<MatchSnapshot>(() => engineRef.current!.getSnapshot());
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInstantSimulating, setIsInstantSimulating] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(() => {
    const pref = world.matchSettings?.speedMultiplier;
    return pref === 1 || pref === 2 || pref === 4 ? pref : 2;
  });
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [activeView, setActiveView] = useState<FmView>('pitch');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [lightingMood] = useState<LightingMood>('dusk');
  const [showHalfTimeTalk, setShowHalfTimeTalk] = useState(false);
  const [halfTimeTalkDone, setHalfTimeTalkDone] = useState(false);
  const [finishedOnce, setFinishedOnce] = useState(false);

  const instantRafRef = useRef<number | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const halfTimeTriggeredRef = useRef(false);

  const [visualLayers, setVisualLayers] = useState<VisualLayers>({
    offsideLine: false,
    passNetwork: false,
    tacticalZones: false,
    playerNames: true,
  });

  const syncNow = useCallback(() => {
    if (engineRef.current) {
      setSnapshot(engineRef.current.getSnapshot());
    }
  }, []);

  const cancelInstantSim = useCallback(() => {
    if (instantRafRef.current !== null) {
      cancelAnimationFrame(instantRafRef.current);
      instantRafRef.current = null;
    }
    setIsInstantSimulating(false);
    soundEngine.setEnabled(soundEnabledRef.current);
  }, []);

  // Respect world.matchSettings.pauseAtHalftime when first half finishes (during live play)
  useEffect(() => {
    if (
      snapshot.phase === 'half_time' &&
      !isInstantSimulating &&
      !halfTimeTriggeredRef.current
    ) {
      halfTimeTriggeredRef.current = true;
      if (world.matchSettings?.pauseAtHalftime === false) {
        engineRef.current?.startSecondHalf();
        setIsPlaying(true);
        syncNow();
      } else {
        setIsPlaying(false);
        setShowHalfTimeTalk(true);
      }
    }
  }, [snapshot.phase, isInstantSimulating, syncNow]);

  // Authoritative simulation RAF loop
  useEffect(() => {
    if (!isPlaying || isInstantSimulating) return;

    let frameId = 0;
    let lastTime = performance.now();
    let hudAccumulator = 0;
    let lastPhase = engineRef.current!.phase;

    const tick = () => {
      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const eng = engineRef.current!;
      eng.step(rawDt, speedMultiplier);

      hudAccumulator += rawDt;
      if (hudAccumulator >= 0.1 || eng.phase !== lastPhase) {
        hudAccumulator = 0;
        lastPhase = eng.phase;
        setSnapshot(eng.getSnapshot());
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isInstantSimulating, speedMultiplier]);

  useEffect(() => {
    return () => {
      if (instantRafRef.current !== null) {
        cancelAnimationFrame(instantRafRef.current);
      }
      soundEngine.setEnabled(false);
    };
  }, []);

  const handleStartMatchKickoff = useCallback(() => {
    if (isInstantSimulating) return;
    setHasStarted(true);
    setIsPlaying(true);
  }, [isInstantSimulating]);

  const handleTogglePlay = useCallback(() => {
    if (isInstantSimulating) return;
    setHasStarted(true);
    setIsPlaying((prev) => !prev);
  }, [isInstantSimulating]);

  const handleStartSecondHalf = useCallback(() => {
    if (isInstantSimulating || !engineRef.current) return;
    setShowHalfTimeTalk(false);
    engineRef.current.startSecondHalf();
    setIsPlaying(true);
    syncNow();
  }, [isInstantSimulating, syncNow]);

  const handleApplyHalfTimeTalk = useCallback(
    (
      moraleDelta: number,
      staminaDelta: number,
      title: string,
      description: string,
      startImmediately: boolean
    ) => {
      const eng = engineRef.current;
      if (!eng) return;

      eng.applyTeamTalk(userSide, moraleDelta, staminaDelta, title, description);

      // Sync morale impact back to FM2 player records as well
      const userSquad = userSide === 'home' ? homePlayers : awayPlayers;
      userSquad.forEach((p) => {
        p.morale = Math.max(10, Math.min(100, (p.morale ?? 75) + moraleDelta));
      });

      setHalfTimeTalkDone(true);
      setShowHalfTimeTalk(false);
      if (startImmediately) {
        eng.startSecondHalf();
        setIsPlaying(true);
      }
      syncNow();
    },
    [awayPlayers, homePlayers, syncNow, userSide]
  );

  const handleInstantResult = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || eng.phase === 'full_time' || isInstantSimulating) return;

    cancelInstantSim();
    const assistantStaff = !isNationalMatch
      ? world.staff.find((s) => s.clubId === userClubId && s.role === 'ASSISTANT_MANAGER')
      : undefined;
    eng.delegateInstantControl(userSide, assistantStaff?.name || 'Ayudante de Campo');

    setShowHalfTimeTalk(false);
    setHasStarted(true);
    setIsPlaying(false);
    setIsInstantSimulating(true);
    soundEngine.setEnabled(false);

    const runBurstFrame = () => {
      const frameStart = performance.now();
      const frameBudgetMs = 20;
      let stepsThisFrame = 0;

      while (
        eng.phase !== 'full_time' &&
        stepsThisFrame < 95 &&
        performance.now() - frameStart < frameBudgetMs
      ) {
        if (eng.phase === 'half_time') {
          eng.startSecondHalf();
        }
        eng.step(0.05, 4);
        stepsThisFrame++;
      }

      setSnapshot(eng.getSnapshot());

      if (eng.phase === 'full_time') {
        instantRafRef.current = null;
        setIsInstantSimulating(false);
        soundEngine.setEnabled(soundEnabledRef.current);
        return;
      }

      instantRafRef.current = requestAnimationFrame(runBurstFrame);
    };

    instantRafRef.current = requestAnimationFrame(runBurstFrame);
  }, [cancelInstantSim, isInstantSimulating, isNationalMatch, userClubId, userSide]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundEngine.setEnabled(next);
      return next;
    });
  }, []);

  const handleUpdateTactics = useCallback(
    (partial: Partial<TeamTactics>) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.updateTeamTactics(userSide, partial);
      const updated = userSide === 'home' ? eng.homeTactics : eng.awayTactics;
      // Sync live tactical tweaks back to FM2's active tactic settings
      const targetTactic = tacticOverride || world.getActiveTactic();
      if (!isNationalMatch) {
        syncEngineTacticsToFm2Settings(updated, targetTactic);
      }
      syncNow();
    },
    [isNationalMatch, syncNow, tacticOverride, userSide]
  );

  const handleUpdateInstruction = useCallback(
    (playerId: string, instruction: PlayerInstruction) => {
      engineRef.current?.updatePlayerInstruction(playerId, instruction);
      syncNow();
    },
    [syncNow]
  );

  const handleSwapSlots = useCallback(
    (aId: string, bId: string) => {
      engineRef.current?.swapTeamSlots(userSide, aId, bId);
      syncNow();
    },
    [syncNow, userSide]
  );

  const handleSubstitute = useCallback(
    (outId: string, inId: string) => {
      engineRef.current?.makeSubstitution(userSide, outId, inId);
      syncNow();
    },
    [syncNow, userSide]
  );

  const handleShout = useCallback(
    (shout: ShoutType) => {
      engineRef.current?.triggerShout(shout, userSide);
      syncNow();
    },
    [syncNow, userSide]
  );

  const handleToggleLayer = useCallback((key: keyof VisualLayers) => {
    setVisualLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleFinishMatch = useCallback(() => {
    if (finishedOnce || !engineRef.current) return;
    setFinishedOnce(true);
    cancelInstantSim();
    soundEngine.setEnabled(false);

    const finalSnap = engineRef.current.getSnapshot();
    const extracted = extractFm2ResultFromSnapshot(
      finalSnap,
      homeTeam.id,
      awayTeam.id,
      userSide,
      {
        fixtureId: fixture?.id,
        competitionId: fixture?.competitionId,
        date: currentDate,
        allowPenalties: isKnockout,
      }
    );

    // Store full Opta Match Report in FM2 matchStore so PostMatchSummaryView renders all maps & analytics
    useMatchStore.getState().setLastOptaReport(extracted.optaReport);

    const penalties =
      extracted.penaltyHome !== undefined && extracted.penaltyAway !== undefined
        ? { penaltyHome: extracted.penaltyHome, penaltyAway: extracted.penaltyAway }
        : undefined;

    onFinish(
      extracted.homeScore,
      extracted.awayScore,
      extracted.stats,
      extracted.events,
      penalties
    );
  }, [
    awayTeam.id,
    cancelInstantSim,
    currentDate,
    finishedOnce,
    fixture?.competitionId,
    fixture?.id,
    homeTeam.id,
    isKnockout,
    onFinish,
    userSide,
  ]);

  // Auto-advance straight into the Post-Match Summary screen once the match finishes
  useEffect(() => {
    if (snapshot.phase !== 'full_time' || finishedOnce) return;
    const timer = window.setTimeout(() => {
      handleFinishMatch();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [snapshot.phase, finishedOnce, handleFinishMatch]);

  // Keyboard shortcut: Space to pause/resume
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space' && !showHalfTimeTalk && !isInstantSimulating) {
        e.preventDefault();
        if (snapshot.phase === 'half_time') {
          handleStartSecondHalf();
        } else if (snapshot.phase !== 'full_time') {
          handleTogglePlay();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleStartSecondHalf,
    handleTogglePlay,
    isInstantSimulating,
    showHalfTimeTalk,
    snapshot.phase,
  ]);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return (
      snapshot.homePlayers.find((p) => p.id === selectedPlayerId) ||
      snapshot.awayPlayers.find((p) => p.id === selectedPlayerId) ||
      null
    );
  }, [selectedPlayerId, snapshot.awayPlayers, snapshot.homePlayers]);

  const latestEvent = snapshot.events[0] || null;
  const userScore = userSide === 'home' ? snapshot.homeScore : snapshot.awayScore;
  const oppScore = userSide === 'home' ? snapshot.awayScore : snapshot.homeScore;

  return (
    <div className="h-full w-full flex flex-col bg-[#1b1f23] overflow-hidden select-none">
      {/* Top Broadcast Scoreboard & FM08 Silver Ribbon */}
      <TopScoreboard
        snapshot={snapshot}
        userSide={userSide}
        hasStarted={hasStarted}
        isPlaying={isPlaying}
        isInstantSimulating={isInstantSimulating}
        onTogglePlay={handleTogglePlay}
        onStartSecondHalf={handleStartSecondHalf}
        onInstantResult={handleInstantResult}
        speedMultiplier={speedMultiplier}
        onChangeSpeed={setSpeedMultiplier}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        activeView={activeView}
        onSelectView={setActiveView}
        onFinishMatch={handleFinishMatch}
        onOpenHalfTimeTalk={
          snapshot.phase === 'half_time' ? () => setShowHalfTimeTalk(true) : undefined
        }
      />

      {/* Main Workspace: Left FM08 Sidebar + Right Active Stage */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {sidebarOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed lg:static inset-y-0 left-0 z-40 lg:z-auto h-full">
              <FmSidebar
                snapshot={snapshot}
                userSide={userSide}
                activeView={activeView}
                onSelectView={setActiveView}
                hasStarted={hasStarted}
                isPlaying={isPlaying}
                isInstantSimulating={isInstantSimulating}
                onTogglePlay={handleTogglePlay}
                onStartSecondHalf={handleStartSecondHalf}
                onInstantResult={handleInstantResult}
                speedMultiplier={speedMultiplier}
                onChangeSpeed={setSpeedMultiplier}
                onUpdateTactics={handleUpdateTactics}
                onShout={handleShout}
                visualLayers={visualLayers}
                onToggleLayer={handleToggleLayer}
                onFinishMatch={handleFinishMatch}
                onOpenHalfTimeTalk={
                  snapshot.phase === 'half_time' ? () => setShowHalfTimeTalk(true) : undefined
                }
                onCloseMobile={() => setSidebarOpen(false)}
              />
            </div>
          </>
        )}

        {/* Right Stage */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col relative bg-[#101418] overflow-hidden">
          {activeView === 'pitch' ? (
            <div className="flex-1 min-h-0 relative flex flex-col">
              {/* 2D/3D Pitch Canvas */}
              <div className="flex-1 min-h-0 relative">
                <MatchViewport
                  engineRef={engineRef}
                  visualLayers={visualLayers}
                  lightingMood={lightingMood}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={setSelectedPlayerId}
                  matchRevision={0}
                />

                {/* Pre-Kickoff FM08 Iniciar Overlay */}
                {!hasStarted && !isInstantSimulating && snapshot.phase === 'first_half' && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 pointer-events-none p-4">
                    <div className="pointer-events-auto bg-[#1b1f23]/95 border border-[#6e7680] rounded-sm shadow-2xl px-4 py-3.5 sm:px-6 sm:py-4 flex flex-col items-center gap-2.5 max-w-xs w-full text-center">
                      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#facc15]">
                        {snapshot.homeClub.stadiumName}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white leading-tight">
                        {snapshot.homeClub.name} vs {snapshot.awayClub.name}
                      </div>
                      <button
                        type="button"
                        onClick={handleStartMatchKickoff}
                        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-[2px] border border-[#0f2410] bg-gradient-to-b from-[#3b7a3d] via-[#2b5d2c] to-[#1a3d1b] text-white hover:brightness-110 active:translate-y-px shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_6px_rgba(0,0,0,0.65)] text-xs sm:text-sm font-extrabold uppercase tracking-wider cursor-pointer transition-all"
                      >
                        <Play className="w-4 h-4 fill-current text-[#facc15]" />
                        <span>Iniciar Partido</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Event Banner */}
                {snapshot.lastBannerEvent && (
                  <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] sm:max-w-md px-3.5 py-1.5 rounded bg-[#0c1015]/92 border border-amber-400/50 text-center shadow-lg">
                    <div className="text-xs font-bold text-amber-300 tracking-wide">
                      {snapshot.lastBannerEvent.minute}&apos; · {snapshot.lastBannerEvent.title}
                    </div>
                    <div className="text-[11px] text-slate-200 truncate">
                      {snapshot.lastBannerEvent.description}
                    </div>
                  </div>
                )}

                {/* Selected Player Quick Telemetry Card */}
                {selectedPlayer && (
                  <div className="absolute top-3 right-3 z-20 w-64 rounded-lg bg-[#0d1218]/94 border border-slate-700/90 p-2.5 text-xs text-slate-100 shadow-xl">
                    <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          #{selectedPlayer.number} {selectedPlayer.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {ROLE_LABELS[selectedPlayer.assignedRole]} ·{' '}
                          {INTENT_LABELS[selectedPlayer.intent]}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPlayerId(null)}
                        className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                        aria-label="Cerrar ficha de jugador"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 pt-1.5 font-mono text-[11px] tabular-nums">
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">Nota</span>
                        <span className="text-emerald-400 font-bold">
                          {selectedPlayer.rating.toFixed(1)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">Físico</span>
                        <span>{Math.round(selectedPlayer.stamina)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9.5px]">Pases</span>
                        <span>
                          {selectedPlayer.passesCompleted}/{selectedPlayer.passesAttempted}
                        </span>
                      </div>
                    </div>
                    {/* Mini 12x8 heatmap strip */}
                    <div className="mt-2 grid grid-cols-12 gap-[1px] bg-slate-900 p-0.5 rounded border border-slate-800">
                      {selectedPlayer.heatmap.slice(0, HEATMAP_COLS * HEATMAP_ROWS).map((v, i) => {
                        const maxV = Math.max(1, ...selectedPlayer.heatmap);
                        const alpha = v > 0 ? 0.18 + (v / maxV) * 0.82 : 0.05;
                        return (
                          <div
                            key={i}
                            className="h-1.5 rounded-[1px]"
                            style={{ backgroundColor: `rgba(16, 185, 129, ${alpha})` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Live Commentary Ticker Strip */}
              <div className="h-8 shrink-0 bg-[#1a2026] border-t border-[#2c343d] px-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-amber-400 tabular-nums shrink-0">
                    {latestEvent ? `${latestEvent.minute}'` : "0'"}
                  </span>
                  <span className="text-slate-200 truncate">
                    {latestEvent
                      ? `${latestEvent.title} — ${latestEvent.description}`
                      : !hasStarted
                      ? `Equipos listos en ${snapshot.homeClub.stadiumName}. Presioná "Iniciar Partido" para comenzar.`
                      : `Partido en curso en ${snapshot.homeClub.stadiumName}.`}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-3 font-mono text-[11px] text-slate-300 tabular-nums shrink-0">
                  <span>
                    Pos {Math.round(snapshot.homeStats.possessionPct)}% -{' '}
                    {Math.round(snapshot.awayStats.possessionPct)}%
                  </span>
                  <span>
                    xG {snapshot.homeStats.xg.toFixed(2)} - {snapshot.awayStats.xg.toFixed(2)}
                  </span>
                  <span>
                    Tiros {snapshot.homeStats.shots} - {snapshot.awayStats.shots}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-[#0f141a] text-slate-100 overflow-hidden">
              {/* Sub-view header bar */}
              <div className="h-10 shrink-0 px-4 bg-[#171d24] border-b border-slate-800 flex items-center justify-between gap-3">
                <div className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                  {VIEW_TITLES[activeView]}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {snapshot.phase === 'full_time' && (
                    <button
                      onClick={handleFinishMatch}
                      className="px-3 py-1 rounded bg-[#1f5922] hover:bg-[#174619] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      Ir al Resumen
                    </button>
                  )}
                  <button
                    onClick={() => setActiveView('pitch')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    Volver al Campo 2D
                  </button>
                </div>
              </div>

              {/* Scrollable View Body */}
              <div className="flex-1 min-h-0 overflow-y-auto tactical-scroll p-3 sm:p-4">
                {activeView.startsWith('stats_') && (
                  <StatsAnalyticsTab
                    snapshot={snapshot}
                    selectedPlayerId={selectedPlayerId}
                    onSelectPlayer={setSelectedPlayerId}
                    requestedSubTab={
                      activeView === 'stats_mapas'
                        ? 'mapas'
                        : activeView === 'stats_boxscore'
                        ? 'boxscore'
                        : 'resumen'
                    }
                  />
                )}
                {activeView === 'pizarra' && (
                  <TacticalBoardTab
                    snapshot={snapshot}
                    userSide={userSide}
                    onUpdateTactics={handleUpdateTactics}
                    onUpdateInstruction={handleUpdateInstruction}
                    onSwapSlots={handleSwapSlots}
                    visualLayers={visualLayers}
                    onToggleLayer={handleToggleLayer}
                  />
                )}
                {activeView === 'banquillo' && (
                  <SquadBenchTab
                    snapshot={snapshot}
                    userSide={userSide}
                    maxSubs={maxSubs}
                    onSubstitute={handleSubstitute}
                  />
                )}
                {activeView === 'cronica' && <CommentaryTab snapshot={snapshot} />}
                {activeView === 'log' && (
                  <DebugLogTab
                    engine={engineRef.current}
                    snapshotVersion={Math.floor(snapshot.clockSeconds * 10)}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* FM2 Half-Time Team Talk Modal */}
      {showHalfTimeTalk && (
        <div
          className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs animate-overlay-in"
          onClick={() => setShowHalfTimeTalk(false)}
        >
          <div
            className="bg-[#f2f7f2] text-slate-900 w-full max-w-lg rounded-sm shadow-2xl border border-[#8fa08f] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#3a4a3a] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-amber-300" />
                <div>
                  <div className="text-sm font-bold tracking-wide uppercase">
                    Charla Técnica · Entretiempo
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono tabular-nums">
                    {snapshot.homeClub.name} {snapshot.homeScore} - {snapshot.awayScore}{' '}
                    {snapshot.awayClub.name} · xG {snapshot.homeStats.xg.toFixed(2)} -{' '}
                    {snapshot.awayStats.xg.toFixed(2)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowHalfTimeTalk(false)}
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
                aria-label="Cerrar charla"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              <p className="text-xs text-slate-700">
                {userScore > oppScore
                  ? 'Vas arriba en el marcador. Elegí el tono del vestuario para sostener la ventaja:'
                  : userScore < oppScore
                  ? 'El equipo está abajo en el marcador. Elegí cómo reaccionar en el vestuario:'
                  : 'Partido igualado al descanso. Elegí el mensaje clave para la segunda parte:'}
              </p>

              <button
                onClick={() =>
                  handleApplyHalfTimeTalk(
                    12,
                    4,
                    'Charla: ¡Confianza y empuje!',
                    'El cuerpo técnico animó al plantel en el vestuario (+12 moral, +4% energía).',
                    true
                  )
                }
                className="w-full flex items-center gap-3 p-3 bg-white hover:bg-emerald-50 border border-[#b5c4b5] rounded-sm text-left transition-colors cursor-pointer"
              >
                <Heart className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Motivar y respaldar al plantel
                  </div>
                  <div className="text-[11px] text-slate-600">
                    &ldquo;Confío en ustedes, salgan a buscar el partido&rdquo; · +12 moral · +4%
                    chispa
                  </div>
                </div>
              </button>

              <button
                onClick={() =>
                  handleApplyHalfTimeTalk(
                    userScore <= oppScore ? 15 : 6,
                    2,
                    'Charla: ¡Exigencia máxima!',
                    'El entrenador exigió máxima intensidad y reacción inmediata en el complemento.',
                    true
                  )
                }
                className="w-full flex items-center gap-3 p-3 bg-white hover:bg-amber-50 border border-[#b5c4b5] rounded-sm text-left transition-colors cursor-pointer"
              >
                <Flame className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Exigir intensidad y carácter
                  </div>
                  <div className="text-[11px] text-slate-600">
                    &ldquo;Necesito mucho más ritmo y entrega en cada pelota dividida&rdquo; · Alta
                    respuesta si vas empatando o perdiendo
                  </div>
                </div>
              </button>

              <button
                onClick={() =>
                  handleApplyHalfTimeTalk(
                    7,
                    6,
                    'Charla: Calma y orden táctico',
                    'Se pidió cabeza fría, rigor defensivo y ahorro inteligente de energía (+6% energía).',
                    true
                  )
                }
                className="w-full flex items-center gap-3 p-3 bg-white hover:bg-sky-50 border border-[#b5c4b5] rounded-sm text-left transition-colors cursor-pointer"
              >
                <Shield className="w-5 h-5 text-sky-700 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Pedir calma y disciplina táctica
                  </div>
                  <div className="text-[11px] text-slate-600">
                    &ldquo;Sin desesperarse, mantengan el bloque ordenado&rdquo; · +7 moral · +6%
                    recuperación física
                  </div>
                </div>
              </button>

              {userScore > oppScore && (
                <button
                  onClick={() =>
                    handleApplyHalfTimeTalk(
                      10,
                      3,
                      'Charla: Elogio sin relajarse',
                      'El técnico felicitó al equipo por el primer tiempo pidiendo mantener la tensión.',
                      true
                    )
                  }
                  className="w-full flex items-center gap-3 p-3 bg-white hover:bg-indigo-50 border border-[#b5c4b5] rounded-sm text-left transition-colors cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 text-indigo-700 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Felicitar por el rendimiento
                    </div>
                    <div className="text-[11px] text-slate-600">
                      &ldquo;Gran primer tiempo, sigan exactamente así&rdquo; · +10 moral
                    </div>
                  </div>
                </button>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[#c4d0c4] gap-2">
                <button
                  onClick={() => {
                    setShowHalfTimeTalk(false);
                    setActiveView('pizarra');
                  }}
                  className="px-3 py-1.5 rounded-sm bg-white hover:bg-slate-100 border border-[#96a696] text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  Ajustar Táctica / Cambios primero
                </button>
                <button
                  onClick={handleStartSecondHalf}
                  className="px-3.5 py-1.5 rounded-sm bg-[#2b5d2c] hover:bg-[#1f4720] text-white text-xs font-bold cursor-pointer"
                >
                  {halfTimeTalkDone ? 'Reanudar 2ª Parte' : 'Saltar Charla y Jugar 2ª Parte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
