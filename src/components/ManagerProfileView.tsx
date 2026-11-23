import React, { useState } from 'react';
import { ManagerProfile, RelationshipState } from '../types';
import { world } from '../services/worldManager';
import { FMButton } from './FMUI';
import { Briefcase, Trophy, Star, Target } from 'lucide-react';
import { FmClubShield } from './ClubBannerChrome';

interface ManagerProfileViewProps {
  onBack: () => void;
}

const ORIGIN_LABELS: Record<string, string> = {
  EX_PLAYER: 'Exjugador',
  YOUTH_COACH: 'Categorías inferiores',
  JOURNALIST: 'Periodista / Analista',
};

const RELATIONSHIP_ICONS: Record<RelationshipState, { icon: string; color: string; label: Record<'board' | 'press' | 'fans', string> }> = {
  ANGRY: { icon: '😤', color: 'text-red-600', label: { board: 'Enfadada', press: 'Hostil', fans: 'Enfadada' } },
  WORRIED: { icon: '😟', color: 'text-orange-600', label: { board: 'Preocupada', press: 'Crítica', fans: 'Descontenta' } },
  CALM: { icon: '😌', color: 'text-blue-700', label: { board: 'Tranquila', press: 'Neutral', fans: 'Neutral' } },
  HAPPY: { icon: '😄', color: 'text-green-700', label: { board: 'Confianza', press: 'Favorable', fans: 'Ídolo' } },
};

const getWinRate = (p: ManagerProfile) => {
  if (p.totalGames === 0) return '0.0';
  return ((p.totalWins / p.totalGames) * 100).toFixed(1);
};

export const ManagerProfileView: React.FC<ManagerProfileViewProps> = ({ onBack }) => {
  const [subTab, setSubTab] = useState<'RESUMEN' | 'HISTORIAL'>('RESUMEN');
  const profile = world.managerProfile;
  if (!profile) return (
    <div className="flex flex-col h-full bg-[#d4dcd4] items-center justify-center" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <p className="text-slate-600 text-xs font-bold">No hay perfil de entrenador disponible.</p>
      <FMButton onClick={onBack} className="mt-3">Volver</FMButton>
    </div>
  );

  const p = profile;
  const boardState = RELATIONSHIP_ICONS[p.boardRelationship];
  const pressState = RELATIONSHIP_ICONS[p.pressRelationship];
  const fansState = RELATIONSHIP_ICONS[p.fansRelationship];
  const yearsOld = Math.floor((Date.now() - p.birthDate.getTime()) / 31557600000);

  return (
    <div className="flex flex-col h-full bg-[#d4dcd4] p-2 gap-1.5 overflow-hidden">
      {/* Compact Career Sub-bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-2.5 py-1.5 shadow-xs">
        <div className="text-[9px] font-black uppercase text-slate-700 truncate">
          {ORIGIN_LABELS[p.origin]} · {p.nationality} · {yearsOld} años
        </div>
        <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('RESUMEN')}
            className={`px-2 py-0.5 text-[8.5px] font-black uppercase rounded-[1px] cursor-pointer ${subTab === 'RESUMEN' ? 'bg-[#2b5d2c] text-white' : 'text-slate-700'}`}
          >
            Resumen
          </button>
          <button
            type="button"
            onClick={() => setSubTab('HISTORIAL')}
            className={`px-2 py-0.5 text-[8.5px] font-black uppercase rounded-[1px] cursor-pointer ${subTab === 'HISTORIAL' ? 'bg-[#2b5d2c] text-white' : 'text-slate-700'}`}
          >
            Clubes / Títulos
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        <div className="bg-white rounded-sm border border-[#a0b0a0] py-1.5 px-1 text-center shadow-xs">
          <p className="text-base sm:text-xl font-black text-slate-900 font-mono leading-tight">{p.totalGames}</p>
          <p className="text-[7.5px] font-black text-slate-500 uppercase">Partidos</p>
        </div>
        <div className="bg-white rounded-sm border border-[#a0b0a0] py-1.5 px-1 text-center shadow-xs">
          <p className="text-base sm:text-xl font-black text-green-700 font-mono leading-tight">{getWinRate(p)}%</p>
          <p className="text-[7.5px] font-black text-slate-500 uppercase">Victorias</p>
        </div>
        <div className="bg-white rounded-sm border border-[#a0b0a0] py-1.5 px-1 text-center shadow-xs">
          <p className="text-base sm:text-xl font-black text-amber-600 font-mono leading-tight">{p.titles.length}</p>
          <p className="text-[7.5px] font-black text-slate-500 uppercase">Títulos</p>
        </div>
        <div className="bg-white rounded-sm border border-[#a0b0a0] py-1.5 px-1 text-center shadow-xs">
          <p className="text-base sm:text-xl font-black text-blue-700 font-mono leading-tight">{p.youthDebuts}</p>
          <p className="text-[7.5px] font-black text-slate-500 uppercase">Canteranos</p>
        </div>
      </div>

      {subTab === 'RESUMEN' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1.5 overflow-hidden content-start">
          {/* Datos de Carrera */}
          <div className="bg-white rounded-sm border border-[#a0b0a0] p-2.5 shadow-xs">
            <h3 className="text-[9.5px] font-black uppercase tracking-wider text-[#2b5d2c] mb-1.5 flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <Briefcase size={12} /> Datos de Carrera
            </h3>
            <div className="space-y-1 text-[10.5px]">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Club actual</span>
                <span className="font-black text-slate-900 truncate ml-2">{p.currentClubName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Temporada en club</span>
                <span className="font-black text-slate-900 font-mono">{p.seasonInClub}ª</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Balance</span>
                <span className="font-black font-mono">
                  <span className="text-green-700">{p.totalWins}V</span> · <span className="text-slate-600">{p.totalDraws}E</span> · <span className="text-red-600">{p.totalLosses}D</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Goles</span>
                <span className="font-black text-slate-900 font-mono">{p.goalsFor} GF · {p.goalsAgainst} GC</span>
              </div>
              {p.mostUsedPlayer !== 'Ninguno' && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Jugador clave</span>
                  <span className="font-black text-slate-900 truncate ml-2">{p.mostUsedPlayer}</span>
                </div>
              )}
              {p.biggestSale && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Mayor venta</span>
                  <span className="font-black text-slate-900 truncate ml-2">{p.biggestSale.player} (£{(p.biggestSale.amount / 1_000_000).toFixed(1)}M)</span>
                </div>
              )}
            </div>
          </div>

          {/* Relaciones + Objetivo */}
          <div className="flex flex-col gap-1.5">
            <div className="bg-white rounded-sm border border-[#a0b0a0] p-2.5 shadow-xs">
              <h3 className="text-[9.5px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5 border-b border-slate-200 pb-1">
                <Target size={12} /> Relaciones
              </h3>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm p-1.5">
                  <div className="text-[8px] font-black uppercase text-slate-500">Directiva</div>
                  <div className={`text-[10px] font-black ${boardState.color}`}>{boardState.icon} {boardState.label.board}</div>
                </div>
                <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm p-1.5">
                  <div className="text-[8px] font-black uppercase text-slate-500">Prensa</div>
                  <div className={`text-[10px] font-black ${pressState.color}`}>{pressState.icon} {pressState.label.press}</div>
                </div>
                <div className="bg-[#f2f7f2] border border-[#c5d1c5] rounded-sm p-1.5">
                  <div className="text-[8px] font-black uppercase text-slate-500">Afición</div>
                  <div className={`text-[10px] font-black ${fansState.color}`}>{fansState.icon} {fansState.label.fans}</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-sm border border-[#a0b0a0] p-2.5 shadow-xs">
              <h3 className="text-[9.5px] font-black uppercase tracking-wider text-green-700 mb-1 flex items-center gap-1.5">
                <Trophy size={12} /> Objetivo Actual
              </h3>
              <p className="text-[11px] text-slate-800 font-black leading-snug">{p.currentObjective}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1.5 overflow-hidden">
          <div className="bg-white rounded-sm border border-[#a0b0a0] p-2.5 flex flex-col min-h-0 shadow-xs">
            <h3 className="text-[9.5px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5 border-b border-slate-200 pb-1 shrink-0">
              <Briefcase size={12} /> Historial de Clubes ({p.clubHistory.length})
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {p.clubHistory.length > 0 ? p.clubHistory.map((entry, i) => {
                const prevClub = world.getClub(entry.clubId);
                return (
                  <div key={i} className="flex items-center justify-between text-[10px] border-b border-[#e0e8e0] pb-1 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FmClubShield club={prevClub} size="xs" />
                      <span className="font-bold text-slate-900 truncate">{entry.clubName}</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[9px] shrink-0">
                      {new Date(entry.startDate).getFullYear()}{entry.endDate ? `-${new Date(entry.endDate).getFullYear()}` : '-Act.'} ({entry.seasons}t)
                    </span>
                  </div>
                );
              }) : (
                <p className="text-[10px] text-slate-400 italic py-3 text-center">Primera etapa como entrenador.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-sm border border-[#a0b0a0] p-2.5 flex flex-col min-h-0 shadow-xs">
            <h3 className="text-[9.5px] font-black uppercase tracking-wider text-amber-600 mb-1.5 flex items-center gap-1.5 border-b border-slate-200 pb-1 shrink-0">
              <Trophy size={12} /> Palmarés ({p.titles.length})
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1">
              {p.titles.length > 0 ? p.titles.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-800">
                  <Star size={11} className="text-amber-500 shrink-0" />
                  <span className="truncate">{t}</span>
                </div>
              )) : (
                <p className="text-[10px] text-slate-400 italic py-3 text-center">Aún sin títulos conquistados.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

