import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FastForward, Flame, Heart, MessageCircle, Play, Shield, Sparkles, X } from 'lucide-react';
import { ROLE_LABELS } from '../engine/formations';
import { MatchEngine } from '../engine/MatchEngine';
import { soundEngine } from '../engine/soundEngine';
import { MatchViewport } from '../scene/MatchViewport';
import {
  buildClubPresetFromFm2,
  extractFm2ResultFromSnapshot,
  resolveKitColors,
  syncEnginePositionsToFm2,
  syncEngineTacticsToFm2Settings,
} from '../services/matchEngineBridge';
import { getBenchSizeForCompetition, world } from '../services/worldManager';
import { useGameStore } from '../stores/gameStore';
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
  GoalReplayClip,
  GoalReplayFrame,
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
    penalties?: { penaltyHome: number; penaltyAway: number },
    matchSummary?: {
      homeFormation: string;
      awayFormation: string;
      homePossession: number;
      awayPossession: number;
      homeShots: number;
      awayShots: number;
      homeShotsOnTarget: number;
      awayShotsOnTarget: number;
      homeCorners: number;
      awayCorners: number;
      homeFouls: number;
      awayFouls: number;
      homeOffsides: number;
      awayOffsides: number;
      homeXg: number;
      awayXg: number;
    }
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

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = parseHexRgb(a);
  const [r2, g2, b2] = parseHexRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function getContrastingClubPair(primary: string, secondary: string): { primary: string; contrast: string } {
  const safePrimary = primary || '#1e3a8a';
  const cand = secondary || '#ffffff';
  if (Math.abs(hexLuminance(safePrimary) - hexLuminance(cand)) >= 0.25 && colorDistance(safePrimary, cand) >= 95) {
    return { primary: safePrimary, contrast: cand };
  }
  const fallbackContrast = hexLuminance(safePrimary) > 0.55 ? '#111827' : '#ffffff';
  return { primary: safePrimary, contrast: fallbackContrast };
}

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
      ['ROUND_OF_64', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'].includes(
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
  const [activeGoalEvent, setActiveGoalEvent] = useState<MatchSnapshot['events'][number] | null>(null);
  const [goalBlinkInvert, setGoalBlinkInvert] = useState(false);
  const [activeReplay, setActiveReplay] = useState<GoalReplayClip | null>(null);
  const [replayProgress, setReplayProgress] = useState(0);

  const instantRafRef = useRef<number | null>(null);
  const replayFrameRef = useRef<GoalReplayFrame | null>(null);
  const replayMetaRef = useRef<{ goalX: number } | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const halfTimeTriggeredRef = useRef(false);
  const lastCelebratedGoalIdRef = useRef<string | null>(null);
  const lastReplayedGoalIdRef = useRef<string | null>(null);

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

  const handleSkipReplay = useCallback(() => {
    replayFrameRef.current = null;
    replayMetaRef.current = null;
    setActiveReplay(null);
    setReplayProgress(0);
    const eng = engineRef.current;
    if (eng && !isInstantSimulating && eng.phase !== 'half_time' && eng.phase !== 'full_time') {
      setIsPlaying(true);
    }
  }, [isInstantSimulating]);

  // Authoritative simulation RAF loop (paused cleanly during slow-motion goal replay)
  useEffect(() => {
    if (!isPlaying || isInstantSimulating || activeReplay) return;

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

      // Trigger slow-motion replay once the goal & net ripple tail completes
      if (eng.latestGoalReplay && eng.latestGoalReplay.id !== lastReplayedGoalIdRef.current) {
        lastReplayedGoalIdRef.current = eng.latestGoalReplay.id;
        setSnapshot(eng.getSnapshot());
        setIsPlaying(false);
        setActiveView('pitch');
        setActiveReplay(eng.latestGoalReplay);
        setReplayProgress(0);
        return;
      }

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
  }, [isPlaying, isInstantSimulating, speedMultiplier, activeReplay]);

  // Smooth 1.0x interpolated goal replay player focused on the scoring zone
  useEffect(() => {
    if (!activeReplay || activeReplay.frames.length === 0) {
      replayFrameRef.current = null;
      replayMetaRef.current = null;
      return;
    }

    const frames = activeReplay.frames;
    const endFrame = frames[frames.length - 1];
    replayMetaRef.current = { goalX: endFrame.ballX >= 0 ? 52.5 : -52.5 };
    const baseClock = frames[0].clockSeconds;
    const endClock = endFrame.clockSeconds;
    const simDuration = Math.max(4.0, endClock - baseClock);
    const CLOCK_SECONDS_PER_1X_SEC = 10.0; // MatchEngine advances clockSeconds at 10x real-time at 1x speed
    const PLAYBACK_SPEED = 1.0; // True 1x simulator speed
    const replayWallDuration = Math.max(0.9, simDuration / (CLOCK_SECONDS_PER_1X_SEC * PLAYBACK_SPEED));
    const freezeTailSec = 0.75;

    let rafId = 0;
    const startWall = performance.now();

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const stepReplay = () => {
      const elapsedWall = (performance.now() - startWall) / 1000;
      if (elapsedWall >= replayWallDuration + freezeTailSec) {
        handleSkipReplay();
        return;
      }

      const simRatio = Math.min(1, elapsedWall / replayWallDuration);
      setReplayProgress(simRatio);
      const targetClock = baseClock + simRatio * simDuration;

      let lo = 0;
      let hi = frames.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].clockSeconds <= targetClock) lo = mid;
        else hi = mid;
      }

      const f0 = frames[lo];
      const f1 = frames[Math.min(frames.length - 1, lo + 1)];
      const span = Math.max(0.0001, f1.clockSeconds - f0.clockSeconds);
      const alpha = f0 === f1 ? 0 : Math.max(0, Math.min(1, (targetClock - f0.clockSeconds) / span));

      const f1Map = new Map(f1.players.map((pl) => [pl.id, pl]));
      replayFrameRef.current = {
        ...f0,
        clockSeconds: lerp(f0.clockSeconds, f1.clockSeconds, alpha),
        ballX: lerp(f0.ballX, f1.ballX, alpha),
        ballY: lerp(f0.ballY, f1.ballY, alpha),
        ballZ: lerp(f0.ballZ, f1.ballZ, alpha),
        ballVx: lerp(f0.ballVx, f1.ballVx, alpha),
        ballVy: lerp(f0.ballVy, f1.ballVy, alpha),
        ballVz: lerp(f0.ballVz, f1.ballVz, alpha),
        ballSpinZ: lerp(f0.ballSpinZ ?? 0, f1.ballSpinZ ?? 0, alpha),
        netRippleLeft: lerp(f0.netRippleLeft, f1.netRippleLeft, alpha),
        netRippleRight: lerp(f0.netRippleRight, f1.netRippleRight, alpha),
        players: f0.players.map((p0) => {
          const p1 = f1Map.get(p0.id);
          if (!p1) return p0;
          return {
            ...p0,
            x: lerp(p0.x, p1.x, alpha),
            y: lerp(p0.y, p1.y, alpha),
            z: lerp(p0.z, p1.z, alpha),
            facing: p1.facing,
            kickAnimTimer: Math.max(p0.kickAnimTimer, p1.kickAnimTimer),
            diveAnimTimer: Math.max(p0.diveAnimTimer, p1.diveAnimTimer),
          };
        }),
      };

      rafId = requestAnimationFrame(stepReplay);
    };

    replayFrameRef.current = frames[0];
    rafId = requestAnimationFrame(stepReplay);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [activeReplay, handleSkipReplay]);

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
    if (activeReplay) {
      handleSkipReplay();
      return;
    }
    setHasStarted(true);
    setIsPlaying((prev) => !prev);
  }, [activeReplay, handleSkipReplay, isInstantSimulating]);

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
    replayFrameRef.current = null;
    setActiveReplay(null);
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
        if (partial.formation) {
          const engPlayers = userSide === 'home' ? eng.homePlayers : eng.awayPlayers;
          const fmPlayers = userSide === 'home' ? homePlayers : awayPlayers;
          syncEnginePositionsToFm2(engPlayers, fmPlayers, targetTactic, updated.formation);
        }
      }
      syncNow();
    },
    [awayPlayers, homePlayers, isNationalMatch, syncNow, tacticOverride, userSide]
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
      const eng = engineRef.current;
      if (!eng) return;
      eng.swapTeamSlots(userSide, aId, bId);
      if (!isNationalMatch) {
        const updated = userSide === 'home' ? eng.homeTactics : eng.awayTactics;
        const engPlayers = userSide === 'home' ? eng.homePlayers : eng.awayPlayers;
        const fmPlayers = userSide === 'home' ? homePlayers : awayPlayers;
        syncEnginePositionsToFm2(
          engPlayers,
          fmPlayers,
          tacticOverride || world.getActiveTactic(),
          updated.formation
        );
      }
      syncNow();
    },
    [awayPlayers, homePlayers, isNationalMatch, syncNow, tacticOverride, userSide]
  );

  const handleMovePlayerCustom = useCallback(
    (playerId: string, xNorm: number, zNorm: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.setPlayerCustomPosition(userSide, playerId, xNorm, zNorm);
      if (!isNationalMatch) {
        const updated = userSide === 'home' ? eng.homeTactics : eng.awayTactics;
        const engPlayers = userSide === 'home' ? eng.homePlayers : eng.awayPlayers;
        const fmPlayers = userSide === 'home' ? homePlayers : awayPlayers;
        syncEnginePositionsToFm2(
          engPlayers,
          fmPlayers,
          tacticOverride || world.getActiveTactic(),
          updated.formation
        );
      }
      syncNow();
    },
    [awayPlayers, homePlayers, isNationalMatch, syncNow, tacticOverride, userSide]
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
    let allowPenalties = isKnockout && fixture?.leg !== 1;
    let forcePenalties = false;
    if (isKnockout && fixture?.leg === 2) {
      const leg1 = useGameStore.getState().fixtures.find(
        (x) =>
          x.leg === 1 &&
          (fixture.tieId
            ? x.tieId === fixture.tieId
            : x.competitionId === fixture.competitionId &&
              x.stage === fixture.stage &&
              x.homeTeamId === fixture.awayTeamId &&
              x.awayTeamId === fixture.homeTeamId)
      );
      if (leg1 && leg1.played) {
        const aggHome = finalSnap.homeScore + (leg1.awayScore ?? 0);
        const aggAway = finalSnap.awayScore + (leg1.homeScore ?? 0);
        allowPenalties = false;
        forcePenalties = aggHome === aggAway;
      }
    }
    const extracted = extractFm2ResultFromSnapshot(
      finalSnap,
      homeTeam.id,
      awayTeam.id,
      userSide,
      {
        fixtureId: fixture?.id,
        competitionId: fixture?.competitionId,
        date: currentDate,
        allowPenalties,
        forcePenalties,
      }
    );

    // Store full Opta Match Report in FM2 matchStore so PostMatchSummaryView renders all maps & analytics
    useMatchStore.getState().setLastOptaReport(extracted.optaReport);

    const penalties =
      extracted.penaltyHome !== undefined && extracted.penaltyAway !== undefined
        ? { penaltyHome: extracted.penaltyHome, penaltyAway: extracted.penaltyAway }
        : undefined;

    const hPoss = Math.max(0, Math.min(100, Math.round(finalSnap.homeStats.possessionPct || 50)));
    const matchSummary = {
      homeFormation: finalSnap.homeTactics.customLabel || finalSnap.homeTactics.formation,
      awayFormation: finalSnap.awayTactics.customLabel || finalSnap.awayTactics.formation,
      homePossession: hPoss,
      awayPossession: 100 - hPoss,
      homeShots: finalSnap.homeStats.shots,
      awayShots: finalSnap.awayStats.shots,
      homeShotsOnTarget: finalSnap.homeStats.shotsOnTarget,
      awayShotsOnTarget: finalSnap.awayStats.shotsOnTarget,
      homeCorners: finalSnap.homeStats.corners,
      awayCorners: finalSnap.awayStats.corners,
      homeFouls: finalSnap.homeStats.fouls,
      awayFouls: finalSnap.awayStats.fouls,
      homeOffsides: finalSnap.homeStats.offsides,
      awayOffsides: finalSnap.awayStats.offsides,
      homeXg: Number((finalSnap.homeStats.xg || 0).toFixed(2)),
      awayXg: Number((finalSnap.awayStats.xg || 0).toFixed(2)),
    };

    onFinish(
      extracted.homeScore,
      extracted.awayScore,
      extracted.stats,
      extracted.events,
      penalties,
      matchSummary
    );
  }, [
    awayTeam.id,
    cancelInstantSim,
    currentDate,
    finishedOnce,
    fixture?.competitionId,
    fixture?.id,
    fixture?.leg,
    fixture?.stage,
    fixture?.tieId,
    fixture?.awayTeamId,
    fixture?.homeTeamId,
    homeTeam.id,
    isKnockout,
    onFinish,
    userSide,
  ]);

  // Auto-advance straight into the Post-Match Summary screen once the match finishes
  useEffect(() => {
    if (snapshot.phase !== 'full_time' || finishedOnce || activeReplay) return;
    const timer = window.setTimeout(() => {
      handleFinishMatch();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [snapshot.phase, finishedOnce, activeReplay, handleFinishMatch]);

  // Keyboard shortcut: Space to skip replay or pause/resume
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space' && !showHalfTimeTalk && !isInstantSimulating) {
        e.preventDefault();
        if (activeReplay) {
          handleSkipReplay();
        } else if (snapshot.phase === 'half_time') {
          handleStartSecondHalf();
        } else if (snapshot.phase !== 'full_time') {
          handleTogglePlay();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeReplay,
    handleSkipReplay,
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

  // Trigger rapid club-color blinking banner in commentary ticker whenever a goal is scored
  useEffect(() => {
    const goalEv =
      latestEvent?.type === 'goal'
        ? latestEvent
        : snapshot.lastBannerEvent?.type === 'goal'
        ? snapshot.lastBannerEvent
        : null;
    if (!goalEv || lastCelebratedGoalIdRef.current === goalEv.id) return;
    lastCelebratedGoalIdRef.current = goalEv.id;
    setActiveGoalEvent(goalEv);
    setGoalBlinkInvert(false);
  }, [latestEvent?.id, latestEvent?.type, snapshot.lastBannerEvent?.id, snapshot.lastBannerEvent?.type]);

  useEffect(() => {
    if (!activeGoalEvent) return;
    const blinkInterval = window.setInterval(() => {
      setGoalBlinkInvert((prev) => !prev);
    }, 180);
    const stopTimeout = window.setTimeout(() => {
      setActiveGoalEvent(null);
      setGoalBlinkInvert(false);
    }, 4800);
    return () => {
      window.clearInterval(blinkInterval);
      window.clearTimeout(stopTimeout);
    };
  }, [activeGoalEvent?.id]);

  const homePossPct = Math.max(0, Math.min(100, Math.round(snapshot.homeStats.possessionPct || 50)));
  const awayPossPct = 100 - homePossPct;
  const homeBarHex = snapshot.homeClub.colors.primary || '#1f5922';
  const rawAwayBarHex = snapshot.awayClub.colors.primary || '#334155';
  const awayBarHex =
    colorDistance(homeBarHex, rawAwayBarHex) >= 80
      ? rawAwayBarHex
      : colorDistance(homeBarHex, snapshot.awayClub.colors.secondary || '') >= 80
      ? snapshot.awayClub.colors.secondary
      : '#475569';

  const isGoalFlashing = Boolean(activeGoalEvent);
  const displayedEvent = isGoalFlashing ? activeGoalEvent! : latestEvent;
  const actingSide = displayedEvent?.side;
  const actingClub = actingSide === 'home' ? snapshot.homeClub : actingSide === 'away' ? snapshot.awayClub : null;
  const actingPair = actingClub
    ? getContrastingClubPair(actingClub.colors.primary, actingClub.colors.secondary)
    : null;

  const tickerBg = actingPair
    ? isGoalFlashing && goalBlinkInvert
      ? actingPair.contrast
      : actingPair.primary
    : '#1a2026';
  const tickerFg = actingPair
    ? isGoalFlashing && goalBlinkInvert
      ? actingPair.primary
      : actingPair.contrast
    : '#e2e8f0';

  const goalShoutText = (() => {
    if (!isGoalFlashing || !activeGoalEvent) return null;
    const st = activeGoalEvent.shotType;
    const isSpecialGolazo =
      st === 'free_kick' ||
      st === 'long_range' ||
      st === 'curler' ||
      st === 'volley' ||
      st === 'chip' ||
      st === 'corner_header';
    const isGolazo =
      isSpecialGolazo ||
      activeGoalEvent.id.length % 2 === 0 ||
      activeGoalEvent.minute % 3 === 0;
    const shoutWord = isGolazo ? 'GOOOLAZO!!' : 'GOOOL!!';
    const typeTag =
      st === 'corner_header'
        ? ' · ¡CABEZAZO DE CÓRNER!'
        : st === 'header'
        ? ' · ¡DE CABEZA!'
        : st === 'free_kick'
        ? ' · ¡DE TIRO LIBRE!'
        : st === 'long_range'
        ? ' · ¡DESDE AFUERA!'
        : st === 'curler'
        ? ' · ¡CON COMBA!'
        : st === 'volley'
        ? ' · ¡DE VOLEA!'
        : st === 'chip'
        ? ' · ¡DE VASELINA!'
        : st === 'penalty'
        ? ' · DE PENAL'
        : '';
    const rawWho = (activeGoalEvent.playerName || actingClub?.name || '').trim();
    if (!rawWho) return `${shoutWord} DE ${actingClub?.shortCode || ''}${typeTag}`.trim();
    if (rawWho.includes('(e/c)')) return `${shoutWord} — ${rawWho.toUpperCase()}${typeTag}`;
    return `${shoutWord} DE ${rawWho.toUpperCase()}${typeTag}`;
  })();

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
                  replayFrameRef={replayFrameRef}
                  replayMetaRef={replayMetaRef}
                />

                {/* Goal Replay HUD Overlay */}
                {activeReplay && (
                  <>
                    <div className="pointer-events-none absolute top-3 left-3 z-30 flex items-center gap-2 bg-[#0c1015]/92 border border-red-500/80 px-3 py-1.5 rounded-sm shadow-xl">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-red-400 leading-none">
                          Repetición del Gol · 1x
                        </div>
                        <div className="text-[11px] font-bold text-white truncate mt-0.5">
                          {activeReplay.minute}&apos; · Gol de {activeReplay.scorerName}
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
                      <div className="w-40 sm:w-52 h-1 rounded-full bg-black/55 overflow-hidden border border-white/15">
                        <div
                          className="h-full bg-red-500 transition-[width] duration-75"
                          style={{ width: `${Math.round(replayProgress * 100)}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSkipReplay}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm bg-[#1b1f23]/95 hover:bg-[#2b5d2c] border border-white/30 text-white text-[10.5px] font-black uppercase tracking-wider shadow-xl cursor-pointer transition-colors"
                      >
                        <FastForward className="w-3.5 h-3.5 text-[#facc15]" />
                        <span>Saltar Repetición (Espacio)</span>
                      </button>
                    </div>
                  </>
                )}

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

              {/* Dual-Team Colored Possession Bar above Commentary */}
              <div className="shrink-0 bg-[#14181d] border-t border-[#2c343d] px-2.5 sm:px-3 py-1 flex items-center gap-2 text-[10px] sm:text-[11px] font-mono font-bold tabular-nums">
                <div className="flex items-center gap-1.5 shrink-0 text-slate-100">
                  <span
                    className="w-2.5 h-2.5 rounded-[2px] border border-white/40 shrink-0"
                    style={{ backgroundColor: homeBarHex }}
                  />
                  <span className="truncate max-w-[52px]">{snapshot.homeClub.shortCode}</span>
                  <span className="text-[#facc15]">{homePossPct}%</span>
                </div>

                <div className="relative flex-1 h-2.5 sm:h-3 rounded-[2px] overflow-hidden bg-[#0b0e12] border border-white/15 flex">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${homePossPct}%`, backgroundColor: homeBarHex }}
                  />
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${awayPossPct}%`, backgroundColor: awayBarHex }}
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[8px] font-black uppercase tracking-widest text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                    Posesión
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-slate-100">
                  <span className="text-[#facc15]">{awayPossPct}%</span>
                  <span className="truncate max-w-[52px]">{snapshot.awayClub.shortCode}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-[2px] border border-white/40 shrink-0"
                    style={{ backgroundColor: awayBarHex }}
                  />
                </div>
              </div>

              {/* Dynamic Club-Colored Live Commentary Ticker Strip */}
              <div
                className="min-h-8 shrink-0 border-t border-black/40 px-2.5 sm:px-3 py-1 flex items-center justify-between gap-2.5 text-xs transition-colors duration-75"
                style={{ backgroundColor: tickerBg, color: tickerFg }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="font-mono font-black tabular-nums shrink-0 px-1.5 py-0.5 rounded-[2px] text-[11px]"
                    style={{
                      backgroundColor: isGoalFlashing ? tickerFg : 'rgba(0,0,0,0.28)',
                      color: isGoalFlashing ? tickerBg : tickerFg,
                    }}
                  >
                    {displayedEvent ? `${displayedEvent.minute}'` : "0'"}
                  </span>
                  {isGoalFlashing && goalShoutText ? (
                    <span className="font-black uppercase tracking-wider text-xs sm:text-sm truncate">
                      ⚽ {goalShoutText}
                      {activeGoalEvent?.assistName ? ` · Asist: ${activeGoalEvent.assistName}` : ''}
                    </span>
                  ) : (
                    <span className="font-bold truncate">
                      {displayedEvent
                        ? `${displayedEvent.title} — ${displayedEvent.description}`
                        : !hasStarted
                        ? `Equipos listos en ${snapshot.homeClub.stadiumName}. Presioná "Iniciar Partido" para comenzar.`
                        : `Partido en curso en ${snapshot.homeClub.stadiumName}.`}
                    </span>
                  )}
                </div>
                <div
                  className="hidden sm:flex items-center gap-2.5 font-mono text-[10.5px] font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-[2px]"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.26)',
                    color: isGoalFlashing && goalBlinkInvert ? tickerBg : '#f8fafc',
                  }}
                >
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
                    onMovePlayerCustom={handleMovePlayerCustom}
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
