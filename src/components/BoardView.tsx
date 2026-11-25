import React, { useState } from 'react';
import { Club } from '../types';
import { world } from '../services/worldManager';
import { notifyAll, useWorldStore } from '../stores/worldStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { getClubPresidentName } from './dialogs/PresidentDialog';
import { FMButton } from './FMUI';
import { Building2, Award, Target, TrendingUp, ShieldCheck, Users, ArrowUp, Megaphone, DollarSign, Briefcase, FolderPlus, Landmark } from 'lucide-react';

interface BoardViewProps {
  userClub: Club;
  currentDate: Date;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  WIN_LEAGUE: 'Ganar la Liga',
  TOP_4: 'Top 4 (Internacional)',
  WIN_CUP: 'Ganar la Copa',
  CUP_SEMIS: 'Semifinal de Copa',
  TOP_HALF: 'Mitad superior',
  AVOID_RELEGATION: 'Evitar el descenso',
};

type MeetingTopic = { id: string; label: string; icon: React.ReactNode };

const MEETING_TOPICS: MeetingTopic[] = [
  { id: 'FORM', label: 'Plantilla', icon: <Users size={11} /> },
  { id: 'OBJECTIVE', label: 'Objetivo', icon: <Target size={11} /> },
  { id: 'SUPPORT', label: 'Respaldo', icon: <ShieldCheck size={11} /> },
  { id: 'FUTURE', label: 'Proyecto', icon: <TrendingUp size={11} /> },
];

const Section: React.FC<{ title: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-[#e8ece8] border border-[#a0b0a0] rounded-sm shadow-sm flex flex-col min-h-0 overflow-hidden ${className}`}>
    <div className="border-b border-[#a0b0a0] px-2 py-0.5 sm:py-1 flex items-center justify-between gap-1 shrink-0" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
      <span className="text-[#1a1a1a] font-bold text-[8.5px] sm:text-[9px] tracking-tight uppercase truncate" style={{ fontFamily: 'Verdana, sans-serif' }}>{title}</span>
    </div>
    <div className="p-1.5 min-h-0">{children}</div>
  </div>
);

const MiniCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-slate-900' }) => (
  <div className="bg-white border border-slate-300 rounded-sm px-2 py-1">
    <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{label}</div>
    <div className={`font-black text-[10.5px] leading-tight truncate font-mono ${color}`}>{value}</div>
  </div>
);

export const BoardView: React.FC<BoardViewProps> = ({ userClub, currentDate }) => {
  const clubs = useWorldStore(s => s.clubs);
  const liveClub = clubs.find(c => c.id === userClub.id) || world.getClub(userClub.id) || userClub;
  const presidentName = getClubPresidentName(liveClub.id);

  const [mobileTab, setMobileTab] = useState<'REQUESTS' | 'BOARD'>('REQUESTS');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [objectiveDraft, setObjectiveDraft] = useState<string>(liveClub.seasonObjective || 'TOP_HALF');
  const [meetingLog, setMeetingLog] = useState<{ topic: string; response: string; tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' }[]>([]);

  const refreshClub = () => notifyAll();

  const handleUpgrade = (facility: 'training' | 'youth') => {
    const result = world.requestFacilityUpgrade(liveClub.id, facility, currentDate);
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    refreshClub();
  };

  const handleBudgetRequest = () => {
    const result = world.requestBudgetIncrease(liveClub.id, currentDate);
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    refreshClub();
  };

  const handleObjectiveSubmit = () => {
    const result = world.setSeasonObjective(liveClub.id, objectiveDraft as NonNullable<Club['seasonObjective']>, currentDate);
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    refreshClub();
  };

  const handleMeeting = (topic: MeetingTopic) => {
    const confidence = liveClub.boardConfidence;
    const tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = confidence >= 70 ? 'POSITIVE' : confidence >= 40 ? 'NEUTRAL' : 'NEGATIVE';
    let response = '';
    switch (topic.id) {
      case 'FORM':
        response = tone === 'POSITIVE'
          ? 'La junta confía en tu plantilla y te respaldará en el mercado.'
          : tone === 'NEUTRAL'
          ? 'La junta ve competente al equipo, pero pide más consistencia.'
          : 'La directiva cuestiona la competitividad de la plantilla actual.';
        break;
      case 'OBJECTIVE':
        response = tone === 'POSITIVE'
          ? 'La junta acepta debatir el objetivo contigo.'
          : tone === 'NEUTRAL'
          ? 'Escuchan tu propuesta, aunque los recursos son los que son.'
          : 'La junta rechaza revisar el objetivo: exigen cumplir lo pactado.';
        break;
      case 'SUPPORT':
        response = tone === 'POSITIVE'
          ? 'Te ratifican como el hombre del proyecto y te blindan ante la prensa.'
          : tone === 'NEUTRAL'
          ? 'Confirman su apoyo si los resultados acompañan.'
          : 'Dejan claro que el respaldo no es incondicional.';
        break;
      case 'FUTURE':
        response = tone === 'POSITIVE'
          ? 'Comparten tu visión: apuestan por un proyecto a 3 años.'
          : tone === 'NEUTRAL'
          ? 'Hablan de un plan de estabilidad sin sobresaltos.'
          : 'La directiva solo piensa en el corto plazo.';
        break;
    }
    setMeetingLog(prev => [{ topic: topic.label, response, tone }, ...prev].slice(0, 2));
    setFeedback(null);
  };

  const trainingCost = Math.round((liveClub.trainingFacilities + 1) * (liveClub.trainingFacilities + 1) * 50000);
  const youthCost = Math.round((liveClub.youthFacilities + 1) * (liveClub.youthFacilities + 1) * 50000);
  const requestedAmount = Math.round(liveClub.finances.transferBudget * 0.3);

  const confidenceColor = liveClub.boardConfidence >= 70 ? 'text-green-700' : liveClub.boardConfidence >= 40 ? 'text-amber-700' : 'text-red-700';
  const profile = world.managerProfile;
  const folderCount = (liveClub.transferFolderIds || []).length;

  return (
    <div className="p-1.5 sm:p-2 h-full flex flex-col gap-1.5 bg-[#d4dcd4] overflow-hidden">
      {/* Top Bar with President Character ALWAYS Visible at Top */}
      <header className="shrink-0 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1.5 bg-[#3a4a3a] rounded-sm text-white shrink-0"><Award size={14} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs sm:text-base font-black text-slate-900 uppercase italic tracking-tighter truncate leading-none" style={{ fontFamily: 'Verdana, sans-serif' }}>
                Directiva
              </h2>
              <span className={`font-black text-xs sm:text-sm ${confidenceColor}`}>
                {Math.round(liveClub.boardConfidence)}%
              </span>
              {folderCount > 0 && (
                <span className="hidden sm:inline-flex items-center gap-0.5 text-[7.5px] font-black uppercase px-1.5 py-0.5 rounded-sm border bg-amber-50 border-amber-300 text-amber-800">
                  <FolderPlus size={9} /> {folderCount}
                </span>
              )}
            </div>
            <p className="hidden sm:block text-slate-600 font-bold text-[8.5px] uppercase tracking-widest truncate">
              Junta de {liveClub.name} · Presidente: {presidentName}
            </p>
          </div>
        </div>
        <DialogueAvatar
          position="inline"
          clubColor={liveClub.primaryColor}
          cargo="Presidente"
          name={presidentName}
          badge={liveClub.boardConfidence < 45}
          onClick={() => useDialogueStore.getState().open('PRESIDENT', { clubId: liveClub.id, source: 'BOARD' })}
        />
      </header>

      {/* Compact Always-Visible Confidence Strip */}
      <div className="shrink-0 bg-white border border-[#a0b0a0] rounded-sm px-2 py-1 flex items-center gap-2">
        <span className="text-[8px] font-black uppercase text-slate-600 shrink-0">Confianza</span>
        <div className="flex-1 h-2.5 bg-slate-200 rounded-sm overflow-hidden border border-slate-400">
          <div
            className={`h-full transition-all ${liveClub.boardConfidence >= 70 ? 'bg-green-500' : liveClub.boardConfidence >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${liveClub.boardConfidence}%` }}
          />
        </div>
        <span className="text-[8px] font-bold text-slate-600 truncate max-w-[42%]">
          {OBJECTIVE_LABELS[liveClub.seasonObjective || 'TOP_HALF']}
        </span>
      </div>

      {/* Mobile Tab Switcher so ALL controls fit WITHOUT scrolling */}
      <div className="flex md:hidden gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('REQUESTS')}
          className={`flex-1 py-1 text-[9px] font-black uppercase rounded-[2px] border cursor-pointer transition-all ${
            mobileTab === 'REQUESTS'
              ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
              : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
          }`}
        >
          Peticiones y Mejoras
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('BOARD')}
          className={`flex-1 py-1 text-[9px] font-black uppercase rounded-[2px] border cursor-pointer transition-all ${
            mobileTab === 'BOARD'
              ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
              : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
          }`}
        >
          Junta y Objetivo
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1.5 content-start overflow-hidden">
        {/* LEFT COLUMN (Mobile Tab: REQUESTS) */}
        <div className={`${mobileTab === 'REQUESTS' ? 'flex' : 'hidden'} md:flex flex-col gap-1.5 min-h-0`}>
          {/* Finanzas + presupuesto */}
          <Section title="Saldo y Presupuesto">
            <div className="grid grid-cols-2 gap-1 mb-1">
              <MiniCard label="Saldo" value={`$${liveClub.finances.balance.toLocaleString()}`} />
              <MiniCard label="Fichajes" value={`$${liveClub.finances.transferBudget.toLocaleString()}`} color="text-green-700" />
            </div>
            <div className="flex items-center justify-between gap-1 bg-white border border-slate-300 rounded-sm px-1.5 py-1">
              <div className="flex items-center gap-1 min-w-0">
                <Landmark size={11} className="text-[#3a4a3a] shrink-0" />
                <span className="text-[8.5px] font-black uppercase truncate">
                  Aumento 30%: <span className="text-green-700">${requestedAmount.toLocaleString()}</span>
                </span>
              </div>
              <FMButton onClick={handleBudgetRequest} variant="primary" className="text-[8px] px-2 py-0.5 shrink-0">
                <DollarSign size={9} /> Pedir
              </FMButton>
            </div>
          </Section>

          {/* Instalaciones */}
          <Section title="Instalaciones del Club">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1 bg-white border border-slate-300 rounded-sm px-1.5 py-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 size={11} className="text-[#3a4a3a] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[8.5px] font-black uppercase truncate leading-none">Entrenamiento {liveClub.trainingFacilities}/20</div>
                    <div className="text-[7px] text-slate-500 font-mono">${trainingCost.toLocaleString()}</div>
                  </div>
                </div>
                <FMButton onClick={() => handleUpgrade('training')} disabled={liveClub.trainingFacilities >= 20 || liveClub.finances.balance < trainingCost} className="text-[8px] px-2 py-0.5 shrink-0">
                  <ArrowUp size={9} /> Mejorar
                </FMButton>
              </div>
              <div className="flex items-center justify-between gap-1 bg-white border border-slate-300 rounded-sm px-1.5 py-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users size={11} className="text-[#3a4a3a] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[8.5px] font-black uppercase truncate leading-none">Juveniles {liveClub.youthFacilities}/20</div>
                    <div className="text-[7px] text-slate-500 font-mono">${youthCost.toLocaleString()}</div>
                  </div>
                </div>
                <FMButton onClick={() => handleUpgrade('youth')} disabled={liveClub.youthFacilities >= 20 || liveClub.finances.balance < youthCost} className="text-[8px] px-2 py-0.5 shrink-0">
                  <ArrowUp size={9} /> Mejorar
                </FMButton>
              </div>
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN (Mobile Tab: BOARD) */}
        <div className={`${mobileTab === 'BOARD' ? 'flex' : 'hidden'} md:flex flex-col gap-1.5 min-h-0`}>
          {/* Objetivo */}
          <Section title="Objetivo de Temporada">
            <div className="flex gap-1">
              <select
                value={objectiveDraft}
                onChange={(e) => setObjectiveDraft(e.target.value)}
                className="flex-1 min-w-0 bg-white border border-[#a0b0a0] rounded-sm px-1.5 py-1 text-[9px] font-black uppercase text-slate-800 outline-none focus:border-[#3a4a3a]"
              >
                {Object.entries(OBJECTIVE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
              <FMButton onClick={handleObjectiveSubmit} className="text-[9px] shrink-0 px-2 py-1">
                <Target size={11} /> Proponer
              </FMButton>
            </div>
          </Section>

          {/* Reuniones */}
          <Section title="Reunión Rápida con la Junta">
            <div className="grid grid-cols-2 gap-1">
              {MEETING_TOPICS.map(topic => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => handleMeeting(topic)}
                  className="flex items-center gap-1 bg-white border border-[#a0b0a0] hover:border-[#3a4a3a] hover:bg-[#f2f7f2] rounded-sm px-2 py-1 text-[8.5px] font-black uppercase text-slate-700 transition-all text-left cursor-pointer"
                >
                  <span className="text-[#3a4a3a] shrink-0">{topic.icon}</span> {topic.label}
                </button>
              ))}
            </div>
            {meetingLog.length > 0 && (
              <div className="mt-1">
                <div className={`border-l-4 rounded-sm px-2 py-1 text-[8.5px] font-bold leading-snug ${meetingLog[0].tone === 'POSITIVE' ? 'border-green-500 bg-green-50 text-green-900' : meetingLog[0].tone === 'NEUTRAL' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-red-500 bg-red-50 text-red-900'}`}>
                  <span className="text-[7px] font-black uppercase tracking-widest opacity-70 block">Acta · {meetingLog[0].topic}</span>
                  {meetingLog[0].response}
                </div>
              </div>
            )}
          </Section>

          {/* Tu cargo */}
          <Section title="Tu Cargo">
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-sm px-2 py-1">
              <div className="p-1 bg-[#e8ece8] border border-[#a0b0a0] rounded-sm text-[#3a4a3a] shrink-0">
                <Briefcase size={11} />
              </div>
              <div className="min-w-0">
                <div className="text-[8.5px] font-black uppercase text-slate-900 truncate">{profile?.currentClubName || liveClub.name}</div>
                <div className="text-[7.5px] text-slate-600 font-bold truncate">Entrenador · {profile?.seasonInClub || 1}ª temporada</div>
              </div>
              <Megaphone size={11} className="text-slate-400 shrink-0 ml-auto" />
            </div>
          </Section>
        </div>
      </div>

      {feedback && (
        <div className={`shrink-0 px-2 py-1 rounded-sm border ${feedback.type === 'success' ? 'bg-green-100 border-green-400 text-green-900' : 'bg-red-100 border-red-400 text-red-900'} text-[8.5px] font-bold leading-tight`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
};