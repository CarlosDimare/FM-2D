import React, { useEffect, useState } from 'react';
import { tailwindClassToHex } from '../../services/matchEngineBridge';

export interface ProgressiveOptionData {
  id: string;
  icono: string;
  titulo: string;
  descripcion: string;
  efectos: string[];
}

interface ProgressiveOptionsProps {
  opciones: ProgressiveOptionData[];
  seleccionada: string | null;
  delayMs?: number;
  color?: string;
  onSelect: (id: string) => void;
  renderExtra?: (op: ProgressiveOptionData) => React.ReactNode;
}

export const ProgressiveOptions: React.FC<ProgressiveOptionsProps> = ({
  opciones, seleccionada, delayMs = 180, color = '#3a4a3a', onSelect, renderExtra,
}) => {
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const activeBorderHex = tailwindClassToHex(color, '#3a4a3a');

  useEffect(() => {
    setVisible(new Set());
    const timers = opciones.map((_, i) =>
      setTimeout(() => {
        setVisible(prev => {
          const next = new Set(prev);
          next.add(i);
          return next;
        });
      }, 120 + i * delayMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [opciones, delayMs]);

  return (
    <div className="flex flex-col sm:flex-row gap-3 pt-2">
      {opciones.map((op, i) => (
        <div
          key={op.id}
          className={`relative flex-1 min-w-[180px] text-left p-3.5 sm:p-4 rounded-sm border-2 bg-white transition-all hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer animate-fade-up ${seleccionada === op.id ? 'shadow-md' : 'border-[#a0b0a0]'}`}
          style={{
            animationDelay: visible.has(i) ? `${i * delayMs}ms` : '0ms',
            opacity: visible.has(i) ? 1 : 0,
            borderColor: seleccionada === op.id ? activeBorderHex : undefined,
          }}
          onClick={() => onSelect(op.id)}
        >
          <div className="text-xl mb-1">{op.icono}</div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">{op.titulo}</p>
          <p className="text-[10px] font-medium italic text-slate-700 mt-1 leading-snug">{op.descripcion}</p>
          {op.efectos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {op.efectos.map((ef, j) => (
                <li key={j} className="flex items-start gap-1.5 text-[9px] font-bold text-slate-600 leading-snug">
                  <span className="text-green-700 shrink-0 mt-0.5">✓</span> {ef}
                </li>
              ))}
            </ul>
          )}
          {renderExtra && renderExtra(op)}
          {seleccionada === op.id && (
            <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#3a4a3a] text-white flex items-center justify-center">
              <span className="text-white text-[10px] font-black">✓</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
