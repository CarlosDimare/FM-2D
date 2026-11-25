import { CustomPlayerAnchor, FormationId, PlayerRole } from '../types/match';

export interface FormationSlot {
  role: PlayerRole;
  // Normalized coordinates when attacking +X (right):
  // xNorm: 0.0 (own goal line -52.5) to 1.0 (opponent goal line +52.5)
  // zNorm: -0.5 (left wing -34) to +0.5 (right wing +34)
  xNorm: number;
  zNorm: number;
}

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-3-3': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.23, zNorm: -0.37 },
    { role: 'DFC', xNorm: 0.19, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.19, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.23, zNorm: 0.37 },
    { role: 'MCD', xNorm: 0.38, zNorm: 0 },
    { role: 'MC', xNorm: 0.48, zNorm: -0.2 },
    { role: 'MC', xNorm: 0.48, zNorm: 0.2 },
    { role: 'EI', xNorm: 0.69, zNorm: -0.35 },
    { role: 'DC', xNorm: 0.75, zNorm: 0 },
    { role: 'ED', xNorm: 0.69, zNorm: 0.35 },
  ],
  '4-2-3-1': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.22, zNorm: -0.37 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.22, zNorm: 0.37 },
    { role: 'MCD', xNorm: 0.36, zNorm: -0.15 },
    { role: 'MCD', xNorm: 0.36, zNorm: 0.15 },
    { role: 'EI', xNorm: 0.59, zNorm: -0.34 },
    { role: 'MCO', xNorm: 0.58, zNorm: 0 },
    { role: 'ED', xNorm: 0.59, zNorm: 0.34 },
    { role: 'DC', xNorm: 0.76, zNorm: 0 },
  ],
  '3-5-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'DFC', xNorm: 0.19, zNorm: -0.24 },
    { role: 'DFC', xNorm: 0.17, zNorm: 0 },
    { role: 'DFC', xNorm: 0.19, zNorm: 0.24 },
    { role: 'CAR', xNorm: 0.42, zNorm: -0.41 },
    { role: 'MCD', xNorm: 0.36, zNorm: 0 },
    { role: 'MC', xNorm: 0.5, zNorm: -0.18 },
    { role: 'MC', xNorm: 0.5, zNorm: 0.18 },
    { role: 'CAR', xNorm: 0.42, zNorm: 0.41 },
    { role: 'DC', xNorm: 0.73, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.73, zNorm: 0.14 },
  ],
  '4-4-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'EI', xNorm: 0.47, zNorm: -0.38 },
    { role: 'MC', xNorm: 0.44, zNorm: -0.14 },
    { role: 'MC', xNorm: 0.44, zNorm: 0.14 },
    { role: 'ED', xNorm: 0.47, zNorm: 0.38 },
    { role: 'DC', xNorm: 0.74, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.74, zNorm: 0.14 },
  ],
  '5-3-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'CAR', xNorm: 0.27, zNorm: -0.4 },
    { role: 'DFC', xNorm: 0.17, zNorm: -0.22 },
    { role: 'DFC', xNorm: 0.16, zNorm: 0 },
    { role: 'DFC', xNorm: 0.17, zNorm: 0.22 },
    { role: 'CAR', xNorm: 0.27, zNorm: 0.4 },
    { role: 'MCD', xNorm: 0.38, zNorm: 0 },
    { role: 'MC', xNorm: 0.48, zNorm: -0.2 },
    { role: 'MC', xNorm: 0.48, zNorm: 0.2 },
    { role: 'DC', xNorm: 0.73, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.73, zNorm: 0.14 },
  ],
  '4-1-4-1': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'MCD', xNorm: 0.33, zNorm: 0 },
    { role: 'EI', xNorm: 0.54, zNorm: -0.37 },
    { role: 'MC', xNorm: 0.5, zNorm: -0.15 },
    { role: 'MC', xNorm: 0.5, zNorm: 0.15 },
    { role: 'ED', xNorm: 0.54, zNorm: 0.37 },
    { role: 'DC', xNorm: 0.75, zNorm: 0 },
  ],
  '4-2-4': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'MC', xNorm: 0.44, zNorm: -0.15 },
    { role: 'MC', xNorm: 0.44, zNorm: 0.15 },
    { role: 'EI', xNorm: 0.70, zNorm: -0.38 },
    { role: 'DC', xNorm: 0.75, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.75, zNorm: 0.14 },
    { role: 'ED', xNorm: 0.70, zNorm: 0.38 },
  ],
  '5-4-1': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.22, zNorm: -0.38 },
    { role: 'DFC', xNorm: 0.17, zNorm: -0.2 },
    { role: 'DFC', xNorm: 0.16, zNorm: 0 },
    { role: 'DFC', xNorm: 0.17, zNorm: 0.2 },
    { role: 'LD', xNorm: 0.22, zNorm: 0.38 },
    { role: 'EI', xNorm: 0.46, zNorm: -0.37 },
    { role: 'MC', xNorm: 0.43, zNorm: -0.14 },
    { role: 'MC', xNorm: 0.43, zNorm: 0.14 },
    { role: 'ED', xNorm: 0.46, zNorm: 0.37 },
    { role: 'DC', xNorm: 0.75, zNorm: 0 },
  ],
  '3-4-3': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'DFC', xNorm: 0.19, zNorm: -0.24 },
    { role: 'DFC', xNorm: 0.17, zNorm: 0 },
    { role: 'DFC', xNorm: 0.19, zNorm: 0.24 },
    { role: 'CAR', xNorm: 0.44, zNorm: -0.4 },
    { role: 'MC', xNorm: 0.45, zNorm: -0.14 },
    { role: 'MC', xNorm: 0.45, zNorm: 0.14 },
    { role: 'CAR', xNorm: 0.44, zNorm: 0.4 },
    { role: 'EI', xNorm: 0.70, zNorm: -0.34 },
    { role: 'DC', xNorm: 0.75, zNorm: 0 },
    { role: 'ED', xNorm: 0.70, zNorm: 0.34 },
  ],
  '4-4-1-1': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'EI', xNorm: 0.47, zNorm: -0.37 },
    { role: 'MC', xNorm: 0.44, zNorm: -0.14 },
    { role: 'MC', xNorm: 0.44, zNorm: 0.14 },
    { role: 'ED', xNorm: 0.47, zNorm: 0.37 },
    { role: 'MCO', xNorm: 0.61, zNorm: 0 },
    { role: 'DC', xNorm: 0.76, zNorm: 0 },
  ],
  '4-2-2-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'MCD', xNorm: 0.36, zNorm: -0.15 },
    { role: 'MCD', xNorm: 0.36, zNorm: 0.15 },
    { role: 'MCO', xNorm: 0.59, zNorm: -0.24 },
    { role: 'MCO', xNorm: 0.59, zNorm: 0.24 },
    { role: 'DC', xNorm: 0.74, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.74, zNorm: 0.14 },
  ],
};

export const FORMATION_LIST: FormationId[] = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '4-2-4',
  '3-5-2',
  '5-3-2',
  '4-1-4-1',
  '5-4-1',
  '3-4-3',
];

export const ROLE_LABELS: Record<PlayerRole, string> = {
  POR: 'Portero',
  DFC: 'Central',
  LI: 'Lateral Izq.',
  LD: 'Lateral Der.',
  CAR: 'Carrilero',
  MCD: 'Pivote',
  MC: 'Mediocentro',
  MCO: 'Mediapunta',
  EI: 'Extremo Izq.',
  ED: 'Extremo Der.',
  DC: 'Delantero',
};

export function inferRoleFromCoords(xNorm: number, zNorm: number, forceOutfield = false): PlayerRole {
  if (!forceOutfield && xNorm < 0.105 && Math.abs(zNorm) < 0.2) {
    return 'POR';
  }
  const absZ = Math.abs(zNorm);
  if (xNorm < 0.295) {
    if (absZ >= 0.26) return zNorm < 0 ? 'LI' : 'LD';
    return 'DFC';
  }
  if (xNorm < 0.405) {
    if (absZ >= 0.31) return 'CAR';
    return 'MCD';
  }
  if (xNorm < 0.555) {
    if (absZ >= 0.29) return zNorm < 0 ? 'EI' : 'ED';
    return 'MC';
  }
  if (xNorm < 0.65) {
    if (absZ >= 0.26) return zNorm < 0 ? 'EI' : 'ED';
    return 'MCO';
  }
  if (absZ >= 0.28) return zNorm < 0 ? 'EI' : 'ED';
  return 'DC';
}

export function computeFormationLabel(
  players: {
    onPitch?: boolean;
    redCard?: boolean;
    slotIndex: number;
    assignedRole: PlayerRole;
    customAnchor?: CustomPlayerAnchor;
  }[],
  fallbackFormation: FormationId
): string {
  const active = players.filter((p) => p.onPitch !== false && !p.redCard);
  const slots = FORMATIONS[fallbackFormation] || FORMATIONS['4-4-2'];
  const outfield = active.filter((p) => p.assignedRole !== 'POR' && p.slotIndex !== 0);
  if (outfield.length < 7) return fallbackFormation;

  let def = 0;
  let dm = 0;
  let mid = 0;
  let am = 0;
  let att = 0;

  for (const p of outfield) {
    const anchor = p.customAnchor || slots[Math.min(10, p.slotIndex)] || slots[1];
    const x = anchor.xNorm;
    if (x < 0.295) def++;
    else if (x < 0.405) dm++;
    else if (x < 0.555) mid++;
    else if (x < 0.65) am++;
    else att++;
  }

  // Distinct 4-band shapes matching standard nomenclature
  if (dm > 0 && mid === 0 && am > 0 && att > 0) {
    return `${def}-${dm}-${am}-${att}`;
  }
  if (dm === 1 && mid >= 3 && am === 0 && att === 1) {
    return `${def}-1-${mid}-1`;
  }
  if (dm === 0 && mid >= 3 && am === 1 && att === 1) {
    return `${def}-${mid}-1-1`;
  }

  const totalMid = dm + mid + am;
  return `${def}-${totalMid}-${att}`;
}

export function nearestPresetFormationId(label: string, fallback: FormationId = '4-4-2'): FormationId {
  if ((label as FormationId) in FORMATIONS) {
    return label as FormationId;
  }
  const parts = label.split('-').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (parts.length >= 3) {
    const def = parts[0];
    const att = parts[parts.length - 1];
    if (def >= 5) return att <= 1 ? '5-4-1' : '5-3-2';
    if (def <= 3) return att >= 3 ? '3-4-3' : '3-5-2';
    if (att >= 4) return '4-2-4';
    if (att === 3) return '4-3-3';
    if (parts.length === 4 && parts[1] === 2 && parts[2] === 3 && att === 1) return '4-2-3-1';
    if (att === 2) return '4-4-2';
    if (parts.length === 4 && parts[1] === 1) return '4-1-4-1';
    return '4-2-3-1';
  }
  return fallback;
}

