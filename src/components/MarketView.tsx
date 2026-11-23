import React, { useState, useMemo, useEffect } from 'react';
import { Player, Staff, StaffRole, STAFF_ATTRIBUTE_LABELS } from '../types';
import { world } from '../services/worldManager';
import { useDialogueStore } from '../stores/dialogueStore';
import { notifyClubs, useWorldStore } from '../stores/worldStore';
import { getAttributeColor } from '../constants';
import { getFlagUrl } from '../data/static';
import { Search, ArrowDownUp, HandCoins, FolderOpen, Users, Briefcase, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { FMBox, FMButton, FMModal } from './FMUI';
import { TransferOfferModal } from './TransferOfferModal';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { checkSportingDirectorTrigger } from '../services/dialogueTriggers';
import { getSportingDirector } from '../services/staffAdviceService';
import { generateStaffProfileText } from './StaffView';

interface MarketViewProps {
  onSelectPlayer: (player: Player) => void;
  userClubId: string;
  currentDate: Date;
}

const HIREABLE_ROLES: { role: StaffRole; label: string; short: string }[] = [
  { role: 'ASSISTANT_MANAGER', label: 'Segundo Entrenador', short: 'AYDT' },
  { role: 'FITNESS_COACH', label: 'Preparador Físico', short: 'PF' },
  { role: 'PHYSIO', label: 'Fisioterapeuta', short: 'FISIO' },
  { role: 'SCOUT', label: 'Ojeador Jefe', short: 'OJEAD' },
  { role: 'SPORTING_DIRECTOR', label: 'Director Deportivo', short: 'DD' },
  { role: 'RESERVE_MANAGER', label: 'Entrenador Reserva', short: 'RES' },
  { role: 'YOUTH_MANAGER', label: 'Entrenador Sub-20', short: 'SUB20' },
  { role: 'TREASURER', label: 'Tesorero', short: 'TES' },
];

const getRoleLabel = (role: StaffRole): string => {
  if (role === 'HEAD_COACH') return 'Director Técnico';
  return HIREABLE_ROLES.find(r => r.role === role)?.label || role;
};

const getRoleShort = (role: StaffRole): string => {
  if (role === 'HEAD_COACH') return 'DT';
  return HIREABLE_ROLES.find(r => r.role === role)?.short || role;
};

function getStaffQuality(s: Staff): number {
  const a = s.attributes;
  switch (s.role) {
    case 'PHYSIO':
      return Math.round((a.physiotherapy * 2 + a.medical * 2 + a.manManagement) / 5);
    case 'SCOUT':
      return Math.round((a.judgingAbility * 2 + a.judgingPotential * 2 + a.adaptability) / 5);
    case 'SPORTING_DIRECTOR':
      return Math.round((a.judgingAbility + a.judgingPotential + a.manManagement + a.tacticalKnowledge) / 4);
    case 'TREASURER':
      return Math.round((a.judgingAbility + a.manManagement + a.adaptability) / 3);
    case 'FITNESS_COACH':
      return Math.round((a.coaching * 2 + a.motivation + a.manManagement + a.physiotherapy) / 5);
    default:
      return Math.round((a.coaching + a.tacticalKnowledge + a.motivation + a.manManagement) / 4);
  }
}

export const MarketView: React.FC<MarketViewProps> = ({ onSelectPlayer, userClubId, currentDate }) => {
  const [marketMode, setMarketMode] = useState<'PLAYERS' | 'STAFF'>('PLAYERS');

  // ── Player Market state ──
  const [filter, setFilter] = useState<'ALL' | 'TRANSFERABLE' | 'LOANABLE' | 'FREE'>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'CA' | 'VALUE' | 'SALARY' | 'AGE' | 'NAME'>('CA');
  const [sortDesc, setSortDesc] = useState(true);
  const [offerPlayer, setOfferPlayer] = useState<Player | null>(null);

  // ── Staff Market state ──
  const [staffStatusFilter, setStaffStatusFilter] = useState<'ALL' | 'FREE' | 'EMPLOYED'>('ALL');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'ALL' | StaffRole>('ALL');
  const [staffSearch, setStaffSearch] = useState('');
  const [staffSortKey, setStaffSortKey] = useState<'QUALITY' | 'SALARY' | 'AGE' | 'REP' | 'NAME'>('QUALITY');
  const [staffSortDesc, setStaffSortDesc] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Staff | null>(null);
  const [targetRole, setTargetRole] = useState<StaffRole>('ASSISTANT_MANAGER');
  const [salaryOffer, setSalaryOffer] = useState<number>(5000);
  const [contractYears, setContractYears] = useState<number>(2);
  const [hireFeedback, setHireFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  useWorldStore(s => s._tick);

  useEffect(() => {
    if (marketMode === 'STAFF') {
      world.ensureFreeAgentStaffPool(32);
    }
  }, [marketMode]);

  const doSort = (a: Player, b: Player) => {
    let res = 0;
    switch (sortKey) {
      case 'NAME': res = a.name.localeCompare(b.name); break;
      case 'VALUE': res = a.value - b.value; break;
      case 'SALARY': res = a.salary - b.salary; break;
      case 'AGE': res = a.age - b.age; break;
      default: res = a.currentAbility - b.currentAbility;
    }
    return sortDesc ? -res : res;
  };

  const marketPlayers = useMemo(() => {
    if (filter === 'FREE') {
      return world.players.filter(p => p.clubId === 'FREE_AGENT' && p.name.toLowerCase().includes(search.toLowerCase()))
        .sort(doSort);
    }
    return world.players.filter(p => {
      const isListed = p.transferStatus !== 'NONE';
      const matchesFilter = filter === 'ALL' || p.transferStatus === filter;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return isListed && matchesFilter && matchesSearch;
    }).sort(doSort);
  }, [filter, search, sortKey, sortDesc]);

  const marketStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return world.staff
      .filter(s => {
        if (s.clubId === userClubId) return false;
        const isFree = !s.clubId || s.clubId === 'FREE_AGENT';
        if (staffStatusFilter === 'FREE' && !isFree) return false;
        if (staffStatusFilter === 'EMPLOYED' && isFree) return false;
        if (staffRoleFilter !== 'ALL' && s.role !== staffRoleFilter) return false;
        if (q) {
          const clubName = !isFree ? (world.getClub(s.clubId)?.name || '').toLowerCase() : '';
          const match =
            s.name.toLowerCase().includes(q) ||
            s.nationality.toLowerCase().includes(q) ||
            clubName.includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let res = 0;
        switch (staffSortKey) {
          case 'NAME': res = a.name.localeCompare(b.name); break;
          case 'SALARY': res = a.salary - b.salary; break;
          case 'AGE': res = a.age - b.age; break;
          case 'REP': res = (a.reputation ?? 50) - (b.reputation ?? 50); break;
          default: res = getStaffQuality(a) - getStaffQuality(b);
        }
        return staffSortDesc ? -res : res;
      })
      .slice(0, 250);
  }, [userClubId, staffStatusFilter, staffRoleFilter, staffSearch, staffSortKey, staffSortDesc]);

  const directorTrigger = useMemo(() => checkSportingDirectorTrigger({
    currentView: 'MARKET',
    currentDate,
    userClubId,
  }), [currentDate, userClubId]);

  const director = userClubId ? getSportingDirector(userClubId) : null;
  const directorColor = world.getClub(userClubId)?.primaryColor || 'bg-[#3a4a3a]';

  const openStaffHireModal = (s: Staff) => {
    const defaultRole: StaffRole = s.role === 'HEAD_COACH' ? 'ASSISTANT_MANAGER' : s.role;
    setSelectedCandidate(s);
    setTargetRole(defaultRole);
    setSalaryOffer(Math.max(1500, s.clubId ? Math.round(s.salary * 1.1) : s.salary));
    setContractYears(2);
    setHireFeedback(null);
  };

  const handleConfirmHire = () => {
    if (!selectedCandidate) return;
    const res = world.hireStaffMember(
      userClubId,
      selectedCandidate.id,
      targetRole,
      salaryOffer,
      contractYears,
      currentDate
    );
    setHireFeedback(res);
    if (res.ok) {
      notifyClubs();
      useWorldStore.getState().notify({ staff: true, clubs: true, inbox: true });
    }
  };

  const userClub = world.getClub(userClubId);
  const incumbentInTargetRole = selectedCandidate
    ? world.getStaffByClub(userClubId).find(s => s.role === targetRole)
    : undefined;
  const candidatePrevClub = selectedCandidate?.clubId ? world.getClub(selectedCandidate.clubId) : undefined;
  const hireCompensation = candidatePrevClub ? Math.round(selectedCandidate!.salary * 12) : 0;

  return (
    <div className="p-2 md:p-4 h-full flex flex-col gap-2.5 bg-[#d4dcd4] overflow-y-auto" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <header className="flex flex-col gap-2.5 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
              Mercado Mundial
            </h2>
            <p className="text-slate-600 font-bold text-[9px] md:text-[10px] uppercase tracking-widest italic">
              {marketMode === 'PLAYERS'
                ? 'Buscando el próximo refuerzo estrella.'
                : 'Contratación de cuerpo técnico, ojeadores y directivos.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 items-stretch md:items-end w-full md:w-auto">
            {/* Switch Jugadores / Empleados */}
            <div className="flex gap-1.5 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setMarketMode('PLAYERS')}
                className={`flex-1 md:flex-none px-3 py-1.5 rounded-[2px] border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  marketMode === 'PLAYERS'
                    ? 'bg-[#2b5d2c] border-[#133014] text-white shadow-sm'
                    : 'bg-white border-[#8e9b90] text-slate-800 hover:bg-[#e8ece8]'
                }`}
              >
                <Users size={12} /> Jugadores
              </button>
              <button
                type="button"
                onClick={() => setMarketMode('STAFF')}
                className={`flex-1 md:flex-none px-3 py-1.5 rounded-[2px] border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  marketMode === 'STAFF'
                    ? 'bg-[#2b5d2c] border-[#133014] text-white shadow-sm'
                    : 'bg-white border-[#8e9b90] text-slate-800 hover:bg-[#e8ece8]'
                }`}
              >
                <Briefcase size={12} /> Empleados
              </button>
              {marketMode === 'PLAYERS' && (
                <FMButton onClick={() => useDialogueStore.getState().open('TRANSFERS', { clubId: userClubId, source: 'MARKET' })} className="hidden sm:flex">
                  <FolderOpen size={13} /> Carpeta
                </FMButton>
              )}
            </div>

            {marketMode === 'PLAYERS' ? (
              <>
                <FMButton onClick={() => useDialogueStore.getState().open('TRANSFERS', { clubId: userClubId, source: 'MARKET' })} className="w-full sm:hidden">
                  <FolderOpen size={13} /> Carpeta de refuerzos
                </FMButton>
                <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shadow-sm w-full md:w-auto">
                  {[
                    { id: 'ALL', label: 'Todos' },
                    { id: 'TRANSFERABLE', label: 'Transf.' },
                    { id: 'LOANABLE', label: 'Cedibles' },
                    { id: 'FREE', label: 'Libres' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id as any)}
                      className={`flex-1 md:px-5 py-1.5 text-[9px] font-black rounded-[1px] transition-all uppercase tracking-widest cursor-pointer ${
                        filter === f.id ? 'bg-[#3a4a3a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shadow-sm w-full md:w-auto">
                {[
                  { id: 'ALL', label: 'Todos' },
                  { id: 'FREE', label: 'Libres' },
                  { id: 'EMPLOYED', label: 'Con Club' },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStaffStatusFilter(f.id as any)}
                    className={`flex-1 md:px-5 py-1.5 text-[9px] font-black rounded-[1px] transition-all uppercase tracking-widest cursor-pointer ${
                      staffStatusFilter === f.id ? 'bg-[#3a4a3a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {marketMode === 'PLAYERS' ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Introduce nombre del jugador..."
                className="w-full bg-white border border-[#a0b0a0] rounded-sm pl-9 pr-4 py-2 text-slate-950 focus:border-[#3a4a3a] outline-none font-bold text-[11px] tracking-wide placeholder:text-slate-400 shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-600">Ordenar por:</label>
              <div className="flex gap-1.5 w-full sm:w-auto">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as any)}
                  className="flex-1 sm:flex-none bg-white border border-[#a0b0a0] rounded-sm px-2 py-1.5 text-[9px] font-black uppercase text-slate-800 outline-none focus:border-[#3a4a3a]"
                >
                  <option value="CA">Habilidad (CA)</option>
                  <option value="VALUE">Valor de mercado</option>
                  <option value="SALARY">Sueldo</option>
                  <option value="AGE">Edad</option>
                  <option value="NAME">Nombre</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDesc(!sortDesc)}
                  className={`px-2.5 py-1.5 rounded-sm border text-[9px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer ${sortDesc ? 'bg-[#3a4a3a] text-white border-[#3a4a3a]' : 'bg-white text-slate-700 border-[#a0b0a0] hover:bg-[#ccd9cc]'}`}
                >
                  <ArrowDownUp size={12} /> {sortDesc ? 'Mayor → Menor' : 'Menor → Mayor'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Buscar empleado por nombre, país o club..."
                className="w-full bg-white border border-[#a0b0a0] rounded-sm pl-9 pr-4 py-2 text-slate-950 focus:border-[#3a4a3a] outline-none font-bold text-[11px] tracking-wide placeholder:text-slate-400 shadow-sm"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <select
                value={staffRoleFilter}
                onChange={(e) => setStaffRoleFilter(e.target.value as any)}
                className="bg-white border border-[#a0b0a0] rounded-sm px-2 py-1.5 text-[9px] font-black uppercase text-slate-800 outline-none focus:border-[#3a4a3a]"
                aria-label="Filtrar por cargo"
              >
                <option value="ALL">Todos los cargos</option>
                {HIREABLE_ROLES.map(r => (
                  <option key={r.role} value={r.role}>{r.label}</option>
                ))}
                <option value="HEAD_COACH">Director Técnico (libre/otro club)</option>
              </select>

              <select
                value={staffSortKey}
                onChange={(e) => setStaffSortKey(e.target.value as any)}
                className="bg-white border border-[#a0b0a0] rounded-sm px-2 py-1.5 text-[9px] font-black uppercase text-slate-800 outline-none focus:border-[#3a4a3a]"
                aria-label="Ordenar empleados"
              >
                <option value="QUALITY">Calidad en el puesto</option>
                <option value="REP">Reputación</option>
                <option value="SALARY">Sueldo</option>
                <option value="AGE">Edad</option>
                <option value="NAME">Nombre</option>
              </select>

              <button
                type="button"
                onClick={() => setStaffSortDesc(!staffSortDesc)}
                className={`px-2.5 py-1.5 rounded-sm border text-[9px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer ${staffSortDesc ? 'bg-[#3a4a3a] text-white border-[#3a4a3a]' : 'bg-white text-slate-700 border-[#a0b0a0] hover:bg-[#ccd9cc]'}`}
              >
                <ArrowDownUp size={12} /> {staffSortDesc ? 'Mayor → Menor' : 'Menor → Mayor'}
              </button>
            </div>
          </>
        )}
      </header>

      {marketMode === 'PLAYERS' ? (
        <FMBox title={`Resultados del Mercado (${marketPlayers.length})`} className="flex-1 min-h-0" noPadding>
          <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-white custom-scroll">
            <table className="w-full table-fixed text-left border-collapse">
              <thead
                className="sticky top-0 z-10 text-[9.5px] sm:text-[10.5px] font-bold text-[#1f2428] shadow-xs border-b border-[#737a82]"
                style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 52%, #c2c8cf 100%)' }}
              >
                <tr>
                  <th className="px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight w-auto">Jugador</th>
                  <th className="hidden sm:table-cell px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight w-[26%]">Club</th>
                  <th className="px-1.5 sm:px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight text-center w-[48px] sm:w-[68px]">Est.</th>
                  <th className="px-1.5 sm:px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight text-right w-[58px] sm:w-[76px]">Valor</th>
                  <th className="px-1.5 sm:px-2 py-1.5 uppercase tracking-tight text-center w-[74px] sm:w-[92px]">Acción</th>
                </tr>
              </thead>
              <tbody className="text-[11px] text-[#1a1a1a]">
                {marketPlayers.map((p, idx) => {
                  const clubName = filter === 'FREE' ? 'Sin club' : (world.getClub(p.clubId)?.shortName || world.getClub(p.clubId)?.name || '—');
                  const fullClubName = filter === 'FREE' ? 'Sin club' : (world.getClub(p.clubId)?.name || '—');
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectPlayer(p)}
                      className={`cursor-pointer transition-colors border-b border-[#e2e7e2] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}
                    >
                      <td className="px-2 py-1.5 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-900 text-[11px] truncate">{p.name}</span>
                          <span className="text-[8.5px] text-slate-500 font-bold uppercase truncate">
                            {p.positions[0]}
                            <span className="sm:hidden font-normal normal-case text-slate-600"> · {clubName}</span>
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-2 py-1.5 text-slate-700 text-[10px] italic truncate">
                        {filter === 'FREE' ? <span className="text-slate-400">Sin club</span> : fullClubName}
                      </td>
                      <td className="px-1 sm:px-2 py-1.5 text-center">
                        {filter === 'FREE' ? (
                          <span className="inline-block px-1 py-0.5 rounded-[1px] text-[8px] font-bold uppercase tracking-tight border bg-slate-50 text-slate-600 border-slate-200">LIB</span>
                        ) : (
                          <span className={`inline-block px-1 py-0.5 rounded-[1px] text-[8px] font-bold uppercase tracking-tight border ${p.transferStatus === 'TRANSFERABLE' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                            {p.transferStatus === 'TRANSFERABLE' ? 'TRN' : 'CED'}
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 sm:px-2 py-1.5 text-right font-mono tabular-nums font-bold text-slate-900 text-[10px] sm:text-[11px] whitespace-nowrap">
                        £{(p.value / 1000000).toFixed(1)}M
                      </td>
                      <td className="px-1 sm:px-2 py-1.5 text-center">
                        {filter !== 'FREE' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOfferPlayer(p); }}
                            className="mx-auto px-1.5 sm:px-2 py-1 rounded-[2px] text-[8px] sm:text-[8.5px] font-black uppercase tracking-tight border bg-[#2b5d2c] text-white border-[#133014] hover:brightness-110 transition-all inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                            title={`Hacer oferta por ${p.name}`}
                          >
                            <HandCoins size={10} /> Ofertar
                          </button>
                        ) : (
                          <span className="text-[8px] text-slate-400 italic font-bold uppercase">Libre</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {marketPlayers.length === 0 && (
              <div className="p-20 text-center text-slate-400 italic uppercase font-bold tracking-widest text-[10px]">No se encontraron registros activos</div>
            )}
          </div>
        </FMBox>
      ) : (
        <FMBox title={`Empleados Disponibles (${marketStaff.length})`} className="flex-1 min-h-0" noPadding>
          <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-white custom-scroll">
            <table className="w-full table-fixed text-left border-collapse">
              <thead
                className="sticky top-0 z-10 text-[9.5px] sm:text-[10.5px] font-bold text-[#1f2428] shadow-xs border-b border-[#737a82]"
                style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 52%, #c2c8cf 100%)' }}
              >
                <tr>
                  <th className="px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight w-auto">Empleado</th>
                  <th className="hidden sm:table-cell px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight w-[24%]">Situación</th>
                  <th className="px-1 sm:px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight text-center w-[42px] sm:w-[56px]">Cal.</th>
                  <th className="px-1.5 sm:px-2 py-1.5 border-r border-[#9aa2ab]/60 uppercase tracking-tight text-right w-[56px] sm:w-[74px]">Sueldo</th>
                  <th className="px-1.5 sm:px-2 py-1.5 uppercase tracking-tight text-center w-[76px] sm:w-[96px]">Acción</th>
                </tr>
              </thead>
              <tbody className="text-[11px] text-[#1a1a1a]">
                {marketStaff.map((s, idx) => {
                  const sClub = s.clubId ? world.getClub(s.clubId) : undefined;
                  const qual = getStaffQuality(s);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => openStaffHireModal(s)}
                      className={`cursor-pointer transition-colors border-b border-[#e2e7e2] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}
                    >
                      <td className="px-2 py-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <img
                            src={getFlagUrl(s.nationality)}
                            alt={s.nationality}
                            className="w-3.5 h-2.5 object-cover rounded-[1px] border border-slate-300 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 text-[11px] truncate block">{s.name}</span>
                            <span className="text-[8.5px] text-slate-500 font-bold uppercase truncate block">
                              {getRoleShort(s.role)} · {s.age}a
                              <span className="sm:hidden font-normal normal-case text-slate-600">
                                {' · '}
                                {sClub ? sClub.shortName : 'Libre'}
                              </span>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-2 py-1.5 text-[10px] truncate">
                        {sClub ? (
                          <span className="text-slate-700 font-medium">{sClub.name}</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-[1px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8.5px] font-black uppercase">
                            Agente Libre
                          </span>
                        )}
                      </td>
                      <td className="px-1 sm:px-2 py-1.5 text-center font-mono font-black text-slate-900">
                        <span className={getAttributeColor(qual)}>{qual}</span>
                      </td>
                      <td className="px-1.5 sm:px-2 py-1.5 text-right font-mono tabular-nums font-bold text-slate-900 text-[10px] sm:text-[11px] whitespace-nowrap">
                        £{(s.salary / 1000).toFixed(1)}k
                      </td>
                      <td className="px-1 sm:px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openStaffHireModal(s); }}
                          className="mx-auto px-1.5 sm:px-2 py-1 rounded-[2px] text-[8px] sm:text-[8.5px] font-black uppercase tracking-tight border bg-[#2b5d2c] text-white border-[#133014] hover:brightness-110 transition-all inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <UserPlus size={10} /> Contratar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {marketStaff.length === 0 && (
              <div className="p-20 text-center text-slate-400 italic uppercase font-bold tracking-widest text-[10px]">
                No se encontraron empleados con esos filtros
              </div>
            )}
          </div>
        </FMBox>
      )}

      {offerPlayer && (
        <TransferOfferModal
          player={offerPlayer}
          userClubId={userClubId}
          currentDate={currentDate}
          onClose={() => setOfferPlayer(null)}
          onOfferMade={() => setOfferPlayer(null)}
        />
      )}

      {/* Modal de perfil y contratación de empleado */}
      <FMModal
        isOpen={Boolean(selectedCandidate)}
        onClose={() => setSelectedCandidate(null)}
        title={selectedCandidate ? `Contratar · ${selectedCandidate.name}` : 'Contratar Empleado'}
        size="lg"
      >
        {selectedCandidate && (
          <div className="space-y-3" style={{ fontFamily: 'Verdana, sans-serif' }}>
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={getFlagUrl(selectedCandidate.nationality)}
                  alt={selectedCandidate.nationality}
                  className="w-6 h-4 object-cover rounded-[1px] border border-slate-400 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-black text-slate-900 uppercase truncate">{selectedCandidate.name}</p>
                  <p className="text-[10px] font-bold text-slate-600">
                    {getRoleLabel(selectedCandidate.role)} · {selectedCandidate.age} años · Rep {selectedCandidate.reputation ?? 50}/100
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[9px] font-black uppercase text-slate-500 block">Situación actual</span>
                <span className="text-[11px] font-black text-slate-900">
                  {candidatePrevClub ? candidatePrevClub.name : 'Libre (sin club)'}
                </span>
              </div>
            </div>

            {/* Perfil profesional */}
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-3">
              <h4 className="text-[9.5px] font-black uppercase text-slate-600 tracking-wider border-b border-slate-200 pb-1.5 mb-1.5">
                Perfil Profesional
              </h4>
              <p className="text-[10.5px] text-slate-700 leading-relaxed">
                {generateStaffProfileText(selectedCandidate)}
              </p>
            </div>

            {/* Atributos */}
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-3">
              <h4 className="text-[9.5px] font-black uppercase text-slate-600 tracking-wider border-b border-slate-200 pb-1.5 mb-2">
                Atributos del Empleado
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(selectedCandidate.attributes).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-0.5 border-b border-slate-100 last:border-0">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">{STAFF_ATTRIBUTE_LABELS[key] || key}</span>
                    <span className={`font-mono font-black text-[11px] px-1.5 py-0.5 rounded-sm bg-slate-50 ${getAttributeColor(val as number)}`}>
                      {val as number}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Condiciones del contrato */}
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-3 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-600 block mb-1">Cargo en {userClub?.shortName || 'tu club'}</label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as StaffRole)}
                    className="w-full bg-[#f4f7f4] border border-[#8e9b90] rounded-sm px-2 py-1.5 text-[10px] font-bold text-slate-900 outline-none"
                  >
                    {HIREABLE_ROLES.map(r => (
                      <option key={r.role} value={r.role}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-600 block mb-1">Sueldo semanal (£)</label>
                  <input
                    type="number"
                    min={1000}
                    step={250}
                    value={salaryOffer}
                    onChange={(e) => setSalaryOffer(Math.max(1000, Number(e.target.value) || 1000))}
                    className="w-full bg-[#f4f7f4] border border-[#8e9b90] rounded-sm px-2 py-1.5 text-[11px] font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-600 block mb-1">Duración</label>
                  <select
                    value={contractYears}
                    onChange={(e) => setContractYears(Number(e.target.value))}
                    className="w-full bg-[#f4f7f4] border border-[#8e9b90] rounded-sm px-2 py-1.5 text-[10px] font-bold text-slate-900 outline-none"
                  >
                    <option value={1}>1 temporada</option>
                    <option value={2}>2 temporadas</option>
                    <option value={3}>3 temporadas</option>
                    <option value={4}>4 temporadas</option>
                  </select>
                </div>
              </div>

              <div className="text-[10px] font-semibold text-slate-700 bg-[#f2f7f2] border border-[#c8d4c8] rounded-sm px-2.5 py-2 space-y-0.5">
                <div>
                  Indemnización por salida:{' '}
                  <strong className="font-mono text-slate-900">
                    {hireCompensation > 0 ? `£${hireCompensation.toLocaleString()}` : '£0 (Agente libre)'}
                  </strong>
                  {userClub && (
                    <span className="text-slate-500"> · Saldo disponible: £{userClub.finances.balance.toLocaleString()}</span>
                  )}
                </div>
                {incumbentInTargetRole && incumbentInTargetRole.id !== selectedCandidate.id && (
                  <div className="text-amber-800">
                    Reemplazará a <strong>{incumbentInTargetRole.name}</strong> en el puesto de {getRoleLabel(targetRole)}.
                  </div>
                )}
              </div>

              {hireFeedback && (
                <div
                  className={`flex items-start gap-2 rounded-sm px-2.5 py-2 border text-[10.5px] font-bold ${
                    hireFeedback.ok
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-red-50 border-red-300 text-red-900'
                  }`}
                >
                  {hireFeedback.ok ? (
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-700" />
                  ) : (
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-700" />
                  )}
                  <span>{hireFeedback.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <FMButton variant="secondary" type="button" onClick={() => setSelectedCandidate(null)}>
                  {hireFeedback?.ok ? 'Cerrar' : 'Cancelar'}
                </FMButton>
                {!hireFeedback?.ok && (
                  <FMButton variant="primary" type="button" onClick={handleConfirmHire}>
                    <UserPlus size={13} /> Confirmar Contratación
                  </FMButton>
                )}
              </div>
            </div>
          </div>
        )}
      </FMModal>

      {director && (
        <DialogueAvatar
          clubColor={directorColor}
          cargo="Director Deportivo"
          name={director.name}
          badge={directorTrigger}
          position="top-right"
          onClick={() => useDialogueStore.getState().open('TRANSFERS', { clubId: userClubId, source: 'MARKET' })}
        />
      )}
    </div>
  );
};
