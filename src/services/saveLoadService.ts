import { Club, Fixture, CareerMode, MatchSettings } from '../types';
import { world } from './worldManager';
import { saveGame, loadGame, checkSaveExists, listSaves, deleteSave, generateUUID, randomInt } from './utils';
import { LeagueEngine } from './leagueEngine';
import { useGameStore } from '../stores/gameStore';
import { OptaMatchReport, useMatchStore } from '../stores/matchStore';

export const SAVE_SCHEMA_VERSION = 2;

// ─── Save/Load Data Interfaces ───────────────────────────────────────────────

export interface SaveData {
  schemaVersion?: number;
  id: string;
  label: string;
  lastPlayed: Date;
  metaTeamName: string;
  metaManagerName: string;
  gameState: {
    currentDate: Date;
    userName: string;
    userSurname: string;
    userClubId: string | null;
    selectedNationalTeamId: string | null;
    careerMode: CareerMode;
    fixtures: Fixture[];
    seasonEndDate: Date;
    deepSimLeagues: string[];
    managerHistory: any;
    managerReputation: number;
    darkMode: boolean;
    activeTacticId?: string;
    matchSettings?: MatchSettings;
  };
  worldState: {
    players: any[];
    clubs: any[];
    competitions: any[];
    staff: any[];
    tactics: any[];
    offers: any[];
    inbox: any[];
    scoutingReports: any[];
    chronicles: any[];
    interactionLog: any[];
    activeReputationalBuffs: any[];
    relationshipWeb: any;
    mediaNews: any[];
    managerProfile: any;
    nationalTeamManager: any;
    seasonHistory: any[];
    currentSeasonPages: any[];
  };
  optaState?: {
    lastOptaReport: OptaMatchReport | null;
    optaReportsByFixture: Record<string, OptaMatchReport>;
  };
}

export interface SaveMetadata {
  id: string;
  label: string;
  date: Date;
  teamName: string;
  managerName?: string;
}

// ─── Recursive Date Hydration (essential for JSON imports & IndexedDB safety) ─

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function reviveDatesDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d as unknown as T;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = reviveDatesDeep(value[i]);
    }
    return value;
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key === 'dateIso') continue; // keep explicit ISO string fields as strings
      obj[key] = reviveDatesDeep(obj[key]);
    }
  }
  return value;
}

export function hydrateSaveDates(raw: any): SaveData {
  const revived = reviveDatesDeep(raw);
  if (revived.lastPlayed && !(revived.lastPlayed instanceof Date)) {
    revived.lastPlayed = new Date(revived.lastPlayed);
  }
  if (revived.gameState) {
    revived.gameState.currentDate = new Date(revived.gameState.currentDate);
    revived.gameState.seasonEndDate = new Date(revived.gameState.seasonEndDate);
    if (Array.isArray(revived.gameState.fixtures)) {
      revived.gameState.fixtures.forEach((f: any) => {
        if (f && f.date && !(f.date instanceof Date)) f.date = new Date(f.date);
      });
    }
  }
  return revived as SaveData;
}

// ─── Build save data from current state ──────────────────────────────────────

export function buildSaveData(params: {
  id: string;
  label: string;
  currentDate: Date;
  userName: string;
  userSurname: string;
  userClub: Club | null;
  selectedNationalTeamId: string | null;
  careerMode: CareerMode;
  fixtures: Fixture[];
  seasonEndDate: Date;
}): SaveData {
  const {
    id,
    label,
    currentDate,
    userName,
    userSurname,
    userClub,
    selectedNationalTeamId,
    careerMode,
    fixtures,
    seasonEndDate,
  } = params;
  const managedName =
    userClub?.name ||
    world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === selectedNationalTeamId)?.name ||
    'Selección Nacional';

  const matchStore = useMatchStore.getState();
  // Keep up to the 6 most recent Opta reports so saves stay fast and lean
  const reportKeys = Object.keys(matchStore.optaReportsByFixture);
  const recentReports: Record<string, OptaMatchReport> = {};
  for (const key of reportKeys.slice(-6)) {
    recentReports[key] = matchStore.optaReportsByFixture[key];
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    id,
    label,
    lastPlayed: new Date(),
    metaTeamName: managedName,
    metaManagerName: `${userName} ${userSurname}`,
    gameState: {
      currentDate,
      userName,
      userSurname,
      userClubId: userClub?.id || null,
      selectedNationalTeamId,
      careerMode,
      fixtures,
      seasonEndDate,
      deepSimLeagues: useGameStore.getState().deepSimLeagues,
      managerHistory: useGameStore.getState().managerHistory,
      managerReputation: useGameStore.getState().managerReputation,
      darkMode: useGameStore.getState().darkMode,
      activeTacticId: world.activeTacticId,
      matchSettings: { ...world.matchSettings },
    },
    worldState: {
      players: world.players,
      clubs: world.clubs,
      competitions: world.competitions,
      staff: world.staff,
      tactics: world.tactics,
      offers: world.offers,
      inbox: world.inbox,
      scoutingReports: world.scoutingReports,
      chronicles: world.chronicles,
      interactionLog: world.interactionLog,
      activeReputationalBuffs: world.activeReputationalBuffs,
      relationshipWeb: world.relationshipWeb,
      mediaNews: world.mediaNews,
      managerProfile: world.managerProfile,
      nationalTeamManager: world.nationalTeamManager,
      seasonHistory: world.seasonHistory,
      currentSeasonPages: world.currentSeasonPages,
    },
    optaState: {
      lastOptaReport: matchStore.lastOptaReport,
      optaReportsByFixture: recentReports,
    },
  };
}

// ─── Auto-save ───────────────────────────────────────────────────────────────

export async function performAutoSave(params: {
  currentDate: Date;
  userName: string;
  userSurname: string;
  userClub: Club | null;
  selectedNationalTeamId: string | null;
  careerMode: CareerMode;
  fixtures: Fixture[];
  seasonEndDate: Date;
  isAutoSaveEnabled: boolean;
}): Promise<boolean> {
  if (!params.isAutoSaveEnabled) return false;
  try {
    const teamKey = params.userClub?.id || params.selectedNationalTeamId || 'career';
    const teamLabel = params.userClub?.shortName || params.userClub?.name || 'Carrera';
    const id = `autosave_club_${teamKey}`;
    const saveData = buildSaveData({
      id,
      label: `Auto · ${teamLabel} (${params.currentDate.toLocaleDateString()})`,
      ...params,
    });
    await saveGame(saveData);
    return true;
  } catch (e) {
    console.error('Auto-save failed:', e);
    return false;
  }
}

// ─── Manual save ─────────────────────────────────────────────────────────────

export async function manualSave(params: {
  saveNameInput: string;
  overwriteId?: string;
  currentDate: Date;
  userName: string;
  userSurname: string;
  userClub: Club | null;
  selectedNationalTeamId: string | null;
  careerMode: CareerMode;
  fixtures: Fixture[];
  seasonEndDate: Date;
}): Promise<SaveData | null> {
  if (!params.saveNameInput.trim()) return null;
  const id = params.overwriteId || generateUUID();
  const saveData = buildSaveData({
    id,
    label: params.saveNameInput.trim(),
    ...params,
  });
  await saveGame(saveData);
  return saveData;
}

// ─── JSON Export / Import ────────────────────────────────────────────────────

function buildSaveFilePayload(saveData: SaveData): { fileName: string; blob: Blob } {
  const safeSlug = (saveData.metaTeamName || 'fm2_carrera')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const datePart =
    saveData.gameState?.currentDate instanceof Date
      ? saveData.gameState.currentDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const fileName = `${safeSlug || 'fm2'}_${datePart}.fm2.json`;
  const jsonText = JSON.stringify(saveData);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  return { fileName, blob };
}

export function exportSaveToJsonFile(saveData: SaveData): void {
  const { fileName, blob } = buildSaveFilePayload(saveData);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSavedSlotById(id: string): Promise<boolean> {
  const raw = await loadGame(id);
  if (!raw) return false;
  exportSaveToJsonFile(hydrateSaveDates(raw));
  return true;
}

export async function shareSavedSlotByEmail(id: string): Promise<'shared' | 'mailto' | 'not_found'> {
  const raw = await loadGame(id);
  if (!raw) return 'not_found';
  const hydrated = hydrateSaveDates(raw);
  const { fileName, blob } = buildSaveFilePayload(hydrated);
  const subject = `Partida guardada: ${hydrated.label || hydrated.metaTeamName || 'FM Argentina'}`;
  const body = `Te comparto mi partida guardada (${hydrated.metaTeamName || 'Club'} · ${hydrated.metaManagerName || 'Manager'}).\n\nAdjuntá el archivo "${fileName}" a este correo para cargarla en el juego.`;

  try {
    if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && typeof navigator.share === 'function') {
      const file = new File([blob], fileName, { type: 'application/json' });
      const canShareFiles = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : false;
      if (canShareFiles) {
        await navigator.share({
          title: subject,
          text: body,
          files: [file],
        });
        return 'shared';
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return 'shared';
  }

  // Fallback universal: descarga el archivo y abre el cliente de correo listo para adjuntar
  exportSaveToJsonFile(hydrated);
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mailLink = document.createElement('a');
  mailLink.href = mailtoUrl;
  mailLink.style.display = 'none';
  document.body.appendChild(mailLink);
  mailLink.click();
  document.body.removeChild(mailLink);
  return 'mailto';
}

export function parseAndValidateImportedSave(rawText: string): SaveData {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('El archivo seleccionado no es una partida válida.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.gameState ||
    !parsed.worldState ||
    !Array.isArray(parsed.worldState.clubs) ||
    !Array.isArray(parsed.worldState.players) ||
    !Array.isArray(parsed.gameState.fixtures)
  ) {
    throw new Error('El archivo no corresponde a una partida válida de FM2.');
  }

  const hydrated = hydrateSaveDates(parsed);
  if (Number.isNaN(hydrated.gameState.currentDate.getTime())) {
    throw new Error('La fecha de la partida importada está corrupta.');
  }

  // Assign a fresh ID on import so it never collides unexpectedly with an existing slot
  hydrated.id = generateUUID();
  hydrated.label = hydrated.label ? `${hydrated.label} (Importada)` : `Importada · ${new Date().toLocaleDateString()}`;
  hydrated.lastPlayed = new Date();
  hydrated.schemaVersion = SAVE_SCHEMA_VERSION;
  return hydrated;
}

export async function importSaveFromJsonText(rawText: string): Promise<SaveData> {
  const validated = parseAndValidateImportedSave(rawText);
  await saveGame(validated);
  return validated;
}

// ─── Load game & Migrations ──────────────────────────────────────────────────

export interface LoadResult extends SaveData {}

export function migrateSquadDistribution(): void {
  let needsFix = false;
  world.clubs.forEach((club: any) => {
    const squad = world.getPlayersByClub(club.id);
    const senior = squad.filter((p: any) => p.squad === 'SENIOR');
    const reserve = squad.filter((p: any) => p.squad === 'RESERVE');
    const u20 = squad.filter((p: any) => p.squad === 'U20');
    if (reserve.length === 0 && u20.length === 0 && senior.length >= 14) {
      senior.forEach((p: any) => {
        if (p.age >= 23) return;
        if (p.isStarter) return;
        p.squad = p.age >= 20 ? 'RESERVE' : 'U20';
        p.isStarter = false;
        p.tacticalPosition = undefined;
        needsFix = true;
      });
    }
  });
  if (needsFix) {
    world.markPlayersDirty();
    world.clubs.forEach((club: any) => world.generateSquadsForClub(club.id));
  }
}

export function migrateInboxAndNews(): void {
  world.inbox.forEach((m: any) => {
    if (!m.priority) m.priority = 'INFO';
    if (m.actionRequired === undefined) m.actionRequired = false;
  });
  world.mediaNews.forEach((n: any) => {
    if (!n.section) {
      const legacy = (n.category || '') as string;
      n.section =
        legacy === 'MATCH'
          ? 'RESULTADOS'
          : legacy === 'TRANSFER'
          ? 'MERCADO'
          : legacy === 'INJURY'
          ? 'LESIONES'
          : legacy === 'BOARD'
          ? 'CLASIFICACION'
          : 'INTERNACIONAL';
    }
    if (n.featured === undefined) n.featured = false;
  });
}

export async function loadGameData(id: string): Promise<LoadResult | null> {
  const data = await loadGame(id);
  if (!data) return null;
  return hydrateSaveDates(data);
}

export function applyWorldState(
  worldState: any,
  gameState?: SaveData['gameState'],
  optaState?: SaveData['optaState']
): void {
  // Detener la carga inicial en segundo plano para evitar condiciones de carrera con la partida cargada
  world.cancelInitialLoad();

  // Deduplicate players by ID
  const seenIds = new Set<string>();
  world.players = (worldState.players || []).filter((p: any) => {
    if (!p?.id || seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });
  world.markPlayersDirty();

  world.clubs = worldState.clubs || [];
  world.competitions = worldState.competitions || [];
  world.staff = worldState.staff || [];
  world.markStaffDirty();
  world.tactics = worldState.tactics || world.tactics;
  world.offers = worldState.offers || [];
  world.inbox = worldState.inbox || [];
  world.scoutingReports = worldState.scoutingReports || [];
  world.interactionLog = worldState.interactionLog || [];
  world.activeReputationalBuffs = worldState.activeReputationalBuffs || [];
  world.relationshipWeb = worldState.relationshipWeb || {};
  world.mediaNews = worldState.mediaNews || [];
  world.seasonHistory = worldState.seasonHistory || [];
  world.currentSeasonPages = worldState.currentSeasonPages || [];
  world.chronicles = worldState.chronicles || [];
  world.managerProfile = worldState.managerProfile || null;

  if (gameState?.matchSettings) {
    world.matchSettings = {
      pauseAtHalftime: Boolean(gameState.matchSettings.pauseAtHalftime),
      speedMultiplier: gameState.matchSettings.speedMultiplier || 1,
    };
  }
  if (gameState?.activeTacticId) {
    world.setActiveTactic(gameState.activeTacticId);
  } else if (world.tactics[0]?.id) {
    world.activeTacticId = world.tactics[0].id;
  }

  migrateInboxAndNews();
  migrateSquadDistribution();

  world.players.forEach((p: any) => {
    if (!p.relationships) p.relationships = {};
    if (!p.injuryHistory) p.injuryHistory = [];
    if (p.tacticalFamiliarity === undefined) p.tacticalFamiliarity = 50;
    if (p.leadership === undefined) p.leadership = randomInt(5, 20);
    if (p.consistency === undefined) p.consistency = randomInt(5, 20);
    if (p.bigMatchTemperament === undefined) p.bigMatchTemperament = randomInt(5, 20);
    if (p.pendingDialogue === undefined) p.pendingDialogue = undefined;
  });

  world.staff.forEach((s: any) => {
    if (!s.relationships) s.relationships = {};
    if (s.personality === undefined)
      s.personality = ['LEADER', 'PASSIONATE', 'CALM', 'DISCIPLINARIAN', 'VISIONARY'][
        Math.floor(Math.random() * 5)
      ];
    if (s.morale === undefined) s.morale = 70;
    if (s.reputation === undefined) s.reputation = 50;
    if (s.pressReputation === undefined) s.pressReputation = 50;
    if (s.boardRelationship === undefined) s.boardRelationship = 60;
    if (s.siguioConsejoUltimaVez === undefined) s.siguioConsejoUltimaVez = false;
  });

  world.competitions.forEach((c: any) => {
    if (c.continent === undefined) c.continent = 'América del Sur';
    if (c.confederation === undefined) c.confederation = 'CONMEBOL';
    if (c.defaultPrizePool === undefined) c.defaultPrizePool = 1000000;
    if (c.continentalSlots === undefined) c.continentalSlots = 4;
  });

  world.clubs.forEach((club: any) => {
    if (!club.transferFolderIds) club.transferFolderIds = [];
  });

  // Restore Opta match reports if saved
  if (optaState) {
    useMatchStore.setState({
      lastOptaReport: optaState.lastOptaReport || null,
      optaReportsByFixture: optaState.optaReportsByFixture || {},
    });
  } else {
    useMatchStore.setState({ lastOptaReport: null, optaReportsByFixture: {} });
  }
}

export async function restoreNationalTeamManager(worldState: any): Promise<void> {
  const { NationalTeamManager } = await import('./nationalTeamManager');
  if (worldState.nationalTeamManager) {
    world.nationalTeamManager = new NationalTeamManager();
    Object.assign(world.nationalTeamManager, worldState.nationalTeamManager);
    world.nationalTeamManager.assignPlayersToNationalTeams(world.players, world.clubs);
    world.nationalTeamManager.validateControlledState(world.players, world.clubs);
  } else {
    world.nationalTeamManager = new NationalTeamManager();
    world.nationalTeamManager.assignPlayersToNationalTeams(world.players, world.clubs);
    world.nationalTeamManager.validateControlledState(world.players, world.clubs);
  }
}

export function resolveDeepLeagues(userClubId: string | null, savedDeepLeagues: string[]): string[] {
  const savedUserLeague = world.getClub(userClubId)?.leagueId;
  const effectiveDeepLeagues =
    Array.isArray(savedDeepLeagues) && savedDeepLeagues.length > 0
      ? savedDeepLeagues
      : savedUserLeague
      ? [savedUserLeague]
      : [];
  return LeagueEngine.resolveDeepLeagueIds(savedUserLeague, world.competitions, effectiveDeepLeagues);
}

// ─── List/delete saves ───────────────────────────────────────────────────────

export { listSaves, deleteSave, checkSaveExists };
