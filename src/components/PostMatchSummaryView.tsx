import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  ChevronRight,
  FileText,
  Star,
  Users,
} from 'lucide-react';
import { detectManagerInitiatedTriggers } from '../services/playerDialogueTriggers';
import { mapFm2PositionToRole, resolveKitColors } from '../services/matchEngineBridge';
import { world } from '../services/worldManager';
import { openClubSquad } from '../stores/uiStore';
import { useMatchStore } from '../stores/matchStore';
import { Chronicle, Club, Player, PlayerMatchStats } from '../types';
import { MatchEvent as EngineMatchEvent, PlayerMatchState, TeamSide } from '../types/match';
import { FmClubShield, FmMatchupBanner, getClubHexPalette } from './ClubBannerChrome';
import { FMButton } from './FMUI';
import {
  AssistIcon,
  MatchReportPlayerEntry,
  PlayerMatchDetailModal,
  SoccerBallIcon,
} from './postMatch/PlayerMatchDetailModal';
import {
  FmCollapsibleSection,
  FmStatBarRow,
  PostMatchAdvancedSections,
} from './postMatch/PostMatchAdvancedSections';

interface PostMatchSummaryViewProps {
  homeTeam: Club;
  awayTeam: Club;
  homeScore: number;
  awayScore: number;
  stats: Record<string, PlayerMatchStats>;
  chronicle: Chronicle | null;
  userClubId: string;
  hasPressConference?: boolean;
  pressDelegateName?: string | null;
  onContinue: () => void;
}

function buildShortPlayerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function fromOptaState(
  p: PlayerMatchState,
  side: TeamSide,
  fm2Stat?: PlayerMatchStats,
  fm2Player?: Player
): MatchReportPlayerEntry {
  const isStarter = typeof p.startedMatch === 'boolean' ? p.startedMatch : p.slotIndex < 11;
  const minutesPlayed = Math.round(p.minutesPlayed || 0);
  const subbedOn = !isStarter && (p.onPitch || p.subbedOff || minutesPlayed > 0);

  return {
    id: p.id,
    name: fm2Player?.name || p.name,
    shortName: p.shortName || buildShortPlayerName(fm2Player?.name || p.name),
    number: p.number || 0,
    role: p.assignedRole || p.naturalRole || 'MC',
    side,
    isStarter,
    subbedOn,
    subbedOff: Boolean(p.subbedOff),
    subbedInMinute: p.subbedInMinute,
    subbedOutMinute: p.subbedOutMinute,
    minutesPlayed,
    rating: Number((fm2Stat?.rating ?? p.rating ?? 6.3).toFixed(1)),
    goals: p.goals || fm2Stat?.goals || 0,
    ownGoals: p.ownGoals || fm2Stat?.ownGoals || 0,
    assists: p.assists || fm2Stat?.assists || 0,
    shots: p.shots || 0,
    shotsOnTarget: p.shotsOnTarget || 0,
    xgGenerated: p.xgGenerated || 0,
    xgotGenerated: p.xgotGenerated || 0,
    xa: p.xa || 0,
    passesAttempted: p.passesAttempted || 0,
    passesCompleted: p.passesCompleted || 0,
    keyPasses: p.keyPasses || 0,
    progressivePasses: p.progressivePasses || 0,
    progressiveCarries: p.progressiveCarries || 0,
    crossesAttempted: p.crossesAttempted || 0,
    crossesCompleted: p.crossesCompleted || 0,
    dribblesAttempted: p.dribblesAttempted || 0,
    dribblesCompleted: p.dribblesCompleted || 0,
    tacklesWon: p.tacklesWon || 0,
    tacklesAttempted: fm2Stat?.tacklesAttempted ?? p.tacklesWon ?? 0,
    interceptions: p.interceptions || 0,
    clearances: p.clearances || 0,
    shotsBlocked: p.shotsBlocked || 0,
    groundDuelsWon: p.groundDuelsWon || 0,
    groundDuelsLost: p.groundDuelsLost || 0,
    aerialDuelsWon: p.aerialDuelsWon || 0,
    aerialDuelsLost: p.aerialDuelsLost || 0,
    foulsCommitted: p.foulsCommitted || 0,
    foulsWon: p.foulsWon || 0,
    yellowCards: p.yellowCards || (fm2Stat?.card === 'YELLOW' ? 1 : 0),
    redCard: Boolean(p.redCard || fm2Stat?.card === 'RED'),
    saves: p.saves || 0,
    xgotFaced: p.xgotFaced || 0,
    goalsConceded: p.goalsConceded || 0,
    errorsLeadingToShot: p.errorsLeadingToShot || 0,
    stamina: Math.round(p.stamina ?? fm2Stat?.condition ?? 75),
    distanceMeters: p.distanceMeters || 0,
    sprints: p.sprints || 0,
    injured: Boolean(p.injured || fm2Stat?.sustainedInjury),
    injuryLabel: fm2Stat?.sustainedInjury
      ? `${fm2Stat.sustainedInjury.type} (${fm2Stat.sustainedInjury.days} días)`
      : undefined,
    heatmap: p.heatmap,
    hasTelemetry: true,
  };
}

function fromFallbackStats(
  player: Player,
  s: PlayerMatchStats | undefined,
  side: TeamSide,
  index: number,
  isStarter: boolean
): MatchReportPlayerEntry {
  const minutesPlayed = Math.round(s?.minutesPlayed ?? (isStarter ? 90 : 0));
  const role = mapFm2PositionToRole(player.primaryPosition || player.positions[0]);
  return {
    id: player.id,
    name: player.name,
    shortName: buildShortPlayerName(player.name),
    number: player.tacticalPosition || player.benchPosition || index + 1,
    role,
    side,
    isStarter,
    subbedOn: !isStarter && minutesPlayed > 0,
    subbedOff: isStarter && minutesPlayed > 0 && minutesPlayed < 90,
    minutesPlayed,
    rating: Number((s?.rating ?? 6.3).toFixed(1)),
    goals: s?.goals || 0,
    ownGoals: s?.ownGoals || 0,
    assists: s?.assists || 0,
    shots: s?.shots || 0,
    shotsOnTarget: s?.shotsOnTarget || 0,
    xgGenerated: 0,
    xgotGenerated: 0,
    xa: 0,
    passesAttempted: s?.passesAttempted || 0,
    passesCompleted: s?.passesCompleted || 0,
    keyPasses: s?.keyPasses || 0,
    progressivePasses: 0,
    progressiveCarries: 0,
    crossesAttempted: 0,
    crossesCompleted: 0,
    dribblesAttempted: s?.dribblesAttempted || 0,
    dribblesCompleted: s?.dribblesCompleted || 0,
    tacklesWon: s?.tacklesCompleted || 0,
    tacklesAttempted: s?.tacklesAttempted || 0,
    interceptions: s?.interceptions || 0,
    clearances: 0,
    shotsBlocked: s?.shotsBlocked || 0,
    groundDuelsWon: 0,
    groundDuelsLost: 0,
    aerialDuelsWon: s?.headersWon || 0,
    aerialDuelsLost: Math.max(0, (s?.headersAttempted || 0) - (s?.headersWon || 0)),
    foulsCommitted: s?.foulsCommitted || 0,
    foulsWon: s?.foulsReceived || 0,
    yellowCards: s?.card === 'YELLOW' ? 1 : 0,
    redCard: s?.card === 'RED',
    saves: s?.saves || 0,
    xgotFaced: 0,
    goalsConceded: s?.conceded || 0,
    errorsLeadingToShot: 0,
    stamina: Math.round(s?.condition ?? player.fitness ?? 80),
    distanceMeters: 0,
    sprints: 0,
    injured: Boolean(s?.sustainedInjury),
    injuryLabel: s?.sustainedInjury
      ? `${s.sustainedInjury.type} (${s.sustainedInjury.days} días)`
      : undefined,
    hasTelemetry: false,
  };
}

function buildFallbackEntriesForClub(
  clubId: string,
  side: TeamSide,
  stats: Record<string, PlayerMatchStats>
): MatchReportPlayerEntry[] {
  const clubPlayers = world.getPlayersByClub(clubId);
  const statPlayers = Object.keys(stats)
    .map((id) => world.getPlayer(id))
    .filter((p): p is Player => Boolean(p && p.clubId === clubId));

  const seen = new Set<string>();
  const combined: Player[] = [];
  for (const p of [...statPlayers, ...clubPlayers]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      combined.push(p);
    }
  }

  const playedOrNamed = combined
    .filter((p) => Boolean(stats[p.id]) || p.isStarter || p.squad === 'SENIOR')
    .sort((a, b) => {
      const aHasEvent = Boolean((stats[a.id]?.goals || 0) > 0 || (stats[a.id]?.ownGoals || 0) > 0 || (stats[a.id]?.assists || 0) > 0);
      const bHasEvent = Boolean((stats[b.id]?.goals || 0) > 0 || (stats[b.id]?.ownGoals || 0) > 0 || (stats[b.id]?.assists || 0) > 0);
      const aMin = stats[a.id]?.minutesPlayed ?? (a.isStarter ? 90 : 0);
      const bMin = stats[b.id]?.minutesPlayed ?? (b.isStarter ? 90 : 0);
      if (Boolean(a.isStarter) !== Boolean(b.isStarter)) return a.isStarter ? -1 : 1;
      if (aHasEvent !== bHasEvent) return aHasEvent ? -1 : 1;
      if (a.tacticalPosition && b.tacticalPosition) return a.tacticalPosition - b.tacticalPosition;
      return bMin - aMin;
    })
    .slice(0, 20);

  return playedOrNamed.map((p, idx) =>
    fromFallbackStats(p, stats[p.id], side, idx, idx < 11)
  );
}

const renderRepeatIcons = (
  count: number,
  renderIcon: (key: number) => React.ReactNode
) => {
  if (count <= 0) return null;
  if (count <= 3) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <React.Fragment key={i}>{renderIcon(i)}</React.Fragment>
        ))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-black text-slate-800">
      {renderIcon(0)}×{count}
    </span>
  );
};

export const PostMatchSummaryView: React.FC<PostMatchSummaryViewProps> = ({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  stats,
  chronicle,
  userClubId,
  hasPressConference: _hasPressConference = false,
  pressDelegateName = null,
  onContinue,
}) => {
  const lastOptaReport = useMatchStore((s) => s.lastOptaReport);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    puntajes: true,
    estadisticas: true,
    cronica: true,
    mapas: false,
  });

  useEffect(() => {
    detectManagerInitiatedTriggers(userClubId, 'POST_MATCH');
  }, [userClubId]);

  const hasMatchingOpta = Boolean(
    lastOptaReport &&
      lastOptaReport.homeClubId === homeTeam.id &&
      lastOptaReport.awayClubId === awayTeam.id
  );
  const optaSnapshot = hasMatchingOpta ? lastOptaReport!.snapshot : null;

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { homeEntries, awayEntries } = useMemo(() => {
    if (optaSnapshot) {
      const mapList = (list: PlayerMatchState[], side: TeamSide): MatchReportPlayerEntry[] => {
        const mapped = list.map((p, idx) => ({
          entry: fromOptaState(p, side, stats[p.id], world.getPlayer(p.id)),
          slotIndex: p.slotIndex,
          origIdx: idx,
        }));
        // Guarantee strictly up to 11 starters (handles both startedMatch flag and legacy snapshots)
        const starterRows = mapped
          .filter((m) => m.entry.isStarter)
          .sort((a, b) => a.slotIndex - b.slotIndex || b.entry.minutesPlayed - a.entry.minutesPlayed || a.origIdx - b.origIdx);
        const starterIds = new Set(starterRows.slice(0, 11).map((m) => m.entry.id));

        const normalized = mapped.map((m) => {
          const reallyStarter = starterIds.has(m.entry.id);
          return {
            ...m.entry,
            isStarter: reallyStarter,
            subbedOn: !reallyStarter && (m.entry.subbedOn || m.entry.minutesPlayed > 0),
          };
        });

        const starters = normalized
          .filter((e) => e.isStarter)
          .sort((a, b) => {
            const sa = mapped.find((m) => m.entry.id === a.id)?.slotIndex ?? 99;
            const sb = mapped.find((m) => m.entry.id === b.id)?.slotIndex ?? 99;
            return sa - sb;
          });
        const subs = normalized
          .filter((e) => !e.isStarter)
          .sort((a, b) => Number(b.subbedOn) - Number(a.subbedOn) || b.minutesPlayed - a.minutesPlayed);
        return [...starters, ...subs];
      };
      return {
        homeEntries: mapList(optaSnapshot.homePlayers, 'home'),
        awayEntries: mapList(optaSnapshot.awayPlayers, 'away'),
      };
    }

    return {
      homeEntries: buildFallbackEntriesForClub(homeTeam.id, 'home', stats),
      awayEntries: buildFallbackEntriesForClub(awayTeam.id, 'away', stats),
    };
  }, [optaSnapshot, stats, homeTeam.id, awayTeam.id]);

  const allEntries = useMemo(
    () => [...homeEntries, ...awayEntries],
    [homeEntries, awayEntries]
  );

  const motmEntry = useMemo(() => {
    return [...allEntries]
      .filter((p) => p.minutesPlayed > 0)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.goals * 2 + b.assists - (a.goals * 2 + a.assists);
      })[0];
  }, [allEntries]);

  const selectedEntry = useMemo(
    () => allEntries.find((e) => e.id === selectedPlayerId) || null,
    [allEntries, selectedPlayerId]
  );

  // Distinct readable comparison colors for white/sage backgrounds
  const { homeBarColor, awayBarColor } = useMemo(() => {
    const { homeColors, awayColors } = resolveKitColors(homeTeam, awayTeam);
    const homePalette = getClubHexPalette({ primary: homeColors.primary, secondary: homeColors.secondary });
    const awayPalette = getClubHexPalette({ primary: awayColors.primary, secondary: awayColors.secondary });

    const safeHome = homePalette.isLightPrimary ? '#1f5922' : homeColors.primary;
    let safeAway = awayPalette.isLightPrimary ? '#475569' : awayColors.primary;
    if (safeAway.toLowerCase() === safeHome.toLowerCase()) {
      safeAway = '#475569';
    }
    return { homeBarColor: safeHome, awayBarColor: safeAway };
  }, [homeTeam, awayTeam]);

  const statComparisonRows = useMemo(() => {
    if (optaSnapshot) {
      const hs = optaSnapshot.homeStats;
      const as = optaSnapshot.awayStats;
      const hPassPct = hs.passesAttempted > 0 ? Math.round((hs.passesCompleted / hs.passesAttempted) * 100) : 0;
      const aPassPct = as.passesAttempted > 0 ? Math.round((as.passesCompleted / as.passesAttempted) * 100) : 0;
      const hDribPct = hs.dribblesAttempted > 0 ? Math.round((hs.dribblesCompleted / hs.dribblesAttempted) * 100) : 0;
      const aDribPct = as.dribblesAttempted > 0 ? Math.round((as.dribblesCompleted / as.dribblesAttempted) * 100) : 0;
      const hGroundTot = hs.groundDuelsWon + hs.groundDuelsLost;
      const aGroundTot = as.groundDuelsWon + as.groundDuelsLost;
      const hAerialTot = hs.aerialDuelsWon + hs.aerialDuelsLost;
      const aAerialTot = as.aerialDuelsWon + as.aerialDuelsLost;

      return [
        {
          label: 'Posesión de balón',
          homeVal: `${Math.round(hs.possessionPct)}%`,
          awayVal: `${Math.round(as.possessionPct)}%`,
          homeNum: hs.possessionPct,
          awayNum: as.possessionPct,
        },
        {
          label: 'Goles Esperados (xG)',
          homeVal: hs.xg.toFixed(2),
          awayVal: as.xg.toFixed(2),
          homeNum: hs.xg,
          awayNum: as.xg,
        },
        {
          label: 'Calidad al Arco (xGOT) / xA',
          homeVal: `${hs.xgot.toFixed(2)} / ${hs.xa.toFixed(2)}`,
          awayVal: `${as.xgot.toFixed(2)} / ${as.xa.toFixed(2)}`,
          homeNum: hs.xgot + hs.xa,
          awayNum: as.xgot + as.xa,
        },
        {
          label: 'Tiros Totales (Al Arco / Bloq.)',
          homeVal: `${hs.shots} (${hs.shotsOnTarget} / ${hs.shotsBlocked})`,
          awayVal: `${as.shots} (${as.shotsOnTarget} / ${as.shotsBlocked})`,
          homeNum: hs.shots,
          awayNum: as.shots,
        },
        {
          label: 'Ocasiones Claras',
          homeVal: hs.bigChances,
          awayVal: as.bigChances,
          homeNum: hs.bigChances,
          awayNum: as.bigChances,
        },
        {
          label: 'Pases Completados',
          homeVal: `${hs.passesCompleted}/${hs.passesAttempted} (${hPassPct}%)`,
          awayVal: `${as.passesCompleted}/${as.passesAttempted} (${aPassPct}%)`,
          homeNum: hs.passesCompleted,
          awayNum: as.passesCompleted,
        },
        {
          label: 'Pases Clave / Progresivos',
          homeVal: `${hs.keyPasses} / ${hs.progressivePasses}`,
          awayVal: `${as.keyPasses} / ${as.progressivePasses}`,
          homeNum: hs.keyPasses + hs.progressivePasses,
          awayNum: as.keyPasses + as.progressivePasses,
        },
        {
          label: 'Regates Completados',
          homeVal: `${hs.dribblesCompleted}/${hs.dribblesAttempted} (${hDribPct}%)`,
          awayVal: `${as.dribblesCompleted}/${as.dribblesAttempted} (${aDribPct}%)`,
          homeNum: hs.dribblesCompleted,
          awayNum: as.dribblesCompleted,
        },
        {
          label: 'Duelos Terrestres Ganados',
          homeVal: `${hs.groundDuelsWon}/${hGroundTot}`,
          awayVal: `${as.groundDuelsWon}/${aGroundTot}`,
          homeNum: hs.groundDuelsWon,
          awayNum: as.groundDuelsWon,
        },
        {
          label: 'Duelos Aéreos Ganados',
          homeVal: `${hs.aerialDuelsWon}/${hAerialTot}`,
          awayVal: `${as.aerialDuelsWon}/${aAerialTot}`,
          homeNum: hs.aerialDuelsWon,
          awayNum: as.aerialDuelsWon,
        },
        {
          label: 'Entradas / Intercep. / Despejes',
          homeVal: `${hs.tacklesWon} / ${hs.interceptions} / ${hs.clearances}`,
          awayVal: `${as.tacklesWon} / ${as.interceptions} / ${as.clearances}`,
          homeNum: hs.tacklesWon + hs.interceptions + hs.clearances,
          awayNum: as.tacklesWon + as.interceptions + as.clearances,
        },
        {
          label: 'Tiros de Esquina (Córners)',
          homeVal: hs.corners,
          awayVal: as.corners,
          homeNum: hs.corners,
          awayNum: as.corners,
        },
        {
          label: 'Faltas Cometidas / Fuera de Juego',
          homeVal: `${hs.fouls} / ${hs.offsides}`,
          awayVal: `${as.fouls} / ${as.offsides}`,
          homeNum: hs.fouls,
          awayNum: as.fouls,
        },
        {
          label: 'Tarjetas (Amarillas / Rojas)',
          homeVal: `${hs.yellowCards} / ${hs.redCards}`,
          awayVal: `${as.yellowCards} / ${as.redCards}`,
          homeNum: hs.yellowCards + hs.redCards * 2,
          awayNum: as.yellowCards + as.redCards * 2,
        },
      ];
    }

    const sumFallback = (entries: MatchReportPlayerEntry[]) =>
      entries.reduce(
        (acc, p) => {
          acc.shots += p.shots;
          acc.onTarget += p.shotsOnTarget;
          acc.passesComp += p.passesCompleted;
          acc.passesAtt += p.passesAttempted;
          acc.keyPasses += p.keyPasses;
          acc.dribblesComp += p.dribblesCompleted;
          acc.dribblesAtt += p.dribblesAttempted;
          acc.tackles += p.tacklesWon;
          acc.interceptions += p.interceptions;
          acc.fouls += p.foulsCommitted;
          acc.yellows += p.yellowCards;
          acc.reds += p.redCard ? 1 : 0;
          return acc;
        },
        {
          shots: 0,
          onTarget: 0,
          passesComp: 0,
          passesAtt: 0,
          keyPasses: 0,
          dribblesComp: 0,
          dribblesAtt: 0,
          tackles: 0,
          interceptions: 0,
          fouls: 0,
          yellows: 0,
          reds: 0,
        }
      );

    const h = sumFallback(homeEntries);
    const a = sumFallback(awayEntries);
    const totalPasses = h.passesComp + a.passesComp;
    const hPoss = totalPasses > 0 ? Math.round((h.passesComp / totalPasses) * 100) : 50;
    const aPoss = 100 - hPoss;

    return [
      {
        label: 'Posesión estimada',
        homeVal: `${hPoss}%`,
        awayVal: `${aPoss}%`,
        homeNum: hPoss,
        awayNum: aPoss,
      },
      {
        label: 'Tiros Totales (Al Arco)',
        homeVal: `${h.shots} (${h.onTarget})`,
        awayVal: `${a.shots} (${a.onTarget})`,
        homeNum: h.shots,
        awayNum: a.shots,
      },
      {
        label: 'Pases Completados',
        homeVal: `${h.passesComp}/${h.passesAtt}`,
        awayVal: `${a.passesComp}/${a.passesAtt}`,
        homeNum: h.passesComp,
        awayNum: a.passesComp,
      },
      {
        label: 'Pases Clave / Regates',
        homeVal: `${h.keyPasses} / ${h.dribblesComp}`,
        awayVal: `${a.keyPasses} / ${a.dribblesComp}`,
        homeNum: h.keyPasses + h.dribblesComp,
        awayNum: a.keyPasses + a.dribblesComp,
      },
      {
        label: 'Entradas e Intercepciones',
        homeVal: `${h.tackles} / ${h.interceptions}`,
        awayVal: `${a.tackles} / ${a.interceptions}`,
        homeNum: h.tackles + h.interceptions,
        awayNum: a.tackles + a.interceptions,
      },
      {
        label: 'Faltas / Tarjetas (A/R)',
        homeVal: `${h.fouls} (${h.yellows}/${h.reds})`,
        awayVal: `${a.fouls} (${a.yellows}/${a.reds})`,
        homeNum: h.fouls,
        awayNum: a.fouls,
      },
    ];
  }, [optaSnapshot, homeEntries, awayEntries]);

  const timelineEvents = useMemo(() => {
    if (optaSnapshot?.events?.length) {
      const importantTypes = new Set<EngineMatchEvent['type']>([
        'goal',
        'penalty',
        'yellow_card',
        'red_card',
        'injury',
        'substitution',
        'post',
      ]);
      return optaSnapshot.events
        .filter((e) => importantTypes.has(e.type))
        .slice()
        .sort((a, b) => a.minute - b.minute || a.addedTime - b.addedTime);
    }
    return [];
  }, [optaSnapshot]);

  const injuriesList = useMemo(
    () => allEntries.filter((e) => e.injured),
    [allEntries]
  );

  const isUserHome = homeTeam.id === userClubId;
  const userResult = isUserHome
    ? homeScore > awayScore
      ? 'win'
      : homeScore < awayScore
      ? 'loss'
      : 'draw'
    : awayScore > homeScore
    ? 'win'
    : awayScore < homeScore
    ? 'loss'
    : 'draw';

  const resultColor =
    userResult === 'win'
      ? 'text-emerald-300'
      : userResult === 'loss'
      ? 'text-rose-300'
      : 'text-amber-200';
  const resultText =
    userResult === 'win' ? 'Victoria' : userResult === 'loss' ? 'Derrota' : 'Empate';

  const penaltyLabel =
    lastOptaReport?.penaltyHome !== undefined &&
    lastOptaReport?.penaltyAway !== undefined &&
    hasMatchingOpta
      ? `Pen ${lastOptaReport.penaltyHome}-${lastOptaReport.penaltyAway}`
      : undefined;

  const renderTeamLineupCard = (
    team: Club,
    entries: MatchReportPlayerEntry[],
    formationLabel?: string
  ) => {
    const starters = entries.filter((p) => p.isStarter).slice(0, 11);
    const starterSet = new Set(starters.map((p) => p.id));
    const bench = entries.filter((p) => !starterSet.has(p.id));

    const renderPlayerRow = (p: MatchReportPlayerEntry, idx: number) => {
      const isMotm = Boolean(motmEntry && motmEntry.id === p.id);
      const minText =
        p.minutesPlayed <= 0
          ? 'Sup.'
          : p.subbedOn
          ? p.subbedInMinute !== undefined
            ? `${p.subbedInMinute}'↑`
            : `${p.minutesPlayed}'↑`
          : p.subbedOff
          ? p.subbedOutMinute !== undefined
            ? `${p.subbedOutMinute}'↓`
            : `${p.minutesPlayed}'↓`
          : `${p.minutesPlayed}'`;

      const ratingBadgeClass =
        p.minutesPlayed <= 0
          ? 'bg-slate-200 text-slate-500 border-slate-300'
          : isMotm
          ? 'bg-amber-300 text-slate-950 border-amber-600'
          : p.rating >= 7.5
          ? 'bg-[#1f5922] text-white border-[#133815]'
          : p.rating >= 6.5
          ? 'bg-[#dde6dd] text-slate-900 border-[#96a696]'
          : 'bg-rose-100 text-rose-900 border-rose-300';

      return (
        <button
          key={p.id}
          type="button"
          onClick={() => setSelectedPlayerId(p.id)}
          className={`w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
            isMotm
              ? 'bg-amber-50 hover:bg-amber-100/90'
              : idx % 2 === 0
              ? 'bg-white hover:bg-[#ebf3eb]'
              : 'bg-[#f6f9f6] hover:bg-[#ebf3eb]'
          }`}
        >
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-slate-500 w-5 shrink-0 tabular-nums">
              {p.number > 0 ? p.number : '—'}
            </span>
            <span className="px-1 py-0.5 rounded-[2px] bg-[#e2e7e2] border border-[#b4c0b4] text-[9px] font-black text-slate-700 w-7 text-center shrink-0">
              {p.role}
            </span>
            {isMotm && (
              <Star
                size={13}
                fill="#f59e0b"
                className="text-amber-600 shrink-0"
                aria-label="Figura del partido"
              />
            )}
            <span
              className={`text-[11.5px] truncate max-w-[140px] sm:max-w-[180px] ${
                isMotm
                  ? 'font-black text-slate-950'
                  : p.minutesPlayed > 0
                  ? 'font-semibold text-slate-900'
                  : 'font-normal text-slate-500'
              }`}
            >
              {p.name}
            </span>

            {/* Event Icons next to player name: goals, own-goals, assists, cards, injury */}
            {renderRepeatIcons(p.goals, (i) => (
              <SoccerBallIcon key={`g-${i}`} size={12} />
            ))}
            {(p.ownGoals || 0) > 0 && (
              <span
                className="px-1 py-0 bg-rose-100 border border-rose-400 text-rose-800 rounded-[2px] text-[8.5px] font-black leading-tight shrink-0"
                title="Gol en contra"
              >
                {(p.ownGoals || 0) > 1 ? `e/c ×${p.ownGoals}` : 'e/c'}
              </span>
            )}
            {renderRepeatIcons(p.assists, (i) => (
              <AssistIcon key={`a-${i}`} size={12} />
            ))}
            {p.yellowCards > 0 && (
              <span
                className="inline-block w-2 h-2.5 bg-amber-400 border border-amber-700 rounded-[1px] shrink-0"
                title="Tarjeta Amarilla"
              />
            )}
            {p.redCard && (
              <span
                className="inline-block w-2 h-2.5 bg-rose-600 border border-rose-900 rounded-[1px] shrink-0"
                title="Tarjeta Roja"
              />
            )}
            {p.injured && (
              <span
                className="inline-flex items-center justify-center px-1 py-0 bg-rose-100 border border-rose-400 text-rose-800 rounded-[2px] text-[9px] font-black leading-tight shrink-0"
                title={p.injuryLabel || 'Lesionado'}
              >
                +
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!p.isStarter && p.subbedOn && (
              <span className="px-1.5 py-0.5 rounded-[2px] bg-emerald-100 border border-emerald-400 text-emerald-900 text-[9px] font-black uppercase leading-none">
                Entró
              </span>
            )}
            <span className="font-mono text-[10px] text-slate-500 tabular-nums">{minText}</span>
            <span
              className={`min-w-[32px] px-1.5 py-0.5 rounded-[2px] border font-mono text-[11px] font-black text-center tabular-nums ${ratingBadgeClass}`}
            >
              {p.minutesPlayed > 0 ? p.rating.toFixed(1) : '—'}
            </span>
          </div>
        </button>
      );
    };

    return (
      <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs flex flex-col">
        {/* Club sub-header */}
        <div className="bg-[#d6ded6] border-b border-[#8e9b90] px-2.5 py-1.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => openClubSquad(team.id, world.clubs)}
            className="flex items-center gap-2 min-w-0 hover:underline cursor-pointer text-left"
          >
            <FmClubShield club={team} size="xs" />
            <span className="font-bold text-xs text-slate-900 truncate">{team.name}</span>
          </button>
          {formationLabel && (
            <span className="px-1.5 py-0.5 rounded-[2px] bg-[#2d3238] text-[#facc15] font-mono text-[10px] font-bold shrink-0">
              {formationLabel}
            </span>
          )}
        </div>

        {/* Titulares */}
        <div className="bg-[#edf2ed] border-b border-[#c5d0c5] px-2.5 py-1 flex items-center justify-between text-[9.5px] font-black uppercase tracking-wider text-slate-700">
          <span>Titulares ({starters.length})</span>
          <span>Min · Nota</span>
        </div>
        <div className="divide-y divide-[#e2e7e2]">
          {starters.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">Sin datos de titulares.</div>
          ) : (
            starters.map((p, idx) => renderPlayerRow(p, idx))
          )}
        </div>

        {/* Suplentes */}
        {bench.length > 0 && (
          <>
            <div className="bg-[#edf2ed] border-y border-[#c5d0c5] px-2.5 py-1 flex items-center justify-between text-[9.5px] font-black uppercase tracking-wider text-slate-700">
              <span>Suplentes ({bench.length})</span>
              <span>Min · Nota</span>
            </div>
            <div className="divide-y divide-[#e2e7e2]">
              {bench.map((p, idx) => renderPlayerRow(p, idx))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#d4dcd4] overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scroll pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto md:my-5 bg-[#d4dcd4] md:bg-[#e4eae4] md:rounded-sm border-x md:border border-[#1c1f24] shadow-xl overflow-hidden">
          {/* Score Header — Exact TopScoreboard Broadcast Style */}
          <FmMatchupBanner
            homeClub={homeTeam}
            awayClub={awayTeam}
            homeScore={homeScore}
            awayScore={awayScore}
            centerTopLabel={<span className={resultColor}>{resultText}</span>}
            centerBottomLabel={penaltyLabel || 'Final'}
            onClickHome={() => openClubSquad(homeTeam.id, world.clubs)}
            onClickAway={() => openClubSquad(awayTeam.id, world.clubs)}
          />

          {/* FM08 Steel Sub-Toolbar */}
          <div className="min-h-9 bg-[#3a3f45] border-b border-[#1c1f24] px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-200 uppercase tracking-wide">
              <span>Informe Post Partido</span>
              <span className="hidden sm:inline text-slate-400 font-normal normal-case">
                · Toca un título para expandir/contraer o un jugador para ver su detalle
              </span>
            </div>
          </div>

          {/* Collapsible Sections Stack in Requested Order */}
          <div className="p-2.5 sm:p-4 space-y-3 bg-[#d4dcd4]">
            {/* 1. PUNTAJES */}
            <FmCollapsibleSection
              title="Puntajes y Formaciones"
              icon={<Users size={14} />}
              rightSummary={
                motmEntry ? (
                  <span className="inline-flex items-center gap-1 text-[#facc15] font-bold">
                    <Star size={11} fill="#facc15" />
                    <span className="truncate max-w-[140px] sm:max-w-none">
                      {motmEntry.shortName} ({motmEntry.rating.toFixed(1)})
                    </span>
                  </span>
                ) : (
                  'Toca un jugador'
                )
              }
              isOpen={openSections.puntajes}
              onToggle={() => toggleSection('puntajes')}
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {renderTeamLineupCard(
                    homeTeam,
                    homeEntries,
                    optaSnapshot?.homeTactics.customLabel || optaSnapshot?.homeTactics.formation
                  )}
                  {renderTeamLineupCard(
                    awayTeam,
                    awayEntries,
                    optaSnapshot?.awayTactics.customLabel || optaSnapshot?.awayTactics.formation
                  )}
                </div>
              </div>
            </FmCollapsibleSection>

            {/* 2. RESUMEN DE ESTADÍSTICAS */}
            <FmCollapsibleSection
              title="Resumen de Estadísticas"
              icon={<BarChart3 size={14} />}
              rightSummary={`${homeTeam.shortName} vs ${awayTeam.shortName}`}
              isOpen={openSections.estadisticas}
              onToggle={() => toggleSection('estadisticas')}
            >
              <div className="bg-white border border-[#8e9b90] rounded-sm p-3 sm:p-4 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[#dde4dd] text-xs font-bold text-slate-900">
                  <button
                    type="button"
                    onClick={() => openClubSquad(homeTeam.id, world.clubs)}
                    className="flex items-center gap-1.5 hover:underline cursor-pointer text-left"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-[1px]"
                      style={{ backgroundColor: homeBarColor }}
                    />
                    {homeTeam.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => openClubSquad(awayTeam.id, world.clubs)}
                    className="flex items-center gap-1.5 hover:underline cursor-pointer text-right"
                  >
                    {awayTeam.name}
                    <span
                      className="w-2.5 h-2.5 rounded-[1px]"
                      style={{ backgroundColor: awayBarColor }}
                    />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {statComparisonRows.map((row, idx) => (
                    <FmStatBarRow
                      key={idx}
                      label={row.label}
                      homeVal={row.homeVal}
                      awayVal={row.awayVal}
                      homeNum={row.homeNum}
                      awayNum={row.awayNum}
                      homeColor={homeBarColor}
                      awayColor={awayBarColor}
                    />
                  ))}
                </div>
              </div>
            </FmCollapsibleSection>

            {/* 3. CRÓNICA DEL PARTIDO */}
            <FmCollapsibleSection
              title="Crónica del Partido"
              icon={<FileText size={14} />}
              rightSummary={timelineEvents.length > 0 ? `${timelineEvents.length} incidencias` : undefined}
              isOpen={openSections.cronica}
              onToggle={() => toggleSection('cronica')}
            >
              <div className="space-y-3">
                {chronicle ? (
                  <div className="bg-white border border-[#8e9b90] rounded-sm p-3.5 shadow-xs">
                    <h3 className="text-sm font-black text-slate-900 mb-1.5">
                      {chronicle.title}
                    </h3>
                    <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {chronicle.body}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-[#8e9b90] rounded-sm p-3.5 text-xs text-slate-600">
                    Final del encuentro: {homeTeam.name} {homeScore} - {awayScore} {awayTeam.name}.
                  </div>
                )}

                {timelineEvents.length > 0 && (
                  <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
                    <div className="bg-[#edf2ed] border-b border-[#c5d0c5] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Cronología de Incidencias Clave
                    </div>
                    <div className="divide-y divide-[#edf1ed] max-h-60 overflow-y-auto custom-scroll">
                      {timelineEvents.map((ev) => {
                        const teamClub =
                          ev.side === 'home'
                            ? homeTeam
                            : ev.side === 'away'
                            ? awayTeam
                            : null;
                        const matchedPlayer = ev.playerName
                          ? allEntries.find((e) => e.name === ev.playerName || e.shortName === ev.playerName)
                          : undefined;
                        const minLabel =
                          ev.addedTime > 0 ? `${ev.minute}+${ev.addedTime}'` : `${ev.minute}'`;
                        return (
                          <div
                            key={ev.id}
                            className="px-3 py-1.5 flex items-start gap-2.5 text-[11px] hover:bg-[#f6f9f6]"
                          >
                            <span className="font-mono font-bold text-slate-600 w-10 shrink-0 tabular-nums">
                              {minLabel}
                            </span>
                            <span className="shrink-0 mt-0.5">
                              {ev.type === 'goal' || ev.type === 'penalty' ? (
                                <SoccerBallIcon size={12} />
                              ) : ev.type === 'yellow_card' ? (
                                <span className="inline-block w-2 h-2.5 bg-amber-400 border border-amber-700 rounded-[1px]" />
                              ) : ev.type === 'red_card' ? (
                                <span className="inline-block w-2 h-2.5 bg-rose-600 border border-rose-900 rounded-[1px]" />
                              ) : ev.type === 'injury' ? (
                                <span className="text-rose-700 font-black">+</span>
                              ) : (
                                <span className="text-[#1f5922] font-black">•</span>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              {matchedPlayer ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlayerId(matchedPlayer.id)}
                                  className="font-bold text-slate-900 hover:text-[#1f5922] hover:underline cursor-pointer text-left"
                                >
                                  {ev.title}
                                </button>
                              ) : (
                                <span className="font-bold text-slate-900">{ev.title}</span>
                              )}
                              {teamClub && (
                                <button
                                  type="button"
                                  onClick={() => openClubSquad(teamClub.id, world.clubs)}
                                  className="ml-1.5 text-[10px] font-bold text-slate-500 hover:text-[#1f5922] hover:underline cursor-pointer"
                                >
                                  ({teamClub.shortName})
                                </button>
                              )}
                              {ev.description && (
                                <p className="text-[10.5px] text-slate-600 leading-snug">
                                  {ev.description}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {injuriesList.length > 0 && (
                  <div className="bg-[#fef6f6] border border-rose-300 rounded-sm p-3">
                    <div className="text-[10.5px] font-black uppercase text-rose-800 mb-1.5 flex items-center gap-1.5">
                      <Activity size={13} className="text-rose-700" /> Parte Médico del Encuentro
                    </div>
                    <div className="space-y-1">
                      {injuriesList.map((inj) => {
                        const injClub = inj.side === 'home' ? homeTeam : awayTeam;
                        return (
                          <div key={inj.id} className="text-xs text-slate-800">
                            <button
                              type="button"
                              onClick={() => setSelectedPlayerId(inj.id)}
                              className="font-bold hover:text-[#1f5922] hover:underline cursor-pointer"
                            >
                              {inj.name}
                            </button>{' '}
                            (
                            <button
                              type="button"
                              onClick={() => openClubSquad(injClub.id, world.clubs)}
                              className="font-semibold hover:text-[#1f5922] hover:underline cursor-pointer"
                            >
                              {injClub.shortName}
                            </button>
                            ) ·{' '}
                            <span className="text-rose-800 font-semibold">
                              {inj.injuryLabel || 'Molestia física'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </FmCollapsibleSection>

            {/* 4. MAPAS DE TIROS, CALOR Y RED DE PASES */}
            {optaSnapshot && (
              <PostMatchAdvancedSections
                snapshot={optaSnapshot}
                homeColor={homeBarColor}
                awayColor={awayBarColor}
                isMapsOpen={openSections.mapas}
                onToggleMaps={() => toggleSection('mapas')}
                onSelectPlayerId={setSelectedPlayerId}
              />
            )}

            {/* Footer Continue CTA */}
            <div className="pt-2 space-y-1.5">
              {pressDelegateName && (
                <p className="text-[10px] text-center font-bold uppercase tracking-wide text-slate-700">
                  Rueda de prensa delegada automáticamente a {pressDelegateName}
                </p>
              )}
              <FMButton onClick={onContinue} className="w-full py-3">
                Continuar <ChevronRight size={14} />
              </FMButton>
            </div>
          </div>
        </div>
      </div>

      {/* Player Match Detail Modal (Stats + Rating Breakdown + Performance Narrative) */}
      {selectedEntry && (
        <PlayerMatchDetailModal
          player={selectedEntry}
          club={selectedEntry.side === 'home' ? homeTeam : awayTeam}
          isMotm={Boolean(motmEntry && motmEntry.id === selectedEntry.id)}
          teamGoalsAgainst={selectedEntry.side === 'home' ? awayScore : homeScore}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  );
};
