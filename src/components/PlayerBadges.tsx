import React from 'react';
import { Player } from '../types';
import { X, MessageSquare } from 'lucide-react';

/**
 * Puntos de forma (últimos ratings) con la misma escala cromática en todas las vistas:
 * verde ≥8, verde claro ≥7, ámbar ≥6, naranja ≥5, rojo <5.
 */
export const PlayerFormDots: React.FC<{ ratings?: number[] }> = ({ ratings }) => {
  if (!ratings || ratings.length === 0) return null;
  return (
    <div className="flex gap-[2px] items-center justify-center">
      {ratings.map((r, i) => {
        let color = 'bg-slate-300';
        if (r >= 8) color = 'bg-green-500';
        else if (r >= 7) color = 'bg-green-400';
        else if (r >= 6) color = 'bg-amber-400';
        else if (r >= 5) color = 'bg-orange-500';
        else color = 'bg-red-500';
        return <div key={i} className={`w-[6px] h-[6px] rounded-full ${color}`} title={`${r.toFixed(1)}`} />;
      })}
    </div>
  );
};

/**
 * Iconos de estado de jugador: TRN (transferible), lesión y suspensión.
 * Compartidos entre la plantilla de club y la convocatoria de la selección.
 */
export const PlayerStatusIcons: React.FC<{ player: Player }> = ({ player }) => {
  const icons = [];
  if (player.transferStatus !== 'NONE') {
    icons.push(
      <span key="trn" className="text-[8px] text-orange-700 font-black bg-orange-100 border border-orange-300 px-1 rounded-[1px] h-4 flex items-center">TRN</span>
    );
  }
  if (player.injury) {
    icons.push(
      <div key="inj" className="w-4 h-4 bg-white border border-red-600 flex items-center justify-center rounded-[1px] shadow-sm">
        <X size={10} className="text-red-600 stroke-[4]" />
      </div>
    );
  }
  if (player.suspension && player.suspension.matchesLeft > 0) {
    icons.push(<div key="sus" className="w-3 h-4 bg-red-600 border border-red-800 rounded-[1px] shadow-sm"></div>);
  }
  return icons.length > 0 ? <div className="flex gap-1.5 items-center ml-2 shrink-0">{icons}</div> : null;
};

export interface DialogueUrgencyInfo {
  wantsToTalk: boolean;
  score: number; // 0 (verde / calma) -> 1 (rojo / urgente)
  fillColor: string;
  strokeColor: string;
  label: string;
}

export function getDialogueUrgency(player: Player): DialogueUrgencyInfo {
  const motive = player.pendingDialogue;
  if (!motive) {
    return {
      wantsToTalk: false,
      score: 0,
      fillColor: 'hsl(132, 72%, 44%)',
      strokeColor: 'hsl(132, 82%, 22%)',
      label: '',
    };
  }

  let score = 0.45;
  switch (motive) {
    case 'POST_MATCH_PRAISE':
    case 'PRE_MATCH_CHAT':
      score = 0.14;
      break;
    case 'CONTRACT_RENEWAL':
      score = 0.38;
      break;
    case 'MINUTES_DISCONTENT':
      score = 0.56;
      break;
    case 'POST_MATCH_WARNING':
      score = 0.64;
      break;
    case 'CONTRACT_EXPIRING':
      score = 0.74;
      break;
    case 'TRANSFER_RUMOR':
    case 'DRESSING_ROOM_CONFLICT':
      score = 0.85;
      break;
    default:
      score = 0.45;
      break;
  }

  const morale = player.morale ?? 65;
  if (morale < 55) {
    score += (55 - morale) * 0.0075;
  } else if (morale >= 78) {
    score -= 0.12;
  }

  if (player.transferRequestReason) {
    score += 0.16;
  }
  if (
    (player.personality === 'VOLATILE' ||
      player.personality === 'TEMPERAMENTAL' ||
      player.personality === 'AMBITIOUS' ||
      player.personality === 'COMPETITIVE' ||
      player.personality === 'DRIVEN') &&
    (motive === 'MINUTES_DISCONTENT' || motive === 'TRANSFER_RUMOR' || motive === 'DRESSING_ROOM_CONFLICT')
  ) {
    score += 0.08;
  }

  const clamped = Math.max(0, Math.min(1, score));
  const hue = Math.round((1 - clamped) * 132); // 132 (verde) -> 66 (ámbar/amarillo) -> 0 (rojo)
  const lightness = clamped > 0.65 ? 50 : 45;
  const motiveText = motive
    ? (() => {
        switch (motive) {
          case 'POST_MATCH_PRAISE':
            return 'Elogio post-partido';
          case 'PRE_MATCH_CHAT':
            return 'Charla previa al partido';
          case 'POST_MATCH_WARNING':
            return 'Autocrítica post-partido';
          case 'MINUTES_DISCONTENT':
            return 'Pide más minutos';
          case 'CONTRACT_RENEWAL':
            return 'Renovación de contrato';
          case 'CONTRACT_EXPIRING':
            return 'Contrato próximo a vencer';
          case 'TRANSFER_RUMOR':
            return 'Rumores de traspaso';
          case 'DRESSING_ROOM_CONFLICT':
            return 'Tensión en el vestuario';
          default:
            return 'Conversación disponible';
        }
      })()
    : '';

  const label =
    clamped >= 0.72
      ? `${motiveText} · Urgente`
      : clamped >= 0.4
      ? `${motiveText} · Pendiente`
      : `${motiveText} · Opcional (sin urgencia)`;

  return {
    wantsToTalk: true,
    score: clamped,
    fillColor: `hsl(${hue}, 82%, ${lightness}%)`,
    strokeColor: `hsl(${hue}, 88%, 22%)`,
    label,
  };
}

/**
 * Globito de diálogo con gradiente continuo de urgencia (verde -> amarillo -> rojo).
 */
export const PlayerDialogueBubble: React.FC<{ player: Player; className?: string }> = ({
  player,
  className = 'ml-1.5 shrink-0',
}) => {
  const urgency = getDialogueUrgency(player);
  if (!urgency.wantsToTalk) return null;
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title={urgency.label}
      aria-label={urgency.label}
    >
      <MessageSquare
        size={15}
        style={{ fill: urgency.fillColor, color: urgency.strokeColor }}
        className="drop-shadow-xs"
      />
    </span>
  );
};

