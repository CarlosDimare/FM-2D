import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Calendar,
  FileText,
  Goal,
  ShieldAlert,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  Fixture,
  FixtureMatchReport,
  FixtureMatchReportGoal,
  FixtureMatchReportLineupEntry,
  FixtureMatchReportStats,
  Player,
} from '../types';
import { world } from '../services/worldManager';
import { openClubSquad, useUIStore } from '../stores/uiStore';
import { FmClubShield, getClubHexPalette } from './ClubBannerChrome';

interface FixtureReportModalProps {
  fixture: Fixture | null;
  onClose: () => void;
  userClubId?: string;
}

type ReportTab = 'SUMMARY' | 'LINEUPS' | 'STATS';

const STAGE_TITLES: Record<string, string> = {
  REGULAR: 'Fase Regular',
  GROUP: 'Fase de Grupos',
  ROUND_OF_32: '16avos de Final',
  ROUND_OF_16: 'Octavos de Final',
  QUARTER_FINAL: 'Cuartos de Final',
  SEMI_FINAL: 'Semifinal',
  FINAL: 'Final',
};

function getShotLabel(shotType?: string): string {
  switch (shotType) {
    case 'penalty':
      return '(Penal)';
    case 'free_kick':
      return '(Tiro libre)';
    case 'corner_header':
    case 'header':
      return '(Cabeza)';
    case 'long_range':
      return '(Media dist.)';
    case 'curler':
      return '(Con comba)';
    case 'volley':
      return '(Volea)';
    case 'chip':
      return '(Vaselina)';
    default:
      return '';
  }
}

function buildFallbackLineup(
  teamId: string,
  squadType: string,
  goalsScored: number,
  goalsConceded: number,
  seed: number,
  existingGoals: FixtureMatchReportGoal[]
): FixtureMatchReportLineupEntry[] {
  const raw = world
    .getPlayersByClub(teamId)
    .filter((p) => p.squad === squadType);
  const pool =
    raw.length >= 11
      ? raw
      : world.getPlayersByClub(teamId).length > 0
      ? world.getPlayersByClub(teamId)
      : world.getPlayersByNationalTeam(teamId);

  const sorted = [...pool]
    .sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || (b.currentAbility || 0) - (a.currentAbility || 0))
    .slice(0, 14);

  const goalCountByPlayer = new Map<string, number>();
  existingGoals
    .filter((g) => g.teamId === teamId)
    .forEach((g) => {
      const key = g.playerId || g.playerName;
      goalCountByPlayer.set(key, (goalCountByPlayer.get(key) || 0) + 1);
    });

  return sorted.map((p, idx) => {
    const isStarter = idx < 11;
    const isSubUsed = !isStarter && idx < 13;
    const minutesPlayed = isStarter ? (idx >= 9 && isSubUsed ? 72 : 90) : isSubUsed ? 18 : 0;
    const goals = (goalCountByPlayer.get(p.id) || goalCountByPlayer.get(p.name) || 0);
    const resultDelta = goalsScored > goalsConceded ? 0.35 : goalsScored < goalsConceded ? -0.25 : 0;
    const jitter = (((seed + idx * 13) % 9) - 4) * 0.1;
    const rating =
      minutesPlayed > 0
        ? Number(Math.max(5.3, Math.min(9.6, 6.4 + resultDelta + goals * 0.9 + jitter)).toFixed(1))
        : 0;
    return {
      playerId: p.id,
      playerName: p.name,
      role: p.primaryPosition || p.positions[0] || 'MC',
      isStarter,
      minutesPlayed,
      rating,
      goals,
      assists: 0,
    };
  });
}

function buildFallbackStats(
  homeScore: number,
  awayScore: number,
  seed: number,
  baseHomeShots?: number,
  baseAwayShots?: number
): FixtureMatchReportStats {
  const hPoss = 42 + (seed % 17);
  const hShots = baseHomeShots ?? Math.max(homeScore + 2, 7 + (seed % 9));
  const aShots = baseAwayShots ?? Math.max(awayScore + 2, 6 + ((seed + 5) % 8));
  const hOnTarget = Math.max(homeScore, Math.min(hShots, Math.round(hShots * 0.42)));
  const aOnTarget = Math.max(awayScore, Math.min(aShots, Math.round(aShots * 0.42)));
  return {
    homePossession: hPoss,
    awayPossession: 100 - hPoss,
    homeShots: hShots,
    awayShots: aShots,
    homeShotsOnTarget: hOnTarget,
    awayShotsOnTarget: aOnTarget,
    homeCorners: Math.max(1, Math.round(hShots * 0.45)),
    awayCorners: Math.max(1, Math.round(aShots * 0.45)),
    homeFouls: 8 + (seed % 7),
    awayFouls: 8 + ((seed + 3) % 7),
    homeOffsides: seed % 4,
    awayOffsides: (seed + 2) % 4,
  };
}

function resolvePlayer(playerId?: string, playerName?: string, teamId?: string): Player | undefined {
  if (playerId) {
    const byId = world.getPlayer(playerId);
    if (byId) return byId;
  }
  if (!playerName) return undefined;
  if (teamId) {
    const inClub = world
      .getPlayersByClub(teamId)
      .find((p) => p.name.toLowerCase() === playerName.toLowerCase());
    if (inClub) return inClub;
  }
  return world.players.find((p) => p.name.toLowerCase() === playerName.toLowerCase());
}

export const FixtureReportModal: React.FC<FixtureReportModalProps> = ({
  fixture,
  onClose,
  userClubId,
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('SUMMARY');

  useEffect(() => {
    setActiveTab('SUMMARY');
  }, [fixture?.id]);

  const chronicle = useMemo(() => {
    if (!fixture) return undefined;
    return world.chronicles.find((c) => c.fixtureId === fixture.id);
  }, [fixture?.id]);

  const homeClub = fixture ? world.getClub(fixture.homeTeamId) : undefined;
  const awayClub = fixture ? world.getClub(fixture.awayTeamId) : undefined;
  const competition = fixture ? world.competitions.find((c) => c.id === fixture.competitionId) : undefined;

  const report = useMemo<FixtureMatchReport | null>(() => {
    if (!fixture) return null;
    const hScore = fixture.homeScore ?? 0;
    const aScore = fixture.awayScore ?? 0;
    const seed = fixture.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    if (fixture.matchReport) {
      const stored = fixture.matchReport;
      const homeLineup =
        stored.homeLineup && stored.homeLineup.length > 0
          ? stored.homeLineup
          : buildFallbackLineup(fixture.homeTeamId, fixture.squadType, hScore, aScore, seed, stored.goals || []);
      const awayLineup =
        stored.awayLineup && stored.awayLineup.length > 0
          ? stored.awayLineup
          : buildFallbackLineup(fixture.awayTeamId, fixture.squadType, aScore, hScore, seed + 17, stored.goals || []);
      const stats =
        stored.stats ||
        buildFallbackStats(hScore, aScore, seed, stored.homeShots, stored.awayShots);
      const homeTactic = '4-4-2';
      const awayTactic = '4-4-2';
      return {
        ...stored,
        homeFormation: stored.homeFormation || homeTactic || '4-4-2',
        awayFormation: stored.awayFormation || awayTactic || '4-4-2',
        stats,
        homeLineup,
        awayLineup,
      };
    }

    const pickScorers = (teamId: string, count: number, offsetSeed: number): FixtureMatchReportGoal[] => {
      if (count <= 0) return [];
      const squad = world
        .getPlayersByClub(teamId)
        .filter((p) => p.squad === fixture.squadType && !p.positions.includes('P' as any))
        .sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || (b.currentAbility || 0) - (a.currentAbility || 0))
        .slice(0, 7);
      const res: FixtureMatchReportGoal[] = [];
      for (let i = 0; i < count; i++) {
        const scorer = squad.length > 0 ? squad[(offsetSeed + i * 2) % squad.length] : undefined;
        const minute = Math.min(90, 8 + ((offsetSeed * 7 + i * 19) % 79));
        res.push({
          minute,
          playerId: scorer?.id,
          playerName: scorer?.name || (teamId === fixture.homeTeamId ? 'Atacante local' : 'Atacante visitante'),
          teamId,
        });
      }
      return res;
    };

    const syntheticGoals = [
      ...pickScorers(fixture.homeTeamId, hScore, seed),
      ...pickScorers(fixture.awayTeamId, aScore, seed + 11),
    ].sort((a, b) => a.minute - b.minute);

    const winnerTeamId = hScore >= aScore ? fixture.homeTeamId : fixture.awayTeamId;
    const mvpPool = world
      .getPlayersByClub(winnerTeamId)
      .filter((p) => p.squad === fixture.squadType)
      .sort((a, b) => (b.currentAbility || 0) - (a.currentAbility || 0));

    const homeLineup = buildFallbackLineup(fixture.homeTeamId, fixture.squadType, hScore, aScore, seed, syntheticGoals);
    const awayLineup = buildFallbackLineup(fixture.awayTeamId, fixture.squadType, aScore, hScore, seed + 17, syntheticGoals);
    const stats = buildFallbackStats(hScore, aScore, seed);

    return {
      goals: syntheticGoals,
      cards: [],
      mvp: mvpPool[0]
        ? {
            playerId: mvpPool[0].id,
            playerName: mvpPool[0].name,
            teamId: winnerTeamId,
            rating: Number((7.2 + ((seed % 14) / 10)).toFixed(1)),
          }
        : undefined,
      homeShots: stats.homeShots,
      awayShots: stats.awayShots,
      homeFormation: '4-4-2',
      awayFormation: '4-4-2',
      stats,
      homeLineup,
      awayLineup,
    };
  }, [fixture]);

  if (!fixture || !fixture.played) return null;

  const homeName = homeClub?.name || fixture.homeTeamId;
  const awayName = awayClub?.name || fixture.awayTeamId;
  const homePalette = getClubHexPalette(homeClub, '#2b5d2c', '#f8fafc');
  const awayPalette = getClubHexPalette(awayClub, '#334155', '#f8fafc');

  const homeGoals = (report?.goals || []).filter((g) => g.teamId === fixture.homeTeamId);
  const awayGoals = (report?.goals || []).filter((g) => g.teamId === fixture.awayTeamId);
  const allCards = report?.cards || [];
  const hasPenalties =
    typeof fixture.penaltyHome === 'number' && typeof fixture.penaltyAway === 'number';

  const handleOpenPlayer = (playerId?: string, playerName?: string, teamId?: string) => {
    const p = resolvePlayer(playerId, playerName, teamId);
    if (p) {
      useUIStore.getState().setSelectedPlayer(p);
    }
  };

  const handleOpenClub = (clubId?: string) => {
    if (!clubId) return;
    const c = world.getClub(clubId);
    if (!c) return;
    onClose();
    openClubSquad(clubId, world.clubs);
  };

  const renderClickablePlayer = (
    label: string,
    playerId?: string,
    teamId?: string,
    className = 'font-bold text-slate-900 hover:text-[#1f5922] hover:underline cursor-pointer truncate text-left'
  ) => {
    const resolved = resolvePlayer(playerId, label, teamId);
    if (!resolved) {
      return <span className="font-bold text-slate-800 truncate">{label}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => useUIStore.getState().setSelectedPlayer(resolved)}
        className={className}
        title={`Ver ficha de ${resolved.name}`}
      >
        {label}
      </button>
    );
  };

  const stats = report?.stats;
  const statRows = stats
    ? [
        {
          label: 'Posesión',
          homeVal: `${stats.homePossession}%`,
          awayVal: `${stats.awayPossession}%`,
          homeNum: stats.homePossession,
          awayNum: stats.awayPossession,
        },
        ...(stats.homeXg !== undefined && stats.awayXg !== undefined
          ? [
              {
                label: 'Goles Esperados (xG)',
                homeVal: stats.homeXg.toFixed(2),
                awayVal: stats.awayXg.toFixed(2),
                homeNum: stats.homeXg,
                awayNum: stats.awayXg,
              },
            ]
          : []),
        {
          label: 'Remates Totales',
          homeVal: `${stats.homeShots}`,
          awayVal: `${stats.awayShots}`,
          homeNum: stats.homeShots,
          awayNum: stats.awayShots,
        },
        {
          label: 'Remates al Arco',
          homeVal: `${stats.homeShotsOnTarget}`,
          awayVal: `${stats.awayShotsOnTarget}`,
          homeNum: stats.homeShotsOnTarget,
          awayNum: stats.awayShotsOnTarget,
        },
        {
          label: 'Tiros de Esquina (Córners)',
          homeVal: `${stats.homeCorners}`,
          awayVal: `${stats.awayCorners}`,
          homeNum: stats.homeCorners,
          awayNum: stats.awayCorners,
        },
        {
          label: 'Faltas Cometidas',
          homeVal: `${stats.homeFouls}`,
          awayVal: `${stats.awayFouls}`,
          homeNum: stats.homeFouls,
          awayNum: stats.awayFouls,
        },
        {
          label: 'Fueras de Juego',
          homeVal: `${stats.homeOffsides}`,
          awayVal: `${stats.awayOffsides}`,
          homeNum: stats.homeOffsides,
          awayNum: stats.awayOffsides,
        },
      ]
    : [];

  const renderLineupCard = (
    clubName: string,
    clubId: string,
    formation: string | undefined,
    entries: FixtureMatchReportLineupEntry[]
  ) => {
    const starters = entries.filter((e) => e.isStarter).slice(0, 11);
    const subs = entries.filter((e) => !e.isStarter);
    const hasClub = Boolean(world.getClub(clubId));

    const renderRow = (entry: FixtureMatchReportLineupEntry, i: number) => {
      const ratingColor =
        entry.minutesPlayed <= 0
          ? 'bg-slate-100 text-slate-400 border-slate-200'
          : entry.rating >= 7.5
          ? 'bg-[#1f5922] text-white border-[#133815]'
          : entry.rating >= 6.5
          ? 'bg-[#e3ebe3] text-slate-900 border-[#9db09d]'
          : 'bg-rose-100 text-rose-900 border-rose-300';
      return (
        <div
          key={`${entry.playerId || entry.playerName}-${i}`}
          className={`px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] ${
            i % 2 === 0 ? 'bg-white' : 'bg-[#f4f8f4]'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-7 text-center px-1 py-0.5 rounded-[2px] bg-[#dfe6df] border border-[#b4c2b4] text-[9px] font-black text-slate-700 shrink-0">
              {entry.role}
            </span>
            {renderClickablePlayer(entry.playerName, entry.playerId, clubId)}
            {entry.goals > 0 && (
              <span className="px-1 py-0 bg-emerald-100 border border-emerald-300 rounded-[2px] text-[9px] font-black text-emerald-800 shrink-0">
                ⚽{entry.goals > 1 ? `×${entry.goals}` : ''}
              </span>
            )}
            {entry.assists > 0 && (
              <span className="px-1 py-0 bg-sky-100 border border-sky-300 rounded-[2px] text-[9px] font-black text-sky-800 shrink-0">
                A{entry.assists > 1 ? `×${entry.assists}` : ''}
              </span>
            )}
            {entry.card && (
              <span
                className={`inline-block w-2 h-2.5 rounded-[1px] border shrink-0 ${
                  entry.card === 'RED' ? 'bg-red-600 border-red-900' : 'bg-amber-400 border-amber-700'
                }`}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-[9.5px] text-slate-500 tabular-nums">
              {entry.minutesPlayed > 0 ? `${entry.minutesPlayed}'` : 'Sup.'}
            </span>
            <span
              className={`min-w-[30px] text-center px-1.5 py-0.5 rounded-[2px] border font-mono text-[10px] font-black tabular-nums ${ratingColor}`}
            >
              {entry.minutesPlayed > 0 ? entry.rating.toFixed(1) : '—'}
            </span>
          </div>
        </div>
      );
    };

    return (
      <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
        <div className="bg-[#d6ded6] border-b border-[#8e9b90] px-2.5 py-1.5 flex items-center justify-between gap-2">
          {hasClub ? (
            <button
              type="button"
              onClick={() => handleOpenClub(clubId)}
              className="font-black text-xs text-slate-900 hover:text-[#1f5922] hover:underline truncate cursor-pointer text-left"
            >
              {clubName}
            </button>
          ) : (
            <span className="font-black text-xs text-slate-900 truncate">{clubName}</span>
          )}
          {formation && (
            <span className="px-1.5 py-0.5 rounded-[2px] bg-[#2d3238] text-[#facc15] font-mono text-[9.5px] font-bold shrink-0">
              {formation}
            </span>
          )}
        </div>
        <div className="divide-y divide-[#e6ece6]">
          {starters.map((e, i) => renderRow(e, i))}
        </div>
        {subs.length > 0 && (
          <>
            <div className="bg-[#edf2ed] border-y border-[#c5d0c5] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600">
              Suplentes ({subs.length})
            </div>
            <div className="divide-y divide-[#e6ece6]">
              {subs.map((e, i) => renderRow(e, i))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[960] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] bg-[#e8ece8] border border-[#1c1f24] rounded-sm shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div
          className="px-3.5 py-2.5 border-b border-[#14171a] flex items-center justify-between gap-2 text-white shrink-0"
          style={{ background: 'linear-gradient(180deg, #434950 0%, #262b30 100%)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Trophy size={15} className="text-[#facc15] shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wider truncate">
                {chronicle ? 'Crónica e Informe Post-Partido' : 'Informe Post-Partido'}
              </div>
              <div className="text-[9.5px] text-slate-300 flex items-center gap-1.5 truncate">
                <span>{competition?.name || fixture.competitionId}</span>
                <span>·</span>
                <span>{STAGE_TITLES[fixture.stage] || fixture.stage}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar size={10} />
                  {new Date(fixture.date).toLocaleDateString('es-AR')}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded bg-[#1b1f23] hover:bg-[#991b1b] text-slate-200 hover:text-white border border-white/15 cursor-pointer"
            aria-label="Cerrar informe"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scoreboard Banner */}
        <div
          className="px-4 py-3.5 border-b border-[#8e9b90] shrink-0 text-white relative overflow-hidden"
          style={{
            background: `linear-gradient(90deg, ${homePalette.primary}dd 0%, #1c2228 42%, #1c2228 58%, ${awayPalette.primary}dd 100%)`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleOpenClub(fixture.homeTeamId)}
              disabled={!homeClub}
              className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right cursor-pointer disabled:cursor-default group"
              title={homeClub ? `Ver plantilla de ${homeName}` : undefined}
            >
              <div className="min-w-0">
                <div
                  className={`text-xs sm:text-base font-black truncate group-hover:underline ${
                    fixture.homeTeamId === userClubId ? 'text-[#facc15]' : 'text-white'
                  }`}
                >
                  {homeName}
                </div>
                <div className="text-[9px] uppercase font-bold text-slate-300">
                  Local {report?.homeFormation ? `· ${report.homeFormation}` : ''}
                </div>
              </div>
              <FmClubShield club={homeClub} size="sm" />
            </button>

            <div className="shrink-0 px-3 sm:px-4 py-1.5 rounded-sm bg-[#111519]/90 border border-white/25 text-center shadow-lg">
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums tracking-wider text-[#facc15] leading-none">
                {fixture.homeScore ?? 0} - {fixture.awayScore ?? 0}
              </div>
              {hasPenalties && (
                <div className="text-[9px] font-black font-mono text-amber-200 mt-1">
                  Penales ({fixture.penaltyHome} - {fixture.penaltyAway})
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleOpenClub(fixture.awayTeamId)}
              disabled={!awayClub}
              className="flex-1 min-w-0 flex items-center justify-start gap-2 text-left cursor-pointer disabled:cursor-default group"
              title={awayClub ? `Ver plantilla de ${awayName}` : undefined}
            >
              <FmClubShield club={awayClub} size="sm" />
              <div className="min-w-0">
                <div
                  className={`text-xs sm:text-base font-black truncate group-hover:underline ${
                    fixture.awayTeamId === userClubId ? 'text-[#facc15]' : 'text-white'
                  }`}
                >
                  {awayName}
                </div>
                <div className="text-[9px] uppercase font-bold text-slate-300">
                  Visitante {report?.awayFormation ? `· ${report.awayFormation}` : ''}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Report Section Tabs */}
        <div className="px-3 py-1.5 bg-[#bcc8bc] border-b border-[#8e9b90] grid grid-cols-3 gap-1 shrink-0">
          {[
            { id: 'SUMMARY' as const, label: 'Resumen y Crónica', Icon: FileText },
            { id: 'LINEUPS' as const, label: 'Formaciones y Notas', Icon: Users },
            { id: 'STATS' as const, label: 'Estadísticas', Icon: BarChart3 },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-2 py-1.5 rounded-[2px] text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === id
                  ? 'bg-[#2b5d2c] text-white shadow-xs'
                  : 'bg-[#e8ece8] text-slate-800 hover:bg-white'
              }`}
            >
              <Icon size={12} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 sm:p-4 space-y-3 bg-[#f4f7f4]">
          {activeTab === 'SUMMARY' && (
            <>
              {/* Chronicle Narrative (when available) */}
              {chronicle && (
                <div className="bg-white border border-[#96a696] rounded-sm p-3.5 shadow-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#2b5d2c]">
                    <FileText size={13} />
                    <span>Crónica Oficial</span>
                  </div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                    {chronicle.title}
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {chronicle.body}
                  </p>
                </div>
              )}

              {/* Goalscorers Breakdown */}
              <div className="bg-white border border-[#96a696] rounded-sm p-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#dbe3db] pb-1.5 mb-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700">
                    <Goal size={13} className="text-[#2b5d2c]" />
                    Goleadores del Encuentro
                  </span>
                  {stats && (
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      Posesión {stats.homePossession}%-{stats.awayPossession}% · Remates {stats.homeShots}-{stats.awayShots}
                    </span>
                  )}
                </div>

                {homeGoals.length === 0 && awayGoals.length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic text-center py-2">
                    Partido cerrado sin goles en el tiempo reglamentario.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => handleOpenClub(fixture.homeTeamId)}
                        className="text-[9px] font-black uppercase text-slate-500 hover:text-[#1f5922] hover:underline cursor-pointer text-left"
                      >
                        {homeClub?.shortName || homeName}
                      </button>
                      {homeGoals.length > 0 ? (
                        homeGoals.map((g, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-slate-800">
                            <span className="font-mono font-black text-[#2b5d2c] w-7 shrink-0">
                              {g.minute}&apos;
                            </span>
                            {renderClickablePlayer(g.playerName, g.playerId, fixture.homeTeamId)}
                            {g.shotType && (
                              <span className="text-[9.5px] text-slate-500 shrink-0">
                                {getShotLabel(g.shotType)}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-400 italic">Sin goles</div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => handleOpenClub(fixture.awayTeamId)}
                        className="text-[9px] font-black uppercase text-slate-500 hover:text-[#1f5922] hover:underline cursor-pointer text-left"
                      >
                        {awayClub?.shortName || awayName}
                      </button>
                      {awayGoals.length > 0 ? (
                        awayGoals.map((g, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-slate-800">
                            <span className="font-mono font-black text-[#2b5d2c] w-7 shrink-0">
                              {g.minute}&apos;
                            </span>
                            {renderClickablePlayer(g.playerName, g.playerId, fixture.awayTeamId)}
                            {g.shotType && (
                              <span className="text-[9.5px] text-slate-500 shrink-0">
                                {getShotLabel(g.shotType)}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-400 italic">Sin goles</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* MVP & Discipline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {report?.mvp && (
                  <div className="bg-white border border-[#96a696] rounded-sm p-3 shadow-xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1.5">
                      <Award size={13} />
                      Figura del Partido (MVP)
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        {renderClickablePlayer(
                          report.mvp.playerName,
                          report.mvp.playerId,
                          report.mvp.teamId,
                          'text-xs font-black text-slate-900 hover:text-[#1f5922] hover:underline cursor-pointer truncate block text-left'
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenClub(report.mvp!.teamId)}
                          className="text-[10px] font-bold text-slate-500 hover:text-[#1f5922] hover:underline cursor-pointer text-left truncate block"
                        >
                          {world.getClub(report.mvp.teamId)?.name || 'Club'}
                        </button>
                      </div>
                      <span className="px-2 py-1 rounded-[2px] bg-[#2b5d2c] text-white font-mono font-black text-xs shrink-0">
                        {report.mvp.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="bg-white border border-[#96a696] rounded-sm p-3 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    <ShieldAlert size={13} className="text-amber-600" />
                    Incidencias Disciplinarias
                  </div>
                  {allCards.length > 0 ? (
                    <div className="space-y-1 max-h-28 overflow-y-auto text-[10.5px]">
                      {allCards.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-3.5 rounded-[1px] shrink-0 border ${
                              c.type === 'RED'
                                ? 'bg-red-600 border-red-800'
                                : 'bg-amber-400 border-amber-600'
                            }`}
                          />
                          <span className="font-mono font-bold text-slate-500 w-7 shrink-0">
                            {c.minute}&apos;
                          </span>
                          {renderClickablePlayer(c.playerName, c.playerId, c.teamId)}
                          <button
                            type="button"
                            onClick={() => handleOpenClub(c.teamId)}
                            className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline shrink-0 cursor-pointer"
                          >
                            ({world.getClub(c.teamId)?.shortName || ''})
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-slate-500 italic">
                      Sin tarjetas registradas en el acta del encuentro.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'LINEUPS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderLineupCard(homeName, fixture.homeTeamId, report?.homeFormation, report?.homeLineup || [])}
              {renderLineupCard(awayName, fixture.awayTeamId, report?.awayFormation, report?.awayLineup || [])}
            </div>
          )}

          {activeTab === 'STATS' && stats && (
            <div className="bg-white border border-[#96a696] rounded-sm p-3.5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#dde5dd] pb-2 text-xs font-black text-slate-900">
                <button
                  type="button"
                  onClick={() => handleOpenClub(fixture.homeTeamId)}
                  className="hover:text-[#1f5922] hover:underline cursor-pointer truncate text-left"
                >
                  {homeName}
                </button>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Estadísticas</span>
                <button
                  type="button"
                  onClick={() => handleOpenClub(fixture.awayTeamId)}
                  className="hover:text-[#1f5922] hover:underline cursor-pointer truncate text-right"
                >
                  {awayName}
                </button>
              </div>
              <div className="space-y-2.5">
                {statRows.map((row, idx) => {
                  const total = row.homeNum + row.awayNum;
                  const hPct = total > 0 ? Math.round((row.homeNum / total) * 100) : 50;
                  const aPct = 100 - hPct;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="font-mono text-slate-900 tabular-nums">{row.homeVal}</span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-600">{row.label}</span>
                        <span className="font-mono text-slate-900 tabular-nums">{row.awayVal}</span>
                      </div>
                      <div className="h-2 w-full rounded-[2px] overflow-hidden bg-[#dde4dd] flex">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${hPct}%`,
                            backgroundColor: homePalette.isLightPrimary ? '#1f5922' : homePalette.primary,
                          }}
                        />
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${aPct}%`,
                            backgroundColor: awayPalette.isLightPrimary ? '#475569' : awayPalette.primary,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
