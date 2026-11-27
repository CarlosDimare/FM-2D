import { create } from 'zustand';
import { Fixture, ManagerHistory } from '../types';
import { world } from '../services/worldManager';
import { Scheduler } from '../services/scheduler';
import { LifecycleManager } from '../services/lifecycleManager';
import { LeagueEngine } from '../services/leagueEngine';
import { ChampionsLeagueManager } from '../services/championsLeague';
import { NationalTeamManager } from '../services/nationalTeamManager';
import { DOMESTIC_CUP_IDS, generateInitialDomesticCupFixtures } from '../services/domesticCupFormats';

interface GameStore {
  fixtures: Fixture[];
  nextFixture: Fixture | null;
  currentDate: Date;
  seasonEndDate: Date;
  managerHistory: ManagerHistory;
  managerReputation: number;
  darkMode: boolean;
  deepSimLeagues: string[];

  setFixtures: (fixtures: Fixture[]) => void;
  setNextFixture: (f: Fixture | null) => void;
  setCurrentDate: (d: Date) => void;
  setSeasonEndDate: (d: Date) => void;
  setManagerHistory: (h: ManagerHistory) => void;
  setManagerReputation: (r: number) => void;
  setDarkMode: (d: boolean) => void;
  setDeepSimLeagues: (leagues: string[]) => void;
  trackMatchResult: (userScore: number, opponentScore: number) => void;
  trackTitle: (title: string) => void;
  resetForNewCareer: () => void;

  initSeasonFixtures: (startFrom: Date, clubId?: string) => Fixture[];
  updateNextFixture: (fixtures: Fixture[], date: Date, clubId: string) => Fixture | null;
  finishSeason: (fixtures: Fixture[], userClubId?: string, dateOverride?: Date) => {
    summaries: any[];
    userWonLeague: boolean;
    newFixtures: Fixture[];
    nextSeasonStart: Date;
    nextSeasonEnd: Date;
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  fixtures: [],
  nextFixture: null,
  currentDate: new Date(2025, 6, 20),
  seasonEndDate: new Date(2026, 6, 10),
  managerHistory: {
    totalGames: 0, totalWins: 0, totalDraws: 0, totalLosses: 0,
    goalsFor: 0, goalsAgainst: 0, currentStreak: null, streakCount: 0,
    longestWinStreak: 0, titles: [], seasonsCompleted: 0
  },
  managerReputation: 50,
  darkMode: false,
  deepSimLeagues: [],

  setFixtures: (fixtures) => {
    const sorted = [...fixtures].sort((a, b) => {
      const ta = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
      const tb = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
      return ta - tb;
    });
    world.bumpFixturesVersion();
    set({ fixtures: sorted });
  },
  setNextFixture: (nextFixture) => set({ nextFixture }),
  setCurrentDate: (currentDate) => set({ currentDate }),
  setSeasonEndDate: (seasonEndDate) => set({ seasonEndDate }),
  setManagerHistory: (managerHistory) => set({ managerHistory }),
  setManagerReputation: (managerReputation) => set({ managerReputation }),
  setDarkMode: (darkMode) => set({ darkMode }),
  setDeepSimLeagues: (deepSimLeagues) => set({ deepSimLeagues }),
  resetForNewCareer: () =>
    set({
      fixtures: [],
      nextFixture: null,
      currentDate: new Date(2025, 6, 20),
      seasonEndDate: new Date(2026, 6, 10),
      managerHistory: {
        totalGames: 0,
        totalWins: 0,
        totalDraws: 0,
        totalLosses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        currentStreak: null,
        streakCount: 0,
        longestWinStreak: 0,
        titles: [],
        seasonsCompleted: 0,
      },
      managerReputation: 50,
    }),

  trackMatchResult: (userScore, opponentScore) => {
    const { managerHistory } = get();
    const newHistory = { ...managerHistory };
    newHistory.totalGames++;
    newHistory.goalsFor += userScore;
    newHistory.goalsAgainst += opponentScore;

    if (userScore > opponentScore) {
      newHistory.totalWins++;
      if (newHistory.currentStreak === 'W') {
        newHistory.streakCount++;
      } else {
        newHistory.currentStreak = 'W';
        newHistory.streakCount = 1;
      }
      if (newHistory.streakCount > newHistory.longestWinStreak) {
        newHistory.longestWinStreak = newHistory.streakCount;
      }
    } else if (userScore < opponentScore) {
      newHistory.totalLosses++;
      newHistory.currentStreak = 'L';
      newHistory.streakCount = 1;
    } else {
      newHistory.totalDraws++;
      if (newHistory.currentStreak !== 'D') {
        newHistory.currentStreak = 'D';
        newHistory.streakCount = 1;
      } else {
        newHistory.streakCount++;
      }
    }

    set({ managerHistory: newHistory });

    const repDelta = userScore > opponentScore ? 1 : userScore < opponentScore ? -1 : 0;
    const newRep = Math.max(1, Math.min(100, get().managerReputation + repDelta));
    set({ managerReputation: newRep });
  },

  trackTitle: (title) => {
    const { managerHistory } = get();
    const newHistory = { ...managerHistory };
    newHistory.titles = [title, ...newHistory.titles];
    const newRep = Math.min(100, get().managerReputation + 5);
    set({ managerHistory: newHistory, managerReputation: newRep });
  },

  initSeasonFixtures: (startFrom, clubId) => {
    const allFixtures: Fixture[] = [];
    const clubsByLeague: Record<string, any[]> = {};
    world.competitions.filter(c => c.type === 'LEAGUE').forEach(l => {
      const clubs = world.getClubsByLeague(l.id);
      clubsByLeague[l.id] = clubs;
    });

    const userLeagueId = clubId ? world.getClub(clubId)?.leagueId : undefined;
    const deepLeagueIds = LeagueEngine.resolveDeepLeagueIds(userLeagueId, world.competitions, get().deepSimLeagues);
    if (deepLeagueIds.length > 0 && deepLeagueIds.some(id => !get().deepSimLeagues.includes(id))) {
      set({ deepSimLeagues: deepLeagueIds });
    }

    // Reservar una ventana de pretemporada (~24 días desde startFrom) antes del inicio oficial de ligas y copas
    const leagueStart = new Date(startFrom);
    leagueStart.setDate(leagueStart.getDate() + 24);
    while (leagueStart.getDay() !== 6 && leagueStart.getDay() !== 0) {
      leagueStart.setDate(leagueStart.getDate() + 1);
    }

    world.competitions.filter(c => c.type === 'LEAGUE').forEach(l => {
      const clubs = clubsByLeague[l.id] || [];
      if (deepLeagueIds.includes(l.id)) world.ensureDeepSquads(l.id);
      const depth = deepLeagueIds.includes(l.id) ? 'DEEP' : 'LIGHT';
      const squadTypes = depth === 'DEEP' ? (['SENIOR', 'RESERVE', 'U20'] as const) : (['SENIOR'] as const);
      squadTypes.forEach(st => {
        allFixtures.push(...LeagueEngine.generateFixturesForLeague(world.clubs, l.id, leagueStart, st, clubsByLeague));
      });
    });

    // Domestic Cups (C_ARG, COPA_REY, COPA_ITALIA, FA_CUP, EFL_CUP, DFB_POKAL, COPA_FRANCE)
    DOMESTIC_CUP_IDS.forEach(cupId => {
      const comp = world.competitions.find(c => c.id === cupId);
      if (comp) {
        allFixtures.push(
          ...generateInitialDomesticCupFixtures(cupId, world.clubs, world.competitions, leagueStart, clubId)
        );
      }
    });

    const libertadores = world.competitions.find(c => c.id === 'COPA_LIB' || c.id === 'CONT_LIB');
    const sudamericana = world.competitions.find(c => c.id === 'COPA_SUD' || c.id === 'CONT_SUD');

    let libArg = world.clubs.filter(c => c.qualifiedFor === 'CONT_LIB' || c.qualifiedFor === 'COPA_LIB');
    let sudArg = world.clubs.filter(c => c.qualifiedFor === 'CONT_SUD' || c.qualifiedFor === 'COPA_SUD');

    if (libArg.length === 0 && sudArg.length === 0) {
      const allArgTeams = world.getClubsByLeague('L_ARG_1').sort((a, b) => b.reputation - a.reputation);
      libArg = allArgTeams.slice(0, 6);
      sudArg = allArgTeams.slice(6, 12);
    }

    const conmebolLeagueIds = new Set(
      world.competitions
        .filter(c => c.type === 'LEAGUE' && (c.confederation === 'CONMEBOL' || c.continent === 'América del Sur'))
        .map(c => c.id)
    );
    const conmebolClubs = world.clubs
      .filter(c => conmebolLeagueIds.has(c.leagueId))
      .sort((a, b) => b.reputation - a.reputation);
    const allArgTeams = world.getClubsByLeague('L_ARG_1').sort((a, b) => b.reputation - a.reputation);
    const targetSize = 32;

    let libPool = [...libArg];
    for (const c of conmebolClubs) {
      if (libPool.length >= targetSize) break;
      if (!libPool.some(x => x.id === c.id)) libPool.push(c);
    }
    if (libPool.length < targetSize) {
      for (const c of allArgTeams) {
        if (libPool.length >= targetSize) break;
        if (!libPool.some(x => x.id === c.id)) libPool.push(c);
      }
    }

    let sudPool = [...sudArg];
    const usedIds = new Set(libPool.map(c => c.id));
    for (const c of conmebolClubs) {
      if (sudPool.length >= targetSize) break;
      if (!usedIds.has(c.id) && !sudPool.some(x => x.id === c.id)) sudPool.push(c);
    }
    if (sudPool.length < targetSize) {
      for (const c of world.clubs.filter(c => !usedIds.has(c.id)).sort((a, b) => b.reputation - a.reputation)) {
        if (sudPool.length >= targetSize) break;
        if (!sudPool.some(x => x.id === c.id)) sudPool.push(c);
      }
    }

    if (libertadores && libPool.length >= 32) {
      const finalLibPool = libPool.slice(0, 32);
      const groupStageStart = new Date(startFrom.getTime() + 1000 * 60 * 60 * 24 * 150);
      allFixtures.push(...Scheduler.generateContinentalGroups(libertadores.id, finalLibPool, groupStageStart));
    }

    if (sudamericana && sudPool.length >= 32) {
      const finalSudPool = sudPool.slice(0, 32);
      const groupStageStart = new Date(startFrom.getTime() + 1000 * 60 * 60 * 24 * 157);
      allFixtures.push(...Scheduler.generateContinentalGroups(sudamericana.id, finalSudPool, groupStageStart));
    }

    const cwc = world.competitions.find(c => c.id === 'W_CLUB');
    if (cwc) {
      const decDate = new Date(startFrom.getFullYear(), 11, 10);
      const leagueById = new Map(world.competitions.map(comp => [comp.id, comp]));
      const lastSeason = world.seasonHistory[world.seasonHistory.length - 1];
      const recentChampIds = new Set<string>();
      if (lastSeason) {
        for (const comp of lastSeason.competitions) {
          if (['UCL', 'UEL', 'CONT_LIB', 'COPA_LIB', 'CONT_SUD', 'COPA_SUD'].includes(comp.compId) && comp.championId) {
            recentChampIds.add(comp.championId);
          }
        }
      }
      const pickTopFromConf = (conf: string, count: number, exclude: Set<string>) => {
        const confClubs = world.clubs.filter(c => {
          if (exclude.has(c.id)) return false;
          const lg = leagueById.get(c.leagueId);
          return lg?.confederation === conf;
        });
        // Prioritize reigning continental champions, then top by reputation with slight seasonal variance
        confClubs.sort((a, b) => {
          const aChamp = recentChampIds.has(a.id) ? 1 : 0;
          const bChamp = recentChampIds.has(b.id) ? 1 : 0;
          if (aChamp !== bChamp) return bChamp - aChamp;
          return b.reputation - a.reputation;
        });
        const chosen = confClubs.slice(0, count);
        chosen.forEach(c => exclude.add(c.id));
        return chosen;
      };

      const pickedIds = new Set<string>();
      const cwcPool = [
        ...pickTopFromConf('UEFA', 2, pickedIds),
        ...pickTopFromConf('CONMEBOL', 2, pickedIds),
        ...pickTopFromConf('AFC', 1, pickedIds),
        ...pickTopFromConf('CAF', 1, pickedIds),
        ...pickTopFromConf('CONCACAF', 1, pickedIds),
      ];
      const topGlobalFallback = [...world.clubs].sort((a, b) => b.reputation - a.reputation);
      for (const c of topGlobalFallback) {
        if (cwcPool.length >= 8) break;
        if (!pickedIds.has(c.id)) {
          pickedIds.add(c.id);
          cwcPool.push(c);
        }
      }
      if (cwcPool.length >= 8) {
        allFixtures.push(...Scheduler.generateCupRound(cwc.id, cwcPool.slice(0, 8), decDate, 'QUARTER_FINAL'));
      } else if (cwcPool.length >= 4) {
        allFixtures.push(...Scheduler.generateCupRound(cwc.id, cwcPool.slice(0, 4), decDate, 'SEMI_FINAL'));
      }
    }

    // ─── UEFA Champions League ─────────────────────────────────────────────
    const uclStart = new Date(leagueStart);
    uclStart.setMonth(uclStart.getMonth() + 1); // September
    while (uclStart.getDay() !== 2 && uclStart.getDay() !== 3) uclStart.setDate(uclStart.getDate() + 1);

    // Get top clubs from European leagues for UCL
    const europeanLeagueIds = ['L_ESP_1', 'L_ESP_2', 'L_ITA_1', 'L_DEU_1', 'L_ENG_1', 'L_FRA_1', 'L_NLD_1', 'L_BEL_1', 'L_PRT_1', 'L_TUR_1'];
    const uclPool: any[] = [];
    for (const lid of europeanLeagueIds) {
      const clubs = world.getClubsByLeague(lid).sort((a, b) => b.reputation - a.reputation);
      uclPool.push(...clubs.slice(0, 4));
    }
    if (uclPool.length >= 32) {
      const uclClubs = uclPool.slice(0, 32).map(c => ({
        clubId: c.id, clubName: c.name, country: c.country, seed: 0,
      }));
      allFixtures.push(...ChampionsLeagueManager.generateLeaguePhase(uclClubs, uclStart));
    }

    // ─── UEFA Europa League ────────────────────────────────────────────────
    const uelStart = new Date(leagueStart);
    uelStart.setMonth(uelStart.getMonth() + 1);
    while (uelStart.getDay() !== 3) uelStart.setDate(uelStart.getDate() + 1);
    const uclUsedIds = new Set(uclPool.slice(0, 32).map(c => c.id));
    const uelPool: any[] = [];
    for (const lid of europeanLeagueIds) {
      const clubs = world.getClubsByLeague(lid).filter(c => !uclUsedIds.has(c.id)).sort((a, b) => b.reputation - a.reputation);
      uelPool.push(...clubs.slice(0, 4));
    }
    if (uelPool.length >= 32) {
      const uelClubs = uelPool.slice(0, 32).filter(Boolean);
      allFixtures.push(...Scheduler.generateContinentalGroups('UEL', uelClubs, uelStart));
    }

    // Domestic European cups are initialized above via generateInitialDomesticCupFixtures.

    // ─── National Team Fixtures ────────────────────────────────────────────
    const wcqDate = new Date(startFrom);
    wcqDate.setMonth(wcqDate.getMonth() + 2); // October for WC qualifiers
    if (world.nationalTeamManager) {
      allFixtures.push(...world.nationalTeamManager.generateWorldCupQualifiers(startFrom.getFullYear(), 'CONMEBOL'));
      allFixtures.push(...world.nationalTeamManager.generateWorldCupQualifiers(startFrom.getFullYear(), 'UEFA'));

      // World Cup final tournament (after qualifiers, in June of next year)
      const wcYear = startFrom.getFullYear() + 2;
      const qualifiedTeams = [
        'ARG', 'BRA', 'FRA', 'ESP', 'ENG', 'DEU', 'ITA', 'NLD',
        'COL', 'URU', 'BEL', 'PRT', 'HRV', 'CHE', 'DNK', 'MAR',
      ];
      allFixtures.push(...world.nationalTeamManager.generateWorldCupFinalTournament(qualifiedTeams, wcYear));
    }

    // ── Preseason friendlies for user's club ────────────────────────
    if (clubId) {
      const userClub = world.getClub(clubId);
      if (userClub) {
        const friendlyFixtures = world.generatePreseasonFriendlies(clubId, startFrom, leagueStart);
        allFixtures.push(...friendlyFixtures);
        if (friendlyFixtures.length > 0) {
          const total = allFixtures.length;
          console.log(`  ⚽ ${friendlyFixtures.length} amistosos de pretemporada para ${userClub.name}`);
        }
      }
    }

    // ── Performance: fixture breakdown ──────────────────────────────
    const deepIds = new Set(deepLeagueIds);
    const leagueFixCounts: string[] = [];
    let totalDeepFix = 0, totalLightFix = 0, totalDeepLeagues = 0, totalLightLeagues = 0;
    world.competitions.filter(c => c.type === 'LEAGUE').forEach(l => {
      const count = allFixtures.filter(f => f.competitionId === l.id && f.squadType === 'SENIOR').length;
      if (deepIds.has(l.id)) { totalDeepFix += count; totalDeepLeagues++; }
      else { totalLightFix += count; totalLightLeagues++; }
      leagueFixCounts.push(`${l.id}: ${count} (${deepIds.has(l.id) ? 'DEEP' : 'LIGHT'})`);
    });
    console.groupCollapsed(`📋 Fixtures generados: ${allFixtures.length.toLocaleString()} total · ${totalDeepFix} DEEP (${totalDeepLeagues} ligas) · ${totalLightFix} LIGHT (${totalLightLeagues} ligas)`);
    console.table(leagueFixCounts.map(s => ({ fixtureCount: s })));
    console.groupEnd();

    get().setFixtures(allFixtures);
    if (clubId) {
      const next = get().updateNextFixture(allFixtures, startFrom, clubId);
      set({ nextFixture: next });
    }
    return allFixtures;
  },

  updateNextFixture: (allFixtures, date, clubId) => {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    let next: Fixture | undefined;
    for (const f of allFixtures) {
      if (f.played || f.squadType !== 'SENIOR') continue;
      if (f.homeTeamId !== clubId && f.awayTeamId !== clubId) continue;
      const ft = f.date instanceof Date ? f.date.getTime() : new Date(f.date).getTime();
      if (ft < dayStart) continue;
      if (!next || ft < (next.date instanceof Date ? next.date.getTime() : new Date(next.date).getTime())) {
        next = f;
      }
    }
    set({ nextFixture: next || null });
    return next || null;
  },

  finishSeason: (fixtures, userClubId, dateOverride) => {
    const { currentDate } = get();
    const refDate = dateOverride ? new Date(dateOverride) : new Date(currentDate);
    const managedTeamId = userClubId || world.nationalTeamManager?.controlledTeamId;
    const summaries = LifecycleManager.processEndOfSeason(fixtures, managedTeamId, refDate);
    const userWonLeague = managedTeamId ? summaries.some((s: any) => s.championId === managedTeamId) : false;

    const nextSeasonStart = new Date(refDate.getFullYear(), 6, 20);
    if (nextSeasonStart.getTime() <= refDate.getTime()) {
      nextSeasonStart.setTime(refDate.getTime());
      nextSeasonStart.setDate(nextSeasonStart.getDate() + 1);
    }
    const endYear = nextSeasonStart.getMonth() >= 6
      ? nextSeasonStart.getFullYear() + 1
      : nextSeasonStart.getFullYear();
    const nextSeasonEnd = new Date(endYear, 6, 10);

    set({
      seasonEndDate: nextSeasonEnd,
      currentDate: nextSeasonStart,
    });

    const newFixtures = get().initSeasonFixtures(nextSeasonStart, managedTeamId);

    return { summaries, userWonLeague, newFixtures, nextSeasonStart, nextSeasonEnd };
  },
}));
