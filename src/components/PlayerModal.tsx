
import React, { useState, useEffect } from 'react';
import { Player, Attribute, ATTRIBUTE_LABELS, Position, SquadType, POSITION_FULL_NAMES, PlayerHistoryEntry, PLAYER_PERSONALITY_LABELS, PLAYER_PERSONALITY_DESC } from '../types';
import { world } from '../services/worldManager';
import { ProfileNarrativeEngine } from '../services/engine';
import { TransferOfferModal } from './TransferOfferModal';
import { ContractNegotiationModal } from './ContractNegotiationModal';
import { X, MessageSquare, Activity, Map, FileText, History, Minus, ShieldAlert, ArrowRightLeft, UserX, UserPlus, Users, AlertCircle, Info, Award, ShieldAlert as DisciplineIcon, Shield, User, Star, ChevronLeft, ChevronRight, Cake, Ruler, Weight, UserCircle, FolderPlus, FolderMinus } from 'lucide-react';
import { FMTable, FMTableCell, FMButton, FMBox } from './FMUI';
import { getFlagUrl } from '../data/static';
import { confirmAction, showToast } from '../stores/feedbackStore';
import { getAttributeTag } from '../services/playerGenerator';
import { openClubSquad, useUIStore } from '../stores/uiStore';
import { notifyAll, useWorldStore } from '../stores/worldStore';
import { FmClubShield, getClubHexPalette } from './ClubBannerChrome';
import { PlayerChatPanel } from './PlayerChatPanel';
import { markContractPromiseFulfilled } from '../services/playerChatService';
import { getDialogueUrgency } from './PlayerBadges';

interface PlayerModalProps {
  player: Player | null;
  onClose: () => void;
  userClubId?: string;
  currentDate: Date;
}

// Coordenadas para el mapa de posiciones
const POSITION_COORDS: Record<string, { x: number, y: number }> = {
  'P': { x: 50, y: 90 },
  'DFC': { x: 50, y: 75 },
  'LD': { x: 85, y: 75 },
  'LI': { x: 15, y: 75 },
  'MCD': { x: 50, y: 60 },
  'MC': { x: 50, y: 45 },
  'MD': { x: 85, y: 45 },
  'MI': { x: 15, y: 45 },
  'MPC': { x: 50, y: 30 },
  'ED': { x: 85, y: 20 },
  'EI': { x: 15, y: 20 },
  'DC': { x: 50, y: 15 },
};

const getKeyAttributes = (pos: Position): string[] => {
  switch (pos) {
    case Position.GK: return ['anticipacion', 'velocidad', 'fuerza', 'decision'];
    case Position.DC: return ['anticipacion', 'fuerza', 'posicionamiento', 'agresividad'];
    case Position.DR: case Position.DL: return ['velocidad', 'resistencia', 'pase', 'anticipacion'];
    case Position.DM: return ['anticipacion', 'fuerza', 'pase', 'posicionamiento'];
    case Position.MC: return ['pase', 'vision', 'control', 'decision'];
    case Position.AM: return ['regate', 'vision', 'control', 'velocidad'];
    case Position.ST: return ['disparo', 'velocidad', 'posicionamiento', 'control'];
    default: return ['pase', 'decision', 'resistencia'];
  }
};

const VISIBLE_INTERNAL_MAP: Record<string, string[]> = {
  fisico: ['velocidad', 'resistencia', 'fuerza'],
  mental: ['anticipacion', 'decision', 'posicionamiento', 'vision'],
  tecnica: ['control', 'pase', 'regate', 'disparo'],
  agresividad: ['agresividad'],
  polivalencia: ['polivalencia'],
};

const VisibleAttrCard: React.FC<{
  label: string;
  value: number;
  isKey: boolean;
  expanded: boolean;
  onToggle: () => void;
  internals: Record<string, number>;
  internalKeys: string[];
}> = ({ label, value, isKey, expanded, onToggle, internals, internalKeys }) => {
  const pct = Math.round((value / 20) * 100);
  const badgeBoxStyle =
    value >= 16
      ? 'bg-[#2b5d2c] text-[#facc15] border-[#133014]'
      : value >= 11
      ? 'bg-[#dce7dc] text-[#1d431e] border-[#7a967a]'
      : value >= 7
      ? 'bg-[#e8ece8] text-[#2d3238] border-[#8e9b90]'
      : 'bg-[#f1f3f1] text-slate-500 border-[#b0bab0]';

  const barFillColor =
    value >= 16
      ? 'bg-[#2b5d2c]'
      : value >= 11
      ? 'bg-[#4f7d50]'
      : value >= 7
      ? 'bg-[#737a82]'
      : 'bg-[#a0a8b0]';

  const tagBadgeStyle =
    value >= 16
      ? 'bg-[#2b5d2c]/10 border-[#2b5d2c]/40 text-[#1d431e]'
      : value >= 11
      ? 'bg-[#e8f0e8] border-[#8e9b90] text-[#2b5d2c]'
      : value >= 7
      ? 'bg-[#eef1ee] border-[#a0b0a0] text-[#3a3f45]'
      : 'bg-slate-100 border-slate-300 text-slate-500';

  return (
    <div className={`border rounded-[2px] overflow-hidden transition-colors ${expanded ? 'bg-white border-[#3a4a3a] shadow-sm' : 'bg-[#f8faf8] border-[#8e9b90] hover:bg-white cursor-pointer'}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-[#eef3ee] transition-colors cursor-pointer">
        <div className={`w-9 h-9 rounded-[2px] border flex items-center justify-center shrink-0 shadow-xs font-mono tabular-nums ${badgeBoxStyle}`}>
          <span className="text-base font-black leading-none">{value}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10.5px] font-black uppercase tracking-wide text-[#1f2428] truncate">
                {ATTRIBUTE_LABELS[label] || label}
              </span>
              {isKey && (
                <span title="Atributo clave para su puesto" className="shrink-0 flex items-center">
                  <Star size={10} className="text-[#2b5d2c] fill-[#facc15]" />
                </span>
              )}
            </div>
            <span className={`px-1.5 py-0.5 rounded-[2px] border text-[9px] font-black uppercase tracking-wide leading-none shrink-0 ${tagBadgeStyle}`}>
              {getAttributeTag(label, value)}
            </span>
          </div>
          <div className="h-2 bg-[#dce3dc] rounded-[1px] overflow-hidden border border-[#9aa79c]">
            <div className={`h-full transition-all duration-300 ${barFillColor}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ChevronRight size={14} className={`text-[#5f666e] shrink-0 transition-transform ${expanded ? 'rotate-90 text-[#2b5d2c]' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-[#8e9b90]/60 bg-[#eef3ee] px-3 py-2 space-y-1.5">
          {internalKeys.map(ik => {
            const iv = internals[ik];
            const iPct = Math.round((iv / 20) * 100);
            const iBarColor = iv >= 16 ? 'bg-[#2b5d2c]' : iv >= 11 ? 'bg-[#4f7d50]' : iv >= 7 ? 'bg-[#737a82]' : 'bg-[#a0a8b0]';
            const iTextColor = iv >= 16 ? 'text-[#1d431e]' : iv >= 11 ? 'text-[#2b5d2c]' : 'text-[#4b525a]';
            return (
              <div key={ik} className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-[#3a3f45] uppercase w-24 truncate">{ATTRIBUTE_LABELS[ik] || ik}</span>
                <div className="flex-1 h-1.5 bg-[#d4dcd4] border border-[#a0b0a0] rounded-[1px] overflow-hidden">
                  <div className={`h-full ${iBarColor}`} style={{ width: `${iPct}%` }} />
                </div>
                <span className={`text-[10.5px] font-mono tabular-nums font-black w-5 text-right ${iTextColor}`}>{iv}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const PlayerModal: React.FC<PlayerModalProps> = ({ player, onClose, userClubId, currentDate }) => {
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'PERSONAL' | 'POSITIONS' | 'HISTORY' | 'CONTRACT' | 'INTERACTION'>('PROFILE');
  const [expandedVisible, setExpandedVisible] = useState<string | null>(null);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  
  const { comparePlayerA, setComparePlayerA, setComparePlayerB } = useUIStore();
  useWorldStore(s => s._tick);

  useEffect(() => {
    setExpandedVisible(null);
    setShowRenewalModal(false);
  }, [player?.id]);

  if (!player) return null;

  const club = world.getClub(player.clubId);
  const personality = ProfileNarrativeEngine.getPersonalityLabel(player);
  const isUserPlayer = player.clubId === userClubId;
  const keyAttributes = getKeyAttributes(player.positions[0]);

  const handleRescind = async () => {
    const ok = await confirmAction({
      title: 'Rescindir contrato',
      message: `¿Confirmás la rescisión inmediata del contrato de ${player.name}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Rescindir',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (ok) {
      world.rescindContract(player.id, currentDate);
      showToast(`Contrato de ${player.name} rescindido.`, 'warning');
      onClose();
    }
  };

  const isInFolder = userClubId ? world.isInTransferFolder(userClubId, player.id) : false;

  const handlePonerEnCarpeta = () => {
    if (!userClubId) return;
    world.toggleTransferFolder(userClubId, player.id);
    notifyAll();
  };

  const clubPalette = getClubHexPalette(club, '#23272c', '#f8fafc');

  const personalityLabel = player.personality
    ? (PLAYER_PERSONALITY_LABELS[player.personality] || ProfileNarrativeEngine.getPersonalityLabel(player))
    : ProfileNarrativeEngine.getPersonalityLabel(player);
  const personalityDesc = player.personality ? PLAYER_PERSONALITY_DESC[player.personality] : '';

  const personalMotive = ((player.morale < 40 || player.fitness < 60) && player.clubId);

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[975] md:p-4 backdrop-blur-sm">
        <div className="bg-[#d4dcd4] w-full h-full md:h-[86vh] md:max-h-[780px] md:max-w-6xl md:rounded-sm shadow-2xl border border-[#1c1f24] flex flex-col overflow-hidden">
          
          {/* Header — FM08 Broadcast Club Gradient */}
          <div
            className="p-2 sm:p-3 md:p-4 border-b border-[#14171a] flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0 relative overflow-hidden"
            style={{
              background: `linear-gradient(90deg, ${clubPalette.primary} 0%, ${clubPalette.primary}dd 36%, #23272c 74%, #191c20 100%)`,
            }}
          >
             <div
               className="pointer-events-none absolute inset-x-0 top-0 h-5"
               style={{
                 background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
               }}
             />
             {clubPalette.isLightPrimary && (
               <div
                 className="pointer-events-none absolute inset-0"
                 style={{
                   background: 'linear-gradient(180deg, rgba(15,18,22,0.18) 0%, rgba(15,18,22,0.52) 100%)',
                 }}
               />
             )}

             <div className="relative z-10 w-11 h-13 sm:w-16 sm:h-20 md:w-22 md:h-26 bg-[#14171a] border border-white/30 rounded-sm overflow-hidden flex items-center justify-center shrink-0 shadow-lg">
                {player.photo ? <img src={player.photo} alt={player.name} className="w-full h-full object-cover" /> : <User size={28} className="text-slate-400 sm:w-9 sm:h-9" />}
                <div className="absolute bottom-0.5 right-0.5 w-3.5 h-2.5 md:w-5 md:h-4 shadow-sm border border-white/80">
                    <img src={getFlagUrl(player.nationality)} alt={player.nationality} className="w-full h-full object-cover" />
                </div>
             </div>

              <div className="relative z-10 flex-1 flex flex-col gap-0.5 sm:gap-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                    <h2 className="text-base sm:text-2xl md:text-3xl font-bold text-white tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] truncate leading-tight">
                      {player.name}
                    </h2>
                    {club ? (
                      <button
                        type="button"
                        onClick={() => openClubSquad(club.id, world.clubs)}
                        className="flex items-center gap-1 min-w-0 hover:underline cursor-pointer text-left"
                        title={`Ver plantilla de ${club.name}`}
                      >
                        <FmClubShield club={club} size="xs" />
                        <h3 className="text-[11px] sm:text-base font-semibold text-white/85 hover:text-white tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
                          {club.name}
                        </h3>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0">
                        <FmClubShield club={club} size="xs" />
                        <h3 className="text-[11px] sm:text-base font-semibold text-white/85 tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
                          Agente Libre
                        </h3>
                      </div>
                    )}
                </div>

                 <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] font-medium text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    <span className="font-mono font-bold text-[#facc15] uppercase">
                      {POSITION_FULL_NAMES[player.positions[0]] || player.positions[0]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{player.nationality}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{player.age} años</span>
                    <span className="hidden sm:inline" aria-hidden="true">·</span>
                    <span className="hidden sm:inline font-mono tabular-nums">{player.height} cm</span>
                 </div>
             </div>

             <div className="relative z-10 flex items-center gap-1 shrink-0 self-start">
                {userClubId && (
                  <button
                    onClick={() => { setComparePlayerA(player); }}
                    className="p-1.5 rounded bg-[#1b1f23]/80 hover:bg-[#14171a] border border-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
                    title="Comparar"
                  >
                    <ArrowRightLeft size={15} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded bg-[#1b1f23]/80 hover:bg-[#991b1b] border border-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
                  aria-label="Cerrar ficha"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
             </div>
          </div>

          {/* Nav Tabs — FM08 Steel Sub-Toolbar (Icon-only) */}
          <div className="flex items-center justify-around sm:justify-start bg-[#3a3f45] border-b border-[#1c1f24] px-2 py-1.5 gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
             {[
                { id: 'PROFILE', icon: Activity, label: 'Perfil' },
                { id: 'PERSONAL', icon: Info, label: 'Información Personal' },
                { id: 'POSITIONS', icon: Map, label: 'Posiciones' },
                { id: 'HISTORY', icon: History, label: 'Historial' },
                { id: 'CONTRACT', icon: FileText, label: 'Contrato' },
                ...(userClubId ? [{ id: 'INTERACTION', icon: MessageSquare, label: 'Charla' }] : []),
             ].map(t => {
                const isPendingInteraction = t.id === 'INTERACTION' && Boolean(player.pendingDialogue) && isUserPlayer;
                const urgency = isPendingInteraction ? getDialogueUrgency(player) : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={urgency ? `${t.label} · ${urgency.label}` : t.label}
                    aria-label={t.label}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`relative flex items-center justify-center w-10 h-8 sm:w-11 sm:h-8 rounded transition-colors shrink-0 cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-[#2b5d2c] text-white shadow-inner border border-[#1a3a1b]'
                        : 'text-slate-200 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                      <t.icon
                        className="w-4 h-4 shrink-0"
                        style={urgency ? { fill: urgency.fillColor, color: urgency.strokeColor } : undefined}
                      />
                  </button>
                );
             })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col bg-[#d4dcd4] p-2 md:p-3 relative">
             {activeTab === 'PROFILE' && (
                <div className="h-full flex flex-col gap-2 overflow-y-auto md:overflow-hidden">
                   <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2.5 md:overflow-hidden">
                      {/* VISIBLES - Main column */}
                      <FMBox
                        title="Atributos Visibles"
                        className="md:col-span-2 flex flex-col min-h-0"
                        headerRight={<span className="text-[9px] text-slate-300 font-semibold hidden sm:inline">Tocá un bloque para ver detalle</span>}
                      >
                         <div className="space-y-1.5">
                            {(['fisico', 'mental', 'tecnica', 'agresividad', 'polivalencia'] as const).map(k => (
                              <VisibleAttrCard
                                key={k}
                                label={k}
                                value={player.stats.visible[k]}
                                isKey={keyAttributes.includes(k)}
                                expanded={expandedVisible === k}
                                onToggle={() => setExpandedVisible(expandedVisible === k ? null : k)}
                                internals={player.stats.internal}
                                internalKeys={VISIBLE_INTERNAL_MAP[k]}
                              />
                            ))}
                         </div>
                      </FMBox>

                      {/* FORMA - Side column */}
                      <div className="flex flex-col gap-1.5">
                         <div className="bg-[#e8ece8] border border-[#8e9b90] shrink-0 shadow-sm overflow-hidden rounded-sm">
                            <div className="p-2 flex flex-col gap-1.5 bg-white">
                               <div className="flex justify-between items-center px-1 py-0.5">
                                  <span className="text-[9px] font-black text-[#3a3f45] uppercase tracking-wider">Condición Física</span>
                                  <span className={`text-xs font-black font-mono tabular-nums ${player.fitness >= 80 ? 'text-[#2b5d2c]' : player.fitness >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {Math.round(player.fitness)}%
                                  </span>
                               </div>
                               <div className="px-1 pb-1">
                                  <div className="w-full h-2 bg-[#d4dcd4] rounded-[1px] overflow-hidden border border-[#8e9b90]">
                                     <div
                                        className={`h-full transition-all ${player.fitness >= 80 ? 'bg-[#2b5d2c]' : player.fitness >= 60 ? 'bg-amber-500' : 'bg-red-600'}`}
                                        style={{ width: `${Math.max(0, Math.min(100, Math.round(player.fitness)))}%` }}
                                     />
                                  </div>
                               </div>
                               {player.injury && (
                                 <div className="px-1.5 pt-1 border-t border-black/5 space-y-1">
                                   <div className="flex justify-between items-center">
                                     <span className="text-[7px] font-black text-red-700 uppercase">Lesión</span>
                                     <span className="text-[8px] font-black text-red-700 truncate ml-1">{player.injury.type} (~{player.injury.daysLeft}d)</span>
                                   </div>
                                   <div className="flex gap-1">
                                     {player.injury.treatment === 'NONE' ? (
                                       <>
                                         <button onClick={() => { world.setInjuryTreatment(player.id, 'CONSERVATIVE', currentDate); notifyAll(); showToast('Tratamiento conservador aplicado. Recuperación más lenta pero segura.', 'info'); }} className="flex-1 text-[7px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-sm font-bold cursor-pointer">Conservador</button>
                                         <button onClick={() => { world.setInjuryTreatment(player.id, 'AGGRESSIVE', currentDate); notifyAll(); showToast('Tratamiento agresivo aplicado. Vuelve antes pero con riesgo.', 'warning'); }} className="flex-1 text-[7px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-sm font-bold cursor-pointer">Agresivo</button>
                                       </>
                                     ) : (
                                       <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-sm ${player.injury.treatment === 'CONSERVATIVE' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                                         {player.injury.treatment === 'CONSERVATIVE' ? '🛡️ Conservador' : '⚡ Agresivo'}
                                       </span>
                                     )}
                                   </div>
                                 </div>
                               )}
                            </div>
                         </div>
                      </div>
                    </div>
                </div>
             )}

             {activeTab === 'PERSONAL' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-y-auto p-2">
                   <FMBox title="Información Biográfica">
                      <div className="space-y-2 p-2 bg-white">
                         <div className="flex items-center justify-between border-b pb-1"><div className="flex items-center gap-2 text-slate-500"><Cake size={14}/> <span className="text-[10px] font-black uppercase">Nacimiento</span></div><span className="text-xs font-bold">{player.birthDate.toLocaleDateString()} ({player.age} años)</span></div>
                         <div className="flex items-center justify-between border-b pb-1"><div className="flex items-center gap-2 text-slate-500"><Ruler size={14}/> <span className="text-[10px] font-black uppercase">Altura</span></div><span className="text-xs font-bold">{player.height} cm</span></div>
                         <div className="flex items-center justify-between border-b pb-1"><div className="flex items-center gap-2 text-slate-500"><Weight size={14}/> <span className="text-[10px] font-black uppercase">Peso</span></div><span className="text-xs font-bold">{player.weight} kg</span></div>
                         <div className="flex flex-col border-b pb-2"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-slate-500"><UserCircle size={14}/> <span className="text-[10px] font-black uppercase">Personalidad</span></div><span className="text-xs font-bold text-blue-800">{personalityLabel}</span></div>{personalityDesc && <p className="text-[9px] text-slate-500 italic mt-1">{personalityDesc}</p>}</div>
                      </div>
                   </FMBox>
                   <FMBox title="Contrato e Importancia">
                      <div className="space-y-2 p-2 bg-white">
                         <div className="flex justify-between border-b pb-1">
                           <span className="text-[10px] font-black text-slate-500 uppercase">Club Actual</span>
                           {club ? (
                             <button
                               type="button"
                               onClick={() => openClubSquad(club.id, world.clubs)}
                               className="text-xs font-black text-[#1f5922] hover:underline cursor-pointer"
                             >
                               {club.name}
                             </button>
                           ) : (
                             <span className="text-xs font-black">Agente Libre</span>
                           )}
                         </div>
                         <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-black text-slate-500 uppercase">Sueldo Mensual</span><span className="text-xs font-black text-blue-900">£{player.salary.toLocaleString()}</span></div>
                         <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-black text-slate-500 uppercase">Vencimiento</span><span className="text-xs font-bold">{player.contractExpiry.toLocaleDateString()}</span></div>
                         <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-black text-slate-500 uppercase">Valor Estimado</span><span className="text-xs font-black text-green-700">£{player.value.toLocaleString()}</span></div>
                        {player.releaseClause && <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-black text-slate-500 uppercase">Cláusula</span><span className="text-xs font-black text-amber-700">£{player.releaseClause.toLocaleString()}</span></div>}
                      </div>
                   </FMBox>
                </div>
             )}

             {activeTab === 'POSITIONS' && (
                <div className="flex flex-col items-center justify-center h-full min-h-[320px] p-2 overflow-hidden gap-2">
                   <div className="flex-1 min-h-[260px] w-full flex items-center justify-center">
                      <div className="relative h-full min-h-[260px] max-h-[420px] max-w-full aspect-[68/105] shadow-xl bg-[#1e3a29] border-[3px] border-[#a0b0a0] rounded-sm overflow-hidden">
                         <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-35">
                            <g fill="none" stroke="white" strokeWidth="0.7">
                               <rect x="2" y="2" width="96" height="96" />
                               <line x1="2" y1="50" x2="98" y2="50" />
                               <circle cx="50" cy="50" r="10" />
                               <rect x="25" y="2" width="50" height="15" />
                               <rect x="25" y="83" width="50" height="15" />
                            </g>
                         </svg>

                         {/* Marcadores de posiciones */}
                         {player.positions.map(pos => {
                           const coords = POSITION_COORDS[pos] || { x: 50, y: 50 };
                           return (
                             <div key={pos} className="absolute w-5 h-5 sm:w-6 sm:h-6 -ml-2.5 -mt-2.5 sm:-ml-3 sm:-mt-3 flex items-center justify-center" style={{ left: `${coords.x}%`, top: `${coords.y}%` }}>
                               <div className="w-full h-full bg-green-500 rounded-full border-2 border-white shadow-lg"></div>
                               <span className="absolute -bottom-3.5 text-[7px] font-black text-white bg-black/75 px-1 rounded uppercase whitespace-nowrap">{pos}</span>
                             </div>
                           );
                         })}
                         {player.secondaryPositions?.map(pos => {
                           const coords = POSITION_COORDS[pos] || { x: 50, y: 50 };
                           return (
                             <div key={pos} className="absolute w-4 h-4 sm:w-5 sm:h-5 -ml-2 -mt-2 sm:-ml-2.5 sm:-mt-2.5 flex items-center justify-center" style={{ left: `${coords.x}%`, top: `${coords.y}%` }}>
                               <div className="w-full h-full bg-yellow-400 rounded-full border border-white opacity-90 shadow-md"></div>
                               <span className="absolute -bottom-3 text-[6px] font-black text-white bg-black/60 px-0.5 rounded uppercase whitespace-nowrap">{pos}</span>
                             </div>
                           );
                         })}
                      </div>
                   </div>
                   <div className="shrink-0 flex items-center gap-4 text-[8.5px] font-black uppercase bg-white/80 px-3 py-1 rounded-sm border border-[#a0b0a0]">
                      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-green-500 rounded-full border border-white shadow-xs"></div> Natural ({player.positions.join(', ')})</div>
                      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-yellow-400 rounded-full border border-white shadow-xs"></div> Eficaz</div>
                   </div>
                </div>
             )}

             {activeTab === 'HISTORY' && (() => {
                world.ensurePlayerPastHistory(player);
                const sortedHistory = [...(player.history || [])].sort((a, b) => b.year - a.year);
                const clubsPlayed = player.careerStats?.clubsPlayedFor || [];
                return (
                <div className="h-full overflow-hidden p-1.5 flex flex-col gap-1.5">
                   {player.careerStats && (player.careerStats.totalApps > 0 || clubsPlayed.length > 0) && (
                     <FMBox title="Resumen de Carrera" className="shrink-0" noPadding>
                       <div className="p-2 bg-white">
                         <div className="grid grid-cols-4 gap-1.5 text-center text-[9.5px]">
                           <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm py-1"><span className="font-black text-slate-900 block font-mono">{player.careerStats.totalApps}</span><span className="text-[7.5px] font-bold uppercase text-slate-500">Partidos</span></div>
                           <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm py-1"><span className="font-black text-green-700 block font-mono">{player.careerStats.totalGoals}</span><span className="text-[7.5px] font-bold uppercase text-slate-500">Goles</span></div>
                           <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm py-1"><span className="font-black text-blue-700 block font-mono">{player.careerStats.totalAssists}</span><span className="text-[7.5px] font-bold uppercase text-slate-500">Asist.</span></div>
                           <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm py-1"><span className="font-black text-slate-900 block font-mono">{player.careerStats.totalCleanSheets}</span><span className="text-[7.5px] font-bold uppercase text-slate-500">Vallas</span></div>
                         </div>
                         {clubsPlayed.length > 0 && (
                           <div className="mt-1.5 text-[8.5px] font-bold text-slate-500 flex items-center gap-1 flex-wrap leading-relaxed">
                             <span>Clubes ({clubsPlayed.length}):</span>
                             {clubsPlayed.map((id, idx) => {
                               const c = world.getClub(id);
                               return (
                                 <React.Fragment key={`${id}_${idx}`}>
                                   {idx > 0 && <span>·</span>}
                                   {c ? (
                                     <button
                                       type="button"
                                       onClick={() => openClubSquad(c.id, world.clubs)}
                                       className="text-[#1f5922] hover:underline cursor-pointer"
                                     >
                                       {c.name}
                                     </button>
                                   ) : (
                                     <span>{id}</span>
                                   )}
                                 </React.Fragment>
                               );
                             })}
                           </div>
                         )}
                       </div>
                     </FMBox>
                   )}
                   <FMBox title={`Historial por Temporada (${sortedHistory.length})`} className="flex-1 min-h-0 overflow-hidden" noPadding>
                       <FMTable headers={['Año', 'Club', 'PJ', 'G', 'A', 'Cal']} colWidths={["46px", "auto", "30px", "26px", "26px", "36px"]}>
                          {sortedHistory.length > 0 ? sortedHistory.map((h, i) => {
                            const histClub = world.getClub(h.clubId);
                            return (
                              <tr key={`${h.year}_${h.clubId}_${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#f2f7f2]"}>
                                <FMTableCell className="font-mono text-slate-500 text-[10px] px-1.5">{h.year}</FMTableCell>
                                <FMTableCell className="font-bold text-[10px] px-1.5">
                                  {histClub ? (
                                    <button
                                      type="button"
                                      onClick={() => openClubSquad(histClub.id, world.clubs)}
                                      className="text-slate-900 hover:text-[#1f5922] hover:underline cursor-pointer text-left leading-tight"
                                    >
                                      {histClub.name}
                                    </button>
                                  ) : (
                                    <span>{h.clubId || 'Club'}</span>
                                  )}
                                </FMTableCell>
                                <FMTableCell className="text-center text-[10px] px-1" isNumber>{h.stats.appearances}</FMTableCell>
                                <FMTableCell className="text-center text-[10px] px-1" isNumber>{h.stats.goals}</FMTableCell>
                                <FMTableCell className="text-center text-[10px] px-1" isNumber>{h.stats.assists}</FMTableCell>
                                <FMTableCell className="text-center font-bold text-blue-800 text-[10px] px-1" isNumber>{(h.stats.totalRating / (h.stats.appearances || 1)).toFixed(1)}</FMTableCell>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={6} className="p-6 text-center text-slate-400 italic text-[10px] uppercase font-black">Canterano sin historial senior previo</td></tr>
                          )}
                       </FMTable>
                   </FMBox>
                </div>
                );
             })()}

             {activeTab === 'CONTRACT' && (
                <div className="max-w-2xl mx-auto space-y-4 md:space-y-6 pt-4 w-full overflow-y-auto px-2">
                   <FMBox title="Detalles del Contrato">
                      <div className="p-3 md:p-4 bg-white space-y-3 md:space-y-4">
                         <div className="flex justify-between border-b pb-2"><span className="text-[10px] font-black text-slate-400 uppercase">Valor estimado</span><span className="text-lg md:text-xl font-black text-slate-900">£{player.value.toLocaleString()}</span></div>
                         <div className="flex justify-between border-b pb-2"><span className="text-[10px] font-black text-slate-400 uppercase">Sueldo mensual</span><span className="text-lg md:text-xl font-black text-blue-900">£{player.salary.toLocaleString()}</span></div>
                         <div className="flex justify-between border-b pb-2"><span className="text-[10px] font-black text-slate-400 uppercase">Vencimiento</span><span className="text-sm font-bold text-slate-700">{player.contractExpiry.toLocaleDateString()}</span></div>
                         <div className="flex justify-between border-b pb-2"><span className="text-[10px] font-black text-slate-400 uppercase">Estado Transferencia</span><span className="text-xs font-black text-orange-600 uppercase">{player.transferStatus === 'TRANSFERABLE' ? 'Transferible' : player.transferStatus === 'LOANABLE' ? 'Cedible' : 'Indiscutible'}</span></div>
                      </div>
                   </FMBox>
                   {isUserPlayer && (
                      <div className="grid grid-cols-2 gap-2">
                         <FMButton variant="primary" onClick={() => setShowRenewalModal(true)}>Renovar Contrato</FMButton>
                         <FMButton variant="danger" onClick={handleRescind}>Rescindir</FMButton>
                      </div>
                   )}
                   {!isUserPlayer && userClubId && (
                      <FMBox title="Carpeta de refuerzos">
                         <div className="p-3 bg-white">
                            <p className="text-[10px] font-bold text-slate-600 mb-2">¿Quieres que la directiva evalúe su fichaje? Pónelo en la carpeta y el director deportivo lo estudiará junto a sus candidatos.</p>
                            <FMButton variant={isInFolder ? 'secondary' : 'primary'} onClick={handlePonerEnCarpeta} className="w-full py-2 text-[10px]">
                               {isInFolder ? <FolderMinus size={12} /> : <FolderPlus size={12} />}
                               {isInFolder ? 'Quitar de la carpeta' : 'Poner en carpeta'}
                            </FMButton>
                         </div>
                      </FMBox>
                   )}
                </div>
             )}

               {activeTab === 'INTERACTION' && (
                 <div className="flex-1 h-full flex flex-col min-h-0">
                   <PlayerChatPanel
                     player={player}
                     clubId={userClubId || ''}
                     currentDate={currentDate}
                   />
                 </div>
               )}
          </div>
        </div>
      </div>
      {showRenewalModal && (
        <ContractNegotiationModal
          player={player}
          userClubId={userClubId}
          currentDate={currentDate}
          onClose={() => setShowRenewalModal(false)}
          onRenewed={() => {
            markContractPromiseFulfilled(player, currentDate);
            setShowRenewalModal(false);
          }}
        />
      )}
    </>
  );
};
