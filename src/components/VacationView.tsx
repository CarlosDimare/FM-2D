import React, { useState, useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useUIStore } from '../stores/uiStore';
import { useWorldStore } from '../stores/worldStore';
import { world } from '../services/worldManager';
import { LifecycleManager } from '../services/lifecycleManager';
import { simulateDayFixtures } from '../services/simulationService';
import { detectPlayerDialogueTriggers } from '../services/playerDialogueTriggers';
import { generateMonthlyChronicle } from '../services/chronicleService';
import { FMBox, FMSpinner, FMButton } from './FMUI';
import { Sun, ChevronRight, AlertCircle, Calendar, Trophy, Play } from 'lucide-react';

interface VacationViewProps {
  onBack: () => void;
}

const yieldPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

export const VacationView: React.FC<VacationViewProps> = ({ onBack }) => {
  const currentDate = useUIStore((s) => s.currentDate);
  const seasonEndDate = useUIStore((s) => s.seasonEndDate);
  const setCurrentDate = useUIStore((s) => s.setCurrentDate);
  const setSeasonEndDate = useUIStore((s) => s.setSeasonEndDate);
  const setSeasonSummary = useUIStore((s) => s.setSeasonSummary);
  const setUserWonLeague = useUIStore((s) => s.setUserWonLeague);
  const userClub = useUIStore((s) => s.userClub);
  const selectedNationalTeamId = useUIStore((s) => s.selectedNationalTeamId);
  const vacationKeepTactic = useUIStore((s) => s.vacationKeepTactic);
  const vacationKeepXI = useUIStore((s) => s.vacationKeepXI);
  const setVacationKeepTactic = useUIStore((s) => s.setVacationKeepTactic);
  const setVacationKeepXI = useUIStore((s) => s.setVacationKeepXI);
  const setIsInVacation = useUIStore((s) => s.setIsInVacation);
  const setFixtures = useGameStore((s) => s.setFixtures);
  const notify = useWorldStore((s) => s.notify);

  const [mode, setMode] = useState<'MENU' | 'SEASON' | 'DATE'>('MENU');
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date(useUIStore.getState().currentDate);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simDateLabel, setSimDateLabel] = useState('');
  const [simStats, setSimStats] = useState({ days: 0, totalDays: 1, matches: 0 });
  const cancelledRef = useRef(false);
  const lastChronicleMonthRef = useRef(-1);

  const simulateToDate = useCallback(async (endDate: Date) => {
    const uiState = useUIStore.getState();
    const startDate = new Date(uiState.currentDate);
    const activeSeasonEnd = new Date(uiState.seasonEndDate);

    if (endDate <= startDate) {
      setStatus('❌ La fecha objetivo debe ser posterior a la fecha actual.');
      return;
    }

    cancelledRef.current = false;
    setIsSimulating(true);
    setIsInVacation(true);
    setProgress(2);
    setSimDateLabel(startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }));

    const MAX_DAYS = 450;
    let tempDate = new Date(startDate);
    let localFixtures = [...useGameStore.getState().fixtures];
    let daysProcessed = 0;
    let userMatchesPlayed = 0;
    let batchCount = 0;
    const BATCH_SIZE = 2;
    const totalDays = Math.max(
      1,
      Math.min(MAX_DAYS, Math.ceil((endDate.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24)))
    );
    lastChronicleMonthRef.current = -1;
    setSimStats({ days: 0, totalDays, matches: 0 });
    setStatus(`Iniciando simulación (${totalDays} días)…`);

    // Pintar la barra de progreso antes de iniciar el ciclo pesado
    await yieldPaint();

    const activeManagedTeamId = userClub?.id || selectedNationalTeamId || undefined;

    while (tempDate < endDate && daysProcessed < MAX_DAYS) {
      if (cancelledRef.current) {
        setFixtures(localFixtures);
        setCurrentDate(new Date(tempDate));
        if (activeManagedTeamId) {
          useGameStore.getState().updateNextFixture(localFixtures, tempDate, activeManagedTeamId);
        }
        setStatus(`⏸ Simulación detenida. ${daysProcessed} días procesados y ${userMatchesPlayed} partidos jugados.`);
        setIsSimulating(false);
        setIsInVacation(false);
        setProgress(0);
        notify();
        return;
      }

      const playedBefore = userClub
        ? localFixtures.filter(
            (f) =>
              f.played &&
              f.squadType === 'SENIOR' &&
              (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)
          ).length
        : 0;

      // Simular partidos programados en el día actual ANTES de pasar al día siguiente
      await simulateDayFixtures({
        date: tempDate,
        fixtures: localFixtures,
        userClub,
        selectedNationalTeamId,
        suppressProgress: true,
      });

      const playedAfter = userClub
        ? localFixtures.filter(
            (f) =>
              f.played &&
              f.squadType === 'SENIOR' &&
              (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)
          ).length
        : 0;
      if (playedAfter > playedBefore) {
        userMatchesPlayed += playedAfter - playedBefore;
      }

      tempDate.setDate(tempDate.getDate() + 1);
      daysProcessed++;
      batchCount++;

      const pct = Math.min(99, Math.max(2, Math.round((daysProcessed / totalDays) * 100)));
      const dateText = tempDate.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      setProgress(pct);
      setSimDateLabel(dateText);
      setSimStats({ days: daysProcessed, totalDays, matches: userMatchesPlayed });
      setStatus(`Simulando ${dateText} · ${daysProcessed}/${totalDays} días`);

      // ── Ciclo de vida diario ──
      LifecycleManager.checkBirthdays(tempDate);
      LifecycleManager.recoverDailyFitness();
      LifecycleManager.processMonthlyFinances(tempDate);
      world.checkRenewalTriggers(tempDate, userClub?.id);
      world.processTransferDecisions(tempDate);
      world.processAIActivity(tempDate);
      world.processDailyContracts(tempDate, userClub?.id);
      world.processDailyScouting(tempDate, userClub?.id);

      world.generateGeneralNews(tempDate);
      world.processLightMarketActivity(tempDate);
      world.processQuarterlyYouthIntake(tempDate);
      world.ensureMinimumSquadSizes();

      if (tempDate.getDay() === 1) {
        world.generateStandingsNews(tempDate, localFixtures);
        world.simulateCoachChanges(tempDate, localFixtures);
      }

      if (tempDate.getMonth() === 7 && tempDate.getDate() === 1) {
        world.generateYouthIntake(tempDate.getFullYear());
      }

      if (tempDate.getDate() === 1) {
        world.recalculateAllPlayerValues();
        if (userClub) world.computeTeamCohesion(userClub.id);
        if (userClub && lastChronicleMonthRef.current !== tempDate.getMonth()) {
          const prevMonth = tempDate.getMonth() === 0 ? 11 : tempDate.getMonth() - 1;
          const prevYear = tempDate.getMonth() === 0 ? tempDate.getFullYear() - 1 : tempDate.getFullYear();
          const monthFixtures = localFixtures.filter((f) => {
            const fd = new Date(f.date);
            return (
              f.played &&
              fd.getMonth() === prevMonth &&
              fd.getFullYear() === prevYear &&
              (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) &&
              f.squadType === 'SENIOR'
            );
          });
          let won = 0,
            drawn = 0,
            lost = 0;
          monthFixtures.forEach((f) => {
            const isHome = f.homeTeamId === userClub.id;
            const us = isHome ? f.homeScore! : f.awayScore!;
            const them = isHome ? f.awayScore! : f.homeScore!;
            if (us > them) won++;
            else if (us < them) lost++;
            else drawn++;
          });
          if (monthFixtures.length > 0) {
            const monthDate = new Date(prevYear, prevMonth, 15);
            generateMonthlyChronicle(userClub.id, monthDate, { won, drawn, lost });
            const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const balanceText = won >= 4 ? 'excelente' : won >= 3 && lost <= 1 ? 'positivo' : won >= 2 && lost >= 2 ? 'de altibajos' : won >= 1 && lost >= 3 ? 'negativo' : 'para olvidar';
            world.addSeasonPage('MONTHLY_REPORT', `Informe mensual · ${monthNames[prevMonth]}`, `El mes fue ${balanceText}: ${won} victorias, ${drawn} empates y ${lost} derrotas.`, monthDate, won >= 3 ? 'MEDIUM' : 'LOW');
          }
          lastChronicleMonthRef.current = tempDate.getMonth();
        }
      }

      world.processDeadlineWeekActivity(tempDate);
      world.processDeadlineDay(tempDate);
      world.developYouthPlayers(tempDate);
      world.autoPromoteYouthPlayers(tempDate);

      if (userClub) {
        world.checkDressingRoomConflicts(userClub.id, tempDate);
        world.checkTransferRequestMotives(userClub.id, tempDate);
        world.generateNarrativeEvents(userClub.id, tempDate);
        detectPlayerDialogueTriggers(userClub.id, tempDate);
      }

      const newCupFixtures = LifecycleManager.processCompetitionProgress(localFixtures, tempDate);
      if (newCupFixtures.length > 0) {
        localFixtures = [...localFixtures, ...newCupFixtures];
      }

      // ── Fin de temporada ──
      if (tempDate >= activeSeasonEnd) {
        setProgress(98);
        setStatus('Cerrando temporada, generando crónicas y premios…');
        await yieldPaint();

        world.processLoanReturns(tempDate);
        const result = useGameStore.getState().finishSeason(localFixtures, activeManagedTeamId, tempDate);
        setSeasonSummary(result.summaries);
        setUserWonLeague(result.userWonLeague);
        const gs = useGameStore.getState();
        gs.setManagerHistory({ ...gs.managerHistory, seasonsCompleted: gs.managerHistory.seasonsCompleted + 1 });
        if (result.userWonLeague) gs.trackTitle('Liga');
        const wonCups = result.summaries.filter((s: any) => s.championId === activeManagedTeamId && s.compType !== 'LEAGUE');
        wonCups.forEach((s: any) => gs.trackTitle(s.compName));
        if (userClub) {
          const leagueTable = world.getLeagueTable(userClub.leagueId, localFixtures, 'SENIOR');
          const leaguePos = leagueTable.findIndex((e) => e.clubId === userClub.id) + 1;
          const leagueTotal = leagueTable.length;
          const cupWinnerId = result.summaries.find((s: any) => s.compType !== 'LEAGUE' && s.championId)?.championId;
          const wonCup = cupWinnerId === userClub.id;
          const titleNames: string[] = [];
          if (result.userWonLeague) titleNames.push('Liga');
          wonCups.forEach((s: any) => titleNames.push(s.compName));
          world.updateManagerProfileSeasonEnd(result.userWonLeague || wonCups.length > 0, titleNames, leaguePos || 10, leagueTotal || 20);
          world.evaluateBoardConfidence(userClub.id, leaguePos || 10, leagueTotal || 20, wonCup, false);
          world.checkManagerJobOffers(tempDate, userClub.id, useGameStore.getState().managerReputation);
        }
        // Avanzar calendario al inicio de la nueva temporada (evita que Continuar dispare fin de temporada otra vez)
        setCurrentDate(result.nextSeasonStart);
        setSeasonEndDate(result.nextSeasonEnd);
        if (activeManagedTeamId) {
          useGameStore.getState().updateNextFixture(result.newFixtures, result.nextSeasonStart, activeManagedTeamId);
        }
        setProgress(100);
        setIsSimulating(false);
        setIsInVacation(false);
        setStatus(`✓ Temporada completada (${daysProcessed} días simulados).`);
        notify();
        onBack();
        return;
      }

      if (batchCount >= BATCH_SIZE) {
        setCurrentDate(new Date(tempDate));
        batchCount = 0;
        await yieldPaint();
      }
    }

    setFixtures(localFixtures);
    setCurrentDate(new Date(tempDate));
    if (activeManagedTeamId) {
      useGameStore.getState().updateNextFixture(localFixtures, tempDate, activeManagedTeamId);
    }
    setIsSimulating(false);
    setIsInVacation(false);
    setProgress(100);
    setStatus(`✓ Simulación completada (${daysProcessed} días simulados).`);
    notify();
    onBack();
  }, [userClub, selectedNationalTeamId, setFixtures, setCurrentDate, setSeasonEndDate, setSeasonSummary, setUserWonLeague, setIsInVacation, notify, onBack]);

  const handleSimulateSeason = async () => {
    const endOfCurrentSeason = new Date(useUIStore.getState().seasonEndDate.getTime());
    await simulateToDate(endOfCurrentSeason);
  };

  const handleSimulateToDate = async () => {
    if (!targetDate) return;
    const parts = targetDate.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      setStatus('❌ Formato de fecha inválido. Usa YYYY-MM-DD');
      return;
    }
    const end = new Date(parts[0], parts[1] - 1, parts[2]);
    if (end <= useUIStore.getState().currentDate) {
      setStatus('❌ La fecha debe ser posterior a la actual.');
      return;
    }
    await simulateToDate(end);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('⏸ Deteniendo simulación…');
  };

  const renderVacationPreferences = () => (
    <div className="bg-white border border-[#a0b0a0] rounded-sm p-3 space-y-2 text-left">
      <div className="text-[9.5px] font-black uppercase text-slate-600 tracking-wider border-b border-slate-200 pb-1">
        Instrucciones durante las vacaciones
      </div>
      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={vacationKeepTactic}
          onChange={(e) => setVacationKeepTactic(e.target.checked)}
          disabled={isSimulating}
          className="mt-0.5 w-3.5 h-3.5 accent-[#2b5d2c] cursor-pointer"
        />
        <span className="text-[10.5px] leading-snug text-slate-800">
          <strong className="block font-black">Mantener táctica actual</strong>
          <span className="text-[9.5px] text-slate-600 font-semibold">
            Usar tu dibujo e instrucciones activas en los partidos simulados.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={vacationKeepXI}
          onChange={(e) => setVacationKeepXI(e.target.checked)}
          disabled={isSimulating}
          className="mt-0.5 w-3.5 h-3.5 accent-[#2b5d2c] cursor-pointer"
        />
        <span className="text-[10.5px] leading-snug text-slate-800">
          <strong className="block font-black">Mantener el 11 titular mientras se pueda</strong>
          <span className="text-[9.5px] text-slate-600 font-semibold">
            Alinea siempre a tus titulares elegidos salvo lesión o sanción; si se desmarca, rota según estado físico.
          </span>
        </span>
      </label>
    </div>
  );

  return (
    <div className="p-3 sm:p-5 h-full overflow-y-auto bg-[#d4dcd4]" style={{ fontFamily: 'Verdana, sans-serif' }}>
      {/* Live Progress Overlay with FM08 Progress Bar */}
      {isSimulating && (
        <div className="fixed inset-0 z-[950] bg-[#14181d]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#e8ece8] border border-[#1c1f24] rounded-sm shadow-2xl overflow-hidden">
            <div
              className="px-4 py-2.5 border-b border-[#14171a] flex items-center justify-between gap-2"
              style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FMSpinner size="sm" />
                <span className="text-xs font-bold text-white uppercase tracking-wide truncate">
                  Simulando Vacaciones
                </span>
              </div>
              <span className="font-mono text-xs font-black text-[#facc15] tabular-nums shrink-0">
                {progress}%
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                <span className="truncate">{simDateLabel || currentDate.toLocaleDateString()}</span>
                <span className="font-mono tabular-nums text-slate-600 shrink-0">
                  {simStats.days}/{simStats.totalDays} días
                </span>
              </div>

              <div className="w-full h-4 bg-[#c9d4c9] border border-[#8e9b90] rounded-sm overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-[#2b5d2c] via-[#3b7a3d] to-[#2b5d2c] transition-all duration-150 ease-out"
                  style={{ width: `${Math.max(3, progress)}%` }}
                />
              </div>

              <div className="bg-white border border-[#a0b0a0] rounded-sm px-3 py-2 flex items-center justify-between text-[10px] font-bold text-slate-700">
                <span className="truncate">{status || 'Procesando jornadas y crónicas…'}</span>
                {userClub && (
                  <span className="font-mono text-[#2b5d2c] shrink-0 ml-2">
                    {simStats.matches} PJ
                  </span>
                )}
              </div>

              <FMButton variant="danger" onClick={handleCancel} className="w-full py-2">
                Detener Simulación
              </FMButton>
            </div>
          </div>
        </div>
      )}

      {mode === 'MENU' && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-2.5 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-3 py-2 shadow-xs">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 bg-white border border-[#8e9b90] rounded-sm hover:bg-[#ccd9cc] transition-colors cursor-pointer"
              aria-label="Volver"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <Sun size={20} className="text-amber-600 shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase italic tracking-tight">
                Vacaciones
              </h2>
              <p className="text-[9.5px] font-bold text-slate-600">
                Fecha actual: {currentDate.toLocaleDateString()} · Fin de temporada: {seasonEndDate.toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('SEASON')}
              disabled={isSimulating}
              className="p-5 bg-white border-2 border-[#a0b0a0] rounded-sm hover:border-[#2b5d2c] hover:shadow-md transition-all text-left disabled:opacity-50 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-sm bg-[#2b5d2c]/10 border border-[#2b5d2c]/30 flex items-center justify-center mb-3">
                <Trophy size={20} className="text-[#2b5d2c]" />
              </div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide mb-1">
                Simular Temporada Completa
              </h3>
              <p className="text-[10px] text-slate-600 font-semibold leading-relaxed">
                Avanza hasta el final de la temporada ({seasonEndDate.toLocaleDateString()}). Incluye partidos, crónicas, finanzas y torneos.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('DATE')}
              disabled={isSimulating}
              className="p-5 bg-white border-2 border-[#a0b0a0] rounded-sm hover:border-[#2b5d2c] hover:shadow-md transition-all text-left disabled:opacity-50 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                <Calendar size={20} className="text-amber-700" />
              </div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide mb-1">
                Simular hasta Fecha
              </h3>
              <p className="text-[10px] text-slate-600 font-semibold leading-relaxed">
                Avanza hasta una fecha específica generando automáticamente resultados, noticias y crónicas.
              </p>
            </button>
          </div>

          {renderVacationPreferences()}

          {status && !isSimulating && (
            <FMBox title="Estado">
              <div className="flex items-start gap-2">
                <AlertCircle size={15} className="text-slate-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-slate-700">{status}</p>
              </div>
            </FMBox>
          )}
        </div>
      )}

      {mode === 'SEASON' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-2.5 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-3 py-2">
            <button
              type="button"
              onClick={() => setMode('MENU')}
              disabled={isSimulating}
              className="p-1.5 bg-white border border-[#8e9b90] rounded-sm hover:bg-[#ccd9cc] transition-colors cursor-pointer"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase italic tracking-tight">
              Simular Temporada
            </h2>
          </div>
          <FMBox title="Confirmar Acción">
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-800 leading-relaxed">
                Se simularán todos los días desde <strong>{currentDate.toLocaleDateString()}</strong> hasta{' '}
                <strong>{seasonEndDate.toLocaleDateString()}</strong>.
              </p>
              <p className="text-[10.5px] text-slate-600 leading-relaxed">
                Incluye todos los partidos de liga, copas nacionales e internacionales, desarrollo de jugadores y generación de crónicas de cada partido y torneo.
              </p>
              {renderVacationPreferences()}
              <div className="flex gap-2.5">
                <FMButton variant="secondary" onClick={() => setMode('MENU')} disabled={isSimulating} className="flex-1 py-2.5">
                  Cancelar
                </FMButton>
                <FMButton variant="primary" onClick={handleSimulateSeason} disabled={isSimulating} className="flex-[2] py-2.5">
                  <Play size={13} className="fill-current" /> Simular Temporada
                </FMButton>
              </div>
            </div>
          </FMBox>
        </div>
      )}

      {mode === 'DATE' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-2.5 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-3 py-2">
            <button
              type="button"
              onClick={() => setMode('MENU')}
              disabled={isSimulating}
              className="p-1.5 bg-white border border-[#8e9b90] rounded-sm hover:bg-[#ccd9cc] transition-colors cursor-pointer"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase italic tracking-tight">
              Simular hasta Fecha
            </h2>
          </div>
          <FMBox title="Seleccionar Fecha de Regreso">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-1.5">
                  Fecha objetivo
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  disabled={isSimulating}
                  className="w-full bg-white border border-[#a0b0a0] rounded-sm px-3 py-2 text-sm font-bold text-slate-900 focus:border-[#2b5d2c] outline-none disabled:opacity-50"
                />
              </div>
              {renderVacationPreferences()}
              <div className="flex gap-2.5">
                <FMButton variant="secondary" onClick={() => setMode('MENU')} disabled={isSimulating} className="flex-1 py-2.5">
                  Cancelar
                </FMButton>
                <FMButton variant="primary" onClick={handleSimulateToDate} disabled={isSimulating} className="flex-[2] py-2.5">
                  <Play size={13} className="fill-current" /> Iniciar Simulación
                </FMButton>
              </div>
            </div>
          </FMBox>
        </div>
      )}
    </div>
  );
};
