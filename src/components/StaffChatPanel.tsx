import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { Staff, StaffChatMessage } from '../types';
import { world } from '../services/worldManager';
import { notifyAll, useWorldStore } from '../stores/worldStore';
import {
  checkStaffChatAvailability,
  ensureStaffInitialGreeting,
  getStaffFormulaSuggestions,
  getStaffInitialSuggestedReplies,
  getStaffRoleLabel,
  sendStaffChatMessage,
  sendStaffFormulaReply,
  StaffFormulaSuggestion,
} from '../services/staffChatService';
import { getClubHexPalette } from './ClubBannerChrome';

interface StaffChatPanelProps {
  staff: Staff;
  clubId: string;
  currentDate: Date;
  compact?: boolean;
}

export const StaffChatPanel: React.FC<StaffChatPanelProps> = ({
  staff,
  clubId,
  currentDate,
  compact = false,
}) => {
  useWorldStore((s) => s._tick);

  const isFreeAgent = !staff.clubId || staff.clubId === 'FREE_AGENT';
  const staffActualClub = !isFreeAgent ? world.getClub(staff.clubId) : undefined;
  const userClub = clubId ? world.getClub(clubId) : undefined;
  const isUserClubStaff = Boolean(userClub && staffActualClub && staffActualClub.id === userClub.id);
  const staffClubName = staffActualClub?.name || 'Agente Libre';
  const userClubName = userClub?.name || staffClubName;
  const clubPrimary = getClubHexPalette(staffActualClub, '#2b5d2c', '#f8fafc').primary;

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCheckingAi, setIsCheckingAi] = useState(false);
  const [chatMode, setChatMode] = useState<'AI' | 'FORMULA'>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'FORMULA' : 'AI'
  );
  const [offlineReason, setOfflineReason] = useState<string | null>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'Sin conexión a internet. Charla libre oculta: usá las sugerencias por fórmula.'
      : null
  );
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>(() =>
    getStaffInitialSuggestedReplies(staff, staffClubName, isUserClubStaff, userClubName)
  );
  const [formulaStep, setFormulaStep] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);

  const probeAiAvailability = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setChatMode('FORMULA');
      setOfflineReason('Sin conexión a internet. Charla libre oculta: usá las sugerencias por fórmula.');
      return;
    }
    setIsCheckingAi(true);
    const ok = await checkStaffChatAvailability();
    setIsCheckingAi(false);
    if (ok) {
      setChatMode('AI');
      setOfflineReason(null);
    } else {
      setChatMode('FORMULA');
      setOfflineReason('IA no disponible en este momento. Charla libre oculta: usá las sugerencias por fórmula.');
    }
  };

  useEffect(() => {
    void probeAiAvailability();

    const handleOffline = () => {
      setChatMode('FORMULA');
      setOfflineReason('Sin conexión a internet. Charla libre oculta: usá las sugerencias por fórmula.');
    };
    const handleOnline = () => {
      void probeAiAvailability();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    setInputText('');
    setFormulaStep(0);
    setSuggestedReplies(
      getStaffInitialSuggestedReplies(staff, staffClubName, isUserClubStaff, userClubName)
    );
    const initialized = ensureStaffInitialGreeting(
      staff,
      staffClubName,
      currentDate,
      isUserClubStaff,
      userClubName
    );
    if (initialized) {
      notifyAll();
    }
  }, [staff.id, staffClubName, isUserClubStaff, userClubName]);

  const chatHistory: StaffChatMessage[] = staff.chatHistory || [];

  const formulaSuggestions = useMemo(
    () => getStaffFormulaSuggestions(staff, staffClubName, formulaStep, isUserClubStaff, userClubName),
    [staff.id, staffClubName, formulaStep, isUserClubStaff, userClubName]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory.length, isSending, chatMode]);

  const rel = world.getRelationship('COACH', staff.id);
  const morale = Math.round(staff.morale ?? 70);

  const handleSendAi = async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text || isSending || chatMode !== 'AI') return;

    setIsSending(true);
    setInputText('');

    try {
      const res = await sendStaffChatMessage(staff, clubId, text, currentDate);
      if (res.suggestedReplies && res.suggestedReplies.length > 0) {
        setSuggestedReplies(res.suggestedReplies);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fallo de conexión con la IA.';
      setChatMode('FORMULA');
      setOfflineReason(
        `No se pudo contactar con la IA (${msg}). Modo libre oculto: usá las sugerencias por fórmula.`
      );
      setInputText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendFormula = (suggestion: StaffFormulaSuggestion) => {
    if (isSending) return;
    sendStaffFormulaReply(staff, clubId, suggestion, currentDate);
    setFormulaStep((prev) => prev + 1);
  };

  const formatDateShort = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };

  const squadCount = staffActualClub ? world.getPlayersByClub(staffActualClub.id).length : 0;

  return (
    <div
      className={`flex flex-col bg-[#e8ece8] border border-[#8e9b90] rounded-sm overflow-hidden shadow-sm ${
        compact ? 'h-[60dvh] min-h-[360px] max-h-[540px]' : 'flex-1 h-full min-h-0'
      }`}
    >
      {/* Top Status Strip */}
      <div
        className="px-3 py-2 border-b border-[#1c1f24] flex flex-wrap items-center justify-between gap-2 shrink-0"
        style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle size={14} className="text-[#facc15] shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-wide text-white truncate">
            {isUserClubStaff
              ? `Reunión técnica · ${getStaffRoleLabel(staff.role)}`
              : !isFreeAgent
              ? `Staff externo · ${staffClubName}`
              : 'Contacto · Empleado Libre'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-[10px] font-mono font-bold tabular-nums shrink-0">
          <span className="text-slate-200">
            Moral{' '}
            <span className={morale >= 65 ? 'text-emerald-300' : morale < 45 ? 'text-rose-300' : 'text-[#facc15]'}>
              {morale}%
            </span>
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-200">
            Confianza <span className="text-sky-300">{Math.round(rel.trust)}</span>
          </span>
          <span className="text-slate-400 hidden sm:inline">·</span>
          <span className="text-slate-200 hidden sm:inline">
            Tensión <span className={rel.tension >= 50 ? 'text-rose-300' : 'text-amber-300'}>{Math.round(rel.tension)}</span>
          </span>
        </div>
      </div>

      {/* Situation & Context Strip */}
      <div className="px-3 py-1.5 bg-[#dce4dc] border-b border-[#98a698] flex flex-wrap items-center gap-2 text-[10px] text-slate-700 shrink-0">
        <span className="inline-flex items-center gap-1 font-black uppercase text-[#1f4920]">
          <Briefcase size={11} />
          {getStaffRoleLabel(staff.role)}
        </span>
        <span>·</span>
        <span className="font-bold">
          {isFreeAgent ? 'Sin club (disponible)' : `${staffClubName} (${squadCount} jugadores en club)`}
        </span>
        {staff.preferredFormation && (
          <>
            <span>·</span>
            <span className="font-mono font-bold text-slate-800">Esquema pref.: {staff.preferredFormation}</span>
          </>
        )}
        <span>·</span>
        <span className="font-mono font-bold text-slate-800">£{staff.salary.toLocaleString()}/mes</span>
      </div>

      {/* Scrollable Chat History */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-scroll custom-scroll p-3 space-y-2.5 bg-[#f4f7f4]"
      >
        {chatHistory.map((msg) => {
          if (msg.sender === 'SYSTEM') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="px-3 py-1 rounded-sm bg-[#e0e8e0] border border-[#96a696] text-[10px] font-bold text-[#2d3a2d] flex items-center gap-1.5 max-w-[92%] text-center">
                  <ShieldCheck size={12} className="text-[#2b5d2c] shrink-0" />
                  <span>{msg.text}</span>
                </div>
              </div>
            );
          }

          const isManager = msg.sender === 'MANAGER';
          const hasDeltas =
            !isManager &&
            ((typeof msg.moraleDelta === 'number' && msg.moraleDelta !== 0) ||
              (typeof msg.trustDelta === 'number' && msg.trustDelta !== 0) ||
              (typeof msg.tensionDelta === 'number' && msg.tensionDelta !== 0));

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isManager ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                  {isManager ? 'Director Técnico' : staff.name}
                </span>
                {msg.dateIso && (
                  <span className="text-[8.5px] font-mono text-slate-400">
                    {formatDateShort(msg.dateIso)}
                  </span>
                )}
              </div>

              <div
                className={`max-w-[86%] sm:max-w-[78%] px-3 py-2 rounded-sm text-[11.5px] leading-relaxed shadow-xs border ${
                  isManager
                    ? 'bg-[#2b5d2c] text-white border-[#173818]'
                    : 'bg-white text-slate-800 border-[#a4b2a4]'
                }`}
                style={!isManager ? { borderLeftWidth: '3px', borderLeftColor: clubPrimary } : undefined}
              >
                <p className="font-medium whitespace-pre-wrap">{msg.text}</p>

                {hasDeltas && (
                  <div className="mt-1.5 pt-1 border-t border-slate-200 flex flex-wrap gap-1.5 text-[9px] font-mono font-bold">
                    {typeof msg.moraleDelta === 'number' && msg.moraleDelta !== 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-[2px] ${
                          msg.moraleDelta > 0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        Moral {msg.moraleDelta > 0 ? `+${msg.moraleDelta}` : msg.moraleDelta}
                      </span>
                    )}
                    {typeof msg.trustDelta === 'number' && msg.trustDelta !== 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-[2px] ${
                          msg.trustDelta > 0
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        Confianza {msg.trustDelta > 0 ? `+${msg.trustDelta}` : msg.trustDelta}
                      </span>
                    )}
                    {typeof msg.tensionDelta === 'number' && msg.tensionDelta !== 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-[2px] ${
                          msg.tensionDelta < 0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        Tensión {msg.tensionDelta > 0 ? `+${msg.tensionDelta}` : msg.tensionDelta}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start">
            <div className="px-3 py-2 rounded-sm bg-white border border-[#a4b2a4] text-[11px] font-semibold text-slate-600 flex items-center gap-2 shadow-xs">
              <Loader2 size={13} className="animate-spin text-[#2b5d2c]" />
              <span>{staff.name} está analizando tu consulta...</span>
            </div>
          </div>
        )}
      </div>

      {/* Offline / AI Fallback Notice */}
      {chatMode === 'FORMULA' && (
        <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-300 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-amber-900 text-[10px] font-bold">
            <WifiOff size={13} className="shrink-0 text-amber-700" />
            <span className="truncate sm:whitespace-normal">
              {offlineReason || 'Modo fórmula activo: elegí una sugerencia para conversar.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void probeAiAvailability()}
            disabled={isCheckingAi}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-[2px] bg-white hover:bg-amber-100 border border-amber-400 text-amber-900 text-[9px] font-black uppercase cursor-pointer disabled:opacity-50"
          >
            {isCheckingAi ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            <span>Reintentar IA</span>
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="p-2.5 bg-[#dce4dc] border-t border-[#98a698] space-y-2 shrink-0">
        {chatMode === 'FORMULA' ? (
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[8.5px] font-black uppercase tracking-wider text-slate-600">
              <MessageCircle size={10} className="text-[#2b5d2c]" />
              Sugerencias por fórmula:
            </span>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
              {formulaSuggestions.map((sg) => (
                <button
                  key={sg.id}
                  type="button"
                  onClick={() => handleSendFormula(sg)}
                  className="text-left px-2.5 py-1.5 rounded-[2px] bg-white hover:bg-[#2b5d2c] hover:text-white text-slate-800 border border-[#8e9b90] text-[10.5px] font-bold transition-colors cursor-pointer"
                >
                  {sg.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {suggestedReplies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="inline-flex items-center gap-1 text-[8.5px] font-black uppercase tracking-wider text-slate-600 mr-0.5">
                  <Sparkles size={10} className="text-[#2b5d2c]" />
                  Sugerencias:
                </span>
                {suggestedReplies.map((sr, idx) => (
                  <button
                    key={`${idx}-${sr.slice(0, 12)}`}
                    type="button"
                    disabled={isSending}
                    onClick={() => void handleSendAi(sr)}
                    className="text-left px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#2b5d2c] hover:text-white text-slate-800 border border-[#8e9b90] text-[10px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {sr}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendAi(inputText);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isSending}
                maxLength={500}
                placeholder={`Consultale a ${staff.name} sobre jugadores, táctica o su situación...`}
                className="flex-1 min-w-0 px-3 py-2 rounded-[2px] bg-white border border-[#7a8a7a] focus:border-[#2b5d2c] focus:outline-none text-xs font-medium text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[2px] bg-[#2b5d2c] hover:bg-[#1f4920] disabled:opacity-45 text-white border border-[#133014] text-[10.5px] font-black uppercase tracking-wide shadow-xs cursor-pointer"
              >
                {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                <span>Enviar</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
