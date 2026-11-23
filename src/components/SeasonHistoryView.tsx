import React, { useState } from 'react';
import { world } from '../services/worldManager';
import { FMBox, FMTable, FMTableCell, FMEmptyState } from './FMUI';
import { FmClubShield } from './ClubBannerChrome';
import {
  BookMarked,
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Goal,
  Zap,
  Star,
  CalendarClock,
  UserPlus,
  Stethoscope,
  Newspaper,
  Award,
} from 'lucide-react';
import { SeasonPage } from '../types';
import { useUIStore } from '../stores/uiStore';

interface SeasonHistoryViewProps {
  onBack: () => void;
}

const PAGE_META: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  MATCH: { icon: <Goal size={12} />, label: 'Partido', cls: 'bg-blue-50 border-blue-300 text-blue-800' },
  SIGNING: { icon: <UserPlus size={12} />, label: 'Fichaje', cls: 'bg-green-50 border-green-300 text-green-800' },
  INJURY: { icon: <Stethoscope size={12} />, label: 'Lesión', cls: 'bg-red-50 border-red-300 text-red-800' },
  NEWS: { icon: <Newspaper size={12} />, label: 'Noticia', cls: 'bg-amber-50 border-amber-300 text-amber-800' },
  MILESTONE: { icon: <Award size={12} />, label: 'Hito', cls: 'bg-purple-50 border-purple-300 text-purple-800' },
  MONTHLY_REPORT: { icon: <CalendarClock size={12} />, label: 'Informe mensual', cls: 'bg-slate-100 border-slate-300 text-slate-700' },
};

const FmSeasonCollapsible: React.FC<{
  title: string;
  icon: React.ReactNode;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, badge, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-expanded={isOpen}
        className="w-full px-3 py-2 border-b border-[#1c1f24] flex items-center justify-between gap-2 text-left cursor-pointer hover:brightness-110 transition-all"
        style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[#facc15] shrink-0">{icon}</span>
          <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wide text-slate-100 truncate">
            {title}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {badge && (
            <span className="text-[9px] font-bold text-[#facc15] uppercase">{badge}</span>
          )}
          {isOpen ? (
            <ChevronUp size={14} className="text-slate-200" />
          ) : (
            <ChevronDown size={14} className="text-slate-200" />
          )}
        </span>
      </button>
      {isOpen && <div className="p-2.5 sm:p-3">{children}</div>}
    </div>
  );
};

const DiarySection: React.FC<{ pages: SeasonPage[]; title: string; defaultOpen?: boolean }> = ({
  pages,
  title,
  defaultOpen = true,
}) => {
  if (pages.length === 0) return null;
  const sorted = [...pages].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <FmSeasonCollapsible
      title={`${title} (${sorted.length})`}
      icon={<BookMarked size={13} />}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scroll">
        {sorted.map(page => {
          const meta = PAGE_META[page.type] || PAGE_META.NEWS;
          const impCls =
            page.importance === 'HIGH'
              ? 'border-l-4 border-l-amber-500'
              : page.importance === 'MEDIUM'
              ? 'border-l-4 border-l-slate-400'
              : 'border-l-4 border-l-slate-300';
          return (
            <div key={page.id} className={`bg-white border border-[#a0b0a0]/60 rounded-sm px-2 py-1.5 flex gap-2 ${impCls}`}>
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[7.5px] font-black uppercase shrink-0 self-start ${meta.cls}`}>
                {meta.icon} {meta.label}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9.5px] font-black text-slate-900 uppercase truncate">{page.title}</span>
                  <span className="text-[8px] text-slate-500 font-mono shrink-0">{new Date(page.date).toLocaleDateString()}</span>
                </div>
                <p className="text-[9px] text-slate-600 font-medium leading-snug">{page.summary}</p>
              </div>
            </div>
          );
        })}
      </div>
    </FmSeasonCollapsible>
  );
};

export const SeasonHistoryView: React.FC<SeasonHistoryViewProps> = ({ onBack }) => {
  const records = [...(world.seasonHistory || [])].sort((a, b) => b.year - a.year);
  const [activeIdx, setActiveIdx] = useState(0);

  const openClub = (club: any) => {
    if (!club) return;
    const ui = useUIStore.getState();
    ui.setViewExternalClub(club, ui.currentView);
    ui.setView('EXTERNAL_CLUB');
  };

  const findPlayerByRecord = (name: string, clubName?: string) => {
    if (!name) return undefined;
    const exactClubMatch = clubName
      ? world.players.find(p => p.name === name && world.getClub(p.clubId)?.name === clubName)
      : undefined;
    return exactClubMatch || world.players.find(p => p.name === name);
  };

  if (records.length === 0) {
    return (
      <div className="p-3 sm:p-5 h-full overflow-y-auto bg-[#d4dcd4]" style={{ fontFamily: 'Verdana, sans-serif' }}>
        <div className="max-w-5xl mx-auto space-y-3">
          <div
            className="px-3 py-2 border border-[#1c1f24] rounded-sm flex items-center gap-2"
            style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
          >
            <BookMarked size={16} className="text-[#facc15]" />
            <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">Libro de Temporadas</h2>
          </div>
          <DiarySection pages={world.currentSeasonPages} title="Diario de la temporada en curso" defaultOpen />
          <FmSeasonCollapsible title="Historial de Temporadas" icon={<Trophy size={13} />} defaultOpen>
            <FMBox>
              <FMEmptyState
                icon={<BookMarked size={28} />}
                title="Aún no hay temporadas completadas"
                subtitle="Termina una temporada y aquí quedará registrado el historial de campeones, goleadores y tablas finales de todas las ligas."
                action={<button type="button" onClick={onBack} className="text-[10px] font-black uppercase text-slate-700 hover:text-slate-950 underline cursor-pointer">Volver al inicio</button>}
              />
            </FMBox>
          </FmSeasonCollapsible>
        </div>
      </div>
    );
  }

  const active = records[Math.min(activeIdx, records.length - 1)];

  return (
    <div className="p-3 sm:p-5 h-full overflow-y-auto bg-[#d4dcd4]" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <div className="max-w-5xl mx-auto space-y-3">
        <div
          className="px-3 py-2 border border-[#1c1f24] rounded-sm flex items-center gap-2"
          style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
        >
          <BookMarked size={16} className="text-[#facc15]" />
          <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">Libro de Temporadas</h2>
          <span className="text-[9px] text-slate-300 font-bold ml-auto uppercase">
            {records.length} temporada{records.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Selector de año */}
        <div className="flex items-center gap-1.5 bg-[#c8d2c8] border border-[#8e9b90] p-1.5 rounded-sm">
          <button
            type="button"
            onClick={() => setActiveIdx(Math.min(records.length - 1, activeIdx + 1))}
            disabled={activeIdx >= records.length - 1}
            className="p-1.5 rounded-[2px] border border-[#5f666e] bg-[#e8ece8] text-slate-700 hover:brightness-95 disabled:opacity-35 disabled:cursor-default cursor-pointer"
            aria-label="Temporada anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-hide justify-center">
            {records.map((r, i) => (
              <button
                key={r.year}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`px-3 py-1 rounded-[2px] text-[10px] font-black uppercase transition-all border cursor-pointer ${
                  i === activeIdx
                    ? 'bg-[#2b5d2c] text-white border-[#133014] shadow-sm'
                    : 'bg-[#e8ece8] text-slate-700 border-[#737a82] hover:bg-white'
                }`}
              >
                {r.year}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
            disabled={activeIdx <= 0}
            className="p-1.5 rounded-[2px] border border-[#5f666e] bg-[#e8ece8] text-slate-700 hover:brightness-95 disabled:opacity-35 disabled:cursor-default cursor-pointer"
            aria-label="Temporada siguiente"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Resumen general contraíble */}
        <FmSeasonCollapsible
          title={`Resumen · Temporada ${active.year}`}
          icon={<Trophy size={13} />}
          badge={active.userClubName || active.userManagerName}
          defaultOpen
        >
          <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
            <Trophy size={15} className="text-amber-700 shrink-0" />
            <div className="text-[10.5px] font-bold text-slate-700">
              <span className="font-black text-slate-900 uppercase">Temporada {active.year}</span>
              <span className="mx-2 text-slate-400">·</span>
              <span>DT: <b>{active.userManagerName}</b></span>
              {active.userClubName && <span className="mx-2 text-slate-400">·</span>}
              {active.userClubName && <span>{active.userClubName}</span>}
            </div>
          </div>
        </FmSeasonCollapsible>

        {/* Campeones y Premios contraíble */}
        <FmSeasonCollapsible
          title="Campeones y Premios"
          icon={<Award size={13} />}
          badge={`${active.competitions.length} torneos`}
          defaultOpen
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.competitions.map(comp => {
              const champClub = comp.championId ? world.getClub(comp.championId) : undefined;
              const scorerPlayer = findPlayerByRecord(comp.topScorer.name, comp.topScorer.club);
              const assistPlayer = findPlayerByRecord(comp.topAssists.name, comp.topAssists.club);
              return (
                <FMBox key={comp.compId} title={comp.compName}>
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-[#d4ddd4] mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {champClub ? <FmClubShield club={champClub} size="xs" /> : <Trophy size={14} className="text-amber-600 shrink-0" />}
                      {champClub ? (
                        <button type="button" onClick={() => openClub(champClub)} className="text-[11px] font-black uppercase text-slate-900 truncate hover:underline cursor-pointer text-left">
                          {comp.championName}
                        </button>
                      ) : (
                        <span className="text-[11px] font-black uppercase text-slate-900 truncate">{comp.championName}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[9.5px] font-bold text-slate-600">
                    <div className="flex items-center gap-2 px-1">
                      <Goal size={11} className="text-green-700 shrink-0" />
                      <span className="uppercase tracking-wide text-slate-500 w-16 shrink-0">Goleador</span>
                      {scorerPlayer ? (
                        <button type="button" onClick={() => useUIStore.getState().setSelectedPlayer(scorerPlayer)} className="truncate text-slate-800 hover:underline cursor-pointer text-left">
                          {comp.topScorer.name} <span className="text-slate-500">({comp.topScorer.value})</span>
                        </button>
                      ) : (
                        <span className="truncate text-slate-800">{comp.topScorer.name} <span className="text-slate-500">({comp.topScorer.value})</span></span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <Zap size={11} className="text-blue-700 shrink-0" />
                      <span className="uppercase tracking-wide text-slate-500 w-16 shrink-0">Asistente</span>
                      {assistPlayer ? (
                        <button type="button" onClick={() => useUIStore.getState().setSelectedPlayer(assistPlayer)} className="truncate text-slate-800 hover:underline cursor-pointer text-left">
                          {comp.topAssists.name} <span className="text-slate-500">({comp.topAssists.value})</span>
                        </button>
                      ) : (
                        <span className="truncate text-slate-800">{comp.topAssists.name} <span className="text-slate-500">({comp.topAssists.value})</span></span>
                      )}
                    </div>
                  </div>
                </FMBox>
              );
            })}
            {active.competitions.length === 0 && (
              <div className="md:col-span-2 text-center py-8 text-slate-500 text-[10px] uppercase font-bold">
                Sin competiciones finalizadas registradas
              </div>
            )}
          </div>
        </FmSeasonCollapsible>

        {/* Tablas finales de ligas contraíble */}
        {active.finalTables && Object.keys(active.finalTables).length > 0 && (
          <FmSeasonCollapsible
            title="Tablas Finales de Ligas"
            icon={<Star size={13} />}
            badge={`${Object.keys(active.finalTables).length} ligas`}
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(active.finalTables).map(([compId, rows]) => {
                const comp = world.competitions.find(c => c.id === compId);
                const typedRows = (rows || []) as { clubName: string; points: number }[];
                return (
                  <FMBox key={compId} title={`${comp?.name || compId} · Top 6`} noPadding>
                    <FMTable headers={['Pos', 'Club', 'Pts']} colWidths={['35px', 'auto', '40px']}>
                      {typedRows.map((row, i) => {
                        const rowClub = world.clubs.find(c => c.name === row.clubName || c.shortName === row.clubName);
                        return (
                        <tr key={`${compId}-${i}`} onClick={() => rowClub && openClub(rowClub)} className={`${rowClub ? 'cursor-pointer hover:bg-[#ccd9cc]' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} ${i === 0 ? 'font-black' : ''}`}>
                          <FMTableCell className="text-center font-bold text-slate-500">{i + 1}</FMTableCell>
                          <FMTableCell className={`truncate font-bold ${rowClub ? 'hover:underline' : ''}`}>{row.clubName}</FMTableCell>
                          <FMTableCell className="text-center font-black text-slate-800" isNumber>{row.points}</FMTableCell>
                        </tr>
                        );
                      })}
                    </FMTable>
                  </FMBox>
                );
              })}
            </div>
          </FmSeasonCollapsible>
        )}

        {/* Diario de la temporada: hojas por acontecimiento (contraíble) */}
        <DiarySection pages={active.seasonPages || []} title={`Diario · Temporada ${active.year}`} defaultOpen={false} />
        <DiarySection pages={world.currentSeasonPages.filter(p => p.seasonYear === active.year)} title="Diario de la temporada en curso" defaultOpen={false} />
      </div>
    </div>
  );
};
