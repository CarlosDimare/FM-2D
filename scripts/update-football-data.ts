#!/usr/bin/env bun
/**
 * Update Football Database from ZOXEXIVO/open-football-database + Wikidata Staff Snapshot
 *
 * Reads data from local clone at /tmp/open-football-database/data (cloning shallowly if missing)
 * and scripts/wikidataStaffSnapshot.json + src/data/wikidataManagers.json.
 *
 * Outputs optimized runtime bundles in public/data/:
 *  - convertedLeagues.json
 *  - convertedClubs.json
 *  - convertedStaff.json
 *  - players/manifest.json
 *  - players/{leagueId}.json  (one compact tuple chunk per league for instant startup + lazy/background loading)
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const DATA_DIR = "/tmp/open-football-database/data";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT_DIR, "public", "data");
const PLAYERS_DIR = join(OUTPUT_DIR, "players");

// Keep exact project IDs for core leagues so gameStore/argentineLeague/worldManager integrations remain 100% compatible
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
  "brazilian-serie-c": "L_BRA_3",
  "brazilian-serie-d-grupo-1": "L_BRA_4A",
  "brazilian-serie-d-grupo-2": "L_BRA_4B",
  "brazilian-serie-d-grupo-3": "L_BRA_4C",
  "brazilian-serie-d-grupo-4": "L_BRA_4D",

  // Spain
  "spanish-first-division": "L_ESP_1",
  "spanish-second-division": "L_ESP_2",
  "primera-federacion-grupo-1": "L_ESP_3A",
  "primera-federacion-grupo-2": "L_ESP_3B",

  // Italy
  "italian-serie-a": "L_ITA_1",
  "italian-serie-b": "L_ITA_2",
  "italian-serie-c-a": "L_ITA_3A",
  "italian-serie-c-b": "L_ITA_3B",
  "italian-serie-c-c": "L_ITA_3C",

  // Germany
  "bundesliga": "L_DEU_1",
  "2-bundesliga": "L_DEU_2",

  // France
  "ligue-1": "L_FRA_1",
  "ligue-2": "L_FRA_2",
  "national": "L_FRA_3",

  // Portugal
  "portuguese-primeira-liga": "L_PRT_1",
  "portuguese-second-league": "L_PRT_2",
  "portuguese-liga-3-norte": "L_PRT_3N",
  "portuguese-liga-3-sul": "L_PRT_3S",

  // Netherlands
  "eredivisie": "L_NLD_1",
  "eerste-divisie": "L_NLD_2",

  // Belgium
  "belgian-pro-league": "L_BEL_1",
  "challenger-pro-league": "L_BEL_2",

  // England
  "premier-league": "L_ENG_1",
  "championship": "L_ENG_2",
  "league-one": "L_ENG_3",
  "league-two": "L_ENG_4",

  // Turkey & Saudi & Russia
  "turkish-super-league": "L_TUR_1",
  "tff-1-lig": "L_TUR_2",
  "saudi-professional-league": "L_SAU_1",
  "saudi-first-division": "L_SAU_2",
  "russian-premier-league": "L_RUS_1",
  "russian-first-division": "L_RUS_2",

  // Americas
  "liga-mx": "L_MEX_1",
  "major-league-soccer-eastern": "L_USA_1",
  "major-league-soccer-western": "L_USA_1",
  "chilean-primera-division": "L_CHI_1",
  "chilean-primera-b": "L_CHI_2",
  "colombian-first-division": "L_COL_1",
  "colombian-second-division": "L_COL_2",
  "uruguayan-first-division": "L_URY_1",
  "uruguayan-second-division": "L_URY_2",
  "uruguayan-third-division-serie-a": "L_URY_3A",
  "uruguayan-third-division-serie-b": "L_URY_3B",
  "uruguayan-third-division-serie-c": "L_URY_3C",
  "paraguayan-primera-division": "L_PRY_1",
  "paraguayan-division-intermedia": "L_PRY_2",
  "peruvian-primera-division": "L_PER_1",
  "venezuelan-primera-division": "L_VEN_1",
  "venezuelan-segunda-division": "L_VEN_2",

  // Asia / Oceania / Africa
  "j-league": "L_JPN_1",
  "chinese-super-league": "L_CHN_1",
  "a-league": "L_AUS_1",
  "egyptian-premier-league": "L_EGY_1",
  "botola-pro": "L_MAR_1",
  "south-african-psl": "L_RSA_1",
};

const MERGED_LEAGUE_NAMES: Record<string, string> = {
  "L_ARG_1": "Liga Profesional",
  "L_ARG_2": "Primera Nacional",
  "L_USA_1": "Major League Soccer",
};

// Map open-football-database country codes -> Spanish names matching src/data/static.ts COUNTRY_CODES
const COUNTRY_NAMES_ES: Record<string, string> = {
  "ae": "Emiratos Árabes Unidos", "al": "Albania", "am": "Armenia", "ar": "Argentina",
  "at": "Austria", "au": "Australia", "az": "Azerbaiyán", "be": "Bélgica",
  "bg": "Bulgaria", "br": "Brasil", "by": "Bielorrusia", "ch": "Suiza",
  "cl": "Chile", "cm": "Camerún", "cn": "China", "co": "Colombia",
  "cy": "Chipre", "cz": "República Checa", "de": "Alemania", "dk": "Dinamarca",
  "dz": "Argelia", "ee": "Estonia", "eg": "Egipto", "es": "España",
  "fi": "Finlandia", "fj": "Fiyi", "fr": "Francia", "gb": "Inglaterra",
  "ge": "Georgia", "gh": "Ghana", "gr": "Grecia", "hr": "Croacia",
  "hu": "Hungría", "id": "Indonesia", "il": "Israel", "ir": "Irán",
  "is": "Islandia", "it": "Italia", "jp": "Japón", "ke": "Kenia",
  "kz": "Kazajistán", "lt": "Lituania", "lv": "Letonia", "ma": "Marruecos",
  "ml": "Malí", "mt": "Malta", "mx": "México", "ng": "Nigeria",
  "nl": "Países Bajos", "no": "Noruega", "nz": "Nueva Zelanda", "pe": "Perú",
  "pl": "Polonia", "pt": "Portugal", "py": "Paraguay", "ro": "Rumania",
  "rs": "Serbia", "ru": "Rusia", "sa": "Arabia Saudita", "se": "Suecia",
  "si": "Eslovenia", "sk": "Eslovaquia", "td": "Chad", "tr": "Turquía",
  "ua": "Ucrania", "us": "USA", "uy": "Uruguay", "uz": "Uzbekistán",
  "ve": "Venezuela", "za": "Sudáfrica",
  // Extra player nationalities in countries.json
  "bo": "Bolivia", "ec": "Ecuador", "ca": "Canadá", "cr": "Costa Rica",
  "pa": "Panamá", "hn": "Honduras", "sv": "El Salvador", "gt": "Guatemala",
  "ni": "Nicaragua", "cu": "Cuba", "do": "República Dominicana", "jm": "Jamaica",
  "ht": "Haití", "tt": "Trinidad y Tobago", "cw": "Curazao", "gy": "Guyana",
  "sr": "Surinam", "sn": "Senegal", "ci": "Costa de Marfil", "tn": "Túnez",
  "ao": "Angola", "cd": "República Democrática del Congo", "cg": "Congo",
  "ga": "Gabón", "gn": "Guinea", "gq": "Guinea Ecuatorial", "bf": "Burkina Faso",
  "ne": "Níger", "sd": "Sudán", "et": "Etiopía", "tz": "Tanzania",
  "zm": "Zambia", "zw": "Zimbabue", "mz": "Mozambique", "bj": "Benín",
  "tg": "Togo", "sl": "Sierra Leona", "lr": "Liberia", "mr": "Mauritania",
  "cv": "Cabo Verde", "gm": "Gambia", "ug": "Uganda", "rw": "Ruanda",
  "mg": "Madagascar", "km": "Comoras", "ly": "Libia", "kr": "Corea del Sur",
  "kp": "Corea del Norte", "in": "India", "iq": "Irak", "qa": "Catar",
  "kw": "Kuwait", "om": "Omán", "bh": "Bahréin", "jo": "Jordania",
  "lb": "Líbano", "sy": "Siria", "ps": "Palestina", "th": "Tailandia",
  "vn": "Vietnam", "ph": "Filipinas", "my": "Malasia", "sg": "Singapur",
  "ie": "Irlanda", "ba": "Bosnia y Herzegovina", "me": "Montenegro",
  "mk": "Macedonia del Norte", "xk": "Kosovo", "lu": "Luxemburgo",
  "md": "Moldavia", "ad": "Andorra", "sm": "San Marino", "fo": "Islas Feroe",
  "gi": "Gibraltar",
};

const EN_COUNTRY_NAME_ES: Record<string, string> = {
  "Scotland": "Escocia",
  "Wales": "Gales",
  "Northern Ireland": "Irlanda del Norte",
  "England": "Inglaterra",
  "United Kingdom": "Inglaterra",
  "Reino Unido": "Inglaterra",
  "United States": "USA",
  "Estados Unidos": "USA",
  "Korea Republic": "Corea del Sur",
  "South Korea": "Corea del Sur",
  "Côte d'Ivoire": "Costa de Marfil",
  "Ivory Coast": "Costa de Marfil",
  "Czechia": "República Checa",
  "Czech Republic": "República Checa",
  "DR Congo": "República Democrática del Congo",
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  "North Macedonia": "Macedonia del Norte",
  "Turkiye": "Turquía",
  "Turkey": "Turquía",
  "Spain": "España",
  "Germany": "Alemania",
  "France": "Francia",
  "Italy": "Italia",
  "Brazil": "Brasil",
  "Netherlands": "Países Bajos",
  "Belgium": "Bélgica",
  "Switzerland": "Suiza",
  "Sweden": "Suecia",
  "Norway": "Noruega",
  "Denmark": "Dinamarca",
  "Poland": "Polonia",
  "Russia": "Rusia",
  "Ukraine": "Ucrania",
  "Morocco": "Marruecos",
  "Egypt": "Egipto",
  "South Africa": "Sudáfrica",
  "Japan": "Japón",
  "Mexico": "México",
  "Peru": "Perú",
};

// Map ZOXEXIVO position codes -> codes expected by worldManager.ts posMap
// worldManager posMap keys: P, DFC, LIB, LD, LI, CD, CI, MCD, MC, MD, MI, MPC, ED, EI, DC, WD, WI
const POSITION_MAP: Record<string, string> = {
  "GK": "P",
  "DC": "DFC",
  "SW": "LIB",
  "DR": "LD",
  "DL": "LI",
  "WBR": "CD",
  "WBL": "CI",
  "DMR": "CD",
  "DML": "CI",
  "DM": "MCD",
  "DMC": "MCD",
  "MC": "MC",
  "MR": "MD",
  "ML": "MI",
  "AMC": "MPC",
  "AMR": "ED",
  "AML": "EI",
  "ST": "DC",
  "SC": "DC",
  "WB": "CD",
};

const INTERNAL_ATTR_KEYS = [
  "velocidad", "resistencia", "fuerza", "control", "pase", "regate",
  "disparo", "anticipacion", "decision", "posicionamiento", "vision",
  "agresividad", "polivalencia",
] as const;

const STAFF_ROLES = [
  "HEAD_COACH", "ASSISTANT_MANAGER", "PHYSIO", "FITNESS_COACH",
  "RESERVE_MANAGER", "YOUTH_MANAGER", "SCOUT", "SPORTING_DIRECTOR", "TREASURER",
] as const;

const COACH_STYLES = ["CONTROL", "ATTACK", "DEFENSE", "COUNTER", "BALANCED"] as const;
const COACH_FORMATIONS = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1", "4-4-1-1", "4-2-2-2"] as const;

interface ZOXCountry {
  id: number; code: string; slug: string; name: string; continent_id: number;
  reputation: number; background_color: string; foreground_color: string;
}

interface ZOXLeague {
  id: number; enabled: boolean; slug: string; name: string; reputation: number;
  tier: number; promotion_spots: number; relegation_spots: number;
  league_group?: { name: string; competition: string; total_groups: number };
}

interface ZOXClub {
  id: number; name: string; location: { city_id: number }; finance: { balance: number };
  teams: Array<{ id: number; name: string; slug: string; team_type: string; reputation: { home: number; national: number; world: number } }>;
  colors: { background: string; foreground: string }; rivals: number[];
  philosophy: string; facilities: { training: string; youth: string; academy: string; recruitment: string };
  average_attendance: number; ids?: Record<string, string>;
}

interface ZOXPlayer {
  id: number; first_name: string; last_name: string; birth_date: string; country_id: number; club_id: number;
  attrs: {
    person?: Record<string, number>;
    player?: {
      technical?: Record<string, number>;
      mental?: Record<string, number>;
      physical?: Record<string, number>;
      hidden?: Record<string, number>;
    };
  };
  positions: Array<{ code: string; level: number }>;
  current_ability: number; potential_ability: number; value: number;
  contract?: { salary: number; expiration: string };
  history?: Array<{ s: number; c: string | number; p?: number; g?: number; a?: number; cs?: number }>;
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
    return readdirSync(dirPath, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return [];
  }
}

function listJSONFiles(dirPath: string): string[] {
  try {
    return readdirSync(dirPath).filter(f => f.endsWith(".json"));
  } catch {
    return [];
  }
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateShortName(name: string): string {
  const clean = name.replace(/\b(FC|CF|CD|CA|AC|AS|SC|UD|SD|Club|Atlético|Atletico|Deportivo|Real|Sporting|United|City)\b/gi, "").trim() || name;
  const words = clean.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words.map(w => w[0]).join("").toUpperCase().substring(0, 4);
}

function normalizeHex(hex: string | undefined, fallback: string): string {
  if (!hex || !/^#[0-9a-fA-F]{3,6}$/.test(hex.trim())) return fallback;
  const raw = hex.trim().toLowerCase();
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return raw;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function ensureDistinctColors(bg: string | undefined, fg: string | undefined, clubName: string): [string, string] {
  const fallbackPalette = ["#1d4ed8", "#b91c1c", "#15803d", "#0f766e", "#7c2d12", "#4338ca", "#1e293b"];
  const p = normalizeHex(bg, fallbackPalette[hashStr(clubName) % fallbackPalette.length]);
  let s = normalizeHex(fg, "#ffffff");
  const [r1, g1, b1] = hexRgb(p);
  const [r2, g2, b2] = hexRgb(s);
  const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  if (dist < 55) {
    const luma = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
    s = luma > 145 ? "#111827" : "#ffffff";
  }
  return [p, s];
}

function calculateAge(birthDate: string | undefined): number {
  if (!birthDate) return 24;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 24;
  const ref = new Date("2026-07-01");
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return Math.max(15, Math.min(48, age));
}

function mapPositions(zoxPositions: Array<{ code: string; level: number }>): string[] {
  const sorted = [...(zoxPositions || [])].sort((a, b) => (b.level || 0) - (a.level || 0));
  const out: string[] = [];
  for (const p of sorted) {
    const code = POSITION_MAP[p.code];
    if (code && !out.includes(code)) out.push(code);
  }
  return out.length > 0 ? out : ["MC"];
}

function clampAttr(v: number | undefined, fallback = 10): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(1, Math.min(20, n));
}

function mapPlayerAttrs13(zoxAttrs: ZOXPlayer["attrs"] | undefined): number[] {
  const t = zoxAttrs?.player?.technical || {};
  const m = zoxAttrs?.player?.mental || {};
  const ph = zoxAttrs?.player?.physical || {};
  const h = zoxAttrs?.player?.hidden || {};
  const avg = (...vals: Array<number | undefined>) => {
    const valid = vals.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    if (valid.length === 0) return 10;
    return clampAttr(valid.reduce((a, b) => a + b, 0) / valid.length);
  };
  return [
    avg(ph.pac, ph.acc),                    // 0: velocidad
    avg(ph.sta, m.wor),                     // 1: resistencia
    avg(ph.str, ph.jum, ph.nat),            // 2: fuerza
    avg(t.fir, t.tec, ph.bal),              // 3: control
    avg(t.pas, t.cro, t.lon),               // 4: pase
    avg(t.dri, ph.agi, m.fla),              // 5: regate
    avg(t.fin, t.hea, t.lon),               // 6: disparo
    avg(m.ant, m.det, m.cnt),               // 7: anticipacion
    avg(m.dec, m.cmp, m.tea),               // 8: decision
    avg(m.pos, t.mar, t.tck, m.otb),        // 9: posicionamiento
    avg(m.vis, m.otb),                      // 10: vision
    avg(m.agg, m.bra, h.imp),               // 11: agresividad
    clampAttr(h.ver, 10),                   // 12: polivalencia
  ];
}

function derivePhysicalSize(pos: string, id: number, attrs13: number[]): [number, number] {
  const hSeed = (id * 2654435761) >>> 0;
  const str = attrs13[2] || 10;
  const baseH = pos === "P" ? 188 : pos === "DFC" ? 185 : pos === "DC" ? 181 : 176;
  const height = Math.max(165, Math.min(202, baseH + ((hSeed % 11) - 5) + Math.round((str - 10) / 4)));
  const weight = Math.max(62, Math.min(96, Math.round(height - 104 + ((hSeed >> 4) % 7) - 3 + (str - 10) * 0.35)));
  return [height, weight];
}

function translateCountryName(country: ZOXCountry | undefined, fallbackEs: string): string {
  if (!country) return fallbackEs;
  return COUNTRY_NAMES_ES[country.code] || EN_COUNTRY_NAME_ES[country.name] || country.name || fallbackEs;
}

function resolveLeagueId(cc: string, leagueSlug: string, league: ZOXLeague, usedGeneratedIds: Set<string>): string | null {
  if (leagueSlug.endsWith("-lower-leagues") || leagueSlug === "brazilian-state-leagues") return null;
  if (PROJECT_LEAGUE_MAP[leagueSlug]) return PROJECT_LEAGUE_MAP[leagueSlug];

  const ccUpper = cc.toUpperCase();
  const base = `L_${ccUpper}_${league.tier}`;
  if (!usedGeneratedIds.has(base)) {
    usedGeneratedIds.add(base);
    return base;
  }
  const suffix = leagueSlug
    .replace(/^(russian|italian|greek|spanish|portuguese|uruguayan|brazilian|argentine)-/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();
  let candidate = `${base}_${suffix || "G"}`;
  let n = 2;
  while (usedGeneratedIds.has(candidate)) {
    candidate = `${base}_${n++}`;
  }
  usedGeneratedIds.add(candidate);
  return candidate;
}

async function main() {
  if (!existsSync(DATA_DIR)) {
    console.log("Cloning ZOXEXIVO/open-football-database into /tmp/open-football-database...");
    execSync("git clone --depth 1 https://github.com/ZOXEXIVO/open-football-database.git /tmp/open-football-database", {
      stdio: "inherit",
    });
  }

  const countries = readJSON<ZOXCountry[]>(join(DATA_DIR, "countries.json"));
  if (!countries) {
    console.error("Failed to read countries.json");
    process.exit(1);
  }
  const countryById = new Map<number, ZOXCountry>(countries.map(c => [c.id, c]));

  // Load Wikidata staff snapshot & managers database
  const wikiSnapshot = readJSON<{
    coachesByTm?: Record<string, { name: string; birth?: string; nat?: string }>;
    presidentsByTm?: Record<string, { name: string }>;
    directorsByTm?: Record<string, { name: string; birth?: string; nat?: string }>;
  }>(join(__dirname, "wikidataStaffSnapshot.json")) || {};

  const wikiManagersJson = readJSON<{ managers?: Array<{ name: string; surname: string; nationality?: string; birthDate?: string }> }>(
    join(ROOT_DIR, "src", "data", "wikidataManagers.json")
  );
  const managersByNat = new Map<string, Array<{ name: string; age: number; nat: string }>>();
  const allRealManagersPool: Array<{ name: string; age: number; nat: string }> = [];
  for (const m of wikiManagersJson?.managers || []) {
    const fullName = `${m.name} ${m.surname}`.trim();
    if (!fullName) continue;
    const age = m.birthDate ? calculateAge(m.birthDate) : 46;
    if (age < 28 || age > 67) continue;
    const nat = EN_COUNTRY_NAME_ES[m.nationality || ""] || m.nationality || "Internacional";
    const rec = { name: fullName, age, nat };
    allRealManagersPool.push(rec);
    const list = managersByNat.get(nat) || [];
    list.push(rec);
    managersByNat.set(nat, list);
  }

  // Track used names per club / globally for real coaches so managers aren't cloned onto every team
  const assignedRealHeadCoachNames = new Set<string>(
    Object.values(wikiSnapshot.coachesByTm || {}).map(c => c.name.toLowerCase())
  );

  const leaguesMap = new Map<string, any>();
  const clubs: any[] = [];
  const playersByLeague = new Map<string, any[]>();
  const usedGeneratedLeagueIds = new Set<string>(Object.values(PROJECT_LEAGUE_MAP));
  const usedNamesByCountry = new Map<string, { first: string[]; last: string[] }>();

  // Helper to load local authentic names per country
  const getCountryNames = (cc: string) => {
    if (usedNamesByCountry.has(cc)) return usedNamesByCountry.get(cc)!;
    const data = readJSON<{ first_names?: string[]; last_names?: string[] }>(join(DATA_DIR, cc, "names.json"));
    const pool = {
      first: data?.first_names?.length ? data.first_names : ["Carlos", "Lucas", "Mateo", "Nicolás", "Martín", "Javier", "David", "Daniel"],
      last: data?.last_names?.length ? data.last_names : ["González", "Rodríguez", "Martínez", "López", "García", "Fernández", "Silva", "Pereira"],
    };
    usedNamesByCountry.set(cc, pool);
    return pool;
  };

  // Walk all country directories
  const countryDirs = listDirectories(DATA_DIR).sort();
  const clubMetaForStaff: Array<{ id: string; countryEs: string; cc: string; rep: number; tmId?: string }> = [];
  const natPool: string[] = [];
  const natIdxMap = new Map<string, number>();
  const getNatIdx = (nat: string): number => {
    const existing = natIdxMap.get(nat);
    if (existing !== undefined) return existing;
    const idx = natPool.length;
    natPool.push(nat);
    natIdxMap.set(nat, idx);
    return idx;
  };

  const posPool: string[] = [];
  const posIdxMap = new Map<string, number>();
  const getPosIdx = (pos: string): number => {
    const existing = posIdxMap.get(pos);
    if (existing !== undefined) return existing;
    const idx = posPool.length;
    posPool.push(pos);
    posIdxMap.set(pos, idx);
    return idx;
  };

  let totalPlayersCount = 0;

  for (const cc of countryDirs) {
    const countryPath = join(DATA_DIR, cc);
    const leagueDirs = listDirectories(countryPath).filter(d => d !== "free_agents");
    const countryEs = COUNTRY_NAMES_ES[cc] || cc.toUpperCase();

    for (const lgDir of leagueDirs) {
      const leaguePath = join(countryPath, lgDir);
      const leagueData = readJSON<ZOXLeague>(join(leaguePath, "league.json"));
      if (!leagueData) continue;

      const projectLeagueId = resolveLeagueId(cc, lgDir, leagueData, usedGeneratedLeagueIds);
      if (!projectLeagueId) continue;

      const clubDirs = listDirectories(leaguePath);
      if (clubDirs.length === 0) continue;

      if (!leaguesMap.has(projectLeagueId)) {
        leaguesMap.set(projectLeagueId, {
          id: projectLeagueId,
          name: MERGED_LEAGUE_NAMES[projectLeagueId] || leagueData.name,
          country: countryEs,
          tier: leagueData.tier,
          reputation: leagueData.reputation,
          promotion_spots: leagueData.promotion_spots || 0,
          relegation_spots: leagueData.relegation_spots || 0,
          playable: leagueData.tier <= 2,
        });
      }

      if (!playersByLeague.has(projectLeagueId)) {
        playersByLeague.set(projectLeagueId, []);
      }
      const leaguePlayers = playersByLeague.get(projectLeagueId)!;

      for (const clDir of clubDirs) {
        const clubPath = join(leaguePath, clDir);
        const clubData = readJSON<ZOXClub>(join(clubPath, "club.json"));
        if (!clubData) continue;

        const mainTeam = clubData.teams?.find(t => t.team_type === "Main") || clubData.teams?.[0];
        if (!mainTeam) continue;

        const clubIdStr = String(mainTeam.id);
        const tmId = clubData.ids?.["transfermarkt.com"] ? String(clubData.ids["transfermarkt.com"]) : undefined;
        const [primaryColor, secondaryColor] = ensureDistinctColors(
          clubData.colors?.background,
          clubData.colors?.foreground,
          clubData.name
        );

        const presName = tmId ? wikiSnapshot.presidentsByTm?.[tmId]?.name : undefined;
        const rawRep = mainTeam.reputation?.home || leagueData.reputation || 4000;
        const tierFactor = leagueData.tier === 1 ? 0.68 : leagueData.tier === 2 ? 0.75 : 0.78;
        const rep = Math.max(Math.max(1500, Math.round((leagueData.reputation || 3500) * tierFactor)), Math.min(9900, Math.round(rawRep)));

        clubs.push({
          id: mainTeam.id,
          name: clubData.name,
          shortName: generateShortName(clubData.name),
          primaryColor,
          secondaryColor,
          reputation: rep,
          country: countryEs,
          countryCode: cc,
          competitionId: projectLeagueId,
          average_attendance: clubData.average_attendance || 0,
          facilities: clubData.facilities || { training: "Adequate", youth: "Adequate", academy: "Adequate", recruitment: "Adequate" },
          ...(presName ? { presidentName: presName } : {}),
        });

        clubMetaForStaff.push({ id: clubIdStr, countryEs, cc, rep, tmId });

        const teamTypeById = new Map<number, string>();
        for (const t of clubData.teams || []) {
          teamTypeById.set(t.id, t.team_type);
        }

        const playersPath = join(clubPath, "players");
        const playerFiles = listJSONFiles(playersPath);
        const clubRawTuples: any[] = [];
        for (const pf of playerFiles) {
          const pl = readJSON<ZOXPlayer>(join(playersPath, pf));
          if (!pl || !pl.id) continue;

          const teamType = teamTypeById.get(pl.club_id);
          if (!teamType) continue;

          const birthDate = pl.birth_date || "2000-01-01";
          const age = calculateAge(birthDate);
          const rawCa = Math.round(pl.current_ability || 95);
          if (age >= 45 || (age >= 41 && rawCa <= 55)) continue;

          let squadIdx = 0; // 0 = SENIOR, 1 = RESERVE, 2 = U20
          if (teamType === "U18" || teamType === "U20" || age <= 19) squadIdx = 2;
          else if (teamType === "Reserve" || (age >= 20 && age <= 22 && (pl.current_ability || 0) < 115)) squadIdx = 1;

          const positions = mapPositions(pl.positions || []);
          const posIndices = positions.map(getPosIdx);
          const attrs13 = mapPlayerAttrs13(pl.attrs);
          const [height, weight] = derivePhysicalSize(positions[0], pl.id, attrs13);
          const natCountry = countryById.get(pl.country_id);
          const natEs = translateCountryName(natCountry, countryEs);
          const natIdx = getNatIdx(natEs);

          const person = pl.attrs?.person || {};
          const person4 = [
            clampAttr(person.loy, 12),
            clampAttr(person.amb, 11),
            clampAttr(person.pro, 11),
            clampAttr(person.ada, 11),
          ];

          const ca = Math.max(40, Math.min(200, rawCa));
          const pa = Math.max(ca, Math.min(200, Math.round((pl.potential_ability && pl.potential_ability > 0) ? pl.potential_ability : ca + 15)));
          const contractExpiry = pl.contract?.expiration || "2027-06-30";

          const historyEntries = (pl.history || []).map(h => [
            h.s,
            String(h.c),
            h.p || 0,
            h.g || 0,
            h.a || 0,
            h.cs || 0,
          ]);

          clubRawTuples.push([
            String(pl.id),
            (pl.first_name || "").trim(),
            (pl.last_name || "").trim(),
            birthDate,
            natIdx,
            clubIdStr,
            squadIdx,
            posIndices,
            attrs13,
            ca,
            pa,
            0,
            0,
            contractExpiry,
            height,
            weight,
            person4,
            historyEntries,
          ]);
        }

        const gkIdx = getPosIdx("P");
        const isGkTuple = (t: any) => (t[7] || []).includes(gkIdx);
        const seniors = clubRawTuples.filter(t => t[6] === 0).sort((a, b) => b[9] - a[9]);
        const reserves = clubRawTuples.filter(t => t[6] === 1).sort((a, b) => b[9] - a[9]);
        const u20s = clubRawTuples.filter(t => t[6] === 2).sort((a, b) => (b[10] || b[9]) - (a[10] || a[9]));
        if (seniors.length > 26) {
          const kept: any[] = [...seniors.filter(isGkTuple).slice(0, 3)];
          for (const t of seniors.filter(x => !isGkTuple(x))) {
            if (kept.length < 26) kept.push(t);
          }
          const keptSet = new Set(kept);
          for (const t of seniors) {
            if (keptSet.has(t)) continue;
            const age = calculateAge(t[3]);
            if (age <= 20 && u20s.length < 22) { t[6] = 2; u20s.push(t); }
            else if (reserves.length < 22) { t[6] = 1; reserves.push(t); }
          }
          seniors.length = 0;
          seniors.push(...kept);
        }
        if (reserves.length > 22) reserves.length = 22;
        if (u20s.length > 22) u20s.length = 22;

        const econFactor = ({
          Argentina: 0.55, Brasil: 0.85, Uruguay: 0.5, Chile: 0.6, Colombia: 0.55, México: 0.85,
          Inglaterra: 2.0, España: 1.75, Italia: 1.65, Alemania: 1.85, Francia: 1.7, Portugal: 1.05,
          "Países Bajos": 1.35, Bélgica: 1.15, Turquía: 0.95, Rusia: 0.9, USA: 1.8, Japón: 1.25, "Arabia Saudita": 1.75,
        } as Record<string, number>)[countryEs] ?? 0.75;
        const lgRep = leagueData.reputation || 3500;
        const calcVal = (caVal: number, paVal: number, ageVal: number) => {
          const normCa = Math.max(0, Math.min(1, (caVal - 50) / 150));
          const baseVal = 25000 + Math.pow(normCa, 4.2) * 195000000;
          const potB = ageVal <= 23 && paVal > caVal ? 1 + Math.min(0.65, ((paVal - caVal) / 45) * Math.max(0.15, (24 - ageVal) * 0.08)) : 1;
          const ageF = ageVal <= 27 ? 1 : ageVal <= 30 ? 0.9 - (ageVal - 27) * 0.06 : Math.max(0.16, 0.72 - (ageVal - 30) * 0.11);
          const mkt = Math.max(0.1, Math.min(1.22, (lgRep / 9500) * 0.48 + (rep / 9500) * 0.24 + econFactor * 0.22));
          const raw = baseVal * potB * ageF * mkt;
          return Math.max(15000, raw >= 1000000 ? Math.round(raw / 50000) * 50000 : raw >= 100000 ? Math.round(raw / 5000) * 5000 : Math.round(raw / 1000) * 1000);
        };

        for (const t of [...seniors, ...reserves, ...u20s]) {
          const ageVal = calculateAge(t[3]);
          const val = calcVal(t[9], t[10], ageVal);
          const primeVal = calcVal(t[9], t[9], Math.min(27, Math.max(22, ageVal)));
          const rate = t[9] >= 155 ? 0.0088 : t[9] >= 130 ? 0.0095 : 0.0105;
          const sqMult = t[6] === 2 ? 0.42 : t[6] === 1 ? 0.65 : 1.0;
          const minM = t[6] === 2 ? Math.max(350, Math.round(econFactor * 550)) : t[6] === 1 ? Math.max(550, Math.round(econFactor * 900)) : Math.max(850, Math.round(econFactor * 1500));
          const rawSal = Math.max(minM, primeVal * rate * sqMult);
          const step = rawSal >= 100000 ? 1000 : rawSal >= 10000 ? 250 : 50;
          t[11] = val;
          t[12] = Math.round(rawSal / step) * step;
          leaguePlayers.push(t);
          totalPlayersCount++;
        }
      }
    }
  }

  // Generate compact real/authentic staff for every club
  const staffNats: string[] = [];
  const staffNatIdx = new Map<string, number>();
  const getStaffNatIdx = (nat: string) => {
    const clean = EN_COUNTRY_NAME_ES[nat] || nat || "Argentina";
    const ex = staffNatIdx.get(clean);
    if (ex !== undefined) return ex;
    const idx = staffNats.length;
    staffNats.push(clean);
    staffNatIdx.set(clean, idx);
    return idx;
  };

  const natCursors = new Map<string, number>();
  const takeRealCoachForNat = (countryEs: string, seed: number): { name: string; age: number; nat: string } | null => {
    const pool = managersByNat.get(countryEs);
    if (!pool || pool.length === 0) return null;
    let cursor = natCursors.get(countryEs) || 0;
    for (let tries = 0; tries < Math.min(pool.length, 15); tries++) {
      const candidate = pool[(cursor + tries) % pool.length];
      if (!assignedRealHeadCoachNames.has(candidate.name.toLowerCase())) {
        assignedRealHeadCoachNames.add(candidate.name.toLowerCase());
        natCursors.set(countryEs, (cursor + tries + 1) % pool.length);
        return candidate;
      }
    }
    return pool[seed % pool.length];
  };

  const staffRows: any[] = [];
  const usedInClub = new Set<string>();

  for (const club of clubMetaForStaff) {
    usedInClub.clear();
    const names = getCountryNames(club.cc);
    const seedBase = hashStr(club.id);
    const baseSkill = Math.max(8, Math.min(18, Math.round(club.rep / 550)));

    for (let rIdx = 0; rIdx < STAFF_ROLES.length; rIdx++) {
      const role = STAFF_ROLES[rIdx];
      let personName = "";
      let age = 38 + ((seedBase + rIdx * 7) % 24);
      let nat = club.countryEs;

      if (role === "HEAD_COACH") {
        const wikiCoach = club.tmId ? wikiSnapshot.coachesByTm?.[club.tmId] : undefined;
        if (wikiCoach?.name) {
          personName = wikiCoach.name;
          if (wikiCoach.birth) age = Math.max(30, Math.min(72, calculateAge(wikiCoach.birth) + 12));
          if (wikiCoach.nat) nat = EN_COUNTRY_NAME_ES[wikiCoach.nat] || wikiCoach.nat;
        } else {
          const poolCoach = takeRealCoachForNat(club.countryEs, seedBase);
          if (poolCoach) {
            personName = poolCoach.name;
            age = poolCoach.age;
            nat = poolCoach.nat;
          }
        }
      } else if (role === "SPORTING_DIRECTOR") {
        const wikiDir = club.tmId ? wikiSnapshot.directorsByTm?.[club.tmId] : undefined;
        if (wikiDir?.name) {
          personName = wikiDir.name;
          if (wikiDir.birth) age = Math.max(35, Math.min(68, calculateAge(wikiDir.birth) + 12));
          if (wikiDir.nat) nat = EN_COUNTRY_NAME_ES[wikiDir.nat] || wikiDir.nat;
        }
      }

      if (!personName) {
        // Use real manager pool for tactical roles when same-country available, else authentic local name from open-football-database names.json
        const isTactical = role === "ASSISTANT_MANAGER" || role === "RESERVE_MANAGER" || role === "YOUTH_MANAGER";
        if (isTactical && (seedBase + rIdx) % 3 === 0) {
          const poolCoach = takeRealCoachForNat(club.countryEs, seedBase + rIdx * 13);
          if (poolCoach && !usedInClub.has(poolCoach.name)) {
            personName = poolCoach.name;
            age = poolCoach.age;
            nat = poolCoach.nat;
          }
        }
      }

      if (!personName) {
        let attempt = 0;
        do {
          const h = hashStr(`${club.id}:${role}:${attempt}`);
          const fn = names.first[h % names.first.length];
          const ln = names.last[(h >>> 8) % names.last.length];
          personName = `${fn} ${ln}`;
          attempt++;
        } while (usedInClub.has(personName) && attempt < 8);
      }

      usedInClub.add(personName);
      const isTactical = role === "HEAD_COACH" || role === "ASSISTANT_MANAGER" || role === "RESERVE_MANAGER" || role === "YOUTH_MANAGER";
      const styleIdx = isTactical ? ((seedBase + rIdx) % COACH_STYLES.length) : -1;
      const formIdx = isTactical ? ((seedBase + rIdx * 3) % COACH_FORMATIONS.length) : -1;
      const rep = Math.max(35, Math.min(96, Math.round(club.rep / 100) + (role === "HEAD_COACH" ? 5 : -8)));

      // Tuple: [0:clubId, 1:roleIdx, 2:name, 3:age, 4:natIdx, 5:rep, 6:styleIdx, 7:formIdx, 8:baseSkill]
      staffRows.push([
        club.id,
        rIdx,
        personName,
        Math.max(28, Math.min(64, age)),
        getStaffNatIdx(nat),
        rep,
        styleIdx,
        formIdx,
        baseSkill,
      ]);
    }
  }

  // Add real free-agent coaches from wikidataManagers.json so Staff Market starts populated with real names
  let freeCount = 0;
  for (const m of allRealManagersPool) {
    if (freeCount >= 80) break;
    if (assignedRealHeadCoachNames.has(m.name.toLowerCase())) continue;
    assignedRealHeadCoachNames.add(m.name.toLowerCase());
    const rIdx = freeCount % STAFF_ROLES.length === 0 ? 1 : freeCount % STAFF_ROLES.length; // hireable roles
    const isTactical = rIdx === 1 || rIdx === 4 || rIdx === 5;
    const h = hashStr(m.name);
    staffRows.push([
      "FREE_AGENT",
      rIdx,
      m.name,
      Math.max(30, Math.min(62, m.age)),
      getStaffNatIdx(m.nat),
      55 + (h % 25),
      isTactical ? (h % COACH_STYLES.length) : -1,
      isTactical ? ((h >>> 4) % COACH_FORMATIONS.length) : -1,
      11 + (h % 6),
    ]);
    freeCount++;
  }

  // Write output files
  mkdirSync(OUTPUT_DIR, { recursive: true });
  if (existsSync(PLAYERS_DIR)) {
    rmSync(PLAYERS_DIR, { recursive: true, force: true });
  }
  mkdirSync(PLAYERS_DIR, { recursive: true });

  const leaguesList = Array.from(leaguesMap.values()).sort((a, b) => b.reputation - a.reputation);
  writeFileSync(join(OUTPUT_DIR, "convertedLeagues.json"), JSON.stringify(leaguesList));
  writeFileSync(join(OUTPUT_DIR, "convertedClubs.json"), JSON.stringify(clubs));
  writeFileSync(
    join(OUTPUT_DIR, "convertedStaff.json"),
    JSON.stringify({
      roles: STAFF_ROLES,
      styles: COACH_STYLES,
      formations: COACH_FORMATIONS,
      nats: staffNats,
      rows: staffRows,
    })
  );

  // Order manifest leagues with Tier 1 & major leagues first for priority streaming
  const orderedLeagueIds = leaguesList.map(l => l.id).filter(id => (playersByLeague.get(id)?.length || 0) > 0);
  writeFileSync(
    join(PLAYERS_DIR, "manifest.json"),
    JSON.stringify({
      nats: natPool,
      pos: posPool,
      squads: ["SENIOR", "RESERVE", "U20"],
      leagues: orderedLeagueIds,
      totalPlayers: totalPlayersCount,
    })
  );

  for (const lgId of orderedLeagueIds) {
    const chunk = playersByLeague.get(lgId) || [];
    writeFileSync(join(PLAYERS_DIR, `${lgId}.json`), JSON.stringify(chunk));
  }

  // Remove old monolithic 19MB convertedPlayers.json if present so dist stays fast and lean
  const legacyPlayersPath = join(OUTPUT_DIR, "convertedPlayers.json");
  if (existsSync(legacyPlayersPath)) {
    rmSync(legacyPlayersPath, { force: true });
  }

  console.log(`\nDone! Generated optimized database:`);
  console.log(`  - Leagues: ${leaguesList.length}`);
  console.log(`  - Clubs: ${clubs.length}`);
  console.log(`  - Players: ${totalPlayersCount} across ${orderedLeagueIds.length} league chunks`);
  console.log(`  - Staff records: ${staffRows.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});