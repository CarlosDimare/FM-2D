
import { Player, Club, Competition, Position, PlayerStats, PlayerMatchStats, Fixture, TableEntry, Tactic, Staff, StaffRole, SquadType, TransferOffer, InboxMessage, MessageCategory, MediaNews, NotificationPriority, NewsSection, TacticalStyle, TacticSettings, MatchSettings, ScoutingReport, InteractionLogEntry, ReputationalBuff, Chronicle, ManagerProfile, ManagerOrigin, ClubHistoryEntry, RelationshipState, RealManager, ManagerNetworkEntry, PlayerPersonality, SeasonRecord, SeasonPage, SeasonPageType, ScoutingZone, PlayerHistoryEntry, PLAYER_PERSONALITY_LABELS, PLAYER_PERSONALITY_DESC, POSITION_FULL_NAMES } from "../types";
import { generateUUID, randomInt, weightedRandom } from "./utils";
import { NATIONS, SCOUTING_ZONE_COSTS, SCOUTING_ZONE_LABELS } from "../constants";
import { TACTIC_PRESETS, NAMES_DB, REGEN_DB, STAFF_NAMES, POS_DEFINITIONS, ARG_PRIMERA, ARG_NACIONAL, ARG_PRIMERA_ZONA_B, CONT_CLUBS, CONT_CLUBS_TIER2, WORLD_BOSSES, BRA_SERIE_A, BRA_SERIE_B, ESP_LA_LIGA, ITA_SERIE_A, DEU_BUNDESLIGA, FRA_LIGUE_1, PRT_LIGA, NLD_EREDIVISIE, MEX_LIGA_MX, USA_MLS, JPN_J1, ENG_PREMIER, CHI_PRIMERA, COL_LIGA, URY_PRIMERA, ECU_LIGA_PRO, PRY_DIVISION, BOL_DIVISION, VEN_LIGA, PER_LIGA1, PRY_DIVISION_B, DEU_2_BUNDESLIGA, FRA_LIGUE_2, ITA_SERIE_B, ENG_CHAMPIONSHIP, JPN_J2, KOR_K_LEAGUE, CHN_SUPER_LEAGUE, AUS_A_LEAGUE, EGY_PREMIER, MAR_BOTOLA, RSA_PSL, RealClubDef } from "../data/static";
import { REAL_PLAYERS_DB, RealPlayerDef } from "../data/realPlayers";
import { SLOT_CONFIG } from "./engine";
import { sendTransferNotification, sendInboxNotification, sendInjuryNotification } from "./notifications";
import { generatePlayer, generateRandomPlayer, getPlayerTag } from "./playerGenerator";
import { useGameStore } from "../stores/gameStore";
import { loadConvertedClubs, loadConvertedLeagues, loadConvertedStaff, loadPlayersManifest, loadLeaguePlayerChunk, PlayersManifest, PlayerTuple } from "../data/convertedDataLoader";
import { buildClubPoolIndex, ClubPoolIndex, populatePlayerPastHistory, populateStaffPastHistory } from "./careerHistoryGenerator";
import {
  calibrateClubReputation,
  calibrateClubInitialFinances,
  computeClubFinancialProjection,
  computeRealisticPlayerSalary,
  computeRealisticPlayerValue,
  computeRealisticStaffSalary,
  getCountryEconomy,
} from "./economyCalibration";

// ─── Perfil táctico de los entrenadores generados ───────────────────────────
const COACH_STYLES = ['CONTROL', 'ATTACK', 'DEFENSE', 'COUNTER', 'BALANCED'] as const;
const COACH_FORMATIONS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2', '4-1-4-1', '4-4-1-1', '4-2-2-2'];
const COACH_PLAYING_STYLE: Record<string, string> = {
  CONTROL: 'Posesión y paciencia',
  ATTACK: 'Fútbol ofensivo y vertical',
  DEFENSE: 'Bloque bajo y orden defensivo',
  COUNTER: 'Contraataque veloz',
  BALANCED: 'Estilo equilibrado',
};

export class WorldManager {
  players: Player[] = [];
  clubs: Club[] = [];
  competitions: Competition[] = [];
  staff: Staff[] = [];
  tactics: Tactic[] = TACTIC_PRESETS.map(t => ({ ...t, settings: { ...t.settings } }));
  activeTacticId: string = TACTIC_PRESETS[0]?.id || '';
  offers: TransferOffer[] = [];
  inbox: InboxMessage[] = [];
  mediaNews: MediaNews[] = [];
  matchSettings: MatchSettings = {
     pauseAtHalftime: true,
     speedMultiplier: 1
  };
  scoutingReports: ScoutingReport[] = [];
  interactionLog: InteractionLogEntry[] = [];
  activeReputationalBuffs: ReputationalBuff[] = [];
  relationshipWeb: Record<string, Record<string, { trust: number; respect: number; tension: number }>> = {};
  nationalTeamManager: any = null;
  chronicles: Chronicle[] = [];
  managerProfile: ManagerProfile | null = null;
  hallOfFame: import('../types').HallOfFameEntry[] = [];
  /** Libro de temporadas: archivo histórico consultable, un registro por temporada completada. */
  seasonHistory: SeasonRecord[] = [];
  /** Diario de la temporada en curso: hojas que se archivan al final en el SeasonRecord. */
  currentSeasonPages: SeasonPage[] = [];

  // Caching for performance
  private clubByIdCache: Map<string, Club> = new Map();
  /** Índice persistente clubId → jugadores (reconstruido solo cuando algo muta) */
  private playersByClubIndex: Map<string, Player[]> | null = null;
  private playerByIdIndex: Map<string, Player> | null = null;
  private playersIndexDirty = true;
  private indexedPlayersCount = 0;
  /** Índice persistente clubId → staff (O(1) en lugar de filter lineal) */
  private staffByClubIndex: Map<string, Staff[]> | null = null;
  private staffByIdIndex: Map<string, Staff> | null = null;
  private staffIndexDirty = true;
  private indexedStaffCount = 0;
  private lastRetirementSweepTime = 0;
  private clubPoolIndexCache: ClubPoolIndex | null = null;

  // Estado de inicialización progresiva y carga por chunks de liga
  clubsReady = false;
  isReady = false;
  clubsReadyPromise: Promise<void> = Promise.resolve();
  readyPromise: Promise<void> = Promise.resolve();
  private resolveClubsReady: (() => void) | null = null;
  private resolveReady: (() => void) | null = null;
  private loadGeneration = 0;
  private playersManifest: PlayersManifest | null = null;
  private loadedPlayerLeagues = new Set<string>();
  private loadingLeaguePromises = new Map<string, Promise<void>>();
  private seenPlayerIds = new Set<string>();
  private staticClubIds = new Set<string>();
  private calibratedClubIds = new Set<string>();
  private realPlayersByShortCache: Map<string, RealPlayerDef[]> | null = null;

  constructor() { this.initWorld(); }

   private yieldToMainThread(): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, 0));
   }

   cancelInitialLoad() {
      this.loadGeneration++;
      this.clubsReady = true;
      this.isReady = true;
      this.clubByIdCache.clear();
      this.playersIndexDirty = true;
      this.staffIndexDirty = true;
      this.loadingLeaguePromises.clear();
      for (const comp of this.competitions) {
        if (comp.type === 'LEAGUE') this.loadedPlayerLeagues.add(comp.id);
      }
      if (this.resolveClubsReady) { this.resolveClubsReady(); this.resolveClubsReady = null; }
      if (this.resolveReady) { this.resolveReady(); this.resolveReady = null; }
   }

   initWorld() {
      this.loadGeneration++;
      const gen = this.loadGeneration;
      this.clubsReady = false;
      this.isReady = false;
      this.clubsReadyPromise = new Promise<void>(resolve => { this.resolveClubsReady = resolve; });
      this.readyPromise = new Promise<void>(resolve => { this.resolveReady = resolve; });

      this.seasonHistory = [];
      this.currentSeasonPages = [];
      this.clubs = [];
      this.players = [];
      this.staff = [];
      this.clubByIdCache.clear();
      this.playersByClubIndex = null;
      this.playerByIdIndex = null;
      this.playersIndexDirty = true;
      this.indexedPlayersCount = 0;
      this.staffByClubIndex = null;
      this.staffByIdIndex = null;
      this.staffIndexDirty = true;
      this.indexedStaffCount = 0;
      this.clubPoolIndexCache = null;
      this.playersManifest = null;
      this.loadedPlayerLeagues.clear();
      this.loadingLeaguePromises.clear();
      this.seenPlayerIds.clear();
      this.staticClubIds.clear();
      this.calibratedClubIds.clear();

      // Base competitions (only W_CLUB)
      this.competitions = [
        { id: "W_CLUB", name: "Mundial de Clubes", country: "Global", type: 'GLOBAL', tier: 1, continent: "Global", confederation: "FIFA", defaultPrizePool: 5000000 },
      ];

      // Load leagues, clubs, staff & manifest immediately (~80ms), then hydrate player chunks lazily/cooperatively
      this.loadConvertedData(gen).catch(err => {
        console.error('Failed to load converted data:', err);
        if (gen === this.loadGeneration) {
          this.clubsReady = true;
          this.isReady = true;
          if (this.resolveClubsReady) { this.resolveClubsReady(); this.resolveClubsReady = null; }
          if (this.resolveReady) { this.resolveReady(); this.resolveReady = null; }
        }
      });
    }

   private static readonly POS_MAP: Record<string, Position> = {
      'P': Position.GK, 'DFC': Position.DC, 'LIB': Position.SW,
      'LD': Position.DR, 'LI': Position.DL, 'CD': Position.DMR, 'CI': Position.DML,
      'MCD': Position.DM, 'MC': Position.MC, 'MD': Position.MR, 'MI': Position.ML,
      'MPC': Position.AM, 'ED': Position.AMR, 'EI': Position.AML,
      'DC': Position.ST, 'WD': Position.STR, 'WI': Position.STL
   };

   private static readonly COUNTRY_ECONOMY: Record<string, number> = {
      'Argentina': 0.65, 'Brasil': 0.85, 'Uruguay': 0.6, 'Chile': 0.7, 'Colombia': 0.65,
      'Inglaterra': 2.0, 'España': 1.8, 'Italia': 1.7, 'Alemania': 1.9, 'Francia': 1.8,
      'Portugal': 1.2, 'Países Bajos': 1.5, 'Bélgica': 1.3, 'Turquía': 1.0, 'Rusia': 0.9,
      'Croacia': 0.75, 'Grecia': 0.7, 'Austria': 1.5, 'Suiza': 1.6, 'Dinamarca': 1.3,
      'Suecia': 1.1, 'Noruega': 1.2, 'Polonia': 0.8, 'Ucrania': 0.6,
      'USA': 2.1, 'Estados Unidos': 2.1, 'México': 0.75, 'Japón': 1.5, 'China': 1.3,
      'Arabia Saudita': 1.8, 'Emiratos Árabes Unidos': 1.6, 'Egipto': 0.7, 'Marruecos': 0.65,
      'Sudáfrica': 0.8, 'Corea del Sur': 1.3, 'Australia': 1.2,
   };

   private static facilityScore(label: unknown, fallback: number): number {
      if (typeof label === 'number' && Number.isFinite(label)) return Math.max(4, Math.min(20, Math.round(label)));
      switch (label) {
         case 'StateOfTheArt':
         case 'Superb':
         case 'Excellent': return 18;
         case 'Great': return 15;
         case 'Good': return 13;
         case 'Adequate':
         case 'Average': return 10;
         case 'Fair':
         case 'BelowAverage': return 8;
         case 'Basic':
         case 'Poor': return 6;
         default: return Math.max(4, Math.min(20, fallback));
      }
   }

   private static ageFromBirthDate(birthStr: string): number {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthStr || '');
      if (!m) return 24;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      let age = 2026 - y;
      if (mo > 11 || (mo === 11 && d > 26)) age -= 1;
      return Math.max(15, Math.min(45, age));
   }

   // ─── Load from open-football-database converted data (Phase 1 instant + Phase 2 chunked) ───
   async loadConvertedData(gen: number = this.loadGeneration) {
      const [CONVERTED_CLUBS, CONVERTED_LEAGUES, CONVERTED_STAFF, MANIFEST, ntModule] = await Promise.all([
        loadConvertedClubs(),
        loadConvertedLeagues(),
        loadConvertedStaff(),
        loadPlayersManifest(),
        import('./nationalTeamManager'),
      ]);
      if (gen !== this.loadGeneration) return;

      this.playersManifest = MANIFEST;

      const crossYearCountries = new Set([
        'Inglaterra', 'España', 'Italia', 'Alemania', 'Francia', 'Portugal', 'Países Bajos', 'Bélgica',
        'Turquía', 'Grecia', 'Escocia', 'Austria', 'Suiza', 'Dinamarca', 'Polonia', 'Rusia', 'Ucrania',
        'República Checa', 'Croacia', 'Serbia', 'Rumania', 'Hungría', 'Bulgaria', 'Eslovaquia', 'Eslovenia',
        'Israel', 'Chipre', 'Azerbaiyán', 'Arabia Saudita', 'Emiratos Árabes Unidos', 'Irán', 'Egipto',
        'Marruecos', 'Sudáfrica', 'México', 'Australia'
      ]);

      // ── FASE 1 (~60-90ms): Ligas, clubes con colores/presidentes reales y staff real ──
      for (const lg of CONVERTED_LEAGUES) {
         const continent = this.getContinentForCountry(lg.country);
         const confederation = this.getConfederationForContinent(continent);
         const isCrossYear = crossYearCountries.has(lg.country);
         const repScaled = Math.max(12, Math.min(95, Math.round((lg.reputation || 3000) / 100)));
         this.competitions.push({
            id: lg.id,
            name: lg.name,
            country: lg.country,
            type: 'LEAGUE',
            tier: lg.tier,
            continent,
            confederation,
            defaultPrizePool: this.calculatePrizePool(lg.reputation, lg.tier),
            squadRegistrationLimit: 25,
            u21Requirement: 3,
            seasonStartMonth: isCrossYear ? 7 : 0,
            seasonEndMonth: isCrossYear ? 4 : 11,
            dynamicReputation: repScaled,
         });
      }

      // 2. Add continental + global competitions + missing static leagues (KOR, ECU, BOL only)
      const staticClubs = this.addContinentalCompetitions(true);
      for (const sc of staticClubs) {
         this.staticClubIds.add(sc.id);
      }

      // Ensure base league reputations are calibrated cleanly BEFORE club calibration
      const compById = new Map<string, Competition>();
      for (const comp of this.competitions) {
         if (comp.type === 'LEAGUE') {
            comp.dynamicReputation = this.getBaseLeagueRep(comp);
            comp.marketMultiplier = 0.5 + (comp.dynamicReputation / 100) * 1.5;
         }
         compById.set(comp.id, comp);
      }

      // 3. Load all converted clubs preserving real hex primary/secondary colors and president names
      for (const c of CONVERTED_CLUBS) {
         const clubId = String(c.id);
         const comp = compById.get(c.competitionId);
         const leagueRep = (comp?.dynamicReputation ? comp.dynamicReputation * 100 : 3500);
         const rep = calibrateClubReputation(c.reputation || 3000, leagueRep, comp?.tier || 1);
         const avgAtt = Number(c.average_attendance || 0);
         const fallbackCap = rep >= 8000 ? 50000 : rep >= 7000 ? 30000 : rep >= 6000 ? 20000 : rep >= 5000 ? 12000 : 8000;
         const econ = getCountryEconomy(c.country);
         const repScale = Math.pow(Math.max(1500, rep) / 5000, 3.35) * (0.42 + econ * 0.58);
         const estTransfer = Math.max(80_000, Math.min(180_000_000, Math.round((3_200_000 * repScale * (comp?.tier === 1 ? 1.15 : comp?.tier === 2 ? 0.65 : 0.45)) / 5_000) * 5_000));
         const estWage = Math.max(50_000, Math.round((760_000 * repScale * 0.85) / 1_000) * 1_000);
         const club: Club = {
            id: clubId,
            name: c.name,
            shortName: c.shortName,
            leagueId: c.competitionId,
            country: c.country,
            primaryColor: this.hexToTailwind(c.primaryColor),
            secondaryColor: this.hexToTailwind(c.secondaryColor, c.primaryColor === '#ffffff' ? '#0f172a' : '#f8fafc'),
            presidentName: c.presidentName || undefined,
            finances: {
               balance: Math.max(250_000, Math.round((estTransfer * 1.45) / 5_000) * 5_000),
               transferBudget: estTransfer,
               wageBudget: estWage,
               monthlyIncome: Math.round(760_000 * repScale * 0.22),
               monthlyExpenses: 0,
               scoutingBudget: Math.max(15_000, Math.round((estTransfer * 0.08) / 1_000) * 1_000),
               monthlyHistory: [],
            },
            reputation: rep,
            stadium: `${c.name} Stadium`,
            stadiumCapacity: avgAtt > 0 ? Math.max(4000, Math.round(avgAtt * 1.25)) : fallbackCap,
            honours: this.generateRandomHonours(),
            trainingFacilities: WorldManager.facilityScore(c.facilities?.training, Math.floor(rep / 500) + randomInt(-1, 2)),
            youthFacilities: WorldManager.facilityScore(c.facilities?.youth, Math.floor(rep / 550) + randomInt(-1, 2)),
            youthRecruitment: WorldManager.facilityScore(c.facilities?.recruitment, Math.floor(rep / 600) + randomInt(-1, 2)),
            scoutingRegion: (["ARG", "BRA", "URU", "CHL", "COL", "ECU", "PAR", "PER", "URY", "VEN", "BOL", "GLO"] as const)[randomInt(0, 11)],
            boardConfidence: 65 + randomInt(0, 25),
            seasonObjective: rep > 5500 ? 'TOP_4' : rep > 3200 ? 'TOP_HALF' : 'AVOID_RELEGATION',
            shortlistedPlayerIds: [],
            transferFolderIds: [],
            u21MinutesThisSeason: 0,
            records: { biggestVictory: null, biggestDefeat: null, longestWinStreak: 0, currentWinStreak: 0, highestScoringMatch: null, bestPlayerSeason: null },
            teamCohesion: 40 + randomInt(0, 30),
         };
         this.clubs.push(club);
         this.clubByIdCache.set(club.id, club);
      }

      // 4. Hydrate O(1) indices + real converted staff (~19.5k records across all clubs + free agents)
      this.playersByClubIndex = new Map();
      this.playerByIdIndex = new Map();
      this.playersIndexDirty = false;
      this.indexedPlayersCount = 0;

      this.staffByClubIndex = new Map();
      this.staffByIdIndex = new Map();
      this.staffIndexDirty = false;
      this.indexedStaffCount = 0;

      const roles = CONVERTED_STAFF.roles as StaffRole[];
      const styles = CONVERTED_STAFF.styles as Staff['tacticalStyle'][];
      const formations = CONVERTED_STAFF.formations;
      const staffNats = CONVERTED_STAFF.nats;
      const personalities = ['LEADER', 'PASSIONATE', 'CALM', 'DISCIPLINARIAN', 'VISIONARY'];

      for (let i = 0; i < CONVERTED_STAFF.rows.length; i++) {
         const [rawClubId, roleIdx, name, age, natIdx, rep, styleIdx, formIdx, baseSkill] = CONVERTED_STAFF.rows[i];
         const isFree = !rawClubId || rawClubId === 'FREE_AGENT';
         const clubId = isFree ? '' : String(rawClubId);
         const club = clubId ? this.clubByIdCache.get(clubId) : undefined;
         if (clubId && !club) continue;

         const role: StaffRole = roles[roleIdx] || 'COACH';
         const nat = staffNats[natIdx] || club?.country || 'Argentina';
         const econ = club ? (WorldManager.COUNTRY_ECONOMY[club.country] || 0.85) : 1.0;
         const skill = Math.max(6, Math.min(20, baseSkill || 11));
         const clamp20 = (v: number) => Math.max(4, Math.min(20, v));
         const isPhysio = role === 'PHYSIO';
         const isFitness = role === 'FITNESS_COACH';
         const isScout = role === 'SCOUT';
         const isDirector = role === 'SPORTING_DIRECTOR';
         const isTreasurer = role === 'TREASURER';
         const style = styleIdx >= 0 ? styles[styleIdx] : undefined;
         const form = formIdx >= 0 ? formations[formIdx] : undefined;

         const s: Staff = {
            id: `st_${clubId || 'fa'}_${role}_${i}`,
            name,
            age,
            nationality: nat,
            role,
            clubId,
            attributes: {
               coaching: isDirector || isTreasurer ? clamp20(skill - 5) : clamp20(skill + (role === 'HEAD_COACH' || role === 'COACH' ? 2 : 0)),
               judgingAbility: isScout || isDirector ? clamp20(skill + 4) : clamp20(skill),
               judgingPotential: isScout || isDirector ? clamp20(skill + 4) : clamp20(skill - 1),
               tacticalKnowledge: isTreasurer || isPhysio ? clamp20(skill - 5) : clamp20(skill + (role === 'HEAD_COACH' || role === 'ASSISTANT_MANAGER' ? 2 : 0)),
               adaptability: clamp20(skill + ((i % 5) - 2)),
               medical: isPhysio ? clamp20(skill + 5) : 5,
               physiotherapy: isPhysio ? clamp20(skill + 5) : isFitness ? clamp20(skill + 1) : 5,
               motivation: clamp20(skill + ((i % 4) - 1)),
               manManagement: isDirector || isTreasurer ? clamp20(skill + 3) : clamp20(skill + 1),
            },
            salary: computeRealisticStaffSalary({
               skill,
               role,
               clubRep: club?.reputation || 3500,
               country: club?.country || nat,
            }),
            contractExpiry: new Date(2028, 5, 30),
            history: [],
            personality: personalities[i % personalities.length],
            morale: 72,
            reputation: rep || 50,
            relationships: {},
            pressReputation: 50,
            boardRelationship: isTreasurer ? 75 : 62,
            tacticalStyle: style,
            preferredFormation: form,
            playingStyle: style ? COACH_PLAYING_STYLE[style] : undefined,
            pressIntensity: role === 'HEAD_COACH' ? (['LOW', 'MEDIUM', 'HIGH'] as const)[i % 3] : undefined,
            possessionVsCounter: role === 'HEAD_COACH' ? (['POSSESSION', 'COUNTER', 'BALANCED'] as const)[i % 3] : undefined,
         };
         this.addStaffIndexed(s);
      }

      // Generate staff for the remaining static-only clubs (KOR, ECU, BOL)
      for (const sc of staticClubs) {
         this.generateStaffForClub(sc.id);
      }

      // Build O(1) club pool index once and populate deterministic past trajectories for all loaded staff
      const poolIndex = this.getClubPoolIndex();
      const baseYear = this.getBaseCareerYear();
      for (let i = 0; i < this.staff.length; i++) {
         const st = this.staff[i];
         const stClub = st.clubId ? this.clubByIdCache.get(st.clubId) : undefined;
         populateStaffPastHistory(st, stClub, poolIndex, baseYear);
      }

      this.nationalTeamManager = new ntModule.NationalTeamManager();
      this.clubsReady = true;
      if (this.resolveClubsReady) { this.resolveClubsReady(); this.resolveClubsReady = null; }

      // Ceder un frame antes de iniciar la hidratación cooperativa de chunks de jugadores
      await this.yieldToMainThread();
      if (gen !== this.loadGeneration) return;

      await this.hydratePlayersInBackground(gen);
   }

   private decodePlayerTuple(tuple: PlayerTuple, manifest: PlayersManifest): Player | null {
      const [id, firstName, lastName, birthDateStr, natIdx, clubIdRaw, squadIdx, posIndices, attrs13, ca, pa, value, salary, contractExpiry, height, weight, person4, historyEntries] = tuple;
      if (this.seenPlayerIds.has(id)) return null;
      const clubId = String(clubIdRaw);
      const club = this.clubByIdCache.get(clubId);
      if (!club) return null;

      const age = WorldManager.ageFromBirthDate(birthDateStr);
      // Descartar exjugadores/técnicos colados en datasets históricos (nacidos 1958-1981)
      if (age >= 45 || (age >= 41 && ca <= 55)) return null;

      this.seenPlayerIds.add(id);

      const posPool = manifest.pos;
      const mappedPositions: Position[] = [];
      for (let i = 0; i < posIndices.length; i++) {
         const code = posPool[posIndices[i]];
         const mapped = WorldManager.POS_MAP[code];
         if (mapped && !mappedPositions.includes(mapped)) mappedPositions.push(mapped);
      }
      if (mappedPositions.length === 0) mappedPositions.push(Position.MC);
      const primaryPos = mappedPositions[0];

      const [vel = 10, res = 10, fue = 10, ctrl = 10, pase = 10, reg = 10, disp = 10, ant = 10, dec = 10, pos = 10, vis = 10, agr = 10, pol = 10] = attrs13 || [];
      const [rawLoy = 12, rawAmb = 11, rawPro = 11] = person4 || [];
      const isDefaultPerson4 = !person4 || (rawLoy === 12 && rawAmb === 11 && rawPro === 11);
      const idHash = this.hashSeed(id);
      const loy = isDefaultPerson4 ? (5 + (idHash % 14)) : rawLoy;
      const amb = isDefaultPerson4 ? (6 + ((idHash >>> 4) % 13)) : rawAmb;
      const pro = isDefaultPerson4 ? (6 + ((idHash >>> 8) % 13)) : rawPro;
      const squad: SquadType = manifest.squads[squadIdx] || (age <= 19 ? 'U20' : age <= 22 && ca < 115 ? 'RESERVE' : 'SENIOR');
      const fullName = `${firstName} ${lastName}`.trim() || lastName || firstName || 'Jugador';
      const nationality = manifest.nats[natIdx] || club.country || 'Argentina';
      const leadership = Math.max(5, Math.min(20, Math.round((dec + vis) / 2)));
      const loyalty = Math.max(1, Math.min(20, loy));
      const personality = this.assignPlayerPersonality(leadership, loyalty, agr, Math.max(dec, pro), Math.max(vis, amb), {
        seedKey: id,
        ambition: amb,
        professionalism: pro,
        resistencia: res,
        anticipacion: ant,
        polivalencia: pol,
        age,
        ca,
        pa,
      });

      const r = Math.random();
      const transferStatus = r < 0.08
         ? (age < 22 && ca < 120 && pa > 140 ? 'LOANABLE' : age > 28 ? 'TRANSFERABLE' : 'NONE')
         : 'NONE';

      const history: PlayerHistoryEntry[] = [];
      const clubsPlayedForSet = new Set<string>([club.id]);

      if (historyEntries && Array.isArray(historyEntries) && historyEntries.length > 0) {
         for (let hi = 0; hi < historyEntries.length; hi++) {
            const [year, clubRef, apps, goals, assists, cleanSheets] = historyEntries[hi];
            let entryClubId = String(clubRef || club.id);
            if (!this.clubByIdCache.has(entryClubId)) {
               const found = Array.from(this.clubByIdCache.values()).find(c => c.name.toLowerCase() === entryClubId.toLowerCase());
               if (found) entryClubId = found.id;
            }
            if (entryClubId && entryClubId !== 'FREE_AGENT') clubsPlayedForSet.add(entryClubId);

            history.push({
               year: Number(year) || 2023,
               clubId: entryClubId,
               stats: {
                  appearances: Number(apps) || 0,
                  goals: Number(goals) || 0,
                  assists: Number(assists) || 0,
                  cleanSheets: Number(cleanSheets) || 0,
                  conceded: 0,
                  totalRating: (Number(apps) || 0) > 0 ? Number((6.5 + Math.min(1.5, ((Number(goals) || 0) * 0.3 + (Number(assists) || 0) * 0.2) / Math.max(1, Number(apps) || 1))).toFixed(2)) : 0,
               }
            });
         }
      }

      let totalApps = 0, totalGoals = 0, totalAssists = 0, totalCleanSheets = 0;
      for (const h of history) {
         totalApps += h.stats.appearances;
         totalGoals += h.stats.goals;
         totalAssists += h.stats.assists;
         totalCleanSheets += h.stats.cleanSheets;
      }

      const careerStats = {
         totalApps,
         totalGoals,
         totalAssists,
         totalCleanSheets,
         clubsPlayedFor: Array.from(clubsPlayedForSet),
      };

      const league = this.competitions.find(c => c.id === club.leagueId);
      const leagueRep = league?.dynamicReputation ? league.dynamicReputation * 100 : 3500;
      const realValue = value > 0
         ? value
         : computeRealisticPlayerValue({ ca, pa, age, clubRep: club.reputation, leagueRep, country: club.country });
      const realSalary = salary > 0
         ? salary
         : computeRealisticPlayerSalary({ ca, age, squad, clubRep: club.reputation, leagueRep, country: club.country });

      const player: Player = {
         id,
         name: fullName,
         firstName,
         lastName,
         age,
         nationality,
         clubId: club.id,
         squad,
         positions: mappedPositions,
         primaryPosition: primaryPos,
         stats: {
            internal: {
               velocidad: vel,
               resistencia: res,
               fuerza: fue,
               control: ctrl,
               pase: pase,
               regate: reg,
               disparo: disp,
               anticipacion: ant,
               decision: dec,
               posicionamiento: pos,
               vision: vis,
               agresividad: agr,
               polivalencia: pol,
            },
            visible: {
               fisico: Math.round((vel + res + fue) / 3),
               mental: Math.round((ant + dec + pos + vis) / 4),
               tecnica: Math.round((ctrl + pase + reg + disp) / 4),
               agresividad: agr,
               polivalencia: pol,
            },
         },
         currentAbility: ca,
         potentialAbility: pa,
         value: realValue,
         salary: realSalary,
         contractExpiry: new Date(contractExpiry || '2027-06-30'),
         fitness: 85 + randomInt(0, 15),
         morale: 60 + randomInt(0, 30),
         injury: null,
         developmentTrend: 'STABLE',
         history,
         relationships: {},
         secondaryPositions: [],
         isStarter: false,
         loyalty,
         negotiationAttempts: 0,
         isUnhappyWithContract: false,
         yellowCardsAccumulated: 0,
         injuryHistory: [],
         injuryProneness: randomInt(1, 15),
         isTransferListed: transferStatus === 'TRANSFERABLE',
         transferStatus,
         releaseClause: Math.round(realValue * 2.2),
         height: height || 178,
         weight: weight || 74,
         birthDate: new Date(birthDateStr || '2000-01-01'),
         reputation: ca * 45,
         formRatings: [],
         tacticalFamiliarity: 50,
         leadership,
         consistency: Math.max(5, Math.min(20, pro)),
         bigMatchTemperament: Math.max(5, Math.min(20, amb)),
         seasonStats: { appearances: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, totalRating: 0 },
         careerStats,
         statsByCompetition: {},
         personality,
      };

      if (history.length === 0) {
         populatePlayerPastHistory(player, club, this.getClubPoolIndex(), this.getBaseCareerYear());
      }
      return player;
   }

   private getBaseCareerYear(): number {
      const yr = useGameStore.getState().currentDate?.getFullYear?.();
      return yr && yr > 1990 ? yr : 2008;
   }

   private getClubPoolIndex(): ClubPoolIndex {
      if (!this.clubPoolIndexCache || this.clubPoolIndexCache.allByRep.length !== this.clubs.length) {
         this.clubPoolIndexCache = buildClubPoolIndex(this.clubs);
      }
      return this.clubPoolIndexCache;
   }

   ensurePlayerPastHistory(player: Player): void {
      if (!player) return;
      const club = player.clubId && player.clubId !== 'FREE_AGENT' ? this.getClub(player.clubId) : undefined;
      populatePlayerPastHistory(player, club, this.getClubPoolIndex(), this.getBaseCareerYear());
   }

   ensureStaffPastHistory(staff: Staff): void {
      if (!staff) return;
      const club = staff.clubId ? this.getClub(staff.clubId) : undefined;
      populateStaffPastHistory(staff, club, this.getClubPoolIndex(), this.getBaseCareerYear());
   }

   private ensureMinimumSeniorSquad(clubId: string, minSenior = 18) {
      const existing = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
      const needed = Math.max(0, minSenior - existing.length);
      if (needed === 0) return;

      const gkCount = existing.filter(p => p.positions.includes(Position.GK)).length;
      const roles: Array<'GK' | 'DEF' | 'DM' | 'MID' | 'ATT'> = [];
      for (let i = 0; i < needed; i++) {
         if (i === 0 && gkCount < 2) roles.push('GK');
         else if (i % 5 === 1) roles.push('DEF');
         else if (i % 5 === 2) roles.push('DM');
         else if (i % 5 === 3) roles.push('MID');
         else roles.push('ATT');
      }
      for (const roleType of roles) {
         const posPool: Position[] = roleType === 'GK' ? POS_DEFINITIONS.GK : roleType === 'DEF' ? POS_DEFINITIONS.DEF : roleType === 'DM' ? POS_DEFINITIONS.DM : roleType === 'MID' ? POS_DEFINITIONS.MID : POS_DEFINITIONS.ATT;
         const primaryPos = posPool[randomInt(0, posPool.length - 1)];
         const player = this.createRandomPlayer(clubId, primaryPos, 18, 35);
         player.squad = 'SENIOR';
         this.addPlayerIndexed(player);
      }
   }

   private injectStaticPlayersForClub(club: Club) {
      if (!this.realPlayersByShortCache) {
         const map = new Map<string, RealPlayerDef[]>();
         for (const rp of REAL_PLAYERS_DB) {
            let list = map.get(rp.clubShort);
            if (!list) { list = []; map.set(rp.clubShort, list); }
            list.push(rp);
         }
         this.realPlayersByShortCache = map;
      }
      const defs = this.realPlayersByShortCache.get(club.shortName);
      if (defs) {
         for (const def of defs) {
            const pl = this.createRealPlayer(club.id, def);
            if (!this.seenPlayerIds.has(pl.id)) {
               this.seenPlayerIds.add(pl.id);
               this.addPlayerIndexed(pl);
            }
         }
      }
   }

   async ensureLeaguePlayersLoaded(leagueId: string): Promise<void> {
      await this.clubsReadyPromise;
      if (this.loadedPlayerLeagues.has(leagueId)) return;

      const existing = this.loadingLeaguePromises.get(leagueId);
      if (existing) return existing;

      const genAtStart = this.loadGeneration;
      const promise = (async () => {
         try {
            const manifest = this.playersManifest;
            const hasChunk = Boolean(manifest?.leagues.includes(leagueId));
            if (hasChunk && manifest) {
               const tuples = await loadLeaguePlayerChunk(leagueId);
               if (genAtStart !== this.loadGeneration || this.loadedPlayerLeagues.has(leagueId)) return;
               for (let i = 0; i < tuples.length; i++) {
                  const player = this.decodePlayerTuple(tuples[i], manifest);
                  if (player) this.addPlayerIndexed(player);
               }
            }

            if (genAtStart !== this.loadGeneration || this.loadedPlayerLeagues.has(leagueId)) return;

            const leagueClubs = this.getClubsByLeague(leagueId);
            const leagueComp = this.competitions.find(c => c.id === leagueId);
            for (const club of leagueClubs) {
               if (this.staticClubIds.has(club.id)) {
                  this.injectStaticPlayersForClub(club);
               }
               this.ensureMinimumSeniorSquad(club.id, 18);
               if (!this.calibratedClubIds.has(club.id)) {
                  calibrateClubInitialFinances(club, this.getPlayersByClub(club.id), this.getStaffByClub(club.id), leagueComp);
                  this.calibratedClubIds.add(club.id);
               }
               this.updateClubMonthlyExpenses(club.id);
            }
            this.loadedPlayerLeagues.add(leagueId);
         } finally {
            this.loadingLeaguePromises.delete(leagueId);
         }
      })();

      this.loadingLeaguePromises.set(leagueId, promise);
      return promise;
   }

   isLeaguePlayersLoaded(leagueId: string): boolean {
      return this.loadedPlayerLeagues.has(leagueId);
   }

   ensureAllPlayersLoaded(): Promise<void> {
      return this.readyPromise;
   }

   private async hydratePlayersInBackground(gen: number) {
      const priorityLeagues = [
         'L_ARG_1', 'L_ENG_1', 'L_ESP_1', 'L_ITA_1', 'L_DEU_1', 'L_FRA_1', 'L_BRA_1',
         'L_PRT_1', 'L_NLD_1', 'L_MEX_1', 'L_USA_1', 'L_BEL_1', 'L_TUR_1', 'L_CHI_1',
         'L_COL_1', 'L_URY_1', 'L_SAU_1', 'L_JPN_1', 'L_ARG_2', 'L_BRA_2', 'L_ESP_2', 'L_ENG_2',
      ];
      const allLeagueIds = this.competitions.filter(c => c.type === 'LEAGUE').map(c => c.id);
      const prioritySet = new Set(priorityLeagues);
      const ordered = [
         ...priorityLeagues.filter(id => allLeagueIds.includes(id)),
         ...allLeagueIds.filter(id => !prioritySet.has(id)),
      ];

      const BATCH_SIZE = 6;
      for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
         if (gen !== this.loadGeneration) return;
         const batch = ordered.slice(i, i + BATCH_SIZE).filter(id => !this.loadedPlayerLeagues.has(id));
         if (batch.length > 0) {
            await Promise.all(batch.map(id => this.ensureLeaguePlayersLoaded(id)));
         }
         if (gen !== this.loadGeneration) return;
         await this.yieldToMainThread();
      }

      if (gen !== this.loadGeneration) return;

      this.nationalTeamManager.assignPlayersToNationalTeams(this.players, this.clubs);
      this.isReady = true;
      if (this.resolveReady) { this.resolveReady(); this.resolveReady = null; }

      import('../stores/worldStore')
         .then(mod => mod.notifyPlayers())
         .catch(() => {});

      console.log(`[WorldManager] Ready: ${this.clubs.length} clubs, ${this.players.length} players, ${this.staff.length} staff, ${this.competitions.length} competitions`);
   }

   private getContinentForCountry(country: string): string {
      const map: Record<string, string> = {
         'Argentina': 'América del Sur', 'Brasil': 'América del Sur', 'Uruguay': 'América del Sur',
         'Chile': 'América del Sur', 'Colombia': 'América del Sur', 'Paraguay': 'América del Sur',
         'Perú': 'América del Sur', 'Venezuela': 'América del Sur', 'Bolivia': 'América del Sur',
         'Ecuador': 'América del Sur',
         'Inglaterra': 'Europa', 'España': 'Europa', 'Italia': 'Europa', 'Alemania': 'Europa',
         'Francia': 'Europa', 'Portugal': 'Europa', 'Países Bajos': 'Europa', 'Bélgica': 'Europa',
         'Turquía': 'Europa', 'Rusia': 'Europa', 'Croacia': 'Europa', 'Grecia': 'Europa',
         'Austria': 'Europa', 'Suiza': 'Europa', 'Dinamarca': 'Europa', 'Suecia': 'Europa',
         'Noruega': 'Europa', 'Polonia': 'Europa', 'Ucrania': 'Europa', 'Escocia': 'Europa',
         'Gales': 'Europa', 'Irlanda': 'Europa', 'Irlanda del Norte': 'Europa',
         'República Checa': 'Europa', 'Rumania': 'Europa', 'Serbia': 'Europa', 'Hungría': 'Europa',
         'Bulgaria': 'Europa', 'Eslovaquia': 'Europa', 'Eslovenia': 'Europa', 'Bielorrusia': 'Europa',
         'Bosnia y Herzegovina': 'Europa', 'Albania': 'Europa', 'Macedonia del Norte': 'Europa',
         'Armenia': 'Europa', 'Azerbaiyán': 'Europa', 'Georgia': 'Europa', 'Chipre': 'Europa',
         'Finlandia': 'Europa', 'Islandia': 'Europa', 'Estonia': 'Europa', 'Letonia': 'Europa',
         'Lituania': 'Europa', 'Malta': 'Europa', 'Israel': 'Europa', 'Kazajistán': 'Europa',
         'USA': 'América del Norte', 'Estados Unidos': 'América del Norte', 'México': 'América del Norte',
         'Canadá': 'América del Norte', 'Costa Rica': 'América del Norte',
         'Japón': 'Asia', 'Arabia Saudita': 'Asia', 'Emiratos Árabes Unidos': 'Asia',
         'Irán': 'Asia', 'Indonesia': 'Asia', 'Uzbekistán': 'Asia', 'Corea del Sur': 'Asia', 'China': 'Asia',
         'Egipto': 'África', 'Marruecos': 'África', 'Sudáfrica': 'África', 'Argelia': 'África',
         'Nigeria': 'África', 'Ghana': 'África', 'Camerún': 'África', 'Kenia': 'África',
         'Costa de Marfil': 'África', 'Túnez': 'África', 'Senegal': 'África', 'Malí': 'África', 'Chad': 'África',
         'Australia': 'Oceanía', 'Nueva Zelanda': 'Oceanía', 'Fiyi': 'Oceanía',
      };
      return map[country] || 'Europa';
   }

   private getConfederationForContinent(continent: string): string {
      const map: Record<string, string> = {
         'América del Sur': 'CONMEBOL', 'Europa': 'UEFA', 'América del Norte': 'CONCACAF',
         'Asia': 'AFC', 'África': 'CAF', 'Oceanía': 'OFC', 'Global': 'FIFA',
      };
      return map[continent] || 'UEFA';
   }

   private calculatePrizePool(reputation: number, tier: number): number {
      if (tier === 1) return Math.max(1000000, reputation * 1500);
      return Math.max(500000, reputation * 800);
   }

   private hexToTailwind(hex: string | undefined, fallback = '#2b5d2c'): string {
      if (hex && /^#[0-9a-fA-F]{3,6}$/.test(hex.trim())) {
         const clean = hex.trim().toLowerCase();
         if (clean.length === 4) {
            return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
         }
         return clean;
      }
      return fallback;
   }

  private addContinentalCompetitions(deferHydration = false): Club[] {
      const createdStaticClubs: Club[] = [];
      const hasComp = (id: string) => this.competitions.some(c => c.id === id);

      // UEFA Champions League
      this.competitions.push(
         { id: 'UCL', name: 'UEFA Champions League', country: 'Europa', type: 'CONTINENTAL_ELITE', tier: 1, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 20000000, squadRegistrationLimit: 25, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'UEL', name: 'UEFA Europa League', country: 'Europa', type: 'CONTINENTAL_SMALL', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 8000000, squadRegistrationLimit: 25, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'UECL', name: 'UEFA Conference League', country: 'Europa', type: 'CONTINENTAL_SMALL', tier: 3, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 4000000, squadRegistrationLimit: 25, seasonStartMonth: 7, seasonEndMonth: 4 },
      );
      // FIFA World Cup
      this.competitions.push(
         { id: 'WC_Q', name: 'Clasificación Mundial', country: 'Global', type: 'GLOBAL', tier: 1, continent: 'Global', confederation: 'FIFA', defaultPrizePool: 0, seasonStartMonth: 0, seasonEndMonth: 11 },
      );

      // National team competitions
      this.competitions.push(
         { id: 'COPA', name: 'Copa América', country: 'América del Sur', type: 'CONTINENTAL_ELITE', tier: 1, continent: 'América del Sur', confederation: 'CONMEBOL', defaultPrizePool: 10000000, seasonStartMonth: 5, seasonEndMonth: 7 },
         { id: 'EURO', name: 'UEFA Euro', country: 'Europa', type: 'CONTINENTAL_ELITE', tier: 1, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 15000000, seasonStartMonth: 5, seasonEndMonth: 7 },
         { id: 'AFCON', name: 'Africa Cup of Nations', country: 'África', type: 'CONTINENTAL_ELITE', tier: 1, continent: 'África', confederation: 'CAF', defaultPrizePool: 5000000, seasonStartMonth: 0, seasonEndMonth: 1 },
         { id: 'FRIENDLY', name: 'Amistosos de Pretemporada', country: 'Global', type: 'FRIENDLY', tier: 0, continent: 'Global', confederation: 'FIFA', defaultPrizePool: 0 },
      );

      // Domestic cups & CONMEBOL continental cups
      this.competitions.push(
         { id: 'C_ARG', name: 'Copa Argentina', country: 'Argentina', type: 'CUP', tier: 1, continent: 'América del Sur', confederation: 'CONMEBOL', defaultPrizePool: 2000000, seasonStartMonth: 1, seasonEndMonth: 10 },
         { id: 'COPA_REY', name: 'Copa del Rey', country: 'España', type: 'CUP', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 3000000, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'FA_CUP', name: 'FA Cup', country: 'Inglaterra', type: 'CUP', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 3500000, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'EFL_CUP', name: 'Carabao Cup (EFL Cup)', country: 'Inglaterra', type: 'CUP', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 2200000, seasonStartMonth: 7, seasonEndMonth: 2 },
         { id: 'DFB_POKAL', name: 'DFB-Pokal', country: 'Alemania', type: 'CUP', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 2500000, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'COPA_ITALIA', name: 'Coppa Italia', country: 'Italia', type: 'CUP', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 2500000, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'COPA_FRANCE', name: 'Coupe de France', country: 'Francia', type: 'CUP', tier: 2, continent: 'Europa', confederation: 'UEFA', defaultPrizePool: 2000000, seasonStartMonth: 7, seasonEndMonth: 4 },
         { id: 'COPA_LIB', name: 'Copa Libertadores', country: 'Sudamérica', type: 'CONTINENTAL_ELITE', tier: 1, continent: 'América del Sur', confederation: 'CONMEBOL', defaultPrizePool: 8000000 },
         { id: 'COPA_SUD', name: 'Copa Sudamericana', country: 'Sudamérica', type: 'CONTINENTAL_SMALL', tier: 2, continent: 'América del Sur', confederation: 'CONMEBOL', defaultPrizePool: 3000000 },
      );

      // Only add static leagues that are NOT present in open-football-database (prevents any club/league duplication)
      if (!hasComp('L_KOR_1')) {
         this.competitions.push({ id: 'L_KOR_1', name: 'K League 1', country: 'Corea del Sur', type: 'LEAGUE', tier: 1, continent: 'Asia', confederation: 'AFC', defaultPrizePool: 1500000, seasonStartMonth: 1, seasonEndMonth: 10 });
         try { createdStaticClubs.push(...this.loadRealClubs(KOR_K_LEAGUE, 'L_KOR_1', deferHydration)); } catch (e) { console.warn('[WorldManager] Failed to load K League 1:', e); }
      }
      if (!hasComp('L_ECU_1')) {
         this.competitions.push({ id: 'L_ECU_1', name: 'LigaPro Serie A', country: 'Ecuador', type: 'LEAGUE', tier: 1, continent: 'América del Sur', confederation: 'CONMEBOL', defaultPrizePool: 1200000, seasonStartMonth: 1, seasonEndMonth: 11 });
         try { createdStaticClubs.push(...this.loadRealClubs(ECU_LIGA_PRO, 'L_ECU_1', deferHydration)); } catch (e) { console.warn('[WorldManager] Failed to load LigaPro Ecuador:', e); }
      }
      if (!hasComp('L_BOL_1')) {
         this.competitions.push({ id: 'L_BOL_1', name: 'División Profesional', country: 'Bolivia', type: 'LEAGUE', tier: 1, continent: 'América del Sur', confederation: 'CONMEBOL', defaultPrizePool: 900000, seasonStartMonth: 1, seasonEndMonth: 11 });
         try { createdStaticClubs.push(...this.loadRealClubs(BOL_DIVISION, 'L_BOL_1', deferHydration)); } catch (e) { console.warn('[WorldManager] Failed to load División Profesional Bolivia:', e); }
      }

      // Init team cohesion for static clubs
      this.clubs.forEach(c => { if (!c.teamCohesion) c.teamCohesion = 40 + randomInt(0, 30); });
      return createdStaticClubs;
    }

  loadRealClubs(definitions: RealClubDef[], leagueId: string, deferHydration = false): Club[] {
     const created: Club[] = [];
     definitions.forEach(def => {
        const club: Club = {
           id: generateUUID(),
           name: def.name,
           shortName: def.short,
           leagueId: leagueId,
           country: def.country,
           primaryColor: def.pCol,
           secondaryColor: def.sCol,
             finances: {
                balance: def.rep * 2500,
                transferBudget: def.rep * 800,
                wageBudget: def.rep * 80,
                monthlyIncome: def.rep * 200,
                monthlyExpenses: 0,
                scoutingBudget: def.rep * 100,
                monthlyHistory: []
             },
            reputation: def.rep,
            stadium: def.stadium,
            stadiumCapacity: def.rep >= 8000 ? 50000 : def.rep >= 7000 ? 30000 : def.rep >= 6000 ? 20000 : def.rep >= 5000 ? 12000 : 8000,
            honours: this.generateRandomHonours(),
             trainingFacilities: Math.min(20, Math.floor(def.rep / 500) + randomInt(-2, 2)),
             youthFacilities: Math.min(20, Math.floor(def.rep / 55) + randomInt(-3, 3)),
             youthRecruitment: Math.min(20, Math.floor(def.rep / 60) + randomInt(-2, 2)),
              scoutingRegion: (["ARG", "BRA", "URU", "CHL", "COL", "ECU", "PAR", "PER", "URY", "VEN", "BOL", "GLO"] as const)[randomInt(0, 11)],
             boardConfidence: 65 + randomInt(0, 25),
              seasonObjective: def.rep > 4000 ? 'TOP_4' : def.rep > 2500 ? 'TOP_HALF' : 'AVOID_RELEGATION',
               shortlistedPlayerIds: [],
               transferFolderIds: [],
               u21MinutesThisSeason: 0,
               records: { biggestVictory: null, biggestDefeat: null, longestWinStreak: 0, currentWinStreak: 0, highestScoringMatch: null, bestPlayerSeason: null },
              teamCohesion: 40 + randomInt(0, 30),
          };
        this.clubs.push(club);
        this.clubByIdCache.set(club.id, club);
        created.push(club);
        if (!deferHydration) {
          this.injectRealPlayers(club);
          this.generateSquadsForClub(club.id);
          this.generateStaffForClub(club.id);
          const comp = this.competitions.find(c => c.id === leagueId);
          calibrateClubInitialFinances(club, this.getPlayersByClub(club.id), this.getStaffByClub(club.id), comp);
          this.calibratedClubIds.add(club.id);
          this.updateClubMonthlyExpenses(club.id);
        }
     });
     return created;
  }

  /** Recompute team cohesion based on squad stability and player relationships */
  computeTeamCohesion(clubId: string) {
    const club = this.getClub(clubId);
    if (!club) return;
    const squad = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
    if (squad.length < 11) { club.teamCohesion = Math.max(10, (club.teamCohesion || 50) - 5); return; }
    // Factors: avg tactical familiarity, squad stability, cross-player relationships
    const avgFamiliarity = squad.reduce((s, p) => s + (p.tacticalFamiliarity || 50), 0) / squad.length;
    const stabilityBonus = Math.min(20, squad.filter(p => p.history && p.history.length > 0).length);
    club.teamCohesion = Math.max(0, Math.min(100, Math.round(avgFamiliarity * 0.6 + stabilityBonus * 0.4 + randomInt(-3, 3))));
  }

  getClub(id: string | number) {
    if (!id) return undefined;
    const sId = String(id);
    const cached = this.clubByIdCache.get(sId);
    if (cached) return cached;
    let club = this.clubs.find(c => String(c.id) === sId);
    if (!club) {
      club = this.clubs.find(c => c.name.toLowerCase() === sId.toLowerCase() || c.shortName.toLowerCase() === sId.toLowerCase());
    }
    if (club) this.clubByIdCache.set(sId, club);
    return club;
  }
  private ensurePlayerIndices() {
    if (!this.playersIndexDirty && this.indexedPlayersCount === this.players.length) return;
    const byClub = new Map<string, Player[]>();
    const byId = new Map<string, Player>();
    for (const p of this.players) {
      byId.set(p.id, p);
      const arr = byClub.get(p.clubId);
      if (arr) arr.push(p); else byClub.set(p.clubId, [p]);
    }
    this.playersByClubIndex = byClub;
    this.playerByIdIndex = byId;
    this.playersIndexDirty = false;
    this.indexedPlayersCount = this.players.length;
  }

  /** Invalidate player indices after bulk mutations (e.g. loading a save). */
  markPlayersDirty() { this.playersIndexDirty = true; }

  /** Invalidate staff indices after bulk mutations (e.g. loading a save). */
  markStaffDirty() { this.staffIndexDirty = true; }

  private addPlayerIndexed(player: Player) {
    this.players.push(player);
    if (!this.playersIndexDirty && this.playersByClubIndex && this.playerByIdIndex && this.indexedPlayersCount === this.players.length - 1) {
      this.playerByIdIndex.set(player.id, player);
      let bucket = this.playersByClubIndex.get(player.clubId);
      if (!bucket) {
        bucket = [];
        this.playersByClubIndex.set(player.clubId, bucket);
      }
      bucket.push(player);
      this.indexedPlayersCount++;
    } else {
      this.playersIndexDirty = true;
    }
  }

  private ensureStaffIndices() {
    if (!this.staffIndexDirty && this.indexedStaffCount === this.staff.length) return;
    const byClub = new Map<string, Staff[]>();
    const byId = new Map<string, Staff>();
    for (const s of this.staff) {
      byId.set(s.id, s);
      const arr = byClub.get(s.clubId);
      if (arr) arr.push(s); else byClub.set(s.clubId, [s]);
    }
    this.staffByClubIndex = byClub;
    this.staffByIdIndex = byId;
    this.staffIndexDirty = false;
    this.indexedStaffCount = this.staff.length;
  }

  private addStaffIndexed(staffMember: Staff) {
    this.staff.push(staffMember);
    if (!this.staffIndexDirty && this.staffByClubIndex && this.staffByIdIndex && this.indexedStaffCount === this.staff.length - 1) {
      this.staffByIdIndex.set(staffMember.id, staffMember);
      let bucket = this.staffByClubIndex.get(staffMember.clubId);
      if (!bucket) {
        bucket = [];
        this.staffByClubIndex.set(staffMember.clubId, bucket);
      }
      bucket.push(staffMember);
      this.indexedStaffCount++;
    } else {
      this.staffIndexDirty = true;
    }
  }

  getPlayer(id: string) {
    this.ensurePlayerIndices();
    return this.playerByIdIndex!.get(id);
  }
  /** Devuelve la misma instancia del array (bucket del índice): los callers NO deben mutarlo in-place. */
  getPlayersByClub(clubId: string) {
    this.ensurePlayerIndices();
    return this.playersByClubIndex!.get(clubId) || [];
  }
  /** Pre-fetch squads for multiple clubs at once — reduces O(n×m) to O(m) for fixture loops */
  preFetchSquads(clubIds: string[]): Map<string, Player[]> {
    const map = new Map<string, Player[]>();
    const uniqueIds = [...new Set(clubIds)];
    uniqueIds.forEach(id => map.set(id, this.getPlayersByClub(id)));
    return map;
  }
  getStaffByClub(clubId: string) {
    this.ensureStaffIndices();
    return this.staffByClubIndex!.get(clubId) || [];
  }
  getStaff(id: string) {
    this.ensureStaffIndices();
    return this.staffByIdIndex!.get(id);
  }
  getManagerNetwork(userClubId?: string): ManagerNetworkEntry[] {
    return this.staff
      .filter(s => s.role === 'HEAD_COACH' && s.clubId && s.clubId !== userClubId)
      .map(manager => {
        const club = this.getClub(manager.clubId);
        const relationship = this.getRelationship('COACH', manager.id);
        return {
          managerId: manager.id,
          managerName: manager.name,
          clubId: manager.clubId,
          clubName: club?.name || 'Club desconocido',
          country: club?.country || manager.nationality,
          reputation: manager.reputation || 50,
          tacticalStyle: manager.tacticalStyle,
          relationship: { ...relationship },
        };
      })
      .sort((a, b) => b.reputation - a.reputation);
  }
  getLeagues() { return this.competitions.filter(c => c.type === 'LEAGUE'); }
  getTactics() { return this.tactics; }
  getActiveTactic(): Tactic | undefined {
    return this.tactics.find(t => t.id === this.activeTacticId) || this.tactics[0];
  }
  setActiveTactic(id: string) {
    if (this.tactics.some(t => t.id === id)) {
      this.activeTacticId = id;
    }
  }

  private invalidateClubCache(clubId: string) {
    this.clubByIdCache.delete(clubId);
    // Un jugador o miembro del staff cambió de club → reconstruir índices de forma perezosa
    this.playersIndexDirty = true;
    this.staffIndexDirty = true;
  }

   getPlayersByNationalTeam(teamId: string): Player[] {
      if (!this.nationalTeamManager) return [];
      const team = this.nationalTeamManager.nationalTeams.find((t: any) => t.id === teamId);
      if (!team) return [];
      return team.playerIds.map((pid: string) => this.getPlayer(pid)).filter(Boolean);
   }

   ensureRelationship(personA: string, personB: string) {
     if (!this.relationshipWeb[personA]) this.relationshipWeb[personA] = {};
     if (!this.relationshipWeb[personB]) this.relationshipWeb[personB] = {};
     if (!this.relationshipWeb[personA][personB]) this.relationshipWeb[personA][personB] = { trust: 50, respect: 50, tension: 0 };
     if (!this.relationshipWeb[personB][personA]) this.relationshipWeb[personB][personA] = { trust: 50, respect: 50, tension: 0 };
   }

   adjustRelationship(personA: string, personB: string, trust = 0, respect = 0, tension = 0) {
     this.ensureRelationship(personA, personB);
     const rel = this.relationshipWeb[personA][personB];
     rel.trust = Math.max(0, Math.min(100, rel.trust + trust));
     rel.respect = Math.max(0, Math.min(100, rel.respect + respect));
     rel.tension = Math.max(0, Math.min(100, rel.tension + tension));
   }

   getRelationship(personA: string, personB: string) {
     this.ensureRelationship(personA, personB);
     return this.relationshipWeb[personA][personB];
   }

   recordInteraction(entry: InteractionLogEntry) {
     this.interactionLog.push(entry);
     if (this.interactionLog.length > 300) this.interactionLog.shift();
   }

   addReputationalBuff(source: string, type: string, value: number, days = 30, date = new Date()) {
     this.activeReputationalBuffs.push({ id: generateUUID(), source, type, value, expiresAt: new Date(date.getTime() + days * 24 * 60 * 60 * 1000) });
   }

   getActiveBuffsFor(entityId: string) {
     const now = new Date();
     return this.activeReputationalBuffs.filter(b => b.source === entityId && b.expiresAt >= now);
   }

   decayRelationships() {
     Object.keys(this.relationshipWeb).forEach(a => {
       Object.keys(this.relationshipWeb[a]).forEach(b => {
         const rel = this.relationshipWeb[a][b];
         rel.trust = Math.max(0, rel.trust - 0.1);
         rel.respect = Math.max(0, rel.respect - 0.05);
         rel.tension = Math.max(0, rel.tension - 0.15);
       });
     });
   }

  updateClubMonthlyExpenses(clubId: string) {
    const club = this.getClub(clubId);
    if (!club) return;
    const players = this.getPlayersByClub(clubId);
    const staff = this.getStaffByClub(clubId);
    const proj = computeClubFinancialProjection(club, players, staff, club.finances.monthlyIncome);
    club.finances.monthlyExpenses = proj.totalMonthlyExpenses;
  }

  generateRandomHonours() {
    const honours = [];
    const possible = ["Liga Profesional", "Copa Argentina", "Supercopa", "Copa Libertadores", "Copa Sudamericana"];
    const count = randomInt(0, 5);
    for (let i = 0; i < count; i++) {
      honours.push({ name: possible[randomInt(0, possible.length - 1)], year: randomInt(1970, 2007) });
    }
    return honours.sort((a,b) => b.year - a.year);
  }

  injectRealPlayers(club: Club) {
     const dbPlayers = REAL_PLAYERS_DB.filter(p => p.clubShort === club.shortName);
     dbPlayers.forEach(def => {
        const player = this.createRealPlayer(club.id, def);
        this.players.push(player);
     });
  }

  createRealPlayer(clubId: string, def: RealPlayerDef): Player {
     const posMap: Record<string, Position> = {
        'GK': Position.GK, 'DC': Position.DC, 'DL': Position.DL, 'DR': Position.DR,
        'DM': Position.DM, 'MC': Position.MC, 'ML': Position.ML, 'MR': Position.MR,
        'AMC': Position.AM, 'AML': Position.AML, 'AMR': Position.AMR, 'ST': Position.ST,
        'WD': Position.STR, 'WI': Position.STL, 'P': Position.GK, 'DFC': Position.DC,
        'LD': Position.DR, 'LI': Position.DL
     };
     
     const primaryPos = posMap[def.position] || Position.MC;
     const age = def.age;
     const nationality = def.nationality || "Argentina";
     const qualityFactor = Math.max(0.5, Math.min(1.5, def.ca / 150));
     const player = generatePlayer(clubId, primaryPos, nationality, def.name, age, { qualityFactor, minAge: age, maxAge: age });
     player.photo = def.photo;
     player.currentAbility = def.ca;
     player.potentialAbility = def.pa;
     player.reputation = def.ca * 45;
     player.value = Math.round(def.ca * def.ca * 2500);
     player.salary = Math.round(def.ca * 2500 / 10) * 10;      player.developmentTrend = 'STABLE';
      player.personality = this.assignPlayerPersonality(
        player.leadership,
        player.loyalty,
        player.stats.internal.agresividad,
        player.stats.internal.decision,
        player.stats.internal.vision,
        {
          seedKey: player.id || def.name,
          resistencia: player.stats.internal.resistencia,
          anticipacion: player.stats.internal.anticipacion,
          polivalencia: player.stats.internal.polivalencia,
          age: player.age,
          ca: player.currentAbility,
          pa: player.potentialAbility,
        }
      );
      populatePlayerPastHistory(player, this.getClub(clubId), this.getClubPoolIndex(), this.getBaseCareerYear());
      return player;
   }

   generateSquadsForClub(clubId: string) {
    const squads: SquadType[] = ['SENIOR', 'RESERVE', 'U20'];
    squads.forEach(squadType => {
      const size = squadType === 'SENIOR' ? 24 : squadType === 'RESERVE' ? 20 : 18;
      const existing = this.getPlayersByClub(clubId).filter(p => p.squad === squadType);
      const needed = Math.max(0, size - existing.length);
      if (needed === 0) return;

      const squadStructure = [
          ...Array(Math.floor(needed*0.1)).fill('GK'), ...Array(Math.floor(needed*0.3)).fill('DEF'), 
          ...Array(Math.floor(needed*0.2)).fill('DM'), ...Array(Math.floor(needed*0.2)).fill('MID'), 
          ...Array(Math.floor(needed*0.2)).fill('ATT')
      ];
      
      squadStructure.forEach((roleType) => {
        let posPool: Position[] = roleType === 'GK' ? POS_DEFINITIONS.GK : roleType === 'DEF' ? POS_DEFINITIONS.DEF : roleType === 'DM' ? POS_DEFINITIONS.DM : roleType === 'MID' ? POS_DEFINITIONS.MID : POS_DEFINITIONS.ATT;
        const primaryPos = posPool[randomInt(0, posPool.length - 1)];
        let ageRange = squadType === 'U20' ? [15, 19] : squadType === 'RESERVE' ? [17, 25] : [18, 36];
        const player = this.createRandomPlayer(clubId, primaryPos, ageRange[0], ageRange[1]);
        player.squad = squadType;
        this.addPlayerIndexed(player);
      });
    });
  }

  ensureDeepSquads(leagueId: string) {
    const clubs = this.getClubsByLeague(leagueId);
    clubs.forEach(club => {
      this.generateSquadsForClub(club.id);
      this.invalidateClubCache(club.id);
    });
  }

  generateStaffForClub(clubId: string) {
    const roles: StaffRole[] = ['HEAD_COACH', 'ASSISTANT_MANAGER', 'PHYSIO', 'FITNESS_COACH', 'RESERVE_MANAGER', 'YOUTH_MANAGER', 'SCOUT', 'SPORTING_DIRECTOR', 'TREASURER'];
    const club = this.getClub(clubId);

    roles.forEach(role => {
      const isTacticalStaff = ['HEAD_COACH', 'ASSISTANT_MANAGER', 'RESERVE_MANAGER', 'YOUTH_MANAGER'].includes(role);
      const coachStyle = isTacticalStaff ? COACH_STYLES[randomInt(0, COACH_STYLES.length - 1)] : undefined;
      const coachFormation = isTacticalStaff ? COACH_FORMATIONS[randomInt(0, COACH_FORMATIONS.length - 1)] : undefined;
      const coaching = role === 'SPORTING_DIRECTOR' || role === 'TREASURER' ? weightedRandom(4, 10) : weightedRandom(8, 20);
      const judgingAbility = role === 'SCOUT' || role === 'SPORTING_DIRECTOR' || role === 'TREASURER' ? weightedRandom(12, 20) : weightedRandom(8, 20);
      const tacticalKnowledge = role === 'TREASURER' ? weightedRandom(4, 10) : weightedRandom(10, 20);
      const manManagement = role === 'SPORTING_DIRECTOR' || role === 'TREASURER' ? weightedRandom(12, 20) : weightedRandom(8, 20);
      const skill = Math.round((coaching + judgingAbility + tacticalKnowledge + manManagement) / 4);
      const s: Staff = {
        id: generateUUID(), name: `${STAFF_NAMES.names[randomInt(0, STAFF_NAMES.names.length-1)]} ${STAFF_NAMES.surnames[randomInt(0, STAFF_NAMES.surnames.length-1)]}`,
        age: randomInt(35, 65), nationality: club?.country || "Argentina", role: role, clubId: clubId,
        attributes: {
          coaching,
          judgingAbility,
          judgingPotential: role === 'SCOUT' || role === 'SPORTING_DIRECTOR' ? weightedRandom(12, 20) : weightedRandom(8, 20),
          tacticalKnowledge,
          adaptability: weightedRandom(5, 20),
          medical: role === 'PHYSIO' ? 18 : 5,
          physiotherapy: role === 'PHYSIO' ? 18 : 5,
          motivation: weightedRandom(8, 20),
          manManagement,
        },
        salary: computeRealisticStaffSalary({ skill, role, clubRep: club?.reputation || 3500, country: club?.country || 'Argentina' }),
        contractExpiry: new Date(2028, 5, 30), history: [],
        personality: ['LEADER', 'PASSIONATE', 'CALM', 'DISCIPLINARIAN', 'VISIONARY'][randomInt(0, 4)],
        morale: 70,
        reputation: 50,
        relationships: {},
        pressReputation: 50,
        boardRelationship: role === 'TREASURER' ? 75 : 60,
        tacticalStyle: coachStyle,
        preferredFormation: coachFormation,
        playingStyle: coachStyle ? COACH_PLAYING_STYLE[coachStyle] : undefined,
        pressIntensity: role === 'HEAD_COACH' ? (['LOW', 'MEDIUM', 'HIGH'] as const)[randomInt(0, 2)] : undefined,
        possessionVsCounter: role === 'HEAD_COACH' ? (['POSSESSION', 'COUNTER', 'BALANCED'] as const)[randomInt(0, 2)] : undefined,
      };
      populateStaffPastHistory(s, club, this.getClubPoolIndex(), this.getBaseCareerYear());
      this.addStaffIndexed(s);
    });
  }

  ensureClubTreasurer(clubId: string): Staff | null {
    const existing = this.getStaffByClub(clubId).find(s => s.role === 'TREASURER');
    if (existing) return existing;
    const club = this.getClub(clubId);
    if (!club) return null;
    const judgingAbility = weightedRandom(13, 19);
    const manManagement = weightedRandom(13, 19);
    const skill = Math.round((judgingAbility + manManagement) / 2);
    const s: Staff = {
      id: generateUUID(),
      name: `${STAFF_NAMES.names[randomInt(0, STAFF_NAMES.names.length - 1)]} ${STAFF_NAMES.surnames[randomInt(0, STAFF_NAMES.surnames.length - 1)]}`,
      age: randomInt(38, 62),
      nationality: club.country || 'Argentina',
      role: 'TREASURER',
      clubId,
      attributes: {
        coaching: 5,
        judgingAbility,
        judgingPotential: weightedRandom(10, 16),
        tacticalKnowledge: 6,
        adaptability: weightedRandom(10, 18),
        medical: 4,
        physiotherapy: 4,
        motivation: weightedRandom(10, 16),
        manManagement,
      },
      salary: computeRealisticStaffSalary({ skill, role: 'TREASURER', clubRep: club.reputation, country: club.country }),
      contractExpiry: new Date(2028, 5, 30),
      history: [],
      personality: 'CALM',
      morale: 75,
      reputation: 55,
      relationships: {},
      pressReputation: 50,
      boardRelationship: 78,
      biography: 'Encargado de las finanzas, presupuestos, control salarial y proyecciones económicas del club.',
    };
    populateStaffPastHistory(s, club, this.getClubPoolIndex(), this.getBaseCareerYear());
    this.addStaffIndexed(s);
    this.invalidateClubCache(clubId);
    return s;
  }

  createRandomPlayer(clubId: string, primaryPos: Position, minAge = 16, maxAge = 36, baseYear = 2008, squadType: SquadType = 'SENIOR'): Player {
    const club = this.getClub(clubId);
    let nat = club ? (Math.random() < 0.9 ? club.country : NATIONS[randomInt(0, NATIONS.length - 1)]) : "Argentina";
    const normalizeKey = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let firstName = "", lastName = "";
    const regenData = REGEN_DB[normalizeKey(nat)];
    if (regenData) {
        firstName = regenData.nombres[randomInt(0, regenData.nombres.length - 1)];
        lastName = regenData.apellidos[randomInt(0, regenData.apellidos.length - 1)];
    } else {
        firstName = NAMES_DB.firstNames[randomInt(0, NAMES_DB.firstNames.length - 1)];
        lastName = NAMES_DB.lastNames[randomInt(0, NAMES_DB.lastNames.length - 1)];
    }
    const age = randomInt(minAge, maxAge);
    const rep = club ? club.reputation : 3500;
    const comp = club ? this.competitions.find(c => c.id === club.leagueId) : undefined;
    const leagueRep = comp?.dynamicReputation ? comp.dynamicReputation * 100 : rep;
    const repNorm = Math.max(0.05, Math.min(1.0, (rep - 2000) / 8000));
    const baseClubCA = 60 + Math.pow(repNorm, 1.5) * 112;
    const rawCa = baseClubCA + randomInt(-18, 12);
    const ageScale = maxAge <= 19 ? 0.72 : 1;
    const ca = Math.max(38, Math.min(195, Math.round(rawCa * ageScale)));
    const pa = Math.min(200, ca + randomInt(0, age <= 21 ? 55 : 25));
    const qualityFactor = Math.max(0.32, Math.min(1.45, ca / 150));
    const player = generatePlayer(clubId, primaryPos, nat, `${firstName} ${lastName}`, age, { qualityFactor });
    player.squad = squadType;
    player.currentAbility = ca;
    player.potentialAbility = pa;
    player.reputation = ca * 42;
    player.value = computeRealisticPlayerValue({ ca, pa, age, clubRep: rep, leagueRep, country: club?.country || nat });
    player.salary = computeRealisticPlayerSalary({ ca, age, squad: squadType, clubRep: rep, leagueRep, country: club?.country || nat });
    player.releaseClause = Math.round(player.value * 2.2);
    player.agent = age >= 22 && Math.random() < 0.15 ? { name: `Agente ${lastName}`, commission: Math.round(5 + Math.random() * 10) } : undefined;
    player.personality = this.assignPlayerPersonality(
      player.leadership,
      player.loyalty,
      player.stats.internal.agresividad,
      player.stats.internal.decision,
      player.stats.internal.vision,
      {
        seedKey: player.id,
        resistencia: player.stats.internal.resistencia,
        anticipacion: player.stats.internal.anticipacion,
        polivalencia: player.stats.internal.polivalencia,
        age: player.age,
        ca: player.currentAbility,
        pa: player.potentialAbility,
      }
    );
    populatePlayerPastHistory(player, club, this.getClubPoolIndex(), baseYear || this.getBaseCareerYear());
    return player;
  }
  /** Versión de fixtures: se incrementa cada vez que cambian resultados (invalida tablas cacheadas). */
  private fixturesVersion = 0;
  private leagueTableCache = new Map<string, { version: number; table: TableEntry[] }>();

  /**
   * Señaliza que los resultados de partidos cambiaron (invalida la caché de tablas).
   * INVARIANTE: TODA mutación de resultados (f.played/scores) DEBE llamar a este método,
   * o las tablas de posiciones quedarán obsoletas hasta el próximo avance.
   */
  bumpFixturesVersion() { this.fixturesVersion++; }

  getLeagueTable(compId: string, fixtures: Fixture[], squadType: SquadType, groupId?: number): TableEntry[] {
    const key = `${compId}|${squadType}|${groupId ?? ''}`;
    const cached = this.leagueTableCache.get(key);
    if (cached && cached.version === this.fixturesVersion) return [...cached.table];

    const table: Record<string, TableEntry> = {};
    
    // Fix: We must only initialize the table with clubs that are actually in the requested group
    const relevantFixtures = fixtures.filter(f => 
        f.competitionId === compId && 
        f.squadType === squadType && 
        (groupId === undefined || f.groupId === groupId)
    );

    const participantIds = new Set(relevantFixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]));
    
    // Fallback for leagues that might not have any fixtures yet
    if (participantIds.size === 0 && groupId === undefined) {
        this.clubs.filter(c => c.leagueId === compId).forEach(c => participantIds.add(c.id));
    }

    const clubs = this.clubs.filter(c => participantIds.has(c.id));
    
    clubs.forEach(c => table[c.id] = { clubId: c.id, clubName: c.name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 });
    
    relevantFixtures.filter(f => f.played).forEach(f => {
      const h = table[f.homeTeamId]; const a = table[f.awayTeamId];
      if (!h || !a) return;
      h.played++; a.played++; h.gf += f.homeScore!; h.ga += f.awayScore!; a.gf += f.awayScore!; a.ga += f.homeScore!;
      if (f.homeScore! > f.awayScore!) { h.won++; a.lost++; h.points += 3; }
      else if (f.homeScore! < f.awayScore!) { a.won++; h.lost++; a.points += 3; }
      else { h.drawn++; a.drawn++; h.points++; a.points++; }
    });
    
    const result = Object.values(table)
        .map(e => ({ ...e, gd: e.gf - e.ga }))
        .sort((a,b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
    this.leagueTableCache.set(key, { version: this.fixturesVersion, table: result });
    return result;
  }

  getClubsByCompetition(compId: string, fixtures: Fixture[], groupId?: number): Club[] {
    const ids = new Set(fixtures.filter(f => f.competitionId === compId && (groupId === undefined || f.groupId === groupId)).flatMap(f => [f.homeTeamId, f.awayTeamId]));
    return this.clubs.filter(c => ids.has(c.id));
  }

  getClubsByLeague(leagueId: string) { return this.clubs.filter(c => c.leagueId === leagueId); }

  /** Recompute dynamic reputations for all leagues at end of season */
  updateLeagueReputations() {
    const leagues = this.competitions.filter(c => c.type === 'LEAGUE');
    leagues.forEach(league => {
      const clubs = this.getClubsByLeague(league.id);
      if (clubs.length === 0) { league.dynamicReputation = this.getBaseLeagueRep(league); return; }
      
      // Factor 1: Average reputation of clubs in the league
      const avgClubRep = clubs.reduce((s, c) => s + c.reputation, 0) / clubs.length;
      // Factor 2: Average CA of players in the league (proxy for quality)
      const allPlayers = clubs.flatMap(c => this.getPlayersByClub(c.id).filter(p => p.squad === 'SENIOR'));
      const avgCA = allPlayers.length > 0 ? allPlayers.reduce((s, p) => s + p.currentAbility, 0) / allPlayers.length : 100;
      // Factor 3: Continental performance bonus (clubs qualified for continental comps)
      const continentalBonus = clubs.filter(c => c.qualifiedFor && ['CONT_LIB', 'UCL', 'COPA_LIB'].includes(c.qualifiedFor)).length * 3;
      
      const rawScore = (avgClubRep / 100) * 0.5 + (avgCA / 2) * 0.3 + continentalBonus * 0.2;
      const baseRep = this.getBaseLeagueRep(league);
      // Smooth transition: 70% previous + 30% new score, then clamp
      const prevRep = league.dynamicReputation ?? baseRep;
      league.dynamicReputation = Math.max(10, Math.min(100, Math.round(prevRep * 0.7 + rawScore * 0.3)));
      league.marketMultiplier = 0.5 + (league.dynamicReputation / 100) * 1.5;
    });
  }

  private getBaseLeagueRep(league: Competition): number {
    const map: Record<string, number> = {
      'L_ENG_1': 92, 'L_ESP_1': 90, 'L_ITA_1': 85, 'L_DEU_1': 84, 'L_FRA_1': 78,
      'L_NLD_1': 70, 'L_PRT_1': 68, 'L_BEL_1': 58, 'L_TUR_1': 55,
      'L_BRA_1': 75, 'L_ARG_1': 72, 'L_URY_1': 48, 'L_CHI_1': 40, 'L_COL_1': 42,
      'L_MEX_1': 60, 'L_USA_1': 55, 'L_USA_2': 50,
      'L_JPN_1': 52, 'L_SAU_1': 48, 'L_KOR_1': 45, 'L_CHN_1': 38,
      'L_AUS_1': 32, 'L_EGY_1': 40, 'L_MAR_1': 35, 'L_RSA_1': 34,
      'L_ECU_1': 44, 'L_BOL_1': 30,
    };
    return map[league.id] || league.dynamicReputation || (league.tier === 1 ? 42 : league.tier === 2 ? 28 : 18);
  }

  getLeagueTier(rep: number): 'ELITE' | 'PRESTIGE' | 'DEVELOPING' | 'EMERGING' | 'LOCAL' {
    if (rep >= 80) return 'ELITE';
    if (rep >= 60) return 'PRESTIGE';
    if (rep >= 40) return 'DEVELOPING';
    if (rep >= 20) return 'EMERGING';
    return 'LOCAL';
  }

  getMarketMultiplier(leagueId: string): number {
    const league = this.competitions.find(c => c.id === leagueId);
    return league?.marketMultiplier ?? 1.0;
  }

  // ─── Pilar C: Personalidades y Drama ──────────────────────────────────────

  private hashSeed(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Assign personality based on player's hidden mental attributes with rich variety */
  assignPlayerPersonality(
    leadership: number,
    loyalty: number,
    agresividad: number,
    decision: number,
    vision: number,
    extras?: {
      seedKey?: string;
      ambition?: number;
      professionalism?: number;
      resistencia?: number;
      anticipacion?: number;
      polivalencia?: number;
      age?: number;
      ca?: number;
      pa?: number;
    }
  ): PlayerPersonality {
    const amb = extras?.ambition ?? Math.round((vision * 0.65 + (20 - loyalty) * 0.35));
    const pro = extras?.professionalism ?? decision;
    const res = extras?.resistencia ?? 11;
    const ant = extras?.anticipacion ?? 11;
    const pol = extras?.polivalencia ?? 10;
    const age = extras?.age ?? 24;
    const paGap = (extras?.pa ?? 120) - (extras?.ca ?? 110);
    const seed = this.hashSeed(
      extras?.seedKey || `${leadership}-${loyalty}-${agresividad}-${decision}-${vision}-${res}-${pol}`
    );

    const jit = (salt: number) => (((seed ^ (salt * 2654435761)) >>> 0) % 1000) / 1000 * 5.0;

    // Clear standout archetypes when attributes strongly point to one
    if (leadership >= 17 && decision >= 15) return 'LEADER';
    if (pro >= 18 && decision >= 16 && agresividad <= 13 && loyalty >= 11) return 'MODEL_PRO';
    if (loyalty >= 18 && amb <= 12) return 'LOYAL';
    if (loyalty <= 5 && amb >= 14) return 'MERCENARY';
    if (agresividad >= 17 && decision <= 9) return 'VOLATILE';
    if (pro <= 6 && decision <= 8 && res <= 9) return 'LAZY';
    if (amb >= 18 && loyalty <= 12) return 'AMBITIOUS';

    const scores: [PlayerPersonality, number][] = [
      ['LEADER', leadership * 0.55 + decision * 0.25 + vision * 0.20 + (age >= 26 ? 1.8 : 0.3) + jit(1)],
      ['MODEL_PRO', pro * 0.55 + decision * 0.30 + res * 0.15 - (agresividad >= 16 ? 2.5 : 0) - 0.6 + jit(2)],
      ['PROFESSIONAL', pro * 0.45 + decision * 0.35 + ant * 0.20 + jit(3)],
      ['DRIVEN', decision * 0.35 + amb * 0.35 + res * 0.30 + jit(4)],
      ['AMBITIOUS', amb * 0.55 + vision * 0.30 + (paGap >= 16 ? 1.5 : 0) + (20 - loyalty) * 0.15 - 0.8 + jit(5)],
      ['COMPETITIVE', agresividad * 0.35 + res * 0.35 + decision * 0.30 + 0.5 + jit(6)],
      ['RESILIENT', res * 0.40 + ant * 0.35 + decision * 0.25 + (age >= 25 ? 0.6 : 0) - 0.4 + jit(7)],
      ['PERFECTIONIST', pro * 0.35 + decision * 0.35 + pol * 0.30 + 0.2 + jit(8)],
      ['CHARISMATIC', leadership * 0.35 + pol * 0.35 + (20 - agresividad) * 0.30 + 1.4 + jit(9)],
      ['LOYAL', loyalty * 0.70 + ant * 0.15 + (age >= 26 ? 1.0 : 0) + jit(10)],
      ['RESERVED', (20 - agresividad) * 0.40 + (20 - leadership) * 0.30 + ant * 0.30 + 1.8 + jit(11)],
      ['TEMPERAMENTAL', agresividad * 0.55 + vision * 0.25 + (20 - pro) * 0.20 + 0.8 + jit(12)],
      ['VOLATILE', agresividad * 0.55 + (20 - decision) * 0.30 + (20 - pro) * 0.15 - (pro >= 15 ? 2.0 : 0) + 1.5 + jit(13)],
      ['MERCENARY', (20 - loyalty) * 0.65 + amb * 0.35 - (loyalty >= 15 ? 2.5 : 0) + 0.4 + jit(14)],
      ['LAZY', (20 - pro) * 0.45 + (20 - res) * 0.30 + (20 - agresividad) * 0.25 - (decision >= 15 ? 2.0 : 0) + 0.8 + jit(15)],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][0];
  }

  /** Resolve personality labels for UI display */
  getPersonalityLabel(player: Player): string {
    if (!player.personality) return 'Equilibrado';
    return PLAYER_PERSONALITY_LABELS[player.personality] || 'Equilibrado';
  }

  /**
   * C2: Check dressing room conflicts based on clashing personalities.
   * Call daily for user's club; periodically for other DEEP clubs.
   */
  checkDressingRoomConflicts(clubId: string, date: Date) {
    const club = this.getClub(clubId);
    if (!club) return;

    const allSquad = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
    if (allSquad.length < 2) return;

    // Ensure all players have personality assigned (safety net for legacy saves)
    allSquad.forEach(p => {
      if (!p.personality) {
        p.personality = this.assignPlayerPersonality(
          p.leadership,
          p.loyalty,
          p.stats.internal.agresividad,
          p.stats.internal.decision,
          p.stats.internal.vision,
          { seedKey: p.id, resistencia: p.stats.internal.resistencia, anticipacion: p.stats.internal.anticipacion, polivalencia: p.stats.internal.polivalencia, age: p.age, ca: p.currentAbility, pa: p.potentialAbility }
        );
      }
    });

    // Personality clash matrix: pairs that naturally conflict
    const clashPairs: [PlayerPersonality, PlayerPersonality][] = [
      ['LEADER', 'VOLATILE'],
      ['LEADER', 'LAZY'],
      ['MODEL_PRO', 'LAZY'],
      ['MODEL_PRO', 'VOLATILE'],
      ['PERFECTIONIST', 'LAZY'],
      ['MERCENARY', 'LOYAL'],
      ['VOLATILE', 'PROFESSIONAL'],
      ['TEMPERAMENTAL', 'RESERVED'],
      ['COMPETITIVE', 'LAZY'],
      ['AMBITIOUS', 'LAZY'],
      ['MERCENARY', 'LEADER'],
    ];

    const captain = allSquad.find(p => p.leadership >= 15 && p.isStarter);

    for (let i = 0; i < allSquad.length; i++) {
      for (let j = i + 1; j < allSquad.length; j++) {
        const p1 = allSquad[i];
        const p2 = allSquad[j];
        if (!p1.personality || !p2.personality) continue;

        const isClash = clashPairs.some(
          ([a, b]) => (p1.personality === a && p2.personality === b) || (p1.personality === b && p2.personality === a)
        );
        if (!isClash) continue;

        // Accumulate tension
        if (!p1.playerTensions) p1.playerTensions = {};
        if (!p2.playerTensions) p2.playerTensions = {};
        p1.playerTensions[p2.id] = (p1.playerTensions[p2.id] || 0) + randomInt(1, 5);
        p2.playerTensions[p1.id] = (p2.playerTensions[p1.id] || 0) + randomInt(1, 5);

        const tension = Math.max(p1.playerTensions[p2.id] || 0, p2.playerTensions[p1.id] || 0);

        // Captain mediation
        if (captain && tension >= 40 && Math.random() < captain.leadership / 20) {
          p1.playerTensions[p2.id] = Math.max(0, (p1.playerTensions[p2.id] || 0) - 15);
          p2.playerTensions[p1.id] = Math.max(0, (p2.playerTensions[p1.id] || 0) - 15);
          if (tension >= 50) {
            this.addInboxMessage('SQUAD',
              `${captain.name} medió en el vestuario`,
              `El capitán ${captain.name} intervino para calmar la tensión entre ${p1.name} (${PLAYER_PERSONALITY_LABELS[p1.personality]}) y ${p2.name} (${PLAYER_PERSONALITY_LABELS[p2.personality]}).`,
              date, clubId);
          }
          continue;
        }

        // Escalation: notify coach
        if (tension >= 60 && tension < 80 && Math.random() < 0.3) {
          this.addInboxMessage('SQUAD',
            `Tensión en el vestuario: ${p1.name} vs ${p2.name}`,
            `Hay fricción creciente entre ${p1.name} (${PLAYER_PERSONALITY_LABELS[p1.personality!]}) y ${p2.name} (${PLAYER_PERSONALITY_LABELS[p2.personality!]}). El ambiente se resiente.`,
            date, clubId);
          club.teamCohesion = Math.max(10, (club.teamCohesion || 50) - 3);
        }

        // Boiling point: media leak
        if (tension >= 80 && Math.random() < 0.15) {
          p1.morale = Math.max(0, p1.morale - 10);
          p2.morale = Math.max(0, p2.morale - 10);
          club.teamCohesion = Math.max(0, (club.teamCohesion || 50) - 8);
          this.addInboxMessage('SQUAD',
            `🚨 Conflicto grave: ${p1.name} y ${p2.name}`,
            `La prensa ha filtrado una pelea entre ${p1.name} y ${p2.name} en el entrenamiento. La directiva está preocupada. Ambos jugadores han bajado su moral.`,
            date, clubId, 'CRITICAL');
          // Noticia de diario: crisis de vestuario en el club del usuario
          this.publishNews('TU_CLUB', {
            date,
            type: 'CRITICISM',
            headline: `Crisis en el vestuario de ${club.name}`,
            subheadline: `${p1.name} y ${p2.name} protagonizan un incidente`,
            body: `Fuentes internas confirman que la relación entre ${p1.name} (${PLAYER_PERSONALITY_LABELS[p1.personality!]}) y ${p2.name} (${PLAYER_PERSONALITY_LABELS[p2.personality!]}) es insostenible. El DT deberá tomar medidas.`,
            clubId,
          });
        }
      }
    }
  }

  /**
   * C3: Check if players want to request a transfer for narrative reasons.
   * Call daily per user club.
   */
  checkTransferRequestMotives(clubId: string, date: Date) {
    const club = this.getClub(clubId);
    if (!club) return;
    const players = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR' && !p.isTransferListed && !p.transferRequestReason);
    if (players.length === 0 || Math.random() > 0.03) return; // 3% daily chance

    const candidate = players[randomInt(0, players.length - 1)];
    if (!candidate.personality) return;

    const league = this.competitions.find(c => c.id === club.leagueId);
    const leagueRep = league?.dynamicReputation || 50;
    const motives: Record<PlayerPersonality, string[]> = {
      LEADER: ['Quiere competir por títulos importantes y siente que el club no está a la altura.', 'Busca un proyecto donde su liderazgo sea valorado con fichajes de nivel.'],
      MODEL_PRO: ['Siente que el nivel de exigencia diaria del plantel no acompaña sus metas deportivas.', 'Busca un proyecto estructurado donde competir por objetivos mayores.'],
      MERCENARY: ['Recibió una oferta salarial que este club no puede igualar.', 'Su agente le ha conseguido un contrato mucho más lucrativo en otra liga.'],
      LOYAL: ['Su familia quiere regresar a su país de origen.', 'Problemas personales requieren que esté más cerca de casa.'],
      VOLATILE: ['No soporta más al cuerpo técnico y quiere un cambio de aires.', 'Siente que el DT lo tiene de punto y prefiere irse antes que seguir así.'],
      TEMPERAMENTAL: ['Las últimas decisiones tácticas lo frustraron y busca descomprimir cambiando de club.', 'Quiere un rol más protagónico tras varios choques internos.'],
      PROFESSIONAL: ['Considera que su ciclo en el club ha terminado y busca un nuevo desafío.', 'Quiere probarse en una liga más competitiva antes del final de su carrera.'],
      DRIVEN: ['Siente que necesita un escenario con metas deportivas más exigentes para seguir evolucionando.', 'Quiere pelear por campeonatos y cree que afuera tendrá esa oportunidad.'],
      COMPETITIVE: ['No acepta ser pieza secundaria y exige ir a un club donde juegue todos los partidos.', 'Quiere un reto directo por la titularidad en otra liga.'],
      RESILIENT: ['Tras evaluar fríamente su situación, entiende que lo mejor para su carrera es cambiar de aire.', 'Busca empezar de cero en un club con otra dinámica deportiva.'],
      PERFECTIONIST: ['No está conforme con su rendimiento actual acá y cree que otro contexto lo potenciará.', 'Busca un cuerpo técnico que trabaje con mayor detalle su rol específico.'],
      CHARISMATIC: ['Siente que perdió sintonía con el proyecto actual y quiere renovar energías en otro vestuario.', 'Recibió el llamado de excompañeros para sumarse a otro club.'],
      RESERVED: ['De manera silenciosa, le comunicó a su entorno que prefiere cambiar de destino.', 'Busca un club más tranquilo donde enfocarse solo en jugar.'],
      LAZY: ['No se siente motivado aquí. Cree que un cambio de entorno lo reactivaría.', 'Busca un club con menos exigencia donde pueda jugar sin presión.'],
      AMBITIOUS: ['Quiere jugar copas internacionales y este club no se las puede garantizar.', 'Aspira a un club más grande donde pueda ganar títulos y premios individuales.'],
    };

    const personalityMotives = motives[candidate.personality] || motives.PROFESSIONAL;
    const reason = personalityMotives[randomInt(0, personalityMotives.length - 1)];

    candidate.transferRequestReason = reason;
    candidate.isTransferListed = true;
    candidate.transferStatus = 'TRANSFERABLE';
    candidate.morale = Math.max(20, candidate.morale - 20);

    const label = PLAYER_PERSONALITY_LABELS[candidate.personality];
    this.addInboxMessage('SQUAD',
      `${candidate.name} pidió ser transferido`,
      `${candidate.name} (${label}) ha solicitado formalmente salir del club. Motivo: "${reason}"\n\nPuedes intentar convencerlo de quedarse o buscarle un destino.`,
      date, candidate.id, 'IMPORTANT', true);

    this.publishNews('MERCADO', {
      date,
      type: 'RUMOR',
      headline: `${candidate.name} quiere dejar ${club.name}`,
      subheadline: `El jugador habría pedido ser transferido`,
      body: `Según fuentes cercanas al jugador, ${candidate.name} comunicó su deseo de abandonar ${club.name}. El motivo principal: "${reason}"`,
      clubId, playerId: candidate.id,
    });
  }

  /**
   * C4: Generate random narrative events that add flavor to the daily cycle.
   * Low probability, high impact moments.
   */
  generateNarrativeEvents(clubId: string, date: Date) {
    const club = this.getClub(clubId);
    if (!club || Math.random() > 0.06) return; // 6% daily chance

    const squad = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
    if (squad.length < 5) return;

    const roll = Math.random();

    if (roll < 0.16) {
      // Youth asks for veteran's number
      const veteran = squad.find(p => p.age >= 30 && p.reputation >= 3000);
      const youth = squad.find(p => p.age <= 20 && p.potentialAbility >= 150);
      if (veteran && youth && youth.id !== veteran.id) {
        this.addInboxMessage('SQUAD',
          `${youth.name} quiere la dorsal de ${veteran.name}`,
          `El juvenil ${youth.name} ha expresado su deseo de heredar el número de ${veteran.name}, una leyenda del club. El vestuario está dividido: algunos creen que es una falta de respeto, otros ven ambición sana.`,
          date, clubId);
        youth.morale = Math.min(100, youth.morale + 5);
        veteran.morale = Math.max(0, veteran.morale - 5);
        if (!youth.playerTensions) youth.playerTensions = {};
        youth.playerTensions[veteran.id] = (youth.playerTensions[veteran.id] || 0) + 10;
      }
    } else if (roll < 0.32) {
      // Two stars argue over penalty
      const stars = squad.filter(p => p.currentAbility >= 150 && p.isStarter);
      if (stars.length >= 2) {
        const s1 = stars[randomInt(0, stars.length - 1)];
        let s2 = stars[randomInt(0, stars.length - 1)];
        while (s2.id === s1.id && stars.length > 1) s2 = stars[randomInt(0, stars.length - 1)];
        this.addInboxMessage('SQUAD',
          `¿Quién tira el penal? ${s1.name} vs ${s2.name}`,
          `${s1.name} y ${s2.name} discutieron acaloradamente sobre quién debería ser el lanzador de penaltis del equipo. Necesitas tomar una decisión antes del próximo partido.`,
          date, clubId);
        if (!s1.playerTensions) s1.playerTensions = {};
        if (!s2.playerTensions) s2.playerTensions = {};
        s1.playerTensions[s2.id] = (s1.playerTensions[s2.id] || 0) + 8;
        s2.playerTensions[s1.id] = (s2.playerTensions[s1.id] || 0) + 8;
      }
    } else if (roll < 0.46) {
      // Veteran mentors youth (positive event)
      const veteran = squad.find(p => p.age >= 31 && p.leadership >= 15);
      const youth = squad.find(p => p.age <= 21 && p.potentialAbility >= 140);
      if (veteran && youth && youth.id !== veteran.id) {
        youth.currentAbility = Math.min(youth.potentialAbility, youth.currentAbility + 1);
        youth.morale = Math.min(100, youth.morale + 10);
        veteran.morale = Math.min(100, veteran.morale + 5);
        club.teamCohesion = Math.min(100, (club.teamCohesion || 50) + 3);
        this.addInboxMessage('SQUAD',
          `${veteran.name} apadrina a ${youth.name}`,
          `El veterano ${veteran.name} ha tomado bajo su ala al joven ${youth.name}. Se los ve entrenando juntos y la química del equipo mejora. ${youth.name} ha ganado 1 punto de CA.`,
          date, clubId);
        this.publishNews('TU_CLUB', {
          date,
          type: 'PRAISE',
          headline: `${veteran.name}, el mentor de ${club.name}`,
          subheadline: `El veterano impulsa el desarrollo de ${youth.name}`,
          body: `En ${club.name} destacan la labor de ${veteran.name} como guía de las jóvenes promesas. ${youth.name} es el último beneficiado.`,
          clubId,
        });
      }
    } else if (roll < 0.58) {
      // Training injury
      const victim = squad[randomInt(0, squad.length - 1)];
      const days = randomInt(3, 21);
      const injuryTypes = ['esguince de tobillo', 'microrrotura fibrilar', 'contusión en el gemelo', 'sobrecarga muscular', 'golpe en la rodilla'];
      const injuryType = injuryTypes[randomInt(0, injuryTypes.length - 1)];
      victim.injury = {
        type: injuryType,
        daysLeft: days,
        totalDays: days,
        severity: days > 14 ? 'MODERATE' : 'MINOR',
        treatment: 'NONE',
        injuryDate: date,
        recoveryProgress: 0,
        relapseRisk: days > 14 ? 15 : 5,
        daysSinceInjury: 0,
      };
      victim.morale = Math.max(0, victim.morale - 10);
      this.addInboxMessage('SQUAD',
        `${victim.name} se lesiona en el entrenamiento`,
        `Malas noticias: ${victim.name} sufrió un ${injuryType} durante la sesión de hoy. Estará aproximadamente ${days} días de baja. El cuerpo médico recomienda precaución.`,
        date, clubId, 'IMPORTANT');
      this.publishNews('LESIONES', {
        date,
        type: 'CRITICISM',
        headline: `${victim.name}, baja sensible en ${club.name}`,
        subheadline: `Lesión en el entrenamiento: ${days} días de baja`,
        body: `${victim.name} se perderá los próximos partidos de ${club.name} tras sufrir un ${injuryType} en la sesión matinal. Una baja que complica los planes del entrenador.`,
        clubId, playerId: victim.id,
      });
      sendInjuryNotification(victim.name, injuryType, days);
    } else if (roll < 0.68) {
      // Romance / celebrity distraction
      const player = squad[randomInt(0, squad.length - 1)];
      const celebNames = ['una reconocida modelo', 'una cantante pop', 'una actriz de telenovelas', 'una influencer viral'];
      const celeb = celebNames[randomInt(0, celebNames.length - 1)];
      // Personality affects reaction
      const isDistracted = player.personality === 'MERCENARY' || player.personality === 'LAZY' || player.personality === 'VOLATILE';
      if (isDistracted) {
        player.morale = Math.min(100, player.morale + 8);
        player.fitness = Math.max(0, player.fitness - 5);
        this.addInboxMessage('STATEMENTS',
          `${player.name} en el ojo mediático`,
          `${player.name} ha sido vinculado sentimentalmente con ${celeb}. Las revistas del corazón no hablan de otra cosa. Su ánimo está por las nubes pero algunos temen que pierda el foco deportivo.`,
          date, clubId);
      } else {
        this.addInboxMessage('STATEMENTS',
          `Prensa rosa: ${player.name}`,
          `La prensa del corazón vincula a ${player.name} con ${celeb}. El jugador ha declarado que no afectará a su rendimiento y que está centrado en el fútbol.`,
          date, clubId);
      }
      this.publishNews('TU_CLUB', {
        date,
        type: 'RUMOR',
        headline: `¿${player.name} tiene nuevo amor?`,
        subheadline: `El jugador de ${club.name} en boca de todos`,
        body: `Las imágenes de ${player.name} con ${celeb} han dado la vuelta al mundo. En ${club.name} prefieren no hacer comentarios.`,
        clubId, playerId: player.id,
      });
    } else if (roll < 0.77) {
      // Conflict with board/directiva
      const star = squad.filter(p => p.reputation >= 5000 && p.isStarter)[0];
      if (star) {
        club.boardConfidence = Math.max(0, club.boardConfidence - 5);
        star.morale = Math.max(0, star.morale - 8);
        this.addInboxMessage('STATEMENTS',
          `${star.name} choca con la directiva`,
          `${star.name} ha tenido un encontronazo con la directiva por unas declaraciones sobre la política de fichajes del club. La afición está dividida: ¿apoyas al jugador o a la junta?`,
          date, clubId);
        this.publishNews('TU_CLUB', {
          date,
          type: 'HEADLINE',
          headline: `Terremoto en ${club.name}: ${star.name} carga contra la directiva`,
          subheadline: 'El vestuario, pendiente de la resolución del conflicto',
          body: `${star.name} no se mordió la lengua: "Este club merece más ambición". La directiva de ${club.name} estudia medidas disciplinarias mientras el entrenador intenta apaciguar los ánimos.`,
          clubId, playerId: star.id,
        });
      }
    } else if (roll < 0.86) {
      // Nightclub party leaked
      const partyGoer = squad[randomInt(0, squad.length - 1)];
      const nights = ['viernes', 'sábado'];
      const night = nights[randomInt(0, nights.length - 1)];
      partyGoer.fitness = Math.max(0, partyGoer.fitness - 10);
      partyGoer.morale = Math.max(0, partyGoer.morale - 5);
      club.teamCohesion = Math.max(0, (club.teamCohesion || 50) - 3);
      this.addInboxMessage('SQUAD',
        `Escándalo: ${partyGoer.name} en una fiesta nocturna`,
        `La prensa ha publicado fotos de ${partyGoer.name} saliendo de una discoteca a las 4 AM el ${night} por la noche, a 48 horas de un partido importante. El código disciplinario del club podría aplicarse. Su condición física se resiente.`,
        date, clubId);
      this.publishNews('TU_CLUB', {
        date,
        type: 'CRITICISM',
        headline: `${partyGoer.name}, cazado de fiesta a altas horas`,
        subheadline: 'El código disciplinario del club, en entredicho',
        body: `Exclusiva: ${partyGoer.name} fue fotografiado abandonando un conocido local nocturno en la madrugada del ${night}. En ${club.name} no ha sentado nada bien. El jugador se enfrenta a una posible sanción económica.`,
        clubId, playerId: partyGoer.id,
      });
    } else if (roll < 0.94) {
      // Bet between players (training challenge)
      const p1 = squad[randomInt(0, squad.length - 1)];
      let p2 = squad[randomInt(0, squad.length - 1)];
      while (p2.id === p1.id) p2 = squad[randomInt(0, squad.length - 1)];
      const betOutcome = Math.random() > 0.5;
      const winner = betOutcome ? p1 : p2;
      const loser = betOutcome ? p2 : p1;
      winner.morale = Math.min(100, winner.morale + 8);
      loser.morale = Math.max(0, loser.morale - 3);
      club.teamCohesion = Math.min(100, (club.teamCohesion || 50) + 2);
      this.addInboxMessage('SQUAD',
        `Apuesta entre ${p1.name} y ${p2.name}`,
        `${p1.name} y ${p2.name} hicieron una apuesta en el entrenamiento: quién mete más goles desde fuera del área. ${winner.name} ganó y se llevó los aplausos del grupo. Buen ambiente en el vestuario.`,
        date, clubId);
    } else {
      // Captain or senior leader addresses dressing room tension with a named teammate
      const leader = squad.find(p => p.leadership >= 14 || p.personality === 'LEADER' || p.personality === 'MODEL_PRO');
      const target = squad.find(p => p.id !== leader?.id && (p.morale < 65 || p.personality === 'VOLATILE' || p.personality === 'TEMPERAMENTAL'));
      if (leader && target) {
        target.morale = Math.min(100, target.morale + 4);
        club.teamCohesion = Math.min(100, (club.teamCohesion || 50) + 2);
        this.publishNews('TU_CLUB', {
          date,
          type: 'FEATURE',
          headline: `${leader.name} da la cara en el vestuario de ${club.shortName}`,
          subheadline: `Charla directa con ${target.name} tras los entrenamientos`,
          body: `El referente ${leader.name} mantuvo un diálogo frontal con ${target.name} en la práctica de ${club.name} para exigir compromiso grupal antes del próximo compromiso.`,
          clubId, playerId: leader.id, isUserClubNews: true,
        });
      }
    }
  }

  // ─── Injury Treatment System ────────────────────────────────────────────

  /** Set a treatment plan for an injured player */
  setInjuryTreatment(playerId: string, treatment: 'CONSERVATIVE' | 'AGGRESSIVE', date: Date) {
    const player = this.getPlayer(playerId);
    if (!player || !player.injury) return;

    player.injury.treatment = treatment;
    // Recalculate progress based on days already healed vs remaining
    const daysHealed = player.injury.daysSinceInjury;
    player.injury.recoveryProgress = Math.min(99, Math.round((daysHealed / (daysHealed + player.injury.daysLeft)) * 100));

    if (treatment === 'CONSERVATIVE') {
      player.injury.relapseRisk = Math.max(0, player.injury.relapseRisk - 20);
      player.morale = Math.max(0, player.morale - 3);
      this.addInboxMessage('SQUAD',
        `Tratamiento conservador: ${player.name}`,
        `${player.name} seguirá un plan de recuperación conservador. Es más lento (~30% más) pero minimiza el riesgo de recaída. Días restantes estimados: ~${Math.round(player.injury.daysLeft * 1.3)}.`,
        date, playerId);
    } else {
      player.injury.relapseRisk = Math.min(100, player.injury.relapseRisk + 25);
      player.morale = Math.min(100, player.morale + 5);
      this.addInboxMessage('SQUAD',
        `Tratamiento agresivo: ${player.name}`,
        `${player.name} seguirá un plan de recuperación intensivo. Vuelve antes (~40% más rápido) pero con mayor riesgo de recaída.`,
        date, playerId);
    }
  }

  /** Get a human-readable injury report for UI */
  getInjuryReport(playerId: string): string | null {
    const player = this.getPlayer(playerId);
    if (!player || !player.injury) return null;

    const i = player.injury;
    const severityLabel: Record<string, string> = {
      MINOR: 'Leve', MODERATE: 'Moderada', SERIOUS: 'Grave', SEVERE: 'Muy Grave',
    };
    const treatmentLabel = i.treatment === 'CONSERVATIVE' ? 'Conservador' : i.treatment === 'AGGRESSIVE' ? 'Agresivo' : 'Sin definir';
    const progressBar = '█'.repeat(Math.floor(i.recoveryProgress / 10)) + '░'.repeat(10 - Math.floor(i.recoveryProgress / 10));

    return `📋 Parte médico: ${player.name}
━━━━━━━━━━━━━━━━━━━━
Lesión: ${i.type}
Gravedad: ${severityLabel[i.severity] || i.severity}
Tratamiento: ${treatmentLabel}
Progreso: [${progressBar}] ${Math.round(i.recoveryProgress)}%
Días restantes: ~${i.daysLeft}
Riesgo de recaída: ${Math.round(i.relapseRisk)}%
Días desde la lesión: ${i.daysSinceInjury}`;
  }

  // ─── End Injury Treatment ────────────────────────────────────────────────

  // ─── End Pilar C ──────────────────────────────────────────────────────────

  /**
   * Generate 3-5 preseason friendly fixtures for a club before its league starts.
   * Opponents are clubs of similar reputation from different leagues.
   */
  generatePreseasonFriendlies(clubId: string, seasonStart: Date, leagueStartDate?: Date): Fixture[] {
    const club = this.getClub(clubId);
    if (!club) return [];

    const count = 3 + randomInt(0, 2); // 3-5 friendlies
    const fixtures: Fixture[] = [];

    // Find suitable opponents: similar reputation (±30%), different league, different country preferred
    const repRange = club.reputation * 0.3;
    const candidates = this.clubs
      .filter(c =>
        c.id !== clubId &&
        c.leagueId !== club.leagueId &&
        Math.abs(c.reputation - club.reputation) <= repRange
      )
      .sort((a, b) => b.reputation - a.reputation);

    if (candidates.length < count) {
      // Relax criteria: allow same country, wider rep range
      const fallback = this.clubs
        .filter(c => c.id !== clubId && c.leagueId !== club.leagueId)
        .sort((a, b) => Math.abs(a.reputation - club.reputation) - Math.abs(b.reputation - club.reputation));
      for (const c of fallback) {
        if (!candidates.includes(c)) candidates.push(c);
        if (candidates.length >= count) break;
      }
    }

    if (candidates.length === 0) return [];

    // Programar amistosos HACIA ADELANTE desde el inicio de pretemporada, siempre antes del debut oficial
    const startMidnight = new Date(seasonStart.getFullYear(), seasonStart.getMonth(), seasonStart.getDate(), 15, 0, 0, 0);
    const defaultLeagueStart = new Date(startMidnight);
    defaultLeagueStart.setDate(defaultLeagueStart.getDate() + 24);
    const leagueFloor = leagueStartDate
      ? new Date(leagueStartDate.getFullYear(), leagueStartDate.getMonth(), leagueStartDate.getDate(), 15, 0, 0, 0)
      : defaultLeagueStart;

    const latestAllowedDate = new Date(leagueFloor);
    latestAllowedDate.setDate(latestAllowedDate.getDate() - 3); // Al menos 3 días de descanso antes de la Fecha 1

    const availableSpanDays = Math.max(
      9,
      Math.floor((latestAllowedDate.getTime() - startMidnight.getTime()) / 86_400_000)
    );
    const firstOffset = 3; // Arranca 3 días después de asumir para permitir revisar plantel/táctica
    const usableSpan = Math.max(3, availableSpanDays - firstOffset);
    const selected = candidates.slice(0, Math.min(count, candidates.length));
    const step = selected.length > 1 ? Math.max(3, Math.floor(usableSpan / (selected.length - 1))) : 4;

    for (let i = 0; i < selected.length; i++) {
      const matchDate = new Date(startMidnight);
      const dayOffset = Math.min(availableSpanDays, firstOffset + i * Math.min(step, 4));
      matchDate.setDate(matchDate.getDate() + dayOffset);
      if (matchDate.getTime() > latestAllowedDate.getTime()) break;

      const isHome = i % 2 === 0; // alternate home/away
      fixtures.push({
        id: generateUUID(),
        competitionId: 'FRIENDLY',
        homeTeamId: isHome ? clubId : selected[i].id,
        awayTeamId: isHome ? selected[i].id : clubId,
        date: matchDate,
        played: false,
        squadType: 'SENIOR',
        stage: 'REGULAR',
      });
    }

    if (fixtures.length === 0) return [];

    // Notify user on the opening day of preseason
    this.addInboxMessage('COMPETITION',
      'Pretemporada: amistosos programados',
      `Se han programado ${fixtures.length} partidos amistosos de pretemporada para ${club.name} antes del inicio oficial de la liga. Los rivales son:\n${fixtures.map((f, i) => {
        const opp = selected[i];
        return `${i + 1}. ${opp.name} (${opp.country}) — ${f.date.toLocaleDateString('es-AR')} (${f.homeTeamId === clubId ? 'Local' : 'Visitante'})`;
      }).join('\n')}\n\nLos amistosos no afectan la tabla ni generan sanciones. Sirven para ganar forma física, probar tácticas y mejorar la química del equipo.`,
      new Date(seasonStart));

    return fixtures;
  }

  // ─── End Pretemporada ─────────────────────────────────────────────────────

  /** Evaluate all HEAD_COACHes and induct worthy ones into the Hall of Fame */
  updateHallOfFame(currentYear: number) {
    const coaches = this.staff.filter(s => s.role === 'HEAD_COACH');
    coaches.forEach(coach => {
      if (!coach.history || coach.history.length === 0) return;
      const totalGames = coach.history.length;
      if (totalGames < 100) return;
      const totalWins = coach.history.filter((h: any) => h.result === 'W').length;
      const winRate = Math.round((totalWins / totalGames) * 100);
      if (winRate < 55) return;
      const club = this.getClub(coach.clubId);
      const clubsManaged = [...new Set(coach.history.map((h: any) => h.clubName || club?.name || 'Desconocido'))];
      const existingIdx = this.hallOfFame.findIndex(h => h.id === coach.id);
      const entry = {
        id: coach.id,
        managerName: coach.name,
        nationality: coach.nationality,
        totalGames, totalWins, winRate,
        titles: coach.careerHonours || [],
        clubsManaged: clubsManaged as string[],
        era: `${currentYear - 10}-${currentYear}`,
        yearInducted: currentYear,
      };
      if (existingIdx >= 0) { this.hallOfFame[existingIdx] = entry; }
      else if (winRate >= 60) { this.hallOfFame.push(entry); }
    });
    this.hallOfFame.sort((a, b) => b.winRate - a.winRate || b.titles.length - a.titles.length);
    if (this.hallOfFame.length > 50) this.hallOfFame.length = 50;
  }

  /** Update all-time club records based on player career stats */
  updateClubAllTimeRecords() {
    this.clubs.forEach(club => {
      const allPlayers = this.players.filter(p => p.clubId === club.id || p.careerStats?.clubsPlayedFor?.includes(club.id));
      let topScorer: typeof club.records.allTimeTopScorer = undefined;
      let mostApps: typeof club.records.allTimeMostApps = undefined;
      allPlayers.forEach(p => {
        const cs = p.careerStats;
        if (!cs) return;
        if (cs.totalGoals > (topScorer?.goals || 0)) topScorer = { playerName: p.name, playerId: p.id, goals: cs.totalGoals };
        if (cs.totalApps > (mostApps?.apps || 0)) mostApps = { playerName: p.name, playerId: p.id, apps: cs.totalApps };
      });
      if (topScorer) club.records.allTimeTopScorer = topScorer;
      if (mostApps) club.records.allTimeMostApps = mostApps;
    });
  }

  /** Generate economic news when league reputations shift significantly (sección Internacional del diario) */
  generateEconomicNews(date: Date) {
    const leagues = this.competitions.filter(c => c.type === 'LEAGUE' && c.dynamicReputation !== undefined);
    // Find biggest movers
    const sortedByChange = [...leagues].sort((a, b) => 
      Math.abs((b.dynamicReputation || 0) - this.getBaseLeagueRep(b)) -
      Math.abs((a.dynamicReputation || 0) - this.getBaseLeagueRep(a))
    );
    const topMovers = sortedByChange.slice(0, 3);
    topMovers.forEach(league => {
      const change = (league.dynamicReputation || 0) - this.getBaseLeagueRep(league);
      const tier = this.getLeagueTier(league.dynamicReputation || 30);
      const direction = change >= 5 ? 'asciende' : change <= -5 ? 'desciende' : 'se mantiene';
      const tierNames: Record<string, string> = { ELITE: 'Élite', PRESTIGE: 'Prestigio', DEVELOPING: 'En Desarrollo', EMERGING: 'Emergente', LOCAL: 'Local' };
      if (Math.abs(change) >= 5 && this.isNewsRelevantToUser({ competitionId: league.id })) {
        this.publishNews('INTERNACIONAL', {
          date,
          type: 'FEATURE',
          headline: `${league.name}: ${direction} en el mapa del fútbol`,
          subheadline: `Reputación en ${league.dynamicReputation}/100 (${direction} ${Math.abs(change)} pts)`,
          body: `La reputación de la ${league.name} se sitúa en ${league.dynamicReputation}/100, ${direction} ${Math.abs(change)} puntos. El tier actual de la liga es ${tierNames[tier]}.`,
          competitionId: league.id,
        });
      }
    });
    // Cross-league comparison headline
    if (leagues.length >= 2) {
      const top3 = [...leagues].sort((a, b) => (b.dynamicReputation || 0) - (a.dynamicReputation || 0)).slice(0, 3);
      this.publishNews('INTERNACIONAL', {
        date,
        type: 'FEATURE',
        headline: 'Ranking Mundial de Ligas',
        subheadline: `Top 3: ${top3[0]?.name}, ${top3[1]?.name}, ${top3[2]?.name}`,
        body: `El Top 3 de ligas por reputación:\n1. ${top3[0]?.name} (${top3[0]?.dynamicReputation}/100)\n2. ${top3[1]?.name} (${top3[1]?.dynamicReputation}/100)\n3. ${top3[2]?.name} (${top3[2]?.dynamicReputation}/100)`,
      });
    }
  }

  selectBestEleven(clubId: string, squad: SquadType, tacticId?: string) {
    const players = this.getPlayersByClub(clubId).filter(p => p.squad === squad && !p.injury && (!p.suspension || p.suspension.matchesLeft === 0));
    players.forEach(p => { p.isStarter = false; p.tacticalPosition = undefined; });
    
    const tactic = tacticId ? (this.tactics.find(t => t.id === tacticId) || this.tactics[0]) : this.tactics[0];
    tactic.positions.forEach(slot => {
        const metadata = SLOT_CONFIG[slot];
        if (!metadata) return;

        const eligible = players.filter(p => {
            if (p.isStarter) return false;
            const primaryPos = p.positions[0];
            
            if (metadata.line === 'GK') return primaryPos === Position.GK;
            if (metadata.line === 'SW') return primaryPos === Position.SW;
            if (metadata.line === 'DEF') return primaryPos === Position.DC || primaryPos === Position.DL || primaryPos === Position.DR;
            if (metadata.line === 'DM') return primaryPos === Position.DM || primaryPos === Position.DML || primaryPos === Position.DMR;
            if (metadata.line === 'MID') return primaryPos === Position.MC || primaryPos === Position.MR || primaryPos === Position.ML;
            if (metadata.line === 'AM') return primaryPos === Position.AM || primaryPos === Position.AMR || primaryPos === Position.AML;
            if (metadata.line === 'ATT') return primaryPos === Position.ST || primaryPos === Position.STR || primaryPos === Position.STL;
            return false;
        });

        let best = eligible.sort((a,b) => b.currentAbility - a.currentAbility)[0];
        if (!best) {
            best = players.filter(p => !p.isStarter).sort((a,b) => b.currentAbility - a.currentAbility)[0];
        }

        if (best) { 
            best.isStarter = true; 
            best.tacticalPosition = slot; 
        }
    });

    return players.filter(p => p.isStarter);
  }

  updateTacticalFamiliarity(clubId: string) {
    const tactic = this.tactics[0];
    if (!tactic) return;

    const clubPlayers = this.getPlayersByClub(clubId);
    clubPlayers.forEach(p => {
      if (!p.isStarter) return;
      const increment = p.tacticalFamiliarity < 50 ? 4 : p.tacticalFamiliarity < 80 ? 2 : 1;
      p.tacticalFamiliarity = Math.min(100, p.tacticalFamiliarity + increment);
    });

    clubPlayers.forEach(p => {
      if (!p.isStarter && p.tacticalFamiliarity > 30) {
        p.tacticalFamiliarity = Math.max(30, p.tacticalFamiliarity - 1);
      }
    });
  }

  updateClubRecords(homeClubId: string, awayClubId: string, homeScore: number, awayScore: number, date: Date, competitionId: string) {
    const homeClub = this.getClub(homeClubId);
    const awayClub = this.getClub(awayClubId);
    if (!homeClub || !awayClub) return;

    const goalsTotal = homeScore + awayScore;
    const goalDiff = Math.abs(homeScore - awayScore);

    const updateRecord = (club: Club, opponentName: string, isWin: boolean, isHome: boolean) => {
      const scored = isHome ? homeScore : awayScore;
      const conceded = isHome ? awayScore : homeScore;

      if (isWin && goalDiff > 0) {
        if (!club.records.biggestVictory || goalDiff > Math.abs(club.records.biggestVictory.goalsFor - club.records.biggestVictory.goalsAgainst)) {
          club.records.biggestVictory = { opponent: opponentName, goalsFor: scored, goalsAgainst: conceded, date, competition: competitionId };
        }
      } else if (!isWin && scored < conceded) {
        if (!club.records.biggestDefeat || goalDiff > Math.abs(club.records.biggestDefeat.goalsAgainst - club.records.biggestDefeat.goalsFor)) {
          club.records.biggestDefeat = { opponent: opponentName, goalsFor: scored, goalsAgainst: conceded, date, competition: competitionId };
        }
      }

      if (goalsTotal > (club.records.highestScoringMatch?.goalsTotal || 0)) {
        club.records.highestScoringMatch = { goalsTotal, opponent: opponentName, date };
      }

      if (isWin) {
        club.records.currentWinStreak++;
        if (club.records.currentWinStreak > club.records.longestWinStreak) {
          club.records.longestWinStreak = club.records.currentWinStreak;
        }
      } else {
        club.records.currentWinStreak = 0;
      }
    };

    updateRecord(homeClub, awayClub.name, homeScore > awayScore, true);
    updateRecord(awayClub, homeClub.name, awayScore > homeScore, false);
  }

  saveTactic(name: string, positions: number[], settings: TacticSettings) {
    this.tactics.push({ id: generateUUID(), name, positions, settings, arrows: {}, individualSettings: {} });
  }

  setPlayerTransferStatus(playerId: string, status: 'NONE' | 'TRANSFERABLE' | 'LOANABLE'): { ok: boolean; status: 'NONE' | 'TRANSFERABLE' | 'LOANABLE' } {
    const p = this.getPlayer(playerId);
    if (!p) return { ok: false, status: 'NONE' };
    p.transferStatus = status;
    p.isTransferListed = status === 'TRANSFERABLE';
    if (status === 'TRANSFERABLE' && p.transferRequestReason) {
      p.morale = Math.min(100, p.morale + 5);
    }
    return { ok: true, status };
  }

  evaluateTransferViability(
    playerId: string,
    buyerClubId: string,
    type: 'PURCHASE' | 'LOAN' | 'LOAN_TO_BUY',
    offerAmount?: number,
    wageShare = 100
  ): {
    allowed: boolean;
    clubLikelyToAccept: boolean;
    playerWilling: boolean;
    interestLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    askingPrice: number;
    expectedSalary: number;
    projectedMonthlyWage: number;
    remainingWageRoom: number;
    reasons: string[];
  } {
    const player = this.getPlayer(playerId);
    const buyer = this.getClub(buyerClubId);
    const reasons: string[] = [];

    if (!player || !buyer) {
      return {
        allowed: false,
        clubLikelyToAccept: false,
        playerWilling: false,
        interestLevel: 'NONE',
        askingPrice: 0,
        expectedSalary: 0,
        projectedMonthlyWage: 0,
        remainingWageRoom: 0,
        reasons: ['Jugador o club no encontrado.'],
      };
    }

    if (player.clubId === buyerClubId) {
      reasons.push('El jugador ya pertenece a tu plantel.');
    }
    if (player.clubId === 'FREE_AGENT') {
      reasons.push('Es agente libre: negocia su contrato directamente sin oferta de traspaso.');
    }
    if (player.loanDetails && (type === 'LOAN' || type === 'LOAN_TO_BUY')) {
      reasons.push('El futbolista ya se encuentra a préstamo esta temporada.');
    }

    const seller = player.clubId !== 'FREE_AGENT' ? this.getClub(player.clubId) : undefined;
    const buyerLeague = this.competitions.find(c => c.id === buyer.leagueId);
    const sellerLeague = seller ? this.competitions.find(c => c.id === seller.leagueId) : undefined;
    const buyerLeagueRep = buyerLeague?.dynamicReputation ? buyerLeague.dynamicReputation * 100 : buyer.reputation;
    const sellerLeagueRep = sellerLeague?.dynamicReputation ? sellerLeague.dynamicReputation * 100 : (seller?.reputation || 3500);

    const buyerAppeal = buyer.reputation * 0.65 + buyerLeagueRep * 0.35;
    const sellerAppeal = seller ? seller.reputation * 0.65 + sellerLeagueRep * 0.35 : buyerAppeal;

    // Salario esperado y masa salarial mensual
    const buyerPlayers = this.getPlayersByClub(buyerClubId);
    const buyerStaff = this.getStaffByClub(buyerClubId);
    const currentPayroll = buyerPlayers.reduce((s, p) => s + p.salary, 0) + buyerStaff.reduce((s, st) => s + st.salary, 0);
    const remainingWageRoom = Math.round(buyer.finances.wageBudget - currentPayroll);
    const expectedSalary = type === 'PURCHASE'
      ? this.getRequestedSalary(player, buyer)
      : Math.max(500, Math.round(player.salary * (wageShare / 100)));
    const projectedMonthlyWage = currentPayroll + expectedSalary;

    const checkAmount = type === 'PURCHASE' ? Math.max(0, offerAmount ?? player.value) : 0;

    // 1. Validación financiera del comprador
    let economicOk = true;
    if (type === 'PURCHASE') {
      if (buyer.finances.transferBudget < checkAmount) {
        economicOk = false;
        reasons.push(`Presupuesto de fichajes insuficiente (disponible: £${buyer.finances.transferBudget.toLocaleString()}).`);
      }
      const debtFloor = -Math.max(500_000, buyer.reputation * 400);
      if (buyer.finances.balance < debtFloor) {
        economicOk = false;
        reasons.push('La tesorería está en déficit crítico y la directiva bloqueó compras.');
      }
    }
    if (projectedMonthlyWage > buyer.finances.wageBudget * 1.05) {
      economicOk = false;
      reasons.push(`Supera el tope salarial mensual (margen libre: £${Math.max(0, remainingWageRoom).toLocaleString()}/mes).`);
    }

    // 2. Precio pretendido por el club vendedor
    let askingPrice = player.value;
    if (player.transferStatus === 'TRANSFERABLE' || player.isTransferListed) {
      askingPrice = Math.round(player.value * 0.85);
    } else if (player.isUnhappyWithContract || player.transferRequestReason) {
      askingPrice = Math.round(player.value * 0.82);
    } else if (seller && this.wouldDropBelowMinimums(seller.id, player)) {
      askingPrice = Math.round(player.value * 1.55);
    } else if (player.isStarter) {
      askingPrice = Math.round(player.value * 1.25);
    } else {
      askingPrice = Math.round(player.value * 1.08);
    }
    if (player.releaseClause) {
      askingPrice = Math.min(askingPrice, player.releaseClause);
    }
    askingPrice = Math.max(10_000, askingPrice);

    // 3. Voluntad del jugador (prestigio de club + liga + nivel deportivo + edad + lealtad)
    const maxPurchaseCA = Math.round(78 + (buyerAppeal / 9500) * 114);
    const maxLoanCA = maxPurchaseCA + 12;
    const ceiling = type === 'PURCHASE' ? maxPurchaseCA : maxLoanCA;
    const caOverCeiling = player.currentAbility - ceiling;
    const appealGap = sellerAppeal - buyerAppeal;

    let interestLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'MEDIUM';
    let playerWilling = true;

    if (caOverCeiling > 6) {
      playerWilling = false;
      interestLevel = 'NONE';
      reasons.push(`${player.name} compite en la élite (nivel ${player.currentAbility}) y descarta bajar a un proyecto de menor jerarquía deportiva.`);
    } else if (
      type === 'PURCHASE' &&
      player.currentAbility >= 140 &&
      appealGap >= 2400 &&
      player.age < 32 &&
      player.transferStatus === 'NONE'
    ) {
      playerWilling = false;
      interestLevel = 'NONE';
      reasons.push(`${player.name} juega en ${seller?.name || 'un club superior'} (${sellerLeague?.name || 'liga top'}) y no aceptará bajar de categoría.`);
    } else if (buyerAppeal >= sellerAppeal + 700) {
      interestLevel = 'HIGH';
    } else if (caOverCeiling > 0 || (appealGap > 1100 && player.transferStatus === 'NONE')) {
      interestLevel = 'LOW';
      reasons.push(`Desconfía del salto deportivo hacia ${buyer.name}; pedirá condiciones exigentes.`);
    } else if (player.loyalty >= 17 && buyer.reputation < (seller?.reputation || 0) + 500 && !player.isUnhappyWithContract && player.transferStatus === 'NONE') {
      interestLevel = 'LOW';
      reasons.push(`${player.name} tiene alta lealtad hacia ${seller?.shortName || 'su club'}.`);
    } else if (player.transferStatus === 'TRANSFERABLE' || player.transferStatus === 'LOANABLE' || player.isUnhappyWithContract) {
      interestLevel = 'HIGH';
    }

    const sellerShortDepth = seller ? this.wouldDropBelowMinimums(seller.id, player) : false;
    const clubLikelyToAccept =
      type === 'PURCHASE'
        ? !sellerShortDepth && checkAmount >= askingPrice * 0.92
        : (player.transferStatus === 'LOANABLE' || (!player.isStarter && player.age <= 24)) && wageShare >= 50;

    if (type === 'PURCHASE' && sellerShortDepth) {
      reasons.push(`${seller?.shortName || 'El club vendedor'} tiene pocos recambios en esa posición y pondrá trabas.`);
    }

    const allowed =
      player.clubId !== buyerClubId &&
      player.clubId !== 'FREE_AGENT' &&
      !(player.loanDetails && (type === 'LOAN' || type === 'LOAN_TO_BUY')) &&
      economicOk &&
      playerWilling;

    return {
      allowed,
      clubLikelyToAccept,
      playerWilling,
      interestLevel,
      askingPrice,
      expectedSalary,
      projectedMonthlyWage,
      remainingWageRoom,
      reasons,
    };
  }

  makeTransferOffer(
    playerId: string,
    fromClubId: string,
    amount: number,
    type: 'PURCHASE' | 'LOAN' | 'LOAN_TO_BUY',
    date: Date,
    wageShare = 100
  ): { ok: boolean; message: string; offer?: TransferOffer } {
    const player = this.getPlayer(playerId);
    if (!player) return { ok: false, message: 'Jugador no encontrado.' };

    const check = this.evaluateTransferViability(playerId, fromClubId, type, amount, wageShare);
    if (!check.allowed) {
      return {
        ok: false,
        message: check.reasons[0] || 'La operación no cumple con los requisitos deportivos o económicos.',
      };
    }

    const duplicate = this.offers.find(
      o =>
        o.playerId === playerId &&
        o.fromClubId === fromClubId &&
        (o.status === 'PENDING' || o.status === 'COUNTER_OFFER' || o.status === 'ACCEPTED')
    );
    if (duplicate) {
      return { ok: false, message: `Ya existe una negociación activa por ${player.name}.` };
    }

    let finalAmount = type === 'PURCHASE' ? Math.max(1000, Math.round(amount)) : 0;
    const userClub = this.getUserClub();
    const isUserBuyer = userClub?.id === fromClubId;

    if (type === 'PURCHASE' && player.releaseClause && finalAmount >= player.releaseClause && check.interestLevel !== 'NONE') {
      const offer: TransferOffer = { id: generateUUID(), playerId, fromClubId, toClubId: player.clubId, amount: finalAmount, wageShare, type, status: 'ACCEPTED', date, responseDate: date, isViewed: false };
      this.offers.push(offer);
      if (isUserBuyer || player.clubId === userClub?.id) {
        this.addInboxMessage('MARKET', `Cláusula activada: ${player.name}`, `${this.getClub(fromClubId)?.name} igualó la cláusula de rescisión de ${player.name} (£${finalAmount.toLocaleString()}). Ahora resta negociar el contrato personal.`, date, playerId, 'IMPORTANT');
      }
      return { ok: true, message: 'Cláusula activada. Negocia el contrato personal en Centro de Fichajes.', offer };
    }

    if (type === 'PURCHASE' && player.agent && Math.random() < 0.35) {
      const commission = Math.round(finalAmount * (player.agent.commission / 100) * 0.5);
      finalAmount += commission;
      if (isUserBuyer) {
        this.addInboxMessage('FINANCE', `Comisión del agente: ${player.name}`, `El agente ${player.agent.name} sumó una comisión de £${commission.toLocaleString()} sobre la operación.`, date, playerId, 'INFO');
      }
    }

    const offer: TransferOffer = { id: generateUUID(), playerId, fromClubId, toClubId: player.clubId, amount: finalAmount, wageShare, type, status: 'PENDING', date, responseDate: date, isViewed: false };
    this.offers.push(offer);

    if (userClub && player.clubId === userClub.id) {
      const buyerName = this.getClub(fromClubId)?.name || 'Un club interesado';
      this.addInboxMessage(
        'MARKET',
        `Oferta recibida por ${player.name}`,
        type === 'PURCHASE'
          ? `${buyerName} ofrece £${finalAmount.toLocaleString()} por el pase de ${player.name}. Revisa el Centro de Fichajes para aceptar, contraofertar o rechazar.`
          : `${buyerName} solicita la cesión de ${player.name} asumiendo el ${wageShare}% de su sueldo mensual.`,
        date,
        playerId,
        'IMPORTANT',
        true
      );
    }

    return { ok: true, message: 'Oferta enviada al club propietario.', offer };
  }

  acceptCounterOffer(offerId: string, date: Date) {
    const o = this.offers.find(offer => offer.id === offerId);
    if (!o) return;
    const agreedAmount = o.counterAmount || o.amount;
    const buyer = this.getClub(o.fromClubId);
    if (buyer && o.type === 'PURCHASE' && buyer.finances.transferBudget < agreedAmount) {
      return;
    }
    o.status = 'ACCEPTED';
    o.amount = agreedAmount;
    o.responseDate = date;
  }

  respondToIncomingOffer(
    offerId: string,
    action: 'ACCEPT' | 'REJECT' | 'COUNTER',
    counterAmount?: number,
    date: Date = new Date()
  ): { ok: boolean; message: string } {
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) return { ok: false, message: 'Oferta no encontrada.' };
    const player = this.getPlayer(offer.playerId);
    const buyer = this.getClub(offer.fromClubId);
    const seller = this.getClub(offer.toClubId);
    if (!player || !buyer || !seller) {
      offer.status = 'REJECTED';
      return { ok: false, message: 'Datos de la negociación inválidos.' };
    }

    if (action === 'REJECT') {
      offer.status = 'REJECTED';
      offer.responseDate = date;
      return { ok: true, message: `Rechazaste la propuesta de ${buyer.shortName} por ${player.name}.` };
    }

    if (action === 'ACCEPT') {
      if (offer.type === 'PURCHASE' && buyer.finances.transferBudget < offer.amount) {
        offer.status = 'REJECTED';
        offer.responseDate = date;
        return { ok: false, message: `${buyer.name} ya no dispone de presupuesto suficiente para cerrar la compra.` };
      }
      this.completeTransfer(offer);
      return { ok: true, message: `¡Venta/cesión cerrada! ${player.name} parte hacia ${buyer.name}.` };
    }

    // COUNTER
    const targetAmount = Math.max(10_000, Math.round(counterAmount || offer.amount * 1.2));
    offer.counterAmount = targetAmount;
    offer.responseDate = date;

    const willingnessCeiling = Math.min(buyer.finances.transferBudget, Math.round(player.value * 1.45));
    if (targetAmount <= willingnessCeiling && (targetAmount <= offer.amount * 1.28 || Math.random() < 0.65)) {
      offer.amount = targetAmount;
      this.completeTransfer(offer);
      this.addInboxMessage(
        'MARKET',
        `Contraoferta aceptada: ${player.name}`,
        `${buyer.name} aceptó tu pedido de £${targetAmount.toLocaleString()} y se cerró la transferencia de ${player.name}.`,
        date,
        player.id,
        'IMPORTANT'
      );
      return { ok: true, message: `¡${buyer.name} aceptó £${targetAmount.toLocaleString()} y cerró el fichaje!` };
    }

    offer.status = 'REJECTED';
    return {
      ok: true,
      message: `${buyer.name} consideró excesiva la contraoferta de £${targetAmount.toLocaleString()} y se retiró de la negociación.`,
    };
  }

  completeTransferWithContract(
    offer: TransferOffer,
    agreedSalary: number,
    contractYears: number,
    date: Date
  ): { ok: boolean; message: string } {
    const p = this.getPlayer(offer.playerId);
    const newClub = this.getClub(offer.fromClubId);
    const oldClub = this.getClub(offer.toClubId);
    if (!p || !newClub) return { ok: false, message: 'No se pudo completar la operación.' };

    if (offer.type === 'PURCHASE' && newClub.finances.transferBudget < offer.amount) {
      return { ok: false, message: 'Presupuesto de fichajes insuficiente para cerrar el traspaso.' };
    }

    const otherSalaries =
      this.getPlayersByClub(newClub.id).reduce((s, pl) => s + pl.salary, 0) +
      this.getStaffByClub(newClub.id).reduce((s, st) => s + st.salary, 0);
    if (otherSalaries + agreedSalary > newClub.finances.wageBudget * 1.05) {
      return { ok: false, message: 'El sueldo ofrecido supera el tope salarial mensual disponible.' };
    }

    if (oldClub && offer.type === 'PURCHASE') {
      oldClub.finances.balance += offer.amount;
      oldClub.finances.transferBudget += Math.round(offer.amount * 0.7);
    }
    if (offer.type === 'PURCHASE') {
      newClub.finances.balance -= offer.amount;
      newClub.finances.transferBudget = Math.max(0, newClub.finances.transferBudget - offer.amount);
      const signingBonus = Math.min(Math.round(offer.amount * 0.04), Math.round(agreedSalary * 1.5));
      if (signingBonus > 0) {
        newClub.finances.balance -= signingBonus;
        this.addInboxMessage('FINANCE', `Prima de fichaje: ${p.name}`, `Se abonó una prima única de £${signingBonus.toLocaleString()} por la firma de ${p.name}.`, date, p.id, 'INFO');
      }
    }

    const newComp = this.competitions.find(c => c.id === newClub.leagueId);
    const leagueRep = newComp?.dynamicReputation ? newComp.dynamicReputation * 100 : newClub.reputation;

    p.clubId = newClub.id;
    p.squad = p.age <= 19 && p.currentAbility < 95 ? 'U20' : 'SENIOR';
    p.isStarter = false;
    p.tacticalPosition = undefined;
    p.isTransferListed = false;
    p.transferStatus = 'NONE';
    p.salary = Math.max(500, Math.round(agreedSalary));
    p.contractExpiry = new Date(date.getFullYear() + Math.max(1, contractYears), 5, 30);
    p.isUnhappyWithContract = false;
    p.requestedSalary = undefined;
    p.negotiationAttempts = 0;
    p.value = computeRealisticPlayerValue({
      ca: p.currentAbility,
      pa: p.potentialAbility,
      age: p.age,
      clubRep: newClub.reputation,
      leagueRep,
      country: newClub.country,
    });
    p.releaseClause = Math.round(p.value * 2.2);

    if (oldClub) {
      this.invalidateClubCache(oldClub.id);
      this.updateClubMonthlyExpenses(oldClub.id);
    }
    this.invalidateClubCache(newClub.id);
    this.updateClubMonthlyExpenses(newClub.id);

    offer.status = 'COMPLETED';
    offer.responseDate = date;

    const userClubHere = this.getUserClub();
    if (userClubHere && (offer.fromClubId === userClubHere.id || offer.toClubId === userClubHere.id)) {
      this.addInboxMessage('MARKET', `Fichaje oficial: ${p.name}`, `${p.name} firmó por ${contractYears} año${contractYears > 1 ? 's' : ''} con ${newClub.name} (£${p.salary.toLocaleString()}/mes) tras acordarse el pase en £${offer.amount.toLocaleString()}.`, date, p.id, 'IMPORTANT', true);
      sendTransferNotification(p.name, newClub.name);
      this.addSeasonPage('SIGNING', `Fichaje: ${p.name}`, `${newClub.name} incorporó a ${p.name} desde ${oldClub?.name || 'otro club'} por £${offer.amount.toLocaleString()}.`, date, offer.amount > 500_000 ? 'HIGH' : 'MEDIUM');
    }
    if (oldClub) {
      this.generateTransferNews(p, oldClub, newClub, offer.amount, date);
    }

    return { ok: true, message: `¡${p.name} ya es nuevo jugador de ${newClub.name}!` };
  }

  signFreeAgent(
    playerId: string,
    clubId: string,
    agreedSalary: number,
    contractYears: number,
    date: Date
  ): { ok: boolean; message: string } {
    const p = this.getPlayer(playerId);
    const club = this.getClub(clubId);
    if (!p || !club || p.clubId !== 'FREE_AGENT') {
      return { ok: false, message: 'El jugador ya no está libre o no se encontró el club.' };
    }

    const currentPayroll =
      this.getPlayersByClub(club.id).reduce((s, pl) => s + pl.salary, 0) +
      this.getStaffByClub(club.id).reduce((s, st) => s + st.salary, 0);
    if (currentPayroll + agreedSalary > club.finances.wageBudget * 1.05) {
      return { ok: false, message: 'Superas el tope salarial mensual del club.' };
    }

    const comp = this.competitions.find(c => c.id === club.leagueId);
    const leagueRep = comp?.dynamicReputation ? comp.dynamicReputation * 100 : club.reputation;

    p.clubId = club.id;
    p.squad = 'SENIOR';
    p.isStarter = false;
    p.tacticalPosition = undefined;
    p.isTransferListed = false;
    p.transferStatus = 'NONE';
    p.salary = Math.max(500, Math.round(agreedSalary));
    p.contractExpiry = new Date(date.getFullYear() + Math.max(1, contractYears), 5, 30);
    p.isUnhappyWithContract = false;
    p.requestedSalary = undefined;
    p.negotiationAttempts = 0;
    p.value = computeRealisticPlayerValue({
      ca: p.currentAbility,
      pa: p.potentialAbility,
      age: p.age,
      clubRep: club.reputation,
      leagueRep,
      country: club.country,
    });
    p.releaseClause = Math.round(p.value * 2.2);

    this.invalidateClubCache(club.id);
    this.updateClubMonthlyExpenses(club.id);

    const isUser = club.id === this.getUserClub()?.id;
    if (isUser) {
      this.addInboxMessage('MARKET', `Agente libre fichado: ${p.name}`, `${p.name} llegó libre a ${club.name} por ${contractYears} temporada${contractYears > 1 ? 's' : ''} (£${p.salary.toLocaleString()}/mes).`, date, p.id, 'IMPORTANT', true);
      sendTransferNotification(p.name, club.name);
      this.addSeasonPage('SIGNING', `Fichaje libre: ${p.name}`, `${club.name} incorporó en condición de libre a ${p.name}.`, date, 'MEDIUM');
    }
    this.publishNews(isUser ? 'TU_CLUB' : 'MERCADO', {
      date,
      type: 'HEADLINE',
      headline: `${p.name} refuerza a ${club.shortName} como agente libre`,
      subheadline: `Contrato por ${contractYears} año${contractYears > 1 ? 's' : ''} a coste cero`,
      body: `${club.name} acordó la llegada de ${p.name} sin costo de traspaso. El vínculo rige hasta ${p.contractExpiry.getFullYear()}.`,
      clubId: club.id,
      playerId: p.id,
      isUserClubNews: isUser,
    });

    return { ok: true, message: `¡${p.name} firmó contrato como agente libre en ${club.name}!` };
  }

  completeTransfer(offer: TransferOffer) {
    const p = this.getPlayer(offer.playerId);
    if (p) {
        if (offer.type === 'LOAN' || offer.type === 'LOAN_TO_BUY') {
          this.completeLoan(offer);
          return;
        }
        const oldClub = this.getClub(p.clubId); const newClub = this.getClub(offer.fromClubId);
        if (oldClub && offer.type === 'PURCHASE') {
          oldClub.finances.balance += offer.amount;
          oldClub.finances.transferBudget += Math.round(offer.amount * 0.7);
        }
        if (newClub && offer.type === 'PURCHASE') {
          newClub.finances.balance -= offer.amount;
          newClub.finances.transferBudget = Math.max(0, newClub.finances.transferBudget - offer.amount);
          const signingBonus = Math.min(Math.round(offer.amount * 0.04), Math.round(p.salary * 1.5));
          if (signingBonus > 0) {
            newClub.finances.balance -= signingBonus;
            if (newClub.id === this.getUserClub()?.id) {
              this.addInboxMessage('FINANCE',
                `Prima de fichaje: ${p.name}`,
                `Se abonó una prima única de £${signingBonus.toLocaleString()} por la incorporación de ${p.name}.`,
                offer.date, p.id, 'INFO');
            }
          }
        }
        p.clubId = offer.fromClubId; p.isStarter = false; p.tacticalPosition = undefined;
        p.isTransferListed = false;
        p.transferStatus = 'NONE';
        if (newClub) {
          const newComp = this.competitions.find(c => c.id === newClub.leagueId);
          const leagueRep = newComp?.dynamicReputation ? newComp.dynamicReputation * 100 : newClub.reputation;
          p.salary = computeRealisticPlayerSalary({
            ca: p.currentAbility,
            age: p.age,
            squad: p.squad,
            clubRep: newClub.reputation,
            leagueRep,
            country: newClub.country,
          });
          p.value = computeRealisticPlayerValue({
            ca: p.currentAbility,
            pa: p.potentialAbility,
            age: p.age,
            clubRep: newClub.reputation,
            leagueRep,
            country: newClub.country,
          });
          p.releaseClause = Math.round(p.value * 2.2);
          p.contractExpiry = new Date(offer.date.getFullYear() + 3 + Math.floor(Math.random() * 2), 5, 30);
        }
        this.invalidateClubCache(offer.fromClubId);
        this.invalidateClubCache(offer.toClubId);
        this.updateClubMonthlyExpenses(offer.fromClubId);
        if (oldClub) this.updateClubMonthlyExpenses(oldClub.id);
        p.isUnhappyWithContract = false;
        p.requestedSalary = undefined;
        offer.status = 'COMPLETED';
        const userClubHere = this.getUserClub();
        if (userClubHere && (offer.fromClubId === userClubHere.id || offer.toClubId === userClubHere.id)) {
          this.addInboxMessage('MARKET', `Traspaso completado: ${p.name}`, `${p.name} se ha unido a ${newClub?.name || 'nuevo club'} por £${offer.amount.toLocaleString()}.`, offer.date, p.id, 'IMPORTANT', true);
          sendTransferNotification(p.name, newClub?.name || 'nuevo club');
          const isUserBuyer = offer.fromClubId === userClubHere.id;
          const clubName = this.getClub(isUserBuyer ? offer.fromClubId : offer.toClubId)?.name || 'Mi club';
          this.addSeasonPage(
            isUserBuyer ? 'SIGNING' : 'NEWS',
            isUserBuyer ? `Fichaje: ${p.name}` : `Salida: ${p.name}`,
            isUserBuyer
              ? `${clubName} cerró el fichaje de ${p.name} procedente de ${oldClub?.name || 'otro club'} por £${offer.amount.toLocaleString()}.`
              : `${p.name} dejó ${clubName} rumbo a ${newClub?.name || 'otro club'} por £${offer.amount.toLocaleString()}.`,
            offer.date,
            offer.amount > 500000 ? 'HIGH' : 'MEDIUM'
          );
          if (!isUserBuyer) {
            this.updateManagerProfileBiggestSale(p.name, offer.amount);
          }
        }
    }
  }

  processMatchDayIncome(homeClubId: string, competitionId: string, date: Date) {
    const club = this.getClub(homeClubId);
    if (!club) return;
    const comp = this.competitions.find(c => c.id === competitionId);
    const econ = getCountryEconomy(club.country);
    const attendance = Math.round(club.stadiumCapacity * (0.45 + (club.reputation / 10000) * 0.42 + Math.random() * 0.1));
    const baseTicket = (6 + (club.reputation / 9500) * 28) * (0.6 + econ * 0.4);
    const compMult =
      comp?.type === 'CONTINENTAL_ELITE' ? 1.85 :
      comp?.type === 'CONTINENTAL_SMALL' ? 1.35 :
      comp?.type === 'CUP' ? 1.15 :
      comp?.type === 'FRIENDLY' ? 0.55 : 1.0;
    const ticketPrice = Math.max(5, Math.min(80, Math.round(baseTicket * compMult)));
    const income = Math.round(attendance * ticketPrice);
    club.finances.balance += income;
    club.finances.monthlyIncome += income;
  }

  trackU21Minutes(clubId: string, squad: Player[], stats: Record<string, PlayerMatchStats>, currentDate: Date) {
    const club = this.getClub(clubId);
    if (!club) return;
    squad.forEach(p => {
      const s = stats[p.id];
      if (!s || s.minutesPlayed <= 0.1) return;
      const ageMs = currentDate.getTime() - p.birthDate.getTime();
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears < 21) {
        if (!club.u21MinutesThisSeason) club.u21MinutesThisSeason = 0;
        club.u21MinutesThisSeason += s.minutesPlayed;
      }
    });
  }

  rescindContract(playerId: string, date: Date) {
    const p = this.getPlayer(playerId);
    if (p) { 
      const oldClubId = p.clubId;
      const oldClub = this.getClub(oldClubId);
      const userClub = this.getUserClub();
      p.clubId = 'FREE_AGENT'; 
      p.isStarter = false; 
      p.tacticalPosition = undefined; 
      p.isTransferListed = false;
      p.transferStatus = 'NONE';
      this.invalidateClubCache(oldClubId);
      if (oldClub) this.updateClubMonthlyExpenses(oldClubId);
      if (oldClub && (oldClub.id === userClub?.id || p.currentAbility >= 145)) {
        const dt = this.managerProfile?.fullName;
        this.publishNews(oldClub.id === userClub?.id ? 'TU_CLUB' : 'MERCADO', {
          date,
          type: 'HEADLINE',
          headline: `${p.name} rescinde con ${oldClub.shortName}`,
          subheadline: 'El futbolista queda en condición de agente libre',
          body: `${oldClub.name}${oldClub.id === userClub?.id && dt ? ` (conducido por ${dt})` : ''} y ${p.name} acordaron la desvinculación inmediata. El jugador ya puede negociar con cualquier club.`,
          clubId: oldClub.id,
          playerId: p.id,
          isUserClubNews: oldClub.id === userClub?.id,
        });
      }
    }
  }

  createHumanManager(clubId: string, name: string) {
    const club = this.getClub(clubId);
    const salary = computeRealisticStaffSalary({
      skill: 13,
      role: 'HEAD_COACH',
      clubRep: club?.reputation || 3500,
      country: club?.country || 'Argentina',
    });
    const manager: Staff = { id: generateUUID(), name, age: 35, nationality: club?.country || "Argentina", role: 'HEAD_COACH', clubId, attributes: { coaching: 12, judgingAbility: 12, judgingPotential: 11, tacticalKnowledge: 10, adaptability: 10, medical: 2, physiotherapy: 2, motivation: 14, manManagement: 13 }, salary, contractExpiry: new Date(2028, 5, 30), history: [], personality: 'LEADER', morale: 100, reputation: 55, relationships: {}, pressReputation: 50, boardRelationship: 65 };
    this.staff = this.staff.filter(s => s.clubId !== clubId || s.role !== 'HEAD_COACH');
    this.staff.unshift(manager);
    this.markStaffDirty();
    this.updateClubMonthlyExpenses(clubId);
  }

  replaceHeadCoach(managerData: RealManager, clubId: string, fired: boolean) {
    const fullName = `${managerData.name} ${managerData.surname}`;
    const club = this.getClub(clubId);
    const avgSkill = Math.round(
      ((managerData.attributes.coaching || 12) +
        (managerData.attributes.tacticalKnowledge || 12) +
        (managerData.attributes.manManagement || 12)) / 3
    );
    const manager: Staff = {
      id: managerData.id,
      name: fullName,
      age: managerData.age,
      nationality: managerData.nationality,
      role: 'HEAD_COACH',
      clubId,
      attributes: { ...managerData.attributes },
      salary: computeRealisticStaffSalary({
        skill: fired ? Math.max(8, avgSkill - 2) : avgSkill,
        role: 'HEAD_COACH',
        clubRep: club?.reputation || 3500,
        country: club?.country || managerData.nationality,
      }),
      contractExpiry: new Date(new Date().getFullYear() + 2, 5, 30), // 2-year contract
      history: [...managerData.history],
      personality: managerData.personality,
      morale: fired ? 60 : 100, // Lower morale if fired
      reputation: managerData.reputation,
      internationalReputation: managerData.internationalReputation,
      relationships: {},
      pressReputation: fired ? 30 : Math.min(100, managerData.reputation + 10),
      boardRelationship: fired ? 40 : 70, // Lower board relationship if fired
      biography: managerData.biography,
      preferredFormation: managerData.preferredFormation,
      tacticalStyle: managerData.tacticalStyle,
      pressIntensity: managerData.pressIntensity,
      possessionVsCounter: managerData.possessionVsCounter,
      playingStyle: managerData.playingStyle,
      careerHonours: managerData.careerHonours,
      previousClubs: managerData.previousClubs,
    };
    populateStaffPastHistory(manager, this.getClub(clubId), this.getClubPoolIndex(), this.getBaseCareerYear());
    this.staff = this.staff.filter(s => s.clubId !== clubId || s.role !== 'HEAD_COACH');
    this.staff.unshift(manager);
    this.markStaffDirty();
  }

  createManagerProfile(clubId: string | null, name: string, surname: string, nationality: string, origin: ManagerOrigin, birthDate: Date, startDate: Date, nationalTeamId: string | null = null): ManagerProfile {
    const club = clubId ? this.getClub(clubId) : undefined;
    const clubName = club?.name || 'Sin club';
    const nationalTeam = nationalTeamId ? this.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === nationalTeamId) : undefined;
    const objective = clubId ? this.getClubObjective(clubId) : nationalTeam ? `Clasificar y competir con ${nationalTeam.name}` : 'Construir una carrera internacional';
    this.managerProfile = {
      name, surname, fullName: `${name} ${surname}`,
      nationality, birthDate, careerStartDate: startDate, origin,
      currentClubId: clubId, currentClubName: clubName,
      currentNationalTeamId: nationalTeamId,
      currentNationalTeamName: nationalTeam?.name,
      careerMode: clubId && nationalTeamId ? 'BOTH' : nationalTeamId ? 'NATIONAL' : 'CLUB',
      seasonInClub: 1, yearsInClub: 0,
      totalGames: 0, totalWins: 0, totalDraws: 0, totalLosses: 0,
      goalsFor: 0, goalsAgainst: 0,
      titles: [], youthDebuts: 0, mostUsedPlayer: 'Ninguno',
      biggestSale: null,
      currentObjective: objective,
      boardRelationship: 'CALM', pressRelationship: 'CALM', fansRelationship: 'CALM',
      clubHistory: clubId ? [{ clubId, clubName, startDate: new Date(startDate), seasons: 0, titles: [] }] : [],
      legacy: '',
    };
    return this.managerProfile;
  }

  updateManagerProfileMatch(userScore: number, oppScore: number) {
    if (!this.managerProfile) return;
    const p = this.managerProfile;
    p.totalGames++;
    p.goalsFor += userScore;
    p.goalsAgainst += oppScore;
    if (userScore > oppScore) p.totalWins++;
    else if (userScore < oppScore) p.totalLosses++;
    else p.totalDraws++;

    // Update most used player
    const userClub = this.getUserClub();
    if (userClub) {
      const squad = this.getPlayersByClub(userClub.id).filter(pl => pl.squad === 'SENIOR' && pl.seasonStats && pl.seasonStats.appearances > 0);
      if (squad.length > 0) {
        const mostUsed = squad.sort((a, b) => b.seasonStats.appearances - a.seasonStats.appearances)[0];
        if (mostUsed && mostUsed.seasonStats.appearances >= 3) {
          p.mostUsedPlayer = mostUsed.name;
        }
      }
    }

    // Update relationships based on result
    if (userScore > oppScore) {
      if (p.fansRelationship === 'WORRIED' || p.fansRelationship === 'ANGRY') p.fansRelationship = 'CALM';
      else if (p.fansRelationship === 'CALM') p.fansRelationship = 'HAPPY';
    } else if (userScore < oppScore) {
      if (p.fansRelationship === 'HAPPY') p.fansRelationship = 'CALM';
      else if (p.fansRelationship === 'CALM') p.fansRelationship = 'WORRIED';
      else if (p.fansRelationship === 'WORRIED' && Math.random() < 0.3) p.fansRelationship = 'ANGRY';
    }
  }

  updateManagerProfileYouthDebut() {
    if (this.managerProfile) this.managerProfile.youthDebuts++;
  }

  updateManagerProfileBiggestSale(playerName: string, amount: number) {
    if (!this.managerProfile) return;
    if (!this.managerProfile.biggestSale || amount > this.managerProfile.biggestSale.amount) {
      this.managerProfile.biggestSale = { player: playerName, amount };
    }
  }

  updateManagerProfileSeasonEnd(wonTitle: boolean, titleNames: string[], leaguePosition: number, totalTeams: number) {
    if (!this.managerProfile) return;
    const p = this.managerProfile;
    p.seasonInClub++;
    p.yearsInClub++;

    if (wonTitle) {
      titleNames.forEach(t => {
        if (!p.titles.includes(t)) p.titles.push(t);
      });
    }

    const currentEntry = p.clubHistory.find(e => e.clubId === p.currentClubId && !e.endDate);
    if (currentEntry) {
      currentEntry.seasons++;
      if (wonTitle) {
        titleNames.forEach(t => {
          if (!currentEntry.titles.includes(t)) currentEntry.titles.push(t);
        });
      }
    }

    // Update relationships based on season performance
    const winRate = p.totalGames > 0 ? p.totalWins / p.totalGames : 0;
    const midTable = totalTeams / 2;
    if (leaguePosition <= midTable * 0.3) {
      p.boardRelationship = 'HAPPY';
      p.fansRelationship = 'HAPPY';
    } else if (leaguePosition <= midTable) {
      p.boardRelationship = 'CALM';
    } else {
      p.boardRelationship = 'WORRIED';
      if (leaguePosition >= totalTeams - 2) {
        p.boardRelationship = 'ANGRY';
        p.fansRelationship = 'ANGRY';
      }
    }

    // Update press relationship
    if (winRate >= 0.6) p.pressRelationship = 'HAPPY';
    else if (winRate >= 0.4) p.pressRelationship = 'CALM';
    else p.pressRelationship = 'WORRIED';

    // Update next objective
    p.currentObjective = this.getClubObjective(p.currentClubId);
  }

  getClubObjective(clubId: string | null): string {
    const club = this.getClub(clubId);
    if (!club) return 'Permanecer en la categoría';
    const league = this.competitions.find(c => c.id === club.leagueId);
    const clubsInLeague = this.clubs.filter(c => c.leagueId === club.leagueId);
    const clubRep = clubsInLeague.sort((a, b) => b.reputation - a.reputation);
    const position = clubRep.findIndex(c => c.id === clubId);
    const total = clubRep.length;
    if (position === 0) return 'Ganar el campeonato';
    if (position <= 2) return 'Pelear por el título';
    if (position <= Math.ceil(total * 0.25)) return 'Clasificar a competición continental';
    if (position <= Math.ceil(total * 0.5)) return 'Finalizar en mitad alta';
    if (position <= total - 3) return 'Consolidar la categoría';
    return 'Evitar el descenso';
  }

  startNewClub(clubId: string, startDate: Date) {
    if (!this.managerProfile) return;
    const club = this.getClub(clubId);
    if (!club) return;
    // Close previous club entry
    const prevEntry = this.managerProfile.clubHistory.find(e => e.clubId === this.managerProfile!.currentClubId && !e.endDate);
    if (prevEntry) prevEntry.endDate = new Date(startDate);

    this.managerProfile.currentClubId = clubId;
    this.managerProfile.currentClubName = club.name;
    this.managerProfile.seasonInClub = 1;
    this.managerProfile.yearsInClub = 0;
    this.managerProfile.boardRelationship = 'CALM';
    this.managerProfile.pressRelationship = 'CALM';
    this.managerProfile.fansRelationship = 'CALM';
    this.managerProfile.currentObjective = this.getClubObjective(clubId);
    this.managerProfile.clubHistory.push({ clubId, clubName: club.name, startDate: new Date(startDate), seasons: 0, titles: [] });
  }

  getRequestedSalary(player: Player, club: Club) {
    const comp = this.competitions.find(c => c.id === club.leagueId);
    const leagueRep = comp?.dynamicReputation ? comp.dynamicReputation * 100 : club.reputation;
    const marketSalary = computeRealisticPlayerSalary({
      ca: player.currentAbility,
      age: player.age,
      squad: player.squad,
      clubRep: club.reputation,
      leagueRep,
      country: club.country,
    });
    const isSameClub = player.clubId === club.id;
    let rawTarget: number;
    if (isSameClub) {
      const loyaltyDisc = player.loyalty >= 15 ? 0.94 : 1.0;
      const unhappyPrem = player.isUnhappyWithContract ? 1.12 : 1.05;
      rawTarget = Math.max(player.salary * unhappyPrem, marketSalary * 1.02) * loyaltyDisc;
    } else if (player.clubId === 'FREE_AGENT') {
      rawTarget = Math.max(marketSalary * 0.95, player.salary * 0.85);
    } else {
      const seller = this.getClub(player.clubId);
      const steppingUp = !seller || club.reputation >= seller.reputation;
      rawTarget = steppingUp
        ? Math.max(marketSalary * 1.08, player.salary * 1.12)
        : Math.max(marketSalary * 1.02, player.salary * 0.9);
    }
    const step = rawTarget >= 20_000 ? 500 : 100;
    return Math.max(800, Math.round(rawTarget / step) * step);
  }

  submitContractOffer(player: Player, salary: number, years: number, date: Date, targetClub?: Club) {
    const club = targetClub || this.getClub(player.clubId);
    if (!club) return 'REJECTED';
    const requested = this.getRequestedSalary(player, club);
    const userClub = this.getUserClub();
    const isUser = Boolean(userClub && club.id === userClub.id);
    const isRenewal = player.clubId === club.id;
    player.negotiationAttempts++;
    if (salary >= requested) {
      if (isRenewal) {
        player.salary = salary;
        player.contractExpiry = new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
        player.isUnhappyWithContract = false;
        player.requestedSalary = undefined;
        player.negotiationAttempts = 0;
        this.updateClubMonthlyExpenses(club.id);
        if (isUser || player.currentAbility >= 145) {
          this.publishNews(isUser ? 'TU_CLUB' : 'MERCADO', {
            date,
            type: 'PRAISE',
            headline: `${player.name} renueva con ${club.shortName}`,
            subheadline: `Nuevo vínculo por ${years} año${years > 1 ? 's' : ''}`,
            body: `${player.name} aceptó la propuesta de ${club.name} y extendió su contrato por ${years} temporada${years > 1 ? 's' : ''} a razón de £${salary.toLocaleString()}/mes.`,
            clubId: club.id,
            playerId: player.id,
            isUserClubNews: isUser,
          });
        }
      }
      return 'ACCEPTED';
    }
    if (salary >= requested * 0.88) {
      const acceptChance = (isRenewal ? player.loyalty / 20 : 0.35) + 0.15;
      if (Math.random() < acceptChance) {
        if (isRenewal) {
          player.salary = salary;
          player.contractExpiry = new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
          player.isUnhappyWithContract = false;
          player.requestedSalary = undefined;
          player.negotiationAttempts = 0;
          this.updateClubMonthlyExpenses(club.id);
          if (isUser || player.currentAbility >= 145) {
            this.publishNews(isUser ? 'TU_CLUB' : 'MERCADO', {
              date,
              type: 'PRAISE',
              headline: `Acuerdo cerrado: ${player.name} sigue en ${club.shortName}`,
              subheadline: `Contrato firmado hasta ${player.contractExpiry.getFullYear()}`,
              body: `Tras negociar con la directiva de ${club.name}, ${player.name} aceptó renovar por ${years} año${years > 1 ? 's' : ''} (£${salary.toLocaleString()}/mes).`,
              clubId: club.id,
              playerId: player.id,
              isUserClubNews: isUser,
            });
          }
        }
        return 'ACCEPTED';
      }
    }
    if (player.negotiationAttempts >= 3) {
      player.negotiationAttempts = 0;
      if (isUser && isRenewal) {
        this.publishNews('TU_CLUB', {
          date,
          type: 'CRITICISM',
          headline: `Se estanca la renovación de ${player.name}`,
          subheadline: `El jugador rechazó la última oferta de ${club.shortName}`,
          body: `Las conversaciones entre ${player.name} y la cúpula de ${club.name} quedaron rotas tras varios desacuerdos salariales. Su futuro queda abierto.`,
          clubId: club.id,
          playerId: player.id,
          isUserClubNews: true,
        });
      }
      return 'BROKEN';
    }
    return 'REJECTED';
  }

  processAIActivity(date: Date) {
    this.processPendingOffers(date);
    const userClub = this.getUserClub();

    // Demanda activa de la IA por jugadores declarados transferibles/cedibles o figuras del usuario
    if (userClub && Math.random() < 0.35) {
      const userMarketPlayers = this.getPlayersByClub(userClub.id).filter(
        p => !p.loanDetails && (p.transferStatus === 'TRANSFERABLE' || p.transferStatus === 'LOANABLE' || (p.squad === 'SENIOR' && p.currentAbility >= 115 && Math.random() < 0.12))
      );
      if (userMarketPlayers.length > 0) {
        const target = userMarketPlayers[randomInt(0, userMarketPlayers.length - 1)];
        const isLoanTarget = target.transferStatus === 'LOANABLE';
        const interestedBuyers = this.clubs
          .filter(c => c.id !== userClub.id && (isLoanTarget ? true : c.finances.transferBudget >= target.value * 0.7))
          .sort((a, b) => Math.abs(a.reputation - userClub.reputation) - Math.abs(b.reputation - userClub.reputation))
          .slice(0, 18);

        for (const buyer of interestedBuyers) {
          if (Math.random() > 0.35) continue;
          const offerType: 'PURCHASE' | 'LOAN' = isLoanTarget ? 'LOAN' : 'PURCHASE';
          const offerAmount = offerType === 'PURCHASE'
            ? Math.round(target.value * (target.transferStatus === 'TRANSFERABLE' ? (0.78 + Math.random() * 0.24) : (0.95 + Math.random() * 0.25)))
            : 0;
          const res = this.makeTransferOffer(target.id, buyer.id, offerAmount, offerType, date, isLoanTarget ? 60 : 100);
          if (res.ok) break;
        }
      }
    }

    if (Math.random() > 0.15) return;
    const allClubs = this.clubs;
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);

    // Pools de candidatos: una sola pasada sobre el mundo en lugar de un scan por club
    const byPosition = new Map<Position, Player[]>();
    const youthPool: Player[] = [];
    const loanPool: Player[] = [];
    for (const p of this.players) {
      if (p.age < 25 && p.currentAbility < 140 && !p.loanDetails &&
          (p.transferStatus === 'LOANABLE' || p.isTransferListed)) loanPool.push(p);
      if (p.clubId === 'FREE_AGENT' || p.squad !== 'SENIOR') continue;
      for (const pos of p.positions) {
        const arr = byPosition.get(pos);
        if (arr) arr.push(p); else byPosition.set(pos, [p]);
      }
      if (p.age >= 16 && p.age <= 22 && p.potentialAbility >= 140) youthPool.push(p);
    }

    const u20Counts = new Map<string, number>();
    const clubPosCoverage = new Map<string, Set<Position>>();
    for (const c of allClubs) {
      const squad = this.getPlayersByClub(c.id);
      let u20 = 0;
      const covered = new Set<Position>();
      for (const sp of squad) {
        if (sp.squad === 'U20') u20++;
        for (const pos of sp.positions) covered.add(pos);
      }
      u20Counts.set(c.id, u20);
      clubPosCoverage.set(c.id, covered);
    }

    // Cross-league: DEEP clubs can make offers to any DEEP league club
    if (Math.random() < 0.22) {
      const deepClubs = allClubs.filter(c => deepIds.has(c.leagueId) && c.finances.transferBudget > 40000);
      if (deepClubs.length >= 2) {
        const buyer = deepClubs[Math.floor(Math.random() * deepClubs.length)];
        const targets = this.players.filter(p =>
          p.clubId !== buyer.id && deepIds.has(this.getClub(p.clubId)?.leagueId || '') &&
          (p.isTransferListed || p.transferStatus === 'TRANSFERABLE') &&
          p.value <= buyer.finances.transferBudget * 0.65
        );
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          this.makeTransferOffer(target.id, buyer.id, Math.round(target.value * (0.82 + Math.random() * 0.3)), 'PURCHASE', date);
        }
      }
    }

    // AI sell phase (solo clubes IA, nunca toca la lista del usuario)
    allClubs.forEach(club => {
      if (userClub && club.id === userClub.id) return;
      const seniorPlayers = this.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR');
      const surplus: Player[] = [];
      const gkList = seniorPlayers.filter(p => p.positions.includes(Position.GK));
      if (gkList.length > 3) surplus.push(...gkList.slice(3));
      const defList = seniorPlayers.filter(p => ['SW','DC','DR','DL'].some(pos => p.positions.includes(pos as Position)));
      if (defList.length > 7) surplus.push(...defList.slice(7));
      const midList = seniorPlayers.filter(p => ['DM','MC','ML','MR','AM'].some(pos => p.positions.includes(pos as Position)));
      if (midList.length > 7) surplus.push(...midList.slice(7));
      const fwdList = seniorPlayers.filter(p => p.positions.includes(Position.ST));
      if (fwdList.length > 4) surplus.push(...fwdList.slice(4));
      surplus.forEach(p => {
        p.isTransferListed = true;
        if (p.transferStatus === 'NONE') p.transferStatus = 'TRANSFERABLE';
      });
    });

    // AI buy phase (con validación económica y de prestigio real)
    allClubs.forEach(club => {
      if (userClub && club.id === userClub.id) return;
      if (club.finances.transferBudget < 30_000) return;
      const needPositions = this.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR' && !p.injury);
      const weakPositions: Position[] = [];
      if (needPositions.filter(p => p.positions.includes(Position.GK)).length < 2) weakPositions.push(Position.GK);
      if (needPositions.filter(p => ['SW','DC','DR','DL'].some(pos => p.positions.includes(pos as Position))).length < 5) weakPositions.push(Position.DC, Position.DR);
      if (needPositions.filter(p => ['DM','MC','ML','MR','AM'].some(pos => p.positions.includes(pos as Position))).length < 4) weakPositions.push(Position.MC);
      if (needPositions.filter(p => p.positions.includes(Position.ST)).length < 2) weakPositions.push(Position.ST);
      if (weakPositions.length === 0) return;
      const targetPos = weakPositions[randomInt(0, weakPositions.length - 1)];
      const candidates = (byPosition.get(targetPos) || []).filter(p =>
        p.clubId !== club.id &&
        p.value <= club.finances.transferBudget * 0.85 &&
        Math.abs(p.currentAbility - (55 + (club.reputation / 10000) * 115)) < 24
      );
      if (candidates.length === 0) return;
      const target = candidates[randomInt(0, Math.min(8, candidates.length - 1))];
      const amount = Math.round(Math.min(target.value * (0.85 + Math.random() * 0.3), club.finances.transferBudget));
      if (amount < 15_000) return;
      this.makeTransferOffer(target.id, club.id, amount, 'PURCHASE', date);
    });

    // AI long-term buy phase: sign young talents with high potential
    allClubs.filter(c => (!userClub || c.id !== userClub.id) && c.finances.transferBudget >= 50_000).forEach(club => {
      if (Math.random() > 0.12) return;
      const youngTalents = youthPool.filter(p =>
        p.clubId !== club.id &&
        p.value <= club.finances.transferBudget * 0.8
      );
      if (youngTalents.length === 0) return;
      const target = youngTalents[randomInt(0, Math.min(4, youngTalents.length - 1))];
      const amount = Math.round(Math.min(target.value * 1.15, club.finances.transferBudget));
      if (amount < 20_000) return;
      this.makeTransferOffer(target.id, club.id, amount, 'PURCHASE', date);
    });

    // AI sell old players phase: transfer-list players over 32 with declining trend (solo clubes IA)
    allClubs.forEach(club => {
      if (userClub && club.id === userClub.id) return;
      const oldPlayers = this.getPlayersByClub(club.id).filter(p =>
        p.age >= 32 && p.developmentTrend === 'DECLINING' && !p.isTransferListed
      );
      oldPlayers.forEach(p => {
        p.isTransferListed = true;
        if (p.transferStatus === 'NONE') p.transferStatus = 'TRANSFERABLE';
      });
    });

    // AI loan request for weak positions
    allClubs.forEach(club => {
      if (userClub && club.id === userClub.id) return;
      const needPositions = this.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR' && !p.injury);
      const weakPositions: Position[] = [];
      if (needPositions.filter(p => p.positions.includes(Position.GK)).length < 2) weakPositions.push(Position.GK);
      if (needPositions.filter(p => ['DC','DR','DL'].some(pos => p.positions.includes(pos as Position))).length < 4) weakPositions.push(Position.DC);
      if (needPositions.filter(p => ['DM','MC','ML','MR','AM'].some(pos => p.positions.includes(pos as Position))).length < 3) weakPositions.push(Position.MC);
      if (needPositions.filter(p => p.positions.includes(Position.ST)).length < 2) weakPositions.push(Position.ST);
      if (weakPositions.length === 0) return;
      const targetPos = weakPositions[randomInt(0, weakPositions.length - 1)];
      const loanCandidates = loanPool.filter(p =>
        p.clubId !== club.id && p.positions.includes(targetPos)
      );
      if (loanCandidates.length === 0) return;
      const target = loanCandidates[randomInt(0, loanCandidates.length - 1)];
      this.makeTransferOffer(target.id, club.id, 0, 'LOAN', date, 60);
    });
  }

  processLightMarketActivity(date: Date) {
    if (Math.random() > 0.03) return;
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);
    const lightClubs = this.clubs.filter(c => !deepIds.has(c.leagueId) && c.finances.transferBudget > 40_000);
    if (lightClubs.length < 2) return;

    const buyer = lightClubs[randomInt(0, lightClubs.length - 1)];
    const buyerLeague = this.competitions.find(c => c.id === buyer.leagueId);
    const candidates = this.players.filter(p => {
      if (p.clubId === buyer.id || p.clubId === 'FREE_AGENT' || p.squad !== 'SENIOR') return false;
      const sellerClub = this.getClub(p.clubId);
      if (!sellerClub || deepIds.has(sellerClub.leagueId)) return false;
      const sameCountry = sellerClub.country === buyer.country;
      const sameConfederation = buyerLeague?.confederation &&
        this.competitions.find(c => c.id === sellerClub.leagueId)?.confederation === buyerLeague.confederation;
      return (sameCountry || sameConfederation) && p.value <= buyer.finances.transferBudget * 0.7;
    });

    if (candidates.length === 0) return;
    const target = candidates[randomInt(0, Math.min(3, candidates.length - 1))];
    const amount = Math.round(Math.min(target.value * 0.95, buyer.finances.transferBudget * 0.6));
    if (amount < 15_000) return;

    this.makeTransferOffer(target.id, buyer.id, amount, 'PURCHASE', date);
  }

  processDailyContracts(date: Date, userClubId?: string) {
    if (userClubId) {
      const userClub = this.getClub(userClubId);
      const userPlayers = this.getPlayersByClub(userClubId);
      userPlayers.forEach(p => {
        if (p.contractExpiry < date && !p.isUnhappyWithContract) {
          p.isUnhappyWithContract = true;
          p.requestedSalary = this.getRequestedSalary(p, userClub!);
          this.addInboxMessage('SQUAD', `${p.name} — Contrato por vencer`, `A ${p.name} le queda menos de un año de contrato. Solicita £${p.requestedSalary.toLocaleString()}/mes. Renovalo o podría buscar otros horizontes.`, date, p.id);
          if (userClub && p.squad === 'SENIOR') {
            this.publishNews('TU_CLUB', {
              date,
              type: 'RUMOR',
              headline: `${p.name} presiona por su contrato en ${userClub.shortName}`,
              subheadline: `Exige £${p.requestedSalary.toLocaleString()}/mes para renovar`,
              body: `El entorno de ${p.name} advierte que su vínculo con ${userClub.name} entró en zona crítica y espera una mejora salarial cercana a £${p.requestedSalary.toLocaleString()} mensuales.`,
              clubId: userClubId,
              playerId: p.id,
              isUserClubNews: true,
            });
          }
        }
        if (p.injury && p.injury.daysLeft === 1) {
          this.addInboxMessage('SQUAD', `${p.name} — Próximo a recuperarse`, `${p.name} se recuperará de su lesión mañana y estará disponible para la próxima convocatoria.`, date, p.id);
        }
      });
      const injuredPlayers = userPlayers.filter(p => p.injury && p.injury.daysLeft > 0);
      if (injuredPlayers.length > 0 && Math.random() < 0.3) {
        const worst = injuredPlayers.reduce((a, b) => (a.injury!.daysLeft > b.injury!.daysLeft ? a : b));
        this.addInboxMessage('SQUAD', `Parte médico: ${worst.name}`, `${worst.name} continúa recuperándose de ${worst.injury!.type}. Regreso estimado en ${worst.injury!.daysLeft} días.`, date, worst.id);
      }
    }
  }

  processTransferDecisions(date: Date) {
    this.processPendingOffers(date);
    const completedToday = this.offers.filter(o => o.status === 'COMPLETED' && o.date.toDateString() === date.toDateString());
    completedToday.forEach(offer => {
      if (offer.type === 'LOAN') return;
      const buyer = this.getClub(offer.fromClubId);
      const seller = this.getClub(offer.toClubId);
      const player = this.getPlayer(offer.playerId);
      if (buyer && seller && player) {
        // Noticia del diario (sección Mercado), para todos los traspasos del mundo
        this.generateTransferNews(player, seller, buyer, offer.amount, date);
      }
    });
  }

  checkRenewalTriggers(date: Date, userClubId?: string) {
    if (Math.random() > 0.05) return;
    let mutated = false;
    this.players.forEach(p => {
      if (p.contractExpiry < date && p.clubId !== 'FREE_AGENT') {
        const club = this.getClub(p.clubId);
        if (!club) return;
        const renewChance = 0.3 + (p.currentAbility / 200) * 0.3 + (club.reputation / 10000) * 0.2;
        if (Math.random() < renewChance) {
          p.contractExpiry = new Date(date.getFullYear() + 2, 5, 30);
        } else if (Math.random() < 0.3) {
          // Liberar primero y reconstruir los índices UNA sola vez al final
          // (invalidar por jugador disparaba miles de rebuilds de ~41k en el día posterior al 30/6)
          p.clubId = 'FREE_AGENT';
          mutated = true;
          const availableBudget = club.finances.wageBudget - this.getPlayersByClub(club.id).reduce((s, pl) => s + pl.salary, 0);
          if (availableBudget > 0) {
            const newSalary = Math.round(p.salary * (0.8 + Math.random() * 0.5));
            if (newSalary <= availableBudget) {
              p.salary = newSalary;
              p.contractExpiry = new Date(date.getFullYear() + 1, 5, 30);
              p.clubId = club.id;
            }
          }
        }
      }
    });
    if (mutated) this.markPlayersDirty();
  }

  processPendingOffers(date: Date) {
    const pending = this.offers.filter(o => o.status === 'PENDING' || o.status === 'COUNTER_OFFER');
    const userClub = this.getUserClub();
    pending.forEach(offer => {
      const player = this.getPlayer(offer.playerId);
      const sellerClub = this.getClub(offer.toClubId);
      const buyerClub = this.getClub(offer.fromClubId);
      const isUserSeller = Boolean(userClub && offer.toClubId === userClub.id);
      const isUserBuyer = Boolean(userClub && offer.fromClubId === userClub.id);
      const involvesUser = isUserSeller || isUserBuyer;

      if (!player || !sellerClub || !buyerClub || player.clubId !== sellerClub.id) {
        offer.status = 'REJECTED';
        offer.responseDate = date;
        return;
      }

      // Si el usuario es quien vende, dejar que el usuario decida (expira tras 14 días sin respuesta)
      if (isUserSeller) {
        const daysOld = Math.floor((date.getTime() - offer.date.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOld > 14) {
          offer.status = 'REJECTED';
          offer.responseDate = date;
        }
        return;
      }

      // Si había contraoferta para el usuario comprador, la dejamos en manos del usuario (expira en 10 días)
      if (offer.status === 'COUNTER_OFFER') {
        if (isUserBuyer) {
          const daysOld = Math.floor((date.getTime() - offer.responseDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysOld > 10) {
            offer.status = 'REJECTED';
          }
          return;
        }
        // Club comprador IA evalúa la contraoferta automáticamente
        const targetCounter = offer.counterAmount || offer.amount;
        if (buyerClub.finances.transferBudget >= targetCounter && targetCounter <= player.value * 1.35) {
          offer.amount = targetCounter;
          this.completeTransfer(offer);
        } else {
          offer.status = 'REJECTED';
          offer.responseDate = date;
        }
        return;
      }

      // Validar viabilidad deportiva y financiera antes de aceptar
      const viability = this.evaluateTransferViability(player.id, buyerClub.id, offer.type, offer.amount, offer.wageShare);
      if (!viability.allowed) {
        offer.status = 'REJECTED';
        offer.responseDate = date;
        if (isUserBuyer) {
          this.addInboxMessage('MARKET', `Negociación frustrada: ${player.name}`, viability.reasons[0] || `${sellerClub.name} cerró la puerta por ${player.name}.`, date, player.id, 'INFO');
        }
        return;
      }

      if (offer.type === 'LOAN' || offer.type === 'LOAN_TO_BUY') {
        const hasDepth = this.getPlayersByClub(sellerClub.id).filter(p => p.positions.some(pos => player.positions.includes(pos))).length > 2;
        const wageBoost = offer.wageShare >= 80 ? 0.25 : offer.wageShare >= 50 ? 0.1 : -0.2;
        const listedBoost = player.transferStatus === 'LOANABLE' ? 0.3 : 0;
        const acceptChance = Math.max(0.1, Math.min(0.95, (hasDepth ? 0.45 : 0.15) + wageBoost + listedBoost));
        if (Math.random() < acceptChance) {
          if (isUserBuyer) {
            offer.status = 'ACCEPTED';
            offer.responseDate = date;
            this.addInboxMessage('MARKET', `Cesión aceptada: ${player.name}`, `${sellerClub.name} aceptó ceder a ${player.name} (${offer.wageShare}% sueldo). Confirmalo en Centro de Fichajes.`, date, player.id, 'IMPORTANT', true);
          } else {
            this.completeLoan(offer);
          }
        } else {
          offer.status = 'REJECTED';
          offer.responseDate = date;
          if (involvesUser) {
            this.publishNews('MERCADO', {
              date,
              type: 'FEATURE',
              headline: `${sellerClub.shortName} frena la cesión de ${player.name}`,
              subheadline: `Rechazado el intento de ${buyerClub.shortName}`,
              body: `${sellerClub.name} decidió no ceder a ${player.name} ante la propuesta presentada por ${buyerClub.name}.`,
              clubId: userClub!.id,
              playerId: player.id,
              isUserClubNews: true,
            });
          }
        }
        return;
      }

      // Check if accepting would drop seller below minimums
      if (this.wouldDropBelowMinimums(sellerClub.id, player) && offer.amount < viability.askingPrice * 1.35) {
        offer.status = 'REJECTED';
        offer.responseDate = date;
        if (isUserBuyer) {
          this.addInboxMessage('MARKET', `${sellerClub.shortName} rechaza por falta de recambio`, `${sellerClub.name} no quiere desprenderse de ${player.name} porque dejaría despoblado el puesto.`, date, player.id, 'INFO');
        }
        return;
      }

      const ratio = offer.amount / Math.max(1, viability.askingPrice);
      if (ratio >= 0.96 || (ratio >= 0.88 && Math.random() < 0.72)) {
        if (isUserBuyer) {
          offer.status = 'ACCEPTED';
          offer.responseDate = date;
          this.addInboxMessage(
            'MARKET',
            `¡Oferta aceptada por ${player.name}!`,
            `${sellerClub.name} aceptó £${offer.amount.toLocaleString()} por ${player.name}. Ve al Centro de Fichajes para negociar su contrato personal.`,
            date,
            player.id,
            'IMPORTANT',
            true
          );
        } else {
          // Entre clubes IA, completar traspaso directamente si la operación es válida
          this.completeTransfer(offer);
        }
        if (involvesUser || offer.amount >= 12_000_000) {
          this.publishNews('MERCADO', {
            date,
            type: 'HEADLINE',
            headline: `Principio de acuerdo por ${player.name}`,
            subheadline: `${sellerClub.shortName} acepta la oferta de ${buyerClub.shortName} (£${offer.amount.toLocaleString()})`,
            body: `La directiva de ${sellerClub.name} dio luz verde a la propuesta de £${offer.amount.toLocaleString()} de ${buyerClub.name} por ${player.name}.`,
            clubId: involvesUser ? userClub!.id : buyerClub.id,
            playerId: player.id,
            isUserClubNews: involvesUser,
          });
        }
      } else if (ratio >= 0.65) {
        const counterAmount = Math.round(viability.askingPrice / 5_000) * 5_000 || viability.askingPrice;
        offer.status = 'COUNTER_OFFER';
        offer.counterAmount = counterAmount;
        offer.responseDate = date;
        if (isUserBuyer) {
          this.addInboxMessage(
            'MARKET',
            `Contraoferta de ${sellerClub.shortName} por ${player.name}`,
            `${sellerClub.name} rechazó £${offer.amount.toLocaleString()} y pide £${counterAmount.toLocaleString()} por ${player.name}.`,
            date,
            player.id,
            'IMPORTANT',
            true
          );
          this.publishNews('MERCADO', {
            date,
            type: 'RUMOR',
            headline: `${sellerClub.shortName} pide £${counterAmount.toLocaleString()} por ${player.name}`,
            subheadline: `Contraoferta sobre la mesa para ${buyerClub.shortName}`,
            body: `${sellerClub.name} fijó una contraoferta de £${counterAmount.toLocaleString()} para liberar a ${player.name}.`,
            clubId: userClub!.id,
            playerId: player.id,
            isUserClubNews: true,
          });
        }
      } else {
        offer.status = 'REJECTED';
        offer.responseDate = date;
        if (isUserBuyer) {
          this.addInboxMessage(
            'MARKET',
            `Oferta rechazada por ${player.name}`,
            `${sellerClub.name} consideró insuficiente la propuesta de £${offer.amount.toLocaleString()} (pretenden cerca de £${viability.askingPrice.toLocaleString()}).`,
            date,
            player.id,
            'INFO'
          );
          this.publishNews('MERCADO', {
            date,
            type: 'CRITICISM',
            headline: `${sellerClub.shortName} rechaza oferta por ${player.name}`,
            subheadline: `${buyerClub.shortName} había ofrecido £${offer.amount.toLocaleString()}`,
            body: `${sellerClub.name} desestimó la propuesta de ${buyerClub.name} por ${player.name} al considerarla muy por debajo de su tasación.`,
            clubId: userClub!.id,
            playerId: player.id,
            isUserClubNews: true,
          });
        }
      }
    });
  }

  private wouldDropBelowMinimums(clubId: string, playerToSell: any): boolean {
    const seniorPlayers = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
    if (seniorPlayers.length <= 16) return true;
    const position = playerToSell.positions[0];
    const positionDepth = seniorPlayers.filter(p => p.positions.includes(position)).length;
    if (position === Position.GK && positionDepth <= 2) return true;
    if (positionDepth <= 2) return true;
    return false;
  }

  completeLoan(offer: TransferOffer) {
    const p = this.getPlayer(offer.playerId);
    if (!p) return;
    const buyer = this.getClub(offer.fromClubId);
    const sellerId = p.clubId;
    const isLoanToBuy = offer.type === 'LOAN_TO_BUY';
    p.loanDetails = { originalClubId: sellerId, wageShare: offer.wageShare, loanToBuy: isLoanToBuy };
    p.clubId = offer.fromClubId;
    p.isStarter = false;
    p.tacticalPosition = undefined;
    p.isTransferListed = false;
    p.transferStatus = 'NONE';
    offer.status = 'COMPLETED';
    this.invalidateClubCache(sellerId);
    this.invalidateClubCache(offer.fromClubId);
    this.updateClubMonthlyExpenses(sellerId);
    this.updateClubMonthlyExpenses(offer.fromClubId);
    const userClubHere = this.getUserClub();
    if (userClubHere && (offer.fromClubId === userClubHere.id || offer.toClubId === userClubHere.id)) {
      this.addInboxMessage('MARKET', `Cedido: ${p.name}`, `${p.name} se marcha cedido a ${buyer?.name || 'nuevo club'}${isLoanToBuy ? ' (con opción de compra)' : ''} hasta final de temporada.`, offer.date, p.id, 'IMPORTANT');
    }
  }

  processLoanReturns(date: Date) {
    const seasonEndMonth = 6;
    if (date.getMonth() !== seasonEndMonth || date.getDate() > 7) return;
    this.players.forEach(p => {
      if (p.loanDetails) {
        const wasLoanToBuy = p.loanDetails.loanToBuy;
        this.invalidateClubCache(p.clubId);
        this.invalidateClubCache(p.loanDetails.originalClubId);
        p.clubId = p.loanDetails.originalClubId;
        p.loanDetails = undefined;
        p.isStarter = false;
        if (wasLoanToBuy) {
          const buyingClub = this.getClub(p.clubId);
          if (buyingClub && buyingClub.id) {
            const userClubHere = this.getUserClub();
            if (userClubHere && p.clubId === userClubHere.id) {
              this.addInboxMessage('MARKET', `Opción de compra: ${p.name}`, `El préstamo de ${p.name} ha finalizado. ${buyingClub.name} puede ejercer la opción de compra pagando su valor de mercado.`, date, p.id, 'IMPORTANT');
            }
          }
        }
      }
    });
  }

  // ─── Transfer Deadline Day ──────────────────────────────────────────────
  static isTransferDeadlineDay(date: Date): boolean {
    return (date.getMonth() === 0 && date.getDate() === 31) || 
           (date.getMonth() === 7 && date.getDate() === 31);
  }

  static isDeadlineWeek(date: Date): boolean {
    const deadline = new Date(date.getFullYear(), date.getMonth() === 7 ? 7 : 0, 31);
    const diff = deadline.getTime() - date.getTime();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }

  static getDaysUntilDeadline(date: Date): number {
    const deadline = new Date(date.getFullYear(), date.getMonth() === 7 ? 7 : 0, 31);
    const diff = deadline.getTime() - date.getTime();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  processDeadlineDay(date: Date) {
    if (!WorldManager.isTransferDeadlineDay(date)) return;
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);
    const buyingClubs = this.clubs.filter(c => c.finances.transferBudget > 35_000 && deepIds.has(c.leagueId));
    const transferablePlayers = this.players.filter(p => p.transferStatus === 'TRANSFERABLE' || p.isTransferListed);

    buyingClubs.forEach(club => {
      if (Math.random() > 0.28) return;
      const targets = transferablePlayers.filter(p => p.clubId !== club.id && p.value <= club.finances.transferBudget * 0.65);
      if (targets.length === 0) return;
      const target = targets[Math.floor(Math.random() * targets.length)];
      const offerAmount = Math.round(target.value * (0.8 + Math.random() * 0.35));
      this.makeTransferOffer(target.id, club.id, offerAmount, 'PURCHASE', date);
    });

    this.addInboxMessage('MARKET', 'DÍA LÍMITE DE FICHAJES', `¡Hoy cierra el mercado de pases! Se están ultimando las negociaciones.`, date, undefined, 'IMPORTANT');
    this.processPendingOffers(date);
  }

  processDeadlineWeekActivity(date: Date) {
    if (!WorldManager.isDeadlineWeek(date)) return;
    const daysLeft = WorldManager.getDaysUntilDeadline(date);
    if (Math.random() > 0.35) return;
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);
    const clubs = this.clubs.filter(c => c.finances.transferBudget > 35_000 && deepIds.has(c.leagueId));
    const club = clubs[Math.floor(Math.random() * clubs.length)];
    if (!club) return;

    const targets = this.players.filter(p =>
      (p.transferStatus === 'TRANSFERABLE' || p.isTransferListed) &&
      p.clubId !== club.id &&
      p.value <= club.finances.transferBudget * 0.6
    );
    if (targets.length === 0) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const offerAmount = Math.round(target.value * (0.85 + Math.random() * 0.3));
    const res = this.makeTransferOffer(target.id, club.id, offerAmount, 'PURCHASE', date);

    if (res.ok && daysLeft <= 2) {
      const userClubHere = this.getUserClub();
      if (userClubHere && (club.id === userClubHere.id || target.clubId === userClubHere.id)) {
        this.addInboxMessage('MARKET', `Última oportunidad: ${target.name}`, `${club.name} envió una oferta por ${target.name} — ¡quedan ${daysLeft} días de mercado!`, date, target.id, 'IMPORTANT');
      }
    }
  }

  evaluateBoardConfidence(clubId: string, leaguePosition: number, totalTeams: number, wonCup: boolean, cupSemis: boolean): number {
    const club = this.getClub(clubId);
    if (!club) return 0;
    const obj = club.seasonObjective;
    let confidenceChange = 0;
    switch (obj) {
      case 'WIN_LEAGUE':
        confidenceChange = leaguePosition === 1 ? 15 : leaguePosition <= 4 ? -5 : leaguePosition <= 10 ? -20 : -40;
        break;
      case 'TOP_4':
        confidenceChange = leaguePosition <= 4 ? 12 : leaguePosition <= 8 ? -3 : leaguePosition <= 12 ? -15 : -30;
        break;
      case 'TOP_HALF':
        confidenceChange = leaguePosition <= totalTeams / 2 ? 10 : leaguePosition <= totalTeams * 0.75 ? -8 : -20;
        break;
      case 'AVOID_RELEGATION':
        confidenceChange = leaguePosition > totalTeams - 3 ? 15 : leaguePosition > totalTeams * 0.75 ? 5 : leaguePosition > totalTeams / 2 ? -5 : -15;
        break;
      case 'WIN_CUP':
        confidenceChange = wonCup ? 20 : cupSemis ? 5 : -15;
        break;
      default:
        confidenceChange = leaguePosition <= totalTeams / 2 ? 5 : -5;
    }
    if (wonCup && obj !== 'WIN_CUP') confidenceChange += 10;

    // National team performance bonus
    if (this.nationalTeamManager) {
      const clubCountry = club.country;
      const nationalTeam = this.nationalTeamManager.nationalTeams.find((t: any) => t.country === clubCountry);
      if (nationalTeam) {
        // Check if any club players are in the national team
        const clubPlayersInNational = this.players.filter(p => 
          p.clubId === clubId && nationalTeam.playerIds.includes(p.id)
        );
        
        if (clubPlayersInNational.length > 0) {
          // Bonus for having national team players
          confidenceChange += clubPlayersInNational.length * 2;
          
          // Extra bonus for high-profile national team players
          const starPlayers = clubPlayersInNational.filter(p => p.currentAbility > 120);
          if (starPlayers.length > 0) {
            confidenceChange += starPlayers.length * 3;
          }
        }
      }
    }

    club.boardConfidence = Math.max(0, Math.min(100, club.boardConfidence + confidenceChange));
    if (club.boardConfidence <= 0) {
      this.addInboxMessage('SQUAD', '¡DIRECTIVA HARTA!',
        `La directiva de ${club.name} ha perdido toda la confianza en el entrenador tras los malos resultados.`,
        new Date(), undefined, 'CRITICAL');
    }
    return confidenceChange;
  }

  applySeasonObjectiveBonus(clubId: string, leaguePosition: number, totalTeams: number, wonCup: boolean, cupSemis: boolean): void {
    const club = this.getClub(clubId);
    if (!club) return;
    const obj = club.seasonObjective;
    let bonus = 0;
    let achieved = false;
    switch (obj) {
      case 'WIN_LEAGUE':
        if (leaguePosition === 1) { bonus = 500000; achieved = true; }
        break;
      case 'TOP_4':
        if (leaguePosition <= 4) { bonus = 300000; achieved = true; }
        break;
      case 'TOP_HALF':
        if (leaguePosition <= totalTeams / 2) { bonus = 150000; achieved = true; }
        break;
      case 'AVOID_RELEGATION':
        if (leaguePosition <= totalTeams - 3) { bonus = 100000; achieved = true; }
        break;
      case 'WIN_CUP':
        if (wonCup) { bonus = 400000; achieved = true; }
        break;
    }
    if (achieved) {
      club.finances.balance += bonus;
      club.boardConfidence = Math.min(100, (club.boardConfidence || 50) + 10);
      this.addInboxMessage('FINANCE', 'Bonus por objetivo cumplido',
        `La directiva ha aprobado un bonus de £${bonus.toLocaleString()} por cumplir el objetivo de temporada (${obj}).`, new Date(), undefined, 'IMPORTANT');
    }
  }

  requestFacilityUpgrade(clubId: string, facility: 'training' | 'youth', date: Date): { success: boolean; cost: number; message: string } {
    const club = this.getClub(clubId);
    if (!club) return { success: false, cost: 0, message: 'Club no encontrado' };
    const currentLevel = facility === 'training' ? club.trainingFacilities : club.youthFacilities;
    if (currentLevel >= 20) return { success: false, cost: 0, message: 'Las instalaciones ya están al máximo nivel' };
    const targetLevel = currentLevel + 1;
    const cost = Math.round(targetLevel * targetLevel * 50000);
    if (club.finances.balance < cost) return { success: false, cost, message: `Fondos insuficientes. Necesitas $${cost.toLocaleString()}` };
    const acceptChance = (club.boardConfidence / 100) * 0.7 + (club.reputation / 10000) * 0.3;
    const isUser = club.id === this.getUserClub()?.id;
    const dtName = this.managerProfile?.fullName || 'el DT';
    const facLabel = facility === 'training' ? 'instalaciones de entrenamiento' : 'instalaciones de juveniles';
    if (Math.random() > acceptChance) {
      club.boardConfidence = Math.max(0, club.boardConfidence - 5);
      this.addInboxMessage('FINANCE',
        `Directiva rechaza mejora de ${facility === 'training' ? 'entrenamiento' : 'juveniles'}`,
        `La directiva ha rechazado la solicitud de mejora. Consideran que no es el momento adecuado.`,
        date, undefined, 'IMPORTANT');
      if (isUser) {
        this.publishNews('TU_CLUB', {
          date,
          type: 'CRITICISM',
          headline: `La directiva de ${club.shortName} frena obras pedidas por ${dtName}`,
          subheadline: `Rechazado el proyecto para mejorar ${facLabel}`,
          body: `La comisión directiva de ${club.name} desestimó el pedido de ${dtName} para invertir £${cost.toLocaleString()} en ${facLabel}, priorizando cautela financiera.`,
          clubId, isUserClubNews: true,
        });
      }
      return { success: false, cost: 0, message: 'La directiva ha rechazado la solicitud' };
    }
    club.finances.balance -= cost;
    if (facility === 'training') {
      club.trainingFacilities = targetLevel;
      this.addInboxMessage('FINANCE', 'Mejora de instalaciones de entrenamiento',
        `La directiva aprobó la mejora. Nivel de entrenamiento: ${targetLevel}/20. Costo: $${cost.toLocaleString()}`, date);
    } else {
      club.youthFacilities = targetLevel;
      this.addInboxMessage('FINANCE', 'Mejora de instalaciones juveniles',
        `La directiva aprobó la mejora. Nivel juvenil: ${targetLevel}/20. Costo: $${cost.toLocaleString()}`, date);
    }
    if (isUser) {
      this.publishNews('TU_CLUB', {
        date,
        type: 'PRAISE',
        headline: `${club.shortName} aprueba inversión en ${facility === 'training' ? 'predio' : 'cantera'}`,
        subheadline: `Respaldo de la junta a ${dtName}: nivel ${targetLevel}/20 (£${cost.toLocaleString()})`,
        body: `La dirigencia de ${club.name} accedió al pedido de ${dtName} y destinó £${cost.toLocaleString()} para modernizar las ${facLabel} hasta nivel ${targetLevel}/20.`,
        clubId, isUserClubNews: true,
      });
    }
    return { success: true, cost, message: `Mejora aprobada. Nivel ${targetLevel}.` };
  }

  requestBudgetIncrease(clubId: string, date: Date): { success: boolean; amount: number; message: string } {
    const club = this.getClub(clubId);
    if (!club) return { success: false, amount: 0, message: 'Club no encontrado' };
    const requestedAmount = Math.round(club.finances.transferBudget * 0.3);
    const grantChance = (club.boardConfidence / 100) * 0.6 + (club.reputation / 10000) * 0.4;
    const isUser = club.id === this.getUserClub()?.id;
    const dtName = this.managerProfile?.fullName || 'el DT';
    if (Math.random() > grantChance) {
      club.boardConfidence = Math.max(0, club.boardConfidence - 3);
      this.addInboxMessage('FINANCE', 'Directiva rechaza aumento de presupuesto',
        `La directiva no considera prudente aumentar el presupuesto de fichajes en este momento.`, date, undefined, 'IMPORTANT');
      if (isUser) {
        this.publishNews('TU_CLUB', {
          date,
          type: 'CRITICISM',
          headline: `Cierre de grifo en ${club.shortName}: sin más fondos para fichajes`,
          subheadline: `La junta rechazó la ampliación solicitada por ${dtName}`,
          body: `Pese a la insistencia de ${dtName}, la directiva de ${club.name} negó el incremento presupuestario para incorporaciones en esta ventana.`,
          clubId, isUserClubNews: true,
        });
      }
      return { success: false, amount: 0, message: 'Rechazado' };
    }
    club.finances.transferBudget += requestedAmount;
    this.addInboxMessage('FINANCE', 'Aumento de presupuesto de fichajes',
      `La directiva aprobó un aumento de $${requestedAmount.toLocaleString()} en el presupuesto de fichajes.`, date);
    if (isUser) {
      this.publishNews('TU_CLUB', {
        date,
        type: 'PRAISE',
        headline: `${club.shortName} amplía la billetera de ${dtName}`,
        subheadline: `+$${requestedAmount.toLocaleString()} extra para el mercado de pases`,
        body: `En señal de confianza hacia ${dtName}, la directiva de ${club.name} aprobó una inyección de £${requestedAmount.toLocaleString()} en el presupuesto de fichajes.`,
        clubId, isUserClubNews: true,
      });
    }
    return { success: true, amount: requestedAmount, message: `Aprobado: +$${requestedAmount.toLocaleString()}` };
  }

  setSeasonObjective(clubId: string, objective: NonNullable<Club['seasonObjective']>, date: Date): { success: boolean; message: string } {
    const club = this.getClub(clubId);
    if (!club) return { success: false, message: 'Club no encontrado' };
    if (club.seasonObjective === objective) return { success: false, message: 'Ya es el objetivo vigente de la temporada.' };

    const labels: Record<string, string> = {
      WIN_LEAGUE: 'Ganar la Liga', TOP_4: 'Clasificar a competición europea (Top 4)',
      WIN_CUP: 'Ganar la Copa', CUP_SEMIS: 'Alcanzar semifinales de Copa',
      TOP_HALF: 'Terminar en la mitad superior', AVOID_RELEGATION: 'Evitar el descenso',
    };
    // Ambición: objetivos más exigentes tensan la relación con la directiva; los modestos la relajan.
    const ambition: Record<string, number> = {
      WIN_LEAGUE: 6, TOP_4: 4, WIN_CUP: 4, CUP_SEMIS: 2, TOP_HALF: 0, AVOID_RELEGATION: -3,
    };
    const ambitionScore = ambition[objective] ?? 0;
    const acceptChance = (club.boardConfidence / 100) * 0.6 + (club.reputation / 10000) * 0.4;
    const isUser = club.id === this.getUserClub()?.id;
    const dtName = this.managerProfile?.fullName || 'el DT';
    if (Math.random() > acceptChance) {
      club.boardConfidence = Math.max(0, club.boardConfidence - 5);
      this.addInboxMessage('SQUAD', 'Directiva rechaza el cambio de objetivo',
        `La directiva ha rechazado tu propuesta de fijar como objetivo \"${labels[objective]}\". Consideran que el momento no es adecuado para cambiar las exigencias.`, date, undefined, 'IMPORTANT');
      return { success: false, message: 'La directiva rechazó la propuesta.' };
    }
    club.seasonObjective = objective;
    club.boardConfidence = Math.max(0, Math.min(100, club.boardConfidence - ambitionScore));
    const confDirection = ambitionScore > 0 ? 'Se esperan exigencias mayores y la directiva estará más pendiente de tus resultados.' : ambitionScore < 0 ? 'La directiva valora tu prudencia y ha relajado la presión sobre el cargo.' : 'La directiva toma nota del objetivo consensuado.';
    this.addInboxMessage('SQUAD', 'Nuevo objetivo de temporada',
      `La directiva ha acordado fijar como objetivo de la temporada: \"${labels[objective]}\". ${confDirection}`, date);
    if (isUser) {
      this.publishNews('TU_CLUB', {
        date,
        type: 'FEATURE',
        headline: `${dtName} y la directiva fijan nuevo rumbo en ${club.shortName}`,
        subheadline: `Objetivo pactado: ${labels[objective]}`,
        body: `Tras una reunión en las oficinas de ${club.name}, el entrenador ${dtName} y la cúpula dirigencial consensuaron como meta oficial "${labels[objective]}".`,
        clubId, isUserClubNews: true,
      });
    }
    return { success: true, message: `Objetivo fijado: ${labels[objective]}` };
  }

  checkManagerJobOffers(date: Date, userClubId: string, managerReputation: number): void {
    if (managerReputation < 50) return;
    if (Math.random() > 0.06) return;
    const userClub = this.getClub(userClubId);
    if (!userClub) return;
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);
    const candidateClubs = this.clubs
      .filter(c => c.id !== userClubId && c.reputation > userClub.reputation * 1.1 && c.reputation <= userClub.reputation * 2.5)
      .filter(c => deepIds.has(c.leagueId)) // Prefer DEEP league clubs for visibility
      .slice(0, 5);
    if (candidateClubs.length === 0) return;
    const target = candidateClubs[randomInt(0, candidateClubs.length - 1)];
    this.addInboxMessage('STATEMENTS', `Oferta de trabajo: ${target.name}`,
      `El club ${target.name} está interesado en contratarte como entrenador. Tu reputación y resultados han llamado su atención.`,
      date, target.id, 'IMPORTANT', true);
  }

addInboxMessage(category: MessageCategory, subject: string, body: string, date: Date, relatedId?: string, priority: NotificationPriority = 'INFO', actionRequired = false) {
     this.inbox.unshift({ id: generateUUID(), date: new Date(date), category, priority, subject, body, isRead: false, relatedId, actionRequired: actionRequired || undefined });
     // Bandeja acotada: evita crecimiento sin límite (memoria, render y barridos diarios)
     if (this.inbox.length > 800) this.inbox.length = 800;
     // Push del navegador solo para asuntos Importantes/Críticos (las INFO no spamean)
     if (priority !== 'INFO') {
       sendInboxNotification(subject, priority);
     }
   }

  checkSquadRegistration(clubId: string, competitionId: string, date: Date): string[] {
    const comp = this.competitions.find(c => c.id === competitionId);
    if (!comp || !comp.squadRegistrationLimit) return [];
    const seniorPlayers = this.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
    const warnings: string[] = [];
    if (seniorPlayers.length > comp.squadRegistrationLimit) {
      warnings.push(`Plantilla excede el límite de ${comp.squadRegistrationLimit} jugadores. Necesitas liberar ${seniorPlayers.length - comp.squadRegistrationLimit} jugadores.`);
    }
    if (comp.u21Requirement) {
      const u21Count = seniorPlayers.filter(p => p.age < 21).length;
      if (u21Count < comp.u21Requirement) {
        warnings.push(`Necesitas al menos ${comp.u21Requirement} jugadores sub-21 en la plantilla (actual: ${u21Count}).`);
      }
    }
    if (warnings.length > 0) {
      this.addInboxMessage('COMPETITION', `Registro de plantilla - ${comp.name}`,
        warnings.join(' '), date, clubId);
    }
    return warnings;
  }

  generateScoutingReport(playerId: string, clubId: string, date: Date, userClubId?: string) {
    const player = this.getPlayer(playerId);
    if (!player) return null;

    const scouts = this.getStaffByClub(clubId).filter(s => s.role !== 'PHYSIO');
    const scoutAbility = scouts.length > 0
      ? scouts.reduce((a,b) => a + b.attributes.judgingAbility, 0) / scouts.length
      : 8;
    const scoutPotential = scouts.length > 0
      ? scouts.reduce((a,b) => a + b.attributes.judgingPotential, 0) / scouts.length
      : 8;

    const abilityError = Math.round((20 - scoutAbility) * (Math.random() * 5 - 2));
    const potentialError = Math.round((20 - scoutPotential) * (Math.random() * 6 - 3));

    const reportedCA = Math.max(1, Math.min(200, player.currentAbility + abilityError));
    const reportedPA = Math.max(1, Math.min(200, player.potentialAbility + potentialError));

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    const internalEntries = Object.entries(player.stats.internal).sort(([,a], [,b]) => b - a);

    if (internalEntries[0][1] >= 15) strengths.push(internalEntries[0][0]);
    if (internalEntries.length > 1 && internalEntries[1][1] >= 14) strengths.push(internalEntries[1][0]);
    if (internalEntries[internalEntries.length-1][1] <= 8) weaknesses.push(internalEntries[internalEntries.length-1][0]);

    const summary = reportedCA >= 150 ? "Jugador de clase mundial." :
      reportedCA >= 120 ? "Excelente jugador para el equipo." :
      reportedCA >= 100 ? "Jugador de primer nivel." :
      reportedCA >= 80 ? "Puede ser útil en la rotación." :
      "Jugador de relleno. No recomiendo su fichaje.";

    let personality = player.personality ? PLAYER_PERSONALITY_LABELS[player.personality] : "Equilibrado";

    const report: ScoutingReport = {
      id: generateUUID(),
      playerId,
      clubId,
      date: new Date(date),
      currentAbility: reportedCA,
      potentialAbility: reportedPA,
      summary,
      strengths,
      weaknesses,
      personality,
      isRead: false,
    };

    this.scoutingReports.unshift(report);

    if (clubId === userClubId) {
      this.addInboxMessage('SCOUTING', `Informe de ${player.name}`,
        `Nuestros ojeadores han completado un informe sobre ${player.name}. CA: ${reportedCA}/200, PA: ${reportedPA}/200.`,
        date, playerId
      );
    }

    return report;
  }

  processDailyScouting(date: Date, userClubId?: string) {
    if (!userClubId) return;
    const club = this.getClub(userClubId);
    if (!club) return;
    if (club.finances.scoutingBudget <= 0) return;

    const scouts = this.getStaffByClub(userClubId).filter(s => s.role === 'SCOUT' || s.role === 'HEAD_COACH' || s.role === 'ASSISTANT_MANAGER' || s.role === 'SPORTING_DIRECTOR');
    const scoutCount = Math.max(1, scouts.length);
    const dailyBudget = Math.round(club.finances.scoutingBudget / 365);
    const reportsToday = Math.min(scoutCount * 2, Math.max(1, Math.floor(dailyBudget / 200)));

    for (let i = 0; i < reportsToday; i++) {
      const alreadyReported = new Set(this.scoutingReports.filter(r => r.clubId === userClubId).map(r => r.playerId));
      const candidates = this.players.filter(p =>
        p.clubId !== userClubId &&
        !alreadyReported.has(p.id) &&
        p.age > 16
      );
      if (candidates.length === 0) break;
      const target = candidates[randomInt(0, candidates.length - 1)];
      club.finances.scoutingBudget = Math.max(0, club.finances.scoutingBudget - 150);
      this.generateScoutingReport(target.id, userClubId, date);
    }
  }

  getScoutingReports(clubId: string, limit = 50): ScoutingReport[] {
    return this.scoutingReports
      .filter(r => r.clubId === clubId)
      .slice(0, limit);
  }

  // ── Carpeta de refuerzos ───────────────────────────────────────────
  addToTransferFolder(clubId: string, playerId: string): boolean {
    const club = this.getClub(clubId);
    if (!club) return false;
    if (club.transferFolderIds.includes(playerId)) return true;
    club.transferFolderIds.push(playerId);
    return true;
  }

  removeFromTransferFolder(clubId: string, playerId: string): boolean {
    const club = this.getClub(clubId);
    if (!club) return false;
    const idx = club.transferFolderIds.indexOf(playerId);
    if (idx >= 0) club.transferFolderIds.splice(idx, 1);
    return true;
  }

  toggleTransferFolder(clubId: string, playerId: string): boolean {
    const club = this.getClub(clubId);
    if (!club) return false;
    const idx = club.transferFolderIds.indexOf(playerId);
    if (idx >= 0) { club.transferFolderIds.splice(idx, 1); return false; }
    club.transferFolderIds.push(playerId);
    return true;
  }

  isInTransferFolder(clubId: string, playerId: string): boolean {
    const club = this.getClub(clubId);
    return club ? club.transferFolderIds.includes(playerId) : false;
  }

  getTransferFolder(clubId: string): Player[] {
    const club = this.getClub(clubId);
    if (!club) return [];
    return club.transferFolderIds
      .map(id => this.getPlayer(id))
      .filter((p): p is Player => Boolean(p));
  }

  // ── Diario de temporada (hojas del libro) ─────────────────────────
  addSeasonPage(type: SeasonPageType, title: string, summary: string, date: Date, importance: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM') {
    const seasonYear = date.getFullYear();
    const page: SeasonPage = {
      id: generateUUID(),
      date: new Date(date),
      seasonYear,
      type,
      title,
      summary,
      importance,
    };
    this.currentSeasonPages.push(page);
    if (this.currentSeasonPages.length > 300) this.currentSeasonPages = this.currentSeasonPages.slice(-300);
    return page;
  }

  // ── Scouting por zonas de influencia ───────────────────────────────
  scoutByZone(clubId: string, zone: ScoutingZone, date: Date, userClubId?: string): { success: boolean; message: string; report?: ScoutingReport } {
    const club = this.getClub(clubId);
    if (!club) return { success: false, message: 'Club no encontrado.' };

    const cost = SCOUTING_ZONE_COSTS[zone];
    if (club.finances.scoutingBudget < cost) {
      return { success: false, message: `Presupuesto de scouting insuficiente. La zona ${SCOUTING_ZONE_LABELS[zone]} cuesta $${cost.toLocaleString()} y dispones de $${club.finances.scoutingBudget.toLocaleString()}.` };
    }

    const alreadyReported = new Set(this.scoutingReports.filter(r => r.clubId === clubId).map(r => r.playerId));
    const clubCountry = club.country;
    const clubContinent = this.getContinentForCountry(clubCountry);

    const candidates = this.players.filter(p => {
      if (p.clubId === clubId) return false;
      if (alreadyReported.has(p.id)) return false;
      if (p.age < 16 || p.age > 35) return false;
      const pClub = this.getClub(p.clubId);
      const pCountry = pClub?.country || '';
      const pContinent = this.getContinentForCountry(pCountry);

      switch (zone) {
        case 'LOCAL': {
          // Clubes de la misma zona de influencia / mismo país y reputación baja o media
          const rep = pClub?.reputation || 0;
          return pContinent === clubContinent && rep < 5500;
        }
        case 'REGIONAL': {
          // Clubes de la región (mismo continente, países vecinos, reputación media)
          const rep = pClub?.reputation || 0;
          return pContinent === clubContinent && rep < 7000;
        }
        case 'NATIONAL':
          return pCountry === clubCountry;
        case 'CONTINENTAL':
          return pContinent === clubContinent;
        case 'GLOBAL':
          return true;
        default:
          return true;
      }
    });

    if (candidates.length === 0) {
      return { success: false, message: 'No se encontraron jugadores nuevos en esta zona. Vuelve a intentarlo más tarde.' };
    }

    const target = candidates[randomInt(0, candidates.length - 1)];
    club.finances.scoutingBudget = Math.max(0, club.finances.scoutingBudget - cost);
    const report = this.generateScoutingReport(target.id, clubId, date, userClubId);

    return {
      success: true,
      report,
      message: `Ojeadores enviados a ${SCOUTING_ZONE_LABELS[zone]}. Nuevo informe sobre ${target.name}.`,
    };
  }


  getClubCompetitions(clubId: string): Competition[] {
    const club = this.getClub(clubId);
    if (!club) return [];
    const comps: Competition[] = [];
    const league = this.competitions.find(c => c.id === club.leagueId);
    if (league) comps.push(league);
    if (club.qualifiedFor === 'CONT_LIB' || club.qualifiedFor === 'COPA_LIB') {
      const lib = this.competitions.find(c => c.id === 'COPA_LIB' || c.id === 'CONT_LIB');
      if (lib) comps.push(lib);
    } else if (club.qualifiedFor === 'CONT_SUD' || club.qualifiedFor === 'COPA_SUD') {
      const sud = this.competitions.find(c => c.id === 'COPA_SUD' || c.id === 'CONT_SUD');
      if (sud) comps.push(sud);
    }
    const domesticCups = this.competitions.filter(c => c.type === 'CUP' && c.country === club.country);
    domesticCups.forEach(dc => {
      if (!comps.some(existing => existing.id === dc.id)) comps.push(dc);
    });
    return comps;
  }


  recalculatePlayerValue(p: Player): number {
    const base = Math.round(p.currentAbility * p.currentAbility * 2000);
    const avgForm = p.formRatings.length > 0
      ? p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length
      : 6.5;
    const formMult = 0.7 + (avgForm / 10) * 0.6;
    const agePeak = Math.max(0, 1 - Math.abs(p.age - 26) / 20);
    const ageMult = 0.6 + agePeak * 0.8;
    const monthsLeft = p.contractExpiry
      ? Math.max(0, (p.contractExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
      : 12;
    const contractMult = 0.85 + Math.min(monthsLeft, 36) / 200;
    const club = this.getClub(p.clubId);
    const marketMult = club ? this.getMarketMultiplier(club.leagueId) : 1.0;
    return Math.round(base * formMult * ageMult * contractMult * marketMult);
  }

recalculateAllPlayerValues() {
     for (const p of this.players) {
       p.value = this.recalculatePlayerValue(p);
     }
   }

generateYouthIntake(year: number) {
      // Mantener el mundo estable: retiros (si no corrió hace poco al cierre de temporada) + purga de libres
      this.retireAgingPlayers(new Date(year, 7, 1), { skipIfRecent: true });
      this.purgeFreeAgents();
      this.clubs.forEach(club => {
        const youthCount = 1 + randomInt(0, Math.min(2, Math.floor(club.youthFacilities / 6)));
        for (let i = 0; i < youthCount; i++) {
          const posPool = [Position.GK, Position.DC, Position.DL, Position.DR, Position.DM, Position.MC, Position.ML, Position.MR, Position.AM, Position.AML, Position.AMR, Position.ST, Position.STR, Position.STL];
          const pos = posPool[randomInt(0, posPool.length - 1)];
          const age = 15 + randomInt(0, 3);
          
          // Determine nationality based on scouting region
          let nationality: string;
          switch (club.scoutingRegion) {
            case 'ARG':
              nationality = 'Argentina';
              break;
            case 'BRA':
              nationality = 'Brasil';
              break;
            case 'URU':
              nationality = 'Uruguay';
              break;
            case 'CHL':
              nationality = 'Chile';
              break;
            case 'COL':
              nationality = 'Colombia';
              break;
            case 'ECU':
              nationality = 'Ecuador';
              break;
            case 'PAR':
              nationality = 'Paraguay';
              break;
            case 'PER':
              nationality = 'Perú';
              break;
            case 'VEN':
              nationality = 'Venezuela';
              break;
            case 'BOL':
              nationality = 'Bolivia';
              break;
            default:
              // GLO or other regions - mostly Argentine with some neighbors
              if (Math.random() < 0.1) nationality = 'Uruguay';
              else if (Math.random() < 0.05) nationality = 'Chile';
              else if (Math.random() < 0.05) nationality = 'Brasil';
              else nationality = 'Argentina';
              break;
          }
          
          const youthBonus = (club.youthFacilities + club.youthRecruitment) / 40;
          const repBonus = club.reputation / 1000;
          const ca = randomInt(30, Math.round(60 + youthBonus * 20 + repBonus * 15));
          const pa = Math.min(200, ca + randomInt(10, 60 + Math.round(youthBonus * 30)));
          const player = this.createRandomPlayer(club.id, pos, age, age, year);
          player.nationality = nationality; // Override the nationality based on scouting region
          player.currentAbility = ca;
          player.potentialAbility = pa;
          player.squad = 'U20';
          player.value = Math.round(ca * pa * 10);
          player.salary = Math.round(ca * 200 / 12);
          this.players.push(player);
        }
      });
    }

  // ─── Youth Development Pipeline ────────────────────────────────────────
  /** Purga agentes libres que ningún club fichará (mundo estable: sin crecimiento infinito). */
  purgeFreeAgents() {
    const removedIds = new Set<string>();
    const survivors: Player[] = [];
    for (const p of this.players) {
      if (p.clubId !== 'FREE_AGENT') continue;
      // Muertos: nadie los va a fichar (liberados de cantera y veteranos descartados)
      if ((p.age >= 20 && p.potentialAbility < 100) || p.age >= 32) {
        removedIds.add(p.id);
        continue;
      }
      survivors.push(p);
    }
    // Tope del mercado de agentes libres: conservar solo los mejores si hay exceso
    const MAX_FREE_AGENTS = 1200;
    if (survivors.length > MAX_FREE_AGENTS) {
      survivors.sort((a, b) => (b.potentialAbility * 10 + b.currentAbility) - (a.potentialAbility * 10 + a.currentAbility));
      for (let i = MAX_FREE_AGENTS; i < survivors.length; i++) removedIds.add(survivors[i].id);
    }
    if (removedIds.size === 0) return;
    this.players = this.players.filter(p => !removedIds.has(p.id));
    this.pruneRemovedPlayerRefs(removedIds);
    this.markPlayersDirty();
  }

  /** Jubila jugadores veteranos con curva realista por edad/posición y convierte a parte de ellos en empleados contratables. */
  retireAgingPlayers(currentDate?: Date, options?: { skipIfRecent?: boolean }) {
    const eventDate = currentDate || useGameStore.getState().currentDate || new Date();
    const nowMs = eventDate.getTime();
    if (options?.skipIfRecent && this.lastRetirementSweepTime > 0 && nowMs - this.lastRetirementSweepTime < 150 * 86400000) {
      return;
    }
    this.lastRetirementSweepTime = nowMs;

    const retiredPlayers: Player[] = [];
    const removedIds = new Set<string>();
    const affectedClubIds = new Set<string>();

    for (const p of this.players) {
      if (p.clubId === 'FREE_AGENT') {
        if (p.age >= 33) {
          removedIds.add(p.id);
          if (p.reputation >= 4800) retiredPlayers.push(p);
        }
        continue;
      }

      const isGK = p.positions[0] === Position.GK;
      const isDeclining = p.developmentTrend === 'DECLINING';
      let retireProb = 0;

      if (isGK) {
        if (p.age >= 41) retireProb = 1.0;
        else if (p.age === 40) retireProb = 0.84;
        else if (p.age === 39) retireProb = 0.65;
        else if (p.age === 38) retireProb = 0.45;
        else if (p.age === 37) retireProb = 0.30;
        else if (p.age === 36) retireProb = 0.18;
        else if (p.age === 35) retireProb = isDeclining ? 0.16 : 0.08;
      } else {
        if (p.age >= 39) retireProb = 1.0;
        else if (p.age === 38) retireProb = 0.84;
        else if (p.age === 37) retireProb = 0.68;
        else if (p.age === 36) retireProb = 0.50 + (isDeclining ? 0.14 : 0);
        else if (p.age === 35) retireProb = 0.34 + (isDeclining ? 0.14 : 0);
        else if (p.age === 34) retireProb = 0.20 + (isDeclining ? 0.12 : 0);
        else if (p.age === 33) retireProb = 0.10 + (isDeclining ? 0.10 : 0);
        else if (p.age === 32 && isDeclining && p.currentAbility < 95) retireProb = 0.12;
      }

      if (retireProb > 0 && Math.random() < retireProb) {
        removedIds.add(p.id);
        retiredPlayers.push(p);
        affectedClubIds.add(p.clubId);
      }
    }

    if (removedIds.size === 0) return;
    this.players = this.players.filter(p => !removedIds.has(p.id));
    this.pruneRemovedPlayerRefs(removedIds);
    this.markPlayersDirty();

    affectedClubIds.forEach(cid => this.updateClubMonthlyExpenses(cid));

    const userClub = this.getUserClub();
    for (const p of retiredPlayers) {
      const convertedStaff = this.maybeConvertRetiredPlayerToStaff(p, eventDate);
      const isUserPlayer = Boolean(userClub && p.clubId === userClub.id);
      const club = p.clubId && p.clubId !== 'FREE_AGENT' ? this.getClub(p.clubId) : undefined;
      const newRoleLabel = convertedStaff ? this.getStaffRoleLabel(convertedStaff.role) : null;

      if (isUserPlayer) {
        this.addInboxMessage(
          'SQUAD',
          `Retiro profesional: ${p.name}`,
          convertedStaff && newRoleLabel
            ? `${p.name} (${p.age} años) anunció su retiro como futbolista profesional y decidió continuar vinculado al fútbol como ${newRoleLabel}. Ya figura libre en el mercado de empleados.`
            : `${p.name} (${p.age} años) anunció su retiro definitivo del fútbol profesional tras cerrar su etapa en ${club?.name || 'el club'}.`,
          eventDate,
          p.clubId,
          'INFO'
        );
      }

      if (isUserPlayer || (p.reputation >= 5400 && Math.random() < 0.45)) {
        this.publishNews(isUserPlayer ? 'TU_CLUB' : 'MERCADO', {
          date: eventDate,
          type: 'HEADLINE',
          headline: `${p.name} colgará los botines a los ${p.age} años`,
          subheadline: convertedStaff && newRoleLabel
            ? `Inicia una nueva etapa fuera de la cancha como ${newRoleLabel}`
            : `Cierra su carrera profesional${club ? ` tras su paso por ${club.shortName}` : ''}`,
          body: convertedStaff && newRoleLabel
            ? `El histórico ${POSITION_FULL_NAMES[p.positions[0]] || p.positions[0]} ${p.name} oficializó su retiro como jugador${club ? ` en ${club.name}` : ''}. Lejos de alejarse del deporte, ya recibió su habilitación y está disponible como agente libre para trabajar como ${newRoleLabel}.`
            : `${p.name} puso punto final a su trayectoria futbolística profesional a los ${p.age} años${club ? `, despidiéndose en ${club.name}` : ''}.`,
          clubId: club?.id,
          isUserClubNews: isUserPlayer,
        });
      }
    }
  }

  /** Evalúa si un jugador recién retirado inicia carrera como empleado (entrenador, ojeador, PF, fisio, etc.). */
  private maybeConvertRetiredPlayerToStaff(player: Player, eventDate: Date): Staff | null {
    // Evitar poblar con jugadores sin recorrido
    if (player.clubId === 'FREE_AGENT' && player.reputation < 4800) return null;

    const i = player.stats.internal;
    const mentalSum = i.decision + i.vision + i.posicionamiento + i.anticipacion;
    let chance = 0.34;
    if (player.personality === 'LEADER' || player.personality === 'PROFESSIONAL' || player.personality === 'MODEL_PRO' || player.personality === 'LOYAL' || player.personality === 'PERFECTIONIST') chance += 0.11;
    if (mentalSum >= 48) chance += 0.09;
    if (player.reputation >= 5500) chance += 0.08;
    if (player.leadership >= 14) chance += 0.06;
    chance = Math.min(0.62, chance);

    if (Math.random() > chance) return null;

    // Selección ponderada del nuevo rol según atributos del exfutbolista
    const roleWeights: { role: StaffRole; w: number }[] = [
      { role: 'COACH', w: 34 },
      { role: 'ASSISTANT_MANAGER', w: 14 + (player.leadership >= 13 ? 8 : 0) },
      { role: 'YOUTH_MANAGER', w: 12 + (player.loyalty >= 13 ? 5 : 0) },
      { role: 'RESERVE_MANAGER', w: 10 },
      { role: 'FITNESS_COACH', w: 9 + (i.velocidad + i.resistencia + i.fuerza >= 40 ? 10 : 0) },
      { role: 'SCOUT', w: 10 + (i.vision + i.anticipacion >= 26 ? 9 : 0) },
      { role: 'PHYSIO', w: 5 + (player.injuryProneness >= 13 ? 7 : 0) },
      { role: 'SPORTING_DIRECTOR', w: 6 + (player.reputation >= 6000 && i.decision >= 14 ? 8 : 0) },
      { role: 'HEAD_COACH', w: 6 + (player.leadership >= 15 && mentalSum >= 50 ? 6 : 0) },
    ];
    const totalW = roleWeights.reduce((acc, r) => acc + r.w, 0);
    let roll = Math.random() * totalW;
    let chosenRole: StaffRole = 'COACH';
    for (const rw of roleWeights) {
      roll -= rw.w;
      if (roll <= 0) { chosenRole = rw.role; break; }
    }

    const clampAttr = (v: number) => Math.max(4, Math.min(20, Math.round(v)));
    const caBoost = Math.max(0, Math.min(5, (player.currentAbility - 80) / 18));
    const tacticalSeed = (i.decision + i.posicionamiento + i.vision) / 3 + caBoost * 0.6;
    const leadershipSeed = (player.leadership + player.loyalty + i.decision) / 3;
    const fitnessSeed = (i.resistencia + i.fuerza + i.velocidad) / 3;

    const lastClub = player.clubId && player.clubId !== 'FREE_AGENT' ? this.getClub(player.clubId) : undefined;
    const prevClubMap = new Map<string, { clubId: string; clubName: string; years: number[] }>();
    for (const h of player.history || []) {
      const c = this.getClub(h.clubId);
      const name = c?.name || 'Club anterior';
      const entry = prevClubMap.get(h.clubId) || { clubId: h.clubId, clubName: name, years: [] };
      entry.years.push(h.year);
      prevClubMap.set(h.clubId, entry);
    }
    if (lastClub) {
      const entry = prevClubMap.get(lastClub.id) || { clubId: lastClub.id, clubName: lastClub.name, years: [] };
      entry.years.push(eventDate.getFullYear());
      prevClubMap.set(lastClub.id, entry);
    }
    const previousClubs = Array.from(prevClubMap.values()).slice(-6).map(pc => {
      const minY = Math.min(...pc.years);
      const maxY = Math.max(...pc.years);
      return {
        clubId: pc.clubId,
        clubName: pc.clubName,
        years: minY === maxY ? `${minY}` : `${minY}-${maxY}`,
        titles: [],
      };
    });

    const isTactical = ['HEAD_COACH', 'ASSISTANT_MANAGER', 'COACH', 'RESERVE_MANAGER', 'YOUTH_MANAGER'].includes(chosenRole);
    const style = isTactical ? COACH_STYLES[randomInt(0, COACH_STYLES.length - 1)] : undefined;
    const formation = isTactical ? COACH_FORMATIONS[randomInt(0, COACH_FORMATIONS.length - 1)] : undefined;
    const roleLabel = this.getStaffRoleLabel(chosenRole);
    const posLabel = POSITION_FULL_NAMES[player.positions[0]] || player.positions[0];

    const newStaff: Staff = {
      id: generateUUID(),
      name: player.name,
      age: player.age,
      nationality: player.nationality,
      role: chosenRole,
      clubId: '',
      attributes: {
        coaching: chosenRole === 'SPORTING_DIRECTOR' ? clampAttr(tacticalSeed * 0.7) : clampAttr(tacticalSeed + randomInt(-2, 4)),
        judgingAbility: chosenRole === 'SCOUT' || chosenRole === 'SPORTING_DIRECTOR' ? clampAttr(i.decision * 0.6 + i.vision * 0.5 + 4) : clampAttr((i.decision + i.vision) / 2 + randomInt(-1, 3)),
        judgingPotential: chosenRole === 'SCOUT' || chosenRole === 'YOUTH_MANAGER' ? clampAttr(i.vision * 0.6 + i.anticipacion * 0.5 + 3) : clampAttr((i.vision + i.anticipacion) / 2 + randomInt(-1, 3)),
        tacticalKnowledge: chosenRole === 'PHYSIO' ? clampAttr(6 + randomInt(0, 4)) : clampAttr(tacticalSeed + randomInt(-1, 4)),
        adaptability: clampAttr(i.polivalencia * 0.6 + 6 + randomInt(0, 4)),
        medical: chosenRole === 'PHYSIO' ? clampAttr(13 + randomInt(1, 6)) : clampAttr(4 + randomInt(0, 4)),
        physiotherapy: chosenRole === 'PHYSIO' ? clampAttr(13 + randomInt(1, 6)) : clampAttr(4 + randomInt(0, 4)),
        motivation: clampAttr(leadershipSeed + randomInt(-1, 4)),
        manManagement: clampAttr(leadershipSeed + (chosenRole === 'FITNESS_COACH' ? fitnessSeed * 0.1 : 0) + randomInt(-1, 3)),
      },
      salary: Math.max(2200, Math.round((player.reputation * 0.9 + randomInt(1500, 4500)) / 100) * 100),
      contractExpiry: new Date(eventDate.getFullYear(), 5, 30),
      history: [],
      personality: player.leadership >= 14 || player.personality === 'LEADER' ? 'LEADER' : (player.personality === 'VOLATILE' || player.personality === 'TEMPERAMENTAL' || player.personality === 'COMPETITIVE') ? 'PASSIONATE' : (player.personality === 'PROFESSIONAL' || player.personality === 'MODEL_PRO' || player.personality === 'PERFECTIONIST' || player.personality === 'DRIVEN') ? 'DISCIPLINARIAN' : player.personality === 'AMBITIOUS' ? 'VISIONARY' : 'CALM',
      morale: 78,
      reputation: Math.max(35, Math.min(92, Math.round(player.reputation / 105))),
      relationships: {},
      pressReputation: 55,
      boardRelationship: 65,
      tacticalStyle: style,
      preferredFormation: formation,
      playingStyle: style ? COACH_PLAYING_STYLE[style] : undefined,
      previousClubs,
      biography: `Exfutbolista profesional (${posLabel}) retirado a los ${player.age} años${lastClub ? ` tras cerrar su etapa en ${lastClub.name}` : ''}. Inició su carrera técnica como ${roleLabel}.`,
    };
    if (player.history && player.history.length > 0) {
      newStaff.history = player.history.slice(-6).map(h => ({ year: h.year, clubId: h.clubId, role: chosenRole }));
    } else {
      populateStaffPastHistory(newStaff, lastClub, this.getClubPoolIndex(), eventDate.getFullYear());
    }

    this.addStaffIndexed(newStaff);
    this.markStaffDirty();
    return newStaff;
  }

  /** Limpia referencias a jugadores removidos (informes, ofertas, selecciones, carpetas y relaciones). */
  private pruneRemovedPlayerRefs(removedIds: Set<string>) {
    this.scoutingReports = this.scoutingReports.filter(r => !removedIds.has(r.playerId));
    this.offers = this.offers.filter(o => !removedIds.has(o.playerId));
    for (const c of this.clubs) {
      if (Array.isArray(c.shortlistedPlayerIds)) c.shortlistedPlayerIds = c.shortlistedPlayerIds.filter(id => !removedIds.has(id));
      if (Array.isArray(c.transferFolderIds)) c.transferFolderIds = c.transferFolderIds.filter(id => !removedIds.has(id));
    }
    const ntm = this.nationalTeamManager as any;
    if (ntm?.nationalTeams) {
      for (const t of ntm.nationalTeams) {
        if (Array.isArray(t.playerIds)) t.playerIds = t.playerIds.filter((id: string) => !removedIds.has(id));
      }
    }
    for (const a of Object.keys(this.relationshipWeb)) {
      if (removedIds.has(a)) { delete this.relationshipWeb[a]; continue; }
      for (const b of Object.keys(this.relationshipWeb[a])) {
        if (removedIds.has(b)) delete this.relationshipWeb[a][b];
      }
    }
  }

  getYouthPlayers(clubId: string): Player[] {
    return this.getPlayersByClub(clubId).filter(p => p.squad === 'U20');
  }

  isPlayerReadyForPromotion(playerId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player || player.squad !== 'U20') return false;
    
    // Ready if: age >= 18, CA >= 80, or PA > 140 and age >= 17
    const isReady = player.age >= 18 && player.currentAbility >= 80;
    const isHighPotential = player.potentialAbility > 140 && player.age >= 17;
    
    return isReady || isHighPotential;
  }

  promoteToFirstTeam(playerId: string, date?: Date): boolean {
    const player = this.getPlayer(playerId);
    if (!player || player.squad !== 'U20') return false;
    
    const club = this.getClub(player.clubId);
    if (!club) return false;

    // Check if first team has space (max 30 players)
    const seniorPlayers = this.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR');
    if (seniorPlayers.length >= 30) return false;

    player.squad = 'SENIOR';
    player.value = Math.round(player.value * 1.5);
    player.salary = Math.round(player.salary * 2);
    const eventDate = date || useGameStore.getState().currentDate || new Date();
    const userClub = this.getUserClub();
    const isUser = Boolean(userClub && club.id === userClub.id);

    this.addInboxMessage('SQUAD', `Promovido: ${player.name}`, 
      `${player.name} ha sido promovido del sub-20 al primer equipo de ${club.name}.`, eventDate, player.id);

    if (isUser || (this.isNewsRelevantToUser({ clubId: club.id }) && player.potentialAbility >= 145)) {
      const dtName = isUser ? (this.managerProfile?.fullName || 'el DT') : 'el cuerpo técnico';
      this.publishNews(isUser ? 'TU_CLUB' : 'MERCADO', {
        date: eventDate,
        type: 'PRAISE',
        headline: `${player.name} sube al primer equipo de ${club.shortName}`,
        subheadline: `El juvenil de ${player.age} años (${player.positions[0]}) se suma al plantel superior`,
        body: `${dtName} decidió promover al canterano ${player.name} desde el Sub-20 hacia el primer equipo de ${club.name}.`,
        clubId: club.id,
        playerId: player.id,
        isUserClubNews: isUser,
      });
    }
    
    return true;
  }

  autoPromoteYouthPlayers(date: Date) {
    const isMonthly = date.getDate() === 1;
    const isSeasonEnd = date.getMonth() === 5 && date.getDate() === 30;
    if (!isMonthly && !isSeasonEnd) return;
    let released = false;

    this.clubs.forEach(club => {
      const youthPlayers = this.getYouthPlayers(club.id);
      const seniorCount = this.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR').length;
      
      if (isMonthly) {
        youthPlayers.forEach(player => {
          if (this.isPlayerReadyForPromotion(player.id) && seniorCount < 30) {
            this.promoteToFirstTeam(player.id);
          }
        });
      }

      if (isSeasonEnd) {
        youthPlayers.forEach(player => {
          if (player.age >= 19 && player.potentialAbility < 100) {
            player.clubId = 'FREE_AGENT';
            player.squad = 'U20';
            released = true;
          }
        });
      }
    });
    if (released) this.markPlayersDirty();
  }

  processQuarterlyYouthIntake(date: Date) {
    if (date.getMonth() % 3 !== 0 || date.getDate() !== 1) return;
    this.clubs.forEach(club => {
      const youthCount = randomInt(0, 2);
      for (let i = 0; i < youthCount; i++) {
        const posPool = [Position.GK, Position.DC, Position.DL, Position.DR, Position.DM, Position.MC, Position.ML, Position.MR, Position.AM, Position.AML, Position.AMR, Position.ST, Position.STR, Position.STL];
        const pos = posPool[randomInt(0, posPool.length - 1)];
        const age = 15 + randomInt(0, 2);
        const nationality = this.getYouthNationality(club);
        const youthBonus = (club.youthFacilities + club.youthRecruitment) / 40;
        const repBonus = club.reputation / 1000;
        const ca = randomInt(30, Math.round(50 + youthBonus * 15 + repBonus * 10));
        const pa = Math.min(200, ca + randomInt(10, 40 + Math.round(youthBonus * 20)));
        const player = this.createRandomPlayer(club.id, pos, age, age, date.getFullYear());
        player.nationality = nationality;
        player.currentAbility = ca;
        player.potentialAbility = pa;
        player.squad = 'U20';
        player.value = Math.round(ca * pa * 8);
        player.salary = Math.round(ca * 150 / 12);
        this.players.push(player);
      }
    });
  }

  private getYouthNationality(club: Club): string {
    switch (club.scoutingRegion) {
      case 'ARG': return 'Argentina';
      case 'BRA': return 'Brasil';
      case 'URU': return 'Uruguay';
      case 'CHL': return 'Chile';
      case 'COL': return 'Colombia';
      case 'ECU': return 'Ecuador';
      case 'PAR': return 'Paraguay';
      case 'PER': return 'Perú';
      case 'VEN': return 'Venezuela';
      case 'BOL': return 'Bolivia';
      default:
        if (Math.random() < 0.1) return 'Uruguay';
        else if (Math.random() < 0.05) return 'Chile';
        else if (Math.random() < 0.05) return 'Brasil';
        else return 'Argentina';
    }
  }

  ensureMinimumSquadSizes() {
    const MIN_BY_LINE: Record<string, number> = {
      'GK': 2, 'DEF': 5, 'DM': 2, 'MID': 3, 'AM': 2, 'ATT': 2,
    };
    const positionToLine = (pos: Position): string => {
      if (pos === Position.GK) return 'GK';
      if ([Position.DC, Position.DL, Position.DR, Position.SW, Position.DML, Position.DMR].includes(pos)) return 'DEF';
      if (pos === Position.DM) return 'DM';
      if ([Position.MC, Position.ML, Position.MR].includes(pos)) return 'MID';
      if ([Position.AM, Position.AML, Position.AMR].includes(pos)) return 'AM';
      if ([Position.ST, Position.STR, Position.STL].includes(pos)) return 'ATT';
      return 'MID';
    };

    this.clubs.forEach(club => {
      const seniors = this.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR');
      const lineCounts = new Map<string, number>();
      seniors.forEach(p => {
        const line = positionToLine(p.positions[0]);
        lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
      });
      for (const [line, min] of Object.entries(MIN_BY_LINE)) {
        const count = lineCounts.get(line) || 0;
        if (count < min) {
          const deficit = min - count;
          const posPool = line === 'GK' ? [Position.GK] :
                          line === 'DEF' ? [Position.DC, Position.DL, Position.DR, Position.SW] :
                          line === 'DM' ? [Position.DM, Position.DML, Position.DMR] :
                          line === 'MID' ? [Position.MC, Position.ML, Position.MR] :
                          line === 'AM' ? [Position.AM, Position.AML, Position.AMR] :
                          [Position.ST, Position.STR, Position.STL];
          for (let i = 0; i < deficit; i++) {
            const pos = posPool[randomInt(0, posPool.length - 1)];
            const regen = this.createRandomPlayer(club.id, pos, 20, 28, new Date().getFullYear());
            regen.squad = 'SENIOR';
            this.players.push(regen);
          }
        }
      }
    });
  }

  developYouthPlayers(date: Date) {
    // Monthly youth development
    if (date.getDate() !== 1) return;

    this.clubs.forEach(club => {
      const youthPlayers = this.getYouthPlayers(club.id);
      const facilityBonus = (club.youthFacilities + club.youthRecruitment) / 40;
      const u20Coaches = this.getCoachesForSquad(club.id, 'U20');
      const avgU20Coach = u20Coaches.length > 0
        ? u20Coaches.reduce((sum, s) => sum + s.attributes.coaching, 0) / u20Coaches.length
        : 9;
      const coachMult = (0.85 + avgU20Coach / 55) * (1 + Math.min(0.22, Math.max(0, u20Coaches.length - 1) * 0.06));
      
      youthPlayers.forEach(player => {
        // Natural growth based on age and potential
        if (player.age < 21) {
          const growthRate = (facilityBonus * 0.3 + (player.potentialAbility - player.currentAbility) / 100) * coachMult;
          const growth = Math.max(0, Math.round(growthRate * (1 + Math.random() * 0.5)));
          
          if (player.currentAbility < player.potentialAbility) {
            player.currentAbility = Math.min(player.potentialAbility, player.currentAbility + growth);
          }
          
          // Update stats based on new CA
          const caRatio = player.currentAbility / 200;
          player.stats.visible.fisico = Math.min(20, Math.round(8 + caRatio * 12));
          player.stats.visible.mental = Math.min(20, Math.round(7 + caRatio * 13));
          player.stats.visible.tecnica = Math.min(20, Math.round(6 + caRatio * 14));
        }
        
        // Update value
        player.value = Math.round(player.currentAbility * player.potentialAbility * 10);
      });
    });
  }

  // --- MEDIA NEWS SYSTEM ---

  /** Evaluates whether a club, player, or competition matters to the user's current career context. */
  isNewsRelevantToUser(ctx: { clubId?: string; awayClubId?: string; playerId?: string; competitionId?: string }): boolean {
    const userClub = this.getUserClub();
    if (!userClub) return true;

    const userLeague = this.competitions.find(c => c.id === userClub.leagueId);
    const userCountry = userClub.country;
    const userConf = userLeague?.confederation;

    if (ctx.clubId && ctx.clubId === userClub.id) return true;
    if (ctx.awayClubId && ctx.awayClubId === userClub.id) return true;

    const checkClub = (cid?: string) => {
      if (!cid) return false;
      const c = this.getClub(cid);
      if (!c) return false;
      return c.leagueId === userClub.leagueId || c.country === userCountry;
    };
    if (checkClub(ctx.clubId) || checkClub(ctx.awayClubId)) return true;

    if (ctx.playerId) {
      const p = this.getPlayer(ctx.playerId);
      if (p) {
        if (p.clubId === userClub.id || p.nationality === userCountry) return true;
        if (checkClub(p.clubId)) return true;
      }
    }

    if (ctx.competitionId) {
      const comp = this.competitions.find(c => c.id === ctx.competitionId);
      if (comp) {
        if (comp.id === userClub.leagueId || comp.country === userCountry) return true;
        if (comp.id === 'W_CLUB') return true;
        if (userConf && comp.confederation === userConf && comp.type.startsWith('CONTINENTAL')) return true;
      }
    }

    return false;
  }

  generateMatchNews(fixture: Fixture, homeScore: number, awayScore: number, date: Date) {
    if (fixture.squadType !== 'SENIOR') return;
    const homeClub = this.getClub(fixture.homeTeamId);
    const awayClub = this.getClub(fixture.awayTeamId);
    if (!homeClub || !awayClub) return;

    const userClub = this.getUserClub();
    const isUserMatch = Boolean(userClub && (homeClub.id === userClub.id || awayClub.id === userClub.id));
    const comp = this.competitions.find(c => c.id === fixture.competitionId);
    const isSameLeagueOrCountry = Boolean(
      userClub && (
        fixture.competitionId === userClub.leagueId ||
        homeClub.country === userClub.country ||
        awayClub.country === userClub.country
      )
    );
    const isMajorFinalOrSemi = ['SEMI_FINAL', 'FINAL'].includes(fixture.stage) &&
      ['W_CLUB', 'UCL', 'UEL', 'COPA_LIB', 'CONT_LIB', 'COPA_SUD', 'CONT_SUD', 'WC_FINAL', 'COPA', 'EURO', 'C_ARG', 'COPA_REY', 'FA_CUP', 'EFL_CUP', 'DFB_POKAL', 'COPA_ITALIA', 'COPA_FRANCE'].includes(fixture.competitionId);
    const isUserContinentalMatch = Boolean(
      userClub &&
      comp?.type.startsWith('CONTINENTAL') &&
      comp.confederation === this.competitions.find(l => l.id === userClub.leagueId)?.confederation &&
      (['ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'].includes(fixture.stage) || Math.abs(homeScore - awayScore) >= 3)
    );

    if (!isUserMatch && !isSameLeagueOrCountry && !isMajorFinalOrSemi && !isUserContinentalMatch) {
      return;
    }

    // In user's own league, avoid flooding every single matchday with minor non-user draws unless notable or user's club
    if (!isUserMatch && isSameLeagueOrCountry && fixture.competitionId === userClub?.leagueId) {
      const margin = Math.abs(homeScore - awayScore);
      const bigRep = homeClub.reputation >= 6500 && awayClub.reputation >= 6500;
      if (margin < 2 && !bigRep && Math.random() > 0.25) return;
    }

    const featured = isUserMatch || isMajorFinalOrSemi || Math.abs(homeScore - awayScore) >= 4;
    const section: NewsSection = isUserMatch ? 'TU_CLUB' : (comp?.type === 'GLOBAL' || (comp?.type.startsWith('CONTINENTAL') && !isSameLeagueOrCountry)) ? 'INTERNACIONAL' : 'RESULTADOS';

    if (homeScore > awayScore) {
      this.publishNews(section, {
        date,
        type: 'HEADLINE',
        headline: `${homeClub.shortName} se impone a ${awayClub.shortName}`,
        subheadline: `${homeScore} - ${awayScore}${comp ? ` · ${comp.name}` : ''}`,
        body: `${homeClub.name} logró un triunfo ante ${awayClub.name} por ${homeScore}-${awayScore}${comp ? ` en ${comp.name}` : ''}.`,
        clubId: isUserMatch ? userClub!.id : homeClub.id,
        competitionId: fixture.competitionId,
        isUserClubNews: isUserMatch,
        featured,
      });
    } else if (awayScore > homeScore) {
      this.publishNews(section, {
        date,
        type: 'HEADLINE',
        headline: `${awayClub.shortName} derrota a ${homeClub.shortName}`,
        subheadline: `${awayScore} - ${homeScore}${comp ? ` · ${comp.name}` : ''}`,
        body: `${awayClub.name} se quedó con los puntos frente a ${homeClub.name} tras imponerse ${awayScore}-${homeScore}${comp ? ` en ${comp.name}` : ''}.`,
        clubId: isUserMatch ? userClub!.id : awayClub.id,
        competitionId: fixture.competitionId,
        isUserClubNews: isUserMatch,
        featured,
      });
    } else {
      this.publishNews(section, {
        date,
        type: 'FEATURE',
        headline: `${homeClub.shortName} y ${awayClub.shortName} empatan ${homeScore}-${awayScore}`,
        subheadline: comp ? comp.name : 'Reparto de puntos',
        body: `${homeClub.name} y ${awayClub.name} igualaron ${homeScore}-${awayScore}${comp ? ` por ${comp.name}` : ''}.`,
        clubId: isUserMatch ? userClub!.id : homeClub.id,
        competitionId: fixture.competitionId,
        isUserClubNews: isUserMatch,
        featured: isUserMatch,
      });
    }
  }

  generateTransferNews(player: Player, fromClub: Club, toClub: Club, amount: number, date: Date) {
    const userClub = this.getUserClub();
    const relevant =
      !userClub ||
      fromClub.id === userClub.id ||
      toClub.id === userClub.id ||
      fromClub.leagueId === userClub.leagueId ||
      toClub.leagueId === userClub.leagueId ||
      fromClub.country === userClub.country ||
      toClub.country === userClub.country ||
      player.nationality === userClub.country ||
      amount >= 8_000_000 ||
      player.currentAbility >= 158;

    if (!relevant) return;

    this.publishNews('MERCADO', {
      date,
      type: 'HEADLINE',
      headline: `${player.name} ficha por ${toClub.shortName}`,
      subheadline: `Traspaso desde ${fromClub.shortName}: £${amount.toLocaleString()}`,
      body: `El futbolista ${player.name} deja ${fromClub.name} para sumarse a ${toClub.name} en una operación valorada en £${amount.toLocaleString()}.`,
      clubId: toClub.id === userClub?.id ? toClub.id : (fromClub.id === userClub?.id ? fromClub.id : toClub.id),
      playerId: player.id,
      isUserClubNews: Boolean(userClub && (fromClub.id === userClub.id || toClub.id === userClub.id)),
      featured: amount >= 15_000_000 || Boolean(userClub && (fromClub.id === userClub.id || toClub.id === userClub.id)),
    });
  }

  generateInjuryNews(player: Player, club: Club, date: Date) {
    if (!this.isNewsRelevantToUser({ clubId: club.id, playerId: player.id }) && player.currentAbility < 165) {
      return;
    }
    this.publishNews('LESIONES', {
      date,
      type: 'CRITICISM',
      headline: `Duro golpe para ${club.shortName}: ${player.name} lesionado`,
      subheadline: `Fuera de las canchas`,
      body: `${player.name} sufre una lesión que lo marginará por varias semanas en ${club.name}.`,
      clubId: club.id, playerId: player.id,
    });
  }

  /** Noticias de diario basadas únicamente en hechos reales y protagonistas concretos del mundo. */
  generateGeneralNews(date: Date) {
    // Emit only when there is concrete live activity (~40% cadence max)
    if (Math.random() > 0.4) return;

    const userClub = this.getUserClub();
    const userLeague = userClub ? this.competitions.find(c => c.id === userClub.leagueId) : undefined;
    const candidateLeagues = this.getLeagues().filter(l => {
      if (!userClub) return (l.dynamicReputation || 0) >= 55;
      if (l.id === userClub.leagueId || l.country === userClub.country) return true;
      if (userLeague?.confederation && l.confederation === userLeague.confederation && (l.dynamicReputation || 0) >= 65) return true;
      return (l.dynamicReputation || 0) >= 85;
    });
    if (candidateLeagues.length === 0) return;

    const league = userLeague && Math.random() < 0.78
      ? userLeague
      : candidateLeagues[randomInt(0, candidateLeagues.length - 1)];

    const clubs = this.getClubsByLeague(league.id);
    if (clubs.length < 2) return;
    const clubIds = new Set(clubs.map(c => c.id));
    const recentlyQuotedPlayerIds = new Set(
      this.mediaNews.slice(0, 12).map(n => n.playerId).filter((id): id is string => Boolean(id))
    );

    const roll = randomInt(0, 3);

    if (roll === 0) {
      // Real player who actually wants out, is transfer-listed, or has an expiring contract
      const expiryHorizon = new Date(date.getTime() + 270 * 24 * 60 * 60 * 1000);
      const restless = this.players.filter(p =>
        p.squad === 'SENIOR' &&
        !recentlyQuotedPlayerIds.has(p.id) &&
        (p.clubId === userClub?.id || clubIds.has(p.clubId)) &&
        (Boolean(p.transferRequestReason) || p.transferStatus === 'TRANSFERABLE' || p.isUnhappyWithContract || p.contractExpiry <= expiryHorizon)
      );
      if (restless.length === 0) return;
      const target = restless.sort((a, b) => b.currentAbility - a.currentAbility)[randomInt(0, Math.min(3, restless.length - 1))];
      const club = this.getClub(target.clubId);
      if (!club) return;
      const reasonText = target.transferRequestReason
        ? `su planteo por cambiar de aire ("${target.transferRequestReason}")`
        : target.isUnhappyWithContract
        ? `sus diferencias salariales para extender el vínculo`
        : target.transferStatus === 'TRANSFERABLE'
        ? `la decisión de ${club.shortName} de declararlo transferible (£${target.value.toLocaleString()})`
        : `la cercanía del vencimiento de su contrato en ${new Date(target.contractExpiry).toLocaleDateString()}`;
      this.publishNews(club.id === userClub?.id ? 'TU_CLUB' : 'MERCADO', {
        date,
        type: 'RUMOR',
        headline: `${target.name} define su futuro en ${club.shortName}`,
        subheadline: `Situación contractual y de mercado abierta en ${league.name}`,
        body: `En ${club.name} siguen con atención el caso de ${target.name} (${target.age} años), marcado por ${reasonText}.`,
        clubId: club.id, playerId: target.id, competitionId: league.id,
        isUserClubNews: club.id === userClub?.id,
      });
    } else if (roll === 1) {
      // Real statistical leader in the league (goals, assists, or average rating)
      const activeScorers = this.players.filter(p =>
        p.squad === 'SENIOR' &&
        !recentlyQuotedPlayerIds.has(p.id) &&
        clubIds.has(p.clubId) &&
        p.seasonStats.appearances >= 3 &&
        (p.seasonStats.goals >= 3 || p.seasonStats.assists >= 3)
      );
      if (activeScorers.length === 0) return;
      const leader = [...activeScorers].sort((a, b) =>
        (b.seasonStats.goals * 2 + b.seasonStats.assists) - (a.seasonStats.goals * 2 + a.seasonStats.assists)
      )[0];
      const club = this.getClub(leader.clubId);
      if (!club) return;
      const avgRating = (leader.seasonStats.totalRating / Math.max(1, leader.seasonStats.appearances)).toFixed(2);
      this.publishNews(club.id === userClub?.id ? 'TU_CLUB' : 'CLASIFICACION', {
        date,
        type: 'PRAISE',
        headline: `${leader.name} lidera las cifras ofensivas de ${club.shortName}`,
        subheadline: `${leader.seasonStats.goals} goles y ${leader.seasonStats.assists} asistencias en ${leader.seasonStats.appearances} PJ`,
        body: `El momento de ${leader.name} impulsa a ${club.name} en ${league.name}: acumula ${leader.seasonStats.goals} tantos, ${leader.seasonStats.assists} asistencias y media de ${avgRating}.`,
        clubId: club.id, playerId: leader.id, competitionId: league.id,
        isUserClubNews: club.id === userClub?.id,
      });
    } else if (roll === 2) {
      // Real upcoming scheduled match in the next 4 days for userClub (or top league clash)
      const fixtures = useGameStore.getState().fixtures || [];
      const windowEnd = date.getTime() + 4 * 24 * 60 * 60 * 1000;
      const upcoming = fixtures.find(f =>
        !f.played &&
        f.squadType === 'SENIOR' &&
        f.date.getTime() >= date.getTime() &&
        f.date.getTime() <= windowEnd &&
        ((userClub && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)) ||
          (f.competitionId === league.id && !userClub))
      );
      if (!upcoming) return;
      const home = this.getClub(upcoming.homeTeamId);
      const away = this.getClub(upcoming.awayTeamId);
      if (!home || !away) return;
      const hStar = [...this.getPlayersByClub(home.id)].filter(p => p.squad === 'SENIOR' && !p.injury).sort((a, b) => b.currentAbility - a.currentAbility)[0];
      const aStar = [...this.getPlayersByClub(away.id)].filter(p => p.squad === 'SENIOR' && !p.injury).sort((a, b) => b.currentAbility - a.currentAbility)[0];
      const compName = this.competitions.find(c => c.id === upcoming.competitionId)?.name || league.name;
      const dtName = userClub && (home.id === userClub.id || away.id === userClub.id)
        ? (this.managerProfile?.fullName || 'el DT')
        : null;
      this.publishNews(userClub && (home.id === userClub.id || away.id === userClub.id) ? 'TU_CLUB' : 'RESULTADOS', {
        date,
        type: 'FEATURE',
        headline: `Se viene ${home.shortName} vs ${away.shortName} en ${compName}`,
        subheadline: `Programado para el ${new Date(upcoming.date).toLocaleDateString()}`,
        body: `${home.name}${hStar ? ` (con ${hStar.name} como carta principal)` : ''} recibirá a ${away.name}${aStar ? ` (liderado por ${aStar.name})` : ''} por ${compName}.${dtName ? ` ${dtName} ultima detalles en la previa.` : ''}`,
        clubId: userClub && (home.id === userClub.id || away.id === userClub.id) ? userClub.id : home.id,
        playerId: hStar?.id,
        competitionId: upcoming.competitionId,
        isUserClubNews: Boolean(userClub && (home.id === userClub.id || away.id === userClub.id)),
      });
    } else {
      // Real injured or recovering player watch
      const injured = this.players.find(p =>
        p.injury &&
        !recentlyQuotedPlayerIds.has(p.id) &&
        (p.clubId === userClub?.id || (clubIds.has(p.clubId) && p.currentAbility >= 120)) &&
        p.injury.daysLeft >= 3
      );
      if (!injured) return;
      const club = this.getClub(injured.clubId);
      const isRecoveringSoon = injured.injury!.daysLeft <= 5;
      this.publishNews('LESIONES', {
        date,
        type: isRecoveringSoon ? 'FEATURE' : 'CRITICISM',
        headline: isRecoveringSoon
          ? `${injured.name}, en la recta final de recuperación en ${club?.shortName || 'su club'}`
          : `Seguimiento médico por ${injured.name} en ${club?.shortName || 'su club'}`,
        subheadline: `${injured.injury!.type} (${injured.injury!.daysLeft} días restantes)`,
        body: isRecoveringSoon
          ? `${injured.name} evoluciona favorablemente de su ${injured.injury!.type} y en ${club?.name || 'el cuerpo técnico'} esperan contar con él en ${injured.injury!.daysLeft} días.`
          : `${injured.name} continúa al margen en ${club?.name || 'el plantel'} por ${injured.injury!.type}, con unos ${injured.injury!.daysLeft} días estimados de baja.`,
        clubId: injured.clubId, playerId: injured.id,
        isUserClubNews: Boolean(userClub && injured.clubId === userClub.id),
      });
    }
  }

  /** Emite una noticia al diario. Si involucra al club del usuario queda etiquetada como "Tu club". */
  publishNews(section: NewsSection, data: Partial<MediaNews> & { headline: string; subheadline?: string; body: string }) {
    const userClub = this.getUserClub();
    const involvesUser = userClub && (
      data.isUserClubNews ||
      data.clubId === userClub.id ||
      (data.playerId ? this.getPlayer(data.playerId)?.clubId === userClub.id : false)
    );
    this.mediaNews.unshift({
      id: generateUUID(),
      date: new Date(data.date || new Date()),
      type: data.type || 'FEATURE',
      section,
      headline: data.headline,
      subheadline: data.subheadline || '',
      body: data.body,
      clubId: data.clubId,
      competitionId: data.competitionId,
      playerId: data.playerId,
      isUserClubNews: !!involvesUser,
      read: false,
      featured: data.featured,
    });
    this.enforceNewsLimits();
  }

  private enforceNewsLimits() {
    const SECTION_CAPS: Partial<Record<NewsSection, number>> = {
      RESULTADOS: 25,
      MERCADO: 20,
      TU_CLUB: 15,
      INTERNACIONAL: 15,
      CLASIFICACION: 12,
      DESPIDOS: 10,
      LESIONES: 10,
    };
    const MAX_TOTAL = 150;

    while (this.mediaNews.length > MAX_TOTAL) {
      const sectionCounts = new Map<NewsSection, number>();
      for (const n of this.mediaNews) {
        sectionCounts.set(n.section, (sectionCounts.get(n.section) || 0) + 1);
      }

      const overCap = [...sectionCounts.entries()]
        .filter(([sec, count]) => count > (SECTION_CAPS[sec] || 8))
        .sort((a, b) => (SECTION_CAPS[b[0]] || 8) - (SECTION_CAPS[a[0]] || 8));

      let removed = false;
      for (const [sec] of overCap) {
        const idx = this.mediaNews.findLastIndex(n => n.section === sec && !n.featured && !n.isUserClubNews);
        if (idx >= 0) {
          this.mediaNews.splice(idx, 1);
          removed = true;
          break;
        }
      }

      if (!removed) {
        const idx = this.mediaNews.findLastIndex(n => !n.featured && !n.isUserClubNews);
        if (idx >= 0) this.mediaNews.splice(idx, 1);
        else break;
      }
    }
  }

  /** Resumen semanal de clasificación (sección Clasificación del diario). */
  generateStandingsNews(date: Date, fixtures: Fixture[]) {
    const userClub = this.getUserClub();
    const userLeague = userClub ? this.competitions.find(c => c.id === userClub.leagueId) : undefined;
    const leagues = this.getLeagues()
      .filter(l => {
        if (!userClub) return (l.dynamicReputation || 0) >= 60;
        if (l.id === userClub.leagueId || l.country === userClub.country) return true;
        return (l.dynamicReputation || 0) >= 85;
      })
      .sort((a, b) => {
        const aIsUser = a.id === userClub?.leagueId ? 1 : 0;
        const bIsUser = b.id === userClub?.leagueId ? 1 : 0;
        if (aIsUser !== bIsUser) return bIsUser - aIsUser;
        return (b.dynamicReputation || 0) - (a.dynamicReputation || 0);
      })
      .slice(0, 3);

    for (const comp of leagues) {
      if (comp.id !== userLeague?.id && Math.random() > 0.45) continue;
      const table = this.getLeagueTable(comp.id, fixtures, 'SENIOR');
      if (table.length < 4) continue;
      const leader = table[0];
      const leaderClub = this.getClub(leader.clubId);
      const last = table[table.length - 1];
      const lastClub = this.getClub(last.clubId);
      if (!leaderClub || leader.played === 0) continue;
      const roll = randomInt(0, 2);
      if (roll === 0) {
        this.publishNews('CLASIFICACION', {
          date,
          type: 'HEADLINE',
          headline: `${leaderClub.shortName} manda en ${comp.name}`,
          subheadline: `${leader.points} pts, líder con ${leader.played} partidos jugados`,
          body: `${leaderClub.name} se afirma en lo más alto de ${comp.name} con ${leader.points} puntos (DG ${leader.gd > 0 ? '+' : ''}${leader.gd}).`,
          clubId: leaderClub.id, competitionId: comp.id,
        });
      } else if (roll === 1 && lastClub) {
        this.publishNews('CLASIFICACION', {
          date,
          type: 'CRITICISM',
          headline: `${lastClub.shortName}, en zona crítica en ${comp.name}`,
          subheadline: `${last.points} puntos en ${last.played} fechas`,
          body: `${lastClub.name} cierra la tabla de ${comp.name} con ${last.points} puntos y necesita reaccionar cuanto antes.`,
          clubId: lastClub.id, competitionId: comp.id,
        });
      } else {
        const climber = table[Math.max(1, Math.floor(table.length * 0.35))];
        const climberClub = this.getClub(climber.clubId);
        if (climberClub) {
          this.publishNews('CLASIFICACION', {
            date,
            type: 'PRAISE',
            headline: `${climberClub.shortName} pelea arriba en ${comp.name}`,
            subheadline: `${climber.points} pts en la tabla`,
            body: `${climberClub.name} suma ${climber.points} puntos en ${comp.name} y se mantiene en la lucha por los puestos de vanguardia.`,
            clubId: climberClub.id, competitionId: comp.id,
          });
        }
      }
    }
  }

  /** Simulación semanal de ceses y nombramientos de entrenadores en el mundo (sección Despidos). */
  simulateCoachChanges(date: Date, fixtures?: Fixture[]) {
    const userClubId = this.managerProfile?.currentClubId;
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);
    const candidates = this.clubs.filter(c =>
      c.id !== userClubId &&
      deepIds.has(c.leagueId) &&
      this.staff.some(s => s.role === 'HEAD_COACH' && s.clubId === c.id)
    );
    let firedCount = 0;
    for (const club of candidates) {
      if (Math.random() > 0.05) continue;
      const board = club.boardConfidence ?? 50;
      let pressure = (100 - board) / 300;
      if (fixtures && club.leagueId) {
        const table = this.getLeagueTable(club.leagueId, fixtures, 'SENIOR');
        const rank = table.findIndex(e => e.clubId === club.id) + 1;
        if (rank > 0 && rank > Math.ceil(table.length * 0.75)) pressure += 0.5;
        else if (rank > 0 && rank <= 4) pressure -= 0.4;
      }
      const prob = Math.min(0.35, Math.max(0.02, pressure));
      if (Math.random() > prob) continue;
      if (this.fireAndReplaceCoach(club, date)) {
        firedCount++;
        if (firedCount >= 3) break;
      }
    }
  }

  /** Destituye al DT de un club IA y nombra reemplazante; emite noticia si es relevante. */
  private fireAndReplaceCoach(club: Club, date: Date): boolean {
    const fired = this.staff.find(s => s.role === 'HEAD_COACH' && s.clubId === club.id);
    if (!fired) return false;
    let replacement = this.staff.find(s => s.role === 'HEAD_COACH' && s.clubId === '' && s.id !== fired.id);
    if (!replacement) {
      replacement = this.staff.find(s =>
        (s.role === 'ASSISTANT_MANAGER' || s.role === 'RESERVE_MANAGER' || s.role === 'YOUTH_MANAGER') && s.clubId === club.id
      );
    }
    if (replacement) {
      replacement.clubId = club.id;
      if (replacement.role !== 'HEAD_COACH') replacement.role = 'HEAD_COACH';
    } else {
      replacement = this.createRandomHeadCoach(club.id, date);
      this.staff.push(replacement);
    }
    fired.clubId = '';
    this.markStaffDirty();
    club.boardConfidence = Math.min(100, (club.boardConfidence ?? 50) + 10);
    if (this.isNewsRelevantToUser({ clubId: club.id }) || club.reputation >= 8000) {
      this.publishNews('DESPIDOS', {
        date,
        type: 'HEADLINE',
        headline: `${club.shortName} destituye a ${fired.name}`,
        subheadline: `${replacement.name} asume el banquillo`,
        body: `La directiva de ${club.name} decidió prescindir de ${fired.name} como entrenador y designó a ${replacement.name} al frente del plantel.`,
        clubId: club.id,
      });
    }
    return true;
  }

  /** Crea un DT nuevo para reemplazos (club IA). */
  private createRandomHeadCoach(clubId: string, date: Date): Staff {
    const club = this.getClub(clubId);
    const style = COACH_STYLES[randomInt(0, COACH_STYLES.length - 1)];
    return {
      id: generateUUID(),
      name: `${STAFF_NAMES.names[randomInt(0, STAFF_NAMES.names.length - 1)]} ${STAFF_NAMES.surnames[randomInt(0, STAFF_NAMES.surnames.length - 1)]}`,
      age: randomInt(38, 62),
      nationality: club?.country || 'Argentina',
      role: 'HEAD_COACH',
      clubId,
      attributes: {
        coaching: weightedRandom(8, 20),
        judgingAbility: weightedRandom(8, 20),
        judgingPotential: weightedRandom(8, 20),
        tacticalKnowledge: weightedRandom(10, 20),
        adaptability: weightedRandom(5, 20),
        medical: 5,
        physiotherapy: 5,
        motivation: weightedRandom(8, 20),
        manManagement: weightedRandom(8, 20),
      },
      salary: computeRealisticStaffSalary({
        skill: weightedRandom(9, 17),
        role: 'HEAD_COACH',
        clubRep: club?.reputation || 4000,
        country: club?.country || 'Argentina',
      }),
      contractExpiry: new Date(date.getFullYear() + 1, 5, 30),
      history: [],
      personality: ['LEADER', 'PASSIONATE', 'CALM', 'DISCIPLINARIAN', 'VISIONARY'][randomInt(0, 4)],
      morale: 70,
      reputation: 50,
      relationships: {},
      pressReputation: 50,
      boardRelationship: 60,
      tacticalStyle: style,
      preferredFormation: COACH_FORMATIONS[randomInt(0, COACH_FORMATIONS.length - 1)],
      playingStyle: COACH_PLAYING_STYLE[style],
      pressIntensity: (['LOW', 'MEDIUM', 'HIGH'] as const)[randomInt(0, 2)],
      possessionVsCounter: (['POSSESSION', 'COUNTER', 'BALANCED'] as const)[randomInt(0, 2)],
    };
  }

  getStaffRoleLabel(role: StaffRole): string {
    const labels: Record<StaffRole, string> = {
      HEAD_COACH: 'Director Técnico',
      ASSISTANT_MANAGER: 'Segundo Entrenador',
      COACH: 'Entrenador',
      FITNESS_COACH: 'Preparador Físico',
      PHYSIO: 'Fisioterapeuta',
      SCOUT: 'Ojeador',
      SPORTING_DIRECTOR: 'Director Deportivo',
      RESERVE_MANAGER: 'Entrenador de Reserva',
      YOUTH_MANAGER: 'Entrenador Sub-20',
      TREASURER: 'Tesorero',
    };
    return labels[role] || role;
  }

  /** Roles que permiten contratar múltiples integrantes sin despedir al anterior (FM08-style). */
  isCollaborativeStaffRole(role: StaffRole): boolean {
    return role === 'COACH' || role === 'FITNESS_COACH' || role === 'PHYSIO' || role === 'SCOUT';
  }

  /** Roles de campo que pueden colaborar en los entrenamientos de Primera, Reserva y Sub-20. */
  isCoachingRole(role: StaffRole): boolean {
    return (
      role === 'HEAD_COACH' ||
      role === 'ASSISTANT_MANAGER' ||
      role === 'COACH' ||
      role === 'FITNESS_COACH' ||
      role === 'RESERVE_MANAGER' ||
      role === 'YOUTH_MANAGER'
    );
  }

  getDefaultStaffSquads(role: StaffRole): SquadType[] {
    switch (role) {
      case 'HEAD_COACH':
      case 'ASSISTANT_MANAGER':
      case 'COACH':
      case 'FITNESS_COACH':
        return ['SENIOR'];
      case 'RESERVE_MANAGER':
        return ['RESERVE'];
      case 'YOUTH_MANAGER':
        return ['U20'];
      default:
        return [];
    }
  }

  getEffectiveStaffSquads(staffMember: Staff): SquadType[] {
    if (!this.isCoachingRole(staffMember.role)) return [];
    if (staffMember.assignedSquads && staffMember.assignedSquads.length > 0) {
      return staffMember.assignedSquads;
    }
    return this.getDefaultStaffSquads(staffMember.role);
  }

  getCoachesForSquad(clubId: string, squad: SquadType): Staff[] {
    return this.getStaffByClub(clubId).filter(
      s => this.isCoachingRole(s.role) && this.getEffectiveStaffSquads(s).includes(squad)
    );
  }

  getClubStaffBudgetStatus(clubId: string): {
    currentCount: number;
    maxCount: number;
    currentWeeklyWage: number;
    maxWeeklyWage: number;
    remainingWeeklyWage: number;
  } {
    const club = this.getClub(clubId);
    const clubStaff = this.getStaffByClub(clubId);
    const currentCount = clubStaff.length;
    const currentWeeklyWage = clubStaff.reduce((sum, s) => sum + s.salary, 0);
    if (!club) {
      return { currentCount, maxCount: 12, currentWeeklyWage, maxWeeklyWage: 60000, remainingWeeklyWage: Math.max(0, 60000 - currentWeeklyWage) };
    }

    const econ = getCountryEconomy(club.country);
    const repNorm = Math.max(0.08, Math.min(1.0, (club.reputation - 1500) / 8500));
    const balanceBonus = club.finances.balance > 30_000_000 ? 2 : club.finances.balance > 8_000_000 ? 1 : club.finances.balance < -500_000 ? -2 : 0;
    const maxCount = Math.max(10, Math.min(20, 11 + Math.round(repNorm * 7) + balanceBonus));

    const repBaseMonthlyCap = Math.round((25_000 + repNorm * 450_000) * econ);
    const monthlyFinancialRoom = Math.max(club.finances.wageBudget * 0.28, club.finances.monthlyIncome * 0.18);
    const balanceCushion = club.finances.balance >= 0 ? Math.min(120_000, Math.round(club.finances.balance / 120)) : 0;
    const minRoom = Math.round(12_000 * econ);
    const roomFloor = club.finances.balance >= -250_000 ? currentWeeklyWage + minRoom : currentWeeklyWage;
    const maxWeeklyWage = Math.round(Math.max(roomFloor, repBaseMonthlyCap, monthlyFinancialRoom) + balanceCushion);

    return {
      currentCount,
      maxCount,
      currentWeeklyWage,
      maxWeeklyWage,
      remainingWeeklyWage: Math.max(0, maxWeeklyWage - currentWeeklyWage),
    };
  }

  toggleStaffSquadAssignment(clubId: string, staffId: string, squad: SquadType): { ok: boolean; message: string } {
    const staffMember = this.getStaffByClub(clubId).find(s => s.id === staffId);
    if (!staffMember) return { ok: false, message: 'No se encontró el empleado en tu club.' };
    if (!this.isCoachingRole(staffMember.role)) {
      return { ok: false, message: 'Este cargo no participa directamente en entrenamientos de campo.' };
    }

    const current = [...this.getEffectiveStaffSquads(staffMember)];
    const has = current.includes(squad);
    if (has && current.length <= 1) {
      return { ok: false, message: `${staffMember.name} debe permanecer asignado al menos a un plantel.` };
    }

    const order: SquadType[] = ['SENIOR', 'RESERVE', 'U20'];
    const next = has ? current.filter(q => q !== squad) : [...current, squad];
    staffMember.assignedSquads = order.filter(q => next.includes(q));
    this.markStaffDirty();
    return { ok: true, message: `Asignación de ${staffMember.name} actualizada.` };
  }

  fireStaffMember(clubId: string, staffId: string, date?: Date): { ok: boolean; message: string } {
    const club = this.getClub(clubId);
    const member = this.getStaffByClub(clubId).find(s => s.id === staffId);
    if (!club || !member) return { ok: false, message: 'No se encontró al empleado.' };
    if (member.role === 'HEAD_COACH') return { ok: false, message: 'El Director Técnico principal no puede ser rescindido desde aquí.' };

    const severance = Math.min(Math.round(member.salary * 2), Math.max(0, club.finances.balance));
    const eventDate = date || useGameStore.getState().currentDate || new Date();
    member.history.push({ year: eventDate.getFullYear(), clubId, role: member.role });
    member.clubId = '';
    delete member.assignedSquads;

    const delegationKeys = [
      'trainingDelegatedTo',
      'pressDelegatedTo',
      'talksDelegatedTo',
      'reserveDelegatedTo',
      'u20DelegatedTo',
      'scoutingDelegatedTo',
      'financeDelegatedTo',
    ] as const;
    delegationKeys.forEach(k => {
      if (club[k] === member.id) delete club[k];
    });

    club.finances.balance -= severance;
    this.updateClubMonthlyExpenses(clubId);
    this.markStaffDirty();

    return {
      ok: true,
      message: `${member.name} dejó el cuerpo técnico.${severance > 0 ? ` Indemnización abonada: £${severance.toLocaleString()}.` : ''}`,
    };
  }

  /** Garantiza un mercado activo de empleados libres contratables en todos los roles técnicos/directivos. */
  ensureFreeAgentStaffPool(minPoolSize = 44): void {
    const hireableRoles: StaffRole[] = [
      'COACH',
      'ASSISTANT_MANAGER',
      'COACH',
      'FITNESS_COACH',
      'PHYSIO',
      'SCOUT',
      'SPORTING_DIRECTOR',
      'RESERVE_MANAGER',
      'YOUTH_MANAGER',
      'TREASURER',
    ];
    const currentFree = this.staff.filter(s => !s.clubId || s.clubId === 'FREE_AGENT');
    if (currentFree.length >= minPoolSize) return;

    const nationalities = ['Argentina', 'Brasil', 'España', 'Italia', 'Inglaterra', 'Alemania', 'Francia', 'Uruguay', 'Colombia', 'Portugal', 'Países Bajos', 'México'];
    const needed = minPoolSize - currentFree.length;
    for (let i = 0; i < needed; i++) {
      const role = hireableRoles[i % hireableRoles.length];
      const isTactical = ['ASSISTANT_MANAGER', 'COACH', 'RESERVE_MANAGER', 'YOUTH_MANAGER'].includes(role);
      const style = isTactical ? COACH_STYLES[randomInt(0, COACH_STYLES.length - 1)] : undefined;
      const formation = isTactical ? COACH_FORMATIONS[randomInt(0, COACH_FORMATIONS.length - 1)] : undefined;
      const tierBoost = i % 5 === 0 ? 4 : 0;
      const nat = nationalities[randomInt(0, nationalities.length - 1)];
      const avgSkill = Math.min(19, 11 + tierBoost + randomInt(0, 4));
      const s: Staff = {
        id: generateUUID(),
        name: `${STAFF_NAMES.names[randomInt(0, STAFF_NAMES.names.length - 1)]} ${STAFF_NAMES.surnames[randomInt(0, STAFF_NAMES.surnames.length - 1)]}`,
        age: randomInt(32, 62),
        nationality: nat,
        role,
        clubId: '',
        attributes: {
          coaching: role === 'SPORTING_DIRECTOR' || role === 'TREASURER' ? weightedRandom(6, 13) : Math.min(20, weightedRandom(10, 19) + tierBoost),
          judgingAbility: role === 'SCOUT' || role === 'SPORTING_DIRECTOR' ? Math.min(20, weightedRandom(13, 19) + tierBoost) : weightedRandom(9, 17),
          judgingPotential: role === 'SCOUT' || role === 'SPORTING_DIRECTOR' ? Math.min(20, weightedRandom(13, 19) + tierBoost) : weightedRandom(9, 17),
          tacticalKnowledge: role === 'TREASURER' || role === 'PHYSIO' ? weightedRandom(5, 11) : Math.min(20, weightedRandom(10, 19) + tierBoost),
          adaptability: weightedRandom(8, 19),
          medical: role === 'PHYSIO' ? Math.min(20, weightedRandom(14, 19) + tierBoost) : 5,
          physiotherapy: role === 'PHYSIO' ? Math.min(20, weightedRandom(14, 19) + tierBoost) : 5,
          motivation: Math.min(20, weightedRandom(9, 18) + tierBoost),
          manManagement: Math.min(20, weightedRandom(9, 18) + tierBoost),
        },
        salary: computeRealisticStaffSalary({
          skill: avgSkill,
          role,
          clubRep: 4000 + tierBoost * 500,
          country: nat,
        }),
        contractExpiry: new Date(2028, 5, 30),
        history: [],
        personality: ['LEADER', 'PASSIONATE', 'CALM', 'DISCIPLINARIAN', 'VISIONARY'][randomInt(0, 4)],
        morale: 75,
        reputation: Math.min(95, 45 + tierBoost * 6 + randomInt(0, 20)),
        relationships: {},
        pressReputation: 50,
        boardRelationship: 65,
        tacticalStyle: style,
        preferredFormation: formation,
        playingStyle: style ? COACH_PLAYING_STYLE[style] : undefined,
      };
      this.addStaffIndexed(s);
    }
    this.markStaffDirty();
  }

  /** Contrata a un empleado (libre o de otro club) para el club del usuario, respetando cupos y presupuesto. */
  hireStaffMember(
    clubId: string,
    staffId: string,
    targetRole: StaffRole,
    offeredSalary: number,
    contractYears: number,
    date: Date,
    assignedSquads?: SquadType[]
  ): { ok: boolean; message: string } {
    const club = this.getClub(clubId);
    const candidate = this.getStaff(staffId);
    if (!club || !candidate) return { ok: false, message: 'No se encontró el empleado o el club.' };
    if (targetRole === 'HEAD_COACH') return { ok: false, message: 'El puesto de Director Técnico pertenece al usuario.' };
    if (candidate.clubId === clubId) return { ok: false, message: `${candidate.name} ya forma parte de tu cuerpo técnico.` };

    const previousClub = candidate.clubId ? this.getClub(candidate.clubId) : undefined;
    const compensation = previousClub ? Math.round(candidate.salary * 3) : 0;

    if (club.finances.balance < compensation) {
      return {
        ok: false,
        message: `Presupuesto insuficiente: se necesitan £${compensation.toLocaleString()} de indemnización para liberarlo de ${previousClub?.name}.`,
      };
    }

    const minAcceptableSalary = previousClub
      ? Math.round(candidate.salary * 1.05)
      : Math.round(candidate.salary * 0.85);
    if (offeredSalary < minAcceptableSalary) {
      return {
        ok: false,
        message: `${candidate.name} rechazó la oferta salarial. Pide al menos £${minAcceptableSalary.toLocaleString()}/mes.`,
      };
    }

    if (previousClub && previousClub.reputation > club.reputation + 1800 && offeredSalary < candidate.salary * 1.4) {
      return {
        ok: false,
        message: `${candidate.name} prefiere seguir en ${previousClub.name} salvo que reciba una oferta económica muy superior.`,
      };
    }

    const isCollaborative = this.isCollaborativeStaffRole(targetRole);
    const outgoing = !isCollaborative
      ? this.getStaffByClub(clubId).find(s => s.role === targetRole && s.id !== candidate.id)
      : undefined;

    const budgetStatus = this.getClubStaffBudgetStatus(clubId);
    const finalSalary = Math.max(800, Math.round(offeredSalary));
    const wageDelta = finalSalary - (outgoing?.salary || 0);

    if (!outgoing && budgetStatus.currentCount >= budgetStatus.maxCount) {
      return {
        ok: false,
        message: `Cupo máximo de cuerpo técnico alcanzado (${budgetStatus.currentCount}/${budgetStatus.maxCount} empleados). Rescindí a algún colaborador para liberar lugar.`,
      };
    }

    if (wageDelta > 0 && budgetStatus.currentWeeklyWage + wageDelta > budgetStatus.maxWeeklyWage) {
      return {
        ok: false,
        message: `Presupuesto salarial del cuerpo técnico insuficiente: tope £${budgetStatus.maxWeeklyWage.toLocaleString()}/mes (disponible £${budgetStatus.remainingWeeklyWage.toLocaleString()}/mes).`,
      };
    }

    if (outgoing) {
      outgoing.clubId = '';
      delete outgoing.assignedSquads;
      const delegationKeys = [
        'trainingDelegatedTo',
        'pressDelegatedTo',
        'talksDelegatedTo',
        'reserveDelegatedTo',
        'u20DelegatedTo',
        'scoutingDelegatedTo',
        'financeDelegatedTo',
      ] as const;
      delegationKeys.forEach(k => {
        if (club[k] === outgoing.id) {
          club[k] = candidate.id;
        }
      });
    }

    if (previousClub) {
      candidate.history.push({
        year: date.getFullYear(),
        clubId: previousClub.id,
        role: candidate.role,
      });
      previousClub.finances.balance += compensation;
      this.updateClubMonthlyExpenses(previousClub.id);
    }

    candidate.clubId = clubId;
    candidate.role = targetRole;
    candidate.salary = finalSalary;
    candidate.contractExpiry = new Date(date.getFullYear() + Math.max(1, contractYears), 5, 30);
    candidate.morale = 88;
    if (this.isCoachingRole(targetRole)) {
      const order: SquadType[] = ['SENIOR', 'RESERVE', 'U20'];
      const chosen = assignedSquads && assignedSquads.length > 0 ? assignedSquads : this.getDefaultStaffSquads(targetRole);
      candidate.assignedSquads = order.filter(q => chosen.includes(q));
    } else {
      delete candidate.assignedSquads;
    }

    club.finances.balance -= compensation;
    this.updateClubMonthlyExpenses(clubId);
    this.markStaffDirty();

    const roleLabel = this.getStaffRoleLabel(targetRole);
    const squadMap: Record<SquadType, string> = { SENIOR: 'Primera', RESERVE: 'Reserva', U20: 'Sub-20' };
    const squadText = candidate.assignedSquads && candidate.assignedSquads.length > 0
      ? ` Colaborará en ${candidate.assignedSquads.map(q => squadMap[q]).join(', ')}.`
      : '';

    this.addInboxMessage(
      'SQUAD',
      `Nuevo empleado: ${candidate.name}`,
      `${candidate.name} se incorporó al cuerpo técnico de ${club.name} (${roleLabel}) por ${contractYears} año${contractYears > 1 ? 's' : ''} a razón de £${candidate.salary.toLocaleString()}/mes.${squadText}${compensation > 0 ? ` Indemnización abonada: £${compensation.toLocaleString()}.` : ''}`,
      date,
      clubId,
      'INFO'
    );

    const isUser = club.id === this.getUserClub()?.id;
    this.publishNews(isUser ? 'TU_CLUB' : 'MERCADO', {
      date,
      type: 'HEADLINE',
      headline: `${candidate.name}, nuevo ${roleLabel} de ${club.shortName}`,
      subheadline: previousClub ? `Llega desde ${previousClub.shortName} por £${compensation.toLocaleString()}` : `Incorporación libre por ${contractYears} año${contractYears > 1 ? 's' : ''}`,
      body: `${club.name} oficializó la contratación de ${candidate.name} como ${roleLabel}${previousClub ? ` tras compensar a ${previousClub.name}` : ''}.${outgoing ? ` Ocupará el lugar que deja ${outgoing.name}.` : squadText}`,
      clubId,
      isUserClubNews: isUser,
    });

    return {
      ok: true,
      message: `${candidate.name} fue contratado como ${roleLabel}.${outgoing ? ` ${outgoing.name} dejó el cargo.` : squadText}`,
    };
  }

  // ─── GESTIÓN DE AMISTOSOS Y CALENDARIO DEL CLUB ───────────────────────────

  private hasClubMatchNearDate(clubId: string, targetDate: Date, fixtures: Fixture[], minGapDays = 2): boolean {
    const tDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    const gapMs = minGapDays * 86_400_000;
    for (const f of fixtures) {
      if (f.squadType !== 'SENIOR') continue;
      if (f.homeTeamId !== clubId && f.awayTeamId !== clubId) continue;
      const d = f.date instanceof Date ? f.date : new Date(f.date);
      const fDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (Math.abs(fDay - tDay) <= gapMs) return true;
    }
    return false;
  }

  getAvailableFriendlyDates(clubId: string, fixtures: Fixture[], fromDate: Date, daysAhead = 120): Date[] {
    const results: Date[] = [];
    const base = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 15, 0, 0, 0);
    for (let offset = 1; offset <= daysAhead; offset++) {
      const candidate = new Date(base);
      candidate.setDate(base.getDate() + offset);
      // Evitar días pegados a otro partido SENIOR del club (mínimo 2 días de descanso)
      if (!this.hasClubMatchNearDate(clubId, candidate, fixtures, 2)) {
        results.push(candidate);
      }
    }
    return results;
  }

  getAvailableFriendlyOpponents(
    userClubId: string,
    targetDate: Date,
    fixtures: Fixture[],
    searchQuery = ''
  ): Club[] {
    const userClub = this.getClub(userClubId);
    if (!userClub) return [];
    const q = searchQuery.trim().toLowerCase();

    return this.clubs
      .filter(c => {
        if (c.id === userClubId) return false;
        if (q && !c.name.toLowerCase().includes(q) && !c.shortName.toLowerCase().includes(q) && !c.country.toLowerCase().includes(q)) {
          return false;
        }
        return !this.hasClubMatchNearDate(c.id, targetDate, fixtures, 2);
      })
      .sort((a, b) => {
        const aSameCountry = a.country === userClub.country ? 0 : 1;
        const bSameCountry = b.country === userClub.country ? 0 : 1;
        if (aSameCountry !== bSameCountry) return aSameCountry - bSameCountry;
        return Math.abs(a.reputation - userClub.reputation) - Math.abs(b.reputation - userClub.reputation);
      })
      .slice(0, 60);
  }

  scheduleFriendlyMatch(
    userClubId: string,
    opponentClubId: string,
    targetDate: Date,
    isHome: boolean
  ): { ok: boolean; message: string; fixture?: Fixture } {
    const userClub = this.getClub(userClubId);
    const opponent = this.getClub(opponentClubId);
    if (!userClub || !opponent) {
      return { ok: false, message: 'No se encontró uno de los clubes.' };
    }
    if (userClubId === opponentClubId) {
      return { ok: false, message: 'No puedes concertar un amistoso contra tu propio club.' };
    }

    const store = useGameStore.getState();
    const currentFixtures = store.fixtures;

    if (this.hasClubMatchNearDate(userClubId, targetDate, currentFixtures, 2)) {
      return { ok: false, message: 'Tu equipo ya tiene un compromiso cercano a esa fecha.' };
    }
    if (this.hasClubMatchNearDate(opponentClubId, targetDate, currentFixtures, 2)) {
      return { ok: false, message: `${opponent.shortName} no tiene disponibilidad en esa fecha.` };
    }

    const matchDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 15, 0, 0, 0);
    const fixture: Fixture = {
      id: `FRIENDLY_${generateUUID().slice(0, 8)}`,
      competitionId: 'FRIENDLY',
      homeTeamId: isHome ? userClubId : opponentClubId,
      awayTeamId: isHome ? opponentClubId : userClubId,
      date: matchDate,
      played: false,
      squadType: 'SENIOR',
      stage: 'REGULAR',
    };

    const nextFixtures = [...currentFixtures, fixture];
    store.setFixtures(nextFixtures);
    store.updateNextFixture(nextFixtures, store.currentDate, userClubId);

    return {
      ok: true,
      message: `Amistoso confirmado: ${isHome ? `${userClub.shortName} vs ${opponent.shortName}` : `${opponent.shortName} vs ${userClub.shortName}`} (${matchDate.toLocaleDateString()}).`,
      fixture,
    };
  }

  cancelFriendlyMatch(fixtureId: string, userClubId: string): { ok: boolean; message: string } {
    const store = useGameStore.getState();
    const target = store.fixtures.find(f => f.id === fixtureId);
    if (!target) return { ok: false, message: 'No se encontró el partido.' };
    if (target.competitionId !== 'FRIENDLY') {
      return { ok: false, message: 'Solo se pueden cancelar partidos amistosos.' };
    }
    if (target.played) {
      return { ok: false, message: 'El amistoso ya fue disputado.' };
    }
    const nextFixtures = store.fixtures.filter(f => f.id !== fixtureId);
    store.setFixtures(nextFixtures);
    store.updateNextFixture(nextFixtures, store.currentDate, userClubId);
    return { ok: true, message: 'Amistoso cancelado del calendario.' };
  }

  arrangeFriendliesWithDirector(
    userClubId: string,
    fromDate: Date,
    maxToAdd = 3
  ): { ok: boolean; arranged: number; message: string } {
    const userClub = this.getClub(userClubId);
    if (!userClub) return { ok: false, arranged: 0, message: 'Club no encontrado.' };

    const director = this.getStaffByClub(userClubId).find(
      s => s.role === 'SPORTING_DIRECTOR' || s.role === 'ASSISTANT_MANAGER'
    );
    const store = useGameStore.getState();
    const existingFriendlies = store.fixtures.filter(
      f =>
        !f.played &&
        f.squadType === 'SENIOR' &&
        f.competitionId === 'FRIENDLY' &&
        (f.homeTeamId === userClubId || f.awayTeamId === userClubId)
    );
    if (existingFriendlies.length >= 6) {
      return {
        ok: false,
        arranged: 0,
        message: 'Ya tienes suficientes amistosos programados en agenda.',
      };
    }

    const availableDates = this.getAvailableFriendlyDates(userClubId, store.fixtures, fromDate, 100);
    if (availableDates.length === 0) {
      return {
        ok: false,
        arranged: 0,
        message: 'El calendario está completo y no hay fechas libres para amistosos.',
      };
    }

    // Buscar fechas espaciadas al menos 5 días entre sí
    const chosenDates: Date[] = [];
    let lastTs = 0;
    for (const d of availableDates) {
      const ts = d.getTime();
      if (chosenDates.length === 0 || ts - lastTs >= 5 * 86_400_000) {
        chosenDates.push(d);
        lastTs = ts;
        if (chosenDates.length >= maxToAdd) break;
      }
    }

    let arranged = 0;
    const summaryLines: string[] = [];
    const usedRivals = new Set<string>(
      existingFriendlies.map(f => (f.homeTeamId === userClubId ? f.awayTeamId : f.homeTeamId))
    );

    chosenDates.forEach((d, idx) => {
      const latestFixtures = useGameStore.getState().fixtures;
      const pool = this.getAvailableFriendlyOpponents(userClubId, d, latestFixtures).filter(
        c => !usedRivals.has(c.id)
      );
      if (pool.length === 0) return;
      const rival = pool[randomInt(0, Math.min(pool.length - 1, 14))];
      const isHome = idx % 2 === 0;
      const res = this.scheduleFriendlyMatch(userClubId, rival.id, d, isHome);
      if (res.ok) {
        arranged++;
        usedRivals.add(rival.id);
        summaryLines.push(`${isHome ? 'Local' : 'Visitante'} vs ${rival.shortName} (${d.toLocaleDateString()})`);
      }
    });

    if (arranged === 0) {
      return { ok: false, arranged: 0, message: 'No se encontraron rivales disponibles en las fechas libres.' };
    }

    const who = director ? `${director.name} (${this.getStaffRoleLabel(director.role)})` : 'La Secretaría Técnica';
    this.addInboxMessage(
      'SQUAD',
      `Amistosos concertados (${arranged})`,
      `${who} cerró ${arranged} amistoso${arranged > 1 ? 's' : ''} para mantener el ritmo competitivo: ${summaryLines.join(' · ')}.`,
      fromDate,
      userClubId,
      'INFO'
    );

    return {
      ok: true,
      arranged,
      message: `${who} concertó ${arranged} amistoso${arranged > 1 ? 's' : ''}: ${summaryLines.join(' · ')}`,
    };
  }

  getUserClubNews(limit = 20): MediaNews[] {
    const userClub = this.getUserClub();
    if (!userClub) return this.mediaNews.slice(0, limit);
    return this.mediaNews.filter(n => n.isUserClubNews || n.clubId === userClub.id).slice(0, limit);
  }

  getAllNews(limit = 50): MediaNews[] {
    return this.mediaNews.slice(0, limit);
  }

  getUserClub() {
    const userClubId = this.managerProfile?.currentClubId;
    return userClubId ? this.getClub(userClubId) : undefined;
  }
}

export const world = new WorldManager();

export function getBenchSizeForCompetition(comp?: Competition | null): number {
  if (!comp) return 7;
  if (comp.type === 'CUP' || comp.type === 'CONTINENTAL_ELITE' || comp.type === 'CONTINENTAL_SMALL' || comp.type === 'GLOBAL') return 12;
  return 7;
}
