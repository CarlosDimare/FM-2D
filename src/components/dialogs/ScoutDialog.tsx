import React, { useMemo, useState } from 'react';
import { world } from '../../services/worldManager';
import { notifyAll, useWorldStore } from '../../stores/worldStore';
import { useGameStore } from '../../stores/gameStore';
import { useUIStore } from '../../stores/uiStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import { getChiefScout } from '../../services/staffAdviceService';
import { CharacterDialog } from './CharacterDialog';
import { SpeechBubble } from './SpeechBubble';
import { FMButton } from '../FMUI';
import { Position, Player, ScoutingReport } from '../../types';
import { Star, TrendingUp, BookmarkCheck, BookmarkPlus, FolderPlus, Eye, Compass } from 'lucide-react';

type ScoutTopic = 'PROMISES' | 'READY' | 'BARGAINS' | 'NEEDS';

const fmt = (n: number) =>
  n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `£${(n / 1_000).toFixed(0)}k` : `£${n}`;

export const ScoutDialog: React.FC = () => {
  const { kind, data, close } = useDialogueStore();
  const currentDate = useGameStore(s => s.currentDate) || new Date();
  const clubs = useWorldStore(s => s.clubs);
  const [topic, setTopic] = useState<ScoutTopic>('READY');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const clubId = data?.clubId;
  const club = clubs.find(c => c.id === clubId) || (clubId ? world.getClub(clubId) : undefined);
  const scout = useMemo(() => (clubId ? getChiefScout(clubId) : null), [clubId]);

  const scoutedEntries = useMemo(() => {
    if (!clubId) return [] as { report: ScoutingReport; player: Player }[];
    const reports = world.getScoutingReports(clubId, 200);
    const seen = new Set<string>();
    const list: { report: ScoutingReport; player: Player }[] = [];
    reports.forEach(r => {
      if (seen.has(r.playerId)) return;
      const p = world.getPlayer(r.playerId);
      if (p && p.clubId !== clubId) {
        seen.add(r.playerId);
        list.push({ report: r, player: p });
      }
    });
    return list;
  }, [clubId, tick, world.scoutingReports.length]);

  const squadNeeds = useMemo(() => {
    if (!clubId) return [] as string[];
    const senior = world.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR');
    const needs: string[] = [];
    if (senior.filter(p => p.positions.includes(Position.GK)).length < 2) needs.push('Arquero (P)');
    if (senior.filter(p => ['DC', 'DL', 'DR', 'SW'].includes(p.positions[0])).length < 6) needs.push('Defensores');
    if (senior.filter(p => ['DM', 'MC', 'ML', 'MR', 'AM'].includes(p.positions[0])).length < 6) needs.push('Mediocampistas');
    if (senior.filter(p => ['ST', 'STR', 'STL'].includes(p.positions[0])).length < 3) needs.push('Delanteros');
    return needs.length > 0 ? needs : ['Refuerzos de jerarquía general'];
  }, [clubId]);

  if (kind !== 'SCOUT' || !club) return null;

  const staffName = scout?.name || 'Ojeador Jefe';
  const iniciales = staffName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const clubPrimary = club.primaryColor || 'bg-[#3a4a3a]';
  const transferBudget = club.finances.transferBudget;

  const filteredList = (() => {
    if (topic === 'PROMISES') {
      return [...scoutedEntries]
        .filter(e => e.player.age <= 22)
        .sort((a, b) => b.report.potentialAbility - a.report.potentialAbility)
        .slice(0, 5);
    }
    if (topic === 'BARGAINS') {
      return [...scoutedEntries]
        .filter(e => e.player.value <= Math.max(transferBudget, 500_000))
        .sort((a, b) => (b.report.currentAbility + b.report.potentialAbility) - (a.report.currentAbility + a.report.potentialAbility))
        .slice(0, 5);
    }
    return [...scoutedEntries]
      .sort((a, b) => b.report.currentAbility - a.report.currentAbility)
      .slice(0, 5);
  })();

  const speechText = (() => {
    if (feedback) return feedback;
    if (scoutedEntries.length === 0) {
      return `Míster, todavía no tenemos jugadores ojeados en carpeta. Envíame a rastrear la zona local o regional y te traigo los primeros informes de inmediato.`;
    }
    if (topic === 'PROMISES') {
      const top = filteredList[0];
      return top
        ? `Entre las promesas que ojeamos destaca ${top.player.name} (${top.player.age} años, PA ${top.report.potentialAbility}). Puede ser una gran inversión a futuro.`
        : `Todavía no detectamos juveniles sub-22 en nuestros informes. Conviene ojear ligas locales o regionales.`;
    }
    if (topic === 'BARGAINS') {
      const top = filteredList[0];
      return top
        ? `Pensando en tu presupuesto (${fmt(transferBudget)}), ${top.player.name} (${fmt(top.player.value)}) ofrece la mejor relación calidad-precio.`
        : `Los jugadores ojeados superan hoy tu presupuesto de fichajes (${fmt(transferBudget)}). Probá una búsqueda local más económica.`;
    }
    if (topic === 'NEEDS') {
      return `Revisando tu plantel senior, priorizaría buscar: ${squadNeeds.join(', ')}. Tengo ${fmt(club.finances.scoutingBudget)} disponibles para salir a ojear ahora mismo.`;
    }
    const best = filteredList[0];
    return `Tengo ${scoutedEntries.length} jugadores ojeados en agenda. El de mayor rendimiento inmediato es ${best.player.name} (${best.player.positions[0]}, CA ${best.report.currentAbility}).`;
  })();

  const handleToggleShortlist = (playerId: string) => {
    const idx = club.shortlistedPlayerIds.indexOf(playerId);
    if (idx >= 0) club.shortlistedPlayerIds.splice(idx, 1);
    else club.shortlistedPlayerIds.push(playerId);
    notifyAll();
    setTick(t => t + 1);
  };

  const handleAddToFolder = (player: Player) => {
    if (!club.transferFolderIds) club.transferFolderIds = [];
    if (!club.transferFolderIds.includes(player.id)) {
      club.transferFolderIds.push(player.id);
      notifyAll();
      setFeedback(`Anotado: agregué a ${player.name} a la Carpeta de Refuerzos para el Director Deportivo.`);
      setTick(t => t + 1);
    } else {
      setFeedback(`${player.name} ya figura en tu Carpeta de Refuerzos.`);
    }
  };

  const handleQuickScout = (zone: 'LOCAL' | 'REGIONAL' | 'NATIONAL') => {
    const res = world.scoutByZone(club.id, zone, currentDate, club.id);
    notifyAll();
    setFeedback(res.message);
    setTick(t => t + 1);
  };

  const handleInspectPlayer = (player: Player) => {
    close();
    useUIStore.getState().setSelectedPlayer(player);
  };

  return (
    <CharacterDialog
      nombre={staffName}
      cargo="Ojeador Jefe"
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
          texto={speechText}
          subtitulo={`${scoutedEntries.length} jugadores ojeados · Fondo scouting: ${fmt(club.finances.scoutingBudget)}`}
        />

        {/* Preguntas al ojeador */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-[#bcc8bc] p-1 rounded-sm border border-[#a0b0a0]">
          {([
            ['READY', 'Listos ya'],
            ['PROMISES', 'Promesas Sub-22'],
            ['BARGAINS', 'En presupuesto'],
            ['NEEDS', 'Qué ojear'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTopic(id); setFeedback(null); }}
              className={`py-1.5 px-2 text-[9px] font-black uppercase rounded-[1px] transition-all cursor-pointer ${
                topic === id ? 'bg-[#3a4a3a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {topic === 'NEEDS' ? (
          <div className="bg-white border border-[#a0b0a0] rounded-sm p-3 space-y-2.5">
            <div>
              <div className="text-[9px] font-black uppercase text-slate-500 mb-1">Zonas prioritarias detectadas</div>
              <div className="flex flex-wrap gap-1.5">
                {squadNeeds.map(n => (
                  <span key={n} className="px-2 py-1 bg-amber-50 border border-amber-300 rounded-sm text-[9px] font-black uppercase text-amber-900">
                    {n}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-1.5">
              <FMButton variant="primary" onClick={() => handleQuickScout('LOCAL')} className="text-[9px] py-1.5">
                <Compass size={11} /> Ojear Local
              </FMButton>
              <FMButton variant="secondary" onClick={() => handleQuickScout('REGIONAL')} className="text-[9px] py-1.5">
                <Compass size={11} /> Ojear Regional
              </FMButton>
              <FMButton variant="secondary" onClick={() => handleQuickScout('NATIONAL')} className="text-[9px] py-1.5">
                <Compass size={11} /> Ojear Nacional
              </FMButton>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto custom-scroll">
            {filteredList.length === 0 ? (
              <div className="bg-white border border-[#a0b0a0] rounded-sm p-4 text-center space-y-2">
                <p className="text-[10px] font-bold text-slate-600">No hay jugadores ojeados en esta categoría aún.</p>
                <FMButton variant="primary" onClick={() => handleQuickScout('LOCAL')} className="mx-auto text-[9px]">
                  <Compass size={11} /> Enviar Ojeador (Local)
                </FMButton>
              </div>
            ) : (
              filteredList.map(({ report, player }) => {
                const pClub = world.getClub(player.clubId);
                const shortlisted = club.shortlistedPlayerIds.includes(player.id);
                return (
                  <div key={report.id} className="bg-white border border-[#a0b0a0] rounded-sm p-2 flex items-center gap-2 shadow-xs">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black text-slate-900 truncate">{player.name}</span>
                        <span className="text-[8px] font-black px-1 py-0.5 bg-[#e8ece8] border border-[#a0b0a0] rounded-[1px] text-slate-700 shrink-0">{player.positions[0]}</span>
                      </div>
                      <div className="text-[8.5px] text-slate-500 font-bold truncate">
                        {player.age} años · {pClub?.shortName || 'Libre'} · {fmt(player.value)}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[9px] font-black">
                        <span className="flex items-center gap-0.5 text-amber-700"><Star size={10} className="text-amber-500" /> CA {report.currentAbility}</span>
                        <span className="flex items-center gap-0.5 text-emerald-700"><TrendingUp size={10} className="text-emerald-600" /> PA {report.potentialAbility}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleShortlist(player.id)}
                        title={shortlisted ? 'Quitar de seguimiento' : 'Seguir'}
                        className="p-1.5 rounded-sm border border-[#a0b0a0] bg-[#f4f7f4] hover:bg-[#e0e8e0] cursor-pointer"
                      >
                        {shortlisted ? <BookmarkCheck size={13} className="text-blue-600" /> : <BookmarkPlus size={13} className="text-slate-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToFolder(player)}
                        title="Poner en Carpeta de Fichajes"
                        className="p-1.5 rounded-sm border border-[#a0b0a0] bg-[#f4f7f4] hover:bg-[#e0e8e0] cursor-pointer"
                      >
                        <FolderPlus size={13} className="text-[#2b5d2c]" />
                      </button>
                      <FMButton variant="primary" onClick={() => handleInspectPlayer(player)} className="px-2 py-1 text-[9px]">
                        <Eye size={11} /> Ficha
                      </FMButton>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </CharacterDialog>
  );
};
