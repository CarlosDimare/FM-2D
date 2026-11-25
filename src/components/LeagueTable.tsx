
import React, { useState, useMemo } from 'react';
import { TableEntry, Competition, SquadType, Player, Fixture, Position } from '../types';
import { world } from '../services/worldManager';
import { FMTable, FMTableCell } from './FMUI';
import { getFlagUrl } from '../data/static';
import { FmClubShield } from './ClubBannerChrome';
import { ChevronDown, ChevronRight, Trophy, Award, Calendar } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { FixtureReportModal } from './FixtureReportModal';

interface LeagueTableProps {
   entries: TableEntry[];
   userClubId: string;
   allLeagues?: Competition[];
   currentLeagueId?: string;
   onLeagueChange?: (id: string) => void;
   currentSquadType?: SquadType;
   onSquadTypeChange?: (squad: SquadType) => void;
   fixtures?: Fixture[];
}

type StatsCategory = 'SCORERS' | 'ASSISTS' | 'PASSER' | 'DEFENDER' | 'GOALKEEPER';

const DEF_POSITIONS: Position[] = [Position.DC, Position.DL, Position.DR, Position.SW, Position.DM, Position.DML, Position.DMR];

export const LeagueTable: React.FC<LeagueTableProps> = ({ 
   entries, userClubId, allLeagues, currentLeagueId, onLeagueChange, currentSquadType = 'SENIOR', onSquadTypeChange, fixtures = []
}) => {
   const [statsTab, setStatsTab] = useState<StatsCategory>('SCORERS');
   const [leagueOpen, setLeagueOpen] = useState(false);
   const [standingsExpanded, setStandingsExpanded] = useState(true);
   const [statsExpanded, setStatsExpanded] = useState(true);
   const [matchesExpanded, setMatchesExpanded] = useState(true);
   const [matchesFilter, setMatchesFilter] = useState<'ALL' | 'PLAYED' | 'UPCOMING'>('ALL');
   const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);

   const openClubSquad = (clubId: string) => {
      const club = world.getClub(clubId);
      if (!club) return;
      const ui = useUIStore.getState();
      ui.setViewExternalClub(club, ui.currentView);
      ui.setView('EXTERNAL_CLUB');
   };

   const openPlayerCard = (p: Player) => {
      useUIStore.getState().setSelectedPlayer(p);
   };

   const leagueFixtures = useMemo(() => {
      if (!currentLeagueId || fixtures.length === 0) return [];
      const list = fixtures.filter(f => f.competitionId === currentLeagueId && f.squadType === currentSquadType);
      if (matchesFilter === 'PLAYED') {
         return list.filter(f => f.played).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
      if (matchesFilter === 'UPCOMING') {
         return list.filter(f => !f.played).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      const upcoming = list.filter(f => !f.played).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const played = list.filter(f => f.played).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return [...upcoming.slice(0, 40), ...played.slice(0, 40)];
   }, [fixtures, currentLeagueId, currentSquadType, matchesFilter]);

   const totalLeagueFixturesCount = useMemo(() => {
      if (!currentLeagueId || fixtures.length === 0) return 0;
      return fixtures.filter(f => f.competitionId === currentLeagueId && f.squadType === currentSquadType).length;
   }, [fixtures, currentLeagueId, currentSquadType]);

   const leaguePlayers = useMemo(() => {
      if (!currentLeagueId) return [];
      const participatingClubIds = new Set<string>();
      world.clubs.forEach(c => { if (c.leagueId === currentLeagueId) participatingClubIds.add(c.id); });
      const compPlayers = world.players.filter(p => {
         const club = world.getClub(p.clubId);
         return (club?.leagueId === currentLeagueId || participatingClubIds.has(p.clubId)) && p.squad === currentSquadType;
      });
      return compPlayers.length > 0 ? compPlayers : world.players.filter(p => p.squad === currentSquadType);
   }, [currentLeagueId, currentSquadType]);

   const getCompStats = (p: Player) => (currentLeagueId ? p.statsByCompetition[currentLeagueId] : undefined);
   const getCompGoals = (p: Player) => getCompStats(p)?.goals || 0;
   const getCompAssists = (p: Player) => getCompStats(p)?.assists || 0;
   const getCompApps = (p: Player) => getCompStats(p)?.appearances || 0;
   const getCompRating = (p: Player) => {
      const s = getCompStats(p);
      return s && s.appearances > 0 ? s.totalRating / s.appearances : 0;
   };

   // Passer index: combines competition rating, assists, and passing/vision quality
   const getPasserScore = (p: Player) => {
      const rating = getCompRating(p);
      const assists = getCompAssists(p);
      const passQuality = ((p.stats.internal.pase || 10) + (p.stats.internal.vision || 10)) / 2;
      if (getCompApps(p) === 0) return passQuality * 3.5;
      return Math.min(99, Math.round(passQuality * 3.2 + rating * 3.5 + assists * 1.8));
   };

   // Defender index: defenders/DMs ranked by comp rating + defensive attributes
   const getDefenderScore = (p: Player) => {
      const rating = getCompRating(p);
      const defQuality = ((p.stats.internal.posicionamiento || 10) + (p.stats.internal.fuerza || 10) + (p.stats.internal.anticipacion || 10) + (p.stats.internal.agresividad || 10)) / 4;
      if (getCompApps(p) === 0) return Number((defQuality * 0.35).toFixed(2));
      return Number((rating * 0.72 + (defQuality / 20) * 2.8).toFixed(2));
   };

   // Goalkeeper index: GKs ranked by comp rating + clean sheets + GK skill
   const getGkScore = (p: Player) => {
      const s = getCompStats(p);
      const rating = getCompRating(p);
      const cs = s?.cleanSheets || 0;
      const gkSkill = ((p.stats.internal.posicionamiento || 10) + (p.stats.internal.anticipacion || 10) + (p.stats.internal.decision || 10)) / 3;
      if (!s || s.appearances === 0) return Number((gkSkill * 0.35).toFixed(2));
      return Number((rating * 0.75 + Math.min(2, cs * 0.15) + (gkSkill / 20) * 1.5).toFixed(2));
   };

   const topScorers = useMemo(() => {
      return [...leaguePlayers]
         .sort((a, b) => getCompGoals(b) - getCompGoals(a) || getCompRating(b) - getCompRating(a))
         .slice(0, 15);
   }, [leaguePlayers, currentLeagueId]);

   const topAssisters = useMemo(() => {
      return [...leaguePlayers]
         .sort((a, b) => getCompAssists(b) - getCompAssists(a) || getCompRating(b) - getCompRating(a))
         .slice(0, 15);
   }, [leaguePlayers, currentLeagueId]);

   const topPassers = useMemo(() => {
      return [...leaguePlayers]
         .filter(p => !p.positions.includes(Position.GK))
         .sort((a, b) => getPasserScore(b) - getPasserScore(a) || getCompAssists(b) - getCompAssists(a))
         .slice(0, 15);
   }, [leaguePlayers, currentLeagueId]);

   const topDefenders = useMemo(() => {
      return [...leaguePlayers]
         .filter(p => p.positions.some(pos => DEF_POSITIONS.includes(pos)))
         .sort((a, b) => getDefenderScore(b) - getDefenderScore(a) || getCompRating(b) - getCompRating(a))
         .slice(0, 15);
   }, [leaguePlayers, currentLeagueId]);

   const topGoalkeepers = useMemo(() => {
      return [...leaguePlayers]
         .filter(p => p.positions.includes(Position.GK))
         .sort((a, b) => getGkScore(b) - getGkScore(a) || getCompRating(b) - getCompRating(a))
         .slice(0, 15);
   }, [leaguePlayers, currentLeagueId]);

   const zoneConfig = useMemo(() => {
      const comp = world.competitions.find(c => c.id === currentLeagueId);
      const conf = comp?.confederation || '';
      const tier = comp?.tier || 1;
      const total = entries.length;
      const relegation = Math.max(2, Math.min(4, Math.round(total * 0.12)));
      if (tier === 2) {
         return { primary: 0, secondary: 0, relegation: 0, promotion: 2, primaryLabel: '', secondaryLabel: '', promotionLabel: 'Asc' };
      }
      if (conf === 'CONMEBOL') {
         return { primary: 5, secondary: 5, relegation, promotion: 0, primaryLabel: 'Lib', secondaryLabel: 'Sud' };
      }
      if (conf === 'UEFA') {
         return { primary: 4, secondary: 2, relegation, promotion: 0, primaryLabel: 'UCL', secondaryLabel: 'UEL' };
      }
      if (conf === 'AFC') {
         return { primary: 4, secondary: 0, relegation, promotion: 0, primaryLabel: 'AFC', secondaryLabel: '' };
      }
      if (conf === 'CAF') {
         return { primary: 3, secondary: 0, relegation, promotion: 0, primaryLabel: 'CAF', secondaryLabel: '' };
      }
      if (conf === 'CONCACAF') {
         return { primary: 4, secondary: 0, relegation, promotion: 0, primaryLabel: 'CCL', secondaryLabel: '' };
      }
      return { primary: 3, secondary: 0, relegation, promotion: 0, primaryLabel: 'Cont', secondaryLabel: '' };
   }, [currentLeagueId, entries.length]);

   const getRowClass = (index: number) => {
      const { primary, secondary, relegation, promotion } = zoneConfig;
      if (primary > 0 && index < primary) return 'border-l-[3px] border-l-green-600';
      if (secondary > 0 && index >= primary && index < primary + secondary) return 'border-l-[3px] border-l-blue-600';
      if (promotion > 0 && index < promotion) return 'border-l-[3px] border-l-green-600';
      if (relegation > 0 && entries.length > 2 && index >= entries.length - relegation) return 'border-l-[3px] border-l-red-600';
      return 'border-l-[3px] border-l-transparent';
   };

   const getStatusLabel = (index: number) => {
      const { primary, secondary, relegation, promotion, primaryLabel, secondaryLabel, promotionLabel } = zoneConfig;
      if (primary > 0 && index < primary && primaryLabel) return <span className="text-[7px] bg-green-600 text-white px-1 rounded-[1px] uppercase tracking-tighter">{primaryLabel}</span>;
      if (secondary > 0 && index >= primary && index < primary + secondary && secondaryLabel) return <span className="text-[7px] bg-blue-600 text-white px-1 rounded-[1px] uppercase tracking-tighter">{secondaryLabel}</span>;
      if (promotion > 0 && index < promotion && promotionLabel) return <span className="text-[7px] bg-green-600 text-white px-1 rounded-[1px] uppercase tracking-tighter">{promotionLabel}</span>;
      if (relegation > 0 && entries.length > 2 && index >= entries.length - relegation) return <span className="text-[7px] bg-red-600 text-white px-1 rounded-[1px] uppercase tracking-tighter">Des</span>;
      return null;
   };

   const headers = ['Pos', 'Club', 'PJ', 'G', 'E', 'P', 'DG', 'Pts'];
   const colWidths = ['45px', 'auto', '30px', '30px', '30px', '30px', '30px', '45px'];
   const tabletHeaders = ['Pos', 'Club', 'PJ', 'G', 'E', 'P', 'Pts'];
   const tabletColWidths = ['40px', 'auto', '30px', '30px', '30px', '30px', '40px'];
   const mobileHeaders = ['Pos', 'Club', 'PJ', 'DG', 'Pts'];
   const mobileColWidths = ['34px', 'auto', '28px', '30px', '36px'];

   const toggleStandings = () => setStandingsExpanded(v => !v);
   const toggleStats = () => setStatsExpanded(v => !v);
   const toggleMatches = () => setMatchesExpanded(v => !v);

   const stageLabel = (stage: string) => {
      if (stage === 'GROUP') return 'Zonas';
      if (stage === 'ROUND_OF_32') return '16avos';
      if (stage === 'ROUND_OF_16') return 'Octavos';
      if (stage === 'QUARTER_FINAL') return 'Cuartos';
      if (stage === 'SEMI_FINAL') return 'Semifinal';
      if (stage === 'FINAL') return 'Final';
      return '';
   };

   const renderStatsRows = () => {
      const renderClubChip = (clubId: string) => {
         const shortName = world.getClub(clubId)?.shortName;
         if (!shortName) return <span>-</span>;
         return (
            <button
               type="button"
               onClick={(ev) => { ev.stopPropagation(); openClubSquad(clubId); }}
               className="hover:text-[#2b5d2c] hover:underline cursor-pointer text-left font-bold"
            >
               {shortName}
            </button>
         );
      };
      if (statsTab === 'SCORERS') {
         const rows = topScorers.filter(p => getCompGoals(p) > 0);
         return (
            <FMTable headers={['#', 'Jugador', 'Club', 'Goles']} colWidths={['30px', 'auto', '52px', '44px']}>
               {rows.length > 0 ? rows.map((p, i) => (
                  <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i === 0 ? 'bg-amber-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}>
                     <FMTableCell className="text-center font-black text-slate-500 text-[10px]">{i === 0 ? '★' : i + 1}</FMTableCell>
                     <FMTableCell className="truncate max-w-[115px] font-bold text-[10.5px] text-slate-900 hover:underline">{p.name}</FMTableCell>
                     <FMTableCell className="truncate max-w-[52px] text-[9px] text-slate-500 font-bold">{renderClubChip(p.clubId)}</FMTableCell>
                     <FMTableCell className="text-center font-black text-green-700 text-[10.5px]" isNumber>{getCompGoals(p)}</FMTableCell>
                  </tr>
               )) : (
                  <tr><td colSpan={4} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">Sin goles registrados</td></tr>
               )}
            </FMTable>
         );
      }
      if (statsTab === 'ASSISTS') {
         const rows = topAssisters.filter(p => getCompAssists(p) > 0);
         return (
            <FMTable headers={['#', 'Jugador', 'Club', 'Asist.']} colWidths={['30px', 'auto', '52px', '44px']}>
               {rows.length > 0 ? rows.map((p, i) => (
                  <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i === 0 ? 'bg-amber-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}>
                     <FMTableCell className="text-center font-black text-slate-500 text-[10px]">{i === 0 ? '★' : i + 1}</FMTableCell>
                     <FMTableCell className="truncate max-w-[115px] font-bold text-[10.5px] text-slate-900 hover:underline">{p.name}</FMTableCell>
                     <FMTableCell className="truncate max-w-[52px] text-[9px] text-slate-500 font-bold">{renderClubChip(p.clubId)}</FMTableCell>
                     <FMTableCell className="text-center font-black text-blue-700 text-[10.5px]" isNumber>{getCompAssists(p)}</FMTableCell>
                  </tr>
               )) : (
                  <tr><td colSpan={4} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">Sin asistencias registradas</td></tr>
               )}
            </FMTable>
         );
      }
      if (statsTab === 'PASSER') {
         return (
            <FMTable headers={['#', 'Pasador', 'Club', 'Pase%']} colWidths={['30px', 'auto', '52px', '48px']}>
               {topPassers.map((p, i) => (
                  <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i === 0 ? 'bg-amber-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}>
                     <FMTableCell className="text-center font-black text-slate-500 text-[10px]">{i === 0 ? '★' : i + 1}</FMTableCell>
                     <FMTableCell className="truncate max-w-[115px] font-bold text-[10.5px] text-slate-900 hover:underline">{p.name}</FMTableCell>
                     <FMTableCell className="truncate max-w-[52px] text-[9px] text-slate-500 font-bold">{renderClubChip(p.clubId)}</FMTableCell>
                     <FMTableCell className="text-center font-black text-emerald-700 text-[10.5px]" isNumber>{getPasserScore(p)}%</FMTableCell>
                  </tr>
               ))}
            </FMTable>
         );
      }
      if (statsTab === 'DEFENDER') {
         return (
            <FMTable headers={['#', 'Defensor', 'Club', 'Índ.']} colWidths={['30px', 'auto', '52px', '48px']}>
               {topDefenders.map((p, i) => (
                  <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i === 0 ? 'bg-amber-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}>
                     <FMTableCell className="text-center font-black text-slate-500 text-[10px]">{i === 0 ? '★' : i + 1}</FMTableCell>
                     <FMTableCell className="truncate max-w-[115px] font-bold text-[10.5px] text-slate-900 hover:underline">{p.name}</FMTableCell>
                     <FMTableCell className="truncate max-w-[52px] text-[9px] text-slate-500 font-bold">{renderClubChip(p.clubId)}</FMTableCell>
                     <FMTableCell className="text-center font-black text-indigo-700 text-[10.5px]" isNumber>{getDefenderScore(p).toFixed(2)}</FMTableCell>
                  </tr>
               ))}
            </FMTable>
         );
      }
      return (
         <FMTable headers={['#', 'Arquero', 'Club', 'Índ.']} colWidths={['30px', 'auto', '52px', '48px']}>
            {topGoalkeepers.map((p, i) => (
               <tr key={p.id} onClick={() => openPlayerCard(p)} className={`cursor-pointer ${i === 0 ? 'bg-amber-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc]`}>
                  <FMTableCell className="text-center font-black text-slate-500 text-[10px]">{i === 0 ? '★' : i + 1}</FMTableCell>
                  <FMTableCell className="truncate max-w-[115px] font-bold text-[10.5px] text-slate-900 hover:underline">{p.name}</FMTableCell>
                  <FMTableCell className="truncate max-w-[52px] text-[9px] text-slate-500 font-bold">{renderClubChip(p.clubId)}</FMTableCell>
                  <FMTableCell className="text-center font-black text-amber-700 text-[10.5px]" isNumber>{getGkScore(p).toFixed(2)}</FMTableCell>
               </tr>
            ))}
         </FMTable>
      );
   };

   const STAT_TABS: { key: StatsCategory; label: string }[] = [
      { key: 'SCORERS', label: 'Goles' },
      { key: 'ASSISTS', label: 'Asist.' },
      { key: 'PASSER', label: 'Pasador' },
      { key: 'DEFENDER', label: 'Defensor' },
      { key: 'GOALKEEPER', label: 'Arquero' },
   ];

   return (
      <div className="flex flex-col h-full gap-2 p-0 overflow-hidden">
         {/* Controls */}
         <div className="flex flex-wrap gap-1.5 shrink-0 items-center justify-between">
            <div className="flex flex-wrap gap-1.5 items-center">
               {onSquadTypeChange && (
                  <div className="flex bg-[#bcc8bc] rounded-sm p-0.5 border border-[#a0b0a0] shadow-sm">
                     {[
                        { key: 'SENIOR', label: 'Primera' },
                        { key: 'RESERVE', label: 'Reserva' },
                        { key: 'U20', label: 'Sub 20' },
                     ].map(t => (
                        <button key={t.key} onClick={() => onSquadTypeChange(t.key as SquadType)} className={`px-2 py-1 text-[9px] font-bold uppercase transition-all rounded-[1px] cursor-pointer ${currentSquadType === t.key ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'}`}>{t.label}</button>
                     ))}
                  </div>
               )}
               {allLeagues && onLeagueChange && (
                  <div className="relative">
                     <button
                        type="button"
                        onClick={() => setLeagueOpen(!leagueOpen)}
                        className="flex items-center gap-1.5 bg-gradient-to-b from-[#f3f4f6] to-[#c7cdd4] border border-[#737a82] rounded-[2px] px-2 py-1 text-[9px] font-bold uppercase text-[#1f2428] shadow-sm hover:brightness-105 transition-all cursor-pointer"
                     >
                        <img src={getFlagUrl(allLeagues.find(l => l.id === currentLeagueId)?.country || '')} alt="" className="w-4 h-3 object-cover rounded-[1px] border border-slate-300 shrink-0" />
                        <span className="truncate max-w-[130px] sm:max-w-[180px]">{allLeagues.find(l => l.id === currentLeagueId)?.name}</span>
                        <span className="text-[8px] text-slate-600">▼</span>
                     </button>
                     {leagueOpen && (
                        <>
                           <div className="fixed inset-0 z-[199]" onClick={() => setLeagueOpen(false)} />
                           <div className="absolute top-full left-0 mt-1 bg-white border border-[#737a82] rounded-sm shadow-lg z-[200] max-h-52 overflow-y-auto min-w-[190px]">
                              {allLeagues.map(l => (
                                 <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => { onLeagueChange(l.id); setLeagueOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-[9px] font-bold uppercase transition-colors text-left cursor-pointer ${currentLeagueId === l.id ? 'bg-[#2b5d2c] text-white' : 'text-slate-700 hover:bg-[#f2f7f2]'}`}
                                 >
                                    <img src={getFlagUrl(l.country)} alt="" className="w-4 h-3 object-cover rounded-[1px] border border-slate-300 shrink-0" />
                                    <span className="truncate">{l.name}</span>
                                 </button>
                              ))}
                           </div>
                        </>
                     )}
                  </div>
               )}
            </div>
         </div>

         {/* Collapsible Standings + Collapsible Tournament Stats + Collapsible Matches */}
         <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden custom-scroll pr-0.5 lg:pr-0">
            {/* Clasificación (Collapsible) */}
            <div className={`${standingsExpanded ? 'lg:flex-[1.35] max-h-[420px] lg:max-h-none min-h-[220px] lg:min-h-0' : 'shrink-0'} flex flex-col bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden`}>
               <button
                  type="button"
                  onClick={toggleStandings}
                  className="relative w-full border-b border-[#1c1f24] px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0 cursor-pointer text-left"
                  style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
               >
                  <span className="flex items-center gap-1.5 text-slate-100 font-bold text-[10.5px] uppercase tracking-wide">
                     {standingsExpanded ? <ChevronDown size={14} className="text-[#facc15]" /> : <ChevronRight size={14} className="text-[#facc15]" />}
                     <Trophy size={12} className="text-[#facc15]" />
                     Clasificación de Liga ({entries.length})
                  </span>
                  <span className="text-[8.5px] font-bold uppercase text-slate-300">
                     {standingsExpanded ? 'Contraer' : 'Ver tabla'}
                  </span>
               </button>

               {standingsExpanded && (
                  <div className="flex-1 min-h-0 overflow-hidden">
                     <div className="hidden md:block lg:hidden h-full">
                        <FMTable headers={tabletHeaders} colWidths={tabletColWidths}>
                           {entries.length > 0 ? entries.map((e, i) => {
                              const clubExists = Boolean(world.getClub(e.clubId));
                              return (
                              <tr key={e.clubId} onClick={() => clubExists && openClubSquad(e.clubId)} className={`${clubExists ? 'cursor-pointer' : ''} transition-colors ${e.clubId === userClubId ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${getRowClass(i)}`}>
                                 <FMTableCell className="text-center font-bold text-slate-500">
                                    <div className="flex items-center justify-center gap-1">{i + 1} {getStatusLabel(i)}</div>
                                 </FMTableCell>
                                 <FMTableCell className={`font-bold truncate max-w-[140px] ${e.clubId === userClubId ? 'text-blue-800' : 'text-[#1a1a1a]'}`}>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                       <FmClubShield club={world.getClub(e.clubId)} size="xs" />
                                       <span className={`truncate ${clubExists ? 'hover:underline' : ''}`}>{e.clubName}</span>
                                    </div>
                                 </FMTableCell>
                                 <FMTableCell className="text-center" isNumber>{e.played}</FMTableCell>
                                 <FMTableCell className="text-center text-green-700" isNumber>{e.won}</FMTableCell>
                                 <FMTableCell className="text-center text-slate-500" isNumber>{e.drawn}</FMTableCell>
                                 <FMTableCell className="text-center text-red-700" isNumber>{e.lost}</FMTableCell>
                                 <FMTableCell className="text-center font-black bg-slate-100/50" isNumber>{e.points}</FMTableCell>
                              </tr>
                              );
                           }) : (
                              <tr><td colSpan={7} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">No se han encontrado datos</td></tr>
                           )}
                        </FMTable>
                     </div>
                     <div className="hidden lg:block h-full">
                        <FMTable headers={headers} colWidths={colWidths}>
                           {entries.length > 0 ? entries.map((e, i) => {
                              const clubExists = Boolean(world.getClub(e.clubId));
                              return (
                              <tr key={e.clubId} onClick={() => clubExists && openClubSquad(e.clubId)} className={`${clubExists ? 'cursor-pointer' : ''} transition-colors ${e.clubId === userClubId ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${getRowClass(i)}`}>
                                 <FMTableCell className="text-center font-bold text-slate-500">
                                    <div className="flex items-center justify-center gap-1">{i + 1} {getStatusLabel(i)}</div>
                                 </FMTableCell>
                                 <FMTableCell className={`font-bold truncate max-w-[155px] ${e.clubId === userClubId ? 'text-blue-800' : 'text-[#1a1a1a]'}`}>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                       <FmClubShield club={world.getClub(e.clubId)} size="xs" />
                                       <span className={`truncate ${clubExists ? 'hover:underline' : ''}`}>{e.clubName}</span>
                                    </div>
                                 </FMTableCell>
                                 <FMTableCell className="text-center" isNumber>{e.played}</FMTableCell>
                                 <FMTableCell className="text-center text-green-700" isNumber>{e.won}</FMTableCell>
                                 <FMTableCell className="text-center text-slate-500" isNumber>{e.drawn}</FMTableCell>
                                 <FMTableCell className="text-center text-red-700" isNumber>{e.lost}</FMTableCell>
                                 <FMTableCell className="text-center" isNumber>{e.gd}</FMTableCell>
                                 <FMTableCell className="text-center font-black bg-slate-100/50" isNumber>{e.points}</FMTableCell>
                              </tr>
                              );
                           }) : (
                              <tr><td colSpan={8} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">No se han encontrado datos</td></tr>
                           )}
                        </FMTable>
                     </div>
                     <div className="md:hidden h-full">
                        <FMTable headers={mobileHeaders} colWidths={mobileColWidths}>
                           {entries.length > 0 ? entries.map((e, i) => {
                              const clubExists = Boolean(world.getClub(e.clubId));
                              return (
                              <tr key={e.clubId} onClick={() => clubExists && openClubSquad(e.clubId)} className={`${clubExists ? 'cursor-pointer' : ''} transition-colors ${e.clubId === userClubId ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${getRowClass(i)}`}>
                                 <FMTableCell className="text-center font-bold text-slate-500 text-[9.5px] px-1">{i + 1}</FMTableCell>
                                 <FMTableCell className={`font-bold truncate text-[10px] px-1.5 ${e.clubId === userClubId ? 'text-blue-800' : 'text-[#1a1a1a]'}`}>
                                    <div className="flex items-center gap-1 min-w-0">
                                       <FmClubShield club={world.getClub(e.clubId)} size="xs" />
                                       <span className={`truncate ${clubExists ? 'hover:underline' : ''}`}>{e.clubName}</span>
                                    </div>
                                 </FMTableCell>
                                 <FMTableCell className="text-center text-[10px] px-1" isNumber>{e.played}</FMTableCell>
                                 <FMTableCell className="text-center text-[9.5px] text-slate-600 px-1" isNumber>{e.gd}</FMTableCell>
                                 <FMTableCell className="text-center font-black bg-slate-100/50 text-[10px] px-1" isNumber>{e.points}</FMTableCell>
                              </tr>
                              );
                           }) : (
                              <tr><td colSpan={5} className="p-4 text-center text-slate-400 italic text-[10px] uppercase font-bold">Sin datos</td></tr>
                           )}
                        </FMTable>
                     </div>
                  </div>
               )}
            </div>

            {/* Right column on desktop: Estadísticas del Torneo + Partidos */}
            <div className={`${standingsExpanded ? 'lg:flex-1' : 'lg:flex-1'} flex flex-col gap-2 min-h-0`}>
               {/* Estadísticas del Torneo (Collapsible) */}
               <div className={`${statsExpanded ? 'flex-1 max-h-[340px] lg:max-h-none min-h-[180px] lg:min-h-0' : 'shrink-0'} flex flex-col bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden`}>
                  <button
                     type="button"
                     onClick={toggleStats}
                     className="relative w-full border-b border-[#1c1f24] px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0 cursor-pointer text-left"
                     style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
                  >
                     <span className="flex items-center gap-1.5 text-slate-100 font-bold text-[10.5px] uppercase tracking-wide">
                        {statsExpanded ? <ChevronDown size={14} className="text-[#facc15]" /> : <ChevronRight size={14} className="text-[#facc15]" />}
                        <Award size={12} className="text-[#facc15]" />
                        Estadísticas del Torneo
                     </span>
                     <span className="text-[8.5px] font-bold uppercase text-slate-300">
                        {statsExpanded ? 'Contraer' : 'Ver líderes'}
                     </span>
                  </button>

                  {statsExpanded && (
                     <>
                        <div className="grid grid-cols-5 bg-[#bcc8bc] p-0.5 gap-0.5 border-b border-[#a0b0a0] shrink-0">
                           {STAT_TABS.map(({ key, label }) => (
                              <button
                                 key={key}
                                 type="button"
                                 onClick={() => setStatsTab(key)}
                                 className={`px-1 py-1.5 text-[8px] sm:text-[8.5px] font-black uppercase transition-all rounded-[1px] cursor-pointer truncate ${statsTab === key ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'}`}
                              >
                                 {label}
                              </button>
                           ))}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                           {renderStatsRows()}
                        </div>
                     </>
                  )}
               </div>

               {/* Partidos del Torneo (Collapsible) */}
               <div className={`${matchesExpanded ? 'flex-1 max-h-[360px] lg:max-h-none min-h-[190px] lg:min-h-0' : 'shrink-0'} flex flex-col bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden`}>
                  <button
                     type="button"
                     onClick={toggleMatches}
                     className="relative w-full border-b border-[#1c1f24] px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0 cursor-pointer text-left"
                     style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
                  >
                     <span className="flex items-center gap-1.5 text-slate-100 font-bold text-[10.5px] uppercase tracking-wide">
                        {matchesExpanded ? <ChevronDown size={14} className="text-[#facc15]" /> : <ChevronRight size={14} className="text-[#facc15]" />}
                        <Calendar size={12} className="text-[#facc15]" />
                        Partidos ({totalLeagueFixturesCount})
                     </span>
                     <span className="text-[8.5px] font-bold uppercase text-slate-300">
                        {matchesExpanded ? 'Contraer' : 'Ver partidos'}
                     </span>
                  </button>

                  {matchesExpanded && (
                     <>
                        <div className="grid grid-cols-3 bg-[#bcc8bc] p-0.5 gap-0.5 border-b border-[#a0b0a0] shrink-0">
                           {[
                              { key: 'ALL' as const, label: 'Todos' },
                              { key: 'PLAYED' as const, label: 'Resultados' },
                              { key: 'UPCOMING' as const, label: 'Próximos' },
                           ].map(({ key, label }) => (
                              <button
                                 key={key}
                                 type="button"
                                 onClick={() => setMatchesFilter(key)}
                                 className={`px-1 py-1 text-[8px] sm:text-[8.5px] font-black uppercase transition-all rounded-[1px] cursor-pointer truncate ${matchesFilter === key ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-[#ccd9cc]'}`}
                              >
                                 {label}
                              </button>
                           ))}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto bg-white divide-y divide-[#d4ddd4]">
                           {leagueFixtures.length === 0 ? (
                              <div className="p-5 text-center text-slate-400 text-[10px] uppercase font-bold">
                                 Sin partidos registrados
                              </div>
                           ) : (
                              leagueFixtures.map((f, idx) => {
                                 const homeClub = world.getClub(f.homeTeamId);
                                 const awayClub = world.getClub(f.awayTeamId);
                                 const isUserMatch = f.homeTeamId === userClubId || f.awayTeamId === userClubId;
                                 const sLabel = stageLabel(f.stage);
                                 return (
                                    <div
                                       key={f.id}
                                       className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] ${
                                          isUserMatch ? 'bg-blue-50/90' : idx % 2 === 0 ? 'bg-white' : 'bg-[#f4f7f4]'
                                       }`}
                                    >
                                       <div className="w-14 shrink-0 leading-tight">
                                          <span className="font-mono text-[8.5px] text-slate-500 block">
                                             {new Date(f.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                                          </span>
                                          {sLabel && (
                                             <span className="text-[7.5px] font-black uppercase text-[#2b5d2c] block truncate">{sLabel}</span>
                                          )}
                                       </div>
                                       <button
                                          type="button"
                                          onClick={() => homeClub && openClubSquad(f.homeTeamId)}
                                          className="flex-1 min-w-0 flex items-center justify-end gap-1 cursor-pointer hover:underline text-right"
                                       >
                                          <span className={`truncate text-right font-bold ${f.homeTeamId === userClubId ? 'text-blue-800' : 'text-slate-800'}`}>
                                             {homeClub?.shortName || homeClub?.name || f.homeTeamId}
                                          </span>
                                          <FmClubShield club={homeClub} size="xs" />
                                       </button>
                                       <div className="w-12 shrink-0 text-center">
                                          {f.played ? (
                                             <button
                                                type="button"
                                                onClick={() => setSelectedFixture(f)}
                                                title="Ver crónica / informe post-partido"
                                                className="inline-block w-full py-0.5 rounded-[2px] border bg-[#23272c] hover:bg-[#2b5d2c] border-[#14171a] hover:border-[#facc15] text-[#facc15] text-[9.5px] font-black tabular-nums cursor-pointer transition-colors"
                                             >
                                                {f.homeScore ?? 0}-{f.awayScore ?? 0}
                                             </button>
                                          ) : (
                                             <span className="inline-block w-full py-0.5 rounded-[2px] border text-[9.5px] font-black tabular-nums bg-[#d4dcd4] border-[#8e9b90] text-slate-700">
                                                VS
                                             </span>
                                          )}
                                       </div>
                                       <button
                                          type="button"
                                          onClick={() => awayClub && openClubSquad(f.awayTeamId)}
                                          className="flex-1 min-w-0 flex items-center justify-start gap-1 cursor-pointer hover:underline text-left"
                                       >
                                          <FmClubShield club={awayClub} size="xs" />
                                          <span className={`truncate text-left font-bold ${f.awayTeamId === userClubId ? 'text-blue-800' : 'text-slate-800'}`}>
                                             {awayClub?.shortName || awayClub?.name || f.awayTeamId}
                                          </span>
                                       </button>
                                    </div>
                                 );
                              })
                           )}
                        </div>
                     </>
                  )}
               </div>
            </div>
         </div>
         <FixtureReportModal
            fixture={selectedFixture}
            userClubId={userClubId}
            onClose={() => setSelectedFixture(null)}
         />
      </div>
   );
};

