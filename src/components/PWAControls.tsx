import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const handleClick = () => {
    if (isInstallable) {
      void install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center justify-center gap-1.5 rounded-[2px] border font-bold uppercase tracking-tight shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0 active:translate-y-px ${
          isInstallable
            ? 'bg-gradient-to-b from-[#3b7a3d] via-[#2b5d2c] to-[#1a3d1b] border-[#0f2410] text-white hover:brightness-110'
            : 'border-[#5f666e] text-[#1f2428] hover:brightness-105'
        } ${compact ? 'px-2.5 py-1 text-[10px]' : 'w-full px-3.5 py-2 text-xs'} ${className}`}
        style={
          isInstallable
            ? undefined
            : { background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)' }
        }
      >
        {isIOS && !isInstallable ? <Smartphone size={compact ? 12 : 14} /> : <Download size={compact ? 12 : 14} />}
        <span>{isIOS && !isInstallable ? 'Instalar en iOS' : 'Instalar App'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-[1250] bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowGuide(false)}
          style={{ fontFamily: 'Verdana, sans-serif' }}
        >
          <div
            className="w-full max-w-sm bg-[#e8ece8] rounded-sm border-2 border-[#1c1f24] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="border-b border-[#1c1f24] px-3.5 py-2 flex items-center justify-between"
              style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
            >
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-white">
                {isIOS ? 'Instalar en iPhone / iPad' : 'Instalar Aplicación (PWA)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-slate-300 hover:text-white cursor-pointer"
                aria-label="Cerrar guía"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-2.5 text-xs text-slate-800 leading-relaxed">
              {isIOS ? (
                <>
                  <p>1. Tocá el botón <strong>Compartir</strong> en la barra inferior de Safari.</p>
                  <p>2. Deslizá hacia abajo y elegí <strong>Agregar a inicio</strong>.</p>
                  <p>3. Confirmá con <strong>Agregar</strong> para jugar a pantalla completa y sin conexión.</p>
                </>
              ) : isInIframe ? (
                <>
                  <p>Estás viendo el juego dentro de un marco embebido, donde el navegador bloquea la instalación directa.</p>
                  <p>1. Abrí la dirección del juego en una <strong>pestaña directa del navegador</strong> (Chrome).</p>
                  <p>2. Luego tocá el menú <strong>⋮</strong> del navegador y elegí <strong>Instalar aplicación</strong>.</p>
                </>
              ) : isAndroid ? (
                <>
                  <p>Podés instalar la app en Android desde Chrome:</p>
                  <p>1. Tocá el menú <strong>⋮</strong> arriba a la derecha en Chrome.</p>
                  <p>2. Elegí <strong>Instalar aplicación</strong> o <strong>Agregar a la pantalla principal</strong>.</p>
                  <p className="text-[10px] text-slate-600">
                    Si acabás de cargar la página, recargá una vez para que Chrome habilite el aviso automático de instalación.
                  </p>
                </>
              ) : (
                <>
                  <p>Podés instalar el juego como aplicación independiente en tu dispositivo:</p>
                  <p>1. Abrí el menú del navegador (<strong>⋮</strong> o ícono de instalación en la barra de direcciones).</p>
                  <p>2. Elegí <strong>Instalar aplicación</strong> o <strong>Agregar a la pantalla principal</strong>.</p>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-2 w-full py-2 rounded-[2px] border border-[#133815] bg-[#2b5d2c] hover:bg-[#1f4920] text-white text-xs font-bold uppercase cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-16 lg:bottom-3 left-3 z-[1100] flex items-center gap-2 rounded-sm bg-[#1b1f23]/95 border border-amber-500/70 px-3 py-1.5 text-xs font-medium text-[#facc15] shadow-lg"
      role="status"
    >
      <WifiOff size={14} className="shrink-0" />
      <span>Modo sin conexión · Datos locales en uso</span>
    </div>
  );
};
