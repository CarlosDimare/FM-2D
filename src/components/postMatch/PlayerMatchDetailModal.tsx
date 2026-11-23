import React, { useState } from 'react';
import { Award, ChevronDown, ChevronRight, Shield, Star, Target, TrendingUp, User, X, Zap } from 'lucide-react';
import { Club } from '../../types';
import { HEATMAP_COLS, HEATMAP_ROWS } from '../../types/match';
import { FmBroadcastHeader, FmLedDisplay } from '../ClubBannerChrome';
import { world } from '../../services/worldManager';
import { useUIStore } from '../../stores/uiStore';

export interface MatchReportPlayerEntry {
  id: string;
  name: string;
  shortName: string;
  number: number;
  role: string;
  side: 'home' | 'away';
  isStarter: boolean;
  subbedOn: boolean;
  subbedOff: boolean;
  subbedInMinute?: number;
  subbedOutMinute?: number;
  minutesPlayed: number;
  rating: number;
  goals: number;
  ownGoals?: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xgGenerated: number;
  xgotGenerated: number;
  xa: number;
  passesAttempted: number;
  passesCompleted: number;
  keyPasses: number;
  progressivePasses: number;
  progressiveCarries: number;
  crossesAttempted: number;
  crossesCompleted: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  tacklesWon: number;
  tacklesAttempted: number;
  interceptions: number;
  clearances: number;
  shotsBlocked: number;
  groundDuelsWon: number;
  groundDuelsLost: number;
  aerialDuelsWon: number;
  aerialDuelsLost: number;
  foulsCommitted: number;
  foulsWon: number;
  yellowCards: number;
  redCard: boolean;
  saves: number;
  xgotFaced: number;
  goalsConceded: number;
  errorsLeadingToShot: number;
  stamina: number;
  distanceMeters: number;
  sprints: number;
  injured: boolean;
  injuryLabel?: string;
  heatmap?: number[];
  hasTelemetry: boolean;
}

export interface RatingBreakdownFactor {
  label: string;
  detail: string;
  delta: number;
  isBase?: boolean;
}

export const SoccerBallIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    className={`inline-block shrink-0 ${className}`}
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="7" fill="#ffffff" stroke="#1c1f24" strokeWidth="1.2" />
    <polygon points="8,4.3 11,6.5 9.9,10 6.1,10 5,6.5" fill="#1c1f24" />
    <line x1="8" y1="1.2" x2="8" y2="4.3" stroke="#1c1f24" strokeWidth="1" />
    <line x1="14.2" y1="5.6" x2="11" y2="6.5" stroke="#1c1f24" strokeWidth="1" />
    <line x1="12" y1="13.4" x2="9.9" y2="10" stroke="#1c1f24" strokeWidth="1" />
    <line x1="4" y1="13.4" x2="6.1" y2="10" stroke="#1c1f24" strokeWidth="1" />
    <line x1="1.8" y1="5.6" x2="5" y2="6.5" stroke="#1c1f24" strokeWidth="1" />
  </svg>
);

export const AssistIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    className={`inline-block shrink-0 ${className}`}
    aria-hidden="true"
  >
    <rect x="1" y="1" width="14" height="14" rx="2.5" fill="#1f5922" stroke="#0f2c11" strokeWidth="1" />
    <path
      d="M4.2 10.8 C5.5 6.8 8.2 5.4 11.4 5.4 M9.1 3.3 L12.1 5.4 L9.2 7.6"
      fill="none"
      stroke="#fde047"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function buildRatingBreakdown(p: MatchReportPlayerEntry): RatingBreakdownFactor[] {
  if (p.minutesPlayed <= 0) {
    return [];
  }

  const factors: RatingBreakdownFactor[] = [
    { label: 'Nota base de partido', detail: 'Inicio estándar', delta: 6.3, isBase: true },
  ];

  if (p.goals > 0) {
    factors.push({
      label: 'Goles convertidos',
      detail: `${p.goals} ${p.goals === 1 ? 'gol' : 'goles'}`,
      delta: p.goals * 0.95,
    });
  }

  if (p.assists > 0) {
    factors.push({
      label: 'Asistencias de gol',
      detail: `${p.assists} ${p.assists === 1 ? 'asistencia' : 'asistencias'}`,
      delta: p.assists * 0.62,
    });
  }

  const creationDelta = p.keyPasses * 0.16 + p.progressivePasses * 0.045;
  if (creationDelta >= 0.05) {
    factors.push({
      label: 'Generación ofensiva',
      detail: p.hasTelemetry
        ? `${p.keyPasses} p. clave · ${p.progressivePasses} prog.`
        : `${p.keyPasses} pases clave`,
      delta: creationDelta,
    });
  }

  if (p.passesAttempted >= 6) {
    const acc = p.passesCompleted / p.passesAttempted;
    const passDelta = (acc - 0.72) * 0.9;
    if (Math.abs(passDelta) >= 0.04) {
      factors.push({
        label: 'Precisión en el pase',
        detail: `${Math.round(acc * 100)}% (${p.passesCompleted}/${p.passesAttempted})`,
        delta: passDelta,
      });
    }
  }

  const progCarryDelta = p.dribblesCompleted * 0.09 + p.progressiveCarries * 0.05;
  if (progCarryDelta >= 0.05) {
    factors.push({
      label: 'Desequilibrio y conducción',
      detail: p.hasTelemetry
        ? `${p.dribblesCompleted} regates · ${p.progressiveCarries} cond. prog.`
        : `${p.dribblesCompleted} regates completados`,
      delta: progCarryDelta,
    });
  }

  const defDelta = p.tacklesWon * 0.11 + p.interceptions * 0.08 + p.clearances * 0.04;
  if (defDelta >= 0.05) {
    factors.push({
      label: 'Recuperación y trabajo defensivo',
      detail: `${p.tacklesWon} entr. · ${p.interceptions} interc.${
        p.clearances > 0 ? ` · ${p.clearances} desp.` : ''
      }`,
      delta: defDelta,
    });
  }

  const duelDelta =
    p.aerialDuelsWon * 0.05 -
    p.aerialDuelsLost * 0.03 +
    p.groundDuelsWon * 0.04 -
    p.groundDuelsLost * 0.03;
  const totalDuels =
    p.groundDuelsWon + p.groundDuelsLost + p.aerialDuelsWon + p.aerialDuelsLost;
  if (totalDuels > 0 && Math.abs(duelDelta) >= 0.04) {
    factors.push({
      label: 'Balance en duelos',
      detail: `${p.groundDuelsWon + p.aerialDuelsWon}/${totalDuels} ganados`,
      delta: duelDelta,
    });
  }

  if (p.role === 'POR') {
    const gkDelta = p.hasTelemetry
      ? p.saves * 0.24 + (p.xgotFaced - p.goalsConceded) * 0.45
      : p.saves * 0.22 - p.goalsConceded * 0.35;
    factors.push({
      label: 'Desempeño en portería',
      detail: p.hasTelemetry
        ? `${p.saves} ataj. · ${(p.xgotFaced - p.goalsConceded).toFixed(2)} goles evit.`
        : `${p.saves} atajadas · ${p.goalsConceded} en contra`,
      delta: gkDelta,
    });
  }

  const disciplinePenalty =
    -(p.foulsCommitted * 0.08) -
    p.yellowCards * 0.25 -
    (p.redCard ? 1.05 : 0) -
    p.errorsLeadingToShot * 0.45;
  if (disciplinePenalty <= -0.05) {
    const parts: string[] = [];
    if (p.foulsCommitted > 0) parts.push(`${p.foulsCommitted} faltas`);
    if (p.yellowCards > 0) parts.push(`${p.yellowCards} amarilla`);
    if (p.redCard) parts.push('roja');
    if (p.errorsLeadingToShot > 0) parts.push(`${p.errorsLeadingToShot} err. tiro`);
    factors.push({
      label: 'Disciplina y errores',
      detail: parts.join(' · '),
      delta: disciplinePenalty,
    });
  }

  const rawSum = factors.reduce((acc, f) => acc + f.delta, 0);
  const residual = Number((p.rating - rawSum).toFixed(2));
  if (Math.abs(residual) >= 0.08) {
    factors.push({
      label: 'Impacto en momentos del juego',
      detail:
        residual > 0
          ? 'Bonificación por acciones decisivas y resultado'
          : 'Ajuste por impacto táctico o tramo desfavorable',
      delta: residual,
    });
  }

  return factors;
}

function computePlayerReviewSeed(p: MatchReportPlayerEntry): number {
  let h = 2166136261;
  const str = `${p.id}|${p.minutesPlayed}|${p.goals}|${p.assists}|${Math.round(p.rating * 10)}|${p.passesCompleted}|${p.tacklesWon}|${p.shots}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function pickReviewVariant(seed: number, salt: number, options: string[]): string {
  const idx = Math.abs((seed + salt * 2654435761) >>> 0) % options.length;
  return options[idx];
}

export function buildPlayerPerformanceDescription(
  p: MatchReportPlayerEntry,
  isMotm: boolean,
  teamGoalsAgainst: number
): string {
  const seed = computePlayerReviewSeed(p);

  if (p.minutesPlayed <= 0) {
    return pickReviewVariant(seed, 1, [
      'Permaneció en el banco de suplentes durante todo el encuentro sin sumar minutos.',
      'No ingresó desde el banco y siguió todo el trámite junto al cuerpo técnico.',
      'Fue opción de recambio pero el desarrollo del partido no requirió su ingreso.',
      'Completó la convocatoria como alternativa en el banco sin llegar a saltar al campo.',
    ]);
  }

  const parts: string[] = [];
  const passAcc =
    p.passesAttempted > 0 ? Math.round((p.passesCompleted / p.passesAttempted) * 100) : 0;
  const groundTotal = p.groundDuelsWon + p.groundDuelsLost;
  const aerialTotal = p.aerialDuelsWon + p.aerialDuelsLost;
  const minNote = p.subbedOn
    ? p.subbedInMinute !== undefined
      ? `tras ingresar al minuto ${p.subbedInMinute}' (${p.minutesPlayed}' en cancha)`
      : `ingresando desde el banco para disputar ${p.minutesPlayed} minutos`
    : p.subbedOff && p.subbedOutMinute !== undefined
    ? `hasta ser reemplazado al ${p.subbedOutMinute}'`
    : `durante ${p.minutesPlayed} minutos`;

  // Opening evaluation sentence
  if (isMotm) {
    parts.push(
      pickReviewVariant(seed, 2, [
        `Fue elegido la gran figura del partido con una nota de ${p.rating.toFixed(1)}, marcando el pulso del encuentro ${minNote}.`,
        `Brilló como el jugador más determinante de la jornada (${p.rating.toFixed(1)}) y lideró a su equipo ${minNote}.`,
        `Firmó una actuación estelar (${p.rating.toFixed(1)}) para llevarse el premio al mejor del campo ${minNote}.`,
        `Se adueñó del partido de principio a fin con una valoración de ${p.rating.toFixed(1)} ${minNote}.`,
      ])
    );
  } else if (p.rating >= 8.0) {
    parts.push(
      pickReviewVariant(seed, 2, [
        `Completó una actuación sobresaliente (${p.rating.toFixed(1)}) ${minNote}, inclinando la balanza con peso propio.`,
        `Deslumbró con un nivel altísimo (${p.rating.toFixed(1)}) ${minNote} e impuso condiciones en su sector.`,
        `Redondeó una presentación de alto vuelo (${p.rating.toFixed(1)}) ${minNote}, siendo decisivo en las áreas clave.`,
        `Dejó una huella muy fuerte en el partido con un ${p.rating.toFixed(1)} de puntaje ${minNote}.`,
      ])
    );
  } else if (p.rating >= 7.2) {
    parts.push(
      pickReviewVariant(seed, 2, [
        `Mostró un rendimiento muy sólido y regular (${p.rating.toFixed(1)}) ${minNote}.`,
        `Tuvo una labor destacada (${p.rating.toFixed(1)}) ${minNote}, respondiendo con criterio cada vez que intervino.`,
        `Se mostró incisivo y confiable (${p.rating.toFixed(1)}) ${minNote}, aportando soluciones claras al equipo.`,
        `Cumplió con creces las exigencias del libreto (${p.rating.toFixed(1)}) ${minNote}.`,
      ])
    );
  } else if (p.rating >= 6.4) {
    parts.push(
      pickReviewVariant(seed, 2, [
        `Sostuvo una actuación correcta y disciplinada (${p.rating.toFixed(1)}) ${minNote}.`,
        `Cumplió un papel sobrio y funcional al colectivo (${p.rating.toFixed(1)}) ${minNote}.`,
        `Alternó buenas intervenciones con tramos más discretos (${p.rating.toFixed(1)}) ${minNote}.`,
        `Mantuvo el orden táctico en su zona (${p.rating.toFixed(1)}) ${minNote} sin sobresaltos.`,
      ])
    );
  } else {
    parts.push(
      pickReviewVariant(seed, 2, [
        `Le costó acomodarse al ritmo del encuentro (${p.rating.toFixed(1)}) ${minNote}.`,
        `Tuvo una jornada incómoda (${p.rating.toFixed(1)}) ${minNote}, sin lograr gravitar como suele hacerlo.`,
        `Padeció la intensidad rival (${p.rating.toFixed(1)}) ${minNote} y le faltó claridad en momentos clave.`,
        `No encontró su mejor versión futbolística (${p.rating.toFixed(1)}) ${minNote}.`,
      ])
    );
  }

  // Role & stat-specific narrative
  if (p.role === 'POR') {
    const prevented = p.xgotFaced - p.goalsConceded;
    if (p.goalsConceded === 0) {
      parts.push(
        pickReviewVariant(seed, 3, [
          `Cerró el arco en cero con ${p.saves} ${p.saves === 1 ? 'atajada' : 'atajadas'} y transmitió seguridad constante en cada centro.`,
          `Mantuvo la valla invicta respondiendo con firmeza en ${p.saves} ${p.saves === 1 ? 'intervención' : 'intervenciones'} bajo los tres palos.`,
          `No dio concesiones en su área: ${p.saves} ${p.saves === 1 ? 'parada' : 'paradas'} clave para sostener la portería imbatida.`,
        ])
      );
    } else if (p.hasTelemetry && prevented >= 0.4) {
      parts.push(
        pickReviewVariant(seed, 3, [
          `Sostuvo al equipo con ${p.saves} intervenciones de mérito (${prevented.toFixed(2)} goles evitados según xGOT) pese a los ${p.goalsConceded} tantos encajados.`,
          `Su marca de ${p.saves} atajadas evitó un marcador más abultado (${prevented.toFixed(2)} goles salvados por xGOT) tras recibir ${p.goalsConceded}.`,
        ])
      );
    } else {
      parts.push(
        pickReviewVariant(seed, 3, [
          `Sumó ${p.saves} ${p.saves === 1 ? 'atajada' : 'atajadas'} y sufrió ${p.goalsConceded} ${p.goalsConceded === 1 ? 'gol' : 'goles'} en contra.`,
          `Resolvió ${p.saves} remates rivales, aunque no pudo impedir ${p.goalsConceded} ${p.goalsConceded === 1 ? 'caída de su valla' : 'caídas de su valla'}.`,
        ])
      );
    }
    if (p.passesAttempted >= 5) {
      parts.push(
        pickReviewVariant(seed, 4, [
          `En el inicio de juego con los pies acertó ${p.passesCompleted}/${p.passesAttempted} entregas (${passAcc}%).`,
          `En salida desde el fondo conectó ${p.passesCompleted} de ${p.passesAttempted} pases (${passAcc}%).`,
        ])
      );
    }
  } else {
    // Offensive highlights
    const offHighlights: string[] = [];
    if (p.goals > 0) {
      const xgPhrase =
        p.hasTelemetry && p.xgGenerated > 0
          ? p.goals > p.xgGenerated + 0.35
            ? ` (alta eficacia sobre ${p.xgGenerated.toFixed(2)} xG)`
            : ` (xG ${p.xgGenerated.toFixed(2)})`
          : '';
      offHighlights.push(`firmó ${p.goals} ${p.goals === 1 ? 'gol' : 'goles'}${xgPhrase}`);
    } else if (p.shots >= 2) {
      offHighlights.push(
        pickReviewVariant(seed, 5, [
          `buscó el arco en ${p.shots} remates (${p.shotsOnTarget} entre los tres palos)`,
          `intentó finalizar con ${p.shots} disparos (${p.shotsOnTarget} con destino de red)`,
        ])
      );
    }
    if (p.assists > 0) {
      offHighlights.push(
        `entregó ${p.assists} ${p.assists === 1 ? 'asistencia decisiva' : 'asistencias de gol'}`
      );
    }
    if (p.keyPasses > 0) {
      offHighlights.push(
        `generó ${p.keyPasses} ${p.keyPasses === 1 ? 'ocasión con un pase clave' : 'ocasiones con pases clave'}`
      );
    }
    if (offHighlights.length > 0) {
      const lead = pickReviewVariant(seed, 6, [
        'En los últimos metros,',
        'De tres cuartos hacia adelante,',
        'En fase ofensiva,',
        'Cuando pisó campo rival,',
      ]);
      parts.push(`${lead} ${offHighlights.join(' y ')}.`);
    }

    // Distribution & carries
    if (p.passesAttempted >= 8) {
      const progNote =
        p.hasTelemetry && p.progressivePasses >= 3
          ? `, con ${p.progressivePasses} envíos progresivos para romper líneas`
          : '';
      const dribNote =
        p.dribblesCompleted >= 2 ? ` y superó marcas en ${p.dribblesCompleted} gambetas` : '';
      if (passAcc >= 85) {
        parts.push(
          pickReviewVariant(seed, 7, [
            `Manejó los hilos con mucha fineza: ${p.passesCompleted}/${p.passesAttempted} pases correctos (${passAcc}%${progNote})${dribNote}.`,
            `Le dio circulación limpia al balón completando ${p.passesCompleted} de ${p.passesAttempted} intentos (${passAcc}%${progNote})${dribNote}.`,
          ])
        );
      } else if (passAcc >= 70) {
        parts.push(
          pickReviewVariant(seed, 7, [
            `Aportó fluidez en la tenencia con ${p.passesCompleted}/${p.passesAttempted} pases (${passAcc}%${progNote})${dribNote}.`,
            `En distribución acertó ${p.passesCompleted} de ${p.passesAttempted} entregas (${passAcc}%${progNote})${dribNote}.`,
          ])
        );
      } else {
        parts.push(
          `Arriesgó en la circulación acertando ${p.passesCompleted} de ${p.passesAttempted} pases (${passAcc}%${progNote})${dribNote}.`
        );
      }
    } else if (p.dribblesCompleted >= 2) {
      parts.push(
        pickReviewVariant(seed, 8, [
          `Aportó desequilibrio en el mano a mano con ${p.dribblesCompleted}/${p.dribblesAttempted} regates exitosos.`,
          `Rompió el cerco rival en conducción ganando ${p.dribblesCompleted} de ${p.dribblesAttempted} duelos individuales.`,
        ])
      );
    }

    // Defensive highlights
    const defActions = p.tacklesWon + p.interceptions + p.clearances;
    if (defActions >= 3 || ['DFC', 'LI', 'LD', 'CAR', 'MCD'].includes(p.role)) {
      const duelStr =
        groundTotal + aerialTotal > 0
          ? `, ganando ${p.groundDuelsWon + p.aerialDuelsWon} de ${groundTotal + aerialTotal} duelos`
          : '';
      const cleanStr =
        teamGoalsAgainst === 0 && ['DFC', 'LI', 'LD', 'CAR'].includes(p.role)
          ? ' para sostener la valla invicta'
          : '';
      parts.push(
        pickReviewVariant(seed, 9, [
          `En la marca acumuló ${defActions} quites y rechaces (${p.tacklesWon} entradas, ${p.interceptions} cortes${
            p.clearances > 0 ? `, ${p.clearances} despejes` : ''
          })${duelStr}${cleanStr}.`,
          `Sin pelota sumó ${defActions} recuperaciones útiles (${p.tacklesWon} entradas ganadas, ${p.interceptions} intercepciones${
            p.clearances > 0 ? `, ${p.clearances} despejes` : ''
          })${duelStr}${cleanStr}.`,
        ])
      );
    }
  }

  // Discipline / physical closing note
  if (p.redCard) {
    parts.push(
      pickReviewVariant(seed, 10, [
        'La tarjeta roja dejó a su equipo en inferioridad y condicionó el cierre.',
        'Su expulsión obligó a reacomodar las piezas para resistir el resto del duelo.',
      ])
    );
  } else if (p.yellowCards > 0) {
    parts.push(
      pickReviewVariant(seed, 10, [
        'Vio la cartulina amarilla al cortar una acción comprometida.',
        'Fue amonestado por el árbitro y debió medir sus entradas desde entonces.',
      ])
    );
  } else if (p.injured) {
    parts.push(`Debió recibir asistencia médica por lesión (${p.injuryLabel || 'molestia física'}).`);
  } else if (p.hasTelemetry && p.distanceMeters >= 9500) {
    parts.push(
      pickReviewVariant(seed, 10, [
        `Exhibió un enorme despliegue físico cubriendo ${(p.distanceMeters / 1000).toFixed(2)} km con ${p.sprints} piques de alta intensidad.`,
        `Se vació en el esfuerzo: recorrió ${(p.distanceMeters / 1000).toFixed(2)} km y completó ${p.sprints} sprints durante el partido.`,
      ])
    );
  } else if (p.minutesPlayed >= 75 && p.stamina >= 80) {
    parts.push('Terminó el compromiso entero físicamente y sin perder intensidad.');
  }

  return parts.join(' ');
}

interface PlayerMatchDetailModalProps {
  player: MatchReportPlayerEntry;
  club: Club;
  isMotm: boolean;
  teamGoalsAgainst: number;
  onClose: () => void;
}

export const PlayerMatchDetailModal: React.FC<PlayerMatchDetailModalProps> = ({
  player,
  club,
  isMotm,
  teamGoalsAgainst,
  onClose,
}) => {
  const [openSections, setOpenSections] = useState({
    evaluacion: true,
    desglose: true,
    ataque: true,
    pases: true,
    defensa: true,
    fisico: true,
    heatmap: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const breakdown = buildRatingBreakdown(player);
  const narrative = buildPlayerPerformanceDescription(player, isMotm, teamGoalsAgainst);
  const passAcc =
    player.passesAttempted > 0
      ? Math.round((player.passesCompleted / player.passesAttempted) * 100)
      : 0;
  const dribAcc =
    player.dribblesAttempted > 0
      ? Math.round((player.dribblesCompleted / player.dribblesAttempted) * 100)
      : 0;
  const crossAcc =
    player.crossesAttempted > 0
      ? Math.round((player.crossesCompleted / player.crossesAttempted) * 100)
      : 0;
  const groundTotal = player.groundDuelsWon + player.groundDuelsLost;
  const groundPct = groundTotal > 0 ? Math.round((player.groundDuelsWon / groundTotal) * 100) : 0;
  const aerialTotal = player.aerialDuelsWon + player.aerialDuelsLost;
  const aerialPct = aerialTotal > 0 ? Math.round((player.aerialDuelsWon / aerialTotal) * 100) : 0;

  const hasHeatmap = Boolean(player.heatmap && player.heatmap.some((v) => v > 0));
  const maxHeat = hasHeatmap ? Math.max(1, ...player.heatmap!) : 1;

  return (
    <div
      className="fixed inset-0 z-[540] bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[92vh] bg-[#e8ece8] border-0 sm:border-2 sm:border-[#1c1f24] sm:rounded-sm shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dynamic FM08 Header matching App main dynamic header 1:1 */}
        <header className="w-full shrink-0">
          <FmBroadcastHeader
            club={club}
            title={
              <span className="flex items-center gap-1.5 truncate">
                {isMotm && (
                  <Star size={14} fill="#facc15" className="text-[#facc15] shrink-0" />
                )}
                <span className="truncate">
                  {player.number > 0 ? `#${player.number} ` : ''}
                  {player.name}
                </span>
              </span>
            }
            shortCode={club.shortName}
            subtitle={`${player.role} · ${club.name} · ${
              player.minutesPlayed > 0 ? `${player.minutesPlayed}' jugados` : 'Suplente sin minutos'
            }`}
            shieldSize="md"
            rightSlot={
              <div className="flex items-center gap-2">
                <FmLedDisplay className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-[2px] flex items-center gap-1.5 leading-tight">
                  <span className="text-[9px] font-bold uppercase text-slate-400">Nota</span>
                  <span
                    className={`font-mono text-xs sm:text-sm font-bold tabular-nums tracking-wider ${
                      player.minutesPlayed <= 0
                        ? 'text-slate-400'
                        : player.rating >= 7.5
                        ? 'text-emerald-400'
                        : player.rating >= 6.5
                        ? 'text-[#facc15]'
                        : 'text-rose-400'
                    }`}
                  >
                    {player.minutesPlayed > 0 ? player.rating.toFixed(1) : '—'}
                  </span>
                </FmLedDisplay>
                {(() => {
                  const realPlayer = world.getPlayer(player.id);
                  if (!realPlayer) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        useUIStore.getState().setSelectedPlayer(realPlayer);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-[2px] bg-[#1b1f23]/80 hover:bg-[#1b1f23] border border-white/25 text-white text-[10px] font-bold uppercase cursor-pointer"
                      title="Abrir ficha completa del jugador"
                    >
                      <User size={12} /> <span className="hidden sm:inline">Ficha</span>
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-[2px] bg-[#1b1f23]/80 hover:bg-[#1b1f23] border border-white/20 text-white cursor-pointer"
                  aria-label="Cerrar detalle del jugador"
                >
                  <X size={15} />
                </button>
              </div>
            }
          />
          <div className="h-1 w-full bg-[#3a3f45] border-b border-[#1c1f24]" />
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 sm:p-4 space-y-3 bg-[#d4dcd4]">
          {/* Event badges strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isMotm && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-amber-100 border border-amber-400 text-amber-900 text-[10px] font-black uppercase">
                <Star size={11} fill="#d97706" className="text-amber-600" /> Figura del Partido
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-[2px] bg-white border border-[#8e9b90] text-slate-800 text-[10px] font-bold uppercase">
              {player.isStarter
                ? player.subbedOff && player.subbedOutMinute !== undefined
                  ? `Titular · Salió ${player.subbedOutMinute}'`
                  : 'Titular'
                : player.subbedOn
                ? player.subbedInMinute !== undefined
                  ? `Entró ${player.subbedInMinute}'`
                  : 'Entró desde el banco'
                : 'Suplente'}
            </span>
            {player.goals > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-emerald-100 border border-emerald-400 text-emerald-900 text-[10px] font-black uppercase">
                <SoccerBallIcon size={11} /> {player.goals} {player.goals === 1 ? 'Gol' : 'Goles'}
              </span>
            )}
            {(player.ownGoals || 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-rose-100 border border-rose-400 text-rose-900 text-[10px] font-black uppercase">
                {player.ownGoals} Gol e/c
              </span>
            )}
            {player.assists > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-sky-100 border border-sky-400 text-sky-900 text-[10px] font-black uppercase">
                <AssistIcon size={11} /> {player.assists}{' '}
                {player.assists === 1 ? 'Asistencia' : 'Asistencias'}
              </span>
            )}
            {player.yellowCards > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-amber-50 border border-amber-400 text-amber-900 text-[10px] font-bold uppercase">
                <span className="w-2 h-2.5 bg-amber-400 border border-amber-700 rounded-[1px]" />
                Amarilla
              </span>
            )}
            {player.redCard && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-rose-100 border border-rose-400 text-rose-900 text-[10px] font-black uppercase">
                <span className="w-2 h-2.5 bg-rose-600 border border-rose-900 rounded-[1px]" />
                Expulsado
              </span>
            )}
            {player.injured && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-rose-50 border border-rose-300 text-rose-800 text-[10px] font-bold uppercase">
                + {player.injuryLabel || 'Lesión'}
              </span>
            )}
          </div>

          {/* 1. Performance Description Card */}
          <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => toggleSection('evaluacion')}
              aria-expanded={openSections.evaluacion}
              className="w-full px-3 py-1.5 border-b border-[#1c1f24] flex items-center justify-between gap-2 text-left cursor-pointer hover:brightness-110 transition-all"
              style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
            >
              <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white">
                <Award size={12} className="text-[#facc15]" />
                Evaluación de Desempeño
              </span>
              {openSections.evaluacion ? (
                <ChevronDown size={13} className="text-slate-300 shrink-0" />
              ) : (
                <ChevronRight size={13} className="text-slate-300 shrink-0" />
              )}
            </button>
            {openSections.evaluacion && (
              <div className="p-3 text-xs text-slate-800 leading-relaxed font-medium bg-[#f9fbf9]">
                {narrative}
              </div>
            )}
          </div>

          {/* 2. Rating Breakdown (De dónde surge el puntaje) */}
          {breakdown.length > 0 && (
            <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => toggleSection('desglose')}
                aria-expanded={openSections.desglose}
                className="w-full px-3 py-1.5 border-b border-[#1c1f24] flex items-center justify-between gap-2 text-left cursor-pointer hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
              >
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white">
                  <TrendingUp size={12} className="text-[#facc15]" />
                  Desglose del Puntaje
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] font-bold text-[#facc15] tabular-nums">
                    Final: {player.rating.toFixed(1)}
                  </span>
                  {openSections.desglose ? (
                    <ChevronDown size={13} className="text-slate-300" />
                  ) : (
                    <ChevronRight size={13} className="text-slate-300" />
                  )}
                </span>
              </button>
              {openSections.desglose && (
                <div className="divide-y divide-[#dde4dd]">
                  {breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] bg-white hover:bg-[#f4f7f4]"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900">{item.label}</span>
                        <span className="text-[10px] text-slate-500 ml-1.5">· {item.detail}</span>
                      </div>
                      <span
                        className={`font-mono font-bold tabular-nums shrink-0 ${
                          item.isBase
                            ? 'text-slate-700'
                            : item.delta >= 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {item.isBase
                          ? item.delta.toFixed(2)
                          : `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Full Match Statistics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
            {/* Attack & Shooting */}
            <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => toggleSection('ataque')}
                aria-expanded={openSections.ataque}
                className="w-full bg-[#e2e7e2] hover:bg-[#d7ded7] border-b border-[#9aa69a] px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-[10px] font-black uppercase text-slate-800 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Target size={11} className="text-emerald-700" /> Ataque y Remates
                </span>
                {openSections.ataque ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {openSections.ataque && (
                <div className="divide-y divide-[#edf1ed] text-[11px]">
                  <StatKv label="Goles" value={player.goals} />
                  <StatKv label="Asistencias" value={player.assists} />
                  <StatKv
                    label="Tiros (al arco)"
                    value={`${player.shots} (${player.shotsOnTarget})`}
                  />
                  {player.hasTelemetry && (
                    <>
                      <StatKv
                        label="xG / xGOT"
                        value={`${player.xgGenerated.toFixed(2)} / ${player.xgotGenerated.toFixed(2)}`}
                      />
                      <StatKv label="Asist. Esperadas (xA)" value={player.xa.toFixed(2)} />
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Passing & Progression */}
            <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => toggleSection('pases')}
                aria-expanded={openSections.pases}
                className="w-full bg-[#e2e7e2] hover:bg-[#d7ded7] border-b border-[#9aa69a] px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-[10px] font-black uppercase text-slate-800 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Zap size={11} className="text-sky-700" /> Pases y Progresión
                </span>
                {openSections.pases ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {openSections.pases && (
                <div className="divide-y divide-[#edf1ed] text-[11px]">
                  <StatKv
                    label="Pases completados"
                    value={`${player.passesCompleted}/${player.passesAttempted} (${passAcc}%)`}
                  />
                  <StatKv label="Pases clave" value={player.keyPasses} />
                  {player.hasTelemetry && (
                    <>
                      <StatKv
                        label="P. Progresivos / Conduc."
                        value={`${player.progressivePasses} / ${player.progressiveCarries}`}
                      />
                      <StatKv
                        label="Centros"
                        value={`${player.crossesCompleted}/${player.crossesAttempted} (${crossAcc}%)`}
                      />
                    </>
                  )}
                  <StatKv
                    label="Regates"
                    value={`${player.dribblesCompleted}/${player.dribblesAttempted} (${dribAcc}%)`}
                  />
                </div>
              )}
            </div>

            {/* Defense & Duels */}
            <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => toggleSection('defensa')}
                aria-expanded={openSections.defensa}
                className="w-full bg-[#e2e7e2] hover:bg-[#d7ded7] border-b border-[#9aa69a] px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-[10px] font-black uppercase text-slate-800 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Shield size={11} className="text-slate-700" /> Defensa y Duelos
                </span>
                {openSections.defensa ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {openSections.defensa && (
                <div className="divide-y divide-[#edf1ed] text-[11px]">
                  <StatKv label="Entradas ganadas" value={player.tacklesWon} />
                  <StatKv label="Intercepciones" value={player.interceptions} />
                  <StatKv
                    label="Despejes / Tiros bloq."
                    value={`${player.clearances} / ${player.shotsBlocked}`}
                  />
                  {player.hasTelemetry && (
                    <>
                      <StatKv
                        label="Duelos terrestres"
                        value={`${player.groundDuelsWon}/${groundTotal} (${groundPct}%)`}
                      />
                      <StatKv
                        label="Duelos aéreos"
                        value={`${player.aerialDuelsWon}/${aerialTotal} (${aerialPct}%)`}
                      />
                    </>
                  )}
                  {!player.hasTelemetry && (
                    <StatKv
                      label="Duelos aéreos"
                      value={`${player.aerialDuelsWon}/${aerialTotal} (${aerialPct}%)`}
                    />
                  )}
                  <StatKv
                    label="Faltas com. / recib."
                    value={`${player.foulsCommitted} / ${player.foulsWon}`}
                  />
                </div>
              )}
            </div>

            {/* Physical & GK */}
            <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => toggleSection('fisico')}
                aria-expanded={openSections.fisico}
                className="w-full bg-[#e2e7e2] hover:bg-[#d7ded7] border-b border-[#9aa69a] px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-[10px] font-black uppercase text-slate-800 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <TrendingUp size={11} className="text-amber-700" /> Físico{' '}
                  {player.role === 'POR' ? 'y Portería' : 'y Disciplina'}
                </span>
                {openSections.fisico ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {openSections.fisico && (
                <div className="divide-y divide-[#edf1ed] text-[11px]">
                  <StatKv label="Minutos jugados" value={`${player.minutesPlayed}'`} />
                  <StatKv label="Condición final" value={`${Math.round(player.stamina)}%`} />
                  {player.hasTelemetry && (
                    <>
                      <StatKv
                        label="Distancia recorrida"
                        value={`${(player.distanceMeters / 1000).toFixed(2)} km`}
                      />
                      <StatKv label="Sprints" value={player.sprints} />
                    </>
                  )}
                  {player.role === 'POR' && (
                    <>
                      <StatKv label="Atajadas" value={player.saves} />
                      <StatKv label="Goles encajados" value={player.goalsConceded} />
                      {player.hasTelemetry && (
                        <StatKv
                          label="Goles evitados (xGOT)"
                          value={(player.xgotFaced - player.goalsConceded).toFixed(2)}
                        />
                      )}
                    </>
                  )}
                  {player.hasTelemetry && player.errorsLeadingToShot > 0 && (
                    <StatKv label="Errores de tiro" value={player.errorsLeadingToShot} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Individual 12x8 Heatmap */}
          {hasHeatmap && (
            <div className="bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => toggleSection('heatmap')}
                aria-expanded={openSections.heatmap}
                className="w-full bg-[#e2e7e2] hover:bg-[#d7ded7] border-b border-[#9aa69a] px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-800 flex items-center justify-between cursor-pointer transition-colors"
              >
                <span>Mapa de Calor Individual (12×8)</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-normal text-[9.5px] text-slate-600">Ataque →</span>
                  {openSections.heatmap ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              </button>
              {openSections.heatmap && (
                <div className="p-2.5 bg-[#f4f7f4]">
                  <div className="relative w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] overflow-hidden">
                    <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
                      {player.heatmap!.map((val, idx) => {
                        if (val <= 0) return null;
                        const col = idx % HEATMAP_COLS;
                        const row = Math.floor(idx / HEATMAP_COLS);
                        const cellW = 105 / HEATMAP_COLS;
                        const cellH = 68 / HEATMAP_ROWS;
                        const intensity = Math.min(1, val / maxHeat);
                        const fillColor =
                          intensity > 0.72
                            ? '#ef4444'
                            : intensity > 0.42
                            ? '#f59e0b'
                            : '#38bdf8';
                        return (
                          <rect
                            key={idx}
                            x={-52.5 + col * cellW}
                            y={-34 + row * cellH}
                            width={cellW + 0.15}
                            height={cellH + 0.15}
                            fill={fillColor}
                            fillOpacity={0.18 + intensity * 0.65}
                          />
                        );
                      })}
                      <g stroke="rgba(255,255,255,0.32)" strokeWidth="0.45" fill="none">
                        <rect x="-52.5" y="-34" width="105" height="68" />
                        <line x1="0" y1="-34" x2="0" y2="34" />
                        <circle cx="0" cy="0" r="9.15" />
                        <rect x="-52.5" y="-20.16" width="16.5" height="40.32" />
                        <rect x="36" y="-20.16" width="16.5" height="40.32" />
                      </g>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatKv: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
    <span className="text-slate-600 truncate">{label}</span>
    <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">{value}</span>
  </div>
);
