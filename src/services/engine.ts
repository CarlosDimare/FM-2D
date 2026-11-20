import {
  Club,
  MatchEvent,
  NationalTeamMatchOptions,
  Player,
  PlayerMatchStats,
  Position,
  TacticSettings,
} from '../types';
import { world } from './worldManager';
import { sendInjuryNotification } from './notifications';
import { simulateFastTacticalMatch } from './matchEngineBridge';

export const SLOT_CONFIG: Record<
  number,
  { line: 'GK' | 'SW' | 'DEF' | 'DM' | 'MID' | 'AM' | 'ATT'; side?: 'LEFT' | 'RIGHT' | 'CENTER'; abbr: string }
> = {
  0: { line: 'GK', side: 'CENTER', abbr: 'POR' },
  31: { line: 'SW', side: 'CENTER', abbr: 'LIB' },
  1: { line: 'DEF', side: 'LEFT', abbr: 'DFI' },
  2: { line: 'DEF', side: 'CENTER', abbr: 'DFC' },
  3: { line: 'DEF', side: 'CENTER', abbr: 'DFC' },
  4: { line: 'DEF', side: 'CENTER', abbr: 'DFC' },
  5: { line: 'DEF', side: 'RIGHT', abbr: 'DFD' },
  6: { line: 'DM', side: 'LEFT', abbr: 'CRI' },
  7: { line: 'DM', side: 'CENTER', abbr: 'MCD' },
  8: { line: 'DM', side: 'CENTER', abbr: 'MCD' },
  9: { line: 'DM', side: 'CENTER', abbr: 'MCD' },
  10: { line: 'DM', side: 'RIGHT', abbr: 'CRD' },
  11: { line: 'MID', side: 'LEFT', abbr: 'MI' },
  12: { line: 'MID', side: 'CENTER', abbr: 'MC' },
  13: { line: 'MID', side: 'CENTER', abbr: 'MC' },
  14: { line: 'MID', side: 'CENTER', abbr: 'MC' },
  15: { line: 'MID', side: 'RIGHT', abbr: 'MD' },
  16: { line: 'AM', side: 'LEFT', abbr: 'MPI' },
  17: { line: 'AM', side: 'CENTER', abbr: 'MPC' },
  18: { line: 'AM', side: 'RIGHT', abbr: 'MPD' },
  19: { line: 'AM', side: 'CENTER', abbr: 'MPC' },
  20: { line: 'AM', side: 'CENTER', abbr: 'MPC' },
  26: { line: 'ATT', side: 'CENTER', abbr: 'DLC' },
  27: { line: 'ATT', side: 'LEFT', abbr: 'EXT' },
  28: { line: 'ATT', side: 'RIGHT', abbr: 'EXT' },
  29: { line: 'ATT', side: 'CENTER', abbr: 'DLC' },
  30: { line: 'ATT', side: 'CENTER', abbr: 'DLC' },
};

const NATIONAL_TEAM_KIT_COLORS: Record<string, { primary: string; secondary: string }> = {
  argentina: { primary: 'bg-sky-400', secondary: 'text-white' },
  brasil: { primary: 'bg-yellow-400', secondary: 'text-green-700' },
  brazil: { primary: 'bg-yellow-400', secondary: 'text-green-700' },
  uruguay: { primary: 'bg-sky-500', secondary: 'text-slate-900' },
  colombia: { primary: 'bg-yellow-400', secondary: 'text-blue-800' },
  chile: { primary: 'bg-red-600', secondary: 'text-blue-800' },
  paraguay: { primary: 'bg-red-600', secondary: 'text-white' },
  ecuador: { primary: 'bg-yellow-400', secondary: 'text-blue-700' },
  peru: { primary: 'bg-white', secondary: 'text-red-600' },
  espana: { primary: 'bg-red-700', secondary: 'text-yellow-400' },
  spain: { primary: 'bg-red-700', secondary: 'text-yellow-400' },
  francia: { primary: 'bg-blue-800', secondary: 'text-white' },
  france: { primary: 'bg-blue-800', secondary: 'text-white' },
  italia: { primary: 'bg-blue-600', secondary: 'text-white' },
  italy: { primary: 'bg-blue-600', secondary: 'text-white' },
  alemania: { primary: 'bg-white', secondary: 'text-slate-900' },
  germany: { primary: 'bg-white', secondary: 'text-slate-900' },
  inglaterra: { primary: 'bg-white', secondary: 'text-red-700' },
  england: { primary: 'bg-white', secondary: 'text-red-700' },
  portugal: { primary: 'bg-red-700', secondary: 'text-green-700' },
  paises_bajos: { primary: 'bg-orange-500', secondary: 'text-white' },
  holanda: { primary: 'bg-orange-500', secondary: 'text-white' },
  netherlands: { primary: 'bg-orange-500', secondary: 'text-white' },
  mexico: { primary: 'bg-green-700', secondary: 'text-white' },
  estados_unidos: { primary: 'bg-blue-800', secondary: 'text-red-600' },
  japon: { primary: 'bg-blue-700', secondary: 'text-white' },
  croacia: { primary: 'bg-red-600', secondary: 'text-white' },
  belgica: { primary: 'bg-red-700', secondary: 'text-yellow-400' },
  marruecos: { primary: 'bg-red-700', secondary: 'text-green-700' },
};

export function buildNationalTeamClub(teamId: string, fallbackPrimary = 'bg-sky-600'): Club {
  const manager = world.nationalTeamManager;
  const nt = manager?.nationalTeams?.find((t: any) => t.id === teamId);
  const normKey = (nt?.country || nt?.name || teamId)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  const kit = NATIONAL_TEAM_KIT_COLORS[normKey] || { primary: fallbackPrimary, secondary: 'text-white' };

  return {
    id: teamId,
    name: nt?.name || teamId,
    shortName: (nt?.shortName || nt?.name || teamId).slice(0, 3).toUpperCase(),
    leagueId: 'INTERNATIONAL',
    country: nt?.country || nt?.name || 'Internacional',
    primaryColor: kit.primary,
    secondaryColor: kit.secondary,
    finances: {
      balance: 0,
      transferBudget: 0,
      wageBudget: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      scoutingBudget: 0,
      monthlyHistory: [],
    },
    reputation: nt?.reputation || 7000,
    stadium: `Estadio Nacional de ${nt?.name || teamId}`,
    stadiumCapacity: 60000,
    honours: [],
    trainingFacilities: 15,
    youthFacilities: 15,
    youthRecruitment: 15,
    scoutingRegion: 'GLO',
    boardConfidence: 70,
    shortlistedPlayerIds: [],
    transferFolderIds: [],
    u21MinutesThisSeason: 0,
    records: {
      biggestVictory: null,
      biggestDefeat: null,
      longestWinStreak: 0,
      currentWinStreak: 0,
      highestScoringMatch: null,
      bestPlayerSeason: null,
    },
  };
}

export class ProfileNarrativeEngine {
  static getPersonalityLabel(player: Player): string {
    const i = player.stats.internal;
    if (i.decision >= 16 && i.polivalencia >= 14) return 'Modelo de Profesionalidad';
    if (i.agresividad >= 17) return 'Volátil';
    if (i.polivalencia >= 15) return 'Líder Nato';
    if (i.decision >= 17) return 'Muy Determinado';
    return 'Equilibrado';
  }

  static generateHeadline(player: Player): string {
    const i = player.stats.internal;
    if (player.fitness < 60) return 'Físicamente al límite, necesita descanso urgente.';
    if (player.morale < 35) return 'Desmotivado y con la cabeza fuera del equipo.';
    if (player.positions[0] === Position.GK) {
      if (i.anticipacion >= 16) return 'Un seguro bajo palos con reflejos felinos.';
      if (i.decision >= 16) return 'Especialista en salir triunfante de los mano a mano.';
      return 'Portero solvente que aporta seguridad a la zaga.';
    }
    if (i.disparo >= 16 && i.decision >= 15) return 'Un depredador del área que rara vez falla ante el gol.';
    if (i.velocidad >= 17) return 'Un velocista capaz de castigar cualquier defensa adelantada.';
    if (i.pase >= 16 && i.vision >= 15) return 'Un cerebro privilegiado capaz de ver huecos imposibles.';
    if (i.control >= 16 && i.vision >= 16) return 'Un virtuoso del balón que deleita con su calidad técnica.';
    if (i.anticipacion >= 16 && i.agresividad >= 16) return 'Un baluarte defensivo prácticamente inexpugnable.';
    if (i.fuerza >= 16 && i.disparo >= 14) return 'Un coloso del aire dominante en ambas áreas.';
    if (i.posicionamiento >= 16 && i.anticipacion >= 16) return 'Lee el juego de maravilla y siempre está en el lugar justo.';
    if (i.decision >= 18 && i.resistencia >= 17) return 'Un guerrero incansable que lucha cada balón como si fuera el último.';
    if (i.polivalencia >= 17) return 'El gran capitán que guía al grupo con autoridad y ejemplo.';
    if (player.currentAbility > 150) return 'Un futbolista de clase mundial que marca diferencias.';
    if (player.currentAbility > 120) return 'Un jugador de gran nivel plenamente consolidado.';
    return 'Un profesional centrado en cumplir con su labor diaria.';
  }
}

export class MatchSimulator {
  static initMatchStats(players: Player[]): Record<string, PlayerMatchStats> {
    const stats: Record<string, PlayerMatchStats> = {};
    players.forEach((p) => {
      stats[p.id] = {
        rating: 6.0,
        goals: 0,
        assists: 0,
        condition: 100,
        minutesPlayed: 0,
        passesAttempted: 0,
        passesCompleted: 0,
        keyPasses: 0,
        shots: 0,
        shotsOnTarget: 0,
        dribblesAttempted: 0,
        dribblesCompleted: 0,
        offsides: 0,
        tacklesAttempted: 0,
        tacklesCompleted: 0,
        keyTackles: 0,
        interceptions: 0,
        shotsBlocked: 0,
        headersAttempted: 0,
        headersWon: 0,
        keyHeaders: 0,
        saves: 0,
        conceded: 0,
        foulsCommitted: 0,
        foulsReceived: 0,
        participationPhrase: '',
      };
    });
    return stats;
  }

  static processMatchInjuries(stats: Record<string, PlayerMatchStats>) {
    Object.entries(stats).forEach(([playerId, stat]) => {
      if (stat.sustainedInjury) {
        const player = world.getPlayer(playerId);
        if (player) {
          const severity = (stat.sustainedInjury.severity ||
            (stat.sustainedInjury.days > 60
              ? 'SEVERE'
              : stat.sustainedInjury.days > 30
              ? 'SERIOUS'
              : stat.sustainedInjury.days > 14
              ? 'MODERATE'
              : 'MINOR')) as any;
          player.injury = {
            type: stat.sustainedInjury.type,
            daysLeft: stat.sustainedInjury.days,
            totalDays: stat.sustainedInjury.days,
            severity,
            treatment: 'NONE',
            injuryDate: new Date(),
            recoveryProgress: 0,
            relapseRisk:
              severity === 'MINOR' ? 5 : severity === 'MODERATE' ? 15 : severity === 'SERIOUS' ? 30 : 50,
            daysSinceInjury: 0,
          };
          player.injuryHistory = player.injuryHistory || [];
          player.injuryHistory.push({
            type: stat.sustainedInjury.type,
            days: stat.sustainedInjury.days,
            date: new Date(),
            severity,
          });
          if (player.injuryHistory.length > 20) player.injuryHistory.shift();
          const recentCount = player.injuryHistory.length;
          const natFit = player.stats.internal.resistencia;
          player.injuryProneness = Math.max(0.005, Math.min(0.2, recentCount * 0.015 + (20 - natFit) * 0.015));

          if (stat.sustainedInjury.days > 30) {
            const club = world.getClub(player.clubId);
            if (club && club.id) {
              const userClub = world.getUserClub();
              if (club.id === userClub?.id) {
                world.addInboxMessage(
                  'SQUAD',
                  `Lesión grave: ${player.name}`,
                  `Malas noticias: ${player.name} sufre ${stat.sustainedInjury.type} y estará de baja ${stat.sustainedInjury.days} días. Se perderá gran parte de la temporada.`,
                  new Date(),
                  player.id,
                  'IMPORTANT'
                );
                sendInjuryNotification(player.name, stat.sustainedInjury.type, stat.sustainedInjury.days);
              }
              if (world.isNewsRelevantToUser({ clubId: club.id, playerId: player.id }) || player.currentAbility >= 165) {
                world.publishNews('LESIONES', {
                  type: 'CRITICISM',
                  headline: `Grave: ${player.name} se pierde gran parte de la temporada`,
                  subheadline: `${stat.sustainedInjury.type} (${stat.sustainedInjury.days} días de baja)`,
                  body: `${player.name} sufrió ${stat.sustainedInjury.type} y estará de baja ${stat.sustainedInjury.days} días. Un golpe durísimo para ${club.name}.`,
                  clubId: club.id,
                  playerId: player.id,
                });
              }
            }
          }
        }
      }
      if (stat.card === 'RED') {
        const player = world.getPlayer(playerId);
        if (player) {
          player.suspension = { matchesLeft: player.suspension?.matchesLeft || 1 };
        }
      }
    });
  }

  static finalizeSeasonStats(
    hS: Player[],
    aS: Player[],
    mS: Record<string, PlayerMatchStats>,
    h: number,
    a: number,
    cId: string
  ) {
    const isCupMatch = ['UCL', 'UEL', 'UECL', 'COPA', 'EURO', 'AFCON', 'WC_Q', 'WC_FINAL', 'WCC'].includes(cId);
    const proc = (ps: Player[], ga: number) =>
      ps.forEach((p) => {
        const s = mS[p.id];
        if (!s || s.minutesPlayed <= 0.1) return;
        if (isCupMatch && p.bigMatchTemperament > 14) {
          s.rating = Math.min(10, s.rating + (p.bigMatchTemperament - 14) * 0.15);
        }
        p.seasonStats.appearances++;
        p.seasonStats.goals += s.goals;
        p.seasonStats.assists += s.assists;
        p.seasonStats.conceded += ga;
        p.seasonStats.totalRating += s.rating;

        if (typeof s.condition === 'number' && !Number.isNaN(s.condition)) {
          p.fitness = Math.max(25, Math.min(100, Math.round(s.condition)));
        }
        if (s.card === 'YELLOW') {
          p.yellowCardsAccumulated = (p.yellowCardsAccumulated || 0) + 1;
        }

        if (!p.careerStats) {
          p.careerStats = {
            totalApps: 0,
            totalGoals: 0,
            totalAssists: 0,
            totalCleanSheets: 0,
            clubsPlayedFor: [p.clubId],
          };
        }
        p.careerStats.totalApps++;
        p.careerStats.totalGoals += s.goals;
        p.careerStats.totalAssists += s.assists;
        if (ga === 0 && s.minutesPlayed > 60) p.careerStats.totalCleanSheets++;
        if (!p.careerStats.clubsPlayedFor.includes(p.clubId)) {
          p.careerStats.clubsPlayedFor.push(p.clubId);
        }
        if (!p.statsByCompetition[cId]) {
          p.statsByCompetition[cId] = {
            appearances: 0,
            goals: 0,
            assists: 0,
            cleanSheets: 0,
            conceded: 0,
            totalRating: 0,
          };
        }
        const cs = p.statsByCompetition[cId];
        cs.appearances++;
        cs.goals += s.goals;
        cs.assists += s.assists;
        cs.conceded += ga;
        cs.totalRating += s.rating;
        p.formRatings.push(s.rating);
        if (p.formRatings.length > 5) p.formRatings.shift();
      });
    proc(hS, a);
    proc(aS, h);
  }

  static simulateLightMatch(
    homeId: string,
    awayId: string,
    squadType: string
  ): { homeScore: number; awayScore: number; stats: Record<string, PlayerMatchStats>; events: MatchEvent[] } {
    const hAll = world.getPlayersByClub(homeId).filter((p) => p.squad === squadType);
    const aAll = world.getPlayersByClub(awayId).filter((p) => p.squad === squadType);
    const hClub = world.getClub(homeId);
    const aClub = world.getClub(awayId);
    if (!hClub || !aClub) {
      return { homeScore: 0, awayScore: 0, stats: this.initMatchStats([...hAll, ...aAll]), events: [] };
    }
    const res = simulateFastTacticalMatch(hClub, aClub, hAll, aAll, { lightDetail: true });
    return { homeScore: res.homeScore, awayScore: res.awayScore, stats: res.stats, events: res.events };
  }

  static simulateQuickMatch(
    homeId: string,
    awayId: string,
    squadType: string,
    homeTactic?: TacticSettings,
    awayTactic?: TacticSettings
  ): { homeScore: number; awayScore: number; stats: Record<string, PlayerMatchStats>; events: MatchEvent[] } {
    const hAll = world.getPlayersByClub(homeId).filter((p) => p.squad === squadType);
    const aAll = world.getPlayersByClub(awayId).filter((p) => p.squad === squadType);
    const hClub = world.getClub(homeId);
    const aClub = world.getClub(awayId);
    if (!hClub || !aClub) {
      return { homeScore: 0, awayScore: 0, stats: this.initMatchStats([...hAll, ...aAll]), events: [] };
    }
    const res = simulateFastTacticalMatch(hClub, aClub, hAll, aAll, {
      homeSettings: homeTactic,
      awaySettings: awayTactic,
      lightDetail: false,
    });
    return { homeScore: res.homeScore, awayScore: res.awayScore, stats: res.stats, events: res.events };
  }

  static simulateNationalTeamMatch(
    homeTeamId: string,
    awayTeamId: string,
    options: NationalTeamMatchOptions = {}
  ): { homeScore: number; awayScore: number; stats: Record<string, PlayerMatchStats>; events: MatchEvent[] } {
    const manager = world.nationalTeamManager;
    const getMatchPlayers = (teamId: string): Player[] => {
      const controlledIds =
        options.homeSquadIds && teamId === homeTeamId
          ? options.homeSquadIds
          : options.awaySquadIds && teamId === awayTeamId
          ? options.awaySquadIds
          : manager?.isControlled(teamId)
          ? manager.getControlledSquadIds(teamId)
          : [];
      if (controlledIds.length > 0) {
        const controlled = controlledIds
          .map((id: string) => world.getPlayer(id))
          .filter((player: Player | undefined): player is Player => Boolean(player));
        if (controlled.length >= 11) return controlled;
      }
      return world.getPlayersByNationalTeam(teamId);
    };

    const homePlayers = getMatchPlayers(homeTeamId);
    const awayPlayers = getMatchPlayers(awayTeamId);
    const hTactic = options.homeTactic || manager?.getControlledTactic(homeTeamId);
    const aTactic = options.awayTactic || manager?.getControlledTactic(awayTeamId);

    const hClub = buildNationalTeamClub(homeTeamId, 'bg-sky-600');
    const aClub = buildNationalTeamClub(awayTeamId, 'bg-red-700');

    const res = simulateFastTacticalMatch(hClub, aClub, homePlayers, awayPlayers, {
      homeSettings: hTactic,
      awaySettings: aTactic,
      lightDetail: false,
    });

    return { homeScore: res.homeScore, awayScore: res.awayScore, stats: res.stats, events: res.events };
  }
}
