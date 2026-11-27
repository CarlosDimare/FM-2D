import { Player, Club, Position, Tactic, TacticSettings, PlayerTacticSettings, SquadType, TrainingSchedule, Staff } from '../types';
import { world } from './worldManager';
import { SLOT_CONFIG } from './engine';
import { notifyPlayers, notifyTactics, notifyOffers } from '../stores/worldStore';
import { randomInt } from './utils';
import { TACTIC_PRESETS } from '../data/static';

// ─────────────────────────────────────────────────────────────────────────────
//  Pilar D · Fase 1 — Ayudante de Campo
//  Lógica de recomendación (capa "backend"). La UI solo consume estos datos.
//  Los textos salen de pools predefinidos; nada de IA.
// ─────────────────────────────────────────────────────────────────────────────

export type TacticArchetype = 'CONSERVATIVE' | 'BALANCED' | 'RISKY';

export interface TacticAdviceOption {
  id: TacticArchetype;
  icono: string;
  titulo: string;
  descripcion: string;
  efectos: string[];
  preset: Partial<TacticSettings>;
}

export interface TacticAdvice {
  textoPrincipal: string;
  opciones: TacticAdviceOption[];
  recomendacion: TacticArchetype;
  justificacion: string;
  formacionRecomendada?: Tactic;
  formacionNombre?: string;
}

export interface LineupPlayerAdvice {
  playerId: string;
  slot: number;
  razones: string[];
}

export interface LineupAdvice {
  textoPaso2: string;
  xi: LineupPlayerAdvice[];
  banquillo: { playerId: string; razon: string }[];
  resumen: string;
}

// ── Líneas de posición (misma geometría que TacticsView) ────────────────────
const POS_TO_LINE: Record<string, string> = {
  [Position.GK]: 'GK',
  [Position.SW]: 'SW',
  [Position.DC]: 'DEF', [Position.DR]: 'DEF', [Position.DL]: 'DEF',
  [Position.DM]: 'DM', [Position.DMR]: 'DM', [Position.DML]: 'DM',
  [Position.MC]: 'MID', [Position.MR]: 'MID', [Position.ML]: 'MID',
  [Position.AM]: 'AM', [Position.AMR]: 'AM', [Position.AML]: 'AM',
  [Position.ST]: 'ATT', [Position.STR]: 'ATT', [Position.STL]: 'ATT',
};

const LINE_NEIGHBORS: Record<string, string[]> = {
  GK: ['DEF'],
  SW: ['DEF'],
  DEF: ['SW', 'DM'],
  DM: ['DEF', 'MID'],
  MID: ['DM', 'AM'],
  AM: ['MID', 'ATT'],
  ATT: ['AM'],
};

export function getPlayerLine(p: Player): string {
  const line = POS_TO_LINE[p.positions[0]];
  if (line) return line;
  return 'MID';
}

function lineFit(p: Player, line: string): number {
  const pLine = getPlayerLine(p);
  if (line === pLine) return 20;
  if (p.secondaryPositions && p.secondaryPositions.some(sp => POS_TO_LINE[sp] === line)) return 15;
  if ((LINE_NEIGHBORS[line] || []).includes(pLine)) return 9;
  if ((LINE_NEIGHBORS[pLine] || []).includes(line)) return 9;
  return 3;
}

function slotFit(p: Player, slot: number): number {
  const meta = SLOT_CONFIG[slot];
  if (!meta) return 0;
  return lineFit(p, meta.line) + p.currentAbility / 20;
}

// ── Personaje ────────────────────────────────────────────────────────────────
export function getAssistantStaff(clubId: string) {
  return world.getStaffByClub(clubId).find(s => s.role === 'ASSISTANT_MANAGER') || null;
}

export function getReserveManager(clubId: string) {
  return world.getStaffByClub(clubId).find(s => s.role === 'RESERVE_MANAGER') || null;
}

export function getYouthManager(clubId: string) {
  return world.getStaffByClub(clubId).find(s => s.role === 'YOUTH_MANAGER') || null;
}

export function getTacticalStaff(clubId: string, staffId?: string): Staff | null {
  if (staffId) {
    const s = world.getStaff(staffId);
    if (s && s.clubId === clubId) return s;
  }
  return getAssistantStaff(clubId);
}

// ── Fuerzas por línea ────────────────────────────────────────────────────────
function lineStrength(players: Player[], lines: string[]): number {
  const vals = lines.map(line => {
    const cands = players.filter(p => getPlayerLine(p) === line && !p.injury);
    if (cands.length === 0) return null;
    return cands.sort((a, b) => b.currentAbility - a.currentAbility)[0].currentAbility;
  }).filter((v): v is number => v !== null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const ATT_LINES = ['ATT', 'AM'];
const DEF_LINES = ['GK', 'SW', 'DEF', 'DM'];

const avgTeam = (players: Player[], key: 'fitness' | 'morale') =>
  players.length ? players.reduce((s, p) => s + (p[key] || 0), 0) / players.length : 100;

const avgForm = (p: Player) => {
  const last = p.formRatings.slice(-3);
  if (last.length === 0) return 6;
  return last.reduce((a, b) => a + b, 0) / last.length;
};

// ── Presets de arquetipo (instrucciones completas de equipo) ────────────────
const ARCHETYPE_PRESETS: Record<TacticArchetype, Partial<TacticSettings>> = {
  CONSERVATIVE: {
    mentality: 5, creativeFreedom: 6, passingStyle: 13, tempo: 7, width: 7,
    closingDown: 6, timeWasting: 14, defensiveLine: 5, tackling: 9,
    focusPassing: 'MIXED', marking: 'ZONAL', targetManSupply: 'SPACE',
    tightMarking: true, useTargetMan: true, usePlaymaker: false,
    playOffside: false, counterAttack: true,
    longShots: 'RARELY', throughBalls: 'MIXED', crossBall: 'MIXED',
  },
  BALANCED: {
    mentality: 11, creativeFreedom: 11, passingStyle: 9, tempo: 11, width: 11,
    closingDown: 11, timeWasting: 7, defensiveLine: 11, tackling: 10,
    focusPassing: 'MIXED', marking: 'ZONAL', targetManSupply: 'FEET',
    tightMarking: false, useTargetMan: false, usePlaymaker: true,
    playOffside: false, counterAttack: false,
    longShots: 'MIXED', throughBalls: 'MIXED', crossBall: 'MIXED',
  },
  RISKY: {
    mentality: 17, creativeFreedom: 15, passingStyle: 14, tempo: 16, width: 15,
    closingDown: 16, timeWasting: 2, defensiveLine: 16, tackling: 14,
    focusPassing: 'MIXED', marking: 'MAN', targetManSupply: 'SPACE',
    tightMarking: true, useTargetMan: false, usePlaymaker: true,
    playOffside: true, counterAttack: false,
    longShots: 'OFTEN', throughBalls: 'OFTEN', crossBall: 'OFTEN',
  },
};

const ARCHETYPE_META: Record<TacticArchetype, { icono: string; titulo: string; descripcion: string; efectos: string[] }> = {
  CONSERVATIVE: {
    icono: '🛡️',
    titulo: 'Conservador',
    descripcion: 'Cerrar filas y golpear de contra.',
    efectos: ['Bloque bajo (5) + marcaje estrecho + contragolpe', 'Instrucciones individuales defensivas y salidas rápidas', 'Ritmo pausado, juego directo al espacio y orden atrás'],
  },
  BALANCED: {
    icono: '⚖️',
    titulo: 'Equilibrado',
    descripcion: 'Juego asociativo con control de líneas.',
    efectos: ['Mentalidad 11 · Ritmo 11 · Pases combinativos (9)', 'Organizador en el medio y laterales equilibrados', 'Instrucciones individuales según el perfil de cada titular'],
  },
  RISKY: {
    icono: '⚡',
    titulo: 'Arriesgado',
    descripcion: 'Presión total, línea alta y ataque vertical.',
    efectos: ['Mentalidad 17 · Presión 16 · Línea adelantada + fuera de juego', 'Extremos y laterales proyectados + pases filtrados al espacio', 'Marcaje al hombre e intensidad alta en todas las líneas'],
  },
};

const POOLS = {
  consejo: [
    'Jefe, he analizado al rival. Te recomiendo un plan claro:',
    'Mira, he estudiado sus partidos. Esto es lo que yo haría:',
    'Buenas noticias, Jefe: tengo el informe listo. Mi consejo es este:',
  ],
  justConservador: [
    'Su ataque ({oppAtt}) supera a nuestra defensa ({myDef}). Mejor asegurar y golpear de contra.',
    'El rival manda en ataque y llegamos algo justos de físico. Cerremos filas.',
  ],
  justRiesgo: [
    'Nuestro ataque ({myAtt}) es claramente superior a su defensa ({oppDef}). Vamos a por ellos.',
    'Tienen una defensa endeble. Presionemos arriba desde el primer minuto.',
  ],
  justEquilibrado: [
    'Las fuerzas están parejas (ataque {myAtt} vs {oppAtt}). Mantengamos la estructura.',
    'No hay diferencias claras entre ambos. Juego posicional, sin experimentos.',
  ],
  xiListo: [
    'Este es nuestro 11. He puesto a {star} porque está en su mejor momento.',
    'Once confirmado. Confío en {star} para marcar la diferencia hoy.',
  ],
  resultado: [
    'Táctica y once aplicados. Buena decisión, Jefe.',
    'Hecho. El equipo está listo para salir a por el partido.',
  ],
};

// ── API pública ──────────────────────────────────────────────────────────────
export function generateTacticAdvice(club: Club, opponent?: Club, squad: SquadType = 'SENIOR', staff?: Staff | null): TacticAdvice {
  const myPlayers = world.getPlayersByClub(club.id).filter(p => p.squad === squad);
  const myStarters = myPlayers.filter(p => p.isStarter && p.tacticalPosition !== undefined);
  const used = myStarters.length >= 11 ? myStarters : myPlayers;

  const myAtt = lineStrength(used, ATT_LINES);
  const myDef = lineStrength(used, DEF_LINES);
  const avgFit = avgTeam(myPlayers, 'fitness');
  const avgMorale = avgTeam(myPlayers, 'morale');

  const oppPlayers = opponent ? world.getPlayersByClub(opponent.id).filter(p => p.squad === squad) : [];
  const oppAtt = opponent ? lineStrength(oppPlayers, ATT_LINES) : 0;
  const oppDef = opponent ? lineStrength(oppPlayers, DEF_LINES) : 0;

  let recomendacion: TacticArchetype = 'BALANCED';
  if (!opponent) {
    if (avgFit < 70) recomendacion = 'CONSERVATIVE';
    else if (avgFit >= 85 && avgMorale >= 70) recomendacion = 'RISKY';
  } else if (oppAtt > myDef + 25) {
    recomendacion = 'CONSERVATIVE';
  } else if (myAtt > oppDef + 25) {
    recomendacion = 'RISKY';
  } else if (myAtt > oppAtt + 10) {
    recomendacion = 'RISKY';
  } else if (oppAtt > myAtt + 10) {
    recomendacion = 'CONSERVATIVE';
  }

  let justificacion = '';
  if (recomendacion === 'CONSERVATIVE') {
    const decisivo = oppAtt > myDef + 25
      ? 'Su ataque ({oppAtt}) supera a nuestra defensa ({myDef}). Mejor asegurar y golpear de contra.'
      : POOLS.justConservador[randomInt(0, POOLS.justConservador.length - 1)];
    justificacion = decisivo.replace('{oppAtt}', oppAtt.toFixed(0)).replace('{myDef}', myDef.toFixed(0));
  } else if (recomendacion === 'RISKY') {
    const decisivo = myAtt > oppDef + 25
      ? 'Nuestro ataque ({myAtt}) es claramente superior a su defensa ({oppDef}). Vamos a por ellos.'
      : POOLS.justRiesgo[randomInt(0, POOLS.justRiesgo.length - 1)];
    justificacion = decisivo.replace('{myAtt}', myAtt.toFixed(0)).replace('{oppDef}', oppDef.toFixed(0));
  } else {
    justificacion = POOLS.justEquilibrado[randomInt(0, POOLS.justEquilibrado.length - 1)]
      .replace('{myAtt}', myAtt.toFixed(0))
      .replace('{oppAtt}', oppAtt.toFixed(0));
  }

  const opciones: TacticAdviceOption[] = (['CONSERVATIVE', 'BALANCED', 'RISKY'] as TacticArchetype[]).map(id => ({
    id,
    ...ARCHETYPE_META[id],
    preset: ARCHETYPE_PRESETS[id],
  }));

  // ── Formación recomendada basada en preferencias del staff + composición del plantel ──
  const staffFormation = staff?.preferredFormation;
  const preset = TACTIC_PRESETS.find(t => t.id === staffFormation);
  let formacionRecomendada = preset || TACTIC_PRESETS[0];
  const formacionNombre = formacionRecomendada.name;

  // Ajustar formación por arquetipo si el staff no tiene preferencia clara
  if (!preset && recomendacion === 'CONSERVATIVE') {
    const defensivePresets = TACTIC_PRESETS.filter(t => ['5-4-1', '3-5-2', '5-3-2'].includes(t.id));
    formacionRecomendada = defensivePresets[randomInt(0, defensivePresets.length - 1)] || TACTIC_PRESETS[0];
  } else if (!preset && recomendacion === 'RISKY') {
    const attackingPresets = TACTIC_PRESETS.filter(t => ['4-3-3', '4-2-3-1', '4-2-2-2'].includes(t.id));
    formacionRecomendada = attackingPresets[randomInt(0, attackingPresets.length - 1)] || TACTIC_PRESETS[1];
  }

  return {
    textoPrincipal: POOLS.consejo[randomInt(0, POOLS.consejo.length - 1)],
    opciones,
    recomendacion,
    justificacion,
    formacionRecomendada,
    formacionNombre,
  };
}

export function applyTacticPreset(tactic: Tactic, archetype: TacticArchetype) {
  tactic.settings = { ...tactic.settings, ...ARCHETYPE_PRESETS[archetype] };
  // Also pre-configure slot individual instructions for the formation's 11 slots
  const slotDefaults: Record<number, PlayerTacticSettings> = {};
  (tactic.positions || []).forEach(slot => {
    slotDefaults[slot] = buildIndividualInstructionForSlot(slot, archetype);
  });
  tactic.individualSettings = { ...tactic.individualSettings, ...slotDefaults };
  notifyTactics();
}

const clamp20 = (v: number) => Math.max(1, Math.min(20, Math.round(v)));

export function buildIndividualInstructionForSlot(
  slot: number,
  archetype: TacticArchetype,
  player?: Player | null
): PlayerTacticSettings {
  const meta = SLOT_CONFIG[slot] || { line: 'MID' as const, side: 'CENTER' as const, abbr: 'MC' };
  const isWide = meta.side === 'LEFT' || meta.side === 'RIGHT';
  const s = player?.stats.internal;
  const archOffset = archetype === 'RISKY' ? 4 : archetype === 'CONSERVATIVE' ? -4 : 0;

  if (meta.line === 'GK' || slot === 0) {
    return {
      mentality: clamp20(5 + Math.round(archOffset / 2)),
      creativeFreedom: 4,
      passingStyle: archetype === 'CONSERVATIVE' ? 14 : archetype === 'RISKY' ? 11 : 8,
      closingDown: 4,
      tackling: 6,
      forwardRuns: 'RARELY',
      runWithBall: 'RARELY',
      longShots: 'RARELY',
      throughBalls: 'RARELY',
      crossBall: 'RARELY',
      marking: 'ZONAL',
      tightMarking: false,
      holdUpBall: false,
    };
  }

  if (meta.line === 'SW' || (meta.line === 'DEF' && !isWide)) {
    return {
      mentality: clamp20(7 + archOffset),
      creativeFreedom: clamp20(5 + (s && s.pase >= 14 ? 3 : 0)),
      passingStyle: archetype === 'CONSERVATIVE' ? 14 : archetype === 'RISKY' ? 11 : 8,
      closingDown: clamp20(9 + archOffset),
      tackling: clamp20(12 + (archetype === 'RISKY' ? 3 : 0)),
      forwardRuns: 'RARELY',
      runWithBall: 'RARELY',
      longShots: 'RARELY',
      throughBalls: s && s.pase >= 14 && archetype !== 'CONSERVATIVE' ? 'MIXED' : 'RARELY',
      crossBall: 'RARELY',
      marking: archetype === 'RISKY' ? 'MAN' : 'ZONAL',
      tightMarking: archetype !== 'BALANCED',
      holdUpBall: false,
    };
  }

  if (meta.line === 'DEF' && isWide) {
    const fast = (s?.velocidad || 10) >= 13;
    return {
      mentality: clamp20(10 + archOffset),
      creativeFreedom: clamp20(8 + Math.round(archOffset / 2)),
      passingStyle: archetype === 'CONSERVATIVE' ? 13 : 10,
      closingDown: clamp20(11 + archOffset),
      tackling: clamp20(11 + (archetype === 'RISKY' ? 2 : 0)),
      forwardRuns: archetype === 'CONSERVATIVE' ? 'RARELY' : archetype === 'RISKY' || fast ? 'OFTEN' : 'MIXED',
      runWithBall: archetype === 'RISKY' && (s?.regate || 10) >= 12 ? 'OFTEN' : archetype === 'CONSERVATIVE' ? 'RARELY' : 'MIXED',
      longShots: 'RARELY',
      throughBalls: 'MIXED',
      crossBall: archetype === 'CONSERVATIVE' ? 'MIXED' : 'OFTEN',
      marking: archetype === 'RISKY' ? 'MAN' : 'ZONAL',
      tightMarking: archetype === 'CONSERVATIVE',
      holdUpBall: false,
    };
  }

  if (meta.line === 'DM') {
    const creative = (s?.vision || 10) >= 13 || (s?.pase || 10) >= 14;
    return {
      mentality: clamp20(9 + archOffset),
      creativeFreedom: clamp20(creative ? 11 : 7),
      passingStyle: archetype === 'CONSERVATIVE' ? 12 : 9,
      closingDown: clamp20(13 + (archetype === 'RISKY' ? 3 : 0)),
      tackling: clamp20(13 + (archetype === 'RISKY' ? 3 : 0)),
      forwardRuns: archetype === 'RISKY' ? 'MIXED' : 'RARELY',
      runWithBall: 'RARELY',
      longShots: (s?.disparo || 10) >= 14 ? 'MIXED' : 'RARELY',
      throughBalls: creative ? 'OFTEN' : 'MIXED',
      crossBall: isWide ? 'MIXED' : 'RARELY',
      marking: archetype === 'RISKY' ? 'MAN' : 'ZONAL',
      tightMarking: true,
      holdUpBall: archetype !== 'RISKY',
    };
  }

  if (meta.line === 'MID' && !isWide) {
    const playmaker = (s?.vision || 10) >= 13 || (s?.pase || 10) >= 14;
    const shooter = (s?.disparo || 10) >= 14;
    return {
      mentality: clamp20(11 + archOffset),
      creativeFreedom: clamp20((playmaker ? 14 : 10) + Math.round(archOffset / 2)),
      passingStyle: archetype === 'RISKY' ? 12 : archetype === 'CONSERVATIVE' ? 13 : 9,
      closingDown: clamp20(12 + archOffset),
      tackling: clamp20(10 + (archetype === 'RISKY' ? 3 : 0)),
      forwardRuns: archetype === 'CONSERVATIVE' ? 'RARELY' : archetype === 'RISKY' ? 'OFTEN' : 'MIXED',
      runWithBall: (s?.regate || 10) >= 14 ? 'OFTEN' : 'MIXED',
      longShots: shooter ? 'OFTEN' : 'MIXED',
      throughBalls: playmaker || archetype === 'RISKY' ? 'OFTEN' : 'MIXED',
      crossBall: 'RARELY',
      marking: archetype === 'RISKY' ? 'MAN' : 'ZONAL',
      tightMarking: archetype === 'CONSERVATIVE',
      holdUpBall: playmaker && archetype !== 'RISKY',
    };
  }

  if ((meta.line === 'MID' || meta.line === 'AM') && isWide) {
    const dribbler = (s?.regate || 10) >= 13 || (s?.velocidad || 10) >= 14;
    return {
      mentality: clamp20(13 + archOffset),
      creativeFreedom: clamp20(13 + Math.round(archOffset / 2)),
      passingStyle: archetype === 'CONSERVATIVE' ? 13 : 11,
      closingDown: clamp20(11 + archOffset),
      tackling: clamp20(9 + (archetype === 'RISKY' ? 2 : 0)),
      forwardRuns: archetype === 'CONSERVATIVE' ? 'MIXED' : 'OFTEN',
      runWithBall: dribbler || archetype === 'RISKY' ? 'OFTEN' : 'MIXED',
      longShots: (s?.disparo || 10) >= 14 ? 'MIXED' : 'RARELY',
      throughBalls: (s?.vision || 10) >= 13 ? 'OFTEN' : 'MIXED',
      crossBall: 'OFTEN',
      marking: 'ZONAL',
      tightMarking: false,
      holdUpBall: false,
    };
  }

  if (meta.line === 'AM' && !isWide) {
    return {
      mentality: clamp20(14 + archOffset),
      creativeFreedom: clamp20(15 + Math.round(archOffset / 2)),
      passingStyle: archetype === 'RISKY' ? 12 : 9,
      closingDown: clamp20(12 + archOffset),
      tackling: clamp20(8 + (archetype === 'RISKY' ? 3 : 0)),
      forwardRuns: archetype === 'CONSERVATIVE' ? 'MIXED' : 'OFTEN',
      runWithBall: (s?.regate || 10) >= 13 ? 'OFTEN' : 'MIXED',
      longShots: (s?.disparo || 10) >= 13 ? 'OFTEN' : 'MIXED',
      throughBalls: 'OFTEN',
      crossBall: 'RARELY',
      marking: 'ZONAL',
      tightMarking: false,
      holdUpBall: (s?.fuerza || 10) >= 13,
    };
  }

  // ATT / Strikers
  const targetMan = (s?.fuerza || 10) >= 14;
  const speedy = (s?.velocidad || 10) >= 14 || (s?.regate || 10) >= 14;
  return {
    mentality: clamp20(16 + Math.round(archOffset / 2)),
    creativeFreedom: clamp20(13 + Math.round(archOffset / 2)),
    passingStyle: archetype === 'CONSERVATIVE' ? 12 : 10,
    closingDown: clamp20(11 + archOffset),
    tackling: clamp20(8 + (archetype === 'RISKY' ? 3 : 0)),
    forwardRuns: archetype === 'CONSERVATIVE' ? 'MIXED' : 'OFTEN',
    runWithBall: speedy ? 'OFTEN' : 'MIXED',
    longShots: (s?.disparo || 10) >= 15 ? 'OFTEN' : 'MIXED',
    throughBalls: (s?.vision || 10) >= 13 ? 'MIXED' : 'RARELY',
    crossBall: isWide ? 'MIXED' : 'RARELY',
    marking: 'ZONAL',
    tightMarking: false,
    holdUpBall: targetMan || archetype === 'CONSERVATIVE',
  };
}

/**
 * Configura instrucciones de equipo adaptadas al XI + instrucciones individuales
 * personalizadas para cada uno de los 11 titulares según su posición, atributos y estilo.
 */
export function applyAssistantInstructions(
  tactic: Tactic,
  archetype: TacticArchetype,
  xi: LineupPlayerAdvice[]
) {
  const starterPlayers = xi
    .map(entry => ({ slot: entry.slot, player: world.getPlayer(entry.playerId) }))
    .filter((x): x is { slot: number; player: Player } => !!x.player);

  const hasPlaymaker = starterPlayers.some(({ slot, player }) => {
    const line = SLOT_CONFIG[slot]?.line;
    return (line === 'MID' || line === 'AM' || line === 'DM') && ((player.stats.internal.vision || 0) >= 13 || (player.stats.internal.pase || 0) >= 14);
  });
  const hasTargetMan = starterPlayers.some(({ slot, player }) => {
    const line = SLOT_CONFIG[slot]?.line;
    return line === 'ATT' && (player.stats.internal.fuerza || 0) >= 14;
  });
  const hasWideAttack = starterPlayers.filter(({ slot }) => {
    const meta = SLOT_CONFIG[slot];
    return meta && (meta.side === 'LEFT' || meta.side === 'RIGHT') && (meta.line === 'MID' || meta.line === 'AM');
  }).length >= 2;

  const bestPasser = [...starterPlayers]
    .filter(x => x.slot !== 0)
    .sort((a, b) => (b.player.stats.internal.pase + b.player.stats.internal.vision) - (a.player.stats.internal.pase + a.player.stats.internal.vision))[0]?.player;
  const bestShooter = [...starterPlayers]
    .filter(x => x.slot !== 0)
    .sort((a, b) => (b.player.stats.internal.disparo + b.player.stats.internal.pase) - (a.player.stats.internal.disparo + a.player.stats.internal.pase))[0]?.player;
  const bestThrower = [...starterPlayers]
    .filter(x => x.slot !== 0 && (SLOT_CONFIG[x.slot]?.side === 'LEFT' || SLOT_CONFIG[x.slot]?.side === 'RIGHT'))
    .sort((a, b) => b.player.stats.internal.fuerza - a.player.stats.internal.fuerza)[0]?.player || bestPasser;

  tactic.settings = {
    ...tactic.settings,
    ...ARCHETYPE_PRESETS[archetype],
    usePlaymaker: hasPlaymaker,
    useTargetMan: hasTargetMan,
    targetManSupply: hasTargetMan ? 'HEAD' : archetype === 'RISKY' ? 'SPACE' : 'FEET',
    focusPassing: hasWideAttack ? 'MIXED' : 'CENTER',
    setPieces: {
      cornersLeft: bestPasser?.id || tactic.settings.setPieces?.cornersLeft || '',
      cornersRight: bestPasser?.id || tactic.settings.setPieces?.cornersRight || '',
      freeKicksLeft: bestShooter?.id || tactic.settings.setPieces?.freeKicksLeft || '',
      freeKicksRight: bestShooter?.id || tactic.settings.setPieces?.freeKicksRight || '',
      throwInsLeft: bestThrower?.id || tactic.settings.setPieces?.throwInsLeft || '',
      throwInsRight: bestThrower?.id || tactic.settings.setPieces?.throwInsRight || '',
    },
  };

  const nextIndividual: Record<number, PlayerTacticSettings> = {};
  starterPlayers.forEach(({ slot, player }) => {
    nextIndividual[slot] = buildIndividualInstructionForSlot(slot, archetype, player);
  });
  tactic.individualSettings = nextIndividual;
  notifyTactics();
}

// ── XI con razones ───────────────────────────────────────────────────────────
function playerReasons(p: Player): string[] {
  const reasons: string[] = [];
  const f = avgForm(p);
  if (f >= 7) reasons.push(`⚡ En racha (media ${f.toFixed(1)})`);
  if (p.fitness >= 90) reasons.push('💪 Gran forma física');
  if ((p.tacticalFamiliarity || 0) >= 75) reasons.push('🔗 Alta afinidad táctica');
  const line = getPlayerLine(p);
  const s = p.stats.internal;
  if (line === 'ATT' && s.disparo >= 16) reasons.push('🎯 Mejor definición del plantel');
  if ((line === 'MID' || line === 'AM') && s.vision >= 15) reasons.push('🧠 Visión de juego privilegiada');
  if (line === 'DEF' && s.anticipacion >= 16) reasons.push('🛡️ Anticipación defensiva superior');
  if (line === 'GK' && s.control >= 15) reasons.push('🧤 Seguridad bajo palos');
  if (reasons.length === 0) reasons.push('📊 Rendimiento sólido y regular');
  return reasons.slice(0, 3);
}

export function getTreasurer(clubId: string) {
  return world.ensureClubTreasurer(clubId);
}

export function getChiefScout(clubId: string) {
  return (
    world.getStaffByClub(clubId).find(s => s.role === 'SCOUT') ||
    world.getStaffByClub(clubId).find(s => s.role === 'SPORTING_DIRECTOR') ||
    null
  );
}

export function generateLineupAdvice(club: Club, squad: SquadType = 'SENIOR'): LineupAdvice {
  const players = world.getPlayersByClub(club.id).filter(p => p.squad === squad);
  const tactic = world.getActiveTactic();
  const slots = (tactic?.positions && tactic.positions.length === 11)
    ? [...tactic.positions]
    : [0, 3, 2, 1, 5, 8, 12, 13, 14, 17, 26];
  const slotSet = new Set(slots);
  const healthy = players.filter(p => !p.injury && (!p.suspension || p.suspension.matchesLeft === 0));

  // Keep existing starters only if their tacticalPosition belongs to the current active tactic slots
  const xi: LineupPlayerAdvice[] = [];
  const usedSlots = new Set<number>();
  const usedIds = new Set<string>();

  healthy
    .filter(p => p.isStarter && p.tacticalPosition !== undefined && slotSet.has(p.tacticalPosition))
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .forEach(p => {
      const slot = p.tacticalPosition as number;
      if (xi.length < 11 && !usedSlots.has(slot) && !usedIds.has(p.id)) {
        xi.push({ playerId: p.id, slot, razones: playerReasons(p) });
        usedSlots.add(slot);
        usedIds.add(p.id);
      }
    });

  // Fill every remaining slot of the active tactic with the best-fit available player
  const pool = healthy.filter(p => !usedIds.has(p.id));
  for (const slot of slots) {
    if (xi.length >= 11) break;
    if (usedSlots.has(slot)) continue;
    const best = [...pool].sort((a, b) => slotFit(b, slot) - slotFit(a, slot))[0];
    if (!best) continue;
    xi.push({ playerId: best.id, slot, razones: playerReasons(best) });
    usedSlots.add(slot);
    usedIds.add(best.id);
    pool.splice(pool.indexOf(best), 1);
  }

  // Banquillo: pick up to 7 healthy substitutes FIRST (ensuring a backup GK if available), so bench slots are filled properly
  const banquillo: { playerId: string; razon: string }[] = [];
  const restHealthy = healthy.filter(p => !usedIds.has(p.id)).sort((a, b) => b.currentAbility - a.currentAbility);
  const backupGk = restHealthy.find(p => p.positions.includes(Position.GK));
  const benchChosen: Player[] = [];
  if (backupGk) benchChosen.push(backupGk);
  for (const p of restHealthy) {
    if (benchChosen.length >= 7) break;
    if (!benchChosen.some(b => b.id === p.id)) benchChosen.push(p);
  }
  benchChosen.forEach(p => {
    let razon = p.positions.includes(Position.GK) ? '🧤 Arquero suplente' : '🔄 Suplente recomendado';
    if ((p.tacticalFamiliarity || 0) < 45) razon = '🔻 Baja afinidad táctica (suplente)';
    else if (p.fitness < 70) razon = '😮‍💨 Recuperando forma (suplente)';
    banquillo.push({ playerId: p.id, razon });
  });

  // Also list injured/suspended players as unavailable info if fewer than 7 bench players
  players.forEach(p => {
    if (p.injury) banquillo.push({ playerId: p.id, razon: `🚑 Lesión (${p.injury.daysLeft} días)` });
    else if (p.suspension && p.suspension.matchesLeft > 0) banquillo.push({ playerId: p.id, razon: '🟥 Sancionado' });
  });

  // Estrella del once (en racha + buen físico)
  const star = xi
    .map(x => ({ x, p: world.getPlayer(x.playerId) }))
    .filter(({ p }) => p && avgForm(p) >= 6.8 && p!.fitness >= 80)
    .sort((a, b) => (b.p!.fitness + avgForm(b.p!) * 2) - (a.p!.fitness + avgForm(a.p!) * 2))[0];
  const starName = star?.p?.name || (world.getPlayer(xi[0]?.playerId || '')?.name) || 'nuestro once';

  const textoPaso2 = POOLS.xiListo[randomInt(0, POOLS.xiListo.length - 1)].replace('{star}', starName.split(' ').slice(-1)[0]);
  const resumen = `Once confirmado: ${xi.length} titulares · ${benchChosen.length} suplentes asignados al banco.`;

  return { textoPaso2, xi, banquillo, resumen };
}

export function generateBestLineupForChosenTactic(
  club: Club,
  squad: SquadType = 'SENIOR',
  tacticId?: string
): LineupAdvice {
  const players = world.getPlayersByClub(club.id).filter(p => p.squad === squad);
  const tactics = world.getTactics();
  const tactic = (tacticId && tactics.find(t => t.id === tacticId)) || world.getActiveTactic() || tactics[0];
  const slots = (tactic?.positions && tactic.positions.length === 11)
    ? [...tactic.positions]
    : [0, 3, 2, 1, 5, 8, 12, 13, 14, 17, 26];
  const healthy = players.filter(p => !p.injury && (!p.suspension || p.suspension.matchesLeft === 0));

  const scoreSlotFit = (p: Player, slot: number): number => {
    let base = slotFit(p, slot) + (p.fitness / 100) * 1.6;
    const meta = SLOT_CONFIG[slot];
    if (meta && p.positions[0]) {
      const pos = p.positions[0];
      const isLeftPos = pos === Position.DL || pos === Position.DML || pos === Position.ML || pos === Position.AML || pos === Position.STL;
      const isRightPos = pos === Position.DR || pos === Position.DMR || pos === Position.MR || pos === Position.AMR || pos === Position.STR;
      const isCenterPos = !isLeftPos && !isRightPos;
      if (meta.side === 'LEFT' && isLeftPos) base += 2.2;
      else if (meta.side === 'RIGHT' && isRightPos) base += 2.2;
      else if (meta.side === 'CENTER' && isCenterPos) base += 1.5;
    }
    return base;
  };

  // Prioritize GK first, then scarce lines (fewer exact-line healthy players) so specialists stay in natural roles
  const orderedSlots = [...slots].sort((a, b) => {
    const la = SLOT_CONFIG[a]?.line || 'MID';
    const lb = SLOT_CONFIG[b]?.line || 'MID';
    if (la === 'GK' && lb !== 'GK') return -1;
    if (lb === 'GK' && la !== 'GK') return 1;
    const countA = healthy.filter(p => getPlayerLine(p) === la).length;
    const countB = healthy.filter(p => getPlayerLine(p) === lb).length;
    return countA - countB;
  });

  const pool = [...healthy];
  const xi: LineupPlayerAdvice[] = [];
  for (const slot of orderedSlots) {
    if (xi.length >= 11 || pool.length === 0) break;
    const best = [...pool].sort((a, b) => scoreSlotFit(b, slot) - scoreSlotFit(a, slot))[0];
    if (!best) continue;
    xi.push({ playerId: best.id, slot, razones: playerReasons(best) });
    pool.splice(pool.indexOf(best), 1);
  }

  // Sort back to tactic slots order for display consistency
  xi.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));

  const usedIds = new Set(xi.map(x => x.playerId));
  const banquillo: { playerId: string; razon: string }[] = [];
  const restHealthy = healthy.filter(p => !usedIds.has(p.id)).sort((a, b) => b.currentAbility - a.currentAbility);
  const backupGk = restHealthy.find(p => p.positions.includes(Position.GK));
  const benchChosen: Player[] = [];
  if (backupGk) benchChosen.push(backupGk);
  for (const p of restHealthy) {
    if (benchChosen.length >= 7) break;
    if (!benchChosen.some(b => b.id === p.id)) benchChosen.push(p);
  }
  benchChosen.forEach(p => {
    let razon = p.positions.includes(Position.GK) ? '🧤 Arquero suplente' : '🔄 Suplente recomendado';
    if (p.fitness < 70) razon = '😮‍💨 Recuperando forma (suplente)';
    banquillo.push({ playerId: p.id, razon });
  });

  const tacticLabel = tactic?.name || 'táctica elegida';
  const star = xi
    .map(x => world.getPlayer(x.playerId))
    .filter((p): p is Player => Boolean(p))
    .sort((a, b) => b.currentAbility - a.currentAbility)[0];
  const starLastName = star ? star.name.split(' ').slice(-1)[0] : 'el grupo';

  return {
    textoPaso2: `Armé el mejor 11 posible respetando tu esquema ${tacticLabel}, con ${starLastName} como referente principal.`,
    xi,
    banquillo,
    resumen: `11 ideal para ${tacticLabel}: ${xi.length} titulares · ${benchChosen.length} suplentes.`,
  };
}

export function autoCompleteElevenWithChosenTactic(
  clubId: string,
  squad: SquadType = 'SENIOR',
  tacticId?: string
): boolean {
  const club = world.getClub(clubId);
  if (!club) return false;
  if (tacticId) {
    world.setActiveTactic(tacticId);
  }
  const advice = generateBestLineupForChosenTactic(club, squad, tacticId);
  applyLineup(clubId, advice.xi, squad, advice.banquillo);
  return true;
}

export function applyLineup(
  clubId: string,
  xi: LineupPlayerAdvice[],
  squad: SquadType = 'SENIOR',
  banquillo?: { playerId: string; razon: string }[],
) {
  const players = world.getPlayersByClub(clubId).filter(p => p.squad === squad);
  players.forEach(p => {
    p.isStarter = false;
    p.tacticalPosition = undefined;
    p.benchPosition = undefined;
  });

  const starterIds = new Set<string>();
  xi.forEach(({ playerId, slot }) => {
    const p = world.getPlayer(playerId);
    if (p) {
      p.isStarter = true;
      p.tacticalPosition = slot;
      p.benchPosition = undefined;
      starterIds.add(p.id);
    }
  });

  // Assign up to 7 healthy substitutes to benchPosition 0..6
  const benchCandidates: Player[] = [];
  if (banquillo && banquillo.length > 0) {
    banquillo.forEach(entry => {
      const p = world.getPlayer(entry.playerId);
      if (p && !starterIds.has(p.id) && !p.injury && (!p.suspension || p.suspension.matchesLeft === 0)) {
        if (!benchCandidates.some(b => b.id === p.id)) benchCandidates.push(p);
      }
    });
  }
  // Fill remaining bench slots up to 7 with best available healthy players
  if (benchCandidates.length < 7) {
    players
      .filter(p => !starterIds.has(p.id) && !p.injury && (!p.suspension || p.suspension.matchesLeft === 0) && !benchCandidates.some(b => b.id === p.id))
      .sort((a, b) => b.currentAbility - a.currentAbility)
      .forEach(p => {
        if (benchCandidates.length < 7) benchCandidates.push(p);
      });
  }
  benchCandidates.slice(0, 7).forEach((p, idx) => {
    p.isStarter = false;
    p.tacticalPosition = undefined;
    p.benchPosition = idx;
  });

  notifyPlayers();
  notifyTactics();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pilar D · Fase 2 — Preparador Físico
//  Carga de entrenamiento + riesgo de lesión + planes semanales.
//  Reutiliza la heurística de lifecycleManager (totalIntensity, fitness < 60).
// ─────────────────────────────────────────────────────────────────────────────

export type FitnessPlanArchetype = 'RENDIMIENTO' | 'EQUILIBRIO' | 'RECUPERACION';

export interface FitnessPlanOption {
  id: FitnessPlanArchetype;
  icono: string;
  titulo: string;
  descripcion: string;
  efectos: string[];
}

export interface PlayerRiskEntry {
  playerId: string;
  carga: number;     // intensidad normalizada 0-100
  riesgo: number;    // score de riesgo 0-100
  fitness: number;
}

export interface FitnessReport {
  textoPrincipal: string;
  cargaMedia: number;     // 0-100 (intensidad media del plan semanal)
  riesgoLesion: number;   // 0-100 (f(media fitness, carga, injuryProneness))
  fitnessMedia: number;
  jugadoresRiesgo: PlayerRiskEntry[];
  opciones: FitnessPlanOption[];
  recomendacion: FitnessPlanArchetype;
  justificacion: string;
}

const DEFAULT_SCHEDULE = { STRENGTH: 8, AEROBIC: 8, TACTICAL: 8, BALL_CONTROL: 8, DEFENDING: 8, ATTACKING: 8, SHOOTING: 8, SET_PIECES: 4 };
const SCHEDULE_KEYS = Object.keys(DEFAULT_SCHEDULE) as (keyof typeof DEFAULT_SCHEDULE)[];

/** Intensidad total (0-140) del horario individual → carga normalizada 0-100 */
export function playerLoad(p: Player): number {
  const schedule = p.trainingSchedule || DEFAULT_SCHEDULE;
  const total = Object.values(schedule).reduce((a, b) => a + b, 0);
  return Math.min(100, Math.round((total / 140) * 100));
}

function playerRisk(p: Player): number {
  const carga = playerLoad(p);
  let score = 0;
  if (p.fitness < 60) score += (60 - p.fitness) * 1.2;
  else if (p.fitness < 75) score += (75 - p.fitness) * 0.4;
  if (carga > 70) score += (carga - 70) * 0.5;
  score += (p.injuryProneness || 0) * 100 * 0.6;
  if (p.injury) score += 25;
  return Math.min(100, Math.round(score));
}

const FITNESS_PLAN_META: Record<FitnessPlanArchetype, { icono: string; titulo: string; descripcion: string; efectos: string[] }> = {
  RENDIMIENTO: {
    icono: '🚀',
    titulo: 'Rendimiento',
    descripcion: 'Subir la carga para maximizar el desarrollo.',
    efectos: ['+30% intensidad en las sesiones', 'Mayor progreso de atributos', 'Sube el riesgo de lesión por fatiga'],
  },
  EQUILIBRIO: {
    icono: '⚖️',
    titulo: 'Equilibrio',
    descripcion: 'Mantener la carga actual del plantel.',
    efectos: ['Sin cambios en la intensidad', 'Ritmo estable de recuperación', 'Riesgo de lesión sin variación'],
  },
  RECUPERACION: {
    icono: '🧘',
    titulo: 'Recuperación',
    descripcion: 'Bajar la carga para recuperar físicos.',
    efectos: ['-30% intensidad en las sesiones', 'Recuperación inmediata de condición', 'Reduce el riesgo de lesión por fatiga'],
  },
};

const FITNESS_POOLS = {
  alerta: [
    'Jefe, he revisado las cargas del plantel. Te sugiero ajustar el plan para no perder a {nombres}.',
    'Ojo, Jefe: el equipo acumula fatiga. Mi recomendación es regular la intensidad esta semana.',
    'Informe físico listo. La carga general no está al nivel que me gustaría: merece la pena ajustar.',
  ],
  buenEstado: [
    'Buenas noticias, Jefe: el plantel está en plena forma. Podemos apretar un poco más el acelerador.',
    'Todos están frescos. Si queremos sacar rendimiento extra, es el momento.',
  ],
  justRecuperacion: [
    'La media de condición es baja y el riesgo de lesión está por las nubes. Mejor proteger al equipo.',
    'Con {n} jugadores en rojo, lo responsable es bajar la carga esta semana.',
  ],
  justRendimiento: [
    'El equipo está en plena forma: podemos elevar la intensidad sin miedo a lesiones.',
    'Físicamente estamos al 100%. Aprovechemos para desarrollar a los más jóvenes.',
  ],
  justEquilibrado: [
    'Las cargas están en un punto razonable. No toco nada esta semana.',
    'Riesgo controlado y condición aceptable. Mantengamos el ritmo.',
  ],
  resultado: [
    'Plan aplicado. Ajusto las sesiones y aviso si algo cambia.',
    'Hecho, Jefe. El equipo seguirá mi plan esta semana.',
  ],
};

export function getFitnessCoach(clubId: string) {
  return world.getStaffByClub(clubId).find(s => s.role === 'FITNESS_COACH') || null;
}

export function generateFitnessReport(club: Club): FitnessReport {
  const players = world.getPlayersByClub(club.id).filter(p => p.squad === 'SENIOR');
  const withSchedule = players.map(p => ({ p, carga: playerLoad(p), riesgo: playerRisk(p) }));

  const cargaMedia = withSchedule.length
    ? Math.round(withSchedule.reduce((s, e) => s + e.carga, 0) / withSchedule.length)
    : 0;
  const fitnessMedia = players.length
    ? Math.round(players.reduce((s, p) => s + p.fitness, 0) / players.length)
    : 100;
  const riesgoLesion = withSchedule.length
    ? Math.min(100, Math.round(withSchedule.reduce((s, e) => s + e.riesgo, 0) / withSchedule.length))
    : 0;

  const jugadoresRiesgo = withSchedule
    .filter(e => e.riesgo >= 30)
    .sort((a, b) => b.riesgo - a.riesgo)
    .slice(0, 8)
    .map(e => ({ playerId: e.p.id, carga: e.carga, riesgo: e.riesgo, fitness: Math.round(e.p.fitness) }));

  // Recomendación: riesgo alto → RECUPERACION · plantel fresco → RENDIMIENTO · resto → EQUILIBRIO
  let recomendacion: FitnessPlanArchetype = 'EQUILIBRIO';
  if (riesgoLesion > 55 || jugadoresRiesgo.length >= 3) recomendacion = 'RECUPERACION';
  else if (fitnessMedia >= 78 && cargaMedia < 60) recomendacion = 'RENDIMIENTO';

  let textoPrincipal: string;
  if (jugadoresRiesgo.length > 0) {
    const names = jugadoresRiesgo.slice(0, 2).map(e => {
      const p = world.getPlayer(e.playerId);
      return p ? p.name.split(' ').slice(-1)[0] : 'un jugador';
    }).join(' y ');
    textoPrincipal = FITNESS_POOLS.alerta[0]
      .replace('{nombres}', names || 'varios jugadores')
      .replace('{n}', String(jugadoresRiesgo.length));
  } else if (fitnessMedia >= 80) {
    textoPrincipal = FITNESS_POOLS.buenEstado[randomInt(0, FITNESS_POOLS.buenEstado.length - 1)];
  } else {
    textoPrincipal = FITNESS_POOLS.alerta[randomInt(1, FITNESS_POOLS.alerta.length - 1)];
  }

  const justificaciones: Record<FitnessPlanArchetype, string> = {
    RECUPERACION: FITNESS_POOLS.justRecuperacion[recomendacion === 'RECUPERACION' ? 0 : 1]
      .replace('{n}', String(Math.max(1, jugadoresRiesgo.length))),
    RENDIMIENTO: FITNESS_POOLS.justRendimiento[randomInt(0, FITNESS_POOLS.justRendimiento.length - 1)],
    EQUILIBRIO: FITNESS_POOLS.justEquilibrado[randomInt(0, FITNESS_POOLS.justEquilibrado.length - 1)],
  };

  const opciones: FitnessPlanOption[] = (['RENDIMIENTO', 'EQUILIBRIO', 'RECUPERACION'] as FitnessPlanArchetype[]).map(id => ({
    id,
    ...FITNESS_PLAN_META[id],
  }));

  return {
    textoPrincipal,
    cargaMedia,
    riesgoLesion,
    fitnessMedia,
    jugadoresRiesgo,
    opciones,
    recomendacion,
    justificacion: justificaciones[recomendacion],
  };
}

/**
 * Aplica el plan elegido: ajusta el trainingSchedule de cada jugador senior
 * (el mismo dato que lee lifecycleManager para fatiga/desarrollo) y aplica
 * un efecto inmediato de condición física.
 */
export function applyFitnessPlan(clubId: string, plan: FitnessPlanArchetype, squad: SquadType = 'SENIOR') {
  const players = world.getPlayersByClub(clubId).filter(p => p.squad === squad);
  const factor = plan === 'RENDIMIENTO' ? 1.3 : plan === 'RECUPERACION' ? 0.7 : 1;
  const fitnessDelta = plan === 'RENDIMIENTO' ? -5 : plan === 'RECUPERACION' ? 8 : 0;

  players.forEach(p => {
    if (factor !== 1) {
      const base = p.trainingSchedule || { ...DEFAULT_SCHEDULE };
      const next: Record<string, number> = {};
      SCHEDULE_KEYS.forEach(k => {
        const v = Math.round((base[k] ?? DEFAULT_SCHEDULE[k]) * factor);
        next[k] = Math.max(2, Math.min(20, v));
      });
      p.trainingSchedule = next as unknown as TrainingSchedule;
    }
    if (fitnessDelta !== 0) {
      p.fitness = Math.max(10, Math.min(100, p.fitness + fitnessDelta));
    }
  });

  notifyPlayers();
  return players.length;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pilar D · Fase 3 — Carpeta de Refuerzos (Director Deportivo)
//  Candidatos curados (informes de scouting + posiciones débiles) con semáforo
//  de viabilidad 🟢🟡🔴 contra el presupuesto, y envío de ofertas por lote.
// ─────────────────────────────────────────────────────────────────────────────

export type TransferViability = 'VIABLE' | 'NEGOTIABLE' | 'INVIABLE';

export interface TransferCandidate {
  playerId: string;
  position: Position;
  value: number;
  viabilidad: TransferViability;
  razon: string;
}

export interface TransferFolder {
  textoInforme: string;
  presupuesto: number;
  candidatos: TransferCandidate[];
  resumen: { aprobados: number; enDuda: number; rechazados: number };
}

export function getSportingDirector(clubId: string) {
  return world.getStaffByClub(clubId).find(s => s.role === 'SPORTING_DIRECTOR') || null;
}

/** Valor estimado que el club podría recaudar vendiendo jugadores transferibles. */
function estimatedSaleValue(clubId: string): number {
  return world.getPlayersByClub(clubId)
    .filter(p => p.transferStatus === 'TRANSFERABLE' || p.isTransferListed)
    .reduce((s, p) => s + Math.round(p.value * 0.6), 0);
}

function computeViability(value: number, presupuesto: number, ventas: number): { viabilidad: TransferViability; razon: string } {
  if (value <= presupuesto) return { viabilidad: 'VIABLE', razon: 'Dentro de presupuesto' };
  if (value <= presupuesto + ventas) {
    return { viabilidad: 'NEGOTIABLE', razon: `Requiere vender antes (faltan £${((value - presupuesto) / 1000).toFixed(0)}K)` };
  }
  return { viabilidad: 'INVIABLE', razon: `Fuera de presupuesto (faltan £${((value - presupuesto) / 1000).toFixed(0)}K)` };
}

const weakPositions = (clubId: string): Position[] => {
  const senior = world.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR' && !p.injury);
  const weak: Position[] = [];
  if (senior.filter(p => p.positions.includes(Position.GK)).length < 2) weak.push(Position.GK);
  if (senior.filter(p => ['SW', 'DC', 'DR', 'DL'].some(pos => p.positions.includes(pos as Position))).length < 5) {
    weak.push(Position.DC); weak.push(Position.DR);
  }
  if (senior.filter(p => ['DM', 'MC', 'ML', 'MR', 'AM'].some(pos => p.positions.includes(pos as Position))).length < 4) weak.push(Position.MC);
  if (senior.filter(p => p.positions.includes(Position.ST)).length < 2) weak.push(Position.ST);
  return weak;
};

const TRANSFER_POOLS = {
  informe: [
    'He revisado la carpeta con mi equipo. Hay {aprobados} refuerzos asequibles y {duda} requieren un esfuerzo extra. {rechazados} quedan descartados por presupuesto.',
    'Mi recomendación es clara: prioriza a los jugadores marcados en verde. Los amarillos obligan a vender antes, y los rojos no caben en el presupuesto.',
    'La carpeta está lista. Confío en {aprobados} de estos perfiles para reforzar las zonas débiles del plantel.',
  ],
  sinCandidatos: [
    'La carpeta está vacía, Jefe. No hay perfiles informados que encajen con nuestro presupuesto por ahora. Activa el scouting en las posiciones débiles.',
    'Aún no tengo informes concluyentes. Pedí a los ojeadores priorizar nuestras posiciones más débiles.',
  ],
  resultado: [
    'Ofertas enviadas. Ahora toca esperar la respuesta de los clubes.',
    'Hecho, Jefe. Envié {n} ofertas y ajusté el presupuesto en consecuencia.',
  ],
};

/**
 * Compila la carpeta de refuerzos: jugadores con ScoutingReport del club
 * (mundo coherente) + objetivos por posición débil si hay pocos informes.
 * Viabilidad: value <= presupuesto → 🟢 · <= presupuesto + ventas estimadas → 🟡 · resto 🔴.
 * El judgingAbility del director deportivo afina la selección de candidatos.
 */
export function compileTransferFolder(club: Club, director?: { attributes: { judgingAbility: number } } | null): TransferFolder {
  const presupuesto = club.finances.transferBudget;
  // Director con mejor ojo → rango de CA objetivo más preciso; con peor ojo → más disperso.
  const judging = director?.attributes?.judgingAbility ?? 10;
  const rangeMult = Math.max(0.7, Math.min(1.4, 1.6 - judging * 0.05));
  const reportedIds = new Set(world.getScoutingReports(club.id, 50).map(r => r.playerId));

  // 1) Carpeta del entrenador (jugadores puestos "en carpeta" desde el perfil del jugador)
  const candidates: TransferCandidate[] = [];
  const carpetaIds = club.transferFolderIds || [];
  carpetaIds.forEach(pid => {
    if (candidates.length >= 8) return;
    const p = world.getPlayer(pid);
    if (!p || p.clubId === club.id || p.clubId === 'FREE_AGENT') return;
    if (candidates.some(c => c.playerId === pid)) return;
    const ventas = estimatedSaleValue(club.id);
    const { viabilidad, razon } = computeViability(p.value, presupuesto, ventas);
    candidates.push({ playerId: pid, position: p.positions[0], value: p.value, viabilidad, razon });
  });

  // 2) Informados (con informe de scouting)
  reportedIds.forEach(pid => {
    if (candidates.length >= 8) return;
    const p = world.getPlayer(pid);
    if (!p || p.clubId === club.id || p.clubId === 'FREE_AGENT') return;
    if (candidates.some(c => c.playerId === pid)) return;
    const ventas = estimatedSaleValue(club.id);
    const { viabilidad, razon } = computeViability(p.value, presupuesto, ventas);
    candidates.push({ playerId: pid, position: p.positions[0], value: p.value, viabilidad, razon });
  });

  // 3) Rellenar con posiciones débiles (mismo criterio que la IA de compras)
  if (candidates.length < 6) {
    const weak = weakPositions(club.id);
    const used = new Set(candidates.map(c => c.playerId));
    for (const pos of weak) {
      if (candidates.length >= 8) break;
      const targetCA = club.reputation / 100;
      const pool = world.players.filter(p =>
        p.clubId !== club.id && p.clubId !== 'FREE_AGENT' &&
        p.positions.includes(pos) &&
        !used.has(p.id) &&
        p.squad === 'SENIOR' &&
        Math.abs(p.currentAbility - targetCA) < 25 * rangeMult
      ).sort((a, b) => Math.abs(a.currentAbility - targetCA) - Math.abs(b.currentAbility - targetCA));
      const target = pool[0];
      if (!target) continue;
      const ventas = estimatedSaleValue(club.id);
      const { viabilidad, razon } = computeViability(target.value, presupuesto, ventas);
      candidates.push({ playerId: target.id, position: target.positions[0], value: target.value, viabilidad, razon });
      used.add(target.id);
    }
  }

  const resumen = {
    aprobados: candidates.filter(c => c.viabilidad === 'VIABLE').length,
    enDuda: candidates.filter(c => c.viabilidad === 'NEGOTIABLE').length,
    rechazados: candidates.filter(c => c.viabilidad === 'INVIABLE').length,
  };

  const textoInforme = candidates.length === 0
    ? TRANSFER_POOLS.sinCandidatos[randomInt(0, TRANSFER_POOLS.sinCandidatos.length - 1)]
    : TRANSFER_POOLS.informe[randomInt(0, TRANSFER_POOLS.informe.length - 1)]
        .replace('{aprobados}', String(resumen.aprobados))
        .replace('{duda}', String(resumen.enDuda))
        .replace('{rechazados}', String(resumen.rechazados));

  return { textoInforme, presupuesto, candidatos: candidates, resumen };
}

/**
 * Envía ofertas por lote con validación acumulada contra el presupuesto.
 * El coste total (≈valor de cada jugador) no puede exceder el presupuesto;
 * el descuento real se aplica al completar cada traspaso (patrón del juego).
 * Devuelve el número de ofertas realmente creadas.
 */
export function sendOffers(clubId: string, playerIds: string[], date: Date): number {
  const club = world.getClub(clubId);
  if (!club) return 0;
  const amounts: { pid: string; amount: number }[] = [];
  let total = 0;
  playerIds.forEach(pid => {
    const p = world.getPlayer(pid);
    if (!p || p.clubId === clubId || p.clubId === 'FREE_AGENT') return;
    const amount = Math.round(p.value); // monto determinista = valor de mercado (coherente con el coste mostrado)
    amounts.push({ pid, amount });
    total += amount;
  });
  // Validación acumulada: si el lote excede el presupuesto, no se envía nada.
  if (total > club.finances.transferBudget) return 0;
  let sent = 0;
  amounts.forEach(({ pid, amount }) => {
    const res = world.makeTransferOffer(pid, clubId, amount, 'PURCHASE', date, 100);
    if (res?.ok) sent++;
  });
  if (sent > 0) notifyOffers();
  return sent;
}
