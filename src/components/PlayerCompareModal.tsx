
import React from 'react';
import { Player } from '../types';
import { world } from '../services/worldManager';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { FmClubShield, FmLedDisplay, getClubHexPalette } from './ClubBannerChrome';

interface PlayerCompareModalProps {
  playerA: Player;
  playerB: Player;
  onClose: () => void;
}

const StatBar: React.FC<{ label: string; valA: number; valB: number; max?: number; higherBetter?: boolean }> = ({ label, valA, valB, max = 20, higherBetter = true }) => {
  const pctA = Math.min(100, (valA / max) * 100);
  const pctB = Math.min(100, (valB / max) * 100);
  const aWins = higherBetter ? valA > valB : valA < valB;
  const bWins = higherBetter ? valB > valA : valB > valA;
  const tie = valA === valB;

  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-[#a0b0a0]/30 last:border-0">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-black w-20 ${aWins ? 'text-green-700' : 'text-slate-700'}`}>{valA}</span>
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex-1 text-center">{label}</span>
        <span className={`text-[10px] font-black w-20 text-right ${bWins ? 'text-green-700' : 'text-slate-700'}`}>{valB}</span>
      </div>
      <div className="flex gap-1 h-1.5">
        <div className="flex-1 bg-slate-200 rounded-full overflow-hidden flex justify-end">
          <div className={`h-full rounded-full transition-all ${aWins ? 'bg-green-600' : tie ? 'bg-slate-400' : 'bg-slate-300'}`} style={{ width: `${pctA}%` }} />
        </div>
        <div className="flex-1 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${bWins ? 'bg-green-600' : tie ? 'bg-slate-400' : 'bg-slate-300'}`} style={{ width: `${pctB}%` }} />
        </div>
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; valA: string; valB: string; highlight?: boolean }> = ({ label, valA, valB, highlight }) => (
  <div className="flex items-center py-1 border-b border-[#a0b0a0]/20 last:border-0">
    <span className={`text-[10px] font-bold w-1/2 text-center ${highlight && valA !== valB ? 'text-green-700' : 'text-slate-700'}`}>{valA}</span>
    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-full text-center">{label}</span>
    <span className={`text-[10px] font-bold w-1/2 text-center ${highlight && valB !== valA ? 'text-green-700' : 'text-slate-700'}`}>{valB}</span>
  </div>
);

export const PlayerCompareModal: React.FC<PlayerCompareModalProps> = ({ playerA, playerB, onClose }) => {
  const clubA = world.getClub(playerA.clubId);
  const clubB = world.getClub(playerB.clubId);

  const getAvgRating = (p: Player) => p.seasonStats.appearances > 0 ? (p.seasonStats.totalRating / p.seasonStats.appearances).toFixed(2) : '0.00';
  const getFormAvg = (p: Player) => p.formRatings.length > 0 ? (p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length).toFixed(1) : '-';

  const palA = getClubHexPalette(clubA, '#2b5d2c', '#f8fafc');
  const palB = getClubHexPalette(clubB, '#1d4ed8', '#f8fafc');

  return (
    <div className="fixed inset-0 z-[990] flex items-center justify-center bg-black/65 p-2 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-sm border border-[#1c1f24] shadow-2xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1c1f24] bg-[#3a3f45]">
          <h3 className="text-xs font-bold uppercase text-white tracking-wider">Comparar Jugadores</h3>
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded cursor-pointer"><X size={15} /></button>
        </div>

        {/* Dual-Club FM08 Broadcast Header Strip */}
        <div
          className="relative flex items-stretch border-b border-[#14171a] overflow-hidden shrink-0"
          style={{
            background: `linear-gradient(90deg, ${palA.primary} 0%, ${palA.primary}dd 28%, #23272c 44%, #191c20 56%, ${palB.primary}dd 72%, ${palB.primary} 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-4"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
            }}
          />
          {(palA.isLightPrimary || palB.isLightPrimary) && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${palA.isLightPrimary ? 'rgba(15,18,22,0.45)' : 'rgba(15,18,22,0)'} 0%, rgba(15,18,22,0) 42%, rgba(15,18,22,0) 58%, ${palB.isLightPrimary ? 'rgba(15,18,22,0.45)' : 'rgba(15,18,22,0)'} 100%)`,
              }}
            />
          )}
          <div className="relative z-10 flex-1 min-w-0 p-2.5 flex items-center gap-2">
            <FmClubShield club={clubA} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">{playerA.name}</p>
              <p className="text-[10px] text-white/80 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{clubA?.shortName || 'Libre'} · {playerA.age}a · {playerA.positions[0]}</p>
            </div>
          </div>
          <FmLedDisplay className="relative z-10 border-y-0 px-3 flex items-center justify-center shrink-0">
            <span className="font-mono text-xs font-bold text-[#facc15] tracking-widest">VS</span>
          </FmLedDisplay>
          <div className="relative z-10 flex-1 min-w-0 p-2.5 flex items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">{playerB.name}</p>
              <p className="text-[10px] text-white/80 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{clubB?.shortName || 'Libre'} · {playerB.age}a · {playerB.positions[0]}</p>
            </div>
            <FmClubShield club={clubB} size="sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">

          {/* Ability Comparison */}
          <div className="mb-2">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Habilidad</p>
            <StatBar label="CA" valA={playerA.currentAbility} valB={playerB.currentAbility} max={20} />
            <StatBar label="PA" valA={playerA.potentialAbility} valB={playerB.potentialAbility} max={20} />
            <StatBar label="Reputación" valA={playerA.reputation} valB={playerB.reputation} max={100} />
          </div>

          {/* Physical & Mental */}
          <div className="mb-2">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Físico / Mental</p>
            <StatBar label="Moral" valA={playerA.morale} valB={playerB.morale} max={100} />
            <StatBar label="Fitness" valA={playerA.fitness} valB={playerB.fitness} max={100} />
            <StatBar label="Liderazgo" valA={playerA.leadership} valB={playerB.leadership} max={20} />
            <StatBar label="Consistencia" valA={playerA.consistency} valB={playerB.consistency} max={20} />
            <StatBar label="Temperamento" valA={playerA.bigMatchTemperament} valB={playerB.bigMatchTemperament} max={20} />
          </div>

          {/* Season Stats */}
          <div className="mb-2">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Estadísticas Temporada</p>
            <InfoRow label="PJ" valA={`${playerA.seasonStats.appearances}`} valB={`${playerB.seasonStats.appearances}`} />
            <InfoRow label="Goles" valA={`${playerA.seasonStats.goals}`} valB={`${playerB.seasonStats.goals}`} highlight />
            <InfoRow label="Asist." valA={`${playerA.seasonStats.assists}`} valB={`${playerB.seasonStats.assists}`} highlight />
            <InfoRow label="Rating" valA={getAvgRating(playerA)} valB={getAvgRating(playerB)} highlight />
            <InfoRow label="Forma" valA={getFormAvg(playerA)} valB={getFormAvg(playerB)} />
          </div>

          {/* Contract */}
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Contrato</p>
            <InfoRow label="Valor" valA={`£${playerA.value.toLocaleString()}`} valB={`£${playerB.value.toLocaleString()}`} />
            <InfoRow label="Salario" valA={`£${playerA.salary.toLocaleString()}/mes`} valB={`£${playerB.salary.toLocaleString()}/mes`} />
          </div>
        </div>
      </div>
    </div>
  );
};
