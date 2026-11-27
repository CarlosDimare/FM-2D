import React, { useState, useMemo } from 'react';
import { world } from '../services/worldManager';
import { TransferOffer } from '../types';
import { notifyPlayers, notifyClubs, notifyOffers, useWorldStore } from '../stores/worldStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { showToast } from '../stores/feedbackStore';
import { MessageSquare, History, Clock, ArrowRightLeft, DollarSign, Info, UserCheck, FolderOpen, Check, X } from 'lucide-react';
import { FMButton } from './FMUI';
import { openClubSquad, useUIStore } from '../stores/uiStore';
import { ContractNegotiationModal } from './ContractNegotiationModal';

interface NegotiationsViewProps {
  userClubId: string;
  currentDate: Date;
}

export const NegotiationsView: React.FC<NegotiationsViewProps> = ({ userClubId, currentDate }) => {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [signingOffer, setSigningOffer] = useState<TransferOffer | null>(null);
  const [counterDrafts, setCounterDrafts] = useState<Record<string, number>>({});
  const [openCounterId, setOpenCounterId] = useState<string | null>(null);

  const worldTick = useWorldStore(s => s._tick);

  const offers = useMemo(() => {
    return world.offers
      .filter(o => o.fromClubId === userClubId || o.toClubId === userClubId)
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [userClubId, worldTick]);

  const activeOffers = offers.filter(o => o.status !== 'COMPLETED' && o.status !== 'REJECTED');
  const historyOffers = offers.filter(o => o.status === 'COMPLETED' || o.status === 'REJECTED');

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return 'bg-green-100 text-green-800 border-green-300';
      case 'REJECTED': return 'bg-red-100 text-red-800 border-red-300';
      case 'COUNTER_OFFER': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'COMPLETED': return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return 'Aceptada (Club)';
      case 'REJECTED': return 'Rechazada';
      case 'COUNTER_OFFER': return 'Contraoferta';
      case 'PENDING': return 'Pendiente';
      case 'COMPLETED': return 'Completado';
      default: return status;
    }
  };

  const handleFinalize = (offer: TransferOffer) => {
    const player = world.getPlayer(offer.playerId);
    if (!player) return;

    if (offer.type === 'PURCHASE') {
      setSigningOffer(offer);
      return;
    }

    // Cesión: validar margen salarial mensual
    const buyer = world.getClub(userClubId);
    if (buyer) {
      const loanCost = Math.round(player.salary * ((offer.wageShare || 100) / 100));
      const payroll =
        world.getPlayersByClub(userClubId).reduce((s, p) => s + p.salary, 0) +
        world.getStaffByClub(userClubId).reduce((s, st) => s + st.salary, 0);
      if (payroll + loanCost > buyer.finances.wageBudget * 1.05) {
        showToast('Superas el tope salarial mensual disponible para asumir esta cesión.', 'warning');
        return;
      }
    }

    world.completeLoan(offer);
    notifyPlayers();
    notifyClubs();
    notifyOffers();
    showToast(`¡Cesión cerrada! ${player.name} se sumó a tu plantel.`, 'success');
  };

  const handleIncomingAction = (offer: TransferOffer, action: 'ACCEPT' | 'REJECT' | 'COUNTER') => {
    const draft = counterDrafts[offer.id] ?? Math.round(offer.amount * 1.2);
    const res = world.respondToIncomingOffer(offer.id, action, draft, currentDate);
    setOpenCounterId(null);
    notifyPlayers();
    notifyClubs();
    notifyOffers();
    showToast(res.message, res.ok ? 'info' : 'warning');
  };

  const renderOfferRow = (offer: TransferOffer) => {
    const player = world.getPlayer(offer.playerId);
    const toClub = world.getClub(offer.toClubId);
    const fromClub = world.getClub(offer.fromClubId);
    const isBuying = offer.fromClubId === userClubId;
    const isIncomingPending = !isBuying && offer.toClubId === userClubId && offer.status === 'PENDING';

    return (
      <div key={offer.id} className="bg-white border border-[#a0b0a0] rounded-sm p-4 shadow-sm hover:border-[#3a4a3a] transition-all group mb-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white shrink-0 shadow-inner ${isBuying ? 'bg-[#3a4a3a]' : 'bg-[#6b7e6b]'}`}>
              {isBuying ? <ArrowRightLeft size={20} /> : <DollarSign size={20} />}
            </div>
            <div className="min-w-0">
              {player ? (
                <button
                  type="button"
                  onClick={() => useUIStore.getState().setSelectedPlayer(player)}
                  className="text-slate-900 font-black text-sm uppercase italic truncate hover:underline cursor-pointer text-left block max-w-full"
                >
                  {player.name}
                </button>
              ) : (
                <h4 className="text-slate-900 font-black text-sm uppercase italic truncate">Jugador desconocido</h4>
              )}
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-tight truncate">
                {isBuying ? (
                  toClub ? (
                    <>
                      Club vendedor:{' '}
                      <button
                        type="button"
                        onClick={() => openClubSquad(toClub.id, world.clubs)}
                        className="text-[#1f5922] hover:underline cursor-pointer uppercase font-bold"
                      >
                        {toClub.name}
                      </button>
                    </>
                  ) : (
                    'Destino: Otro Club'
                  )
                ) : fromClub ? (
                  <>
                    Oferta entrante de:{' '}
                    <button
                      type="button"
                      onClick={() => openClubSquad(fromClub.id, world.clubs)}
                      className="text-[#1f5922] hover:underline cursor-pointer uppercase font-bold"
                    >
                      {fromClub.name}
                    </button>
                  </>
                ) : (
                  `Hacia: ${toClub?.name || 'Tu Club'}`
                )}
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="bg-slate-50 p-2 rounded border border-slate-100">
              <p className="text-[8px] uppercase font-black text-slate-400">Tipo de Trato</p>
              <p className="text-[10px] font-bold text-slate-800 uppercase">
                {offer.type === 'PURCHASE' ? 'Traspaso' : 'Cesión'}
              </p>
            </div>

            <div className="bg-slate-50 p-2 rounded border border-slate-100">
              <p className="text-[8px] uppercase font-black text-slate-400">
                {offer.type === 'PURCHASE' ? 'Monto' : 'Sueldo asumido'}
              </p>
              <p className="text-[10px] font-bold text-slate-900 font-mono">
                {offer.type === 'PURCHASE'
                  ? `£${offer.amount.toLocaleString()}`
                  : `${offer.wageShare}% (£${Math.round(((player?.salary || 0) * offer.wageShare) / 100).toLocaleString()}/mes)`}
              </p>
            </div>

            <div className="col-span-2 md:col-span-1 flex flex-col justify-center">
              <div className={`px-3 py-1 rounded-[2px] border text-[9px] font-black uppercase tracking-tighter text-center ${getStatusStyle(offer.status)}`}>
                {getStatusLabel(offer.status)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
            {offer.status === 'COUNTER_OFFER' && isBuying && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    world.acceptCounterOffer(offer.id, currentDate);
                    notifyOffers();
                    showToast(
                      offer.status === 'ACCEPTED'
                        ? 'Contraoferta aceptada. Ahora negocia el contrato personal.'
                        : 'Presupuesto insuficiente para aceptar la contraoferta.',
                      offer.status === 'ACCEPTED' ? 'success' : 'warning'
                    );
                  }}
                  className="flex-1 md:flex-none bg-gradient-to-b from-[#e0a040] to-[#b07020] text-white text-[9px] font-black px-3.5 py-2 rounded-[2px] shadow-sm hover:brightness-110 uppercase tracking-wider cursor-pointer"
                >
                  Aceptar £{(offer.counterAmount || offer.amount).toLocaleString()}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    offer.status = 'REJECTED';
                    offer.responseDate = currentDate;
                    notifyOffers();
                  }}
                  className="bg-slate-200 hover:bg-red-100 text-slate-700 hover:text-red-700 text-[9px] font-black px-3 py-2 rounded-[2px] border border-slate-300 uppercase cursor-pointer"
                >
                  Rechazar
                </button>
              </>
            )}

            {offer.status === 'ACCEPTED' && isBuying && (
              <button
                type="button"
                onClick={() => handleFinalize(offer)}
                className="flex-1 md:flex-none bg-gradient-to-b from-green-600 to-green-800 text-white text-[9px] font-black px-4 py-2 rounded-[2px] shadow-md hover:brightness-110 flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer"
              >
                <UserCheck size={14} />
                {offer.type === 'PURCHASE' ? 'Negociar Contrato' : 'Cerrar Cesión'}
              </button>
            )}

            {isIncomingPending && (
              <>
                <button
                  type="button"
                  onClick={() => handleIncomingAction(offer, 'ACCEPT')}
                  className="bg-[#2b5d2c] hover:brightness-110 text-white text-[9px] font-black px-3 py-2 rounded-[2px] border border-[#133014] uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Check size={12} /> Aceptar
                </button>
                {offer.type === 'PURCHASE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setCounterDrafts(prev => ({
                        ...prev,
                        [offer.id]: prev[offer.id] ?? Math.round(offer.amount * 1.25),
                      }));
                      setOpenCounterId(prev => (prev === offer.id ? null : offer.id));
                    }}
                    className="bg-amber-600 hover:brightness-110 text-white text-[9px] font-black px-3 py-2 rounded-[2px] border border-amber-800 uppercase cursor-pointer"
                  >
                    Contraofertar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleIncomingAction(offer, 'REJECT')}
                  className="bg-red-700 hover:brightness-110 text-white text-[9px] font-black px-3 py-2 rounded-[2px] border border-red-900 uppercase flex items-center gap-1 cursor-pointer"
                >
                  <X size={12} /> Rechazar
                </button>
              </>
            )}

            {offer.status === 'PENDING' && isBuying && (
              <span className="text-[9px] text-slate-500 italic font-bold">Esperando respuesta del club...</span>
            )}
          </div>
        </div>

        {isIncomingPending && openCounterId === offer.id && (
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-300 rounded-sm flex flex-wrap items-center gap-2">
            <span className="text-[9.5px] font-black uppercase text-amber-900">Tu contraoferta (£):</span>
            <input
              type="number"
              min={10000}
              step={10000}
              value={counterDrafts[offer.id] ?? Math.round(offer.amount * 1.25)}
              onChange={(e) =>
                setCounterDrafts(prev => ({ ...prev, [offer.id]: Math.max(10000, Number(e.target.value) || 10000) }))
              }
              className="bg-white border border-amber-400 rounded-sm px-2.5 py-1 text-xs font-mono font-bold text-slate-900 w-36 outline-none"
            />
            <button
              type="button"
              onClick={() => handleIncomingAction(offer, 'COUNTER')}
              className="bg-amber-700 hover:bg-amber-800 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-[2px] cursor-pointer"
            >
              Enviar Contraoferta
            </button>
          </div>
        )}

        <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2">
          <div className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1.5">
            <Clock size={12} /> Iniciada: {new Date(offer.date).toLocaleDateString()}
          </div>
          {offer.status === 'ACCEPTED' && isBuying && (
            <span className="text-[9px] text-green-700 font-black uppercase tracking-wider">
              {offer.type === 'PURCHASE'
                ? 'Acuerdo entre clubes alcanzado. Negocia el contrato personal para cerrar el pase.'
                : 'Cesión aprobada por el club propietario.'}
            </span>
          )}
          {offer.status === 'COUNTER_OFFER' && isBuying && (
            <span className="text-[9px] text-amber-700 font-black uppercase tracking-wider">
              El club pide £{(offer.counterAmount || offer.amount).toLocaleString()} para liberar al jugador.
            </span>
          )}
          {isIncomingPending && (
            <span className="text-[9px] text-blue-700 font-black uppercase tracking-wider">
              Propuesta recibida por un futbolista de tu club · Valor actual: £{(player?.value || 0).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    );
  };

  const signingPlayer = signingOffer ? world.getPlayer(signingOffer.playerId) : undefined;

  return (
    <div className="p-2 md:p-4 h-full flex flex-col gap-4 bg-[#d4dcd4] overflow-hidden">
      <header className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Centro de Fichajes
            </h2>
            <p className="text-slate-600 font-bold text-[9px] md:text-[10px] uppercase tracking-widest italic mt-1">
              Ofertas enviadas, propuestas recibidas y cierre de contratos personales.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 items-stretch md:items-end">
            <FMButton
              onClick={() => useDialogueStore.getState().open('TRANSFERS', { clubId: userClubId, source: 'NEGOTIATIONS' })}
              className="w-full md:w-auto"
            >
              <FolderOpen size={13} /> Carpeta de refuerzos
            </FMButton>
            <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shadow-sm w-full md:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('ACTIVE')}
                className={`flex-1 md:px-6 py-2 text-[9px] font-black rounded-[1px] transition-all uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'ACTIVE' ? 'bg-[#3a4a3a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
                }`}
              >
                <MessageSquare size={14} /> ACTIVAS ({activeOffers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('HISTORY')}
                className={`flex-1 md:px-6 py-2 text-[9px] font-black rounded-[1px] transition-all uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'HISTORY' ? 'bg-[#3a4a3a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
                }`}
              >
                <History size={14} /> HISTORIAL ({historyOffers.length})
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scroll pr-1">
        <div className="flex flex-col">
          {activeTab === 'ACTIVE' ? (
            activeOffers.length === 0 ? (
              <div className="p-20 text-center text-slate-400 italic flex flex-col items-center justify-center gap-3 bg-[#e8ece8] rounded-sm border border-dashed border-[#a0b0a0]">
                <Clock size={40} className="opacity-20" />
                <p className="font-black uppercase tracking-widest text-[10px]">No hay ofertas pendientes de resolución.</p>
              </div>
            ) : (
              activeOffers.map(renderOfferRow)
            )
          ) : historyOffers.length === 0 ? (
            <div className="p-20 text-center text-slate-400 italic flex flex-col items-center justify-center gap-3 bg-[#e8ece8] rounded-sm border border-dashed border-[#a0b0a0]">
              <History size={40} className="opacity-20" />
              <p className="font-black uppercase tracking-widest text-[10px]">El historial de transferencias está vacío.</p>
            </div>
          ) : (
            historyOffers.map(renderOfferRow)
          )}
        </div>
      </div>

      <div className="bg-[#bcc8bc]/50 p-4 rounded-sm border border-[#a0b0a0] flex items-start gap-4 shrink-0 shadow-inner">
        <div className="p-2 bg-slate-100 rounded-full text-slate-700 border border-slate-300">
          <Info size={16} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-800 font-black uppercase tracking-tight">Manual de Negociación</p>
          <p className="text-[9px] text-slate-600 font-bold uppercase leading-tight mt-1">
            Una oferta aceptada por el club vendedor abre la mesa de contrato personal con el jugador. Si vendes o cedes a un futbolista, puedes aceptar, contraofertar o rechazar desde aquí mismo.
          </p>
        </div>
      </div>

      {signingOffer && signingPlayer && (
        <ContractNegotiationModal
          player={signingPlayer}
          userClubId={userClubId}
          currentDate={currentDate}
          mode="SIGNING"
          offer={signingOffer}
          onClose={() => setSigningOffer(null)}
          onRenewed={() => {
            showToast(`¡${signingPlayer.name} firmó su contrato y ya es refuerzo del club!`, 'success');
            setSigningOffer(null);
          }}
        />
      )}
    </div>
  );
};

