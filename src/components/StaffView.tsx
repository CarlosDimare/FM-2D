
import React, { useState } from 'react';
import { Staff, Club, STAFF_ATTRIBUTE_LABELS } from '../types';
import { world } from '../services/worldManager';
import { notifyClubs, useWorldStore } from '../stores/worldStore';
import { useUIStore } from '../stores/uiStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { getAttributeColor } from '../constants';
import { getFlagUrl } from '../data/static';
import { ArrowLeft, Activity, History, Wallet, BookOpen, Trophy, Star, Shield, Zap, Swords, MapPin, Users, ClipboardList, Dumbbell, Mic, MessageCircle, GraduationCap, Binoculars, HeartPulse } from 'lucide-react';
import { FMBox, FMTable, FMTableCell, FMButton } from './FMUI';

const TACTICAL_STYLE_LABELS: Record<string, string> = {
  CONTROL: 'Control',
  ATTACK: 'Ataque',
  DEFENSE: 'Defensa',
  COUNTER: 'Contraataque',
  BALANCED: 'Equilibrado',
};

const PRESS_LABELS: Record<string, string> = {
  LOW: 'Presión baja',
  MEDIUM: 'Presión media',
  HIGH: 'Presión alta',
};

const POSSESSION_LABELS: Record<string, string> = {
  POSSESSION: 'Posesión',
  COUNTER: 'Contraataque',
  BALANCED: 'Equilibrado',
};

const PERSONALITY_LABELS: Record<string, string> = {
  VISIONARY: 'Visionario',
  CALM: 'Calmado',
  PASSIONATE: 'Pasional',
  DISCIPLINARIAN: 'Disciplinado',
  LEADER: 'Líder',
};

const getRoleShort = (role: string) => {
  switch(role) {
    case 'HEAD_COACH': return 'DT';
    case 'ASSISTANT_MANAGER': return 'AYDT';
    case 'PHYSIO': return 'FISIO';
    case 'FITNESS_COACH': return 'PF';
    case 'RESERVE_MANAGER': return 'RESERVA';
    case 'YOUTH_MANAGER': return 'SUB-20';
    case 'SCOUT': return 'OJEADOR';
    case 'SPORTING_DIRECTOR': return 'DD';
    case 'TREASURER': return 'TES';
    default: return role;
  }
};

function generateProfileText(staff: Staff): string {
  const parts: string[] = [];
  const attrs = staff.attributes;
  const maxAttr = Math.max(
    attrs.coaching, attrs.tacticalKnowledge, attrs.manManagement,
    attrs.motivation, attrs.judgingAbility, attrs.judgingPotential,
    attrs.adaptability, attrs.medical, attrs.physiotherapy
  );

  if (staff.biography) {
    parts.push(staff.biography);
  } else {
    if (attrs.coaching >= 15) parts.push('Destaca por su excepcional capacidad de entrenamiento.');
    else if (attrs.coaching >= 12) parts.push('Tiene un buen nivel de entrenamiento.');

    if (attrs.tacticalKnowledge >= 15) parts.push('Su conocimiento táctico es de primer nivel, prepara cada partido al detalle.');
    else if (attrs.tacticalKnowledge >= 10) parts.push('Maneja conceptos tácticos con solidez.');

    if (attrs.manManagement >= 15) parts.push('Excelente gestionando el vestuario y las relaciones con los jugadores.');
    else if (attrs.manManagement >= 10) parts.push('Sabe mantener la disciplina del grupo.');

    if (attrs.motivation >= 15) parts.push('Es un motivador nato que levanta el ánimo del equipo.');
    else if (attrs.motivation >= 10) parts.push('Sabe motivar al equipo en momentos clave.');

    if (attrs.judgingAbility >= 15) parts.push('Tiene un ojo clínico para detectar talento.');
    if (attrs.judgingPotential >= 15) parts.push('Especialista en evaluar el potencial de los jóvenes.');

    if (maxAttr <= 8) parts.push('Es un profesional de nivel medio que cumple con su rol.');
  }

  if (staff.preferredFormation) {
    parts.push(`Su sistema preferido es el ${staff.preferredFormation}.`);
  }

  if (staff.playingStyle) {
    parts.push(`Su estilo: ${staff.playingStyle}.`);
  }

  if (staff.personality) {
    const persona = ['Es un técnico', PERSONALITY_LABELS[staff.personality] || staff.personality];
    const flourish: Record<string, string> = {
      VISIONARY: 'con ideas innovadoras y vanguardistas.',
      CALM: 'que mantiene la calma ante cualquier situación.',
      PASSIONATE: 'que transmite energía y entusiasmo a sus equipos.',
      DISCIPLINARIAN: 'exigente y meticuloso con la disciplina táctica.',
      LEADER: 'un líder natural que inspira respeto y admiración.',
    };
    parts.push(`Es un técnico ${PERSONALITY_LABELS[staff.personality] || staff.personality}${flourish[staff.personality] ? `, ${flourish[staff.personality]}` : '.'}`);
  }

  return parts.join(' ');
}

interface StaffViewProps {
  staff: Staff[];
  club?: Club;
}

export const StaffView: React.FC<StaffViewProps> = ({ staff: staffProp, club }) => {
  const { selectedStaff, setSelectedStaff } = useUIStore();
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'DELEGACION'>('PERSONAL');
  const clubs = useWorldStore(s => s.clubs);
  const liveClub = clubs.find(c => c.id === club?.id) || club;

  // Ensure existing saves also get a Treasurer in the club staff
  if (liveClub) {
    world.ensureClubTreasurer(liveClub.id);
  }
  const staff = liveClub ? world.getStaffByClub(liveClub.id) : staffProp;

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'HEAD_COACH': return 'Director Técnico';
      case 'ASSISTANT_MANAGER': return 'Segundo Entrenador';
      case 'PHYSIO': return 'Fisioterapeuta';
      case 'FITNESS_COACH': return 'Preparador Físico';
      case 'RESERVE_MANAGER': return 'E. Reserva';
      case 'YOUTH_MANAGER': return 'E. Juveniles';
      case 'SCOUT': return 'Ojeador Jefe';
      case 'SPORTING_DIRECTOR': return 'Director Deportivo';
      case 'TREASURER': return 'Tesorero';
      default: return role;
    }
  };

  // Sort staff to show Head Coach first
  const sortedStaff = [...staff].sort((a, b) => {
     if (a.role === 'HEAD_COACH') return -1;
     if (b.role === 'HEAD_COACH') return 1;
     return 0;
  });

  const DELEGABLE_TASKS: { key: 'trainingDelegatedTo' | 'pressDelegatedTo' | 'talksDelegatedTo' | 'reserveDelegatedTo' | 'u20DelegatedTo' | 'scoutingDelegatedTo' | 'financeDelegatedTo'; label: string; icon: React.ReactNode; suggestedRoles: string[] }[] = [
    { key: 'trainingDelegatedTo', label: 'Entrenamiento', icon: <Dumbbell size={12} />, suggestedRoles: ['FITNESS_COACH', 'ASSISTANT_MANAGER', 'HEAD_COACH'] },
    { key: 'pressDelegatedTo', label: 'Prensa', icon: <Mic size={12} />, suggestedRoles: ['ASSISTANT_MANAGER', 'HEAD_COACH'] },
    { key: 'talksDelegatedTo', label: 'Charlas', icon: <MessageCircle size={12} />, suggestedRoles: ['ASSISTANT_MANAGER', 'HEAD_COACH'] },
    { key: 'reserveDelegatedTo', label: 'Reserva', icon: <Users size={12} />, suggestedRoles: ['RESERVE_MANAGER', 'ASSISTANT_MANAGER'] },
    { key: 'u20DelegatedTo', label: 'Sub-20', icon: <GraduationCap size={12} />, suggestedRoles: ['YOUTH_MANAGER', 'ASSISTANT_MANAGER'] },
    { key: 'scoutingDelegatedTo', label: 'Scouting', icon: <Binoculars size={12} />, suggestedRoles: ['SCOUT', 'SPORTING_DIRECTOR', 'ASSISTANT_MANAGER'] },
    { key: 'financeDelegatedTo', label: 'Finanzas', icon: <Wallet size={12} />, suggestedRoles: ['TREASURER', 'SPORTING_DIRECTOR'] },
  ];

  const setDelegation = (key: string, staffId: string | undefined) => {
    if (!liveClub) return;
    if (staffId) liveClub[key as 'trainingDelegatedTo'] = staffId;
    else delete liveClub[key as 'trainingDelegatedTo'];
    notifyClubs();
  };

  const delegateAllRecommended = () => {
    if (!liveClub) return;
    DELEGABLE_TASKS.forEach(task => {
      const best = staff.find(s => task.suggestedRoles.includes(s.role));
      if (best) liveClub[task.key] = best.id;
    });
    notifyClubs();
  };

  const takeAllControl = () => {
    if (!liveClub) return;
    DELEGABLE_TASKS.forEach(task => {
      delete liveClub[task.key];
    });
    notifyClubs();
  };

  const getDelegationBadges = (s: Staff) => {
    if (!liveClub) return [];
    return [
      liveClub.trainingDelegatedTo === s.id && 'Entreno',
      liveClub.pressDelegatedTo === s.id && 'Prensa',
      liveClub.talksDelegatedTo === s.id && 'Charlas',
      liveClub.reserveDelegatedTo === s.id && 'Reserva',
      liveClub.u20DelegatedTo === s.id && 'Sub-20',
      liveClub.scoutingDelegatedTo === s.id && 'Scouting',
      liveClub.financeDelegatedTo === s.id && 'Finanzas',
    ].filter(Boolean) as string[];
  };

  const renderDelegationTab = () => (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
      {!liveClub ? (
        <div className="p-8 text-center text-slate-500 font-black uppercase text-[10px]">Selecciona un club para gestionar delegaciones</div>
      ) : (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 bg-[#e8ece8] border border-[#a0b0a0] rounded-sm px-2.5 py-1.5">
            <span className="text-[9px] font-black uppercase text-slate-700 truncate">Elegí quién se ocupa de cada área</span>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={delegateAllRecommended}
                className="px-2 py-1 text-[8px] font-black uppercase rounded-[2px] bg-[#2b5d2c] text-white border border-[#133014] cursor-pointer"
              >
                Delegar Todo
              </button>
              <button
                type="button"
                onClick={takeAllControl}
                className="px-2 py-1 text-[8px] font-black uppercase rounded-[2px] bg-white text-slate-700 border border-[#8e9b90] cursor-pointer"
              >
                Todo Yo
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1.5 content-start overflow-y-auto custom-scroll">
            {DELEGABLE_TASKS.map(task => {
              const delegatedId = liveClub[task.key] || '';
              const candidates = staff.filter(s => task.suggestedRoles.includes(s.role));
              return (
                <div key={task.key} className="bg-white border border-[#a0b0a0] rounded-sm px-2.5 py-1.5 flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-sm flex items-center justify-center shrink-0 border ${delegatedId ? 'bg-green-100 border-green-400 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                      {task.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase text-slate-900 truncate leading-tight">{task.label}</div>
                      <div className={`text-[7.5px] font-bold uppercase ${delegatedId ? 'text-green-700' : 'text-amber-700'}`}>
                        {delegatedId ? 'Delegada' : 'A tu cargo'}
                      </div>
                    </div>
                  </div>
                  <select
                    value={delegatedId}
                    onChange={(e) => setDelegation(task.key, e.target.value || undefined)}
                    aria-label={`Responsable de ${task.label}`}
                    className="max-w-[155px] sm:max-w-[190px] bg-gradient-to-b from-[#f3f4f6] to-[#d4d8de] border border-[#737a82] rounded-[2px] px-1.5 py-1 text-[9px] font-black uppercase text-[#1f2428] outline-none cursor-pointer"
                  >
                    <option value="">Tú (Manager)</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({getRoleShort(c.role)})</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  if (selectedStaff) {
    const badges = getDelegationBadges(selectedStaff);
    return (
      <div className="p-2 md:p-3 h-full flex flex-col gap-2 bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
        <div className="shrink-0 flex items-center justify-between gap-2 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-2.5 py-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setSelectedStaff(null)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border border-[#5f666e] text-[10px] font-black uppercase text-[#1f2428] cursor-pointer active:translate-y-px"
            style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 50%, #b9bfc6 100%)' }}
          >
            <ArrowLeft size={12} /> Cuerpo Técnico
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <img
              src={getFlagUrl(selectedStaff.nationality)}
              alt={selectedStaff.nationality}
              className="w-4 h-3 object-cover rounded-[1px] border border-slate-400 shrink-0"
            />
            <span className="text-[9.5px] font-black uppercase text-slate-700 truncate">
              {getRoleLabel(selectedStaff.role)} · {selectedStaff.age} años
            </span>
          </div>
          {selectedStaff.role === 'FITNESS_COACH' && liveClub && (
            <FMButton
              onClick={() => useDialogueStore.getState().open('FITNESS', { clubId: liveClub.id, source: 'STAFF' })}
              className="shrink-0 px-2.5 py-1 text-[9px]"
            >
              <HeartPulse size={11} /> Plan físico
            </FMButton>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll space-y-2.5 pr-0.5">
          {/* Resumen rápido + Delegaciones */}
          <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 sm:p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
              <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen size={12} /> Perfil Profesional
              </h4>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {badges.map(b => (
                    <span key={b} className="px-1.5 py-0.5 bg-green-100 border border-green-400 rounded-[2px] text-green-800 text-[7.5px] font-black uppercase">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-700 leading-relaxed">
              {generateProfileText(selectedStaff)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Atributos Clave */}
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 sm:p-3 shadow-xs">
              <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                <Activity size={12} /> Atributos Clave
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-x-4">
                {Object.entries(selectedStaff.attributes).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600 font-bold text-[10px] uppercase tracking-tight">
                      {STAFF_ATTRIBUTE_LABELS[key] || key}
                    </span>
                    <span className={`font-black text-[11px] ${getAttributeColor(val as number)} bg-slate-50 px-1.5 py-0.5 rounded-sm min-w-[24px] text-center font-mono`}>
                      {val as number}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: Contrato, Reputación, Perfil Táctico e Historial */}
            <div className="space-y-2.5">
              {/* Contrato y Reputación */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs space-y-1.5">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Wallet size={11} /> Contrato
                  </h4>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Sueldo</span>
                    <span className="text-slate-900 font-black text-[11px] font-mono">£{selectedStaff.salary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Expira</span>
                    <span className="text-slate-900 font-black text-[10px] font-mono">
                      {selectedStaff.contractExpiry ? selectedStaff.contractExpiry.toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs space-y-1.5">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Star size={11} /> Reputación
                  </h4>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Nacional</span>
                    <span className="text-slate-900 font-black text-[11px] font-mono">{selectedStaff.reputation ?? 50}/100</span>
                  </div>
                  {selectedStaff.boardRelationship != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Directiva</span>
                      <span className="text-slate-900 font-black text-[11px] font-mono">{selectedStaff.boardRelationship}/100</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Perfil Táctico */}
              {(selectedStaff.preferredFormation || selectedStaff.tacticalStyle || selectedStaff.pressIntensity || selectedStaff.possessionVsCounter) && (
                <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs">
                  <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 border-b border-slate-200 pb-1">
                    <Shield size={12} /> Perfil Táctico
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {selectedStaff.preferredFormation && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Formación</span>
                        <span className="text-[11px] text-slate-900 font-black">{selectedStaff.preferredFormation}</span>
                      </div>
                    )}
                    {selectedStaff.tacticalStyle && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-0.5"><Swords size={10} /> Estilo</span>
                        <span className="text-[11px] text-slate-900 font-black">{TACTICAL_STYLE_LABELS[selectedStaff.tacticalStyle] || selectedStaff.tacticalStyle}</span>
                      </div>
                    )}
                    {selectedStaff.pressIntensity && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-0.5"><Zap size={10} /> Presión</span>
                        <span className="text-[11px] text-slate-900 font-black">{PRESS_LABELS[selectedStaff.pressIntensity] || selectedStaff.pressIntensity}</span>
                      </div>
                    )}
                    {selectedStaff.possessionVsCounter && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Enfoque</span>
                        <span className="text-[11px] text-slate-900 font-black">{POSSESSION_LABELS[selectedStaff.possessionVsCounter] || selectedStaff.possessionVsCounter}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Historial */}
              <div className="bg-white border border-[#a0b0a0] rounded-sm overflow-hidden shadow-xs">
                <div className="px-2.5 py-1.5 bg-[#f2f7f2] border-b border-slate-200">
                  <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <History size={12} /> Historial
                  </h4>
                </div>
                <FMTable headers={['Año', 'Club', 'Rol']} colWidths={['50px', 'auto', 'auto']}>
                  {selectedStaff.history && selectedStaff.history.length > 0 ? (
                    selectedStaff.history.map((h, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <FMTableCell className="text-slate-500 font-mono">{h.year}</FMTableCell>
                        <FMTableCell className="text-slate-900 font-bold">{world.getClub(h.clubId)?.name || 'Desconocido'}</FMTableCell>
                        <FMTableCell className="text-slate-500 text-[9px] uppercase">{getRoleLabel(h.role)}</FMTableCell>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={3} className="p-3 text-center text-slate-400 italic text-[10px]">Sin historial previo</td></tr>
                  )}
                </FMTable>
              </div>
            </div>
          </div>

          {/* Palmarés */}
          {selectedStaff.careerHonours && selectedStaff.careerHonours.length > 0 && (
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs">
              <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
                <Trophy size={12} /> Palmarés
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedStaff.careerHonours.map((honour, i) => (
                  <span key={i} className="px-2 py-1 bg-amber-50 border border-amber-300 rounded-sm text-amber-900 font-bold text-[10px] uppercase">
                    {honour}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Clubes Anteriores */}
          {selectedStaff.previousClubs && selectedStaff.previousClubs.length > 0 && (
            <div className="bg-white border border-[#a0b0a0] rounded-sm overflow-hidden shadow-xs">
              <div className="px-2.5 py-1.5 bg-[#f2f7f2] border-b border-slate-200">
                <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin size={12} /> Clubes Anteriores
                </h4>
              </div>
              {selectedStaff.previousClubs.map((prev, i) => (
                <div key={i} className="px-2.5 py-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-900 font-black text-xs">{prev.clubName}</span>
                    <span className="text-slate-500 text-[10px] font-mono">{prev.years}</span>
                  </div>
                  {prev.titles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prev.titles.map((t, j) => (
                        <span key={j} className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-sm text-amber-800 font-bold text-[8.5px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-3 h-full flex flex-col gap-2 bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <header className="shrink-0 flex items-center justify-between gap-2 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-2.5 py-1.5 shadow-xs">
        <div className="min-w-0">
          <h2 className="text-xs sm:text-base font-black text-slate-900 uppercase italic tracking-tight truncate">Cuerpo Técnico ({sortedStaff.length})</h2>
        </div>
        <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shrink-0 shadow-xs">
          <button type="button" onClick={() => setActiveTab('PERSONAL')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-[1px] transition-all flex items-center gap-1 cursor-pointer ${activeTab === 'PERSONAL' ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-black/5'}`}>
            <Users size={11} /> Personal
          </button>
          <button type="button" onClick={() => setActiveTab('DELEGACION')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-[1px] transition-all flex items-center gap-1 cursor-pointer ${activeTab === 'DELEGACION' ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-black/5'}`}>
            <ClipboardList size={11} /> Delegación
          </button>
        </div>
      </header>

      {activeTab === 'PERSONAL' ? (
      <div className="flex-1 min-h-0 overflow-hidden">
        <FMBox title={`Plantel de Empleados (${sortedStaff.length})`} className="h-full" noPadding>
          {/* Desktop Table View */}
          <div className="hidden md:block h-full overflow-y-auto">
            <FMTable
              headers={['Rol', 'Nombre', 'Edad', 'Nacionalidad', 'Rep', 'Sueldo', 'Delegaciones']}
              colWidths={['70px', 'auto', '40px', '90px', '40px', '70px', '150px']}
            >
              {sortedStaff.map((s, idx) => {
                const badges = getDelegationBadges(s);
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedStaff(s)}
                    className={`cursor-pointer transition-colors border-b border-[#e0e0e0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${s.role === 'HEAD_COACH' ? 'font-bold' : ''}`}
                  >
                    <FMTableCell className="text-center text-slate-700 font-bold">{getRoleShort(s.role)}</FMTableCell>
                    <FMTableCell className="text-slate-900">
                      <div className="flex items-center min-w-0">
                        <img src={getFlagUrl(s.nationality)} alt={s.nationality} className="w-4 h-3 object-cover shadow-sm rounded-[1px] mr-2 shrink-0 border border-slate-300" />
                        <span className="truncate">{s.name}</span>
                        {s.role === 'HEAD_COACH' && s.reputation && (
                          <span className="ml-2 flex items-center gap-0.5 text-amber-700 shrink-0"><Star size={10} className="fill-amber-500" /> {s.reputation}</span>
                        )}
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center font-bold" isNumber>{s.age}</FMTableCell>
                    <FMTableCell className="text-slate-500 text-[10px]">{s.nationality}</FMTableCell>
                    <FMTableCell className="text-center font-bold" isNumber>{s.reputation ?? '-'}</FMTableCell>
                    <FMTableCell className="text-right font-bold" isNumber>£{(s.salary / 1000).toFixed(0)}k</FMTableCell>
                    <FMTableCell>
                      <div className="flex flex-wrap gap-1">
                        {badges.length > 0 ? badges.map(b => (
                          <span key={b} className="px-1.5 py-0.5 bg-green-100 border border-green-400 rounded-sm text-green-800 text-[8px] font-black uppercase whitespace-nowrap">{b}</span>
                        )) : <span className="text-slate-300 text-[9px]">—</span>}
                      </div>
                    </FMTableCell>
                  </tr>
                );
              })}
            </FMTable>
          </div>

          {/* Mobile Compact Table View (all 9 roles fit cleanly without scrolling) */}
          <div className="md:hidden h-full overflow-y-auto">
            <FMTable
              headers={['Rol', 'Nombre', 'Edad', 'Tareas']}
              colWidths={['50px', 'auto', '32px', '92px']}
            >
              {sortedStaff.map((s, idx) => {
                const badges = getDelegationBadges(s);
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedStaff(s)}
                    className={`cursor-pointer transition-colors border-b border-[#e0e0e0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${s.role === 'HEAD_COACH' ? 'font-bold' : ''}`}
                  >
                    <FMTableCell className="text-center text-slate-700 font-black text-[8.5px] px-1 py-1">{getRoleShort(s.role)}</FMTableCell>
                    <FMTableCell className="text-slate-900 px-1.5 py-1">
                      <div className="flex items-center min-w-0">
                        <img src={getFlagUrl(s.nationality)} alt={s.nationality} className="w-3 h-2 object-cover rounded-[1px] mr-1 shrink-0 border border-slate-300" />
                        <span className="truncate max-w-[120px] text-[9.5px] font-bold">{s.name}</span>
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center font-bold text-[9.5px] px-1 py-1" isNumber>{s.age}</FMTableCell>
                    <FMTableCell className="px-1 py-1">
                      <div className="flex flex-wrap gap-0.5">
                        {badges.length > 0 ? badges.map(b => (
                          <span key={b} className="px-1 py-0.5 bg-green-100 border border-green-400 rounded-[1px] text-green-800 text-[6.5px] font-black uppercase whitespace-nowrap">{b}</span>
                        )) : <span className="text-slate-300 text-[8px]">—</span>}
                      </div>
                    </FMTableCell>
                  </tr>
                );
              })}
            </FMTable>
          </div>
        </FMBox>
      </div>
      ) : renderDelegationTab()}
    </div>
  );
};
