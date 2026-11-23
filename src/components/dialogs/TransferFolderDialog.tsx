import React, { useMemo, useState, useEffect } from 'react';
import { Binoculars, CheckSquare, DollarSign, EyeOff, FolderMinus, FolderPlus, Scale, Square, User } from 'lucide-react';
import { Player } from '../../types';
import { world } from '../../services/worldManager';
import { generateUUID } from '../../services/utils';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import { useUIStore } from '../../stores/uiStore';
import { notifyAll, useWorldStore } from '../../stores/worldStore';
import { showToast } from '../../stores/feedbackStore';
import {
  compileTransferFolder, sendOffers, getSportingDirector,
} from '../../services/staffAdviceService';
import { CharacterDialog } from './CharacterDialog';
import { SpeechBubble } from './SpeechBubble';
import { TransferFolderTable } from './TransferFolderTable';
import { TransferOfferModal } from '../TransferOfferModal';
import { FMButton } from '../FMUI';

export const TransferFolderDialog: React.FC = () => {
  const { kind, phase, result, data, setResult, setClosingPhrase, close, advance } = useDialogueStore();
  const currentDate = useGameStore(s => s.currentDate);
  const { setSelectedPlayer, comparePlayerA, setComparePlayerA, setComparePlayerB } = useUIStore();
  const worldTick = useWorldStore(s => s._tick);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [offerPlayer, setOfferPlayer] = useState<Player | null>(null);
  const [rowMenu, setRowMenu] = useState<{ playerId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (kind === 'TRANSFERS' && phase === 'opening') {
      setRevealed(false);
      setDismissedIds(new Set());
      setRowMenu(null);
      const timer = setTimeout(() => {
        advance();
        setRevealed(true);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [kind, phase, advance]);

  useEffect(() => {
    if (phase === 'closing') {
      const timer = setTimeout(() => close(), 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, close]);

  useEffect(() => {
    if (!rowMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rowMenu]);

  const clubId = data?.clubId;
  const club = clubId ? world.getClub(clubId) : undefined;

  const director = clubId ? getSportingDirector(clubId) : null;
  const directorName = director?.name || 'El Director Deportivo';
  const iniciales = directorName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const clubPrimary = club?.primaryColor || 'bg-[#3a4a3a]';

  const folder = useMemo(() => {
    const raw = club ? compileTransferFolder(club, director) : null;
    if (!raw) return null;
    const filtered = raw.candidatos.filter(c => !dismissedIds.has(c.playerId));
    raw.candidatos = filtered;
    raw.resumen = {
      aprobados: filtered.filter(c => c.viabilidad === 'VIABLE').length,
      enDuda: filtered.filter(c => c.viabilidad === 'NEGOTIABLE').length,
      rechazados: filtered.filter(c => c.viabilidad === 'INVIABLE').length,
    };
    if (director?.siguioConsejoUltimaVez) {
      raw.textoInforme = `La última vez enviamos ofertas y tuvimos respuestas. Esta vez reviso la carpeta actualizada: "${raw.textoInforme}"`;
    }
    return raw;
  }, [club, director, refreshTick, dismissedIds, worldTick]);

  const costeSeleccion = useMemo(() => {
    if (!folder) return 0;
    let total = 0;
    folder.candidatos.forEach(c => {
      if (seleccionados.has(c.playerId)) total += c.value;
    });
    return total;
  }, [seleccionados, folder]);

  if (kind !== 'TRANSFERS' || !club || !folder) return null;

  const toggle = (playerId: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
      return next;
    });
  };

  const handleOpenPlayer = (playerId: string) => {
    const p = world.getPlayer(playerId);
    if (!p) return;
    setRowMenu(null);
    setSelectedPlayer(p);
  };

  const handleOpenRowMenu = (playerId: string, clientX: number, clientY: number) => {
    const menuWidth = 228;
    const menuHeight = 250;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const x = Math.max(8, Math.min(clientX, vw - menuWidth - 8));
    const y = Math.max(8, Math.min(clientY, vh - menuHeight - 8));
    setRowMenu({ playerId, x, y });
  };

  const handleScoutPlayer = (player: Player) => {
    const refDate = currentDate || new Date();
    world.generateScoutingReport(player.id, club.id, refDate, club.id);
    notifyAll();
    setRefreshTick(t => t + 1);
    showToast(`Informe de ojeador actualizado para ${player.name}.`, 'success');
    setRowMenu(null);
  };

  const handleComparePlayer = (player: Player) => {
    if (!comparePlayerA || comparePlayerA.id === player.id) {
      setComparePlayerA(player);
      showToast(`${player.name} fijado para comparar. Elige otro jugador.`, 'info');
    } else {
      setComparePlayerB(player);
    }
    setRowMenu(null);
  };

  const handleToggleFolderMembership = (player: Player) => {
    const alreadyInFolder = world.isInTransferFolder(club.id, player.id);
    if (alreadyInFolder) {
      world.removeFromTransferFolder(club.id, player.id);
      setSeleccionados(prev => {
        const next = new Set(prev);
        next.delete(player.id);
        return next;
      });
      setDismissedIds(prev => new Set(prev).add(player.id));
      showToast(`${player.name} quitado de la carpeta de refuerzos.`, 'info');
    } else {
      world.addToTransferFolder(club.id, player.id);
      showToast(`${player.name} guardado en la carpeta de refuerzos.`, 'success');
    }
    notifyAll();
    setRefreshTick(t => t + 1);
    setRowMenu(null);
  };

  const recordEffects = (accion: string) => {
    if (!currentDate) return;
    world.addInboxMessage('MARKET', 'Carpeta de refuerzos', `${directorName}: ${accion}`, currentDate, director?.id);
    world.recordInteraction({
      id: generateUUID(),
      date: currentDate,
      channel: 'COACH_STAFF',
      actorId: 'COACH',
      targetId: director?.id || club.id,
      type: 'TRANSFER_FOLDER',
      tone: 'MODERATE',
      result: 'POSITIVE',
      moraleChange: 0,
      tensionChange: 0,
      description: accion,
    });
  };

  const handleEnviar = () => {
    if (!currentDate) return;
    const count = sendOffers(club.id, [...seleccionados], currentDate);
    if (count === 0) {
      setResult('El lote supera el presupuesto disponible. Reduce la selección o vende antes de intentarlo de nuevo, Jefe.');
      return;
    }
    recordEffects(`Envió ${count} ofertas de la carpeta de refuerzos.`);
    if (director) {
      const staff = world.getStaff(director.id);
      if (staff) staff.siguioConsejoUltimaVez = true;
    }
    setResult(`Ofertas enviadas (${count}). Ahora toca esperar la respuesta de los clubes en el centro de fichajes.`);
  };

  const handleConfirmarResultado = () => {
    setClosingPhrase('Ofertas enviadas. Ahora toca esperar la respuesta de los clubes.');
  };

  const menuPlayer = rowMenu ? world.getPlayer(rowMenu.playerId) : undefined;
  const menuPlayerInFolder = menuPlayer ? world.isInTransferFolder(club.id, menuPlayer.id) : false;
  const menuPlayerSelected = menuPlayer ? seleccionados.has(menuPlayer.id) : false;

  const footerDecision = (
    <>
      <FMButton
        variant="primary"
        onClick={handleEnviar}
        disabled={seleccionados.size === 0 || costeSeleccion > folder.presupuesto}
        className="px-6 py-2.5 text-[10px]"
      >
        Enviar ofertas ({seleccionados.size})
      </FMButton>
      <FMButton variant="secondary" onClick={() => { setSeleccionados(new Set()); close(); }} className="px-6 py-2.5 text-[10px]">
        Descartar todo
      </FMButton>
    </>
  );

  const footerResultado = (
    <FMButton variant="primary" onClick={handleConfirmarResultado} className="px-8 py-2.5 text-[10px]">
      Listo
    </FMButton>
  );

  return (
    <>
      <CharacterDialog
        nombre={directorName}
        cargo="Director Deportivo"
        iniciales={iniciales}
        clubColor={clubPrimary}
        onClose={close}
        footer={phase === 'closing' ? null : (result ? footerResultado : footerDecision)}
      >
        {phase === 'closing' ? (
          <div className="space-y-4 pt-2 animate-fade-up">
            <SpeechBubble texto={useDialogueStore.getState().closingPhrase || ''} />
            <p className="text-[9px] italic font-bold text-slate-500 uppercase tracking-widest px-1">
              Las ofertas quedaron registradas en el centro de fichajes.
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4 pt-2 animate-fade-up">
            <SpeechBubble texto={result} />
            <p className="text-[9px] italic font-bold text-slate-500 uppercase tracking-widest px-1">
              Las ofertas quedaron registradas en el centro de fichajes.
            </p>
          </div>
        ) : (
          <div className={`space-y-4 transition-all duration-500 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <SpeechBubble
              texto={`Jefe, aquí tienes la carpeta de refuerzos. Presupuesto disponible: £${(folder.presupuesto / 1000000).toFixed(1)}M. Marca a los que quieras o abre el menú de cada jugador para negociar.`}
            />

            <TransferFolderTable
              candidatos={folder.candidatos}
              seleccionados={seleccionados}
              onToggle={toggle}
              onOpenPlayer={handleOpenPlayer}
              onRowContextMenu={handleOpenRowMenu}
            />

            <div className="bg-white border border-[#a0b0a0] rounded-sm p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                📄 Informe del director deportivo
              </p>
              <p className="text-[10px] italic font-bold text-slate-700 leading-relaxed">"{folder.textoInforme}"</p>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pasa el cursor sobre el semáforo para ver la razón de cada jugador</p>
              <div className="flex flex-wrap gap-3 mt-3">
                <span className="text-[8px] font-black uppercase px-2 py-1 rounded-sm border bg-green-100 text-green-800 border-green-400">Aprobados: {folder.resumen.aprobados}</span>
                <span className="text-[8px] font-black uppercase px-2 py-1 rounded-sm border bg-amber-100 text-amber-800 border-amber-400">En duda: {folder.resumen.enDuda}</span>
                <span className="text-[8px] font-black uppercase px-2 py-1 rounded-sm border bg-red-100 text-red-800 border-red-400">Rechazados: {folder.resumen.rechazados}</span>
              </div>
              {seleccionados.size > 0 && (
                <div className={`mt-3 pt-3 border-t border-[#a0b0a0]/40 flex justify-between items-center ${costeSeleccion > folder.presupuesto ? 'text-red-700' : 'text-slate-700'}`}>
                  <span className="text-[9px] font-black uppercase tracking-widest">Coste de seleccionados</span>
                  <span className="text-[11px] font-black">£{(costeSeleccion / 1000000).toFixed(1)}M</span>
                </div>
              )}
              {costeSeleccion > folder.presupuesto && (
                <p className="mt-2 text-[9px] font-black uppercase text-red-700 bg-red-50 border border-red-300 rounded-sm px-2 py-1.5">
                  ⚠️ El coste supera el presupuesto: el envío será rechazado por el director.
                </p>
              )}
            </div>
          </div>
        )}
      </CharacterDialog>

      {rowMenu && menuPlayer && (
        <div
          className="fixed inset-0 z-[964]"
          onClick={() => setRowMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setRowMenu(null);
          }}
        >
          <div
            style={{ top: rowMenu.y, left: rowMenu.x }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[965] w-[228px] bg-[#e8ece8] border-2 border-[#1c1f24] rounded-sm shadow-2xl overflow-hidden text-slate-900"
          >
            <div className="px-2.5 py-1.5 bg-[#2d3238] border-b border-[#1c1f24] text-white">
              <p className="text-[10px] font-black uppercase truncate">{menuPlayer.name}</p>
              <p className="text-[8.5px] text-slate-300 truncate">
                {menuPlayer.positions[0]} · £{(menuPlayer.value / 1000000).toFixed(1)}M
              </p>
            </div>
            <div className="py-1 divide-y divide-[#ccd5cc]">
              <button
                type="button"
                onClick={() => handleOpenPlayer(menuPlayer.id)}
                className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#ccd9cc] cursor-pointer"
              >
                <User size={13} className="text-[#2b5d2c]" /> Ver ficha del jugador
              </button>
              <button
                type="button"
                onClick={() => {
                  setOfferPlayer(menuPlayer);
                  setRowMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#ccd9cc] cursor-pointer"
              >
                <DollarSign size={13} className="text-emerald-700" /> Enviar oferta / Negociar
              </button>
              <button
                type="button"
                onClick={() => handleScoutPlayer(menuPlayer)}
                className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#ccd9cc] cursor-pointer"
              >
                <Binoculars size={13} className="text-sky-700" /> Solicitar informe de ojeador
              </button>
              <button
                type="button"
                onClick={() => handleComparePlayer(menuPlayer)}
                className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#ccd9cc] cursor-pointer"
              >
                <Scale size={13} className="text-amber-700" />
                {comparePlayerA && comparePlayerA.id !== menuPlayer.id
                  ? `Comparar con ${comparePlayerA.name.split(' ').slice(-1)[0]}`
                  : 'Comparar jugador'}
              </button>
              <button
                type="button"
                onClick={() => {
                  toggle(menuPlayer.id);
                  setRowMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#ccd9cc] cursor-pointer"
              >
                {menuPlayerSelected ? (
                  <>
                    <CheckSquare size={13} className="text-slate-700" /> Quitar de selección en lote
                  </>
                ) : (
                  <>
                    <Square size={13} className="text-slate-700" /> Seleccionar para oferta en lote
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleToggleFolderMembership(menuPlayer)}
                className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#f7d8d8] text-rose-800 cursor-pointer"
              >
                {menuPlayerInFolder ? (
                  <>
                    <FolderMinus size={13} /> Quitar de carpeta de refuerzos
                  </>
                ) : (
                  <>
                    <FolderPlus size={13} className="text-emerald-700" />{' '}
                    <span className="text-slate-900">Guardar en carpeta fija</span>
                  </>
                )}
              </button>
              {!menuPlayerInFolder && (
                <button
                  type="button"
                  onClick={() => {
                    setSeleccionados(prev => {
                      const next = new Set(prev);
                      next.delete(menuPlayer.id);
                      return next;
                    });
                    setDismissedIds(prev => new Set(prev).add(menuPlayer.id));
                    setRowMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-[10px] font-bold flex items-center gap-2 hover:bg-[#f7d8d8] text-rose-800 cursor-pointer"
                >
                  <EyeOff size={13} /> Ocultar de esta lista
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {offerPlayer && (
        <TransferOfferModal
          player={offerPlayer}
          userClubId={club.id}
          currentDate={currentDate || new Date()}
          onClose={() => setOfferPlayer(null)}
          onOfferMade={() => {
            notifyAll();
            setRefreshTick(t => t + 1);
            showToast(`Oferta enviada por ${offerPlayer.name}.`, 'success');
          }}
        />
      )}
    </>
  );
};
