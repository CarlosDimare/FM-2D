import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastVariant, useFeedbackStore } from '../stores/feedbackStore';

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; iconColor: string; label: string; Icon: React.FC<{ size?: number; className?: string }> }
> = {
  success: {
    border: 'border-[#2b5d2c]',
    iconColor: 'text-emerald-400',
    label: 'Listo',
    Icon: CheckCircle2,
  },
  error: {
    border: 'border-red-700',
    iconColor: 'text-red-400',
    label: 'Error',
    Icon: XCircle,
  },
  warning: {
    border: 'border-amber-600',
    iconColor: 'text-[#facc15]',
    label: 'Aviso',
    Icon: AlertTriangle,
  },
  info: {
    border: 'border-[#4b525a]',
    iconColor: 'text-sky-300',
    label: 'Info',
    Icon: Info,
  },
};

export const FeedbackHost: React.FC = () => {
  const toasts = useFeedbackStore((s) => s.toasts);
  const dismissToast = useFeedbackStore((s) => s.dismissToast);
  const activeConfirm = useFeedbackStore((s) => s.activeConfirm);
  const resolveConfirm = useFeedbackStore((s) => s.resolveConfirm);

  useEffect(() => {
    if (!activeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeConfirm, resolveConfirm]);

  return (
    <>
      {/* In-App Confirmation Modal */}
      {activeConfirm && (
        <div
          className="fixed inset-0 z-[1200] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fm-confirm-title"
          onClick={() => resolveConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-[#e8ece8] rounded-sm border border-[#1c1f24] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle
                  size={15}
                  className={activeConfirm.danger ? 'text-red-400 shrink-0' : 'text-[#facc15] shrink-0'}
                />
                <h3
                  id="fm-confirm-title"
                  className="text-xs font-bold uppercase tracking-wider text-white truncate"
                >
                  {activeConfirm.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                className="text-slate-300 hover:text-white transition-colors p-0.5 cursor-pointer"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                {activeConfirm.message}
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => resolveConfirm(false)}
                  className="px-4 py-2 rounded-sm border border-[#737a82] text-xs font-semibold text-[#1f2428] cursor-pointer whitespace-nowrap"
                  style={{
                    background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
                  }}
                >
                  {activeConfirm.cancelLabel || 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={() => resolveConfirm(true)}
                  className={`px-4 py-2 rounded-sm border text-xs font-bold text-white shadow-sm cursor-pointer whitespace-nowrap transition-colors ${
                    activeConfirm.danger
                      ? 'bg-red-700 hover:bg-red-800 border-red-900'
                      : 'bg-[#2b5d2c] hover:bg-[#1f4920] border-[#133815]'
                  }`}
                >
                  {activeConfirm.confirmLabel || 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Toast Stack */}
      {toasts.length > 0 && (
        <div
          className="fixed top-14 right-3 z-[1150] flex flex-col gap-2 w-[min(92vw,340px)] pointer-events-none"
          aria-live="polite"
        >
          {toasts.map((t) => {
            const cfg = VARIANT_STYLES[t.variant];
            const IconComp = cfg.Icon;
            return (
              <div
                key={t.id}
                className={`pointer-events-auto bg-[#1b1f23]/95 text-white border ${cfg.border} rounded-sm shadow-xl px-3.5 py-2.5 flex items-start gap-2.5 backdrop-blur-xs`}
              >
                <IconComp size={16} className={`${cfg.iconColor} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                    {cfg.label}
                  </span>
                  <p className="text-xs text-white leading-snug break-words">{t.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-slate-400 hover:text-white transition-colors p-0.5 shrink-0 cursor-pointer"
                  aria-label="Descartar aviso"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
