import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getClubHexPalette } from '../ClubBannerChrome';

interface CharacterDialogProps {
  nombre: string;
  cargo: string;
  iniciales: string;
  clubColor: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  quickReplies?: { texto: string; onClick: () => void }[];
}

export const CharacterDialog: React.FC<CharacterDialogProps> = ({
  nombre, cargo, iniciales, clubColor, onClose, children, footer, maxWidth = 'max-w-3xl', quickReplies,
}) => {
  const closeRef = useRef<() => void>(onClose);
  closeRef.current = onClose;
  const pal = getClubHexPalette(clubColor, '#2b5d2c', '#f8fafc');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Diálogo con ${nombre}, ${cargo}`}
      className="fixed inset-x-0 bottom-0 top-auto z-[950] bg-black/70 backdrop-blur-sm flex items-end justify-center p-0 sm:p-3 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className={`bg-[#e8ece8] border border-[#1c1f24] rounded-t-md shadow-2xl w-full ${maxWidth} max-h-[92vh] flex flex-col overflow-hidden animate-slide-up`}
        onClick={e => e.stopPropagation()}
      >
        <header
          className="relative px-4 sm:px-5 py-3 border-b border-[#14171a] flex items-center gap-3 sm:gap-4 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(90deg, ${pal.primary} 0%, ${pal.primary}dd 36%, #23272c 74%, #191c20 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-4"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
            }}
          />
          {pal.isLightPrimary && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, rgba(15,18,22,0.18) 0%, rgba(15,18,22,0.52) 100%)',
              }}
            />
          )}
          <div
            className="relative z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-sm flex items-center justify-center font-bold text-sm sm:text-base uppercase shadow-md border border-white/40 shrink-0"
            style={{
              backgroundColor: '#14171a',
              color: '#facc15',
            }}
          >
            {iniciales}
          </div>
          <div className="relative z-10 flex-1 min-w-0">
            <h3 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">{nombre}</h3>
            <p className="text-[11px] font-medium text-white/80 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{cargo}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="relative z-10 bg-[#1b1f23]/80 hover:bg-[#991b1b] border border-white/15 rounded p-1.5 transition-colors shrink-0 cursor-pointer"
          >
            <X size={16} className="text-slate-200" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scroll bg-[#dce4dc]/60">
          {quickReplies && quickReplies.length > 0 && (
            <div className="px-4 sm:px-6 pt-4 flex flex-wrap gap-2">
              {quickReplies.map((qr, i) => (
                <button
                  key={i}
                  onClick={qr.onClick}
                  className="text-[9px] font-black uppercase tracking-widest bg-white border border-[#a0b0a0] rounded-sm px-3 py-1.5 text-slate-700 hover:bg-[#3a4a3a] hover:text-white transition-colors animate-fade-up"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  {qr.texto}
                </button>
              ))}
            </div>
          )}
          <div className="p-4 sm:p-6">
            {children}
          </div>
        </div>

        {footer && (
          <footer className="px-4 sm:px-6 py-3 border-t border-[#a0b0a0] bg-[#d3dcd3] flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};
