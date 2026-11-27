import { Club, Competition, Fixture, MatchStage } from '../types';
import { generateUUID } from './utils';

export interface DomesticCupConfig {
  id: string;
  name: string;
  country: string;
  totalTeamsLabel: string;
  formatLabel: string;
  rulesSummary: string;
  initialStage: MatchStage;
  startWeeksAfterLeague: number;
  twoLeggedSemis: boolean;
  lowerTierHome: boolean;
  allNeutral: boolean;
  neutralSemis: boolean;
  neutralFinal: boolean;
  prizePool: number;
  entrySeedStage?: MatchStage;
  entrySeedNote?: string;
}

export const DOMESTIC_CUP_CONFIGS: Record<string, DomesticCupConfig> = {
  C_ARG: {
    id: 'C_ARG',
    name: 'Copa Argentina',
    country: 'Argentina',
    totalTeamsLabel: '64 clubes (1ª, 2ª y 3ª div.)',
    formatLabel: 'Eliminación directa · Partido único · Sede neutral',
    rulesSummary: 'Cruces a partido único en cancha neutral desde 32avos de final hasta la Final. Empate se define por penales.',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 5,
    twoLeggedSemis: false,
    lowerTierHome: false,
    allNeutral: true,
    neutralSemis: true,
    neutralFinal: true,
    prizePool: 2000000,
  },
  COPA_REY: {
    id: 'COPA_REY',
    name: 'Copa del Rey',
    country: 'España',
    totalTeamsLabel: '64 clubes (LaLiga, 2ª y 1ª RFEF)',
    formatLabel: 'Partido único (localía menor div.) · Semis ida y vuelta',
    rulesSummary: 'Hasta cuartos se juega a partido único en el estadio del club de menor categoría. Semifinales a doble partido y Final en sede neutral.',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 8,
    twoLeggedSemis: true,
    lowerTierHome: true,
    allNeutral: false,
    neutralSemis: false,
    neutralFinal: true,
    prizePool: 3000000,
  },
  COPA_ITALIA: {
    id: 'COPA_ITALIA',
    name: 'Coppa Italia',
    country: 'Italia',
    totalTeamsLabel: '40 clubes (Serie A, B y C)',
    formatLabel: 'Top 8 Serie A esperan en Octavos · Semis ida y vuelta',
    rulesSummary: '32 clubes inician desde 32avos y 16avos; los 8 mejores de la Serie A ingresan directamente en Octavos de Final. Semis ida y vuelta y Final en Roma.',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 7,
    twoLeggedSemis: true,
    lowerTierHome: false,
    allNeutral: false,
    neutralSemis: false,
    neutralFinal: true,
    prizePool: 2500000,
    entrySeedStage: 'ROUND_OF_16',
    entrySeedNote: 'Los 8 mejores clubes de la Serie A esperan en Octavos de Final.',
  },
  FA_CUP: {
    id: 'FA_CUP',
    name: 'FA Cup',
    country: 'Inglaterra',
    totalTeamsLabel: '64 clubes (Premier a League Two)',
    formatLabel: 'Eliminación directa · Semis y Final en Wembley',
    rulesSummary: 'Partido único en todas las rondas con penales en caso de empate. Semifinales y Final se disputan en cancha neutral (Wembley).',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 16,
    twoLeggedSemis: false,
    lowerTierHome: false,
    allNeutral: false,
    neutralSemis: true,
    neutralFinal: true,
    prizePool: 3500000,
  },
  EFL_CUP: {
    id: 'EFL_CUP',
    name: 'Carabao Cup (EFL Cup)',
    country: 'Inglaterra',
    totalTeamsLabel: '64 clubes (Premier a League Two)',
    formatLabel: 'Partido único · Semis ida y vuelta · Final en Wembley',
    rulesSummary: 'Copa de la Liga inglesa. Cruces directos desde 32avos hasta Cuartos, Semifinales a ida y vuelta y Final en Wembley.',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 5,
    twoLeggedSemis: true,
    lowerTierHome: false,
    allNeutral: false,
    neutralSemis: false,
    neutralFinal: true,
    prizePool: 2200000,
  },
  DFB_POKAL: {
    id: 'DFB_POKAL',
    name: 'DFB-Pokal',
    country: 'Alemania',
    totalTeamsLabel: '36 clubes (Bundesliga y 2. Bundesliga)',
    formatLabel: 'Ronda previa (8 clubes) + 28 clasificados · Final en Berlín',
    rulesSummary: 'Los 8 clubes de menor ranking de 2. Bundesliga juegan ronda previa por 4 boletos a 16avos, donde esperan los 28 restantes. El club de menor categoría siempre es local.',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 6,
    twoLeggedSemis: false,
    lowerTierHome: true,
    allNeutral: false,
    neutralSemis: false,
    neutralFinal: true,
    prizePool: 2500000,
    entrySeedStage: 'ROUND_OF_32',
    entrySeedNote: '18 clubes de Bundesliga y 10 de 2. Bundesliga esperan directamente en 16avos de Final.',
  },
  COPA_FRANCE: {
    id: 'COPA_FRANCE',
    name: 'Coupe de France',
    country: 'Francia',
    totalTeamsLabel: '53 clubes (Ligue 1, Ligue 2 y National)',
    formatLabel: 'Ronda previa (42 clubes) + Top 11 Ligue 1 en 16avos',
    rulesSummary: '42 clubes de Ligue 2, National y parte baja de Ligue 1 disputan la ronda previa; los 11 mejores de Ligue 1 ingresan en 16avos. Menor categoría juega de local.',
    initialStage: 'ROUND_OF_64',
    startWeeksAfterLeague: 7,
    twoLeggedSemis: false,
    lowerTierHome: true,
    allNeutral: false,
    neutralSemis: false,
    neutralFinal: true,
    prizePool: 2000000,
    entrySeedStage: 'ROUND_OF_32',
    entrySeedNote: 'Los 11 mejores clubes de Ligue 1 esperan directamente en 16avos de Final.',
  },
};

export const DOMESTIC_CUP_IDS = Object.keys(DOMESTIC_CUP_CONFIGS);

function toWednesday(baseDate: Date, weeksAfter: number): Date {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + weeksAfter * 7);
  while (d.getDay() !== 3) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildTierMap(competitions: Competition[]): Map<string, number> {
  const map = new Map<string, number>();
  competitions.forEach((c) => {
    if (c.type === 'LEAGUE') map.set(c.id, c.tier || 1);
  });
  return map;
}

function getLeagueClubsSorted(allClubs: Club[], leagueIds: string[]): Club[] {
  const set = new Set(leagueIds);
  return allClubs
    .filter((c) => set.has(c.leagueId))
    .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
}

function pickFromDivisionWithUser(
  pool: Club[],
  count: number,
  userClubId: string | undefined,
  alreadyPicked: Set<string>
): Club[] {
  const available = pool.filter((c) => !alreadyPicked.has(c.id));
  const result: Club[] = [];

  if (userClubId) {
    const user = available.find((c) => c.id === userClubId);
    if (user && result.length < count) {
      result.push(user);
      alreadyPicked.add(user.id);
    }
  }

  const remaining = shuffle(available.filter((c) => !alreadyPicked.has(c.id)));
  for (const club of remaining) {
    if (result.length >= count) break;
    result.push(club);
    alreadyPicked.add(club.id);
  }

  return result;
}

export function resolveCupMatchTeams(
  clubA: Club,
  clubB: Club,
  tierByLeague: Map<string, number>,
  opts: { lowerTierHome?: boolean; allNeutral?: boolean; isNeutralStage?: boolean }
): { home: Club; away: Club; isNeutral: boolean } {
  if (opts.allNeutral || opts.isNeutralStage) {
    return { home: clubA, away: clubB, isNeutral: true };
  }

  if (opts.lowerTierHome) {
    const tierA = tierByLeague.get(clubA.leagueId) ?? 1;
    const tierB = tierByLeague.get(clubB.leagueId) ?? 1;
    if (tierA > tierB) {
      return { home: clubA, away: clubB, isNeutral: false };
    }
    if (tierB > tierA) {
      return { home: clubB, away: clubA, isNeutral: false };
    }
  }

  return Math.random() < 0.5
    ? { home: clubA, away: clubB, isNeutral: false }
    : { home: clubB, away: clubA, isNeutral: false };
}

export function createKnockoutFixturesForPairings(
  competitionId: string,
  pairs: Array<[Club, Club]>,
  roundDate: Date,
  stage: MatchStage,
  tierByLeague: Map<string, number>,
  opts?: {
    lowerTierHome?: boolean;
    allNeutral?: boolean;
    isNeutralStage?: boolean;
    twoLegged?: boolean;
  }
): Fixture[] {
  const fixtures: Fixture[] = [];
  const safeLeg1Date = new Date(roundDate);
  while (safeLeg1Date.getDay() !== 3) {
    safeLeg1Date.setDate(safeLeg1Date.getDate() + 1);
  }

  const safeLeg2Date = new Date(safeLeg1Date);
  safeLeg2Date.setDate(safeLeg2Date.getDate() + 7);

  for (const [clubA, clubB] of pairs) {
    if (!clubA || !clubB) continue;
    const { home, away, isNeutral } = resolveCupMatchTeams(clubA, clubB, tierByLeague, {
      lowerTierHome: opts?.lowerTierHome,
      allNeutral: opts?.allNeutral,
      isNeutralStage: opts?.isNeutralStage,
    });

    if (opts?.twoLegged) {
      const tieId = generateUUID();
      fixtures.push({
        id: generateUUID(),
        competitionId,
        homeTeamId: home.id,
        awayTeamId: away.id,
        date: new Date(safeLeg1Date),
        played: false,
        squadType: 'SENIOR',
        stage,
        isNeutral: false,
        leg: 1,
        tieId,
      });
      fixtures.push({
        id: generateUUID(),
        competitionId,
        homeTeamId: away.id,
        awayTeamId: home.id,
        date: new Date(safeLeg2Date),
        played: false,
        squadType: 'SENIOR',
        stage,
        isNeutral: false,
        leg: 2,
        tieId,
      });
    } else {
      fixtures.push({
        id: generateUUID(),
        competitionId,
        homeTeamId: home.id,
        awayTeamId: away.id,
        date: new Date(safeLeg1Date),
        played: false,
        squadType: 'SENIOR',
        stage,
        isNeutral,
      });
    }
  }

  return fixtures;
}

function pairClubsEvenly(clubs: Club[]): Array<[Club, Club]> {
  const ordered = shuffle(clubs);
  const pairs: Array<[Club, Club]> = [];
  for (let i = 0; i + 1 < ordered.length; i += 2) {
    pairs.push([ordered[i], ordered[i + 1]]);
  }
  return pairs;
}

function selectCopaArgentinaClubs(allClubs: Club[], userClubId?: string): Club[] {
  const picked = new Set<string>();
  const div1 = getLeagueClubsSorted(allClubs, ['L_ARG_1']);
  const div2 = getLeagueClubsSorted(allClubs, ['L_ARG_2']);
  const div3 = getLeagueClubsSorted(allClubs, ['L_ARG_3']);

  const selected = [
    ...pickFromDivisionWithUser(div1, 30, userClubId, picked),
    ...pickFromDivisionWithUser(div2, 22, userClubId, picked),
    ...pickFromDivisionWithUser(div3, 12, userClubId, picked),
  ];

  if (selected.length < 64) {
    const rest = shuffle([...div1, ...div2, ...div3].filter((c) => !picked.has(c.id)));
    for (const c of rest) {
      if (selected.length >= 64) break;
      selected.push(c);
      picked.add(c.id);
    }
  }
  return selected.slice(0, 64);
}

function selectCopaReyClubs(allClubs: Club[], userClubId?: string): Club[] {
  const picked = new Set<string>();
  const div1 = getLeagueClubsSorted(allClubs, ['L_ESP_1']);
  const div2 = getLeagueClubsSorted(allClubs, ['L_ESP_2']);
  const div3a = getLeagueClubsSorted(allClubs, ['L_ESP_3A']);
  const div3b = getLeagueClubsSorted(allClubs, ['L_ESP_3B']);

  const selected = [
    ...pickFromDivisionWithUser(div1, 20, userClubId, picked),
    ...pickFromDivisionWithUser(div2, 22, userClubId, picked),
    ...pickFromDivisionWithUser(div3a, 11, userClubId, picked),
    ...pickFromDivisionWithUser(div3b, 11, userClubId, picked),
  ];

  if (selected.length < 64) {
    const rest = shuffle([...div1, ...div2, ...div3a, ...div3b].filter((c) => !picked.has(c.id)));
    for (const c of rest) {
      if (selected.length >= 64) break;
      selected.push(c);
      picked.add(c.id);
    }
  }
  return selected.slice(0, 64);
}

function selectEnglishCupClubs(
  allClubs: Club[],
  quotas: [number, number, number, number],
  userClubId?: string
): Club[] {
  const picked = new Set<string>();
  const d1 = getLeagueClubsSorted(allClubs, ['L_ENG_1']);
  const d2 = getLeagueClubsSorted(allClubs, ['L_ENG_2']);
  const d3 = getLeagueClubsSorted(allClubs, ['L_ENG_3']);
  const d4 = getLeagueClubsSorted(allClubs, ['L_ENG_4']);

  const selected = [
    ...pickFromDivisionWithUser(d1, quotas[0], userClubId, picked),
    ...pickFromDivisionWithUser(d2, quotas[1], userClubId, picked),
    ...pickFromDivisionWithUser(d3, quotas[2], userClubId, picked),
    ...pickFromDivisionWithUser(d4, quotas[3], userClubId, picked),
  ];

  if (selected.length < 64) {
    const rest = shuffle([...d1, ...d2, ...d3, ...d4].filter((c) => !picked.has(c.id)));
    for (const c of rest) {
      if (selected.length >= 64) break;
      selected.push(c);
      picked.add(c.id);
    }
  }
  return selected.slice(0, 64);
}

function selectCoppaItaliaInitialClubs(allClubs: Club[], userClubId?: string): Club[] {
  const serieA = getLeagueClubsSorted(allClubs, ['L_ITA_1']);
  const top8Ids = new Set(serieA.slice(0, 8).map((c) => c.id));
  const picked = new Set<string>();

  const remainingA = serieA.filter((c) => !top8Ids.has(c.id));
  const serieB = getLeagueClubsSorted(allClubs, ['L_ITA_2']);
  const serieC = getLeagueClubsSorted(allClubs, ['L_ITA_3A', 'L_ITA_3B', 'L_ITA_3C']);

  const selected = [
    ...pickFromDivisionWithUser(remainingA, 12, userClubId, picked),
    ...pickFromDivisionWithUser(serieB, 14, userClubId, picked),
    ...pickFromDivisionWithUser(serieC, 6, userClubId, picked),
  ];

  if (selected.length < 32) {
    const rest = shuffle([...remainingA, ...serieB, ...serieC].filter((c) => !picked.has(c.id)));
    for (const c of rest) {
      if (selected.length >= 32) break;
      selected.push(c);
      picked.add(c.id);
    }
  }
  return selected.slice(0, 32);
}

function selectDfbPokalInitialClubs(allClubs: Club[]): Club[] {
  // Bottom 8 of 2. Bundesliga play ROUND_OF_64 play-in (4 matches); 4 winners join remaining 28 at ROUND_OF_32
  const div2 = getLeagueClubsSorted(allClubs, ['L_DEU_2']);
  if (div2.length <= 8) return div2;
  return div2.slice(-8);
}

function selectCoupeFranceInitialClubs(allClubs: Club[]): Club[] {
  // Top 11 Ligue 1 wait in ROUND_OF_32; remaining 42 (7 Ligue 1 + 18 Ligue 2 + 17 National) play 21 matches in ROUND_OF_64
  const l1 = getLeagueClubsSorted(allClubs, ['L_FRA_1']);
  const l1PlayIn = l1.slice(11);
  const l2 = getLeagueClubsSorted(allClubs, ['L_FRA_2']);
  const l3 = getLeagueClubsSorted(allClubs, ['L_FRA_3']);
  return [...l1PlayIn, ...l2, ...l3];
}

export function generateInitialDomesticCupFixtures(
  cupId: string,
  allClubs: Club[],
  competitions: Competition[],
  leagueStart: Date,
  userClubId?: string
): Fixture[] {
  const cfg = DOMESTIC_CUP_CONFIGS[cupId];
  if (!cfg) return [];

  const tierByLeague = buildTierMap(competitions);
  const startDate = toWednesday(leagueStart, cfg.startWeeksAfterLeague);

  let initialClubs: Club[] = [];
  if (cupId === 'C_ARG') initialClubs = selectCopaArgentinaClubs(allClubs, userClubId);
  else if (cupId === 'COPA_REY') initialClubs = selectCopaReyClubs(allClubs, userClubId);
  else if (cupId === 'COPA_ITALIA') initialClubs = selectCoppaItaliaInitialClubs(allClubs, userClubId);
  else if (cupId === 'FA_CUP') initialClubs = selectEnglishCupClubs(allClubs, [20, 20, 12, 12], userClubId);
  else if (cupId === 'EFL_CUP') initialClubs = selectEnglishCupClubs(allClubs, [20, 24, 12, 8], userClubId);
  else if (cupId === 'DFB_POKAL') initialClubs = selectDfbPokalInitialClubs(allClubs);
  else if (cupId === 'COPA_FRANCE') initialClubs = selectCoupeFranceInitialClubs(allClubs);

  if (initialClubs.length < 2) return [];

  const pairs = pairClubsEvenly(initialClubs);
  return createKnockoutFixturesForPairings(cupId, pairs, startDate, cfg.initialStage, tierByLeague, {
    lowerTierHome: cfg.lowerTierHome,
    allNeutral: cfg.allNeutral,
    isNeutralStage: cfg.allNeutral,
    twoLegged: false,
  });
}

export function getCupSeededEntrants(
  cupId: string,
  nextStage: MatchStage,
  existingCupFixtures: Fixture[],
  allClubs: Club[]
): Club[] {
  const cfg = DOMESTIC_CUP_CONFIGS[cupId];
  if (!cfg || cfg.entrySeedStage !== nextStage) return [];

  const alreadyPlayedIds = new Set<string>();
  existingCupFixtures.forEach((f) => {
    alreadyPlayedIds.add(f.homeTeamId);
    alreadyPlayedIds.add(f.awayTeamId);
  });

  if (cupId === 'COPA_ITALIA' && nextStage === 'ROUND_OF_16') {
    return getLeagueClubsSorted(allClubs, ['L_ITA_1'])
      .filter((c) => !alreadyPlayedIds.has(c.id))
      .slice(0, 8);
  }

  if (cupId === 'DFB_POKAL' && nextStage === 'ROUND_OF_32') {
    const allDeu = [
      ...getLeagueClubsSorted(allClubs, ['L_DEU_1']),
      ...getLeagueClubsSorted(allClubs, ['L_DEU_2']),
    ];
    return allDeu.filter((c) => !alreadyPlayedIds.has(c.id)).slice(0, 28);
  }

  if (cupId === 'COPA_FRANCE' && nextStage === 'ROUND_OF_32') {
    return getLeagueClubsSorted(allClubs, ['L_FRA_1'])
      .filter((c) => !alreadyPlayedIds.has(c.id))
      .slice(0, 11);
  }

  return [];
}

export function getCupNextStageRules(cupId: string, nextStage: MatchStage): {
  lowerTierHome: boolean;
  allNeutral: boolean;
  isNeutralStage: boolean;
  twoLegged: boolean;
} {
  const cfg = DOMESTIC_CUP_CONFIGS[cupId];
  if (!cfg) {
    return {
      lowerTierHome: false,
      allNeutral: false,
      isNeutralStage: nextStage === 'FINAL' || cupId === 'W_CLUB',
      twoLegged: false,
    };
  }

  const isNeutralStage =
    cfg.allNeutral ||
    (cfg.neutralSemis && nextStage === 'SEMI_FINAL') ||
    (cfg.neutralFinal && nextStage === 'FINAL');

  return {
    lowerTierHome: cfg.lowerTierHome && !isNeutralStage && !(cfg.twoLeggedSemis && nextStage === 'SEMI_FINAL'),
    allNeutral: cfg.allNeutral,
    isNeutralStage,
    twoLegged: cfg.twoLeggedSemis && nextStage === 'SEMI_FINAL',
  };
}
