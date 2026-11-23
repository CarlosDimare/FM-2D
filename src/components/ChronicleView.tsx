import React, { useMemo, useState } from 'react';
import { Chronicle, ChronicleType, Club, Player } from '../types';
import { world } from '../services/worldManager';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { useUIStore } from '../stores/uiStore';
import { FMEmptyState } from './FMUI';
import { SoccerBallIcon } from './postMatch/PlayerMatchDetailModal';
import { BookOpen, ArrowLeft, Calendar, Trophy, FileText, Award } from 'lucide-react';

interface ChronicleViewProps {
  onBack: () => void;
  clubId?: string;
}

const TYPE_ICONS: Record<ChronicleType, React.ReactNode> = {
  MATCH: <FileText size={13} className="text-blue-600 shrink-0" />,
  MONTHLY: <Calendar size={13} className="text-green-600 shrink-0" />,
  TOURNAMENT: <Trophy size={13} className="text-amber-600 shrink-0" />,
  CAREER: <Award size={13} className="text-purple-600 shrink-0" />,
};

const TYPE_LABELS: Record<ChronicleType, string> = {
  MATCH: 'Partido',
  MONTHLY: 'Mensual',
  TOURNAMENT: 'Torneo',
  CAREER: 'Carrera',
};

interface MatchedEntity {
  label: string;
  player?: Player;
  club?: Club;
}

const GOAL_LINE_REGEX = /(?:abrió el marcador en el minuto|Golazo de\b|define con clase en el minuto|Tiro imparable de\b|marc[aó] en el minuto|Cabezazo certero de\b|fusila al arquero en el minuto|anot[aó] en el minuto|Los goles del partido:)/i;

function isGoalLine(line: string): boolean {
  if (/no tuvo goles|sin goles/i.test(line)) return false;
  return GOAL_LINE_REGEX.test(line);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const ChronicleView: React.FC<ChronicleViewProps> = ({ onBack: _onBack, clubId }) => {
  const [filter, setFilter] = useState<ChronicleType | 'ALL'>('ALL');
  const [selectedChronicle, setSelectedChronicle] = useState<Chronicle | null>(null);
  const fixtures = useGameStore(s => s.fixtures);
  const tick = useWorldStore(s => s._tick);
  const { setSelectedPlayer, setViewExternalClub, setView } = useUIStore();

  const controlledNationalTeamId = world.nationalTeamManager?.controlledTeamId;

  // Strictly show ONLY chronicles belonging to the user's actual played SENIOR club matches
  // or a National Team that the user is actively managing (never background Reserve/U20 or AI National Teams).
  const allChronicles = world.chronicles.filter(c => {
    const isControlledNT = Boolean(controlledNationalTeamId && c.nationalTeamId === controlledNationalTeamId);
    const isUserClub = Boolean(clubId && c.clubId === clubId && !c.nationalTeamId);
    if (!isUserClub && !isControlledNT) return false;

    if (c.type === 'MATCH' && c.fixtureId) {
      const fx = fixtures.find(f => f.id === c.fixtureId);
      if (fx) {
        if (!fx.played) return false;
        if (isUserClub && fx.squadType !== 'SENIOR') return false;
        if (isUserClub && fx.homeTeamId !== clubId && fx.awayTeamId !== clubId) return false;
      }
    }
    return true;
  });

  const filtered = filter === 'ALL' ? allChronicles : allChronicles.filter(c => c.type === filter);

  const sortedChronicles = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filtered]
  );

  // Fast single-pass proper-name index for all visible chronicles (clubs, national teams, players, staff)
  const entityMatcher = useMemo(() => {
    if (sortedChronicles.length === 0) return null;
    const corpus = sortedChronicles.map(c => `${c.title}\n${c.body}`).join('\n');
    const map = new Map<string, MatchedEntity>();

    const register = (label: string | undefined, payload: Omit<MatchedEntity, 'label'>) => {
      const clean = label?.trim();
      if (!clean || clean.length < 3) return;
      if (!corpus.includes(clean)) return;
      if (!map.has(clean)) {
        map.set(clean, { label: clean, ...payload });
      }
    };

    for (const club of world.clubs) {
      register(club.name, { club });
    }
    for (const nt of world.nationalTeamManager?.nationalTeams || []) {
      register(nt.name, {});
    }
    if (world.managerProfile?.fullName) {
      register(world.managerProfile.fullName, {});
    }
    for (const p of world.players) {
      register(p.name, { player: p });
    }
    for (const s of world.staff) {
      register(s.name, {});
    }

    if (map.size === 0) return null;
    const names = Array.from(map.keys()).sort((a, b) => b.length - a.length);
    const regex = new RegExp(
      `(?<=^|[^a-zA-Z\\u00C0-\\u024F0-9_])(${names.map(escapeRegex).join('|')})(?=$|[^a-zA-Z\\u00C0-\\u024F0-9_])`,
      'g'
    );
    return { map, regex };
  }, [sortedChronicles, tick]);

  const renderRichText = (text: string, interactive: boolean) => {
    if (!entityMatcher || !text) return text;
    const { map, regex } = entityMatcher;
    regex.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIdx = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      const token = match[0];
      const entity = map.get(token);
      if (interactive && entity?.player) {
        const targetPlayer = entity.player;
        nodes.push(
          <button
            key={`ent-${keyIdx++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPlayer(targetPlayer);
            }}
            className="font-bold text-[#1d431e] hover:underline cursor-pointer inline"
          >
            {token}
          </button>
        );
      } else if (interactive && entity?.club) {
        const targetClub = entity.club;
        nodes.push(
          <button
            key={`ent-${keyIdx++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setViewExternalClub(targetClub, 'CHRONICLES');
              setView('EXTERNAL_CLUB');
            }}
            className="font-bold text-slate-950 hover:text-[#1d431e] hover:underline cursor-pointer inline"
          >
            {token}
          </button>
        );
      } else {
        nodes.push(
          <strong key={`ent-${keyIdx++}`} className="font-bold text-slate-950">
            {token}
          </strong>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }
    return nodes.length > 0 ? nodes : text;
  };

  const getNationalTeamName = (teamId?: string) =>
    teamId
      ? world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === teamId)?.name || teamId
      : undefined;

  const getMatchSummary = (chronicle: Chronicle) => {
    if (chronicle.type !== 'MATCH' || !chronicle.fixtureId) return null;
    const fx = fixtures.find(f => f.id === chronicle.fixtureId);
    if (!fx) return null;

    const teamId = chronicle.nationalTeamId || chronicle.clubId || clubId;
    if (!teamId || (fx.homeTeamId !== teamId && fx.awayTeamId !== teamId)) return null;

    const isHome = fx.homeTeamId === teamId;
    const us = isHome ? (fx.homeScore ?? 0) : (fx.awayScore ?? 0);
    const them = isHome ? (fx.awayScore ?? 0) : (fx.homeScore ?? 0);
    const penUs = isHome ? fx.penaltyHome : fx.penaltyAway;
    const penThem = isHome ? fx.penaltyAway : fx.penaltyHome;
    const oppId = isHome ? fx.awayTeamId : fx.homeTeamId;
    const oppName = chronicle.nationalTeamId
      ? getNationalTeamName(oppId) || oppId
      : world.getClub(oppId)?.name || oppId;

    let resultLabel = 'Empate';
    let badgeClass = 'bg-amber-50 text-amber-800 border-amber-300';
    if (us > them) {
      resultLabel = 'Victoria';
      badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
    } else if (us < them) {
      resultLabel = 'Derrota';
      badgeClass = 'bg-rose-50 text-rose-800 border-rose-300';
    } else if (penUs !== undefined && penThem !== undefined && penUs !== penThem) {
      if (penUs > penThem) {
        resultLabel = 'Victoria (p.)';
        badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
      } else {
        resultLabel = 'Derrota (p.)';
        badgeClass = 'bg-rose-50 text-rose-800 border-rose-300';
      }
    }

    const scoreText =
      penUs !== undefined && penThem !== undefined
        ? `${us}-${them} (${penUs}-${penThem} p.)`
        : `${us}-${them}`;

    return { resultLabel, badgeClass, scoreText, oppName };
  };

  return (
    <div className="flex flex-col h-full bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <header className="bg-gradient-to-b from-[#e2e8f0] to-[#c8d2c8] px-2 py-1.5 sm:px-3 sm:py-2 border-b border-[#a0b0a0] shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="bg-[#3a4a3a] rounded-sm p-1 shrink-0">
            <BookOpen size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-base font-black text-slate-900 uppercase tracking-tighter italic leading-none">
              Crónicas
            </h1>
            <p className="hidden sm:block text-[9px] text-slate-500 uppercase tracking-widest">
              Partidos jugados, campañas en torneos e hitos de tu carrera
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar">
          {(['ALL', 'MATCH', 'TOURNAMENT', 'MONTHLY', 'CAREER'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => { setFilter(type); setSelectedChronicle(null); }}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-[2px] border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                filter === type
                  ? 'bg-[#2b5d2c] border-[#142b15] text-white shadow-inner'
                  : 'border-[#6b7280] text-[#1f2428] hover:brightness-105'
              }`}
              style={
                filter === type
                  ? undefined
                  : { background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 50%, #b9bfc6 100%)' }
              }
            >
              {type === 'ALL' ? 'Todas' : type === 'TOURNAMENT' ? 'Torneos' : TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2 sm:p-4">
        {selectedChronicle ? (
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setSelectedChronicle(null)}
              className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-700 hover:text-slate-950 mb-2.5 transition-colors cursor-pointer"
            >
              <ArrowLeft size={12} /> Volver a la lista
            </button>

            <div className="bg-white rounded-sm border border-[#a0b0a0] p-3 sm:p-5 shadow-sm">
              {(() => {
                const matchMeta = getMatchSummary(selectedChronicle);
                return (
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2.5">
                    {TYPE_ICONS[selectedChronicle.type]}
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                      {TYPE_LABELS[selectedChronicle.type]}
                    </span>
                    {matchMeta && (
                      <>
                        <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-sm border ${matchMeta.badgeClass}`}>
                          {matchMeta.resultLabel}
                        </span>
                        <span className="text-[9.5px] font-black text-slate-800">
                          {matchMeta.scoreText} vs <strong className="font-black text-slate-950">{matchMeta.oppName}</strong>
                        </span>
                      </>
                    )}
                    {selectedChronicle.nationalTeamId && (
                      <span className="text-[8.5px] font-black uppercase text-purple-700 border border-purple-200 bg-purple-50 px-1.5 py-0.5 rounded-sm">
                        Selección · <strong className="font-black">{getNationalTeamName(selectedChronicle.nationalTeamId)}</strong>
                      </span>
                    )}
                    <span className="text-[9.5px] text-slate-400 font-mono ml-auto">
                      {new Date(selectedChronicle.date).toLocaleDateString()}
                    </span>
                  </div>
                );
              })()}

              <h2 className="text-[15.5px] sm:text-[20px] font-black uppercase tracking-tight text-slate-900 mb-3 italic leading-snug">
                {renderRichText(selectedChronicle.title, false)}
              </h2>

              <div className="space-y-2.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                {selectedChronicle.body
                  .split(/\n+/)
                  .map(line => line.trim())
                  .filter(Boolean)
                  .map((line, idx) => {
                    const goalLine = isGoalLine(line);
                    return (
                      <p
                        key={idx}
                        className={goalLine ? 'flex items-start gap-2 bg-[#f4f8f4] border-l-2 border-[#2b5d2c] px-2 py-1 rounded-r-sm' : undefined}
                      >
                        {goalLine && <SoccerBallIcon size={14} className="mt-1 shrink-0" />}
                        <span>{renderRichText(line, true)}</span>
                      </p>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2">
            {sortedChronicles.length === 0 ? (
              <FMEmptyState
                icon={<BookOpen size={26} />}
                title="Aún no hay crónicas disponibles"
                subtitle="Juega partidos con tu primer equipo y completa meses de gestión para registrar crónicas de tu carrera."
              />
            ) : (
              sortedChronicles.map(chronicle => {
                const matchMeta = getMatchSummary(chronicle);
                return (
                  <button
                    key={chronicle.id}
                    type="button"
                    onClick={() => setSelectedChronicle(chronicle)}
                    className="w-full text-left bg-white hover:bg-[#f2f7f2] border border-[#a0b0a0] hover:border-[#3a4a3a] rounded-sm p-2.5 sm:p-3.5 transition-all group cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {TYPE_ICONS[chronicle.type]}
                      <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-500">
                        {TYPE_LABELS[chronicle.type]}
                      </span>
                      {matchMeta && (
                        <>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded-sm border ${matchMeta.badgeClass}`}>
                            {matchMeta.resultLabel}
                          </span>
                          <span className="text-[9px] font-black text-slate-800 truncate max-w-[200px] sm:max-w-none">
                            {matchMeta.scoreText} vs <strong className="font-black text-slate-950">{matchMeta.oppName}</strong>
                          </span>
                        </>
                      )}
                      {chronicle.nationalTeamId && (
                        <span className="text-[8px] font-black uppercase text-purple-700 border border-purple-200 bg-purple-50 px-1.5 py-0.5 rounded-sm">
                          Selección · <strong className="font-black">{getNationalTeamName(chronicle.nationalTeamId)}</strong>
                        </span>
                      )}
                      <span className="text-[8.5px] text-slate-400 font-mono ml-auto">
                        {new Date(chronicle.date).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-[12.5px] sm:text-[13.5px] font-black uppercase tracking-tight text-slate-900 group-hover:text-[#2b5d2c] transition-colors italic truncate">
                      {renderRichText(chronicle.title, false)}
                    </h3>
                    <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">
                      {renderRichText(chronicle.body, false)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
