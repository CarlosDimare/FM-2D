import React, { useMemo, useState } from 'react';
import { world } from '../../services/worldManager';
import { notifyClubs, useWorldStore } from '../../stores/worldStore';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import { getTreasurer } from '../../services/staffAdviceService';
import { CharacterDialog } from './CharacterDialog';
import { SpeechBubble } from './SpeechBubble';
import { FMButton } from '../FMUI';
import { ArrowLeftRight, TrendingUp, ShieldAlert, PiggyBank, CheckCircle2 } from 'lucide-react';

const fmt = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}k`;
  return `${sign}£${abs.toFixed(0)}`;
};

export const TreasurerDialog: React.FC = () => {
  const { kind, data, close } = useDialogueStore();
  const currentDate = useGameStore(s => s.currentDate) || new Date();
  const clubs = useWorldStore(s => s.clubs);
  const [reply, setReply] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<'DIAGNOSIS' | 'PROJECTION' | 'WAGES'>('DIAGNOSIS');

  const clubId = data?.clubId;
  const club = clubs.find(c => c.id === clubId) || (clubId ? world.getClub(clubId) : undefined);
  const treasurer = useMemo(() => (clubId ? getTreasurer(clubId) : null), [clubId]);

  if (kind !== 'TREASURER' || !club) return null;

  const staffName = treasurer?.name || 'Tesorero del Club';
  const iniciales = staffName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const clubPrimary = club.primaryColor || 'bg-[#3a4a3a]';

  const players = world.getPlayersByClub(club.id);
  const staffList = world.getStaffByClub(club.id);
  const currentSalaries =
    players.reduce((s, p) => s + p.salary, 0) +
    staffList.reduce((s, st) => s + st.salary, 0);

  const sponsorships = Math.round(club.reputation * 80);
  const seasonTicket = Math.round(club.stadiumCapacity * 0.35 * 12 * 0.45);
  const merchandising = Math.round(club.reputation * 25);
  const totalMonthlyIncome = club.finances.monthlyIncome + sponsorships + seasonTicket + merchandising;
  const operational = club.reputation * 10;
  const totalMonthlyExpense = currentSalaries + operational;
  const netMonthly = totalMonthlyIncome - totalMonthlyExpense;
  const projected6m = club.finances.balance + netMonthly * 6;
  const wagePct = club.finances.wageBudget > 0 ? (currentSalaries / club.finances.wageBudget) * 100 : 100;

  const highestPaid = [...players].sort((a, b) => b.salary - a.salary).slice(0, 3);

  const mainAdvice =
    club.finances.balance < 1_000_000
      ? `Señor, la caja está ajustada (${fmt(club.finances.balance)}). Te recomiendo frenar fichajes caros, vender jugadores sin minutos y cuidar la masa salarial (${wagePct.toFixed(0)}%).`
      : wagePct > 95
      ? `Señor, estamos al límite del presupuesto salarial (${wagePct.toFixed(0)}%). Podemos mover parte del presupuesto de fichajes hacia sueldos para evitar sanciones o renovaciones fallidas.`
      : netMonthly < 0
      ? `Tenemos buen colchón (${fmt(club.finances.balance)}), pero el balance mensual da ${fmt(netMonthly)}/mes. Conviene vigilar los contratos más altos.`
      : `Las cuentas están sanas: saldo de ${fmt(club.finances.balance)} y un superávit estimado de ${fmt(netMonthly)}/mes. Tenés margen para reforzar el plantel o mejorar instalaciones.`;

  const handleTransferToWages = () => {
    const move = Math.round(club.finances.transferBudget * 0.2);
    if (move < 5000) {
      setReply('No queda suficiente presupuesto de fichajes para transferir hacia salarios.');
      return;
    }
    club.finances.transferBudget -= move;
    club.finances.wageBudget += Math.round(move / 12);
    notifyClubs();
    world.addInboxMessage('FINANCE', 'Ajuste presupuestario del Tesorero', `${staffName} reasignó ${fmt(move)} del presupuesto de fichajes al margen salarial (+${fmt(Math.round(move / 12))}/mes).`, currentDate, treasurer?.id);
    setReply(`Listo, Señor. Reasigné ${fmt(move)} de fichajes hacia salarios (+${fmt(Math.round(move / 12))}/mes de margen).`);
  };

  const handleWagesToTransfer = () => {
    const surplus = club.finances.wageBudget - currentSalaries;
    if (surplus < 2000) {
      setReply('No hay margen salarial sobrante para pasar a fichajes. Primero liberá algún sueldo.');
      return;
    }
    const monthlyShift = Math.round(surplus * 0.5);
    const transferGain = monthlyShift * 10;
    club.finances.wageBudget -= monthlyShift;
    club.finances.transferBudget += transferGain;
    notifyClubs();
    world.addInboxMessage('FINANCE', 'Fondos liberados para fichajes', `${staffName} convirtió ${fmt(monthlyShift)}/mes de margen salarial en ${fmt(transferGain)} extra para fichajes.`, currentDate, treasurer?.id);
    setReply(`Excelente. Convertí ${fmt(monthlyShift)}/mes de ahorro salarial en ${fmt(transferGain)} adicionales para fichajes.`);
  };

  const handleBoostScouting = () => {
    const cost = Math.min(25000, Math.round(club.finances.transferBudget * 0.05));
    if (cost < 2000) {
      setReply('No tenemos fondos disponibles en fichajes para ampliar la partida de scouting ahora mismo.');
      return;
    }
    club.finances.transferBudget -= cost;
    club.finances.scoutingBudget += cost;
    notifyClubs();
    setReply(`Hecho. Transferí ${fmt(cost)} al presupuesto de scouting (ahora en ${fmt(club.finances.scoutingBudget)}).`);
  };

  return (
    <CharacterDialog
      nombre={staffName}
      cargo="Tesorero del Club"
      iniciales={iniciales}
      clubColor={clubPrimary}
      onClose={close}
      footer={
        <FMButton variant="secondary" onClick={close} className="px-6 py-2 text-[10px]">
          Cerrar
        </FMButton>
      }
    >
      <div className="space-y-3">
        <SpeechBubble
          texto={reply || mainAdvice}
          subtitulo={reply ? 'Ajuste aplicado en tesorería' : `Saldo: ${fmt(club.finances.balance)} · Neto: ${fmt(netMonthly)}/mes`}
        />

        {/* Preguntas rápidas al Tesorero */}
        <div className="flex gap-1 bg-[#bcc8bc] p-1 rounded-sm border border-[#a0b0a0]">
          {([
            ['DIAGNOSIS', 'Reasignar Presupuesto'],
            ['PROJECTION', 'Proyección 6 Meses'],
            ['WAGES', 'Sueldos Altos'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setActiveTopic(id); setReply(null); }}
              className={`flex-1 py-1.5 px-2 text-[9px] font-black uppercase rounded-[1px] transition-all cursor-pointer ${
                activeTopic === id ? 'bg-[#3a4a3a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTopic === 'DIAGNOSIS' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleTransferToWages}
              className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
                <ArrowLeftRight size={13} className="text-[#2b5d2c]" /> Fichajes → Salarios
              </div>
              <p className="text-[9px] text-slate-600 mt-1">Pasa 20% de fichajes al presupuesto salarial mensual.</p>
            </button>
            <button
              type="button"
              onClick={handleWagesToTransfer}
              className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
                <PiggyBank size={13} className="text-emerald-700" /> Salarios → Fichajes
              </div>
              <p className="text-[9px] text-slate-600 mt-1">Convierte el margen salarial libre en caja para refuerzos.</p>
            </button>
            <button
              type="button"
              onClick={handleBoostScouting}
              className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
                <TrendingUp size={13} className="text-amber-700" /> Ampliar Scouting
              </div>
              <p className="text-[9px] text-slate-600 mt-1">Asigna hasta £25k extra al fondo de ojeo del club.</p>
            </button>
          </div>
        )}

        {activeTopic === 'PROJECTION' && (
          <div className="bg-white border border-[#a0b0a0] rounded-sm p-3 space-y-2 text-[10px]">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm p-2">
                <div className="text-[8px] font-black uppercase text-slate-500">Ingresos / Mes</div>
                <div className="font-mono font-black text-emerald-700 text-xs">{fmt(totalMonthlyIncome)}</div>
              </div>
              <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm p-2">
                <div className="text-[8px] font-black uppercase text-slate-500">Gastos / Mes</div>
                <div className="font-mono font-black text-red-700 text-xs">{fmt(totalMonthlyExpense)}</div>
              </div>
              <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm p-2">
                <div className="text-[8px] font-black uppercase text-slate-500">Saldo en 6 Meses</div>
                <div className={`font-mono font-black text-xs ${projected6m >= 0 ? 'text-slate-900' : 'text-red-700'}`}>{fmt(projected6m)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-slate-700">
              {projected6m >= club.finances.balance ? (
                <><CheckCircle2 size={13} className="text-emerald-700 shrink-0" /> Tendencia positiva: el club generará {fmt(netMonthly * 6)} en el próximo semestre.</>
              ) : (
                <><ShieldAlert size={13} className="text-amber-600 shrink-0" /> Atención: a este ritmo perderemos {fmt(Math.abs(netMonthly * 6))} en 6 meses si no vendemos o recortamos sueldos.</>
              )}
            </div>
          </div>
        )}

        {activeTopic === 'WAGES' && (
          <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 space-y-1.5">
            <div className="text-[9px] font-black uppercase text-slate-500">Contratos más elevados del plantel</div>
            {highestPaid.map(p => (
              <div key={p.id} className="flex items-center justify-between text-[10px] py-1 border-b border-slate-100 last:border-0">
                <span className="font-bold text-slate-900 truncate">{p.name} <span className="text-[8px] text-slate-500">({p.positions[0]}, {p.age}a)</span></span>
                <span className="font-mono font-black text-amber-800">{fmt(p.salary)}/mes</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </CharacterDialog>
  );
};
