import {
  Club,
  Player,
  PlayerHistoryEntry,
  Position,
  Staff,
  StaffHistoryEntry,
  StaffPreviousClub,
  StaffRole,
} from '../types';

export interface ClubPoolIndex {
  byCountry: Map<string, Club[]>;
  allByRep: Club[];
  byId: Map<string, Club>;
}

export function buildClubPoolIndex(clubs: Club[]): ClubPoolIndex {
  const byCountry = new Map<string, Club[]>();
  const byId = new Map<string, Club>();
  const allByRep = [...clubs].sort((a, b) => (b.reputation || 0) - (a.reputation || 0));

  for (const club of allByRep) {
    byId.set(club.id, club);
    if (!club.country) continue;
    const list = byCountry.get(club.country);
    if (list) list.push(club);
    else byCountry.set(club.country, [club]);
  }

  return { byCountry, allByRep, byId };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seedStr: string) {
  let s = hashSeed(seedStr) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => {
    if (max <= min) return min;
    return min + Math.floor(next() * (max - min + 1));
  };
  return { next, int };
}

function pickClubNearRep(
  pool: Club[],
  targetRep: number,
  excludeIds: Set<string>,
  rng: { int: (a: number, b: number) => number }
): Club | undefined {
  if (pool.length === 0) return undefined;
  const minRep = Math.max(500, targetRep - 2600);
  const maxRep = Math.min(10000, targetRep + 1500);
  const candidates: Club[] = [];
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    if (excludeIds.has(c.id)) continue;
    const r = c.reputation || 4000;
    if (r >= minRep && r <= maxRep) {
      candidates.push(c);
      if (candidates.length >= 18) break;
    }
  }
  if (candidates.length > 0) {
    return candidates[rng.int(0, candidates.length - 1)];
  }
  for (let tries = 0; tries < 8; tries++) {
    const c = pool[rng.int(0, pool.length - 1)];
    if (c && !excludeIds.has(c.id)) return c;
  }
  return undefined;
}

function pickPlayerCareerClubs(
  player: Player,
  currentClub: Club | undefined,
  clubIndex: ClubPoolIndex,
  clubCount: number,
  rng: { next: () => number; int: (a: number, b: number) => number }
): Club[] {
  const result: Club[] = [];
  const usedIds = new Set<string>();
  if (currentClub) usedIds.add(currentClub.id);

  const curRep = currentClub?.reputation || Math.max(2500, Math.min(9200, (player.currentAbility || 100) * 52));
  const natPool = clubIndex.byCountry.get(player.nationality) || [];
  const clubCountryPool = currentClub ? clubIndex.byCountry.get(currentClub.country) || [] : [];

  const neededPrev = Math.max(0, clubCount - (currentClub ? 1 : 0));
  for (let idx = 0; idx < neededPrev; idx++) {
    // Earlier clubs generally had slightly lower reputation (progression arc)
    const stepRatio = 0.62 + (idx / Math.max(1, neededPrev)) * 0.34;
    const targetRep = Math.round(curRep * stepRatio);

    let chosen: Club | undefined;
    if (idx === 0 && natPool.length > 1) {
      chosen = pickClubNearRep(natPool, Math.round(curRep * 0.68), usedIds, rng);
    }
    if (!chosen && clubCountryPool.length > 1 && rng.next() < 0.72) {
      chosen = pickClubNearRep(clubCountryPool, targetRep, usedIds, rng);
    }
    if (!chosen && natPool.length > 1) {
      chosen = pickClubNearRep(natPool, targetRep, usedIds, rng);
    }
    if (!chosen && clubIndex.allByRep.length > 0) {
      chosen = pickClubNearRep(clubIndex.allByRep, targetRep, usedIds, rng);
    }
    if (chosen) {
      usedIds.add(chosen.id);
      result.push(chosen);
    }
  }

  if (currentClub) result.push(currentClub);
  return result;
}

/**
 * Generates deterministic, realistic past senior seasons up to `currentSeasonYear - 1`
 * and populates `player.history` and `player.careerStats`.
 * Safe to call repeatedly (idempotent when history already exists).
 */
export function populatePlayerPastHistory(
  player: Player,
  currentClub: Club | undefined,
  clubIndex: ClubPoolIndex,
  currentSeasonYear = 2008
): void {
  if (!Array.isArray(player.history)) player.history = [];

  if (player.history.length > 0) {
    // Ensure careerStats is consistent if missing or empty
    if (!player.careerStats || (player.careerStats.totalApps === 0 && player.history.some(h => h.stats.appearances > 0))) {
      recomputeCareerStatsFromHistory(player);
    }
    return;
  }

  const clubId = currentClub?.id || player.clubId || 'FREE_AGENT';
  if (player.age <= 16) {
    player.careerStats = {
      totalApps: 0,
      totalGoals: 0,
      totalAssists: 0,
      totalCleanSheets: 0,
      clubsPlayedFor: clubId !== 'FREE_AGENT' ? [clubId] : [],
    };
    return;
  }

  const rng = createRng(`pl_${player.id}_${player.name}`);
  const ca = player.currentAbility || 100;
  const pa = player.potentialAbility || ca;

  // 17yo players only get a breakthrough debut season if already senior-caliber
  if (player.age === 17 && ca < 108 && player.squad !== 'SENIOR') {
    player.careerStats = {
      totalApps: 0,
      totalGoals: 0,
      totalAssists: 0,
      totalCleanSheets: 0,
      clubsPlayedFor: clubId !== 'FREE_AGENT' ? [clubId] : [],
    };
    return;
  }

  const debutAge =
    player.age === 17
      ? 16
      : ca >= 145 || pa >= 165
      ? rng.int(17, 18)
      : ca >= 115
      ? rng.int(18, 19)
      : rng.int(18, 20);

  const totalSeniorYears = Math.min(18, Math.max(1, player.age - debutAge));
  const startYear = currentSeasonYear - totalSeniorYears;

  const isOneClubType =
    player.personality === 'LOYAL' ||
    player.personality === 'MODEL_PRO' ||
    (player.loyalty ?? 10) >= 15;
  const isJourneyman =
    player.personality === 'MERCENARY' ||
    player.personality === 'AMBITIOUS' ||
    player.personality === 'VOLATILE';

  let desiredClubs = 1;
  if (totalSeniorYears >= 10) {
    desiredClubs = isOneClubType ? rng.int(1, 2) : isJourneyman ? rng.int(3, 5) : rng.int(2, 4);
  } else if (totalSeniorYears >= 5) {
    desiredClubs = isOneClubType ? rng.int(1, 2) : isJourneyman ? rng.int(2, 4) : rng.int(2, 3);
  } else if (totalSeniorYears >= 3) {
    desiredClubs = isOneClubType ? 1 : rng.int(1, 2);
  }
  desiredClubs = Math.min(totalSeniorYears, Math.max(1, desiredClubs));

  const clubs = pickPlayerCareerClubs(player, currentClub, clubIndex, desiredClubs, rng);
  if (clubs.length === 0 && clubId !== 'FREE_AGENT') {
    clubs.push({ id: clubId, name: clubId } as Club);
  }

  // Partition totalSeniorYears across `clubs` chronologically
  const spellLengths = new Array(clubs.length).fill(1);
  let remainingYears = totalSeniorYears - clubs.length;
  while (remainingYears > 0) {
    // Favor longest stint at current club (last) or prime club
    const targetIdx =
      isOneClubType && clubs.length > 1 && rng.next() < 0.72
        ? clubs.length - 1
        : rng.int(0, clubs.length - 1);
    spellLengths[targetIdx]++;
    remainingYears--;
  }

  const pos = player.primaryPosition || player.positions?.[0] || Position.MC;
  const isGk = pos === Position.GK;
  const isDef = pos === Position.DC || pos === Position.SW || pos === Position.DR || pos === Position.DL;
  const isFullback = pos === Position.DR || pos === Position.DL || pos === Position.DMR || pos === Position.DML;
  const isDm = pos === Position.DM;
  const isMid = pos === Position.MC || pos === Position.MR || pos === Position.ML;
  const isAm = pos === Position.AM || pos === Position.AMR || pos === Position.AML;
  const isSt = pos === Position.ST || pos === Position.STR || pos === Position.STL;

  const qualityNorm = Math.max(0.2, Math.min(1.25, (ca - 55) / 115));
  const history: PlayerHistoryEntry[] = [];

  let yearCursor = startYear;
  for (let cIdx = 0; cIdx < clubs.length; cIdx++) {
    const spellClub = clubs[cIdx];
    const spellYears = spellLengths[cIdx];
    const spellClubRep = spellClub.reputation || 4500;

    for (let s = 0; s < spellYears; s++) {
      const seasonYear = yearCursor++;
      const yearsIntoCareer = seasonYear - startYear;
      const ageAtSeason = player.age - (currentSeasonYear - seasonYear);

      // Career curve: lower apps in debut seasons and post-34, peak between 22 and 31
      let appMin = 18;
      let appMax = 36;
      if (yearsIntoCareer === 0) {
        appMin = ca >= 130 ? 12 : 4;
        appMax = ca >= 130 ? 28 : 19;
      } else if (yearsIntoCareer === 1) {
        appMin = 10;
        appMax = 31;
      } else if (ageAtSeason >= 34) {
        appMin = 11;
        appMax = 28;
      } else if (ca < 85) {
        appMin = 8;
        appMax = 26;
      }
      const appearances = rng.int(appMin, appMax);
      const scale = appearances / 34;

      let goals = 0;
      let assists = 0;
      let cleanSheets = 0;
      let conceded = 0;

      if (isGk) {
        goals = 0;
        assists = rng.next() < 0.08 ? 1 : 0;
        const csRate = 0.22 + qualityNorm * 0.18 + (spellClubRep > 7000 ? 0.06 : 0);
        cleanSheets = Math.min(appearances, Math.max(0, Math.round(appearances * csRate + rng.int(-2, 2))));
        conceded = Math.max(Math.round(appearances * 0.55), Math.round(appearances * (1.45 - qualityNorm * 0.45) + rng.int(-4, 5)));
      } else if (isSt) {
        const gBase = (5 + qualityNorm * 16) * scale;
        goals = Math.max(0, Math.round(gBase + rng.int(-3, 5)));
        assists = Math.max(0, Math.round((1.5 + qualityNorm * 5) * scale + rng.int(-1, 2)));
      } else if (isAm) {
        goals = Math.max(0, Math.round((3 + qualityNorm * 10) * scale + rng.int(-2, 4)));
        assists = Math.max(0, Math.round((3 + qualityNorm * 9) * scale + rng.int(-2, 3)));
      } else if (isMid) {
        goals = Math.max(0, Math.round((1.5 + qualityNorm * 5.5) * scale + rng.int(-1, 3)));
        assists = Math.max(0, Math.round((2 + qualityNorm * 7) * scale + rng.int(-1, 3)));
      } else if (isDm) {
        goals = Math.max(0, Math.round((0.5 + qualityNorm * 3) * scale + rng.int(0, 2)));
        assists = Math.max(0, Math.round((1 + qualityNorm * 4.5) * scale + rng.int(-1, 2)));
        cleanSheets = Math.min(appearances, Math.max(0, Math.round(appearances * 0.24)));
      } else if (isFullback) {
        goals = Math.max(0, Math.round((0.5 + qualityNorm * 2.5) * scale + rng.int(0, 2)));
        assists = Math.max(0, Math.round((1.5 + qualityNorm * 6) * scale + rng.int(-1, 2)));
        cleanSheets = Math.min(appearances, Math.max(0, Math.round(appearances * (0.24 + qualityNorm * 0.12))));
      } else if (isDef) {
        goals = Math.max(0, Math.round((0.5 + qualityNorm * 2.8) * scale + rng.int(0, 2)));
        assists = Math.max(0, Math.round((0.3 + qualityNorm * 1.8) * scale + rng.int(0, 1)));
        cleanSheets = Math.min(appearances, Math.max(0, Math.round(appearances * (0.26 + qualityNorm * 0.14))));
      }

      const avgRating = Math.min(
        7.85,
        Math.max(6.15, 6.32 + qualityNorm * 0.72 + (goals / Math.max(1, appearances)) * 0.55 + (rng.next() - 0.5) * 0.36)
      );

      history.push({
        year: seasonYear,
        clubId: spellClub.id,
        stats: {
          appearances,
          goals,
          assists,
          cleanSheets,
          conceded,
          totalRating: Number((appearances * avgRating).toFixed(2)),
        },
      });
    }
  }

  player.history = history;
  recomputeCareerStatsFromHistory(player);
}

export function recomputeCareerStatsFromHistory(player: Player): void {
  let totalApps = 0;
  let totalGoals = 0;
  let totalAssists = 0;
  let totalCleanSheets = 0;
  const clubsPlayedFor: string[] = [];
  const seen = new Set<string>();

  for (const h of player.history || []) {
    totalApps += h.stats?.appearances || 0;
    totalGoals += h.stats?.goals || 0;
    totalAssists += h.stats?.assists || 0;
    totalCleanSheets += h.stats?.cleanSheets || 0;
    if (h.clubId && !seen.has(h.clubId)) {
      seen.add(h.clubId);
      clubsPlayedFor.push(h.clubId);
    }
  }

  if (player.seasonStats?.appearances) {
    totalApps += player.seasonStats.appearances;
    totalGoals += player.seasonStats.goals;
    totalAssists += player.seasonStats.assists;
    totalCleanSheets += player.seasonStats.cleanSheets;
  }

  if (player.clubId && player.clubId !== 'FREE_AGENT' && !seen.has(player.clubId)) {
    clubsPlayedFor.push(player.clubId);
  }

  player.careerStats = {
    totalApps,
    totalGoals,
    totalAssists,
    totalCleanSheets,
    clubsPlayedFor,
  };
}

const HONOR_LABELS_BY_COUNTRY: Record<string, string[]> = {
  Argentina: ['Liga Profesional', 'Copa Argentina'],
  Brasil: ['Brasileirão', 'Copa do Brasil'],
  España: ['La Liga', 'Copa del Rey'],
  Inglaterra: ['Premier League', 'FA Cup'],
  Italia: ['Serie A', 'Coppa Italia'],
  Alemania: ['Bundesliga', 'DFB-Pokal'],
  Francia: ['Ligue 1', 'Coupe de France'],
  Portugal: ['Primeira Liga', 'Taça de Portugal'],
  'Países Bajos': ['Eredivisie', 'KNVB Cup'],
  Uruguay: ['Campeonato Uruguayo'],
  Chile: ['Primera División'],
  Colombia: ['Liga BetPlay'],
  México: ['Liga MX'],
};

function parseYearRange(yearsStr: string, fallbackYear: number): [number, number] {
  const m = /(\d{4})\s*[-–]\s*(\d{4})/.exec(yearsStr || '');
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a <= b) return [a, b];
  }
  const single = /(\d{4})/.exec(yearsStr || '');
  if (single) {
    const y = parseInt(single[1], 10);
    return [y, y];
  }
  return [fallbackYear - 2, fallbackYear - 1];
}

function getEarlyRoleProgression(finalRole: StaffRole, spellIdx: number, totalSpells: number): StaffRole {
  if (totalSpells <= 1 || spellIdx === totalSpells - 1) return finalRole;
  if (finalRole === 'HEAD_COACH') {
    return spellIdx === 0 && totalSpells >= 3 ? 'COACH' : spellIdx === 0 ? 'ASSISTANT_MANAGER' : 'HEAD_COACH';
  }
  if (finalRole === 'SPORTING_DIRECTOR') {
    return spellIdx === 0 ? 'SCOUT' : 'SPORTING_DIRECTOR';
  }
  if (finalRole === 'ASSISTANT_MANAGER') {
    return spellIdx === 0 ? 'COACH' : 'ASSISTANT_MANAGER';
  }
  return finalRole;
}

/**
 * Populates past club spells (`previousClubs`), year-by-year `history`, and earned `careerHonours`
 * for any Staff member (real DB staff, curated managers, or generated/retired-player staff).
 * Idempotent: preserves existing curated data while backfilling empty `history` or `previousClubs`.
 */
export function populateStaffPastHistory(
  staff: Staff,
  currentClub: Club | undefined,
  clubIndex: ClubPoolIndex,
  currentSeasonYear = 2008
): void {
  if (!Array.isArray(staff.history)) staff.history = [];

  // Curated managers that already have previousClubs but empty `history` rows: expand into season rows
  if (staff.history.length === 0 && Array.isArray(staff.previousClubs) && staff.previousClubs.length > 0) {
    const rows: StaffHistoryEntry[] = [];
    const seenYears = new Set<number>();
    staff.previousClubs.forEach((pc, idx) => {
      const [yStart, yEnd] = parseYearRange(pc.years, currentSeasonYear);
      const roleForSpell = getEarlyRoleProgression(staff.role, idx, staff.previousClubs!.length + (currentClub ? 1 : 0));
      for (let y = yStart; y <= Math.min(currentSeasonYear - 1, yEnd); y++) {
        if (seenYears.has(y)) continue;
        seenYears.add(y);
        rows.push({ year: y, clubId: pc.clubId || pc.clubName, role: roleForSpell });
      }
    });
    if (currentClub && !seenYears.has(currentSeasonYear - 1)) {
      rows.push({ year: currentSeasonYear - 1, clubId: currentClub.id, role: staff.role });
    }
    staff.history = rows.sort((a, b) => a.year - b.year);
    return;
  }

  if (staff.history.length > 0 && Array.isArray(staff.previousClubs) && staff.previousClubs.length > 0) {
    return;
  }

  const rng = createRng(`st_${staff.id}_${staff.name}`);
  const age = staff.age || 42;
  const rep = staff.reputation ?? 50;

  const isTacticalRole = ['HEAD_COACH', 'ASSISTANT_MANAGER', 'COACH', 'RESERVE_MANAGER', 'YOUTH_MANAGER'].includes(staff.role);
  const startAge = isTacticalRole ? rng.int(31, 36) : rng.int(27, 33);
  const maxSpan = age <= startAge ? 1 : Math.min(14, age - startAge);
  const startYear = currentSeasonYear - maxSpan;

  const numSpells = maxSpan >= 9 ? rng.int(2, 4) : maxSpan >= 4 ? rng.int(2, 3) : maxSpan >= 2 ? rng.int(1, 2) : 1;

  const natPool = clubIndex.byCountry.get(staff.nationality) || [];
  const clubCountryPool = currentClub ? clubIndex.byCountry.get(currentClub.country) || [] : [];
  const targetClubRep = Math.max(2500, Math.min(9200, currentClub?.reputation || rep * 95));

  const pickedClubs: Club[] = [];
  const usedIds = new Set<string>();
  if (currentClub) usedIds.add(currentClub.id);

  const prevNeeded = Math.max(0, numSpells - (currentClub ? 1 : 0));
  for (let i = 0; i < prevNeeded; i++) {
    const stepRep = Math.round(targetClubRep * (0.68 + (i / Math.max(1, prevNeeded)) * 0.3));
    let c =
      (clubCountryPool.length > 1 && rng.next() < 0.72
        ? pickClubNearRep(clubCountryPool, stepRep, usedIds, rng)
        : undefined) ||
      (natPool.length > 1 ? pickClubNearRep(natPool, stepRep, usedIds, rng) : undefined) ||
      pickClubNearRep(clubIndex.allByRep, stepRep, usedIds, rng);

    if (c) {
      usedIds.add(c.id);
      pickedClubs.push(c);
    }
  }
  if (currentClub) pickedClubs.push(currentClub);

  // If staff is a free agent and couldn't match a pool club, pick at least 1 club from nationality/global pool
  if (pickedClubs.length === 0) {
    const fallback = pickClubNearRep(natPool.length > 0 ? natPool : clubIndex.allByRep, targetClubRep, usedIds, rng);
    if (fallback) pickedClubs.push(fallback);
  }

  if (pickedClubs.length === 0) return;

  const spellLengths = new Array(pickedClubs.length).fill(1);
  let rem = Math.max(0, maxSpan - pickedClubs.length);
  while (rem > 0) {
    spellLengths[rng.int(0, pickedClubs.length - 1)]++;
    rem--;
  }

  const history: StaffHistoryEntry[] = [];
  const previousClubs: StaffPreviousClub[] = [];
  const earnedHonours: string[] = Array.isArray(staff.careerHonours) ? [...staff.careerHonours] : [];

  let cursor = startYear;
  for (let i = 0; i < pickedClubs.length; i++) {
    const club = pickedClubs[i];
    const len = spellLengths[i];
    const roleAtClub = getEarlyRoleProgression(staff.role, i, pickedClubs.length);
    const y0 = cursor;
    const y1 = cursor + len - 1;

    for (let k = 0; k < len; k++) {
      history.push({ year: cursor++, clubId: club.id, role: roleAtClub });
    }

    const isCurrentClub = Boolean(currentClub && club.id === currentClub.id);
    if (!isCurrentClub) {
      const titles: string[] = [];
      if (
        (roleAtClub === 'HEAD_COACH' || roleAtClub === 'ASSISTANT_MANAGER' || roleAtClub === 'SPORTING_DIRECTOR') &&
        rep >= 62 &&
        (club.reputation || 0) >= 6400 &&
        len >= 2 &&
        rng.next() < (rep >= 78 ? 0.55 : 0.3)
      ) {
        const countryTitles = HONOR_LABELS_BY_COUNTRY[club.country] || ['Liga Nacional', 'Copa Nacional'];
        const chosenTitle = countryTitles[rng.int(0, countryTitles.length - 1)];
        titles.push(chosenTitle);
        if (!earnedHonours.includes(chosenTitle)) earnedHonours.push(chosenTitle);
      }

      previousClubs.push({
        clubId: club.id,
        clubName: club.name,
        years: y0 === y1 ? `${y0}` : `${y0}-${y1}`,
        titles,
      });
    }
  }

  if (staff.history.length === 0) {
    staff.history = history;
  }
  if (!Array.isArray(staff.previousClubs) || staff.previousClubs.length === 0) {
    staff.previousClubs = previousClubs;
  }
  if ((!staff.careerHonours || staff.careerHonours.length === 0) && earnedHonours.length > 0) {
    staff.careerHonours = earnedHonours;
  }
}
