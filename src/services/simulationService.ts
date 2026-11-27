import { Fixture, Club, Player, Position, NationalTeamMatchOptions, NationalTeamChronicleContext } from '../types';
import { world } from './worldManager';
import { LifecycleManager } from './lifecycleManager';
import { MatchSimulator } from './engine';
import { buildFixtureMatchReport, generateMatchChronicle, generateNationalTeamChronicle } from './chronicleService';
import { useGameStore } from '../stores/gameStore';
import { useUIStore } from '../stores/uiStore';
import { isTabHidden, yieldToMain } from './backgroundYield';

// ─── National team helpers (extracted from App.tsx) ─────────────────────────

export function getClubNationalTeamId(userClub: Club | null): string | undefined {
  const manager = world.nationalTeamManager;
  if (!userClub || !manager?.nationalTeams) return undefined;
  const normalizeCountry = (country: string) => country.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const userCountry = normalizeCountry(userClub.country);
  return manager.nationalTeams.find((team: any) => normalizeCountry(team.country) === userCountry)?.id;
}

export function getNationalChronicleTeamIds(fixture: Fixture, _userClub: Club | null): string[] {
  const manager = world.nationalTeamManager;
  if (!manager?.controlledTeamId) return [];
  if (fixture.homeTeamId === manager.controlledTeamId || fixture.awayTeamId === manager.controlledTeamId) {
    return [manager.controlledTeamId];
  }
  return [];
}

export function getNationalMatchOptions(fixture: Fixture): NationalTeamMatchOptions {
  const manager = world.nationalTeamManager;
  const teamId = manager?.controlledTeamId;
  if (!manager || !teamId) return {};
  const squadIds = manager.getControlledSquadIds(teamId);
  const tactic = manager.getControlledTactic(teamId);
  if (fixture.homeTeamId === teamId) return { homeSquadIds: squadIds, homeTactic: tactic };
  if (fixture.awayTeamId === teamId) return { awaySquadIds: squadIds, awayTactic: tactic };
  return {};
}

export function getNationalChronicleContext(teamId: string): NationalTeamChronicleContext | undefined {
  const manager = world.nationalTeamManager;
  if (!manager?.isControlled(teamId)) return undefined;
  return {
    controlled: true,
    squadSize: manager.getControlledSquadIds(teamId).length,
    squadIds: manager.getControlledSquadIds(teamId),
    tactic: manager.getControlledTactic(teamId),
  };
}

// ─── Shared day simulation logic ─────────────────────────────────────────────

/**
 * Determina si un fixture debe resolverse con detalle ligero (LIGHT):
 * partidos de reservas/sub-20 y ligas que no son "deep" para el usuario.
 * Copas, torneos continentales, selecciones y amistosos conservan detalle completo de eventos.
 */
export function isLightFixture(
  f: Fixture,
  deepLeagueIds: Set<string>,
  compTypeMap?: Map<string, string>
): boolean {
  if (f.squadType !== 'SENIOR') return true;
  if (deepLeagueIds.has(f.competitionId)) return false;
  const compType = compTypeMap
    ? compTypeMap.get(f.competitionId)
    : world.competitions.find(c => c.id === f.competitionId)?.type;
  return compType === 'LEAGUE';
}

export interface DaySimParams {
  date: Date;
  fixtures: Fixture[];
  userClub: Club | null;
  selectedNationalTeamId: string | null;
  /** If true, skip simulating fixtures involving el club o la selección del usuario (usado por simulateToNextMatch) */
  skipUserMatches?: boolean;
  /** If true, do not overwrite global UI progress bar (used inside multi-day loops like vacation/simulateToNextMatch) */
  suppressProgress?: boolean;
  /** Optional progress callback (0..100, detail) */
  onProgress?: (pct: number, detail: string) => void;
}

/** Tamaño de lote: con el resolvedor táctico calibrado (~0.1ms/partido), 25 partidos ~2.5ms por chunk. */
const FIXTURE_BATCH = 25;

/**
 * Cooperative scheduling: cede el hilo principal sin detenerse en pestañas en segundo plano.
 */
function yieldToMainThread(): Promise<void> {
  return yieldToMain(isTabHidden() ? 'background' : 'paint');
}

/**
 * Simulate all fixtures for a single day (async, chunked para no congelar la UI).
 * Al finalizar, invalida la caché de tablas de posiciones.
 */
export async function simulateDayFixtures(params: DaySimParams): Promise<void> {
  const { date, fixtures, userClub, selectedNationalTeamId, suppressProgress, onProgress } = params;
  const targetDateStr = date.toDateString();
  const dayFixtures = fixtures.filter(f =>
    !f.played && f.date.toDateString() === targetDateStr
  );
  if (dayFixtures.length === 0) return;

  // Pre-cache squads and competition types once per day
  const uniqueClubIds = [...new Set(dayFixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]))];
  const squads = world.preFetchSquads(uniqueClubIds);
  const deepIds = new Set(useGameStore.getState().deepSimLeagues);
  const compTypeMap = new Map<string, string>();
  world.competitions.forEach(c => compTypeMap.set(c.id, c.type));

  const isUserFixture = (f: Fixture) =>
    (userClub && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)) ||
    (selectedNationalTeamId && (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId));

  const reportProgress = (done: number, total: number) => {
    if (suppressProgress) return;
    const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    const detail = `Simulando partidos del día (${done}/${total})…`;
    if (onProgress) {
      onProgress(pct, detail);
    } else {
      const ui = useUIStore.getState();
      ui.setSimProgress(pct);
      ui.setSimProgressDetail(detail);
    }
  };

  const totalDayFixtures = dayFixtures.length;
  if (totalDayFixtures >= 8) {
    reportProgress(0, totalDayFixtures);
  }

  for (let i = 0; i < totalDayFixtures; i++) {
    if (i > 0 && i % FIXTURE_BATCH === 0) {
      reportProgress(i, totalDayFixtures);
      await yieldToMainThread();
    }

    const f = dayFixtures[i];
    // Skip user matches if requested (simulateToNextMatch stops at user match)
    if (params.skipUserMatches && isUserFixture(f)) continue;

    const isNationalTeamMatch = ['WC_Q', 'WC_FINAL', 'COPA', 'EURO', 'AFCON'].includes(f.competitionId);

    if (isNationalTeamMatch) {
      const result = MatchSimulator.simulateNationalTeamMatch(f.homeTeamId, f.awayTeamId, getNationalMatchOptions(f));
      f.played = true;
      f.homeScore = result.homeScore;
      f.awayScore = result.awayScore;
      f.matchReport = buildFixtureMatchReport(result.events, result.stats, f.homeTeamId, f.awayTeamId, {
        squadType: f.squadType,
        summary: result.summary,
      });
      getNationalChronicleTeamIds(f, userClub).forEach(teamId => {
        generateNationalTeamChronicle(f, result.homeScore, result.awayScore, result.stats, teamId, result.events, getNationalChronicleContext(teamId));
      });
    } else {
      const isUserSeniorFixture = Boolean(
        userClub && f.squadType === 'SENIOR' && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)
      );
      const light = isUserSeniorFixture ? false : isLightFixture(f, deepIds, compTypeMap);
      let quickOpts: Parameters<typeof MatchSimulator.simulateQuickMatch>[5];
      if (isUserSeniorFixture && userClub) {
        const uiState = useUIStore.getState();
        const isVacation = uiState.isInVacation;
        const keepTactic = !isVacation || uiState.vacationKeepTactic;
        const keepXI = !isVacation || uiState.vacationKeepXI;
        const userTactic = keepTactic ? world.getActiveTactic() : undefined;
        const isHome = f.homeTeamId === userClub.id;
        let rotatedOverride: Player[] | undefined;
        if (!keepXI) {
          const rawUserSquad = (squads.get(userClub.id) || []).filter(p => p.squad === 'SENIOR');
          const eligible = rawUserSquad.filter(p => !p.injury && !(p.suspension && p.suspension.matchesLeft > 0));
          const pool = eligible.length >= 11 ? eligible : rawUserSquad;
          const scoreReadiness = (p: Player) => (p.fitness ?? 80) * 0.85 + (p.currentAbility ?? 100) * 0.7;
          const bestGk = pool
            .filter(p => p.primaryPosition === Position.GK || p.positions?.includes(Position.GK))
            .sort((a, b) => scoreReadiness(b) - scoreReadiness(a))[0];
          const outfield = pool
            .filter(p => !bestGk || p.id !== bestGk.id)
            .sort((a, b) => scoreReadiness(b) - scoreReadiness(a))
            .slice(0, bestGk ? 10 : 11);
          const chosenIds = new Set([...(bestGk ? [bestGk.id] : []), ...outfield.map(p => p.id)]);
          rotatedOverride = rawUserSquad.map(p => ({
            ...p,
            isStarter: chosenIds.has(p.id),
            tacticalPosition: undefined,
          }));
        }
        quickOpts = {
          homeFullTactic: isHome ? userTactic : undefined,
          awayFullTactic: !isHome ? userTactic : undefined,
          homePlayersOverride: isHome ? rotatedOverride : undefined,
          awayPlayersOverride: !isHome ? rotatedOverride : undefined,
        };
      }
      const { homeScore, awayScore, stats, events, summary } = light
        ? MatchSimulator.simulateLightMatch(f.homeTeamId, f.awayTeamId, f.squadType)
        : MatchSimulator.simulateQuickMatch(f.homeTeamId, f.awayTeamId, f.squadType, undefined, undefined, quickOpts);
      f.played = true;
      f.homeScore = homeScore;
      f.awayScore = awayScore;
      f.matchReport = buildFixtureMatchReport(events, stats, f.homeTeamId, f.awayTeamId, {
        squadType: f.squadType,
        summary,
      });
      const isKnockoutStage = [
        'ROUND_OF_64',
        'ROUND_OF_32',
        'ROUND_OF_16',
        'QUARTER_FINAL',
        'SEMI_FINAL',
        'FINAL',
      ].includes(f.stage);
      let needsPenalties = false;
      if (isKnockoutStage && f.leg !== 1) {
        if (f.leg === 2) {
          const leg1 = fixtures.find(
            x =>
              x.leg === 1 &&
              (f.tieId
                ? x.tieId === f.tieId
                : x.competitionId === f.competitionId &&
                  x.stage === f.stage &&
                  x.homeTeamId === f.awayTeamId &&
                  x.awayTeamId === f.homeTeamId)
          );
          if (leg1 && leg1.played) {
            const aggHome = homeScore + (leg1.awayScore ?? 0);
            const aggAway = awayScore + (leg1.homeScore ?? 0);
            needsPenalties = aggHome === aggAway;
          } else {
            needsPenalties = homeScore === awayScore;
          }
        } else {
          needsPenalties = homeScore === awayScore;
        }
      }
      if (needsPenalties) {
        let ph = 0, pa = 0;
        for (let k = 0; k < 5; k++) {
          if (Math.random() < 0.74) ph++;
          if (Math.random() < 0.74) pa++;
        }
        while (ph === pa) {
          if (Math.random() < 0.74) ph++;
          if (Math.random() < 0.74) pa++;
        }
        f.penaltyHome = ph;
        f.penaltyAway = pa;
      }
      const hSquad = (squads.get(f.homeTeamId) || []).filter(p => p.squad === f.squadType);
      const aSquad = (squads.get(f.awayTeamId) || []).filter(p => p.squad === f.squadType);
      MatchSimulator.finalizeSeasonStats(hSquad, aSquad, stats, homeScore, awayScore, f.competitionId);
      MatchSimulator.processMatchInjuries(stats);
      const hRedCards = Object.entries(stats).filter(([pid, s]) => s.card === 'RED' && world.getPlayer(pid)?.clubId === f.homeTeamId).length;
      const aRedCards = Object.entries(stats).filter(([pid, s]) => s.card === 'RED' && world.getPlayer(pid)?.clubId === f.awayTeamId).length;
      if (f.competitionId === 'FRIENDLY') {
        world.processMatchDayIncome(f.homeTeamId, f.competitionId, date);
        // Friendlies: cohesion + tactical familiarity boost
        if (f.homeTeamId === userClub?.id || f.awayTeamId === userClub?.id) {
          const userClubId = userClub?.id || '';
          if (userClubId) {
            const club = world.getClub(userClubId);
            if (club) club.teamCohesion = Math.min(100, (club.teamCohesion || 50) + 2);
            const userSquad = f.homeTeamId === userClubId ? hSquad : aSquad;
            userSquad.forEach(p => {
              p.tacticalFamiliarity = Math.min(100, p.tacticalFamiliarity + 3);
              p.fitness = Math.min(100, p.fitness + 5);
            });
          }
        }
      } else {
        LifecycleManager.processPostMatchSuspensions(f.homeTeamId, f.awayTeamId, hRedCards, aRedCards);
        world.processMatchDayIncome(f.homeTeamId, f.competitionId, date);
        world.trackU21Minutes(f.homeTeamId, hSquad, stats, date);
        world.trackU21Minutes(f.awayTeamId, aSquad, stats, date);
      }
      if (userClub && f.squadType === 'SENIOR' && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)) {
        const us = f.homeTeamId === userClub.id ? homeScore : awayScore;
        const os = f.homeTeamId === userClub.id ? awayScore : homeScore;
        useGameStore.getState().trackMatchResult(us, os);
        world.updateManagerProfileMatch(us, os);
        world.updateTacticalFamiliarity(userClub.id);
        generateMatchChronicle(f, homeScore, awayScore, stats, userClub.id, events);

        const userClubName = world.getClub(userClub.id)?.name || 'Mi club';
        const oppClub = world.getClub(f.homeTeamId === userClub.id ? f.awayTeamId : f.homeTeamId);
        const oppName = oppClub?.name || 'Rival';
        const compName = world.competitions.find(c => c.id === f.competitionId)?.name || 'Competición';
        const resultText = us > os ? `Victoria ${us}-${os}` : us === os ? `Empate ${us}-${os}` : `Derrota ${us}-${os}`;
        world.addSeasonPage(
          'MATCH',
          `${resultText} ante ${oppName}`,
          `${userClubName} disputó su partido de ${compName} contra ${oppName} con un resultado de ${us}-${os} (Primer equipo).`,
          date,
          Math.abs(us - os) >= 3 ? 'HIGH' : us !== os ? 'MEDIUM' : 'LOW'
        );
      }
    }
    world.generateMatchNews(f, f.homeScore!, f.awayScore!, date);
  }

  // Los resultados de hoy afectan las tablas de posiciones → invalidar caché
  world.bumpFixturesVersion();
}
