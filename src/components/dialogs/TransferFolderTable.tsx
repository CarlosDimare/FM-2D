import React, { useRef } from 'react';
import { Check, Minus, MoreVertical } from 'lucide-react';
import { world } from '../../services/worldManager';
import { TransferCandidate, TransferViability } from '../../services/staffAdviceService';

const VIABILIDAD_META: Record<TransferViability, { label: string; cls: string; dot: string }> = {
  VIABLE: { label: 'Asequible', cls: 'bg-green-100 text-green-800 border-green-400', dot: '🟢' },
  NEGOTIABLE: { label: 'Negociable', cls: 'bg-amber-100 text-amber-800 border-amber-400', dot: '🟡' },
  INVIABLE: { label: 'Inviable', cls: 'bg-red-100 text-red-800 border-red-400', dot: '🔴' },
};

interface TransferFolderTableProps {
  candidatos: TransferCandidate[];
  seleccionados: Set<string>;
  onToggle: (playerId: string) => void;
  onOpenPlayer: (playerId: string) => void;
  onRowContextMenu: (playerId: string, clientX: number, clientY: number) => void;
}

/**
 * Tabla de la Carpeta de Refuerzos (spec §4.1): jugador (link a ficha) / posición / valor /
 * semáforo de viabilidad + menú contextual (clic derecho / mantener presionado en táctil) + selector.
 */
export const TransferFolderTable: React.FC<TransferFolderTableProps> = ({
  candidatos,
  seleccionados,
  onToggle,
  onOpenPlayer,
  onRowContextMenu,
}) => {
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  if (candidatos.length === 0) {
    return (
      <div className="p-10 text-center text-slate-500 italic uppercase font-bold tracking-widest text-[10px] bg-[#f2f7f2] border border-[#a0b0a0] rounded-sm">
        Sin candidatos en la carpeta
      </div>
    );
  }

  return (
    <div className="bg-[#f2f7f2] border border-[#a0b0a0] rounded-sm overflow-hidden">
      <div className="px-3 py-1.5 bg-[#dfe7df] border-b border-[#a0b0a0]/70 text-[8.5px] font-bold text-slate-600 flex flex-wrap items-center justify-between gap-1">
        <span>Clic en el nombre para abrir su ficha</span>
        <span>Clic derecho o mantener presionado para acciones</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#d3dcd3] border-b border-[#a0b0a0]">
              <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-600">Jugador</th>
              <th className="px-2.5 py-2 text-[8px] font-black uppercase tracking-widest text-slate-600">Pos</th>
              <th className="px-2.5 py-2 text-[8px] font-black uppercase tracking-widest text-slate-600 text-right">Valor</th>
              <th className="px-2.5 py-2 text-[8px] font-black uppercase tracking-widest text-slate-600">Viabilidad</th>
              <th className="px-2 py-2 text-[8px] font-black uppercase tracking-widest text-slate-600 text-center">Acc.</th>
              <th className="px-2.5 py-2 text-[8px] font-black uppercase tracking-widest text-slate-600 text-center">Sel.</th>
            </tr>
          </thead>
          <tbody>
            {candidatos.map((c, idx) => {
              const p = world.getPlayer(c.playerId);
              const meta = VIABILIDAD_META[c.viabilidad];
              const seleccionado = seleccionados.has(c.playerId);
              const clubLabel = p ? world.getClub(p.clubId)?.shortName || p.nationality || '—' : '—';
              return (
                <tr
                  key={c.playerId}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRowContextMenu(c.playerId, e.clientX, e.clientY);
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length !== 1) return;
                    const touch = e.touches[0];
                    const x = touch.clientX;
                    const y = touch.clientY;
                    longPressTriggeredRef.current = false;
                    touchStartPosRef.current = { x, y };
                    clearLongPress();
                    touchStartPosRef.current = { x, y };
                    longPressTimerRef.current = window.setTimeout(() => {
                      longPressTriggeredRef.current = true;
                      onRowContextMenu(c.playerId, x, y);
                    }, 450);
                  }}
                  onTouchMove={(e) => {
                    if (!touchStartPosRef.current || e.touches.length !== 1) return;
                    const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
                    const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
                    if (dx > 8 || dy > 8) {
                      clearLongPress();
                    }
                  }}
                  onTouchEnd={() => clearLongPress()}
                  onTouchCancel={() => clearLongPress()}
                  className={`border-b border-[#a0b0a0]/40 transition-colors select-none ${idx % 2 === 0 ? 'bg-white' : 'bg-[#e8ece8]/60'} ${seleccionado ? 'bg-green-50' : ''} hover:bg-[#ccd9cc]`}
                >
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start">
                      <button
                        type="button"
                        onClick={() => {
                          if (longPressTriggeredRef.current) {
                            longPressTriggeredRef.current = false;
                            return;
                          }
                          onOpenPlayer(c.playerId);
                        }}
                        className="text-[10px] font-black text-[#1d3f1e] hover:text-[#2b5d2c] hover:underline uppercase truncate max-w-[145px] text-left cursor-pointer"
                      >
                        {p?.name || '—'}
                      </button>
                      <span className="text-[8px] text-slate-500 font-bold uppercase">{clubLabel}</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-[10px] font-bold text-slate-700">{c.position}</td>
                  <td className="px-2.5 py-2 text-right text-[10px] font-black text-slate-900">£{(c.value / 1000000).toFixed(1)}M</td>
                  <td className="px-2.5 py-2">
                    <span
                      title={c.razon}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[8px] font-black uppercase tracking-tight cursor-help ${meta.cls}`}
                    >
                      {meta.dot} {meta.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        onRowContextMenu(c.playerId, rect.left, rect.bottom + 4);
                      }}
                      title="Acciones sobre el jugador"
                      aria-label={`Acciones para ${p?.name || 'jugador'}`}
                      className="w-6 h-6 inline-flex items-center justify-center rounded-sm border border-[#a0b0a0] bg-white hover:bg-[#dfe7df] text-slate-700 cursor-pointer"
                    >
                      <MoreVertical size={12} />
                    </button>
                  </td>
                  <td className="px-2.5 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onToggle(c.playerId)}
                      aria-pressed={seleccionado}
                      title={seleccionado ? 'Quitar de la selección' : 'Seleccionar'}
                      className={`w-5 h-5 inline-flex items-center justify-center rounded-sm border-2 transition-all cursor-pointer ${seleccionado ? 'bg-[#3a4a3a] border-[#3a4a3a] text-white' : 'bg-white border-[#a0b0a0] text-transparent hover:border-[#3a4a3a]'}`}
                    >
                      {seleccionado ? <Check size={11} /> : <Minus size={11} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
