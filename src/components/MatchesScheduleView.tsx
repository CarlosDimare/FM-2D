import React, { useMemo, useState, useEffect } from 'react';
import { Club, Fixture, SquadType } from '../types';
import { world } from '../services/worldManager';
import { openClubSquad } from '../stores/uiStore';
import { notifyClubs, useWorldStore } from '../stores/worldStore';
import { showToast } from '../stores/feedbackStore';
import { FMBox, FMButton, FMTable, FMTableCell } from './FMUI';
import { Calendar, Search, Sparkles, Plus, Trash2, Home, Plane } from 'lucide-react';

interface MatchesScheduleViewProps {
  userClub: Club;
  squadType: SquadType;
  onSquadChange: (type: SquadType) => void;
  fixtures: Fixture[];
  currentDate: Date;
}

const STAGE_LABELS: Record<string, string> = {
  REGULAR: 'Liga',
  GROUP: 'Fase de Grupos',
  ROUND_OF_64: '32avos de Final',
  ROUND_OF_32: '16avos de Final',
  ROUND_OF_16: 'Octavos de Final',
  QUARTER_FINAL: 'Cuartos de Final',
  SEMI_FINAL: 'Semifinal',
  FINAL: 'Final',
};

function toDayKey(d: Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const MatchesScheduleView: React.FC<MatchesScheduleViewProps> = ({
  userClub,
  squadType,
  onSquadChange,
  fixtures,
  currentDate,
}) => {
  const [compFilter, setCompFilter] = useState<string>('ALL');
  const [selectedDayKey, setSelectedDayKey] = useState<string>('');
  const [isHomeFriendly, setIsHomeFriendly] = useState<boolean>(true);
  const [opponentSearch, setOpponentSearch] = useState<string>('');
  const [showFriendlyPanel, setShowFriendlyPanel] = useState<boolean>(true);
  const [mobileTab, setMobileTab] = useState<'CALENDAR' | 'FRIENDLIES'>('CALENDAR');

  useWorldStore(s => s._tick);

  const squadFixtures = useMemo(() => {
    return fixtures
      .filter(f => (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) && f.squadType === squadType)
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fixtures, userClub.id, squadType]);

  const compIds = useMemo(() => {
    return [...new Set(squadFixtures.map(f => f.competitionId))];
  }, [squadFixtures]);

  const activeCompFilter = compFilter !== 'ALL' && compIds.includes(compFilter) ? compFilter : 'ALL';

  const filteredFixtures = useMemo(() => {
    if (activeCompFilter === 'ALL') return squadFixtures;
    return squadFixtures.filter(f => f.competitionId === activeCompFilter);
  }, [squadFixtures, activeCompFilter]);

  const parityStats = useMemo(() => {
    let totalHome = 0;
    let totalAway = 0;
    let leagueHome = 0;
    let leagueAway = 0;
    let played = 0;
    let pending = 0;

    for (const f of squadFixtures) {
      const isHome = f.homeTeamId === userClub.id;
      if (isHome) totalHome++;
      else totalAway++;
      if (f.competitionId === userClub.leagueId) {
        if (isHome) leagueHome++;
        else leagueAway++;
      }
      if (f.played) played++;
      else pending++;
    }
    return { totalHome, totalAway, leagueHome, leagueAway, played, pending };
  }, [squadFixtures, userClub.id, userClub.leagueId]);

  const availableDates = useMemo(() => {
    if (squadType !== 'SENIOR') return [];
    return world.getAvailableFriendlyDates(userClub.id, fixtures, currentDate, 120);
  }, [squadType, userClub.id, fixtures, currentDate]);

  useEffect(() => {
    if (squadType !== 'SENIOR' && mobileTab === 'FRIENDLIES') {
      setMobileTab('CALENDAR');
    }
  }, [squadType, mobileTab]);

  useEffect(() => {
    if (availableDates.length === 0) {
      setSelectedDayKey('');
      return;
    }
    if (!selectedDayKey || !availableDates.some(d => toDayKey(d) === selectedDayKey)) {
      setSelectedDayKey(toDayKey(availableDates[0]));
    }
  }, [availableDates, selectedDayKey]);

  const selectedDate = useMemo(() => {
    return availableDates.find(d => toDayKey(d) === selectedDayKey) || availableDates[0] || null;
  }, [availableDates, selectedDayKey]);

  const availableOpponents = useMemo(() => {
    if (!selectedDate || squadType !== 'SENIOR') return [];
    return world.getAvailableFriendlyOpponents(userClub.id, selectedDate, fixtures, opponentSearch);
  }, [userClub.id, selectedDate, fixtures, opponentSearch, squadType]);

  const handleArrangeDirector = () => {
    const res = world.arrangeFriendliesWithDirector(userClub.id, currentDate, 3);
    notifyClubs();
    showToast(res.message, res.ok ? 'success' : 'warning');
  };

  const handleScheduleFriendly = (opponent: Club) => {
    if (!selectedDate) return;
    const res = world.scheduleFriendlyMatch(userClub.id, opponent.id, selectedDate, isHomeFriendly);
    notifyClubs();
    showToast(res.message, res.ok ? 'success' : 'warning');
  };

  const handleCancelFriendly = (fixtureId: string) => {
    const res = world.cancelFriendlyMatch(fixtureId, userClub.id);
    notifyClubs();
    showToast(res.message, res.ok ? 'info' : 'warning');
  };

  const todayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
  const nextPendingId = squadFixtures.find(
    f => !f.played && new Date(f.date).getTime() >= todayStart
  )?.id;

  const showCalendarMobile = squadType !== 'SENIOR' || mobileTab === 'CALENDAR';
  const showFriendliesMobile = squadType === 'SENIOR' && mobileTab === 'FRIENDLIES';

  return (
    <div className="p-2 md:p-4 h-full flex flex-col gap-2.5 md:gap-3 bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      {/* Header */}
      <header className="shrink-0 bg-[#e8ece8] border border-[#8e9b90] rounded-sm p-2 md:p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-[#2b5d2c] shrink-0" />
            <h2 className="text-sm sm:text-base md:text-xl font-black text-slate-900 uppercase italic tracking-tight truncate">
              Partidos · {userClub.shortName}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9px] sm:text-[9.5px] font-bold text-slate-700">
            <span className="px-1.5 sm:px-2 py-0.5 bg-white border border-[#a0b0a0] rounded-[2px]">
              Total: <strong className="font-mono text-slate-900">{squadFixtures.length}</strong>
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 bg-white border border-[#a0b0a0] rounded-[2px]">
              Cond.:{' '}
              <strong className="font-mono text-[#2b5d2c]">{parityStats.totalHome}L</strong>
              {' - '}
              <strong className="font-mono text-blue-800">{parityStats.totalAway}V</strong>
            </span>
            {parityStats.leagueHome + parityStats.leagueAway > 0 && (
              <span className="px-1.5 sm:px-2 py-0.5 bg-white border border-[#a0b0a0] rounded-[2px]">
                Liga:{' '}
                <strong className="font-mono text-slate-900">
                  {parityStats.leagueHome}L / {parityStats.leagueAway}V
                </strong>
              </span>
            )}
            <span className="px-1.5 sm:px-2 py-0.5 bg-white border border-[#a0b0a0] rounded-[2px]">
              Jug: <strong className="font-mono">{parityStats.played}</strong> · Rest:{' '}
              <strong className="font-mono">{parityStats.pending}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="flex bg-[#bcc8bc] p-0.5 rounded-[2px] border border-[#8e9b90]">
            {([
              ['SENIOR', 'Primera'],
              ['RESERVE', 'Reserva'],
              ['U20', 'Sub-20'],
            ] as const).map(([sq, label]) => (
              <button
                key={sq}
                type="button"
                onClick={() => onSquadChange(sq)}
                className={`px-2 sm:px-2.5 py-1 text-[9px] font-black uppercase rounded-[1px] cursor-pointer transition-all ${
                  squadType === sq ? 'bg-[#2b5d2c] text-white shadow-xs' : 'text-slate-700 hover:bg-black/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={activeCompFilter}
            onChange={(e) => setCompFilter(e.target.value)}
            aria-label="Filtrar por competición"
            className="flex-1 min-w-[140px] sm:flex-initial bg-white border border-[#8e9b90] rounded-[2px] px-2 py-1.5 text-[9.5px] font-black uppercase text-slate-800 outline-none sm:max-w-[210px]"
          >
            <option value="ALL">Todas las competiciones</option>
            {compIds.map(cid => {
              const comp = world.competitions.find(c => c.id === cid);
              return (
                <option key={cid} value={cid}>
                  {cid === 'FRIENDLY' ? 'Amistosos' : comp?.name || cid}
                </option>
              );
            })}
          </select>

          {squadType === 'SENIOR' && (
            <div className="hidden lg:block">
              <FMButton
                variant={showFriendlyPanel ? 'secondary' : 'primary'}
                onClick={() => setShowFriendlyPanel(p => !p)}
              >
                <Calendar size={12} /> {showFriendlyPanel ? 'Ocultar Amistosos' : 'Concertar Amistosos'}
              </FMButton>
            </div>
          )}
        </div>

        {/* Mobile/Tablet Switcher: evita que Concertar Amistosos tape o comprima el Calendario */}
        {squadType === 'SENIOR' && (
          <div className="lg:hidden grid grid-cols-2 gap-1 bg-[#bcc8bc] p-0.5 rounded-[2px] border border-[#8e9b90]">
            <button
              type="button"
              onClick={() => setMobileTab('CALENDAR')}
              className={`py-1.5 px-2 text-[9.5px] font-black uppercase rounded-[1px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                mobileTab === 'CALENDAR'
                  ? 'bg-[#2b5d2c] text-white shadow-xs'
                  : 'text-slate-800 hover:bg-black/5'
              }`}
            >
              <Calendar size={12} /> Calendario ({filteredFixtures.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('FRIENDLIES')}
              className={`py-1.5 px-2 text-[9.5px] font-black uppercase rounded-[1px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                mobileTab === 'FRIENDLIES'
                  ? 'bg-[#2b5d2c] text-white shadow-xs'
                  : 'text-slate-800 hover:bg-black/5'
              }`}
            >
              <Plus size={12} /> Concertar Amistosos
            </button>
          </div>
        )}
      </header>

      {/* Main Content Split: Fixtures List + Friendly Matchmaker */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-hidden">
        {/* Fixtures List */}
        <FMBox
          title={`Calendario (${filteredFixtures.length} partidos)`}
          className={`${showCalendarMobile ? 'flex' : 'hidden'} lg:flex flex-1 min-h-0`}
          noPadding
        >
          {/* Mobile Compact List (< md) */}
          <div className="md:hidden h-full overflow-y-auto custom-scroll bg-white divide-y divide-[#e2e7e2] pb-2">
            {filteredFixtures.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic uppercase font-bold text-[10px]">
                No hay partidos programados con este filtro.
              </div>
            ) : (
              filteredFixtures.map((f, idx) => {
                const isHome = f.homeTeamId === userClub.id;
                const opponentId = isHome ? f.awayTeamId : f.homeTeamId;
                const opponent = world.getClub(opponentId);
                const comp = world.competitions.find(c => c.id === f.competitionId);
                const isFriendly = f.competitionId === 'FRIENDLY';
                const fDate = f.date instanceof Date ? f.date : new Date(f.date);
                const isNext = f.id === nextPendingId;

                const userScore = isHome ? f.homeScore : f.awayScore;
                const oppScore = isHome ? f.awayScore : f.homeScore;
                let resultText = 'vs';
                let resultCls = 'text-slate-500 bg-slate-100 border-slate-300';
                if (f.played && userScore !== undefined && oppScore !== undefined) {
                  resultText = `${f.homeScore}-${f.awayScore}${f.penaltyHome !== undefined ? ' p' : ''}`;
                  if (userScore > oppScore) resultCls = 'text-emerald-900 bg-emerald-100 border-emerald-300 font-black';
                  else if (userScore < oppScore) resultCls = 'text-red-900 bg-red-100 border-red-300 font-black';
                  else resultCls = 'text-amber-900 bg-amber-100 border-amber-300 font-black';
                } else if (isNext) {
                  resultText = 'PRÓX';
                  resultCls = 'text-[#facc15] bg-[#2b5d2c] border-[#133014] font-black';
                }

                return (
                  <div
                    key={f.id}
                    className={`px-2.5 py-2 flex items-center justify-between gap-2 ${
                      isNext ? 'bg-emerald-50/80' : idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[9px]">
                        <span className="font-mono font-bold text-slate-600 shrink-0">
                          {fDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </span>
                        <span
                          className={`inline-block px-1 py-0.5 rounded-[2px] text-[8px] font-black border uppercase shrink-0 ${
                            f.isNeutral
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : isHome
                              ? 'bg-emerald-50 text-[#1f5922] border-emerald-300'
                              : 'bg-sky-50 text-sky-800 border-sky-300'
                          }`}
                        >
                          {f.isNeutral ? 'NEU' : isHome ? 'LOC' : 'VIS'}
                        </span>
                        <span className="font-bold text-slate-500 truncate">
                          {isFriendly ? 'Amistoso' : comp?.name || f.competitionId}
                          {!isFriendly && f.stage !== 'REGULAR' ? ` · ${STAGE_LABELS[f.stage] || f.stage}` : ''}
                          {f.leg ? ` (${f.leg === 1 ? 'Ida' : 'Vta'})` : ''}
                        </span>
                      </div>
                      <div className="mt-0.5 min-w-0">
                        {opponent ? (
                          <button
                            type="button"
                            onClick={() => openClubSquad(opponent.id, world.clubs)}
                            className="text-[11.5px] font-bold text-slate-900 hover:text-[#1f5922] hover:underline text-left truncate block max-w-full cursor-pointer"
                          >
                            {opponent.name}
                          </button>
                        ) : (
                          <span className="text-[11.5px] font-bold text-slate-600 truncate block">{opponentId}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`inline-block px-1.5 py-0.5 rounded-[2px] border text-[9.5px] font-mono ${resultCls}`}>
                        {resultText}
                      </span>
                      {isFriendly && !f.played && (
                        <button
                          type="button"
                          onClick={() => handleCancelFriendly(f.id)}
                          title="Cancelar amistoso"
                          aria-label="Cancelar amistoso"
                          className="p-1 text-red-700 hover:bg-red-100 rounded-[2px] cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block h-full overflow-y-auto custom-scroll bg-white">
            <FMTable
              headers={['Fecha', 'Cond.', 'Rival', 'Competición', 'Res.', '']}
              colWidths={['84px', '52px', 'auto', '155px', '64px', '44px']}
            >
              {filteredFixtures.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400 italic uppercase font-bold text-[10px]">
                    No hay partidos programados con este filtro.
                  </td>
                </tr>
              ) : (
                filteredFixtures.map((f, idx) => {
                  const isHome = f.homeTeamId === userClub.id;
                  const opponentId = isHome ? f.awayTeamId : f.homeTeamId;
                  const opponent = world.getClub(opponentId);
                  const comp = world.competitions.find(c => c.id === f.competitionId);
                  const isFriendly = f.competitionId === 'FRIENDLY';
                  const fDate = f.date instanceof Date ? f.date : new Date(f.date);
                  const isNext = f.id === nextPendingId;

                  const userScore = isHome ? f.homeScore : f.awayScore;
                  const oppScore = isHome ? f.awayScore : f.homeScore;
                  let resultText = 'vs';
                  let resultCls = 'text-slate-500 bg-slate-100 border-slate-300';
                  if (f.played && userScore !== undefined && oppScore !== undefined) {
                    const base = `${f.homeScore}-${f.awayScore}${f.penaltyHome !== undefined ? ' p' : ''}`;
                    resultText = base;
                    if (userScore > oppScore) resultCls = 'text-emerald-900 bg-emerald-100 border-emerald-300 font-black';
                    else if (userScore < oppScore) resultCls = 'text-red-900 bg-red-100 border-red-300 font-black';
                    else resultCls = 'text-amber-900 bg-amber-100 border-amber-300 font-black';
                  } else if (isNext) {
                    resultText = 'PRÓX';
                    resultCls = 'text-[#facc15] bg-[#2b5d2c] border-[#133014] font-black';
                  }

                  return (
                    <tr
                      key={f.id}
                      className={`border-b border-[#e2e7e2] ${
                        isNext ? 'bg-emerald-50/70' : idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'
                      }`}
                    >
                      <FMTableCell className="font-mono text-[10px] text-slate-700 whitespace-nowrap">
                        {fDate.toLocaleDateString()}
                      </FMTableCell>
                      <FMTableCell className="text-center">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-[2px] text-[8.5px] font-black border uppercase ${
                            f.isNeutral
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : isHome
                              ? 'bg-emerald-50 text-[#1f5922] border-emerald-300'
                              : 'bg-sky-50 text-sky-800 border-sky-300'
                          }`}
                        >
                          {f.isNeutral ? 'NEU' : isHome ? 'LOC' : 'VIS'}
                        </span>
                      </FMTableCell>
                      <FMTableCell className="min-w-0">
                        {opponent ? (
                          <button
                            type="button"
                            onClick={() => openClubSquad(opponent.id, world.clubs)}
                            className="font-bold text-slate-900 hover:text-[#1f5922] hover:underline text-left truncate block max-w-full cursor-pointer"
                          >
                            {opponent.name}
                          </button>
                        ) : (
                          <span className="font-bold text-slate-600">{opponentId}</span>
                        )}
                      </FMTableCell>
                      <FMTableCell className="text-[9.5px] text-slate-600 truncate">
                        <span className="font-bold text-slate-800">
                          {isFriendly ? 'Amistoso' : comp?.name || f.competitionId}
                        </span>
                        {!isFriendly && f.stage !== 'REGULAR' && (
                          <span className="text-slate-500"> · {STAGE_LABELS[f.stage] || f.stage}{f.leg ? ` (${f.leg === 1 ? 'Ida' : 'Vta'})` : ''}</span>
                        )}
                      </FMTableCell>
                      <FMTableCell className="text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded-[2px] border text-[9.5px] font-mono ${resultCls}`}>
                          {resultText}
                        </span>
                      </FMTableCell>
                      <FMTableCell className="text-center">
                        {isFriendly && !f.played && (
                          <button
                            type="button"
                            onClick={() => handleCancelFriendly(f.id)}
                            title="Cancelar amistoso"
                            className="p-1 text-red-700 hover:bg-red-100 rounded-[2px] cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </FMTableCell>
                    </tr>
                  );
                })
              )}
            </FMTable>
          </div>
        </FMBox>

        {/* Friendly Matchmaker Panel */}
        {squadType === 'SENIOR' && (showFriendliesMobile || showFriendlyPanel) && (
          <FMBox
            title="Concertar Amistosos"
            className={`${showFriendliesMobile ? 'flex' : 'hidden'} ${
              showFriendlyPanel ? 'lg:flex' : 'lg:hidden'
            } flex-1 lg:flex-none lg:w-[370px] xl:w-[400px] min-h-0`}
            noPadding
          >
            <div className="h-full flex flex-col bg-[#f4f7f4] p-2.5 gap-2.5 overflow-y-auto lg:overflow-hidden">
              <div className="bg-white border border-[#a0b0a0] rounded-[2px] p-2.5 space-y-2 shrink-0">
                <p className="text-[9.5px] font-bold text-slate-600 leading-snug">
                  El Director Deportivo puede buscar rivales libres y cerrar hasta 3 amistosos en huecos del calendario, o puedes elegir fecha y rival manualmente.
                </p>
                <FMButton variant="primary" onClick={handleArrangeDirector} className="w-full py-2">
                  <Sparkles size={12} /> Director Deportivo: Concertar Amistosos
                </FMButton>
              </div>

              <div className="bg-white border border-[#a0b0a0] rounded-[2px] p-2.5 space-y-2 shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-slate-500 block mb-1">
                      Fechas libres ({availableDates.length} disponibles)
                    </label>
                    <select
                      value={selectedDayKey}
                      onChange={(e) => setSelectedDayKey(e.target.value)}
                      disabled={availableDates.length === 0}
                      className="w-full bg-[#f4f7f4] border border-[#8e9b90] rounded-[2px] px-2 py-1.5 text-[10px] font-bold text-slate-900 outline-none"
                    >
                      {availableDates.length === 0 ? (
                        <option value="">Sin fechas disponibles</option>
                      ) : (
                        availableDates.slice(0, 45).map(d => (
                          <option key={toDayKey(d)} value={toDayKey(d)}>
                            {d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsHomeFriendly(true)}
                      className={`flex-1 py-1.5 rounded-[2px] border text-[9px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer ${
                        isHomeFriendly
                          ? 'bg-[#2b5d2c] border-[#133014] text-white'
                          : 'bg-[#f4f7f4] border-[#8e9b90] text-slate-700'
                      }`}
                    >
                      <Home size={11} /> Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsHomeFriendly(false)}
                      className={`flex-1 py-1.5 rounded-[2px] border text-[9px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer ${
                        !isHomeFriendly
                          ? 'bg-[#2b5d2c] border-[#133014] text-white'
                          : 'bg-[#f4f7f4] border-[#8e9b90] text-slate-700'
                      }`}
                    >
                      <Plane size={11} /> Visitante
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar club o país..."
                    value={opponentSearch}
                    onChange={(e) => setOpponentSearch(e.target.value)}
                    className="w-full bg-[#f4f7f4] border border-[#8e9b90] rounded-[2px] pl-7 pr-2.5 py-1.5 text-[10px] font-semibold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 min-h-[180px] lg:min-h-0 overflow-y-auto custom-scroll bg-white border border-[#a0b0a0] rounded-[2px] divide-y divide-[#e2e7e2] pb-2">
                {!selectedDate ? (
                  <div className="p-6 text-center text-[10px] font-bold text-slate-400 uppercase italic">
                    No hay días disponibles sin saturar el calendario.
                  </div>
                ) : availableOpponents.length === 0 ? (
                  <div className="p-6 text-center text-[10px] font-bold text-slate-400 uppercase italic">
                    No hay clubes libres con ese criterio en esta fecha.
                  </div>
                ) : (
                  availableOpponents.map(opp => (
                    <div
                      key={opp.id}
                      className="px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-[#f2f7f2]"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openClubSquad(opp.id, world.clubs)}
                          className="text-[10.5px] font-bold text-slate-900 hover:text-[#1f5922] hover:underline truncate block text-left cursor-pointer"
                        >
                          {opp.name}
                        </button>
                        <span className="text-[8.5px] font-bold uppercase text-slate-500">
                          {opp.country} · Rep {opp.reputation}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleScheduleFriendly(opp)}
                        className="shrink-0 px-2 py-1 rounded-[2px] bg-[#2b5d2c] hover:brightness-110 text-white border border-[#133014] text-[8.5px] font-black uppercase flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={10} /> Concertar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </FMBox>
        )}
      </div>
    </div>
  );
};
