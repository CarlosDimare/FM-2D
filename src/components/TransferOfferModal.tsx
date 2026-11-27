import React, { useState, useMemo } from 'react';
import { Player } from '../types';
import { world } from '../services/worldManager';
import { notifyOffers } from '../stores/worldStore';
import { X, DollarSign, ShieldAlert, Clock, Percent, CheckCircle2, AlertTriangle } from 'lucide-react';

interface TransferOfferModalProps {
  player: Player;
  userClubId: string;
  onClose: () => void;
  onOfferMade: () => void;
  currentDate: Date;
}

const INTEREST_BADGE: Record<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE', { label: string; cls: string }> = {
  HIGH: { label: 'Interés Alto', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  MEDIUM: { label: 'Interés Moderado', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  LOW: { label: 'Interés Bajo', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  NONE: { label: 'Sin Interés', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

export const TransferOfferModal: React.FC<TransferOfferModalProps> = ({
  player,
  userClubId,
  onClose,
  onOfferMade,
  currentDate,
}) => {
  const [offerType, setOfferType] = useState<'PURCHASE' | 'LOAN'>('PURCHASE');
  const [amount, setAmount] = useState(player.value);
  const [wageShare, setWageShare] = useState(100);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resultMsg, setResultMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const userClub = world.getClub(userClubId);
  const targetClub = world.getClub(player.clubId);

  const viability = useMemo(
    () =>
      world.evaluateTransferViability(
        player.id,
        userClubId,
        offerType,
        offerType === 'PURCHASE' ? amount : 0,
        wageShare
      ),
    [player.id, userClubId, offerType, amount, wageShare]
  );

  const interestInfo = INTEREST_BADGE[viability.interestLevel];

  const handleSubmit = async () => {
    if (!viability.allowed) return;
    setErrorMsg(null);
    setLoading(true);
    await new Promise(r => setTimeout(r, 250));
    const res = world.makeTransferOffer(
      player.id,
      userClubId,
      offerType === 'PURCHASE' ? amount : 0,
      offerType,
      currentDate,
      wageShare
    );
    setLoading(false);
    if (!res.ok) {
      setErrorMsg(res.message);
      return;
    }
    notifyOffers();
    onOfferMade();
    setResultMsg(res.message);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[1050] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-[#2a3a2a] w-full max-w-md rounded-2xl shadow-2xl border border-[#1a2a1a] overflow-hidden flex flex-col">
        <header className="p-5 bg-[#1a2a1a] border-b border-[#3a4a3a] flex justify-between items-center">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">Realizar Oferta</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest truncate">
              {player.name} · {targetClub?.shortName || 'Club'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X size={22} />
          </button>
        </header>

        <div className="p-6 space-y-4">
          {!submitted ? (
            <>
              <div className="flex bg-slate-900 p-1 rounded-lg border border-[#3a4a3a]">
                <button
                  type="button"
                  onClick={() => {
                    setOfferType('PURCHASE');
                    setAmount(player.value);
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 text-xs font-black rounded transition-all uppercase tracking-widest cursor-pointer ${
                    offerType === 'PURCHASE' ? 'bg-[#3a4a3a] text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fichaje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOfferType('LOAN');
                    setAmount(0);
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 text-xs font-black rounded transition-all uppercase tracking-widest cursor-pointer ${
                    offerType === 'LOAN' ? 'bg-[#3a4a3a] text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cesión
                </button>
              </div>

              {/* Resumen de Viabilidad Realista */}
              <div className="bg-slate-900/70 border border-[#3a4a3a] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black uppercase text-slate-400">Disposición del jugador</span>
                  <span className={`px-2 py-0.5 rounded-[2px] border text-[9px] font-black uppercase ${interestInfo.cls}`}>
                    {interestInfo.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-400 block text-[8.5px] uppercase font-bold">Presupuesto fichajes</span>
                    <span className="font-mono font-bold text-white">
                      £{(userClub?.finances.transferBudget || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[8.5px] uppercase font-bold">Margen salarial / mes</span>
                    <span className={`font-mono font-bold ${viability.remainingWageRoom >= viability.expectedSalary ? 'text-emerald-400' : 'text-amber-400'}`}>
                      £{Math.max(0, viability.remainingWageRoom).toLocaleString()}/mes
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800 text-[10px]">
                  <span className="text-slate-400 uppercase font-bold">Sueldo estimado del jugador</span>
                  <span className="font-mono font-bold text-blue-300">£{viability.expectedSalary.toLocaleString()}/mes</span>
                </div>
              </div>

              {offerType === 'PURCHASE' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <span>Valor: £{player.value.toLocaleString()}</span>
                    <span className="text-amber-300">Tasación aprox: £{viability.askingPrice.toLocaleString()}</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">
                      Monto de la Oferta (£)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
                      <input
                        type="number"
                        min={1000}
                        step={10000}
                        className="w-full bg-slate-900 border border-[#3a4a3a] rounded-xl pl-12 pr-6 py-3.5 text-white focus:ring-2 focus:ring-amber-500 outline-none font-bold font-mono"
                        value={amount}
                        onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">
                      Contribución Salarial (%)
                    </label>
                    <div className="relative">
                      <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
                      <select
                        className="w-full bg-slate-900 border border-[#3a4a3a] rounded-xl pl-12 pr-6 py-3.5 text-white focus:ring-2 focus:ring-amber-500 outline-none font-bold appearance-none"
                        value={wageShare}
                        onChange={(e) => setWageShare(Number(e.target.value))}
                      >
                        <option value={30}>30%</option>
                        <option value={50}>50%</option>
                        <option value={70}>70%</option>
                        <option value={100}>100%</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase text-right">
                      Costo mensual asumido: £{Math.round((player.salary * wageShare) / 100).toLocaleString()}/mes
                    </p>
                  </div>
                </div>
              )}

              {viability.reasons.length > 0 && (
                <div
                  className={`p-3 rounded-lg border text-xs font-semibold space-y-1 ${
                    !viability.allowed
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {viability.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {!viability.allowed ? (
                        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      )}
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}

              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-center gap-2 text-red-300 text-xs font-bold">
                  <ShieldAlert size={15} /> {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !viability.allowed}
                className={`w-full py-4 flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-[0.15em] shadow-xl transition-all active:scale-95 ${
                  loading || !viability.allowed
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-[#4a6a4a] hover:bg-[#5a7a5a] text-white cursor-pointer'
                }`}
              >
                {loading
                  ? 'Procesando...'
                  : !viability.allowed
                  ? 'Operación Inviable'
                  : 'Enviar Oferta'}
              </button>
            </>
          ) : (
            <div className="text-center py-6 animate-zoom-in">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-500/10 border-2 border-blue-400 text-blue-400">
                {resultMsg.toLowerCase().includes('cláusula') ? <CheckCircle2 size={32} /> : <Clock size={32} />}
              </div>
              <h4 className="text-xl font-black uppercase italic tracking-tighter mb-2 text-white">
                Oferta Enviada
              </h4>
              <p className="text-slate-300 text-xs leading-relaxed mb-6 font-bold">
                {resultMsg || 'Espera la respuesta del club en el buzón o Centro de Fichajes.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-xl uppercase tracking-widest text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

