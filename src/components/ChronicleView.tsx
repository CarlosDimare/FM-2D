import React, { useState } from 'react';
import { Chronicle, ChronicleType } from '../types';
import { world } from '../services/worldManager';
import { useGameStore } from '../stores/gameStore';
import { FMEmptyState } from './FMUI';
import { BookOpen, ArrowLeft, Calendar, Trophy, FileText } from 'lucide-react';

interface ChronicleViewProps {
  onBack: () => void;
  clubId?: string;
}

const TYPE_ICONS: Record<ChronicleType, React.ReactNode> = {
  MATCH: <FileText size={13} className="text-blue-600 shrink-0" />,
  MONTHLY: <Calendar size={13} className="text-green-600 shrink-0" />,
  CAREER: <Trophy size={13} className="text-amber-600 shrink-0" />,
};

const TYPE_LABELS: Record<ChronicleType, string> = {
  MATCH: 'Partido',
  MONTHLY: 'Mensual',
  CAREER: 'Carrera',
};

export const ChronicleView: React.FC<ChronicleViewProps> = ({ onBack: _onBack, clubId }) => {
  const [filter, setFilter] = useState<ChronicleType | 'ALL'>('ALL');
  const [selectedChronicle, setSelectedChronicle] = useState<Chronicle | null>(null);
  const fixtures = useGameStore(s => s.fixtures);

  const controlledNationalTeamId = world.nationalTeamManager?.controlledTeamId;

  // Strictly show ONLY chronicles belonging to the user's actual played SENIOR club matches
  // or a National Team that the user is actively managing (never background Reserve/U20 or AI National Teams).
  const allChronicles = world.chronicles.filter(c => {
    const isControlledNT = Boolean(controlledNationalTeamId && c.nationalTeamId === controlledNationalTeamId);
    const isUserClub = Boolean(clubId && c.clubId === clubId && !c.nationalTeamId);
    if (!isUserClub && !isControlledNT) return false;

    if (c.type === 'MATCH' && c.fixtureId) {
      const fx = fixtures.find(f => f.id === c.fixtureId);
      if (fx) {
        if (!fx.played) return false;
        if (isUserClub && fx.squadType !== 'SENIOR') return false;
        if (isUserClub && fx.homeTeamId !== clubId && fx.awayTeamId !== clubId) return false;
      }
    }
    return true;
  });

  const filtered = filter === 'ALL' ? allChronicles : allChronicles.filter(c => c.type === filter);

  const getNationalTeamName = (teamId?: string) =>
    teamId
      ? world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === teamId)?.name || teamId
      : undefined;

  const sortedChronicles = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex flex-col h-full bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <header className="bg-gradient-to-b from-[#e2e8f0] to-[#c8d2c8] px-2 py-1.5 sm:px-3 sm:py-2 border-b border-[#a0b0a0] shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="bg-[#3a4a3a] rounded-sm p-1 shrink-0">
            <BookOpen size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-base font-black text-slate-900 uppercase tracking-tighter italic leading-none">
              Crónicas
            </h1>
            <p className="hidden sm:block text-[9px] text-slate-500 uppercase tracking-widest">
              Partidos jugados e hitos de tu carrera
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar">
          {(['ALL', 'MATCH', 'MONTHLY', 'CAREER'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => { setFilter(type); setSelectedChronicle(null); }}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-[2px] border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                filter === type
                  ? 'bg-[#2b5d2c] border-[#142b15] text-white shadow-inner'
                  : 'border-[#6b7280] text-[#1f2428] hover:brightness-105'
              }`}
              style={
                filter === type
                  ? undefined
                  : { background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 50%, #b9bfc6 100%)' }
              }
            >
              {type === 'ALL' ? 'Todas' : TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2 sm:p-4">
        {selectedChronicle ? (
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setSelectedChronicle(null)}
              className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-700 hover:text-slate-950 mb-2.5 transition-colors cursor-pointer"
            >
              <ArrowLeft size={12} /> Volver a la lista
            </button>

            <div className="bg-white rounded-sm border border-[#a0b0a0] p-3 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2.5">
                {TYPE_ICONS[selectedChronicle.type]}
                <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                  {TYPE_LABELS[selectedChronicle.type]}
                </span>
                {selectedChronicle.nationalTeamId && (
                  <span className="text-[8.5px] font-black uppercase text-purple-700 border border-purple-200 bg-purple-50 px-1.5 py-0.5 rounded-sm">
                    Selección · {getNationalTeamName(selectedChronicle.nationalTeamId)}
                  </span>
                )}
                <span className="text-[9.5px] text-slate-400 font-mono ml-auto">
                  {new Date(selectedChronicle.date).toLocaleDateString()}
                </span>
              </div>

              <h2 className="text-sm sm:text-lg font-black uppercase tracking-tight text-slate-900 mb-3 italic leading-snug">
                {selectedChronicle.title}
              </h2>

              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {selectedChronicle.body}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2">
            {sortedChronicles.length === 0 ? (
              <FMEmptyState
                icon={<BookOpen size={26} />}
                title="Aún no hay crónicas disponibles"
                subtitle="Juega partidos con tu primer equipo y completa meses de gestión para registrar crónicas de tu carrera."
              />
            ) : (
              sortedChronicles.map(chronicle => (
                <button
                  key={chronicle.id}
                  type="button"
                  onClick={() => setSelectedChronicle(chronicle)}
                  className="w-full text-left bg-white hover:bg-[#f2f7f2] border border-[#a0b0a0] hover:border-[#3a4a3a] rounded-sm p-2.5 sm:p-3.5 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {TYPE_ICONS[chronicle.type]}
                    <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-500">
                      {TYPE_LABELS[chronicle.type]}
                    </span>
                    {chronicle.nationalTeamId && (
                      <span className="text-[8px] font-black uppercase text-purple-700 border border-purple-200 bg-purple-50 px-1.5 py-0.5 rounded-sm">
                        Selección · {getNationalTeamName(chronicle.nationalTeamId)}
                      </span>
                    )}
                    <span className="text-[8.5px] text-slate-400 font-mono ml-auto">
                      {new Date(chronicle.date).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-[11px] sm:text-xs font-black uppercase tracking-tight text-slate-900 group-hover:text-[#2b5d2c] transition-colors italic truncate">
                    {chronicle.title}
                  </h3>
                  <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">
                    {chronicle.body}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
