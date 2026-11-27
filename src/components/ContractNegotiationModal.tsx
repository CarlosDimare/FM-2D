import React, { useState, useMemo } from 'react';
import { Player, TransferOffer } from '../types';
import { world } from '../services/worldManager';
import { notifyPlayers, notifyClubs, notifyOffers } from '../stores/worldStore';
import { X, DollarSign, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';

interface ContractNegotiationModalProps {
  player: Player;
  userClubId: string;
  currentDate: Date;
  onClose: () => void;
  onRenewed: () => void;
  mode?: 'RENEWAL' | 'SIGNING' | 'FREE_AGENT';
  offer?: TransferOffer;
}

export const ContractNegotiationModal: React.FC<ContractNegotiationModalProps> = ({
  player,
  userClubId,
  currentDate,
  onClose,
  onRenewed,
  mode = 'RENEWAL',
  offer,
}) => {
  const userClub = world.getClub(userClubId);
  const requestedSalary = useMemo(() => {
    if (!userClub) return player.salary;
    if (mode === 'RENEWAL' && player.requestedSalary) return player.requestedSalary;
    return world.getRequestedSalary(player, userClub);
  }, [player.id, userClubId, mode]);

  const [proposedSalary, setProposedSalary] = useState(requestedSalary);
  const [years, setYears] = useState(3);
  const [feedback, setFeedback] = useState<{ text: string; type: 'SUCCESS' | 'ERROR' | 'NEUTRAL' } | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const currentPayroll = useMemo(() => {
    const pSum = world.getPlayersByClub(userClubId).reduce((s, p) => s + p.salary, 0);
    const sSum = world.getStaffByClub(userClubId).reduce((s, st) => s + st.salary, 0);
    return pSum + sSum;
  }, [userClubId]);

  const maxAllowedWage = userClub ? Math.round(userClub.finances.wageBudget * 1.05) : Infinity;
  const remainingRoom = userClub
    ? Math.max(0, userClub.finances.wageBudget - (mode === 'RENEWAL' ? currentPayroll - player.salary : currentPayroll))
    : 0;

  const handleSubmit = () => {
    if (!userClub) return;

    const potentialSalaries =
      mode === 'RENEWAL' ? currentPayroll - player.salary + proposedSalary : currentPayroll + proposedSalary;

    if (potentialSalaries > maxAllowedWage) {
      setFeedback({
        text: `Superas el presupuesto salarial mensual del club (margen disponible: £${remainingRoom.toLocaleString()}/mes).`,
        type: 'ERROR',
      });
      return;
    }

    const result = world.submitContractOffer(player, proposedSalary, years, currentDate, userClub);

    if (result === 'ACCEPTED') {
      if (mode === 'SIGNING' && offer) {
        const res = world.completeTransferWithContract(offer, proposedSalary, years, currentDate);
        if (!res.ok) {
          setFeedback({ text: res.message, type: 'ERROR' });
          return;
        }
      } else if (mode === 'FREE_AGENT') {
        const res = world.signFreeAgent(player.id, userClubId, proposedSalary, years, currentDate);
        if (!res.ok) {
          setFeedback({ text: res.message, type: 'ERROR' });
          return;
        }
      }
      notifyPlayers();
      notifyClubs();
      notifyOffers();
      setFeedback({
        text:
          mode === 'RENEWAL'
            ? '¡El jugador aceptó renovar su vínculo!'
            : `¡Acuerdo total! ${player.name} firmó su contrato con ${userClub.shortName}.`,
        type: 'SUCCESS',
      });
      setIsLocked(true);
      setTimeout(() => {
        onRenewed();
      }, 1300);
    } else if (result === 'BROKEN') {
      if (mode === 'SIGNING' && offer) {
        offer.status = 'REJECTED';
        offer.responseDate = currentDate;
        notifyOffers();
      }
      setFeedback({ text: 'Negociaciones rotas. El futbolista y su agente se retiran de la mesa.', type: 'ERROR' });
      setIsLocked(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      const reactions = [
        'Esa cifra mensual es insuficiente para un jugador de mi nivel.',
        'Esperaba un contrato más cercano a mis pretensiones.',
        'Tendrás que mejorar los términos si quieres que firme.',
        'Mi representante considera que debemos acercarnos más a lo pedido.',
      ];
      setFeedback({ text: reactions[Math.floor(Math.random() * reactions.length)], type: 'NEUTRAL' });
    }
  };

  const titleLabel =
    mode === 'SIGNING'
      ? 'Contrato de Fichaje'
      : mode === 'FREE_AGENT'
      ? 'Contrato (Agente Libre)'
      : 'Renovación de Contrato';

  return (
    <div className="fixed inset-0 bg-black/85 z-[1050] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-[#2a3a2a] w-full max-w-lg rounded-2xl shadow-2xl border border-[#1a2a1a] overflow-hidden flex flex-col">
        <header className="p-5 bg-[#1a2a1a] border-b border-[#3a4a3a] flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">{titleLabel}</h2>
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest">
              {player.name} · {player.positions[0]} · {player.age} años
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" disabled={isLocked}>
            <X size={24} />
          </button>
        </header>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-[#3a4a3a]">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                {mode === 'FREE_AGENT' ? 'Último Sueldo' : 'Sueldo Actual'}
              </p>
              <p className="text-lg font-bold text-white font-mono">£{player.salary.toLocaleString()}/mes</p>
            </div>
            <div className="bg-blue-900/20 p-3.5 rounded-xl border border-blue-500/25">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Sueldo Pretendido</p>
              <p className="text-lg font-bold text-blue-300 font-mono">£{requestedSalary.toLocaleString()}/mes</p>
            </div>
          </div>

          <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-[#3a4a3a] flex justify-between items-center text-[10px] font-bold">
            <span className="text-slate-400 uppercase">Margen salarial mensual disponible</span>
            <span className={`font-mono ${remainingRoom >= proposedSalary ? 'text-emerald-400' : 'text-amber-400'}`}>
              £{remainingRoom.toLocaleString()}/mes
            </span>
          </div>

          {feedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 animate-fade-up ${
                feedback.type === 'SUCCESS'
                  ? 'bg-green-500/10 border-green-500/25 text-green-300'
                  : feedback.type === 'ERROR'
                  ? 'bg-red-500/10 border-red-500/25 text-red-300'
                  : 'bg-slate-700/50 border-slate-600 text-slate-200'
              }`}
            >
              {feedback.type === 'SUCCESS' ? (
                <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
              ) : (
                <AlertCircle className="shrink-0 mt-0.5" size={18} />
              )}
              <p className="text-xs italic">{feedback.text}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">
                Propuesta Salarial Mensual (£/mes)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
                <input
                  type="number"
                  min={500}
                  step={500}
                  disabled={isLocked}
                  className="w-full bg-slate-900 border border-[#3a4a3a] rounded-xl pl-12 pr-6 py-3.5 text-white focus:ring-2 focus:ring-amber-500 outline-none font-bold font-mono"
                  value={proposedSalary}
                  onChange={(e) => setProposedSalary(Math.max(500, Number(e.target.value) || 500))}
                />
              </div>
              <div className="flex justify-between px-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Paciencia: {Math.max(0, 3 - player.negotiationAttempts)}/3 intentos
                </span>
                <span className={`text-[10px] font-bold ${proposedSalary >= requestedSalary ? 'text-green-400' : 'text-yellow-400'}`}>
                  {proposedSalary >= requestedSalary ? 'Oferta acorde' : 'Por debajo de lo pedido'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">Duración del Vínculo</label>
              <div className="flex bg-slate-900 p-1 rounded-xl border border-[#3a4a3a]">
                {[1, 2, 3, 4, 5].map(y => (
                  <button
                    key={y}
                    type="button"
                    disabled={isLocked}
                    onClick={() => setYears(y)}
                    className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      years === y ? 'bg-[#3a4a3a] text-white shadow-lg' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {y} {y === 1 ? 'AÑO' : 'AÑOS'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLocked}
              className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.15em] shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                isLocked ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-[#4a6a4a] hover:bg-[#5a7a5a] text-white'
              }`}
            >
              <TrendingUp size={18} /> Enviar Oferta Salarial
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLocked}
              className="w-full py-2.5 text-slate-400 hover:text-red-400 transition-colors text-[10px] font-black tracking-widest uppercase cursor-pointer"
            >
              Retirarse de la negociación
            </button>
          </div>
        </div>

        <div className="bg-slate-900 p-3.5 border-t border-[#3a4a3a] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#3a4a3a] flex items-center justify-center text-amber-400 shrink-0">
            <AlertCircle size={16} />
          </div>
          <p className="text-[9.5px] text-slate-400 leading-tight uppercase font-bold tracking-wider">
            Un jugador con alta lealtad valora el proyecto deportivo; no fuerces ofertas muy por debajo de su pretensión o romperá la charla.
          </p>
        </div>
      </div>
    </div>
  );
};

