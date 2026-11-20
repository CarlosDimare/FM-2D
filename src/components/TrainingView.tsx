
import React, { useState, useMemo, useEffect } from 'react';
import { Player, Staff, Club, TrainingSchedule, TrainingCategory, SquadType } from '../types';
import { world } from '../services/worldManager';
import { useWorldStore, notifyPlayers, notifyClubs } from '../stores/worldStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { useGameStore } from '../stores/gameStore';
import { FMBox, FMTable, FMTableCell, FMButton } from './FMUI';
import { TRAINING_PRESETS } from '../data/static';
import { User, Dumbbell, Shield, X, CalendarDays, HeartPulse, ChevronLeft, ChevronRight, Stethoscope, ClipboardList } from 'lucide-react';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { checkFitnessTrigger } from '../services/dialogueTriggers';
import { detectManagerInitiatedTriggers } from '../services/playerDialogueTriggers';
import { getFitnessCoach } from '../services/staffAdviceService';

interface TrainingViewProps {
  players: Player[];
  staff: Staff[];
  club: Club;
  squadType?: SquadType;
  onSquadChange?: (type: SquadType) => void;
}

const IntensitySegment: React.FC<{ value: number; max?: number }> = ({ value, max = 20 }) => {
  return (
    <div className="flex gap-0.5 h-3 items-center">
      {[...Array(max)].map((_, i) => (
        <div 
          key={i} 
          className={`w-1 h-full rounded-[1px] ${i < value ? (value > 15 ? 'bg-red-600' : value > 10 ? 'bg-blue-600' : 'bg-green-600') : 'bg-slate-300'}`}
        />
      ))}
    </div>
  );
};

const TrainingSlider: React.FC<{ 
  label: string; 
  value: number; 
  onChange: (val: number) => void;
  category: TrainingCategory;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-4 py-2 border-b border-[#a0b0a0]/30 hover:bg-black/5 px-2 group">
    <span className="w-32 text-[9px] font-black text-slate-600 uppercase tracking-tight" style={{ fontFamily: 'Verdana, sans-serif' }}>{label}</span>
    <input 
      type="range" min="0" max="20" step="1" 
      className="flex-1 accent-[#3a4a3a] h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer"
      value={value} 
      onChange={(e) => onChange(parseInt(e.target.value))} 
    />
    <div className="w-24 flex justify-end">
       <IntensitySegment value={value} />
    </div>
  </div>
);

const WEEK_DAYS = [
  { id: 'LUN', label: 'Lun' }, { id: 'MAR', label: 'Mar' }, { id: 'MIE', label: 'Mié' }, { id: 'JUE', label: 'Jue' },
  { id: 'VIE', label: 'Vie' }, { id: 'SAB', label: 'Sáb' }, { id: 'DOM', label: 'Dom' },
];

const WEEKLY_OPTIONS: { value: TrainingCategory | 'REST'; label: string }[] = [
  { value: 'REST', label: 'Descanso' },
  { value: 'STRENGTH', label: 'Fuerza' },
  { value: 'AEROBIC', label: 'Aeróbico' },
  { value: 'TACTICAL', label: 'Táctica' },
  { value: 'BALL_CONTROL', label: 'Control' },
  { value: 'DEFENDING', label: 'Defensa' },
  { value: 'ATTACKING', label: 'Ataque' },
  { value: 'SHOOTING', label: 'Remate' },
  { value: 'SET_PIECES', label: 'Balón parado' },
];

const POSITION_FOCUS_PRESETS: Record<'GK' | 'DEF' | 'MID' | 'ATT', { label: string; schedule: TrainingSchedule }> = {
  GK: { label: 'Porteros', schedule: { STRENGTH: 12, AEROBIC: 8, TACTICAL: 10, BALL_CONTROL: 10, DEFENDING: 14, ATTACKING: 3, SHOOTING: 3, SET_PIECES: 8 } },
  DEF: { label: 'Defensas', schedule: { STRENGTH: 10, AEROBIC: 8, TACTICAL: 14, BALL_CONTROL: 8, DEFENDING: 18, ATTACKING: 4, SHOOTING: 2, SET_PIECES: 6 } },
  MID: { label: 'Medios', schedule: { STRENGTH: 8, AEROBIC: 12, TACTICAL: 14, BALL_CONTROL: 12, DEFENDING: 10, ATTACKING: 10, SHOOTING: 8, SET_PIECES: 8 } },
  ATT: { label: 'Delanteros', schedule: { STRENGTH: 8, AEROBIC: 10, TACTICAL: 8, BALL_CONTROL: 14, DEFENDING: 2, ATTACKING: 16, SHOOTING: 16, SET_PIECES: 6 } },
};

const getPlayerGroup = (p: Player): 'GK' | 'DEF' | 'MID' | 'ATT' => {
  const pos = p.positions[0];
  if (pos === 'P') return 'GK';
  if (['DFC', 'LD', 'LI', 'LIB', 'CD', 'CI'].includes(pos)) return 'DEF';
  if (['MCD', 'MC', 'MD', 'MI', 'MPC'].includes(pos)) return 'MID';
  return 'ATT';
};

export const TrainingView: React.FC<TrainingViewProps> = ({ players: playersProp, staff, club: clubProp, squadType, onSquadChange }) => {
  // Datos en vivo: se refresca cuando el mundo cambia (p.ej. plan del PF aplicado)
  const storePlayers = useWorldStore(s => s.players);
  const storeClubs = useWorldStore(s => s.clubs);
  const club = storeClubs.find(c => c.id === clubProp?.id) || clubProp;
  const effectiveSquad: SquadType = squadType || 'SENIOR';
  const allClubPlayers = storePlayers.filter(p => p.clubId === club?.id);
  const players = allClubPlayers.filter(p => p.squad === effectiveSquad);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(players[0]?.id || playersProp[0]?.id || null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('GENERAL');
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState<Partial<Record<string, TrainingCategory | 'REST'>>>(clubProp.trainingWeeklyPlan || {});
  const [planFeedback, setPlanFeedback] = useState<string | null>(null);
  const currentDate = useGameStore(s => s.currentDate);

  const fitnessTrigger = useMemo(() => checkFitnessTrigger({
    currentView: 'TRAINING',
    currentDate: currentDate || new Date(),
    userClubId: club?.id,
  }), [club?.id, currentDate]);

  const coach = club ? getFitnessCoach(club.id) : null;
  const coachColor = club?.primaryColor || 'bg-[#3a4a3a]';

  useEffect(() => {
    if (club) detectManagerInitiatedTriggers(club.id, 'TRAINING');
  }, [club?.id]);

  const selectedPlayer = useMemo(() => players.find(p => p.id === selectedPlayerId), [selectedPlayerId, players]);

  const handleSaveWeeklyPlan = () => {
    club.trainingWeeklyPlan = { ...weeklyPlan };
    notifyClubs();
    setPlanFeedback('Plan semanal guardado: las categorías priorizadas reciben más foco en el desarrollo de los jugadores.');
    setTimeout(() => setPlanFeedback(null), 4000);
  };

  const handleApplyPositionFocus = (group: 'GK' | 'DEF' | 'MID' | 'ATT') => {
    const preset = POSITION_FOCUS_PRESETS[group];
    const matched = players.filter(p => getPlayerGroup(p) === group);
    matched.forEach(p => { p.trainingSchedule = { ...preset.schedule }; });
    notifyPlayers();
    setPlanFeedback(`Plan de ${preset.label.toLowerCase()} aplicado a ${matched.length} jugadores.`);
    setTimeout(() => setPlanFeedback(null), 4000);
  };

  const weeklyFocusCount = useMemo(() => {
    const counts: Record<string, number> = {};
    WEEK_DAYS.forEach(day => {
      const v = weeklyPlan[day.id];
      if (v && v !== 'REST') counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }, [weeklyPlan]);

  const handleApplyPresetAll = (presetId: string) => {
    const preset = TRAINING_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    players.forEach(p => {
      p.trainingSchedule = { ...preset.schedule };
    });
    setSelectedPresetId(presetId);
    notifyPlayers();
  };

  const handleUpdateIndividual = (cat: TrainingCategory, val: number) => {
    if (!selectedPlayer) return;
    if (!selectedPlayer.trainingSchedule) {
      selectedPlayer.trainingSchedule = { ...TRAINING_PRESETS[0].schedule };
    }
    selectedPlayer.trainingSchedule = { ...selectedPlayer.trainingSchedule, [cat]: val };
    notifyPlayers();
  };

  const handleDelegate = (staffId: string) => {
    club.trainingDelegatedTo = club.trainingDelegatedTo === staffId ? undefined : staffId;
    notifyClubs();
  };

  const handlePlayerSelect = (id: string) => {
      setSelectedPlayerId(id);
      setIsMobileEditorOpen(true);
  };

  const categories: { key: TrainingCategory; label: string }[] = [
    { key: 'STRENGTH', label: 'Fuerza' },
    { key: 'AEROBIC', label: 'Aeróbico' },
    { key: 'TACTICAL', label: 'Táctica' },
    { key: 'BALL_CONTROL', label: 'Control Balón' },
    { key: 'DEFENDING', label: 'Defensa' },
    { key: 'ATTACKING', label: 'Ataque' },
    { key: 'SHOOTING', label: 'Remate' },
    { key: 'SET_PIECES', label: 'Balón Parado' },
  ];

  const EditorContent = () => (
      <div className="space-y-0.5">
          {selectedPlayer ? (
            categories.map(cat => (
              <TrainingSlider 
                key={cat.key}
                label={cat.label}
                category={cat.key}
                value={selectedPlayer.trainingSchedule?.[cat.key] ?? TRAINING_PRESETS[0].schedule[cat.key]}
                onChange={(v) => handleUpdateIndividual(cat.key, v)}
              />
            ))
          ) : (
            <div className="p-12 text-center text-slate-400 font-bold uppercase text-[10px]">Seleccione un jugador para editar</div>
          )}
      </div>
  );

  const squadLabels: Record<SquadType, string> = { SENIOR: 'Primer Equipo', RESERVE: 'Reserva', U20: 'Sub 20' };
  const squadOrder: SquadType[] = ['SENIOR', 'RESERVE', 'U20'];
  const currentSquadIndex = squadOrder.indexOf(effectiveSquad);

  const staffRoles = [
    { key: 'ASSISTANT_MANAGER', label: 'Ayudante', attr: 'Táctica' as const, icon: ClipboardList },
    { key: 'FITNESS_COACH', label: 'Prep. Físico', attr: 'Entreno' as const, icon: HeartPulse },
    { key: 'PHYSIO', label: 'Médico', attr: 'Médico' as const, icon: Stethoscope },
  ];

  const staffByRole = (role: string) => staff.filter(s => s.role === role);

  const [mobileSection, setMobileSection] = useState<'PLAYERS' | 'WEEKLY' | 'PRESETS'>('PLAYERS');

  return (
    <div className="p-2 md:p-3 h-full flex flex-col gap-2 bg-[#d4dcd4] overflow-hidden">
      {/* Top Bar: Squad selector + Preparador Físico Avatar ALWAYS AT TOP */}
      <div className="shrink-0 flex items-center justify-between gap-2 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-2.5 py-1.5 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          {onSquadChange ? (
            <div className="flex items-center gap-1 bg-[#2b5d2c] text-white px-1.5 py-1 rounded-[2px] border border-[#133014]">
              <button type="button" onClick={() => onSquadChange(squadOrder[(currentSquadIndex - 1 + squadOrder.length) % squadOrder.length])} className="p-0.5 hover:bg-white/15 rounded cursor-pointer"><ChevronLeft size={13} /></button>
              <span className="text-[9px] font-black uppercase tracking-wider px-1">{squadLabels[effectiveSquad]}</span>
              <button type="button" onClick={() => onSquadChange(squadOrder[(currentSquadIndex + 1) % squadOrder.length])} className="p-0.5 hover:bg-white/15 rounded cursor-pointer"><ChevronRight size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1.5 bg-[#2b5d2c] rounded-sm text-white shrink-0"><Dumbbell size={14} /></div>
              <h2 className="text-xs sm:text-base font-black text-[#1a1a1a] uppercase italic tracking-tight truncate">Entrenamiento</h2>
            </div>
          )}
        </div>

        {/* Preparador Físico Figure Prominently at the Top */}
        <DialogueAvatar
          clubColor={coachColor}
          cargo="Prep. Físico"
          name={coach?.name || 'Preparador Físico'}
          badge={fitnessTrigger}
          position="inline"
          onClick={() => useDialogueStore.getState().open('FITNESS', { clubId: club.id, source: 'TRAINING' })}
        />
      </div>

      {/* Mobile Section Tabs (fit cleanly on mobile without scroll overflow) */}
      <div className="flex lg:hidden bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shrink-0 gap-0.5">
        {([
          ['PLAYERS', 'Jugadores'],
          ['WEEKLY', 'Plan Semanal'],
          ['PRESETS', 'Planes y Staff'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileSection(key)}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-[1px] cursor-pointer transition-all ${
              mobileSection === key ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Presets & Staff Block (visible on mobile only when PRESETS tab is active, always visible on desktop) */}
      <div className={`${mobileSection === 'PRESETS' ? 'flex' : 'hidden lg:flex'} flex-col gap-2 shrink-0`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <FMBox title="Plan General y Foco por Posición" className="shrink-0" noPadding>
            <div className="p-2 bg-white/70 space-y-2">
              <div className="flex flex-wrap gap-1">
                {TRAINING_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPresetAll(p.id)}
                    className={`flex-1 px-2 py-1.5 rounded-[2px] text-[8.5px] font-black uppercase transition-all whitespace-nowrap cursor-pointer border ${selectedPresetId === p.id ? 'bg-[#2b5d2c] text-white border-[#133014] shadow-sm' : 'text-slate-700 bg-white border-[#a0b0a0] hover:bg-[#ccd9cc]'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(Object.keys(POSITION_FOCUS_PRESETS) as ('GK' | 'DEF' | 'MID' | 'ATT')[]).map(group => {
                  const preset = POSITION_FOCUS_PRESETS[group];
                  const count = players.filter(p => getPlayerGroup(p) === group).length;
                  return (
                    <button
                      key={group}
                      type="button"
                      onClick={() => handleApplyPositionFocus(group)}
                      className="flex items-center justify-center gap-1 bg-[#f4f7f4] border border-[#a0b0a0] hover:border-[#2b5d2c] rounded-[2px] px-1.5 py-1 text-[8px] font-black uppercase text-slate-700 cursor-pointer"
                    >
                      <Shield size={10} className="text-[#2b5d2c] shrink-0" />
                      <span className="truncate">{preset.label}</span>
                      <span className="text-[7px] text-slate-400">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </FMBox>

          <FMBox title="Responsables del Área" className="shrink-0" noPadding>
            <div className="p-2 grid grid-cols-3 gap-1.5 bg-white/70">
              {staffRoles.map(roleDef => {
                const members = staffByRole(roleDef.key);
                const Icon = roleDef.icon;
                return (
                  <div key={roleDef.key} className="bg-white border border-[#a0b0a0]/60 rounded-sm p-1.5 flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1">
                      <Icon size={10} className="text-[#2b5d2c] shrink-0" />
                      <span className="text-[7px] font-black uppercase text-slate-500 truncate">{roleDef.label}</span>
                    </div>
                    {members.length > 0 ? members.slice(0, 1).map(m => (
                      <div key={m.id} className="min-w-0">
                        <div className="text-[8.5px] font-black text-slate-900 truncate">{m.name}</div>
                        <div className="text-[7px] text-slate-500 font-bold uppercase">
                          {roleDef.key === 'ASSISTANT_MANAGER' ? `Táctica ${m.attributes.tacticalKnowledge}` :
                           roleDef.key === 'FITNESS_COACH' ? `Entreno ${m.attributes.coaching}` :
                           `Médico ${m.attributes.physiotherapy}`}
                        </div>
                      </div>
                    )) : (
                      <div className="text-[7px] text-slate-400 italic uppercase font-bold">Sin asignar</div>
                    )}
                  </div>
                );
              })}
            </div>
          </FMBox>
        </div>
      </div>

      {/* Weekly Plan (visible on mobile when WEEKLY tab active, always visible on desktop) */}
      <div className={`${mobileSection === 'WEEKLY' ? 'flex' : 'hidden lg:flex'} flex-col shrink-0`}>
        <FMBox title="Plan Semanal de Entrenamiento" className="shrink-0" noPadding>
          <div className="p-2 space-y-1.5 bg-white/70">
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
              {WEEK_DAYS.map(day => (
                <div key={day.id} className="flex flex-col gap-0.5 bg-white border border-[#a0b0a0]/60 rounded-sm p-1">
                  <span className="text-[7.5px] font-black uppercase text-slate-500 text-center">{day.label}</span>
                  <select
                    value={weeklyPlan[day.id] || 'REST'}
                    onChange={(e) => setWeeklyPlan(prev => ({ ...prev, [day.id]: e.target.value as TrainingCategory | 'REST' }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-[1px] px-0.5 py-0.5 text-[8px] font-black uppercase text-slate-800 outline-none focus:border-[#2b5d2c]"
                  >
                    {WEEKLY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FMButton onClick={handleSaveWeeklyPlan} className="text-[9.5px] py-1">
                <CalendarDays size={11} /> Guardar plan semanal
              </FMButton>
              {Object.keys(weeklyFocusCount).length > 0 && (
                <span className="text-[8px] text-slate-600 italic font-bold uppercase truncate">
                  Foco: {Object.keys(weeklyFocusCount)
                    .sort((a, b) => (weeklyFocusCount[b] || 0) - (weeklyFocusCount[a] || 0))
                    .slice(0, 3)
                    .map(cat => `${(WEEKLY_OPTIONS.find(o => o.value === cat)?.label || cat).toUpperCase()} ×${weeklyFocusCount[cat] || 0}`)
                    .join(' · ')}
                </span>
              )}
            </div>
            {planFeedback && <div className="text-[8.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-sm px-2 py-1">{planFeedback}</div>}
          </div>
        </FMBox>
      </div>

      {/* Players List & Individual Editor */}
      <div className={`${mobileSection === 'PLAYERS' ? 'flex' : 'hidden lg:flex'} flex-1 flex-col lg:flex-row gap-2 min-h-0 overflow-hidden relative`}>
        <FMBox title="Planificación de Jugadores (Tocá para ajustar)" className="flex-1 lg:flex-[2] min-h-0 overflow-hidden" noPadding>
          <FMTable headers={['Nombre', 'Carga', 'Mor', 'Forma']} colWidths={['auto', '92px', '36px', '42px']}>
            {[...players].sort((a,b) => b.currentAbility - a.currentAbility).map(p => {
              const schedule = p.trainingSchedule || TRAINING_PRESETS[0].schedule;
              const totalLoad = (Object.values(schedule) as number[]).reduce((acc: number, val: number) => acc + val, 0);
              return (
                <tr
                  key={p.id}
                  onClick={() => handlePlayerSelect(p.id)}
                  className={`cursor-pointer transition-colors ${selectedPlayerId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'bg-white hover:bg-[#ccd9cc]'}`}
                >
                  <FMTableCell className="font-bold text-slate-900 truncate text-[10px]">
                    {p.name} <span className="text-[8px] opacity-50 ml-1">{p.positions[0]}</span>
                  </FMTableCell>
                  <FMTableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="h-1.5 bg-slate-200 rounded-[1px] overflow-hidden border border-slate-300">
                        <div
                          className={`h-full ${totalLoad > 100 ? 'bg-red-600' : totalLoad > 80 ? 'bg-blue-600' : 'bg-green-600'}`}
                          style={{ width: `${Math.min(100, (totalLoad/140)*100)}%` }}
                        />
                      </div>
                      <span className="text-[7px] font-black uppercase text-slate-500">{totalLoad > 100 ? 'Muy Alta' : totalLoad > 80 ? 'Alta' : 'Media'}</span>
                    </div>
                  </FMTableCell>
                  <FMTableCell className="text-center font-bold text-[10px]" isNumber>{Math.round(p.morale)}</FMTableCell>
                  <FMTableCell className="text-center font-bold text-green-700 text-[10px]" isNumber>{Math.round(p.fitness)}%</FMTableCell>
                </tr>
              );
            })}
          </FMTable>
        </FMBox>

        {/* Right: Personalization & Staff (Desktop) */}
        <div className="hidden lg:flex flex-1 flex-col gap-2 overflow-y-auto custom-scroll pr-1">
          <FMBox title={selectedPlayer ? `Entrenamiento: ${selectedPlayer.name}` : 'Asignación Individual'} noPadding>
            <div className="p-3 bg-white/40">
              <EditorContent />
            </div>
          </FMBox>

          <FMBox title="Supervisión Técnica" noPadding>
            <div className="bg-white/40 p-2 space-y-1">
              {staff.filter(s => s.role !== 'PHYSIO' && s.role !== 'TREASURER').map(s => (
                <div key={s.id} className="flex items-center justify-between p-1.5 bg-white border border-[#a0b0a0]/40 rounded-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-slate-200 rounded-sm flex items-center justify-center text-slate-600 shrink-0">
                      <User size={14} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9.5px] font-black text-slate-900 uppercase truncate">{s.name}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase">Entreno: {s.attributes.coaching}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelegate(s.id)}
                    className={`px-2.5 py-1 text-[8px] font-black uppercase rounded-sm border shadow-sm cursor-pointer shrink-0 ${club.trainingDelegatedTo === s.id ? 'bg-[#2b5d2c] text-white border-[#133014]' : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'}`}
                  >
                    {club.trainingDelegatedTo === s.id ? 'A CARGO' : 'DELEGAR'}
                  </button>
                </div>
              ))}
            </div>
          </FMBox>
        </div>

        {/* Mobile Modal for Individual Editor */}
        {isMobileEditorOpen && selectedPlayer && (
          <div className="fixed inset-0 z-[260] lg:hidden bg-slate-900/80 flex items-end justify-center backdrop-blur-sm animate-slide-up" onClick={() => setIsMobileEditorOpen(false)}>
            <div className="bg-[#d4dcd4] w-full max-h-[82vh] rounded-t-lg border-t border-x border-[#a0b0a0] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-2.5 border-b border-[#a0b0a0] bg-[#e8ece8] flex justify-between items-center rounded-t-lg">
                <div>
                  <h3 className="text-xs font-black text-[#1a1a1a] uppercase italic">{selectedPlayer.name}</h3>
                  <p className="text-[8.5px] text-slate-600 font-bold uppercase">{selectedPlayer.positions[0]} · Forma {Math.round(selectedPlayer.fitness)}%</p>
                </div>
                <button type="button" onClick={() => setIsMobileEditorOpen(false)} className="p-1.5 bg-slate-200 rounded-full text-slate-600">
                  <X size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 custom-scroll bg-white/50">
                <EditorContent />
              </div>
              <div className="p-2.5 bg-[#e8ece8] border-t border-[#a0b0a0]">
                <FMButton onClick={() => setIsMobileEditorOpen(false)} className="w-full py-2.5 text-xs">Confirmar</FMButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

