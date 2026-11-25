import {
  computeFormationLabel,
  FORMATIONS,
  inferRoleFromCoords,
  nearestPresetFormationId,
} from '../engine/formations';
import { MatchEngine } from '../engine/MatchEngine';
import {
  Club,
  InjurySeverity,
  MatchEvent as Fm2MatchEvent,
  Player,
  PlayerMatchStats,
  PlayerTacticSettings,
  Position,
  Tactic,
  TacticSettings,
} from '../types';
import {
  ClubPreset,
  CustomPlayerAnchor,
  DefensiveLineLevel,
  FormationId,
  MatchEvent as EngineMatchEvent,
  MatchSnapshot,
  MentalityLevel,
  PassingStyle,
  PlayerAttributes,
  PlayerInstruction,
  PlayerMatchState,
  PlayerProfile,
  PlayerRole,
  PressingIntensity,
  TeamColors,
  TeamSide,
  TeamTactics,
  TempoLevel,
  WidthLevel,
} from '../types/match';
import { OptaMatchReport } from '../stores/matchStore';

// ─── Tailwind Class -> Hex Color Palette ─────────────────────────────────────

const TW_COLORS: Record<string, Record<string, string>> = {
  red: { '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c', '800': '#991b1b', '900': '#7f1d1d' },
  rose: { '500': '#f43f5e', '600': '#e11d48', '700': '#be123c', '800': '#9f1239' },
  orange: { '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c' },
  amber: { '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309' },
  yellow: { '300': '#fde047', '400': '#facc15', '500': '#eab308', '600': '#ca8a04' },
  lime: { '500': '#84cc16', '600': '#65a30d', '700': '#4d7c0f' },
  green: { '500': '#22c55e', '600': '#16a34a', '700': '#15803d', '800': '#166534', '900': '#14532d' },
  emerald: { '500': '#10b981', '600': '#059669', '700': '#047857', '800': '#065f46', '900': '#064e3b' },
  teal: { '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e', '800': '#115e59' },
  cyan: { '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490' },
  sky: { '400': '#38bdf8', '500': '#0ea5e9', '600': '#0284c7', '700': '#0369a1', '800': '#075985' },
  blue: { '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#1e3a8a', '950': '#172554' },
  indigo: { '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca', '800': '#3730a3', '900': '#312e81' },
  violet: { '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9', '800': '#5b21b6' },
  purple: { '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce', '800': '#6b21a8', '900': '#581c87' },
  fuchsia: { '600': '#c026d3', '700': '#a21caf' },
  pink: { '500': '#ec4899', '600': '#db2777', '700': '#be185d' },
  slate: { '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a', '950': '#020617' },
  gray: { '100': '#f3f4f6', '200': '#e5e7eb', '400': '#9ca3af', '600': '#4b5563', '700': '#374151', '800': '#1f2937', '900': '#111827' },
  zinc: { '700': '#3f3f46', '800': '#27272a', '900': '#18181b' },
  neutral: { '700': '#404040', '800': '#262626', '900': '#171717' },
  stone: { '700': '#44403c', '800': '#292524', '900': '#1c1917' },
};

export function tailwindClassToHex(cls: string | undefined, fallback: string): string {
  if (!cls) return fallback;
  const trimmed = cls.trim();
  if (trimmed.startsWith('#') && (trimmed.length === 4 || trimmed.length === 7)) {
    return trimmed;
  }
  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    const clean = token.replace(/^(bg|text|border)-/, '');
    if (clean === 'white') return '#f8fafc';
    if (clean === 'black') return '#111827';
    const match = clean.match(/^\[#([0-9a-fA-F]{3,6})\]$/);
    if (match) return `#${match[1]}`;
    const parts = clean.split('-');
    if (parts.length >= 2) {
      const family = parts[0];
      const shade = parts[1];
      const famMap = TW_COLORS[family];
      if (famMap) {
        return famMap[shade] || famMap['700'] || famMap['600'] || Object.values(famMap)[0];
      }
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function resolveKitColors(
  homeClub: Pick<Club, 'primaryColor' | 'secondaryColor'>,
  awayClub: Pick<Club, 'primaryColor' | 'secondaryColor'>
): { homeColors: TeamColors; awayColors: TeamColors } {
  const hPrimary = tailwindClassToHex(homeClub.primaryColor, '#b91c1c');
  const hSecondary = tailwindClassToHex(homeClub.secondaryColor, '#f8fafc');
  let aPrimary = tailwindClassToHex(awayClub.primaryColor, '#1d4ed8');
  let aSecondary = tailwindClassToHex(awayClub.secondaryColor, '#f8fafc');

  // Auto-resolve kit clash so away shirt is always clearly distinct on the pitch
  if (colorDistance(hPrimary, aPrimary) < 115) {
    if (colorDistance(hPrimary, aSecondary) >= 125) {
      const prev = aPrimary;
      aPrimary = aSecondary;
      aSecondary = prev;
    } else {
      const [r, g, b] = hexToRgb(hPrimary);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      aPrimary = luma > 140 ? '#1e293b' : '#f1f5f9';
      aSecondary = luma > 140 ? '#facc15' : '#1e3a8a';
    }
  }

  return {
    homeColors: {
      primary: hPrimary,
      secondary: hSecondary,
      shorts: hSecondary === '#f8fafc' ? '#1e293b' : hSecondary,
      socks: hPrimary,
      gkPrimary: colorDistance(hPrimary, '#16a34a') > 110 ? '#16a34a' : '#eab308',
      accent: hSecondary,
    },
    awayColors: {
      primary: aPrimary,
      secondary: aSecondary,
      shorts: aSecondary === '#f8fafc' ? '#0f172a' : aSecondary,
      socks: aPrimary,
      gkPrimary: colorDistance(aPrimary, '#f59e0b') > 110 ? '#f59e0b' : '#7c3aed',
      accent: aSecondary,
    },
  };
}

// ─── Attribute & Role Conversion (FM2 1-20 -> MatchEngine 42-98) ──────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function scaleFm2Attr(val1to20: number | undefined, fallbackCA = 110): number {
  if (typeof val1to20 === 'number' && !Number.isNaN(val1to20)) {
    const v = clamp(val1to20, 1, 20);
    // Smooth non-linear curve preserving elite gap: 1->44, 10->70, 15->85, 18->93, 20->98
    return Math.round(clamp(41 + v * 2.85, 42, 98));
  }
  return Math.round(clamp(46 + (fallbackCA / 200) * 50, 44, 96));
}

export function mapFm2PositionToRole(pos: Position | undefined): PlayerRole {
  switch (pos) {
    case Position.GK:
      return 'POR';
    case Position.SW:
    case Position.DC:
      return 'DFC';
    case Position.DL:
      return 'LI';
    case Position.DR:
      return 'LD';
    case Position.DML:
    case Position.DMR:
      return 'CAR';
    case Position.DM:
      return 'MCD';
    case Position.MC:
    case Position.ML:
    case Position.MR:
      return 'MC';
    case Position.AM:
      return 'MCO';
    case Position.AML:
    case Position.STL:
      return 'EI';
    case Position.AMR:
    case Position.STR:
      return 'ED';
    case Position.ST:
      return 'DC';
    default:
      return 'MC';
  }
}

function getRoleLineGroup(role: PlayerRole): 'GK' | 'DEF' | 'MID' | 'ATT' {
  if (role === 'POR') return 'GK';
  if (role === 'DFC' || role === 'LI' || role === 'LD' || role === 'CAR') return 'DEF';
  if (role === 'MCD' || role === 'MC' || role === 'MCO') return 'MID';
  return 'ATT';
}

type Fm2SlotLine = 'GK' | 'SW' | 'DEF' | 'DM' | 'MID' | 'AM' | 'ATT';

export const FM2_SLOT_LAYOUT: Record<
  number,
  { line: Fm2SlotLine; role: PlayerRole; xNorm: number; zNorm: number; sortOrder: number }
> = {
  0:  { line: 'GK',  role: 'POR', xNorm: 0.04, zNorm: 0,     sortOrder: 0 },
  31: { line: 'SW',  role: 'DFC', xNorm: 0.13, zNorm: 0,     sortOrder: 1 },
  1:  { line: 'DEF', role: 'LI',  xNorm: 0.21, zNorm: -0.37, sortOrder: 2 },
  2:  { line: 'DEF', role: 'DFC', xNorm: 0.18, zNorm: -0.17, sortOrder: 3 },
  3:  { line: 'DEF', role: 'DFC', xNorm: 0.17, zNorm: 0,     sortOrder: 4 },
  4:  { line: 'DEF', role: 'DFC', xNorm: 0.18, zNorm: 0.17,  sortOrder: 5 },
  5:  { line: 'DEF', role: 'LD',  xNorm: 0.21, zNorm: 0.37,  sortOrder: 6 },
  9:  { line: 'DM',  role: 'CAR', xNorm: 0.35, zNorm: -0.39, sortOrder: 7 },
  6:  { line: 'DM',  role: 'MCD', xNorm: 0.35, zNorm: -0.17, sortOrder: 8 },
  8:  { line: 'DM',  role: 'MCD', xNorm: 0.35, zNorm: 0,     sortOrder: 9 },
  7:  { line: 'DM',  role: 'MCD', xNorm: 0.35, zNorm: 0.17,  sortOrder: 10 },
  10: { line: 'DM',  role: 'CAR', xNorm: 0.35, zNorm: 0.39,  sortOrder: 11 },
  11: { line: 'MID', role: 'EI',  xNorm: 0.48, zNorm: -0.38, sortOrder: 12 },
  12: { line: 'MID', role: 'MC',  xNorm: 0.47, zNorm: -0.16, sortOrder: 13 },
  13: { line: 'MID', role: 'MC',  xNorm: 0.47, zNorm: 0,     sortOrder: 14 },
  14: { line: 'MID', role: 'MC',  xNorm: 0.47, zNorm: 0.16,  sortOrder: 15 },
  15: { line: 'MID', role: 'ED',  xNorm: 0.48, zNorm: 0.38,  sortOrder: 16 },
  16: { line: 'AM',  role: 'EI',  xNorm: 0.61, zNorm: -0.36, sortOrder: 17 },
  19: { line: 'AM',  role: 'MCO', xNorm: 0.60, zNorm: -0.17, sortOrder: 18 },
  17: { line: 'AM',  role: 'MCO', xNorm: 0.59, zNorm: 0,     sortOrder: 19 },
  20: { line: 'AM',  role: 'MCO', xNorm: 0.60, zNorm: 0.17,  sortOrder: 20 },
  18: { line: 'AM',  role: 'ED',  xNorm: 0.61, zNorm: 0.36,  sortOrder: 21 },
  27: { line: 'ATT', role: 'EI',  xNorm: 0.71, zNorm: -0.35, sortOrder: 22 },
  29: { line: 'ATT', role: 'DC',  xNorm: 0.75, zNorm: -0.16, sortOrder: 23 },
  26: { line: 'ATT', role: 'DC',  xNorm: 0.76, zNorm: 0,     sortOrder: 24 },
  30: { line: 'ATT', role: 'DC',  xNorm: 0.75, zNorm: 0.16,  sortOrder: 25 },
  28: { line: 'ATT', role: 'ED',  xNorm: 0.71, zNorm: 0.35,  sortOrder: 26 },
};

export function fm2SlotToAnchor(slot: number): CustomPlayerAnchor {
  const layout = FM2_SLOT_LAYOUT[slot] || FM2_SLOT_LAYOUT[13];
  return {
    xNorm: layout.xNorm,
    zNorm: layout.zNorm,
    role: layout.role,
    fm2Slot: slot,
  };
}

export function findNearestFm2Slot(
  xNorm: number,
  zNorm: number,
  occupiedSlots: Set<number>
): number {
  let bestSlot = 13;
  let bestDist = Infinity;
  for (const [slotStr, layout] of Object.entries(FM2_SLOT_LAYOUT)) {
    const slot = Number(slotStr);
    if (slot === 0) continue;
    if (occupiedSlots.has(slot)) continue;
    const dx = layout.xNorm - xNorm;
    const dz = layout.zNorm - zNorm;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestSlot = slot;
    }
  }
  return bestSlot;
}

export function inferExactFormationLabelFromSlots(slots: number[]): string {
  const unique = Array.from(new Set(slots)).filter((s) => s !== 0 && FM2_SLOT_LAYOUT[s]);
  if (unique.length < 7) return '4-4-2';

  let def = 0;
  let dm = 0;
  let mid = 0;
  let am = 0;
  let wideAm = 0;
  let att = 0;

  for (const s of unique) {
    const line = FM2_SLOT_LAYOUT[s].line;
    if (line === 'SW' || line === 'DEF') def++;
    else if (line === 'DM') dm++;
    else if (line === 'MID') mid++;
    else if (line === 'AM') {
      am++;
      if (s === 16 || s === 18) wideAm++;
    } else if (line === 'ATT') att++;
  }

  // Classic 4-2-3-1 (4 DEF, 2 DM, 3 AM, 1 ATT)
  if (dm === 2 && mid === 0 && am === 3 && att === 1) return `${def}-2-3-1`;
  // Classic 4-1-4-1 (4 DEF, 1 DM, 4 MID, 1 ATT)
  if (dm === 1 && mid === 4 && am === 0 && att === 1) return `${def}-1-4-1`;
  // Classic 4-3-3 Ofensiva (1 DM + 2 MID + 2 inside/wide AM + 1 ST OR 3 MID + 3 ATT)
  if (dm + mid === 3 && am === 2 && att === 1) return `${def}-3-3`;
  // Wide AM wingers + 2 ST with 2 midfielders -> 4-2-4
  if (dm + mid === 2 && wideAm === 2 && am === 2 && att === 2) return `${def}-2-4`;
  // 4-2-2-2 (2 DM, 2 central AM, 2 ST)
  if (dm === 2 && mid === 0 && am === 2 && wideAm === 0 && att === 2) return `${def}-2-2-2`;
  // 4-4-1-1 (4 DEF, 4 MID, 1 AM, 1 ATT)
  if (dm === 0 && mid >= 3 && am === 1 && att === 1) return `${def}-${mid}-1-1`;
  // Generic 4-band if DM + AM both explicitly populated with no central MID
  if (dm > 0 && mid === 0 && am > 0 && att > 0) return `${def}-${dm}-${am}-${att}`;

  const totalMid = dm + mid + am;
  return `${def}-${totalMid}-${att}`;
}

export function inferFormationFromFm2(tactic?: Tactic, starters?: Player[]): FormationId {
  // 1) ALWAYS inspect actual placed starter slots first (drag-and-drop moves update starter.tacticalPosition & tactic.positions!)
  const starterSlots = (starters || [])
    .map((p) => p.tacticalPosition)
    .filter((s): s is number => s !== undefined && Boolean(FM2_SLOT_LAYOUT[s]));
  const activeSlots =
    starterSlots.length >= 10
      ? starterSlots
      : tactic?.positions && tactic.positions.length >= 10
      ? tactic.positions
      : [];

  if (activeSlots.length >= 10) {
    const label = inferExactFormationLabelFromSlots(activeSlots);
    return nearestPresetFormationId(label, '4-4-2');
  }

  // 2) Try tactic name if no concrete slot positions were available
  const name = tactic?.name || '';
  const known: FormationId[] = [
    '4-2-3-1',
    '4-1-4-1',
    '4-4-1-1',
    '4-2-2-2',
    '4-3-3',
    '4-2-4',
    '4-4-2',
    '3-5-2',
    '5-3-2',
    '5-4-1',
    '3-4-3',
  ];
  for (const f of known) {
    if (name.includes(f)) return f;
  }

  // 3) Fallback from starter natural positions
  if (starters && starters.length >= 11) {
    let def = 0;
    let att = 0;
    for (const p of starters.slice(0, 11)) {
      const role = mapFm2PositionToRole(p.primaryPosition || p.positions?.[0]);
      const g = getRoleLineGroup(role);
      if (g === 'DEF') def++;
      else if (g === 'ATT') att++;
    }
    if (def >= 5) return att <= 1 ? '5-4-1' : '5-3-2';
    if (def <= 3) return att >= 3 ? '3-4-3' : '3-5-2';
    if (att >= 4) return '4-2-4';
    if (att === 3) return '4-3-3';
    if (att === 2) return '4-4-2';
  }
  return '4-2-3-1';
}

export function mapFm2SettingsToTeamTactics(
  formation: FormationId,
  settings?: TacticSettings,
  club?: Club,
  customLabel?: string
): TeamTactics {
  if (!settings) {
    // Derive realistic AI club tactics from club reputation/cohesion
    const rep = club?.reputation ?? 5000;
    return {
      formation,
      customLabel: customLabel || formation,
      mentality: rep >= 7500 ? 'ofensiva' : rep >= 4500 ? 'equilibrada' : 'defensiva',
      pressing: rep >= 7000 ? 'presion_alta' : 'bloque_medio',
      passing: rep >= 7000 ? 'corto' : rep >= 4500 ? 'mixto' : 'directo',
      tempo: rep >= 6500 ? 'alto' : 'normal',
      width: 'equilibrado',
      defensiveLine: rep >= 7500 ? 'adelantada' : 'normal',
      counterAttack: rep < 6000,
      playOutFromBack: rep >= 6000,
    };
  }

  const m = settings.mentality ?? 10;
  const mentality: MentalityLevel =
    m <= 4 ? 'muy_defensiva' : m <= 8 ? 'defensiva' : m <= 13 ? 'equilibrada' : m <= 17 ? 'ofensiva' : 'ataque_total';

  const cd = settings.closingDown ?? 10;
  const pressing: PressingIntensity =
    cd <= 6 ? 'bloque_bajo' : cd <= 11 ? 'bloque_medio' : cd <= 16 ? 'presion_alta' : 'gegenpress';

  const ps = settings.passingStyle ?? 10;
  const passing: PassingStyle =
    ps <= 6 ? 'corto' : ps <= 11 ? 'mixto' : ps <= 16 ? 'directo' : 'largo';

  const tp = settings.tempo ?? 10;
  const tempo: TempoLevel =
    tp <= 6 ? 'pausado' : tp <= 11 ? 'normal' : tp <= 16 ? 'alto' : 'vertiginoso';

  const w = settings.width ?? 10;
  const width: WidthLevel = w <= 7 ? 'estrecho' : w <= 13 ? 'equilibrado' : 'amplio';

  const dl = settings.defensiveLine ?? 10;
  const defensiveLine: DefensiveLineLevel =
    settings.playOffside
      ? 'fuera_de_juego'
      : dl <= 6
      ? 'muy_atras'
      : dl <= 12
      ? 'normal'
      : 'adelantada';

  return {
    formation,
    customLabel: customLabel || formation,
    mentality,
    pressing,
    passing,
    tempo,
    width,
    defensiveLine,
    counterAttack: Boolean(settings.counterAttack),
    playOutFromBack: ps <= 10,
  };
}

export function syncEngineTacticsToFm2Settings(
  tactics: TeamTactics,
  fm2Tactic: Tactic | undefined
): void {
  if (!fm2Tactic?.settings) return;
  const s = fm2Tactic.settings;

  const mentalityMap: Record<MentalityLevel, number> = {
    muy_defensiva: 3,
    defensiva: 7,
    equilibrada: 11,
    ofensiva: 15,
    ataque_total: 19,
  };
  const pressingMap: Record<PressingIntensity, number> = {
    bloque_bajo: 5,
    bloque_medio: 10,
    presion_alta: 15,
    gegenpress: 19,
  };
  const passingMap: Record<PassingStyle, number> = {
    corto: 5,
    mixto: 10,
    directo: 15,
    largo: 19,
  };
  const tempoMap: Record<TempoLevel, number> = {
    pausado: 5,
    normal: 10,
    alto: 15,
    vertiginoso: 19,
  };
  const widthMap: Record<WidthLevel, number> = {
    estrecho: 5,
    equilibrado: 10,
    amplio: 16,
  };
  const defLineMap: Record<DefensiveLineLevel, number> = {
    muy_atras: 5,
    normal: 10,
    adelantada: 15,
    fuera_de_juego: 16,
  };

  s.mentality = mentalityMap[tactics.mentality];
  s.closingDown = pressingMap[tactics.pressing];
  s.passingStyle = passingMap[tactics.passing];
  s.tempo = tempoMap[tactics.tempo];
  s.width = widthMap[tactics.width];
  s.defensiveLine = defLineMap[tactics.defensiveLine];
  s.playOffside = tactics.defensiveLine === 'fuera_de_juego';
  s.counterAttack = tactics.counterAttack;
}

export function syncEnginePositionsToFm2(
  enginePlayers: PlayerMatchState[],
  fm2Players: Player[],
  fm2Tactic: Tactic | undefined,
  fallbackFormation: FormationId
): void {
  const activeEngine = enginePlayers
    .filter((p) => p.onPitch && !p.redCard)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  if (activeEngine.length < 10) return;

  const baseSlots = FORMATIONS[fallbackFormation] || FORMATIONS['4-4-2'];
  const occupied = new Set<number>([0]);
  const newPositions: number[] = [];
  const playerById = new Map(fm2Players.map((p) => [p.id, p]));

  for (const ep of activeEngine) {
    const fmPlayer = playerById.get(ep.id);
    if (!fmPlayer) continue;
    let mappedSlot: number;
    if (ep.slotIndex === 0 && ep.assignedRole === 'POR') {
      mappedSlot = 0;
    } else {
      const anchor = ep.customAnchor || baseSlots[Math.min(10, ep.slotIndex)] || baseSlots[1];
      mappedSlot = findNearestFm2Slot(anchor.xNorm, anchor.zNorm, occupied);
      occupied.add(mappedSlot);
    }
    fmPlayer.tacticalPosition = mappedSlot;
    newPositions.push(mappedSlot);
  }

  if (fm2Tactic && newPositions.length === 11) {
    fm2Tactic.positions = newPositions;
  }
}

function mapPlayerTacticToInstruction(ind?: PlayerTacticSettings): PlayerInstruction {
  if (!ind) return 'equilibrado';
  if (ind.tightMarking || ind.marking === 'MAN') return 'marcaje_ferreo';
  if (ind.creativeFreedom >= 15) return 'libertad_creativa';
  if (ind.forwardRuns === 'OFTEN' && ind.mentality >= 14) return 'entrar_al_area';
  if (ind.forwardRuns === 'OFTEN') return 'subir_mas';
  if (ind.forwardRuns === 'RARELY' || ind.holdUpBall) return 'mantener_posicion';
  return 'equilibrado';
}

const SKIN_TONES = ['#f2c9a0', '#e0ac7c', '#c68652', '#8d5524', '#f7d7b8', '#b87a4b'];
const HAIR_COLORS = ['#1c1917', '#3f2a1d', '#6b4c35', '#d4a359', '#111827', '#523a28'];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.slice(0, 14);
  const last = parts[parts.length - 1];
  if (last.length >= 3) return last.slice(0, 14);
  return `${parts[0][0]}. ${last}`.slice(0, 14);
}

function mapFm2PlayerToProfile(
  p: Player,
  shirtNumber: number,
  instruction: PlayerInstruction
): PlayerProfile {
  const intr = p.stats?.internal;
  const ca = p.currentAbility ?? 100;
  const isGK = p.primaryPosition === Position.GK || p.positions?.[0] === Position.GK;

  const pace = scaleFm2Attr(intr?.velocidad, ca);
  const passing = scaleFm2Attr(
    intr ? intr.pase * 0.72 + intr.control * 0.28 : undefined,
    ca
  );
  const shooting = scaleFm2Attr(
    intr ? intr.disparo * 0.78 + intr.decision * 0.22 : undefined,
    ca
  );
  const dribbling = scaleFm2Attr(
    intr ? intr.regate * 0.65 + intr.control * 0.35 : undefined,
    ca
  );
  const defending = scaleFm2Attr(
    intr
      ? intr.posicionamiento * 0.45 + intr.anticipacion * 0.35 + intr.agresividad * 0.2
      : undefined,
    ca
  );
  const physical = scaleFm2Attr(
    intr ? intr.resistencia * 0.55 + intr.fuerza * 0.45 : undefined,
    ca
  );
  const vision = scaleFm2Attr(
    intr ? intr.vision * 0.6 + intr.decision * 0.4 : undefined,
    ca
  );
  const gk = isGK
    ? scaleFm2Attr(
        intr
          ? intr.posicionamiento * 0.35 +
              intr.anticipacion * 0.35 +
              intr.decision * 0.15 +
              intr.velocidad * 0.15
          : undefined,
        ca
      )
    : clamp(Math.round(24 + (ca / 200) * 16), 20, 42);

  const attrs: PlayerAttributes = {
    pace,
    passing,
    shooting,
    dribbling,
    defending,
    physical,
    vision,
    gk,
  };

  const h = hashString(p.id || p.name);
  const footRoll = h % 10;
  const foot: 'D' | 'I' | 'A' = footRoll < 7 ? 'D' : footRoll < 9 ? 'I' : 'A';

  return {
    id: p.id,
    name: p.name,
    shortName: buildShortName(p.name),
    number: shirtNumber,
    naturalRole: mapFm2PositionToRole(p.primaryPosition || p.positions?.[0]),
    foot,
    skinTone: SKIN_TONES[h % SKIN_TONES.length],
    hairColor: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
    attributes: attrs,
    initialStamina: clamp(Math.round(p.fitness ?? 92), 45, 100),
    initialMorale: clamp(Math.round(p.morale ?? 75), 35, 100),
    initialInstruction: instruction,
  };
}

function createFallbackAcademyProfile(clubId: string, idx: number, role: PlayerRole): PlayerProfile {
  return {
    id: `${clubId}_acad_${idx}`,
    name: `Juvenil ${idx + 1}`,
    shortName: `Juv. ${idx + 1}`,
    number: idx + 1,
    naturalRole: role,
    foot: 'D',
    skinTone: SKIN_TONES[idx % SKIN_TONES.length],
    hairColor: HAIR_COLORS[idx % HAIR_COLORS.length],
    attributes: {
      pace: 66,
      passing: 64,
      shooting: 60,
      dribbling: 63,
      defending: role === 'DFC' || role === 'LI' || role === 'LD' ? 66 : 55,
      physical: 66,
      vision: 62,
      gk: role === 'POR' ? 68 : 25,
    },
    initialStamina: 95,
    initialMorale: 72,
    initialInstruction: 'equilibrado',
  };
}

/**
 * Arranges 11 starters onto the target formation's 11 slots (slot 0 = GK,
 * slots 1..10 = defenders -> midfielders -> attackers) + bench players.
 */
function orderSquadForFormation(
  rawPlayers: Player[],
  formation: FormationId,
  clubId: string,
  tactic: Tactic | undefined,
  benchLimit: number
): PlayerProfile[] {
  const slots = FORMATIONS[formation] || FORMATIONS['4-4-2'];
  const eligible = rawPlayers.filter((p) => !p.injury && !(p.suspension && p.suspension.matchesLeft > 0));
  const pool = eligible.length >= 11 ? eligible : rawPlayers;

  const markedStarters = pool
    .filter((p) => p.isStarter)
    .sort((a, b) => (a.tacticalPosition ?? 99) - (b.tacticalPosition ?? 99));

  let starters: Player[] = markedStarters.slice(0, 11);
  if (starters.length < 11) {
    const usedIds = new Set(starters.map((p) => p.id));
    const extras = pool
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => (b.currentAbility ?? 0) - (a.currentAbility ?? 0));
    starters = [...starters, ...extras.slice(0, 11 - starters.length)];
  }

  // Compute virtual tactical slot map so emergency replacements occupy injured/suspended slots
  // without mutating the user's saved Player.tacticalPosition
  const resolvedSlotMap = new Map<string, number>();
  const usedSlots = new Set<number>();
  starters.forEach((p) => {
    if (p.tacticalPosition !== undefined && FM2_SLOT_LAYOUT[p.tacticalPosition] && !usedSlots.has(p.tacticalPosition)) {
      resolvedSlotMap.set(p.id, p.tacticalPosition);
      usedSlots.add(p.tacticalPosition);
    }
  });
  const missingTacticSlots = (tactic?.positions || []).filter(
    (pos) => FM2_SLOT_LAYOUT[pos] && !usedSlots.has(pos)
  );
  starters.forEach((p) => {
    if (!resolvedSlotMap.has(p.id) && missingTacticSlots.length > 0) {
      const nextSlot = missingTacticSlots.shift()!;
      resolvedSlotMap.set(p.id, nextSlot);
      usedSlots.add(nextSlot);
    }
  });

  // Check if starters carry explicit FM2 dragged/placed tactical positions (at least 10 valid)
  const placedCount = resolvedSlotMap.size;

  let starterProfiles: PlayerProfile[];

  if (placedCount >= 10) {
    // Preserve exact FM2 tactical positions (dragged 4-2-4, wingers, custom lines, etc.) 1-to-1!
    const gkPlayer =
      starters.find((p) => resolvedSlotMap.get(p.id) === 0) ||
      starters.find((p) => p.primaryPosition === Position.GK || p.positions?.includes(Position.GK)) ||
      starters[0];

    const outfieldPlayers = starters
      .filter((p) => p.id !== gkPlayer.id)
      .sort((a, b) => {
        const slotA = resolvedSlotMap.get(a.id) ?? a.tacticalPosition ?? 99;
        const slotB = resolvedSlotMap.get(b.id) ?? b.tacticalPosition ?? 99;
        const ordA = FM2_SLOT_LAYOUT[slotA]?.sortOrder ?? 99;
        const ordB = FM2_SLOT_LAYOUT[slotB]?.sortOrder ?? 99;
        return ordA - ordB;
      });

    const ordered = [gkPlayer, ...outfieldPlayers].slice(0, 11);
    starterProfiles = ordered.map((p, sIdx) => {
      const virtualPos = resolvedSlotMap.get(p.id) ?? p.tacticalPosition;
      const indSettings =
        virtualPos !== undefined ? tactic?.individualSettings?.[virtualPos] : undefined;
      const prof = mapFm2PlayerToProfile(p, sIdx + 1, mapPlayerTacticToInstruction(indSettings));
      if (sIdx === 0) {
        prof.customAnchor = fm2SlotToAnchor(0);
      } else if (virtualPos !== undefined && FM2_SLOT_LAYOUT[virtualPos]) {
        prof.customAnchor = fm2SlotToAnchor(virtualPos);
      } else {
        const fallbackSlot = slots[Math.min(10, sIdx)];
        prof.customAnchor = {
          xNorm: fallbackSlot.xNorm,
          zNorm: fallbackSlot.zNorm,
          role: fallbackSlot.role,
        };
      }
      return prof;
    });
  } else {
    // Fallback: auto-assign onto preset slots when no tacticalPosition layout exists
    const assignedStarters: (Player | null)[] = new Array(11).fill(null);
    const remaining = [...starters];

    const gkIdx = remaining.findIndex(
      (p) => p.primaryPosition === Position.GK || p.positions?.includes(Position.GK)
    );
    if (gkIdx >= 0) {
      assignedStarters[0] = remaining.splice(gkIdx, 1)[0];
    } else if (remaining.length > 0) {
      assignedStarters[0] = remaining.shift()!;
    }

    const scoreFit = (p: Player, slotRole: PlayerRole): number => {
      const pRole = mapFm2PositionToRole(p.primaryPosition || p.positions?.[0]);
      if (pRole === slotRole) return 100;
      const secondaryRoles = (p.positions || []).map(mapFm2PositionToRole);
      if (secondaryRoles.includes(slotRole)) return 75;
      if (getRoleLineGroup(pRole) === getRoleLineGroup(slotRole)) return 45;
      if (pRole === 'POR') return -50;
      return 10;
    };

    for (let sIdx = 1; sIdx < 11; sIdx++) {
      const slotRole = slots[sIdx].role;
      let bestIdx = -1;
      let bestScore = -999;
      for (let i = 0; i < remaining.length; i++) {
        const sc = scoreFit(remaining[i], slotRole) + (remaining[i].currentAbility ?? 100) * 0.05;
        if (sc > bestScore) {
          bestScore = sc;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        assignedStarters[sIdx] = remaining.splice(bestIdx, 1)[0];
      }
    }

    starterProfiles = assignedStarters.map((p, sIdx) => {
      if (!p) return createFallbackAcademyProfile(clubId, sIdx, slots[sIdx].role);
      const indSettings =
        p.tacticalPosition !== undefined ? tactic?.individualSettings?.[p.tacticalPosition] : undefined;
      return mapFm2PlayerToProfile(p, sIdx + 1, mapPlayerTacticToInstruction(indSettings));
    });
  }

  const starterIds = new Set(starterProfiles.map((p) => p.id));
  const benchCandidates = pool
    .filter((p) => !starterIds.has(p.id))
    .sort((a, b) => {
      const aBench = a.benchPosition ?? 999;
      const bBench = b.benchPosition ?? 999;
      if (aBench !== bBench) return aBench - bBench;
      return (b.currentAbility ?? 0) - (a.currentAbility ?? 0);
    })
    .slice(0, Math.max(5, benchLimit));

  const benchProfiles = benchCandidates.map((p, idx) =>
    mapFm2PlayerToProfile(p, 12 + idx, 'equilibrado')
  );

  return [...starterProfiles, ...benchProfiles];
}

export function buildClubPresetFromFm2(
  club: Club,
  players: Player[],
  colors: TeamColors,
  tactic?: Tactic,
  settingsOverride?: TacticSettings,
  benchLimit = 7
): ClubPreset {
  const activeStarters = players.filter((p) => p.isStarter);
  const starterSlots = activeStarters
    .map((p) => p.tacticalPosition)
    .filter((s): s is number => s !== undefined && Boolean(FM2_SLOT_LAYOUT[s]));
  const rawSlots =
    starterSlots.length >= 10
      ? starterSlots
      : tactic?.positions && tactic.positions.length >= 10
      ? tactic.positions
      : [];

  const formation = inferFormationFromFm2(tactic, activeStarters);
  const exactCustomLabel =
    rawSlots.length >= 10 ? inferExactFormationLabelFromSlots(rawSlots) : formation;

  const squad = orderSquadForFormation(players, formation, club.id, tactic, benchLimit);
  const computedLabel =
    squad.slice(0, 11).some((p) => p.customAnchor)
      ? computeFormationLabel(
          squad.slice(0, 11).map((p, idx) => ({
            slotIndex: idx,
            assignedRole: p.customAnchor?.role || p.naturalRole,
            customAnchor: p.customAnchor,
            onPitch: true,
            redCard: false,
          })),
          formation
        )
      : exactCustomLabel;

  const finalLabel = rawSlots.length >= 10 ? exactCustomLabel : computedLabel;
  const defaultTactics = mapFm2SettingsToTeamTactics(
    formation,
    settingsOverride || tactic?.settings,
    club,
    finalLabel
  );

  return {
    id: club.id,
    name: club.name,
    shortCode: (club.shortName || club.name.slice(0, 3)).toUpperCase().slice(0, 4),
    city: club.country || '',
    stadiumName: club.stadium || `Estadio ${club.shortName || club.name}`,
    colors,
    defaultTactics,
    squad,
  };
}

// Keep unused-export lint satisfied if inferRoleFromCoords is imported for symmetry
export { inferRoleFromCoords };

// ─── Result Extraction (MatchSnapshot -> FM2 Stats, Events, Injuries & Opta) ─

const MATCH_INJURIES: { type: string; minDays: number; maxDays: number; severity: InjurySeverity }[] = [
  { type: 'Sobrecarga muscular', minDays: 4, maxDays: 9, severity: 'MINOR' },
  { type: 'Contusión en la rodilla', minDays: 5, maxDays: 12, severity: 'MINOR' },
  { type: 'Esguince de tobillo', minDays: 12, maxDays: 24, severity: 'MODERATE' },
  { type: 'Distensión en isquiotibiales', minDays: 15, maxDays: 28, severity: 'MODERATE' },
  { type: 'Desgarro en gemelo', minDays: 28, maxDays: 45, severity: 'SERIOUS' },
];

function generateSustainedInjury(p: PlayerMatchState): PlayerMatchStats['sustainedInjury'] | undefined {
  if (!p.injured && p.knockSeverity < 2) return undefined;
  const pick =
    p.knockSeverity === 2
      ? MATCH_INJURIES[Math.floor(Math.random() * MATCH_INJURIES.length)]
      : MATCH_INJURIES[Math.floor(Math.random() * 2)];
  const days = pick.minDays + Math.floor(Math.random() * (pick.maxDays - pick.minDays + 1));
  return {
    type: pick.type,
    days,
    severity: pick.severity,
  };
}

function mapEngineEventToFm2(
  e: EngineMatchEvent,
  homeClubId: string,
  awayClubId: string,
  allPlayers: PlayerMatchState[]
): Fm2MatchEvent {
  const teamId = e.side === 'home' ? homeClubId : e.side === 'away' ? awayClubId : undefined;
  const matchedPlayer = e.playerName
    ? allPlayers.find((p) => p.shortName === e.playerName || p.name === e.playerName)
    : undefined;

  const typeMap: Record<EngineMatchEvent['type'], Fm2MatchEvent['type']> = {
    kickoff: 'KICKOFF',
    goal: 'GOAL',
    save: 'SAVE',
    shot_miss: 'MISS',
    post: 'CHANCE',
    rebound: 'CHANCE',
    cross: 'PASS',
    dribble: 'CHANCE',
    clearance: 'TACKLE',
    foul: 'FREE_KICK',
    yellow_card: 'YELLOW_CARD',
    red_card: 'RED_CARD',
    injury: 'INJURY',
    penalty: 'PENALTY',
    corner: 'CORNER',
    offside: 'OFFSIDE',
    substitution: 'SUBSTITUTION',
    tactical_change: 'WHISTLE',
    shout: 'WHISTLE',
    halftime: 'WHISTLE',
    fulltime: 'WHISTLE',
  };

  const importance: Fm2MatchEvent['importance'] =
    e.type === 'goal' || e.type === 'red_card' || e.type === 'penalty' || e.type === 'injury'
      ? 'HIGH'
      : e.type === 'save' || e.type === 'yellow_card' || e.type === 'post' || e.type === 'substitution'
      ? 'MEDIUM'
      : 'LOW';

  return {
    minute: e.minute,
    second: 0,
    type: typeMap[e.type] || 'CHANCE',
    text: `${e.title}: ${e.description}`,
    teamId,
    playerId: matchedPlayer?.id,
    importance,
    intensity: importance === 'HIGH' ? 5 : importance === 'MEDIUM' ? 3 : 1,
    shotType: e.shotType,
  };
}

export function simulatePenaltyShootout(
  homePlayers: PlayerMatchState[],
  awayPlayers: PlayerMatchState[]
): { penaltyHome: number; penaltyAway: number } {
  const avgShoot = (arr: PlayerMatchState[]) => {
    const active = arr.filter((p) => p.onPitch && !p.redCard);
    if (!active.length) return 72;
    return active.reduce((s, p) => s + p.attributes.shooting, 0) / active.length;
  };
  const hRate = clamp(0.68 + (avgShoot(homePlayers) - 70) * 0.004, 0.62, 0.84);
  const aRate = clamp(0.68 + (avgShoot(awayPlayers) - 70) * 0.004, 0.62, 0.84);

  let ph = 0;
  let pa = 0;
  for (let kick = 0; kick < 5; kick++) {
    if (Math.random() < hRate) ph++;
    const remAway = 5 - kick;
    if (ph > pa + remAway || pa > ph + (4 - kick)) break;
    if (Math.random() < aRate) pa++;
    const remHome = 4 - kick;
    if (pa > ph + remHome || ph > pa + (4 - kick)) break;
  }
  let guard = 0;
  while (ph === pa && guard < 15) {
    const hGoal = Math.random() < hRate;
    const aGoal = Math.random() < aRate;
    if (hGoal) ph++;
    if (aGoal) pa++;
    guard++;
  }
  if (ph === pa) ph++;
  return { penaltyHome: ph, penaltyAway: pa };
}

export interface Fm2EngineMatchResult {
  homeScore: number;
  awayScore: number;
  penaltyHome?: number;
  penaltyAway?: number;
  stats: Record<string, PlayerMatchStats>;
  events: Fm2MatchEvent[];
  optaReport: OptaMatchReport;
}

export function extractFm2ResultFromSnapshot(
  snapshot: MatchSnapshot,
  homeClubId: string,
  awayClubId: string,
  userSide: TeamSide,
  options?: {
    fixtureId?: string;
    competitionId?: string;
    date?: Date;
    allowPenalties?: boolean;
  }
): Fm2EngineMatchResult {
  const allPlayers = [...snapshot.homePlayers, ...snapshot.awayPlayers];
  const stats: Record<string, PlayerMatchStats> = {};

  for (const p of allPlayers) {
    // Skip synthetic academy filler players that don't exist in FM2 world
    if (p.id.includes('_acad_')) continue;

    const participated = p.minutesPlayed > 0 || p.onPitch || p.subbedOff;
    const minutesPlayed = participated ? Math.max(1, Math.round(p.minutesPlayed)) : 0;
    const sustainedInjury = generateSustainedInjury(p);

    stats[p.id] = {
      rating: Number(clamp(p.rating, 4.5, 10.0).toFixed(1)),
      goals: p.goals,
      ownGoals: p.ownGoals || 0,
      assists: p.assists,
      condition: clamp(Math.round(p.stamina), 30, 100),
      minutesPlayed,
      passesAttempted: p.passesAttempted,
      passesCompleted: p.passesCompleted,
      keyPasses: p.keyPasses,
      shots: p.shots,
      shotsOnTarget: p.shotsOnTarget,
      dribblesAttempted: p.dribblesAttempted,
      dribblesCompleted: p.dribblesCompleted,
      offsides: 0,
      tacklesAttempted: p.tacklesWon + p.groundDuelsLost,
      tacklesCompleted: p.tacklesWon,
      keyTackles: Math.min(p.tacklesWon, Math.round(p.tacklesWon * 0.35)),
      interceptions: p.interceptions,
      shotsBlocked: p.shotsBlocked,
      headersAttempted: p.aerialDuelsWon + p.aerialDuelsLost,
      headersWon: p.aerialDuelsWon,
      keyHeaders: Math.min(p.aerialDuelsWon, Math.round(p.aerialDuelsWon * 0.3)),
      saves: p.saves,
      conceded: p.goalsConceded,
      foulsCommitted: p.foulsCommitted,
      foulsReceived: p.foulsWon,
      card: p.redCard ? 'RED' : p.yellowCards > 0 ? 'YELLOW' : undefined,
      sustainedInjury,
      severe: sustainedInjury?.severity === 'SERIOUS' || sustainedInjury?.severity === 'SEVERE',
    };
  }

  let penaltyHome: number | undefined;
  let penaltyAway: number | undefined;
  if (options?.allowPenalties && snapshot.homeScore === snapshot.awayScore) {
    const pens = simulatePenaltyShootout(snapshot.homePlayers, snapshot.awayPlayers);
    penaltyHome = pens.penaltyHome;
    penaltyAway = pens.penaltyAway;
  }

  const events = snapshot.events.map((e) =>
    mapEngineEventToFm2(e, homeClubId, awayClubId, allPlayers)
  );

  if (penaltyHome !== undefined && penaltyAway !== undefined) {
    events.push({
      minute: 90,
      second: 0,
      type: 'PENALTY',
      text: `Tanda de penales: ${snapshot.homeClub.shortCode} ${penaltyHome} - ${penaltyAway} ${snapshot.awayClub.shortCode}.`,
      importance: 'HIGH',
      intensity: 5,
    });
  }

  const optaReport: OptaMatchReport = {
    fixtureId: options?.fixtureId,
    competitionId: options?.competitionId,
    dateIso: (options?.date || new Date()).toISOString(),
    homeClubId,
    awayClubId,
    userSide,
    penaltyHome,
    penaltyAway,
    snapshot,
  };

  return {
    homeScore: snapshot.homeScore,
    awayScore: snapshot.awayScore,
    penaltyHome,
    penaltyAway,
    stats,
    events,
    optaReport,
  };
}

// ─── Headless Match Runner (All Matchday AI / Cup / National Team Fixtures) ──

export function simulateHeadlessMatchWithEngine(
  homeClub: Club,
  awayClub: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
  options?: {
    homeTactic?: Tactic;
    awayTactic?: Tactic;
    homeSettings?: TacticSettings;
    awaySettings?: TacticSettings;
    fastProfile?: boolean;
    allowPenalties?: boolean;
    competitionId?: string;
    fixtureId?: string;
    date?: Date;
  }
): Fm2EngineMatchResult {
  const { homeColors, awayColors } = resolveKitColors(homeClub, awayClub);
  const homePreset = buildClubPresetFromFm2(
    homeClub,
    homePlayers,
    homeColors,
    options?.homeTactic,
    options?.homeSettings,
    7
  );
  const awayPreset = buildClubPresetFromFm2(
    awayClub,
    awayPlayers,
    awayColors,
    options?.awayTactic,
    options?.awaySettings,
    7
  );

  const engine = new MatchEngine(homePreset, awayPreset);
  // Calibrated headless physics step:
  // Full senior deep matches use 0.055s, fast reserve/background matches use 0.085s
  const snapshot = engine.simulateHeadless(options?.fastProfile ? 0.085 : 0.055);

  return extractFm2ResultFromSnapshot(snapshot, homeClub.id, awayClub.id, 'home', {
    fixtureId: options?.fixtureId,
    competitionId: options?.competitionId,
    date: options?.date,
    allowPenalties: options?.allowPenalties,
  });
}

// ─── Ultra-Fast Calibrated Tactical Resolver (<0.1ms / match for background matchdays) ──

function samplePoisson(lambda: number): number {
  const safeLambda = clamp(lambda, 0.05, 6.5);
  const L = Math.exp(-safeLambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L && k < 12);
  return k - 1;
}

function pickWeightedIndex(weights: number[]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += Math.max(0.01, weights[i]);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0.01, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function computeTeamSectorRatings(preset: ClubPreset): {
  attack: number;
  midfield: number;
  defense: number;
  gk: number;
  pacePress: number;
  staminaAvg: number;
} {
  const xi = preset.squad.slice(0, 11);
  if (xi.length === 0) {
    return { attack: 65, midfield: 65, defense: 65, gk: 65, pacePress: 65, staminaAvg: 90 };
  }
  let attSum = 0;
  let attN = 0;
  let midSum = 0;
  let midN = 0;
  let defSum = 0;
  let defN = 0;
  let gkVal = 66;
  let paceSum = 0;
  let stamSum = 0;

  for (let i = 0; i < xi.length; i++) {
    const p = xi[i];
    const a = p.attributes;
    const moraleMod = ((p.initialMorale ?? 75) - 70) * 0.08;
    const fitMod = ((p.initialStamina ?? 92) - 85) * 0.14;
    const formAdj = moraleMod + fitMod;
    paceSum += a.pace;
    stamSum += p.initialStamina ?? 92;

    if (i === 0 || p.naturalRole === 'POR') {
      gkVal = a.gk + formAdj;
    } else if (p.naturalRole === 'DFC' || p.naturalRole === 'LI' || p.naturalRole === 'LD' || p.naturalRole === 'CAR') {
      defSum += a.defending * 0.52 + a.physical * 0.24 + a.pace * 0.14 + a.passing * 0.1 + formAdj;
      defN++;
    } else if (p.naturalRole === 'MCD' || p.naturalRole === 'MC' || p.naturalRole === 'MCO') {
      midSum += a.passing * 0.34 + a.vision * 0.28 + a.dribbling * 0.18 + a.defending * 0.12 + a.physical * 0.08 + formAdj;
      midN++;
    } else {
      attSum += a.shooting * 0.4 + a.dribbling * 0.24 + a.pace * 0.2 + a.vision * 0.16 + formAdj;
      attN++;
    }
  }

  const midfield = midN > 0 ? midSum / midN : 68;
  const attack = attN > 0 ? attSum / attN : midfield;
  const defense = defN > 0 ? defSum / defN : midfield;

  // Tactical modifiers aligned with MatchEngine TeamTactics
  const t = preset.defaultTactics;
  const mentalityAtt: Record<MentalityLevel, number> = {
    muy_defensiva: -4.5,
    defensiva: -2.0,
    equilibrada: 0,
    ofensiva: 2.6,
    ataque_total: 4.8,
  };
  const mentalityDef: Record<MentalityLevel, number> = {
    muy_defensiva: 4.2,
    defensiva: 2.0,
    equilibrada: 0,
    ofensiva: -2.1,
    ataque_total: -4.2,
  };
  const pressingBonus: Record<PressingIntensity, number> = {
    bloque_bajo: -1.0,
    bloque_medio: 0,
    presion_alta: 1.4,
    gegenpress: 2.3,
  };

  return {
    attack: clamp(attack + mentalityAtt[t.mentality] + pressingBonus[t.pressing] * 0.45, 42, 99),
    midfield: clamp(midfield + pressingBonus[t.pressing] * 0.65, 42, 99),
    defense: clamp(defense + mentalityDef[t.mentality] + (t.defensiveLine === 'muy_atras' ? 1.2 : 0), 42, 99),
    gk: clamp(gkVal, 42, 99),
    pacePress: paceSum / xi.length,
    staminaAvg: stamSum / xi.length,
  };
}

export interface FastTacticalMatchSummary {
  homeFormation: string;
  awayFormation: string;
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
  homeOffsides: number;
  awayOffsides: number;
  homeXg: number;
  awayXg: number;
}

export interface FastTacticalMatchResult {
  homeScore: number;
  awayScore: number;
  penaltyHome?: number;
  penaltyAway?: number;
  stats: Record<string, PlayerMatchStats>;
  events: Fm2MatchEvent[];
  summary: FastTacticalMatchSummary;
}

/**
 * Ultra-fast (~0.08ms) MatchEngine-calibrated background match resolver.
 * Uses the exact same FM2 -> MatchEngine squad/tactic mapping and attribute scaling
 * as MatchEngine, producing complete realistic scorelines, xG-aligned stats, ratings,
 * substitutions, cards, stamina drain, injuries, and match events for AI matchdays.
 */
export function simulateFastTacticalMatch(
  homeClub: Club,
  awayClub: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
  options?: {
    homeTactic?: Tactic;
    awayTactic?: Tactic;
    homeSettings?: TacticSettings;
    awaySettings?: TacticSettings;
    allowPenalties?: boolean;
    lightDetail?: boolean;
  }
): FastTacticalMatchResult {
  const { homeColors, awayColors } = resolveKitColors(homeClub, awayClub);
  const homePreset = buildClubPresetFromFm2(
    homeClub,
    homePlayers,
    homeColors,
    options?.homeTactic,
    options?.homeSettings,
    7
  );
  const awayPreset = buildClubPresetFromFm2(
    awayClub,
    awayPlayers,
    awayColors,
    options?.awayTactic,
    options?.awaySettings,
    7
  );

  const hR = computeTeamSectorRatings(homePreset);
  const aR = computeTeamSectorRatings(awayPreset);

  // Calibrated expected goals (avg ~2.55 total goals/match with realistic home edge)
  const homeAdvantage = 2.2;
  const hMidEdge = clamp((hR.midfield - aR.midfield + homeAdvantage * 0.4) / 28, -0.45, 0.45);
  const hPossession = clamp(0.5 + hMidEdge * 0.38 + (Math.random() - 0.5) * 0.08, 0.31, 0.69);
  const aPossession = 1 - hPossession;

  const hTempoBoost =
    homePreset.defaultTactics.tempo === 'vertiginoso' || awayPreset.defaultTactics.tempo === 'vertiginoso'
      ? 1.08
      : homePreset.defaultTactics.tempo === 'pausado' && awayPreset.defaultTactics.tempo === 'pausado'
      ? 0.92
      : 1.0;

  const hAttVsDef = (hR.attack * 0.65 + hR.midfield * 0.35 + homeAdvantage) - (aR.defense * 0.68 + aR.gk * 0.32);
  const aAttVsDef = (aR.attack * 0.65 + aR.midfield * 0.35) - (hR.defense * 0.68 + hR.gk * 0.32);

  const hLambda = clamp((1.22 * Math.exp(hAttVsDef / 25)) * hTempoBoost, 0.22, 4.4);
  const aLambda = clamp((1.04 * Math.exp(aAttVsDef / 25)) * hTempoBoost, 0.18, 4.0);

  const homeScore = samplePoisson(hLambda);
  const awayScore = samplePoisson(aLambda);

  const hTotalShots = Math.max(homeScore + 1, Math.round(hLambda * 7.6 + (Math.random() * 5 - 2)));
  const aTotalShots = Math.max(awayScore + 1, Math.round(aLambda * 7.6 + (Math.random() * 5 - 2)));
  const hOnTarget = Math.max(homeScore, Math.min(hTotalShots, Math.round(hTotalShots * (0.34 + Math.random() * 0.14))));
  const aOnTarget = Math.max(awayScore, Math.min(aTotalShots, Math.round(aTotalShots * (0.34 + Math.random() * 0.14))));

  const stats: Record<string, PlayerMatchStats> = {};
  const events: Fm2MatchEvent[] = [];

  if (!options?.lightDetail) {
    events.push({
      minute: 1,
      second: 0,
      type: 'KICKOFF',
      text: `Comienza el partido: ${homeClub.name} vs ${awayClub.name}.`,
      importance: 'LOW',
      intensity: 1,
    });
  }

  const populateTeamStats = (
    preset: ClubPreset,
    clubId: string,
    goalsFor: number,
    goalsAgainst: number,
    teamShots: number,
    teamShotsOnTarget: number,
    oppShotsOnTarget: number,
    possShare: number
  ) => {
    const xi = preset.squad.slice(0, 11);
    const bench = preset.squad.slice(11);
    const subsCount = Math.min(3, bench.length);
    const subMinutes = [62, 74, 83];

    // Pick outfield starters to sub off (highest fatigue / lowest stamina / attacking roles)
    const subOutIndices = new Set<number>();
    const outfieldIndices = xi
      .map((p, idx) => ({ idx, score: (100 - (p.initialStamina ?? 90)) + (idx >= 5 ? 12 : 0) + Math.random() * 18 }))
      .filter((x) => x.idx > 0)
      .sort((a, b) => b.score - a.score);
    for (let s = 0; s < subsCount && s < outfieldIndices.length; s++) {
      subOutIndices.add(outfieldIndices[s].idx);
    }

    const activeParticipants: { profile: PlayerProfile; minutes: number; isSub: boolean; isGk: boolean }[] = [];
    let subSlot = 0;
    const subOutOrder = [...subOutIndices];
    for (let i = 0; i < xi.length; i++) {
      const subIdx = subOutOrder.indexOf(i);
      const mins = subIdx >= 0 ? subMinutes[subIdx] : 90;
      activeParticipants.push({ profile: xi[i], minutes: mins, isSub: false, isGk: i === 0 });
    }
    for (let s = 0; s < subsCount; s++) {
      const subMin = subMinutes[subSlot++] || 75;
      const p = bench[s];
      activeParticipants.push({ profile: p, minutes: Math.max(5, 90 - subMin), isSub: true, isGk: p.naturalRole === 'POR' });
      if (!options?.lightDetail && !p.id.includes('_acad_')) {
        const outPlayer = xi[subOutOrder[s]];
        events.push({
          minute: subMin,
          second: 0,
          type: 'SUBSTITUTION',
          text: `Cambio en ${preset.name}: entra ${p.shortName} por ${outPlayer?.shortName || 'titular'}.`,
          teamId: clubId,
          playerId: p.id,
          importance: 'LOW',
          intensity: 1,
        });
      }
    }

    // Weight distributions for goals, assists, shots, passes, tackles
    const outfield = activeParticipants.filter((x) => !x.isGk);
    const hasRealOutfield = outfield.some((x) => !x.profile.id.includes('_acad_'));
    const goalWeights = outfield.map(({ profile, minutes }) => {
      if (hasRealOutfield && profile.id.includes('_acad_')) return 0.0001;
      const roleMult =
        profile.naturalRole === 'DC'
          ? 4.2
          : profile.naturalRole === 'EI' || profile.naturalRole === 'ED' || profile.naturalRole === 'MCO'
          ? 2.3
          : profile.naturalRole === 'MC'
          ? 1.1
          : profile.naturalRole === 'DFC'
          ? 0.42
          : 0.35;
      return roleMult * (profile.attributes.shooting / 70) * (minutes / 90);
    });
    const assistWeights = outfield.map(({ profile, minutes }) => {
      if (hasRealOutfield && profile.id.includes('_acad_')) return 0.0001;
      const roleMult =
        profile.naturalRole === 'MCO' || profile.naturalRole === 'EI' || profile.naturalRole === 'ED'
          ? 2.8
          : profile.naturalRole === 'MC' || profile.naturalRole === 'LI' || profile.naturalRole === 'LD' || profile.naturalRole === 'CAR'
          ? 1.9
          : profile.naturalRole === 'DC'
          ? 1.25
          : 0.35;
      return roleMult * ((profile.attributes.vision + profile.attributes.passing) / 140) * (minutes / 90);
    });

    const teamPassesTotal = Math.round(280 + possShare * 420 + (Math.random() * 60 - 30));
    const pressingFactor =
      preset.defaultTactics.pressing === 'gegenpress'
        ? 1.22
        : preset.defaultTactics.pressing === 'presion_alta'
        ? 1.12
        : preset.defaultTactics.pressing === 'bloque_bajo'
        ? 0.88
        : 1.0;

    // Initialize participant stat entries
    const perId = new Map<string, PlayerMatchStats>();
    for (const part of activeParticipants) {
      const p = part.profile;
      const minRatio = part.minutes / 90;
      const passShare = part.isGk
        ? 0.055
        : p.naturalRole === 'MC' || p.naturalRole === 'MCD' || p.naturalRole === 'MCO'
        ? 0.125
        : p.naturalRole === 'DFC' || p.naturalRole === 'LI' || p.naturalRole === 'LD' || p.naturalRole === 'CAR'
        ? 0.095
        : 0.065;
      const passesAttempted = Math.max(2, Math.round(teamPassesTotal * passShare * minRatio * (0.82 + Math.random() * 0.36)));
      const passAcc = clamp(0.68 + (p.attributes.passing - 60) * 0.0055 + (Math.random() - 0.5) * 0.08, 0.54, 0.96);
      const passesCompleted = Math.min(passesAttempted, Math.round(passesAttempted * passAcc));
      const keyPasses = part.isGk
        ? 0
        : Math.max(0, Math.round((p.attributes.vision / 72) * (p.naturalRole === 'MCO' || p.naturalRole === 'EI' || p.naturalRole === 'ED' ? 1.8 : 0.7) * minRatio * Math.random()));

      const isDef = p.naturalRole === 'DFC' || p.naturalRole === 'LI' || p.naturalRole === 'LD' || p.naturalRole === 'CAR' || p.naturalRole === 'MCD';
      const tacklesAttempted = part.isGk ? 0 : Math.round((isDef ? 3.8 : 1.7) * minRatio * pressingFactor * (0.5 + Math.random()));
      const tacklesCompleted = Math.min(tacklesAttempted, Math.round(tacklesAttempted * clamp(0.55 + (p.attributes.defending - 60) * 0.007, 0.4, 0.92)));
      const interceptions = part.isGk ? 0 : Math.round((isDef ? 2.4 : 0.9) * minRatio * Math.random() * 1.6);
      const headersAttempted = part.isGk ? 0 : Math.round((p.naturalRole === 'DFC' || p.naturalRole === 'DC' ? 4.2 : 1.4) * minRatio * Math.random() * 1.5);
      const headersWon = Math.min(headersAttempted, Math.round(headersAttempted * clamp(0.45 + (p.attributes.physical - 60) * 0.008, 0.25, 0.9)));
      const dribblesAttempted = part.isGk ? 0 : Math.round((p.naturalRole === 'EI' || p.naturalRole === 'ED' || p.naturalRole === 'MCO' || p.naturalRole === 'DC' ? 3.2 : 1.0) * minRatio * Math.random() * 1.4);
      const dribblesCompleted = Math.min(dribblesAttempted, Math.round(dribblesAttempted * clamp(0.48 + (p.attributes.dribbling - 60) * 0.008, 0.3, 0.9)));
      const foulsCommitted = part.isGk ? 0 : Math.random() < 0.34 * pressingFactor * minRatio ? 1 + (Math.random() < 0.25 ? 1 : 0) : 0;
      const foulsReceived = part.isGk ? 0 : Math.random() < 0.32 * minRatio ? 1 : 0;

      // Realistic stamina drain scaled by minutes, pressing, and physical
      const drainBase = (part.isGk ? 7 : 22) * minRatio * pressingFactor * (1.18 - (p.attributes.physical - 50) * 0.005);
      const finalCond = clamp(Math.round((p.initialStamina ?? 92) - drainBase), 34, 100);

      // Low realistic card & injury probability
      let card: 'YELLOW' | 'RED' | undefined;
      if (!part.isGk && foulsCommitted > 0) {
        const cardRoll = Math.random();
        if (cardRoll < 0.012 * pressingFactor) card = 'RED';
        else if (cardRoll < 0.14 * pressingFactor) card = 'YELLOW';
      }

      let sustainedInjury: PlayerMatchStats['sustainedInjury'] | undefined;
      if (!part.isGk && Math.random() < 0.0065 * minRatio) {
        const pick = MATCH_INJURIES[Math.floor(Math.random() * MATCH_INJURIES.length)];
        const days = pick.minDays + Math.floor(Math.random() * (pick.maxDays - pick.minDays + 1));
        sustainedInjury = { type: pick.type, days, severity: pick.severity };
      }

      const st: PlayerMatchStats = {
        rating: 6.4,
        goals: 0,
        assists: 0,
        condition: finalCond,
        minutesPlayed: part.minutes,
        passesAttempted,
        passesCompleted,
        keyPasses,
        shots: 0,
        shotsOnTarget: 0,
        dribblesAttempted,
        dribblesCompleted,
        offsides: 0,
        tacklesAttempted,
        tacklesCompleted,
        keyTackles: Math.min(tacklesCompleted, Math.round(tacklesCompleted * 0.35)),
        interceptions,
        shotsBlocked: isDef && Math.random() < 0.25 ? 1 : 0,
        headersAttempted,
        headersWon,
        keyHeaders: Math.min(headersWon, Math.round(headersWon * 0.3)),
        saves: part.isGk ? Math.max(0, oppShotsOnTarget - goalsAgainst) : 0,
        conceded: part.isGk ? goalsAgainst : 0,
        foulsCommitted,
        foulsReceived,
        card,
        sustainedInjury,
        severe: sustainedInjury?.severity === 'SERIOUS' || sustainedInjury?.severity === 'SEVERE',
      };
      perId.set(p.id, st);

      if (!options?.lightDetail && card && !p.id.includes('_acad_')) {
        const min = 15 + Math.floor(Math.random() * 72);
        events.push({
          minute: min,
          second: 0,
          type: card === 'RED' ? 'RED_CARD' : 'YELLOW_CARD',
          text: card === 'RED' ? `Expulsión: ${p.shortName} ve la tarjeta roja.` : `Tarjeta amarilla para ${p.shortName}.`,
          teamId: clubId,
          playerId: p.id,
          importance: card === 'RED' ? 'HIGH' : 'MEDIUM',
          intensity: card === 'RED' ? 5 : 3,
        });
      }
    }

    // Assign goals & assists to real outfield players
    for (let g = 0; g < goalsFor; g++) {
      if (outfield.length === 0) break;
      const scorerIdx = pickWeightedIndex(goalWeights);
      const scorer = outfield[scorerIdx].profile;
      const scorerStat = perId.get(scorer.id);
      if (scorerStat) {
        scorerStat.goals++;
        scorerStat.shots++;
        scorerStat.shotsOnTarget++;
      }

      let assister: PlayerProfile | undefined;
      if (outfield.length > 1 && Math.random() < 0.78) {
        const maskedWeights = assistWeights.map((w, idx) => (idx === scorerIdx ? 0.0001 : w));
        const assisterIdx = pickWeightedIndex(maskedWeights);
        if (assisterIdx !== scorerIdx) {
          assister = outfield[assisterIdx].profile;
          const aStat = perId.get(assister.id);
          if (aStat) {
            aStat.assists++;
            aStat.keyPasses = Math.max(aStat.keyPasses + 1, 1);
          }
        }
      }

      const goalMin = clamp(Math.floor(((g + 0.5) / Math.max(1, goalsFor)) * 86 + (Math.random() * 14 - 7)), 2, 90);
      if (!scorer.id.includes('_acad_')) {
        events.push({
          minute: goalMin,
          second: 0,
          type: 'GOAL',
          text: assister
            ? `¡Gol de ${preset.name}! ${scorer.shortName} define tras asistencia de ${assister.shortName}.`
            : `¡Gol de ${preset.name}! Remate letal de ${scorer.shortName}.`,
          teamId: clubId,
          playerId: scorer.id,
          importance: 'HIGH',
          intensity: 5,
        });
      }
    }

    // Distribute remaining non-goal shots
    const remainingShots = Math.max(0, teamShots - goalsFor);
    let remainingOnTarget = Math.max(0, teamShotsOnTarget - goalsFor);
    for (let s = 0; s < remainingShots; s++) {
      if (outfield.length === 0) break;
      const idx = pickWeightedIndex(goalWeights);
      const st = perId.get(outfield[idx].profile.id);
      if (st) {
        st.shots++;
        if (remainingOnTarget > 0) {
          st.shotsOnTarget++;
          remainingOnTarget--;
        }
      }
    }

    // Finalize MatchEngine-aligned player ratings (5.2 - 10.0)
    const teamResultBonus = goalsFor > goalsAgainst ? 0.25 : goalsFor < goalsAgainst ? -0.22 : 0;
    const cleanSheetBonus = goalsAgainst === 0 ? 0.28 : 0;

    for (const part of activeParticipants) {
      const p = part.profile;
      if (p.id.includes('_acad_')) continue;
      const st = perId.get(p.id);
      if (!st) continue;
      let rating = 6.35 + teamResultBonus;
      rating += st.goals * 0.95;
      rating += st.assists * 0.62;
      rating += st.keyPasses * 0.14;
      rating += st.dribblesCompleted * 0.08;
      rating += st.tacklesCompleted * 0.1;
      rating += st.interceptions * 0.08;
      rating += st.headersWon * 0.04;
      if (st.passesAttempted >= 6) {
        rating += (st.passesCompleted / st.passesAttempted - 0.72) * 0.85;
      }
      if (part.isGk) {
        rating += st.saves * 0.22 - st.conceded * 0.35 + cleanSheetBonus * 1.4;
      } else if (p.naturalRole === 'DFC' || p.naturalRole === 'LI' || p.naturalRole === 'LD' || p.naturalRole === 'CAR') {
        rating += cleanSheetBonus - Math.max(0, goalsAgainst - 1) * 0.16;
      }
      rating -= st.foulsCommitted * 0.07;
      if (st.card === 'YELLOW') rating -= 0.25;
      if (st.card === 'RED') rating -= 1.05;
      rating += (Math.random() - 0.5) * 0.28;
      st.rating = Number(clamp(rating, 5.2, 9.9).toFixed(1));
      stats[p.id] = st;
    }
  };

  populateTeamStats(homePreset, homeClub.id, homeScore, awayScore, hTotalShots, hOnTarget, aOnTarget, hPossession);
  populateTeamStats(awayPreset, awayClub.id, awayScore, homeScore, aTotalShots, aOnTarget, hOnTarget, aPossession);

  let penaltyHome: number | undefined;
  let penaltyAway: number | undefined;
  if (options?.allowPenalties && homeScore === awayScore) {
    let ph = 0;
    let pa = 0;
    for (let k = 0; k < 5; k++) {
      if (Math.random() < 0.74) ph++;
      if (Math.random() < 0.74) pa++;
    }
    let guard = 0;
    while (ph === pa && guard < 15) {
      if (Math.random() < 0.74) ph++;
      if (Math.random() < 0.74) pa++;
      guard++;
    }
    if (ph === pa) ph++;
    penaltyHome = ph;
    penaltyAway = pa;
  }

  events.sort((a, b) => a.minute - b.minute);
  if (!options?.lightDetail) {
    events.push({
      minute: 90,
      second: 0,
      type: 'WHISTLE',
      text: `Final del partido: ${homeClub.name} ${homeScore} - ${awayScore} ${awayClub.name}.`,
      importance: 'LOW',
      intensity: 1,
    });
  }

  const homePoss = Math.round(hPossession * 100);
  const awayPoss = 100 - homePoss;
  const homeCorners = Math.max(0, Math.round(hTotalShots * 0.42 + Math.random() * 2.5));
  const awayCorners = Math.max(0, Math.round(aTotalShots * 0.42 + Math.random() * 2.5));
  const homeFouls = Object.entries(stats).reduce((sum, [pid, st]) => {
    return homePlayers.some(p => p.id === pid) ? sum + (st.foulsCommitted || 0) : sum;
  }, 0);
  const awayFouls = Object.entries(stats).reduce((sum, [pid, st]) => {
    return awayPlayers.some(p => p.id === pid) ? sum + (st.foulsCommitted || 0) : sum;
  }, 0);
  const homeOffsides = Math.floor(Math.random() * 4);
  const awayOffsides = Math.floor(Math.random() * 4);

  return {
    homeScore,
    awayScore,
    penaltyHome,
    penaltyAway,
    stats,
    events,
    summary: {
      homeFormation: homePreset.defaultTactics.customLabel || homePreset.defaultTactics.formation,
      awayFormation: awayPreset.defaultTactics.customLabel || awayPreset.defaultTactics.formation,
      homePossession: homePoss,
      awayPossession: awayPoss,
      homeShots: hTotalShots,
      awayShots: aTotalShots,
      homeShotsOnTarget: hOnTarget,
      awayShotsOnTarget: aOnTarget,
      homeCorners,
      awayCorners,
      homeFouls,
      awayFouls,
      homeOffsides,
      awayOffsides,
      homeXg: Number(hLambda.toFixed(2)),
      awayXg: Number(aLambda.toFixed(2)),
    },
  };
}
