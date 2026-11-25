#!/usr/bin/env bun
/**
 * Update Football Database from ZOXEXIVO/open-football-database (local clone)
 * 
 * Reads data from local clone at /tmp/open-football-database/data
 * Filters out excluded countries: hr, pl, at, ch, ua, za, eg, au
 * Outputs: public/data/convertedClubs.json, convertedPlayers.json, convertedLeagues.json
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const EXCLUDED_COUNTRIES = new Set(["hr", "pl", "at", "ch", "ua", "za", "eg", "au"]);
const DATA_DIR = "/tmp/open-football-database/data";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "public", "data");

// Project league IDs that we need to map to
const PROJECT_LEAGUE_MAP: Record<string, string> = {
  // Argentina
  "argentine-premier-division-zona-a": "L_ARG_1",
  "argentine-premier-division-zona-b": "L_ARG_1",
  "argentine-primera-nacional-zona-a": "L_ARG_2",
  "argentine-primera-nacional-zona-b": "L_ARG_2",
  "argentine-primera-b-metropolitana": "L_ARG_3",
  
  // Brazil
  "brazilian-serie-a": "L_BRA_1",
  "brazilian-serie-b": "L_BRA_2",
  
  // Spain
  "spanish-first-division": "L_ESP_1",
  "spanish-second-division": "L_ESP_2",
  
  // Italy
  "italian-serie-a": "L_ITA_1",
  "italian-serie-b": "L_ITA_2",
  
  // Germany
  "bundesliga": "L_DEU_1",
  "2-bundesliga": "L_DEU_2",
  
  // France
  "ligue-1": "L_FRA_1",
  "ligue-2": "L_FRA_2",
  
  // Portugal
  "portuguese-primeira-liga": "L_PRT_1",
  
  // Netherlands
  "eredivisie": "L_NLD_1",
  "eerste-divisie": "L_NLD_2",
  
  // Mexico
  "liga-mx": "L_MEX_1",
  
  // USA
  "major-league-soccer-eastern": "L_USA_1",
  "major-league-soccer-western": "L_USA_1",
  
  // Japan
  "j-league": "L_JPN_1",
  
  // England
  "premier-league": "L_ENG_1",
  "championship": "L_ENG_2",
  "league-one": "L_ENG_3",
  "league-two": "L_ENG_4",
  
  // Chile
  "chilean-primera-division": "L_CHI_1",
  
  // Colombia
  "colombian-first-division": "L_COL_1",
  "colombian-second-division": "L_COL_2",
  
  // Uruguay
  "uruguayan-first-division": "L_URY_1",
  "uruguayan-second-division": "L_URY_2",
  
  // Ecuador - not in data
  
  // Venezuela
  "venezuelan-primera-division": "L_VEN_1",
  "venezuelan-segunda-division": "L_VEN_2",
  
  // Peru
  "peruvian-primera-division": "L_PER_1",
  
  // South Korea - not in data
  
  // China
  "chinese-super-league": "L_CHN_1",
  
  // Morocco
  "moroccan-botola": "L_MAR_1",
  "botola-pro": "L_MAR_1",
};

const COUNTRY_NAMES_ES: Record<string, string> = {
  "ar": "Argentina", "br": "Brasil", "es": "España", "it": "Italia",
  "de": "Alemania", "fr": "Francia", "pt": "Portugal", "nl": "Países Bajos",
  "mx": "México", "us": "EE.UU.", "jp": "Japón", "gb": "Inglaterra",
  "cl": "Chile", "co": "Colombia", "uy": "Uruguay", "ec": "Ecuador",
  "ve": "Venezuela", "pe": "Perú", "kr": "Corea del Sur", "cn": "China",
  "ma": "Marruecos", "be": "Bélgica", "tr": "Turquía", "ru": "Rusia",
  "cz": "República Checa", "gr": "Grecia", "ro": "Rumania",
  "rs": "Serbia", "dk": "Dinamarca", "se": "Suecia", "no": "Noruega",
  "fi": "Finlandia", "sa": "Arabia Saudí", "qa": "Qatar", "ae": "Emiratos Árabes",
  "ir": "Irán", "il": "Israel", "dz": "Argelia", "tn": "Túnez",
  "ng": "Nigeria", "gh": "Ghana", "ci": "Costa de Marfil", "cm": "Camerún",
  "sn": "Senegal", "eg": "Egipto", "za": "Sudáfrica", "au": "Australia",
  "at": "Austria", "pl": "Polonia", "ch": "Suiza", "hr": "Croacia",
  "ua": "Ucrania",
};

const POSITION_MAP: Record<string, string[]> = {
  "GK": ["POR"],
  "DL": ["LD", "LDI"], "DR": ["LD", "LDI"], "DC": ["DFC", "DCC"], "WB": ["LD", "LDI"],
  "DML": ["MD", "MDI"], "DMR": ["MD", "MDI"], "DMC": ["MCD", "MC"],
  "ML": ["MI", "MI"], "MR": ["MD", "MD"], "MC": ["MC", "MCO"], "AMC": ["MCO", "MP"],
  "AML": ["EI", "MI"], "AMR": ["ED", "MD"], "ST": ["DC", "ED", "EI"], "SC": ["DC"],
};

const ATTRIBUTE_MAP: Record<string, string> = {
  "pac": "velocidad", "sta": "resistencia", "str": "fuerza", "fir": "control",
  "pas": "pase", "dri": "regate", "fin": "disparo", "ant": "anticipacion",
  "dec": "decision", "pos": "posicionamiento", "vis": "vision", "agg": "agresividad",
  "ver": "polivalencia", "acc": "velocidad", "bal": "control", "agi": "regate",
  "jum": "fuerza", "tec": "control", "cro": "pase", "lon": "pase", "hea": "disparo",
  "mar": "posicionamiento", "tck": "posicionamiento", "otb": "posicionamiento",
  "fla": "regate", "tea": "decision", "wor": "resistencia", "ldr": "decision",
  "bra": "agresividad", "det": "anticipacion", "cmp": "decision", "cnt": "concentracion",
  "dir": "concentracion", "cns": "concentracion", "imp": "agresividad", "inj": "fuerza",
  "nat": "fuerza",
};

interface ZOXCountry {
  id: number; code: string; slug: string; name: string; continent_id: number;
  reputation: number; background_color: string; foreground_color: string;
}

interface ZOXLeague {
  id: number; enabled: boolean; slug: string; name: string; reputation: number;
  tier: number; promotion_spots: number; relegation_spots: number;
  league_group?: { name: string; competition: string; total_groups: number; };
}

interface ZOXClub {
  id: number; name: string; location: { city_id: number }; finance: { balance: number };
  teams: Array<{ id: number; name: string; slug: string; team_type: string; reputation: { home: number; national: number; world: number }; }>;
  colors: { background: string; foreground: string }; rivals: number[];
  philosophy: string; facilities: { training: string; youth: string; academy: string; recruitment: string; };
  average_attendance: number; ids: Record<string, string>;
}

interface ZOXPlayer {
  id: number; first_name: string; last_name: string; birth_date: string; country_id: number; club_id: number;
  attrs: { person: Record<string, number>; player: { technical: Record<string, number>; mental: Record<string, number>; physical: Record<string, number>; hidden: Record<string, number>; }; };
  positions: Array<{ code: string; level: number }>; foots: { left: number; right: number };
  current_ability: number; potential_ability: number; value: number;
  contract: { salary: number; expiration: string; started: string; contract_type: string; };
  ids: Record<string, string>; international: { apps: number; goals: number; u21_apps: number; u21_goals: number };
  history: Array<{ s: number; c: number; p?: number; g?: number }>;
}

interface ConvertedLeague {
  id: string; name: string; country: string; tier: number; reputation: number;
  promotion_spots: number; relegation_spots: number; playable: boolean;
}

interface ConvertedClub {
  id: number; name: string; slug: string; shortName: string;
  primaryColor: string; secondaryColor: string; reputation: number;
  country: string; countryCode: string; competitionId: string; playable: boolean;
  average_attendance: number; facilities: { training: string; youth: string; academy: string; recruitment: string; };
}

interface ConvertedPlayer {
  id: string; name: string; firstName: string; lastName: string; birthDate: string; age: number;
  nationality: string; countryId: number; clubId: string; positions: string[]; primaryPosition: string;
  stats: { internal: Record<string, number>; visible: { fisico: number; mental: number; tecnica: number; agresividad: number; polivalencia: number }; };
  ca: number; pa: number; value: number; salary: number; contractExpiry: string;
  height: number; weight: number; history: Array<{ s: number; c: number; p: number; g: number }>;
}

function readJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function listDirectories(dirPath: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

function listJSONFiles(dirPath: string): string[] {
  try {
    return readdirSync(dirPath)
      .filter(f => f.endsWith(".json"));
  } catch {
    return [];
  }
}

function generateShortName(name: string): string {
  const words = name.split(/[\s-]+/);
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words.map(w => w[0]).join("").toUpperCase().substring(0, 4);
}

function mapPositions(zoxPositions: Array<{ code: string; level: number }>): string[] {
  const result: string[] = [];
  for (const p of zoxPositions) {
    const mapped = POSITION_MAP[p.code];
    if (mapped) {
      for (const m of mapped) {
        if (!result.includes(m)) result.push(m);
      }
    }
  }
  return result.length > 0 ? result : ["MC"];
}

function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function mapAttributes(zoxAttrs: ZOXPlayer["attrs"]): Record<string, number> {
  const internal: Record<string, number> = {};
  
  if (!zoxAttrs?.player) {
    console.warn("  Warning: Player missing attrs.player, using defaults");
    const required = ["velocidad", "resistencia", "fuerza", "control", "pase", "regate", "disparo", "anticipacion", "decision", "posicionamiento", "vision", "agresividad", "polivalencia"];
    for (const req of required) internal[req] = 10;
    return internal;
  }
  
  const allAttrs = {
    ...(zoxAttrs.player.technical || {}),
    ...(zoxAttrs.player.mental || {}),
    ...(zoxAttrs.player.physical || {}),
    ...(zoxAttrs.player.hidden || {}),
  };
  
  for (const [zoxKey, value] of Object.entries(allAttrs)) {
    const projectKey = ATTRIBUTE_MAP[zoxKey];
    if (projectKey) {
      internal[projectKey] = Math.max(1, Math.min(20, value));
    }
  }
  
  const required = ["velocidad", "resistencia", "fuerza", "control", "pase", "regate", "disparo", "anticipacion", "decision", "posicionamiento", "vision", "agresividad", "polivalencia"];
  for (const req of required) {
    if (!(req in internal)) internal[req] = 10;
  }
  
  return internal;
}

function calculateVisibleStats(internal: Record<string, number>) {
  return {
    fisico: Math.round((internal.velocidad + internal.resistencia + internal.fuerza) / 3),
    mental: Math.round((internal.decision + internal.anticipacion + internal.posicionamiento + internal.vision) / 4),
    tecnica: Math.round((internal.control + internal.pase + internal.regate + internal.disparo) / 4),
    agresividad: internal.agresividad,
    polivalencia: internal.polivalencia,
  };
}

async function processCountry(country: ZOXCountry) {
  if (EXCLUDED_COUNTRIES.has(country.code)) {
    console.log(`  Skipping excluded country: ${country.code} (${country.name})`);
    return { leagues: [], clubs: [], players: [] };
  }
  
  console.log(`Processing ${country.code} (${country.name})...`);
  
  const countryDir = join(DATA_DIR, country.code);
  const leagueDirs = listDirectories(countryDir);
  console.log(`  Found ${leagueDirs.length} leagues`);
  
  const allLeagues: ConvertedLeague[] = [];
  const allClubs: ConvertedClub[] = [];
  const allPlayers: ConvertedPlayer[] = [];
  
  for (const leagueDir of leagueDirs) {
    const projectLeagueId = PROJECT_LEAGUE_MAP[leagueDir];
    if (!projectLeagueId) continue;
    
    console.log(`    Processing league: ${leagueDir} -> ${projectLeagueId}`);
    
    const league = readJSON<ZOXLeague>(join(countryDir, leagueDir, "league.json"));
    if (!league) continue;
    // Include disabled leagues too for data completeness
    
    const clubDirs = listDirectories(join(countryDir, leagueDir));
    
    for (const clubDir of clubDirs) {
      const club = readJSON<ZOXClub>(join(countryDir, leagueDir, clubDir, "club.json"));
      if (!club) continue;
      
      const mainTeam = club.teams.find(t => t.team_type === "Main");
      if (!mainTeam) continue;
      
      const convertedClub: ConvertedClub = {
        id: mainTeam.id,
        name: club.name,
        slug: mainTeam.slug,
        shortName: generateShortName(club.name),
        primaryColor: club.colors.background,
        secondaryColor: club.colors.foreground,
        reputation: mainTeam.reputation.home,
        country: COUNTRY_NAMES_ES[country.code] || country.name,
        countryCode: country.code,
        competitionId: projectLeagueId,
        playable: league.tier <= 2,
        average_attendance: club.average_attendance || 0,
        facilities: {
          training: club.facilities.training || "Adequate",
          youth: club.facilities.youth || "Adequate",
          academy: club.facilities.academy || "Adequate",
          recruitment: club.facilities.recruitment || "Adequate",
        },
      };
      allClubs.push(convertedClub);
      
      // Fetch players
      const playersDir = join(countryDir, leagueDir, clubDir, "players");
      const playerFiles = listJSONFiles(playersDir);
      
      for (const pf of playerFiles) {
        try {
          const player = readJSON<ZOXPlayer>(join(playersDir, pf));
          if (!player) continue;
          if (player.club_id !== mainTeam.id) continue;
          
          const positions = mapPositions(player.positions || []);
          const internalAttrs = mapAttributes(player.attrs);
          const visibleAttrs = calculateVisibleStats(internalAttrs);
          
          const countryName = COUNTRY_NAMES_ES[country.code] || country.name;
          
          const convertedPlayer: ConvertedPlayer = {
            id: String(player.id),
            name: `${player.first_name} ${player.last_name}`,
            firstName: player.first_name,
            lastName: player.last_name,
            birthDate: player.birth_date,
            age: calculateAge(player.birth_date),
            nationality: countryName,
            countryId: country.id,
            clubId: String(mainTeam.id),
            positions,
            primaryPosition: positions[0] || "MC",
            stats: { internal: internalAttrs, visible: visibleAttrs },
            ca: player.current_ability || 100,
            pa: player.potential_ability || 100,
            value: player.value || 0,
            salary: player.contract?.salary || 0,
            contractExpiry: player.contract?.expiration || "2027-06-30",
            height: 180,
            weight: 75,
            history: (player.history || []).map(h => ({ s: h.s, c: h.c, p: h.p || 0, g: h.g || 0 })),
          };
          allPlayers.push(convertedPlayer);
        } catch (e) {
          console.warn(`  Warning: Failed to parse player ${pf}: ${e}`);
        }
      }
    }
    
    if (!allLeagues.find(l => l.id === projectLeagueId)) {
      allLeagues.push({
        id: projectLeagueId,
        name: league.name,
        country: COUNTRY_NAMES_ES[country.code] || country.name,
        tier: league.tier,
        reputation: league.reputation,
        promotion_spots: league.promotion_spots,
        relegation_spots: league.relegation_spots,
        playable: league.tier <= 2,
      });
    }
  }
  
  return { leagues: allLeagues, clubs: allClubs, players: allPlayers };
}

async function main() {
  console.log("Reading countries from local clone...");
  const countries = readJSON<ZOXCountry[]>(join(DATA_DIR, "countries.json"));
  
  if (!countries) {
    console.error("Failed to read countries.json");
    process.exit(1);
  }
  
  console.log(`Found ${countries.length} countries. Excluding: ${Array.from(EXCLUDED_COUNTRIES).join(", ")}`);
  
  const allLeagues: ConvertedLeague[] = [];
  const allClubs: ConvertedClub[] = [];
  const allPlayers: ConvertedPlayer[] = [];
  
  for (const country of countries) {
    const result = await processCountry(country);
    allLeagues.push(...result.leagues);
    allClubs.push(...result.clubs);
    allPlayers.push(...result.players);
  }
  
  const uniqueLeagues = allLeagues.filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i);
  
  console.log(`\nTotal: ${uniqueLeagues.length} leagues, ${allClubs.length} clubs, ${allPlayers.length} players`);
  
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  writeFileSync(join(OUTPUT_DIR, "convertedLeagues.json"), JSON.stringify(uniqueLeagues, null, 2));
  writeFileSync(join(OUTPUT_DIR, "convertedClubs.json"), JSON.stringify(allClubs, null, 2));
  writeFileSync(join(OUTPUT_DIR, "convertedPlayers.json"), JSON.stringify(allPlayers, null, 2));
  
  console.log(`\nWritten to ${OUTPUT_DIR}:`);
  console.log(`  - convertedLeagues.json (${uniqueLeagues.length} leagues)`);
  console.log(`  - convertedClubs.json (${allClubs.length} clubs)`);
  console.log(`  - convertedPlayers.json (${allPlayers.length} players)`);
  
  const clubByCountry = allClubs.reduce((acc, c) => {
    acc[c.countryCode] = (acc[c.countryCode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log("\nClubs by country:");
  for (const [code, count] of Object.entries(clubByCountry).sort()) {
    console.log(`  ${code}: ${count}`);
  }
}

main().catch(console.error);