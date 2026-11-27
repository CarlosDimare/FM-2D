import React, { useEffect, useMemo, useState } from 'react';
import { Competition, Fixture, Player } from '../types';
import { world } from '../services/worldManager';
import { LeagueTable } from './LeagueTable';
import { Calendar, ListOrdered, Goal, Trophy, Zap, Star, LayoutGrid, UserCheck, ChevronDown, Filter } from 'lucide-react';
import { FMBox, FMTable, FMTableCell } from './FMUI';
import { useUIStore } from '../stores/uiStore';
import { FixtureReportModal } from './FixtureReportModal';
import { DOMESTIC_CUP_CONFIGS, getCupSeededEntrants } from '../services/domesticCupFormats';
import { getFlagUrl } from '../data/static';
import { FmClubShield } from './ClubBannerChrome';

interface TournamentHubProps {
  competition: Competition;
  fixtures: Fixture[];
  userClubId: string;
  allCups?: Competition[];
  onSelectCompetition?: (id: string) => void;
}

const NATIONAL_TEAM_NAMES: Record<string, string> = {
  'ARG': 'Argentina', 'BRA': 'Brazil', 'URU': 'Uruguay', 'COL': 'Colombia', 'CHL': 'Chile',
  'ECU': 'Ecuador', 'PAR': 'Paraguay', 'PER': 'Peru', 'BOL': 'Bolivia', 'VEN': 'Venezuela',
  'FRA': 'France', 'ESP': 'Spain', 'ENG': 'England', 'DEU': 'Germany', 'ITA': 'Italy',
  'NLD': 'Netherlands', 'BEL': 'Belgium', 'PRT': 'Portugal', 'HRV': 'Croatia', 'CHE': 'Switzerland',
  'AUT': 'Austria', 'DNK': 'Denmark', 'SWE': 'Sweden', 'NOR': 'Norway', 'POL': 'Poland',
  'UKR': 'Ukraine', 'SRB': 'Serbia', 'TUR': 'Turkey', 'RUS': 'Russia',
  'MEX': 'Mexico', 'USA': 'USA', 'CAN': 'Canada',
  'JPN': 'Japan', 'KOR': 'South Korea', 'AUS': 'Australia', 'SAU': 'Saudi Arabia',
  'MAR': 'Morocco', 'SEN': 'Senegal', 'NGA': 'Nigeria', 'EGY': 'Egypt', 'GHA': 'Ghana',
  'CMR': 'Cameroon', 'CIV': 'Ivory Coast', 'TUN': 'Tunisia',
};

const getTeamName = (id: string): string => {
  if (NATIONAL_TEAM_NAMES[id]) return NATIONAL_TEAM_NAMES[id];
  return world.getClub(id)?.name || id;
};

const getTeamShort = (id: string): string => {
  if (NATIONAL_TEAM_NAMES[id]) return NATIONAL_TEAM_NAMES[id];
  return world.getClub(id)?.shortName || world.getClub(id)?.name || id;
};

const STAGE_ORDER = [
  'ROUND_OF_64',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINAL',
  'SEMI_FINAL',
  'FINAL',
] as const;

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Fase de Grupos',
  ROUND_OF_64: '32avos',
  ROUND_OF_32: '16avos',
  ROUND_OF_16: 'Octavos',
  QUARTER_FINAL: 'Cuartos',
  SEMI_FINAL: 'Semifinal',
  FINAL: 'Final',
};

export const TournamentHub: React.FC<TournamentHubProps> = ({
  competition,
  fixtures,
  userClubId,
  allCups,
  onSelectCompetition,
}) => {
  const isCup = competition.type === 'CUP';
  const isContinental = competition.type.startsWith('CONTINENTAL');
  const isNationalTeam = ['WC_Q', 'WC_FINAL', 'COPA', 'EURO', 'AFCON'].includes(competition.id);
  const hasGroupStage = isContinental || ['WC_Q', 'WC_FINAL', 'COPA', 'EURO', 'AFCON'].includes(competition.id);
  const hasBracket = isCup || isContinental || competition.type === 'GLOBAL';

  const defaultTabForComp = isCup && !hasGroupStage ? 'BRACKET' : 'TABLE';
  const [activeTab, setActiveTab] = useState<'TABLE' | 'CALENDAR' | 'STATS' | 'BRACKET' | 'AWARDS'>(defaultTabForComp);
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [cupMenuOpen, setCupMenuOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PLAYED' | 'PENDING'>('ALL');
  const [onlyUserClub, setOnlyUserClub] = useState(false);

  useEffect(() => {
    setActiveTab(isCup && !hasGroupStage ? 'BRACKET' : 'TABLE');
    setStageFilter('ALL');
    setStatusFilter('ALL');
    setOnlyUserClub(false);
    setSelectedGroup(0);
    setCupMenuOpen(false);
  }, [competition.id, isCup, hasGroupStage]);

  const openClubSquad = (teamId: string) => {
    const club = world.getClub(teamId);
    if (!club) return;
    const ui = useUIStore.getState();
    ui.setViewExternalClub(club, ui.currentView);
    ui.setView('EXTERNAL_CLUB');
  };

  const openPlayerCard = (p: Player) => {
    useUIStore.getState().setSelectedPlayer(p);
  };

  const competitionFixtures = useMemo(
    () =>
      fixtures
        .filter((f) => f.competitionId === competition.id)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [fixtures, competition.id]
  );

  const cupConfig = DOMESTIC_CUP_CONFIGS[competition.id];

  const seededWaitingClubs = useMemo(() => {
    if (!cupConfig?.entrySeedStage) return [];
    const hasReachedSeedStage = competitionFixtures.some((f) => f.stage === cupConfig.entrySeedStage);
    if (hasReachedSeedStage) return [];
    return getCupSeededEntrants(competition.id, cupConfig.entrySeedStage, competitionFixtures, world.clubs);
  }, [cupConfig, competition.id, competitionFixtures]);

  const availableCalendarStages = useMemo(() => {
    const present = new Set(competitionFixtures.map((f) => f.stage));
    return ['GROUP', ...STAGE_ORDER].filter((s) => present.has(s as Fixture['stage']));
  }, [competitionFixtures]);

  const filteredCalendarFixtures = useMemo(() => {
    return competitionFixtures.filter((f) => {
      if (stageFilter !== 'ALL' && f.stage !== stageFilter) return false;
      if (statusFilter === 'PLAYED' && !f.played) return false;
      if (statusFilter === 'PENDING' && f.played) return false;
      if (onlyUserClub && f.homeTeamId !== userClubId && f.awayTeamId !== userClubId) return false;
      return true;
    });
  }, [competitionFixtures, stageFilter, statusFilter, onlyUserClub, userClubId]);

  const championClub = useMemo(() => {
    const finalMatch = competitionFixtures.find((f) => f.stage === 'FINAL' && f.played);
    if (!finalMatch) return null;
    const h = finalMatch.homeScore ?? 0;
    const a = finalMatch.awayScore ?? 0;
    let winnerId = '';
    if (h > a) winnerId = finalMatch.homeTeamId;
    else if (a > h) winnerId = finalMatch.awayTeamId;
    else if (finalMatch.penaltyHome !== undefined && finalMatch.penaltyAway !== undefined) {
      winnerId = finalMatch.penaltyHome > finalMatch.penaltyAway ? finalMatch.homeTeamId : finalMatch.awayTeamId;
    }
    return winnerId ? world.getClub(winnerId) || null : null;
  }, [competitionFixtures]);

  // Stats Logic
  const getCompStats = (p: Player) => p.statsByCompetition[competition.id] || { goals: 0, assists: 0, totalRating: 0, appearances: 0 };

  const statsPlayers = useMemo(() => {
    const clubIds = new Set<string>();
    const clubs = world.getClubsByCompetition(competition.id, fixtures);
    if (clubs.length === 0) {
      world.getClubsByLeague(competition.id).forEach((c) => clubIds.add(c.id));
    } else {
      clubs.forEach((c) => clubIds.add(c.id));
    }
    return world.players.filter((p) => clubIds.has(p.clubId) && (p.statsByCompetition[competition.id]?.appearances || 0) > 0);
  }, [competition.id, fixtures, world.players.length]);

  const topScorers = useMemo(() => [...statsPlayers].sort((a, b) => getCompStats(b).goals - getCompStats(a).goals).slice(0, 15), [statsPlayers]);
  const topAssisters = useMemo(() => [...statsPlayers].sort((a, b) => getCompStats(b).assists - getCompStats(a).assists).slice(0, 15), [statsPlayers]);
  const topRated = useMemo(
    () =>
      [...statsPlayers]
        .filter((p) => getCompStats(p).appearances >= 2)
        .sort((a, b) => getCompStats(b).totalRating / getCompStats(b).appearances - getCompStats(a).totalRating / getCompStats(a).appearances)
        .slice(0, 15),
    [statsPlayers]
  );
  const bestYoung = useMemo(
    () =>
      [...statsPlayers]
        .filter((p) => p.age <= 23 && getCompStats(p).appearances >= 2)
        .sort((a, b) => getCompStats(b).totalRating / getCompStats(b).appearances - getCompStats(a).totalRating / getCompStats(a).appearances)
        .slice(0, 10),
    [statsPlayers]
  );

  const groupCount = isNationalTeam ? (competition.id === 'WC_FINAL' || competition.id === 'COPA' || competition.id === 'EURO' ? 8 : 6) : 8;

  const tabs = useMemo(() => {
    const list: Array<{ id: 'TABLE' | 'BRACKET' | 'CALENDAR' | 'STATS' | 'AWARDS'; icon: typeof Trophy; label: string }> = [];
    if (!isCup || hasGroupStage) {
      list.push({ id: 'TABLE', icon: ListOrdered, label: 'Tabla' });
    }
    if (hasBracket) {
      list.push({ id: 'BRACKET', icon: LayoutGrid, label: 'Cuadro' });
    }
    list.push({ id: 'CALENDAR', icon: Calendar, label: 'Partidos' });
    list.push({ id: 'STATS', icon: Star, label: 'Estad.' });
    list.push({ id: 'AWARDS', icon: Trophy, label: 'Premios' });
    return list;
  }, [isCup, hasGroupStage, hasBracket]);

  return (
    <div className="p-2 md:p-3.5 h-full flex flex-col gap-2.5 bg-[#d4dcd4] overflow-hidden">
      {/* Header + Cup Switcher */}
      <header className="shrink-0 bg-[#e8ece8] border border-[#8e9b90] rounded-[2px] shadow-sm p-2.5 md:p-3 flex flex-col gap-2">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 w-full lg:w-auto">
            <div className="w-9 h-9 bg-gradient-to-b from-[#f0f4f0] to-[#d0d8d0] border border-[#8e9b90] rounded-[2px] flex items-center justify-center shrink-0">
              {getFlagUrl(competition.country) ? (
                <img
                  src={getFlagUrl(competition.country)}
                  alt={competition.country}
                  className="w-6 h-4 object-cover rounded-[1px] border border-slate-400"
                />
              ) : (
                <Trophy size={18} className="text-[#1a2a1a]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {allCups && allCups.length > 0 && onSelectCompetition ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCupMenuOpen((o) => !o)}
                      className="flex items-center gap-1.5 bg-gradient-to-b from-[#f3f4f6] to-[#c7cdd4] border border-[#737a82] rounded-[2px] px-2.5 py-1 text-left shadow-xs hover:brightness-105 cursor-pointer"
                    >
                      <span className="text-sm md:text-base font-black text-[#1a1a1a] uppercase tracking-tight leading-none truncate max-w-[200px] sm:max-w-none">
                        {competition.name}
                      </span>
                      <ChevronDown size={14} className="text-slate-700 shrink-0" />
                    </button>
                    {cupMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setCupMenuOpen(false)} />
                        <div className="absolute left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-[#e8ece8] border border-[#4a5a4a] rounded-[2px] shadow-xl z-50 divide-y divide-[#c6d0c6]">
                          {allCups.map((cup) => {
                            const userPlays = fixtures.some(
                              (f) => f.competitionId === cup.id && (f.homeTeamId === userClubId || f.awayTeamId === userClubId)
                            );
                            const isSelected = cup.id === competition.id;
                            return (
                              <button
                                key={cup.id}
                                type="button"
                                onClick={() => {
                                  onSelectCompetition(cup.id);
                                  setCupMenuOpen(false);
                                }}
                                className={`w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
                                  isSelected ? 'bg-[#2b5d2c] text-white' : 'hover:bg-[#d4dfd4] text-slate-900'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <img
                                    src={getFlagUrl(cup.country)}
                                    alt=""
                                    className="w-4 h-3 object-cover rounded-[1px] border border-slate-400 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase truncate">{cup.name}</div>
                                    <div className={`text-[9px] font-bold uppercase ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                                      {cup.country}
                                    </div>
                                  </div>
                                </div>
                                {userPlays && (
                                  <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-[2px] shrink-0 ${isSelected ? 'bg-[#facc15] text-[#111827]' : 'bg-[#2b5d2c] text-white'}`}>
                                    Tu Club
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <h2 className="text-lg md:text-xl font-black text-[#1a1a1a] uppercase tracking-tight leading-none truncate">
                    {competition.name}
                  </h2>
                )}
                {championClub && (
                  <span className="text-[10px] font-black uppercase text-[#1f5922] font-mono">
                    · Campeón: {championClub.name}
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider mt-1 leading-snug">
                {cupConfig ? `${cupConfig.country} · ${cupConfig.totalTeamsLabel} · ${cupConfig.formatLabel}` : `${competition.country} · Nivel ${competition.tier}`}
              </p>
            </div>
          </div>

          <div className="flex bg-[#bcc8bc] p-0.5 rounded-[2px] border border-[#8e9b90] w-full lg:w-auto shadow-xs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 lg:flex-none lg:px-4 py-1.5 rounded-[1px] transition-all flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-tight cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-[#2b5d2c] text-white shadow-xs' : 'text-[#1a2a1a] hover:bg-[#ccd9cc]'
                }`}
              >
                <tab.icon size={13} className={activeTab === tab.id ? 'text-[#facc15]' : ''} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick cup pills bar on desktop/tablet when browsing cups */}
        {allCups && allCups.length > 1 && onSelectCompetition && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide border-t border-[#c6d0c6] pt-2">
            {allCups.map((cup) => {
              const isSelected = cup.id === competition.id;
              const userClubCountry = world.getClub(userClubId)?.country;
              const isLocalCountry = userClubCountry && cup.country === userClubCountry;
              return (
                <button
                  key={cup.id}
                  type="button"
                  onClick={() => onSelectCompetition(cup.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border text-[9.5px] font-black uppercase whitespace-nowrap cursor-pointer transition-all shrink-0 ${
                    isSelected
                      ? 'bg-[#2b5d2c] border-[#133014] text-white'
                      : isLocalCountry
                      ? 'bg-emerald-50 border-emerald-400 text-[#1f5922] hover:bg-emerald-100'
                      : 'bg-white border-[#a0b0a0] text-slate-700 hover:bg-[#dce4dc]'
                  }`}
                >
                  <img src={getFlagUrl(cup.country)} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px]" />
                  <span>{cup.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {cupConfig && (
          <div className="text-[10px] text-slate-700 bg-white/75 border border-[#b5c2b5] rounded-[2px] px-2.5 py-1.5 leading-snug flex flex-col gap-1">
            <span>{cupConfig.rulesSummary}</span>
            {seededWaitingClubs.length > 0 && (
              <div className="text-[9.5px] font-bold text-[#1f5922]">
                <span className="uppercase">{cupConfig.entrySeedNote} </span>
                <span className="text-slate-600 font-semibold">
                  ({seededWaitingClubs.slice(0, 12).map((c) => c.shortName || c.name).join(', ')}
                  {seededWaitingClubs.length > 12 ? ` y ${seededWaitingClubs.length - 12} más` : ''})
                </span>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'TABLE' && (
          <div className="h-full flex flex-col gap-2">
            {hasGroupStage && (
              <div className="flex bg-[#bcc8bc] p-0.5 rounded-[2px] border border-[#a0b0a0] overflow-x-auto scrollbar-hide shrink-0 shadow-sm">
                {Array.from({ length: groupCount }, (_, g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGroup(g)}
                    className={`px-3 py-1.5 rounded-[1px] text-[9px] font-bold uppercase whitespace-nowrap transition-colors cursor-pointer ${
                      selectedGroup === g ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
                    }`}
                  >
                    Grupo {String.fromCharCode(65 + g)}
                  </button>
                ))}
              </div>
            )}

            <LeagueTable
              entries={world.getLeagueTable(competition.id, fixtures, 'SENIOR', hasGroupStage ? selectedGroup : undefined)}
              userClubId={userClubId}
              currentLeagueId={competition.id}
              fixtures={fixtures}
            />
          </div>
        )}

        {activeTab === 'BRACKET' && hasBracket && (
          <div className="h-full overflow-hidden flex flex-col bg-[#e8ece8] border border-[#8e9b90] rounded-[2px] shadow-sm">
            <BracketView
              fixtures={competitionFixtures}
              userClubId={userClubId}
              onOpenReport={setSelectedFixture}
              onOpenClub={openClubSquad}
            />
          </div>
        )}

        {activeTab === 'CALENDAR' && (
          <FMBox title={`Partidos y Resultados (${filteredCalendarFixtures.length})`} className="h-full" noPadding>
            <div className="h-full flex flex-col overflow-hidden bg-white">
              {/* Round & Status Filters */}
              <div className="shrink-0 bg-[#e8ece8] border-b border-[#a0b0a0] p-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide max-w-full">
                  <Filter size={12} className="text-slate-600 shrink-0 mr-0.5" />
                  <button
                    type="button"
                    onClick={() => setStageFilter('ALL')}
                    className={`px-2 py-1 rounded-[2px] text-[9px] font-black uppercase whitespace-nowrap cursor-pointer ${
                      stageFilter === 'ALL' ? 'bg-[#2b5d2c] text-white' : 'bg-white border border-[#a0b0a0] text-slate-700 hover:bg-[#d4dfd4]'
                    }`}
                  >
                    Todas
                  </button>
                  {availableCalendarStages.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStageFilter(s)}
                      className={`px-2 py-1 rounded-[2px] text-[9px] font-black uppercase whitespace-nowrap cursor-pointer ${
                        stageFilter === s ? 'bg-[#2b5d2c] text-white' : 'bg-white border border-[#a0b0a0] text-slate-700 hover:bg-[#d4dfd4]'
                      }`}
                    >
                      {STAGE_LABELS[s] || s}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex bg-[#bcc8bc] p-0.5 rounded-[2px] border border-[#8e9b90]">
                    {[
                      { key: 'ALL' as const, label: 'Todos' },
                      { key: 'PLAYED' as const, label: 'Jugados' },
                      { key: 'PENDING' as const, label: 'Pendientes' },
                    ].map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setStatusFilter(st.key)}
                        className={`px-2 py-0.5 text-[8.5px] font-black uppercase rounded-[1px] cursor-pointer ${
                          statusFilter === st.key ? 'bg-[#2b5d2c] text-white' : 'text-slate-700 hover:bg-[#ccd9cc]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnlyUserClub((v) => !v)}
                    className={`px-2 py-1 rounded-[2px] border text-[8.5px] font-black uppercase cursor-pointer ${
                      onlyUserClub
                        ? 'bg-[#2b5d2c] border-[#133014] text-[#facc15]'
                        : 'bg-white border-[#8e9b90] text-slate-700 hover:bg-[#d4dfd4]'
                    }`}
                  >
                    Mi Club
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
                {filteredCalendarFixtures.length === 0 ? (
                  <div className="p-16 text-slate-400 text-center italic text-[10px] uppercase font-bold tracking-widest">
                    No hay partidos para este filtro.
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody className="text-[11px] text-[#1a1a1a]">
                      {filteredCalendarFixtures.map((f, idx) => {
                        const homeName = getTeamName(f.homeTeamId);
                        const awayName = getTeamName(f.awayTeamId);
                        const isPenalty = f.penaltyHome !== undefined;
                        const isUserMatch = f.homeTeamId === userClubId || f.awayTeamId === userClubId;
                        const fDate = f.date instanceof Date ? f.date : new Date(f.date);
                        const homeClub = world.getClub(f.homeTeamId);
                        const awayClub = world.getClub(f.awayTeamId);

                        return (
                          <tr
                            key={f.id}
                            className={`border-b border-[#e0e0e0] ${
                              isUserMatch ? 'bg-emerald-50/75' : idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'
                            } hover:bg-[#dce6dc] transition-colors`}
                          >
                            <FMTableCell className="w-24 md:w-36 text-slate-500 font-mono text-[10px]">
                              <div className="flex flex-col leading-tight">
                                <span>{fDate.toLocaleDateString()}</span>
                                {f.stage !== 'REGULAR' && (
                                  <span className="text-[#1f5922] font-black text-[8.5px] uppercase tracking-tight">
                                    {STAGE_LABELS[f.stage] || f.stage}
                                    {f.leg ? ` (${f.leg === 1 ? 'Ida' : 'Vta'})` : ''}
                                  </span>
                                )}
                                {f.groupId !== undefined && (
                                  <span className="text-slate-600 font-bold text-[8px] uppercase">Gr. {String.fromCharCode(65 + f.groupId)}</span>
                                )}
                                {f.isNeutral && (
                                  <span className="text-slate-500 font-bold text-[8px] uppercase">Sede neutral</span>
                                )}
                              </div>
                            </FMTableCell>

                            <FMTableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {homeClub ? (
                                  <button
                                    type="button"
                                    onClick={() => openClubSquad(f.homeTeamId)}
                                    className={`font-bold truncate max-w-[95px] sm:max-w-[200px] inline-block hover:underline cursor-pointer ${
                                      f.homeTeamId === userClubId ? 'text-[#1f5922] font-black' : ''
                                    }`}
                                  >
                                    {homeName}
                                  </button>
                                ) : (
                                  <span className="font-bold truncate max-w-[95px] sm:max-w-[200px] inline-block">{homeName}</span>
                                )}
                                {homeClub && <FmClubShield club={homeClub} size="xs" />}
                              </div>
                            </FMTableCell>

                            <FMTableCell className="w-16 md:w-22 text-center">
                              {f.played ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedFixture(f)}
                                  title="Ver informe del partido"
                                  className="w-full bg-[#23272c] hover:bg-[#2b5d2c] border border-[#14171a] hover:border-[#facc15] rounded-[2px] py-1 font-black text-[10px] font-mono tabular-nums shadow-inner text-[#facc15] cursor-pointer transition-colors"
                                >
                                  {isPenalty ? `${f.homeScore}-${f.awayScore} (${f.penaltyHome}-${f.penaltyAway})` : `${f.homeScore} - ${f.awayScore}`}
                                </button>
                              ) : (
                                <div className="bg-[#bcc8bc] border border-[#a0b0a0] rounded-[2px] py-1 font-black text-[10px] text-[#1a1a1a]">
                                  VS
                                </div>
                              )}
                            </FMTableCell>

                            <FMTableCell className="text-left">
                              <div className="flex items-center justify-start gap-1.5">
                                {awayClub && <FmClubShield club={awayClub} size="xs" />}
                                {awayClub ? (
                                  <button
                                    type="button"
                                    onClick={() => openClubSquad(f.awayTeamId)}
                                    className={`font-bold truncate max-w-[95px] sm:max-w-[200px] inline-block hover:underline cursor-pointer ${
                                      f.awayTeamId === userClubId ? 'text-[#1f5922] font-black' : ''
                                    }`}
                                  >
                                    {awayName}
                                  </button>
                                ) : (
                                  <span className="font-bold truncate max-w-[95px] sm:max-w-[200px] inline-block">{awayName}</span>
                                )}
                              </div>
                            </FMTableCell>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </FMBox>
        )}

        {activeTab === 'STATS' && (
          <div className="h-full overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-3 custom-scroll">
            <FMBox title="Goleadores" noPadding>
              <FMTable headers={['#', 'Nombre', 'Goles']} colWidths={['30px', 'auto', '44px']}>
                {topScorers.map((p, i) => (
                  <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] transition-colors`}>
                    <FMTableCell className="text-center font-bold text-slate-400">{i + 1}</FMTableCell>
                    <FMTableCell>
                      <div className="flex flex-col">
                        <span className="font-bold truncate max-w-[120px] hover:underline">{p.name}</span>
                        {world.getClub(p.clubId) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openClubSquad(p.clubId);
                            }}
                            className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline font-bold uppercase text-left cursor-pointer w-fit"
                          >
                            {world.getClub(p.clubId)?.shortName}
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-bold uppercase">Libre</span>
                        )}
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center font-black text-green-700" isNumber>
                      {getCompStats(p).goals}
                    </FMTableCell>
                  </tr>
                ))}
                {topScorers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">
                      Sin datos
                    </td>
                  </tr>
                )}
              </FMTable>
            </FMBox>

            <FMBox title="Asistencias" noPadding>
              <FMTable headers={['#', 'Nombre', 'Asist']} colWidths={['30px', 'auto', '44px']}>
                {topAssisters.map((p, i) => (
                  <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] transition-colors`}>
                    <FMTableCell className="text-center font-bold text-slate-400">{i + 1}</FMTableCell>
                    <FMTableCell>
                      <div className="flex flex-col">
                        <span className="font-bold truncate max-w-[120px] hover:underline">{p.name}</span>
                        {world.getClub(p.clubId) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openClubSquad(p.clubId);
                            }}
                            className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline font-bold uppercase text-left cursor-pointer w-fit"
                          >
                            {world.getClub(p.clubId)?.shortName}
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-bold uppercase">Libre</span>
                        )}
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center font-black text-blue-700" isNumber>
                      {getCompStats(p).assists}
                    </FMTableCell>
                  </tr>
                ))}
                {topAssisters.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">
                      Sin datos
                    </td>
                  </tr>
                )}
              </FMTable>
            </FMBox>

            <FMBox title="Calificación Media" noPadding>
              <FMTable headers={['#', 'Nombre', 'Media']} colWidths={['30px', 'auto', '48px']}>
                {topRated.map((p, i) => {
                  const stats = getCompStats(p);
                  const avg = (stats.totalRating / stats.appearances).toFixed(2);
                  return (
                    <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] transition-colors`}>
                      <FMTableCell className="text-center font-bold text-slate-400">{i + 1}</FMTableCell>
                      <FMTableCell>
                        <div className="flex flex-col">
                          <span className="font-bold truncate max-w-[120px] hover:underline">{p.name}</span>
                          {world.getClub(p.clubId) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openClubSquad(p.clubId);
                              }}
                              className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline font-bold uppercase text-left cursor-pointer w-fit"
                            >
                              {world.getClub(p.clubId)?.shortName}
                            </button>
                          ) : (
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Libre</span>
                          )}
                        </div>
                      </FMTableCell>
                      <FMTableCell className="text-center font-black text-amber-700" isNumber>
                        {avg}
                      </FMTableCell>
                    </tr>
                  );
                })}
                {topRated.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">
                      Sin datos
                    </td>
                  </tr>
                )}
              </FMTable>
            </FMBox>
          </div>
        )}

        {activeTab === 'AWARDS' && (
          <div className="h-full overflow-y-auto p-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <FMBox title="Goleador" noPadding>
              {topScorers.length > 0 && topScorers[0].statsByCompetition[competition.id]?.goals > 0 ? (
                <div onClick={() => openPlayerCard(topScorers[0])} className="w-full text-left p-4 bg-white hover:bg-[#f2f7f2] flex items-center gap-4 cursor-pointer transition-colors">
                  <div className="w-12 h-12 rounded-[2px] bg-amber-100 border border-amber-400 flex items-center justify-center shrink-0">
                    <Goal size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openPlayerCard(topScorers[0]); }} className="font-black text-slate-900 text-sm hover:underline cursor-pointer text-left block">
                      {topScorers[0].name}
                    </button>
                    {world.getClub(topScorers[0].clubId) ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); openClubSquad(topScorers[0].clubId); }} className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline font-bold uppercase cursor-pointer text-left block">
                        {world.getClub(topScorers[0].clubId)?.name}
                      </button>
                    ) : (
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Agente Libre</p>
                    )}
                    <p className="text-[10px] font-black text-amber-700 font-mono">{getCompStats(topScorers[0]).goals} goles</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 italic text-[10px]">Sin datos</div>
              )}
            </FMBox>

            <FMBox title="Asistidor" noPadding>
              {topAssisters.length > 0 && topAssisters[0].statsByCompetition[competition.id]?.assists > 0 ? (
                <div onClick={() => openPlayerCard(topAssisters[0])} className="w-full text-left p-4 bg-white hover:bg-[#f2f7f2] flex items-center gap-4 cursor-pointer transition-colors">
                  <div className="w-12 h-12 rounded-[2px] bg-blue-100 border border-blue-400 flex items-center justify-center shrink-0">
                    <Zap size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openPlayerCard(topAssisters[0]); }} className="font-black text-slate-900 text-sm hover:underline cursor-pointer text-left block">
                      {topAssisters[0].name}
                    </button>
                    {world.getClub(topAssisters[0].clubId) ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); openClubSquad(topAssisters[0].clubId); }} className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline font-bold uppercase cursor-pointer text-left block">
                        {world.getClub(topAssisters[0].clubId)?.name}
                      </button>
                    ) : (
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Agente Libre</p>
                    )}
                    <p className="text-[10px] font-black text-blue-700 font-mono">{getCompStats(topAssisters[0]).assists} asistencias</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 italic text-[10px]">Sin datos</div>
              )}
            </FMBox>

            <FMBox title="Mejor Calificación" noPadding>
              {topRated.length > 0 ? (
                <div onClick={() => openPlayerCard(topRated[0])} className="w-full text-left p-4 bg-white hover:bg-[#f2f7f2] flex items-center gap-4 cursor-pointer transition-colors">
                  <div className="w-12 h-12 rounded-[2px] bg-green-100 border border-green-400 flex items-center justify-center shrink-0">
                    <Star size={20} className="text-green-600" />
                  </div>
                  <div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openPlayerCard(topRated[0]); }} className="font-black text-slate-900 text-sm hover:underline cursor-pointer text-left block">
                      {topRated[0].name}
                    </button>
                    {world.getClub(topRated[0].clubId) ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); openClubSquad(topRated[0].clubId); }} className="text-[9px] text-slate-500 hover:text-[#1f5922] hover:underline font-bold uppercase cursor-pointer text-left block">
                        {world.getClub(topRated[0].clubId)?.name}
                      </button>
                    ) : (
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Agente Libre</p>
                    )}
                    <p className="text-[10px] font-black text-green-700 font-mono">{(getCompStats(topRated[0]).totalRating / getCompStats(topRated[0]).appearances).toFixed(2)} media</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 italic text-[10px]">Sin datos</div>
              )}
            </FMBox>

            <FMBox title="Mejor Jugador Joven (≤23)" noPadding>
              {bestYoung.length > 0 ? (
                <div onClick={() => openPlayerCard(bestYoung[0])} className="w-full text-left p-4 bg-white hover:bg-[#f2f7f2] flex items-center gap-4 cursor-pointer transition-colors">
                  <div className="w-12 h-12 rounded-[2px] bg-purple-100 border border-purple-400 flex items-center justify-center shrink-0">
                    <UserCheck size={20} className="text-purple-600" />
                  </div>
                  <div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openPlayerCard(bestYoung[0]); }} className="font-black text-slate-900 text-sm hover:underline cursor-pointer text-left block">
                      {bestYoung[0].name}
                    </button>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">
                      {world.getClub(bestYoung[0].clubId) ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openClubSquad(bestYoung[0].clubId); }} className="hover:text-[#1f5922] hover:underline cursor-pointer uppercase font-bold">
                          {world.getClub(bestYoung[0].clubId)?.name}
                        </button>
                      ) : (
                        'Agente Libre'
                      )}{' '}
                      · {bestYoung[0].age} años
                    </p>
                    <p className="text-[10px] font-black text-purple-700 font-mono">{(getCompStats(bestYoung[0]).totalRating / getCompStats(bestYoung[0]).appearances).toFixed(2)} media</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 italic text-[10px]">Sin datos</div>
              )}
            </FMBox>
          </div>
        )}
      </div>
      <FixtureReportModal fixture={selectedFixture} userClubId={userClubId} onClose={() => setSelectedFixture(null)} />
    </div>
  );
};

interface BracketTie {
  key: string;
  legs: Fixture[];
  teamAId: string;
  teamBId: string;
  aggA: number | null;
  aggB: number | null;
  winnerId: string | null;
  isTwoLegged: boolean;
  leg2WithPenalties?: Fixture;
}

function buildStageTies(stageFixtures: Fixture[]): BracketTie[] {
  const grouped = new Map<string, Fixture[]>();
  stageFixtures.forEach((f) => {
    const key = f.tieId || f.id;
    const arr = grouped.get(key);
    if (arr) arr.push(f);
    else grouped.set(key, [f]);
  });

  const ties: BracketTie[] = [];
  grouped.forEach((legs, key) => {
    const sortedLegs = [...legs].sort((a, b) => (a.leg || 1) - (b.leg || 1) || new Date(a.date).getTime() - new Date(b.date).getTime());
    const leg1 = sortedLegs[0];
    const leg2 = sortedLegs[1];
    const teamAId = leg1.homeTeamId;
    const teamBId = leg1.awayTeamId;
    const isTwoLegged = Boolean(leg2);

    let aggA: number | null = null;
    let aggB: number | null = null;
    let winnerId: string | null = null;
    let leg2WithPenalties: Fixture | undefined;

    if (isTwoLegged && leg2) {
      if (leg1.played && leg2.played) {
        const aOn2 = leg2.homeTeamId === teamAId ? leg2.homeScore || 0 : leg2.awayScore || 0;
        const bOn2 = leg2.homeTeamId === teamBId ? leg2.homeScore || 0 : leg2.awayScore || 0;
        aggA = (leg1.homeScore || 0) + aOn2;
        aggB = (leg1.awayScore || 0) + bOn2;
        if (aggA > aggB) winnerId = teamAId;
        else if (aggB > aggA) winnerId = teamBId;
        else if (leg2.penaltyHome !== undefined && leg2.penaltyAway !== undefined) {
          leg2WithPenalties = leg2;
          winnerId = leg2.penaltyHome > leg2.penaltyAway ? leg2.homeTeamId : leg2.awayTeamId;
        }
      } else if (leg1.played) {
        aggA = leg1.homeScore ?? 0;
        aggB = leg1.awayScore ?? 0;
      }
    } else if (leg1.played) {
      aggA = leg1.homeScore ?? 0;
      aggB = leg1.awayScore ?? 0;
      if (aggA > aggB) winnerId = teamAId;
      else if (aggB > aggA) winnerId = teamBId;
      else if (leg1.penaltyHome !== undefined && leg1.penaltyAway !== undefined) {
        leg2WithPenalties = leg1;
        winnerId = leg1.penaltyHome > leg1.penaltyAway ? leg1.homeTeamId : leg1.awayTeamId;
      }
    }

    ties.push({
      key,
      legs: sortedLegs,
      teamAId,
      teamBId,
      aggA,
      aggB,
      winnerId,
      isTwoLegged,
      leg2WithPenalties,
    });
  });

  return ties;
}

const BracketView: React.FC<{
  fixtures: Fixture[];
  userClubId: string;
  onOpenReport: (f: Fixture) => void;
  onOpenClub: (clubId: string) => void;
}> = ({ fixtures, userClubId, onOpenReport, onOpenClub }) => {
  const tiesByStage = useMemo(() => {
    const grouped: Record<string, BracketTie[]> = {};
    STAGE_ORDER.forEach((s) => {
      const sf = fixtures.filter((f) => f.stage === s);
      if (sf.length > 0) {
        grouped[s] = buildStageTies(sf);
      }
    });
    return grouped;
  }, [fixtures]);

  const availableStages = STAGE_ORDER.filter((s) => tiesByStage[s] && tiesByStage[s].length > 0);
  const [mobileStage, setMobileStage] = useState<string>(() => availableStages[availableStages.length - 1] || '');

  useEffect(() => {
    if (availableStages.length > 0 && (!mobileStage || !tiesByStage[mobileStage])) {
      setMobileStage(availableStages[availableStages.length - 1]);
    }
  }, [availableStages, mobileStage, tiesByStage]);

  if (availableStages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 italic text-[11px] uppercase font-bold p-8 text-center">
        No hay cruces de eliminación definidos aún.
      </div>
    );
  }

  const renderTieCard = (tie: BracketTie) => {
    const clubA = world.getClub(tie.teamAId);
    const clubB = world.getClub(tie.teamBId);
    const nameA = getTeamShort(tie.teamAId);
    const nameB = getTeamShort(tie.teamBId);
    const isUserTie = tie.teamAId === userClubId || tie.teamBId === userClubId;
    const wonA = tie.winnerId === tie.teamAId;
    const wonB = tie.winnerId === tie.teamBId;
    const firstLeg = tie.legs[0];
    const secondLeg = tie.legs[1];
    const fDate = firstLeg.date instanceof Date ? firstLeg.date : new Date(firstLeg.date);

    return (
      <div
        key={tie.key}
        className={`rounded-[2px] border shadow-xs overflow-hidden ${
          isUserTie ? 'border-[#2b5d2c] ring-1 ring-[#2b5d2c]/40 bg-emerald-50/40' : 'border-[#8e9b90] bg-white'
        }`}
      >
        <div className="flex items-center justify-between px-2 py-0.5 bg-[#e2e7e2] border-b border-[#c2cdc2] text-[8.5px] font-bold uppercase text-slate-600">
          <span className="font-mono tabular-nums">
            {fDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
            {secondLeg ? ` / ${new Date(secondLeg.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}` : ''}
          </span>
          <span>{tie.isTwoLegged ? 'Ida y Vta' : firstLeg.isNeutral ? 'Neutral' : 'Local'}</span>
        </div>

        {/* Team A */}
        <div className={`flex items-center justify-between gap-1.5 px-2 py-1.5 ${wonA ? 'bg-emerald-50' : ''}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {clubA && <FmClubShield club={clubA} size="xs" />}
            {clubA ? (
              <button
                type="button"
                onClick={() => onOpenClub(tie.teamAId)}
                className={`text-[10px] truncate max-w-[130px] text-left hover:underline cursor-pointer ${
                  tie.teamAId === userClubId
                    ? 'font-black text-[#1f5922]'
                    : wonA
                    ? 'font-black text-emerald-900'
                    : 'font-bold text-slate-800'
                }`}
              >
                {nameA}
              </button>
            ) : (
              <span className="text-[10px] font-bold truncate max-w-[130px]">{nameA}</span>
            )}
          </div>
          <span className={`text-[11px] font-mono tabular-nums font-black ${wonA ? 'text-[#1f5922]' : 'text-slate-600'}`}>
            {tie.aggA !== null ? tie.aggA : '—'}
          </span>
        </div>

        <div className="border-t border-[#d8e0d8]" />

        {/* Team B */}
        <div className={`flex items-center justify-between gap-1.5 px-2 py-1.5 ${wonB ? 'bg-emerald-50' : ''}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {clubB && <FmClubShield club={clubB} size="xs" />}
            {clubB ? (
              <button
                type="button"
                onClick={() => onOpenClub(tie.teamBId)}
                className={`text-[10px] truncate max-w-[130px] text-left hover:underline cursor-pointer ${
                  tie.teamBId === userClubId
                    ? 'font-black text-[#1f5922]'
                    : wonB
                    ? 'font-black text-emerald-900'
                    : 'font-bold text-slate-800'
                }`}
              >
                {nameB}
              </button>
            ) : (
              <span className="text-[10px] font-bold truncate max-w-[130px]">{nameB}</span>
            )}
          </div>
          <span className={`text-[11px] font-mono tabular-nums font-black ${wonB ? 'text-[#1f5922]' : 'text-slate-600'}`}>
            {tie.aggB !== null ? tie.aggB : '—'}
          </span>
        </div>

        {/* Footer: two-leg breakdown, penalties, and match report clickables */}
        {(tie.isTwoLegged || firstLeg.played || tie.leg2WithPenalties) && (
          <div className="bg-[#f4f7f4] border-t border-[#d8e0d8] px-2 py-1 flex flex-wrap items-center justify-between gap-1 text-[8.5px] font-mono">
            {tie.isTwoLegged ? (
              <div className="flex items-center gap-1.5">
                {firstLeg.played ? (
                  <button
                    type="button"
                    onClick={() => onOpenReport(firstLeg)}
                    className="text-slate-700 hover:text-[#1f5922] hover:underline font-bold cursor-pointer"
                  >
                    Ida: {firstLeg.homeScore}-{firstLeg.awayScore}
                  </button>
                ) : (
                  <span className="text-slate-400">Ida: pend.</span>
                )}
                <span className="text-slate-400">·</span>
                {secondLeg?.played ? (
                  <button
                    type="button"
                    onClick={() => onOpenReport(secondLeg)}
                    className="text-slate-700 hover:text-[#1f5922] hover:underline font-bold cursor-pointer"
                  >
                    Vta: {secondLeg.homeScore}-{secondLeg.awayScore}
                  </button>
                ) : (
                  <span className="text-slate-400">Vta: pend.</span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenReport(firstLeg)}
                className="text-[#1f5922] hover:underline font-bold uppercase cursor-pointer"
              >
                Ver informe
              </button>
            )}

            {tie.leg2WithPenalties && (
              <span className="font-black text-amber-700">
                Pen. {tie.leg2WithPenalties.penaltyHome}-{tie.leg2WithPenalties.penaltyAway}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Single-Round Selector (< md) */}
      <div className="md:hidden flex flex-col h-full overflow-hidden">
        <div className="shrink-0 flex gap-1 p-1.5 bg-[#bcc8bc] border-b border-[#8e9b90] overflow-x-auto scrollbar-hide">
          {availableStages.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setMobileStage(stage)}
              className={`px-2.5 py-1 rounded-[2px] text-[9.5px] font-black uppercase whitespace-nowrap cursor-pointer ${
                mobileStage === stage ? 'bg-[#2b5d2c] text-white' : 'bg-[#e8ece8] text-slate-800 border border-[#8e9b90]'
              }`}
            >
              {STAGE_LABELS[stage] || stage} ({tiesByStage[stage].length})
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 custom-scroll">
          {(tiesByStage[mobileStage] || []).map((tie) => renderTieCard(tie))}
        </div>
      </div>

      {/* Desktop Multi-Column Bracket Tree (md+) */}
      <div className="hidden md:block h-full overflow-auto custom-scroll p-3">
        <div className="flex gap-4 min-h-full min-w-max pb-2">
          {availableStages.map((stage) => {
            const ties = tiesByStage[stage];
            // Group into consecutive pairs to show bracket pairings clearly
            const pairs: BracketTie[][] = [];
            for (let i = 0; i < ties.length; i += 2) {
              pairs.push(ties.slice(i, i + 2));
            }
            return (
              <div key={stage} className="flex flex-col gap-2 w-[225px] shrink-0">
                <div className="text-center py-1.5 px-2 bg-[#3a4a3a] border border-[#1c261c] text-white text-[9.5px] font-black uppercase tracking-wider rounded-[2px] sticky top-0 z-10 flex items-center justify-between">
                  <span>{STAGE_LABELS[stage] || stage}</span>
                  <span className="text-[#facc15] font-mono tabular-nums">{ties.length}</span>
                </div>
                <div className="flex-1 flex flex-col justify-around gap-3">
                  {pairs.map((pair, pIdx) => (
                    <div
                      key={`${stage}_${pIdx}`}
                      className={`flex flex-col gap-2 ${
                        pair.length === 2 && stage !== 'FINAL' ? 'pr-2 border-r-2 border-[#8e9b90]/70 rounded-r-[2px]' : ''
                      }`}
                    >
                      {pair.map((tie) => renderTieCard(tie))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
