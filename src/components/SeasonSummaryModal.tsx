import React, { useMemo, useState } from 'react';
import { X, Trophy, Goal, Zap, ShieldCheck, UserCheck, Info, Award } from 'lucide-react';
import { CompetitionType, Player } from '../types';
import { world } from '../services/worldManager';
import { useUIStore } from '../stores/uiStore';
import { FMButton } from './FMUI';
import { FmBroadcastHeader, FmClubShield } from './ClubBannerChrome';

export interface CompetitionSummary {
  compId: string;
  compName: string;
  compType: CompetitionType;
  championId: string;
  championName: string;
  topScorer: { name: string; club: string; value: number };
  topAssists: { name: string; club: string; value: number };
  bestGK: { name: string; club: string; value: string };
  bestDF: { name: string; club: string; value: string };
}

interface SeasonSummaryModalProps {
  summary: CompetitionSummary[];
  userWonLeague: boolean;
  onClose: () => void;
}

const resolveSummaryPlayer = (playerName: string, clubName: string): Player | undefined => {
  if (!playerName || playerName === 'N/A') return undefined;
  const targetClub = world.clubs.find(
    c => c.name === clubName || c.shortName === clubName
  );
  if (targetClub) {
    const exactInClub = world.players.find(
      p => p.name === playerName && p.clubId === targetClub.id
    );
    if (exactInClub) return exactInClub;
  }
  return world.players.find(p => p.name === playerName);
};

export const SeasonSummaryModal: React.FC<SeasonSummaryModalProps> = ({ summary, userWonLeague, onClose }) => {
  const [filterType, setFilterType] = useState<'ALL' | 'LEAGUE' | 'CUPS'>('ALL');
  const [selectedCompId, setSelectedCompId] = useState<string>(() => summary[0]?.compId || '');
  const { setSelectedPlayer, setViewExternalClub, setView, currentView, userClub } = useUIStore();

  const filteredSummary = useMemo(() => {
    if (filterType === 'LEAGUE') return summary.filter(s => s.compType === 'LEAGUE');
    if (filterType === 'CUPS') return summary.filter(s => s.compType !== 'LEAGUE');
    return summary;
  }, [summary, filterType]);

  const activeComp = useMemo(() => {
    return (
      filteredSummary.find(s => s.compId === selectedCompId) ||
      filteredSummary[0] ||
      summary[0]
    );
  }, [filteredSummary, selectedCompId, summary]);

  const championClub = activeComp?.championId ? world.getClub(activeComp.championId) : undefined;
  const activeCompMeta = activeComp ? world.competitions.find(c => c.id === activeComp.compId) : undefined;

  const badgeLabel = (type: CompetitionType) => {
    if (type === 'LEAGUE') return 'Liga';
    if (type === 'GLOBAL') return 'Mundial';
    if (type.startsWith('CONTINENTAL')) return 'Cont.';
    return 'Copa';
  };

  const handleOpenChampionClub = () => {
    if (!championClub) return;
    onClose();
    if (userClub && championClub.id === userClub.id) {
      setView('SENIOR_SQUAD');
    } else {
      setViewExternalClub(championClub, currentView);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-2 sm:p-4"
      style={{ fontFamily: 'Verdana, sans-serif' }}
    >
      {userWonLeague && <ConfettiOverlay />}

      <div className="bg-[#d4dcd4] w-full max-w-5xl h-full sm:h-auto sm:max-h-[90vh] rounded-sm shadow-2xl border-2 border-[#1c1f24] flex flex-col overflow-hidden">
        <FmBroadcastHeader
          club={championClub}
          title="Resumen de la Temporada"
          subtitle="Campeones, ligas y premios individuales de la campaña"
          showShield={Boolean(championClub)}
          shieldSize="md"
          rightSlot={
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[2px] border border-[#14171a] bg-[#23272c] text-slate-200 hover:text-white hover:bg-[#343a40] cursor-pointer transition-colors"
              aria-label="Cerrar resumen"
            >
              <X size={16} />
            </button>
          }
        />

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Sidebar Competition Selector */}
          <aside className="w-full md:w-72 bg-[#c8d2c8] md:border-r border-b md:border-b-0 border-[#8e9b90] flex flex-col shrink-0 max-h-[34vh] md:max-h-none overflow-hidden">
            <div
              className="px-2.5 py-1.5 border-b border-[#1c1f24] flex items-center justify-between gap-2 shrink-0"
              style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-100">
                <Trophy size={12} className="text-[#facc15]" />
                Torneos ({filteredSummary.length})
              </span>
            </div>

            <div className="grid grid-cols-3 bg-[#bcc8bc] p-0.5 gap-0.5 border-b border-[#8e9b90] shrink-0">
              {[
                { key: 'ALL' as const, label: 'Todos' },
                { key: 'LEAGUE' as const, label: 'Ligas' },
                { key: 'CUPS' as const, label: 'Copas' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterType(key)}
                  className={`px-1 py-1 text-[8.5px] font-black uppercase rounded-[1px] transition-all cursor-pointer ${
                    filterType === key
                      ? 'bg-[#2b5d2c] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-[#d8e0d8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll divide-y divide-[#a0b0a0]">
              {filteredSummary.map(s => {
                const isSelected = activeComp?.compId === s.compId;
                const sClub = s.championId ? world.getClub(s.championId) : undefined;
                return (
                  <button
                    key={s.compId}
                    type="button"
                    onClick={() => setSelectedCompId(s.compId)}
                    className={`w-full text-left px-2.5 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#e8ece8] text-slate-950 border-l-4 border-l-[#2b5d2c]'
                        : 'bg-[#d4dcd4] text-slate-800 hover:bg-[#e0e6e0] border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {sClub ? (
                        <FmClubShield club={sClub} size="xs" />
                      ) : (
                        <Trophy size={13} className={isSelected ? 'text-[#2b5d2c] shrink-0' : 'text-slate-500 shrink-0'} />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-bold uppercase leading-tight">{s.compName}</span>
                        <span className="block truncate text-[9px] text-slate-600 font-semibold">{s.championName}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[8px] px-1.5 py-0.5 rounded-[2px] font-black uppercase shrink-0 border ${
                        s.compType === 'LEAGUE'
                          ? 'bg-[#2b5d2c] text-white border-[#1d431e]'
                          : s.compType === 'GLOBAL'
                          ? 'bg-[#23272c] text-[#facc15] border-[#14171a]'
                          : 'bg-amber-100 text-amber-900 border-amber-400'
                      }`}
                    >
                      {badgeLabel(s.compType)}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 bg-[#d4dcd4] custom-scroll">
            {activeComp ? (
              <div className="space-y-3 sm:space-y-4">
                {/* Champion Panel */}
                <section className="bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden">
                  <div
                    className="px-3 py-1.5 border-b border-[#1c1f24] flex items-center justify-between gap-2"
                    style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
                  >
                    <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-100">
                      <Trophy size={12} className="text-[#facc15]" />
                      {activeComp.compType === 'LEAGUE'
                        ? 'Campeón de Liga'
                        : activeComp.compType === 'GLOBAL'
                        ? 'Campeón Mundial'
                        : 'Campeón del Torneo'}
                    </span>
                    {activeCompMeta?.country && (
                      <span className="text-[9px] font-bold uppercase text-slate-300">
                        {activeCompMeta.country}
                      </span>
                    )}
                  </div>

                  <div className="p-4 sm:p-5 bg-white flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-sm bg-[#e8ece8] border border-[#8e9b90] flex items-center justify-center shadow-inner shrink-0">
                      {championClub ? (
                        <FmClubShield club={championClub} size="xl" />
                      ) : (
                        <Trophy size={34} className="text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#23272c] border border-[#14171a] text-[#facc15] text-[9px] font-black uppercase tracking-wider mb-1.5">
                        <Trophy size={10} /> Campeón · {activeComp.compName}
                      </div>
                      {championClub ? (
                        <button
                          type="button"
                          onClick={handleOpenChampionClub}
                          className="block w-full sm:w-auto text-center sm:text-left text-xl sm:text-3xl font-black text-slate-900 hover:text-[#2b5d2c] hover:underline uppercase tracking-tight leading-tight break-words cursor-pointer"
                        >
                          {activeComp.championName}
                        </button>
                      ) : (
                        <h3 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight leading-tight break-words">
                          {activeComp.championName}
                        </h3>
                      )}
                      {championClub && (
                        <p className="text-[10px] font-bold text-slate-600 uppercase mt-1">
                          {championClub.country} · Estadio {championClub.stadium}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Awards Panel */}
                <section className="bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden">
                  <div
                    className="px-3 py-1.5 border-b border-[#1c1f24] flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
                  >
                    <Award size={12} className="text-[#facc15]" />
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-100">
                      Premios Individuales
                    </span>
                  </div>

                  <div className="p-3 bg-[#e8ece8]">
                    {activeComp.topScorer.value > 0 ||
                    activeComp.topAssists.value > 0 ||
                    activeComp.bestDF.name !== 'N/A' ||
                    activeComp.bestGK.name !== 'N/A' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {activeComp.topScorer.value > 0 && (() => {
                          const resolved = resolveSummaryPlayer(activeComp.topScorer.name, activeComp.topScorer.club);
                          return (
                            <AwardCard
                              icon={<Goal size={18} className="text-green-700" />}
                              title="Goleador"
                              player={activeComp.topScorer.name}
                              club={activeComp.topScorer.club}
                              value={`${activeComp.topScorer.value} goles`}
                              onClick={resolved ? () => setSelectedPlayer(resolved) : undefined}
                            />
                          );
                        })()}
                        {activeComp.topAssists.value > 0 && (() => {
                          const resolved = resolveSummaryPlayer(activeComp.topAssists.name, activeComp.topAssists.club);
                          return (
                            <AwardCard
                              icon={<Zap size={18} className="text-blue-700" />}
                              title="Máximo Asistente"
                              player={activeComp.topAssists.name}
                              club={activeComp.topAssists.club}
                              value={`${activeComp.topAssists.value} asist.`}
                              onClick={resolved ? () => setSelectedPlayer(resolved) : undefined}
                            />
                          );
                        })()}
                        {activeComp.bestDF.name !== 'N/A' && (() => {
                          const resolved = resolveSummaryPlayer(activeComp.bestDF.name, activeComp.bestDF.club);
                          return (
                            <AwardCard
                              icon={<ShieldCheck size={18} className="text-amber-700" />}
                              title="Mejor Defensor"
                              player={activeComp.bestDF.name}
                              club={activeComp.bestDF.club}
                              value={`${activeComp.bestDF.value} media`}
                              onClick={resolved ? () => setSelectedPlayer(resolved) : undefined}
                            />
                          );
                        })()}
                        {activeComp.bestGK.name !== 'N/A' && (() => {
                          const resolved = resolveSummaryPlayer(activeComp.bestGK.name, activeComp.bestGK.club);
                          return (
                            <AwardCard
                              icon={<UserCheck size={18} className="text-indigo-700" />}
                              title="Mejor Arquero"
                              player={activeComp.bestGK.name}
                              club={activeComp.bestGK.club}
                              value={`${activeComp.bestGK.value} media`}
                              onClick={resolved ? () => setSelectedPlayer(resolved) : undefined}
                            />
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="bg-white border border-[#a0b0a0] rounded-sm p-4 text-center text-[10px] font-bold uppercase text-slate-500">
                        Sin estadísticas individuales destacadas registradas para esta edición
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3 py-12">
                <Info size={36} className="opacity-50" />
                <p className="font-black uppercase tracking-wider text-xs">Sin datos disponibles</p>
              </div>
            )}
          </div>
        </div>

        <footer className="px-4 py-3 bg-[#bcc8bc] border-t border-[#8e9b90] flex justify-center shrink-0">
          <FMButton variant="primary" onClick={onClose} className="px-10 py-2.5 text-xs w-full sm:w-auto uppercase tracking-wider">
            Aceptar y Continuar
          </FMButton>
        </footer>
      </div>
    </div>
  );
};

const AwardCard = ({
  icon,
  title,
  player,
  club,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  player: string;
  club: string;
  value: string;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`bg-white p-3 rounded-sm border border-[#8e9b90] shadow-sm flex items-center gap-3 ${
      onClick ? 'cursor-pointer hover:bg-[#f2f7f2] hover:border-[#2b5d2c] transition-colors' : ''
    }`}
  >
    <div className="p-2.5 bg-[#e8ece8] border border-[#a0b0a0] rounded-sm shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-center gap-2 mb-0.5">
        <span className="text-slate-500 font-black uppercase text-[8.5px] tracking-wider truncate">{title}</span>
        <span className="text-[#1a1a1a] font-black text-[11px] bg-[#d4dcd4] border border-[#8e9b90] px-1.5 py-0.5 rounded-[2px] shrink-0">
          {value}
        </span>
      </div>
      <h5 className={`text-xs font-black truncate uppercase ${onClick ? 'text-slate-900 hover:text-[#2b5d2c]' : 'text-slate-900'}`}>{player}</h5>
      <p className="text-slate-600 text-[9.5px] font-bold truncate uppercase">{club}</p>
    </div>
  </div>
);

const ConfettiOverlay = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[400] overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 19) % 100}%`,
            backgroundColor: ['#3b82f6', '#fbbf24', '#ef4444', '#10b981', '#ffffff', '#2b5d2c'][i % 6],
            animationDelay: `${(i % 8) * 0.45}s`,
            animationDuration: `${2.2 + (i % 5) * 0.5}s`,
          }}
        />
      ))}
      <style>{`
        .confetti-piece {
          position: absolute;
          width: 8px;
          height: 15px;
          top: -20px;
          opacity: 0.85;
          animation: fall linear infinite;
          transform-origin: center;
        }
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(50vh) rotate(360deg); }
          100% { transform: translateY(110vh) rotate(720deg); }
        }
      `}</style>
    </div>
  );
};
