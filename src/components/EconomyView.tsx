import React, { useState } from 'react';
import { Club } from '../types';
import { world } from '../services/worldManager';
import { useWorldStore } from '../stores/worldStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { getTreasurer } from '../services/staffAdviceService';
import { computeClubFinancialProjection } from '../services/economyCalibration';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { Wallet, TrendingUp, TrendingDown, Landmark, PiggyBank, Info } from 'lucide-react';

interface EconomyViewProps {
  club: Club;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white border border-[#a0b0a0] rounded-sm shadow-sm flex items-center gap-1.5 px-2 py-1 min-w-0">
    <div className="p-1 bg-gradient-to-b from-[#f0f4f0] to-[#d0d8d0] border border-[#a0b0a0] rounded-sm shrink-0">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest truncate" style={{ fontFamily: 'Verdana, sans-serif' }}>{label}</p>
      <p className={`text-[11px] sm:text-sm md:text-base font-black truncate tracking-tighter ${color}`} style={{ fontFamily: 'Verdana, sans-serif' }}>{value}</p>
    </div>
  </div>
);

const Row: React.FC<{ label: string; value: string; type: 'INCOME' | 'EXPENSE' }> = ({ label, value, type }) => (
  <div className="flex justify-between items-center py-0.5 sm:py-1 border-b border-[#d0d8d0] last:border-0 px-1">
    <span className="text-slate-600 font-bold uppercase text-[8px] tracking-wide truncate mr-1" style={{ fontFamily: 'Verdana, sans-serif' }}>{label}</span>
    <div className="flex items-center gap-1 shrink-0">
      {type === 'INCOME' ? <TrendingUp size={10} className="text-green-600" /> : <TrendingDown size={10} className="text-red-600" />}
      <span className={`font-mono font-bold text-[10px] ${type === 'INCOME' ? 'text-green-700' : 'text-slate-700'}`}>{value}</span>
    </div>
  </div>
);

export const EconomyView: React.FC<EconomyViewProps> = ({ club }) => {
  const clubs = useWorldStore(s => s.clubs);
  const _tick = useWorldStore(s => s._tick);
  void _tick;
  const liveClub = clubs.find(c => c.id === club.id) || world.getClub(club.id) || club;
  const [mobileTab, setMobileTab] = useState<'FORECAST' | 'HEALTH'>('FORECAST');

  const treasurer = getTreasurer(liveClub.id);
  const { balance, transferBudget, wageBudget } = liveClub.finances;
  const players = world.getPlayersByClub(liveClub.id);
  const staffList = world.getStaffByClub(liveClub.id);
  const proj = computeClubFinancialProjection(liveClub, players, staffList);

  const wagePct = wageBudget > 0 ? (proj.totalSalaries / wageBudget) * 100 : 0;
  const salaryOk = proj.totalSalaries <= wageBudget;

  const strongBalanceThreshold = Math.max(1_500_000, liveClub.reputation * 800);
  const stableBalanceThreshold = Math.max(150_000, liveClub.reputation * 120);
  const healthStatus = balance >= strongBalanceThreshold && salaryOk
    ? { text: 'EXCELENTE', cls: 'bg-green-100 border-green-400 text-green-800' }
    : balance >= stableBalanceThreshold && wagePct <= 105
    ? { text: 'ESTABLE', cls: 'bg-blue-100 border-blue-400 text-blue-800' }
    : { text: 'AJUSTADA', cls: 'bg-red-100 border-red-400 text-red-800' };

  const fmt = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${sign}£${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(0)}k`;
    return `${sign}£${abs.toFixed(0)}`;
  };

  return (
    <div className="p-1.5 sm:p-2 h-full flex flex-col gap-1.5 bg-[#d4dcd4] overflow-hidden">
      {/* Top Bar with Treasurer Character ALWAYS Visible at Top */}
      <header className="shrink-0 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1.5 bg-[#3a4a3a] rounded-sm text-white shrink-0"><Wallet size={14} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs sm:text-base font-black text-[#1a1a1a] uppercase italic tracking-tighter truncate leading-none" style={{ fontFamily: 'Verdana, sans-serif' }}>
                Finanzas
              </h2>
              <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-sm border uppercase shrink-0 ${healthStatus.cls}`}>
                {healthStatus.text}
              </span>
            </div>
            <p className="hidden sm:block text-slate-600 text-[9px] font-bold uppercase tracking-widest truncate">
              Balance, presupuestos mensuales ({players.length} jug. · {staffList.length} staff) y asesoría del Tesorero.
            </p>
          </div>
        </div>
        <DialogueAvatar
          position="inline"
          clubColor={liveClub.primaryColor}
          cargo="Tesorero"
          name={treasurer?.name}
          badge={balance < stableBalanceThreshold || !salaryOk}
          onClick={() => useDialogueStore.getState().open('TREASURER', { clubId: liveClub.id, source: 'ECONOMY' })}
        />
      </header>

      {/* 3 Compact KPI Cards */}
      <div className="grid grid-cols-3 gap-1 shrink-0">
        <StatCard icon={<Landmark className="text-slate-700" size={12} />} label="Saldo" value={fmt(balance)} color={balance >= 0 ? 'text-[#1a1a1a]' : 'text-red-700'} />
        <StatCard icon={<PiggyBank className="text-green-700" size={12} />} label="Fichajes" value={fmt(transferBudget)} color="text-green-800" />
        <StatCard icon={<Wallet className="text-amber-700" size={12} />} label="Tope Salarial/Mes" value={fmt(wageBudget)} color="text-amber-800" />
      </div>

      {/* Mobile Tab Switcher so everything fits WITHOUT scrolling */}
      <div className="flex md:hidden gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('FORECAST')}
          className={`flex-1 py-1 text-[9px] font-black uppercase rounded-[2px] border cursor-pointer transition-all ${
            mobileTab === 'FORECAST'
              ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
              : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
          }`}
        >
          Previsión Mensual
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('HEALTH')}
          className={`flex-1 py-1 text-[9px] font-black uppercase rounded-[2px] border cursor-pointer transition-all ${
            mobileTab === 'HEALTH'
              ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
              : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
          }`}
        >
          Salud y Masa Salarial
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1.5 overflow-hidden">
        {/* Previsión mensual */}
        <div className={`${mobileTab === 'FORECAST' ? 'flex' : 'hidden'} md:flex bg-[#e8ece8] border border-[#a0b0a0] rounded-sm shadow-sm flex-col min-h-0 overflow-hidden`}>
          <div className="border-b border-[#a0b0a0] px-2 py-1 flex items-center justify-between gap-1 shrink-0" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
            <span className="text-[#1a1a1a] font-bold text-[9px] tracking-tight uppercase truncate" style={{ fontFamily: 'Verdana, sans-serif' }}>Previsión Mensual</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm border ${proj.netMonthly >= 0 ? 'bg-green-100 border-green-300 text-green-800' : 'bg-red-100 border-red-300 text-red-800'}`}>
              {proj.netMonthly >= 0 ? '+' : ''}{fmt(proj.netMonthly)}/mes
            </span>
          </div>
          <div className="p-1.5 flex-1 flex flex-col justify-between overflow-hidden bg-white">
            <div>
              <div className="px-1 py-0.5 text-[7px] font-black text-emerald-700 uppercase tracking-widest border-b border-emerald-200">Ingresos</div>
              <Row label="Abonos" value={`+${fmt(proj.seasonTicket)}`} type="INCOME" />
              <Row label="Patrocinios" value={`+${fmt(proj.sponsorships)}`} type="INCOME" />
              <Row label="Merchandising" value={`+${fmt(proj.merchandising)}`} type="INCOME" />
              <Row label="Taquilla" value={`+${fmt(proj.gateIncome)}`} type="INCOME" />
              <div className="px-1 py-0.5 mt-1 text-[7px] font-black text-red-700 uppercase tracking-widest border-b border-red-200">Gastos</div>
              <Row label={`Sueldos plantel (${players.length})`} value={`-${fmt(proj.playerSalaries)}`} type="EXPENSE" />
              <Row label={`Sueldos staff (${staffList.length})`} value={`-${fmt(proj.staffSalaries)}`} type="EXPENSE" />
              <Row label="Operativos" value={`-${fmt(proj.operational)}`} type="EXPENSE" />
            </div>
            <div className="mt-1 px-1.5 py-1 bg-[#f0f4f0] border-t border-[#a0b0a0] flex justify-between items-center shrink-0">
              <span className="font-black text-slate-600 text-[8px] uppercase tracking-tighter">Neto mensual</span>
              <span className={`font-black text-xs sm:text-sm italic tracking-tighter ${proj.netMonthly >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(proj.netMonthly)}</span>
            </div>
          </div>
        </div>

        {/* Salud financiera */}
        <div className={`${mobileTab === 'HEALTH' ? 'flex' : 'hidden'} md:flex bg-[#e8ece8] border border-[#a0b0a0] rounded-sm shadow-sm flex-col min-h-0 overflow-hidden`}>
          <div className="border-b border-[#a0b0a0] px-2 py-1 flex items-center justify-between gap-1 shrink-0" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
            <span className="text-[#1a1a1a] font-bold text-[9px] tracking-tight uppercase truncate" style={{ fontFamily: 'Verdana, sans-serif' }}>Salud Financiera</span>
            <PiggyBank size={12} className="text-[#1a2a1a]" />
          </div>
          <div className="p-2 flex-1 flex flex-col justify-between gap-1.5 bg-white overflow-hidden">
            <p className={`text-[9px] font-bold uppercase tracking-tight leading-snug ${balance >= stableBalanceThreshold ? 'text-slate-700' : 'text-red-700'}`}>
              {balance >= strongBalanceThreshold && salaryOk ? 'Situación excelente: libertad para reforzar el plantel.' :
               balance >= stableBalanceThreshold && salaryOk ? 'Economía estable: vigila los sueldos y el balance mensual.' :
               !salaryOk ? 'Masa salarial excedida: consultá al Tesorero o vendé/cedé jugadores.' :
               'Situación ajustada: consultá al Tesorero y cuidá el flujo mensual.'}
            </p>
            <div className="bg-[#f7faf7] p-2 rounded-sm border border-[#a0b0a0] shadow-inner space-y-1">
              <div className="flex justify-between text-[8px] font-black uppercase text-slate-600 tracking-tighter">
                <span>Masa salarial mensual</span>
                <span className={salaryOk ? 'text-blue-700' : 'text-red-600'}>{wagePct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-[1px] overflow-hidden border border-[#a0b0a0]">
                <div className={`h-full transition-all duration-700 ${salaryOk ? 'bg-gradient-to-r from-blue-700 to-blue-500' : 'bg-red-600'}`} style={{ width: `${Math.min(100, wagePct)}%` }} />
              </div>
              <div className="flex justify-between items-center pt-0.5">
                <span className="flex items-center gap-1 text-[7px] text-slate-500 font-bold uppercase"><Info size={9} /> Límite mensual</span>
                <span className="text-[8px] font-black text-slate-700 uppercase">{fmt(proj.totalSalaries)} / {fmt(wageBudget)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-1.5 rounded-sm border bg-emerald-50 border-emerald-300">
                <div className="text-[7px] font-black uppercase text-emerald-700">Ingresos/mes</div>
                <div className="text-[11px] font-black text-emerald-900 font-mono">{fmt(proj.totalMonthlyIncome)}</div>
              </div>
              <div className="p-1.5 rounded-sm border bg-red-50 border-red-300">
                <div className="text-[7px] font-black uppercase text-red-700">Gastos/mes</div>
                <div className="text-[11px] font-black text-red-900 font-mono">{fmt(proj.totalMonthlyExpenses)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between bg-[#f0f4f0] border border-[#a0b0a0] rounded-sm px-2 py-1">
              <span className="text-[8px] font-black uppercase text-slate-600">Scouting disp.</span>
              <span className="text-[10px] font-black font-mono text-slate-900">{fmt(liveClub.finances.scoutingBudget || 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};