import React, { useState, useMemo } from 'react';
import { Club, Player, ScoutingReport } from '../types';
import { world } from '../services/worldManager';
import { notifyAll, useWorldStore } from '../stores/worldStore';
import { useGameStore } from '../stores/gameStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { getChiefScout } from '../services/staffAdviceService';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { FmClubShield } from './ClubBannerChrome';
import { FMBox, FMButton, FMEmptyState } from './FMUI';
import {
  Binoculars,
  User,
  Star,
  TrendingUp,
  Search,
  BookmarkPlus,
  BookmarkCheck,
  MapPin,
  Globe2,
  Flag,
  Building2,
  Compass,
  Radar,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { getFlagUrl } from '../data/static';
import { SCOUTING_ZONE_COSTS, SCOUTING_ZONE_LABELS, SCOUTING_ZONE_DESC } from '../constants';

interface ScoutingViewProps {
  clubId: string;
  onSelectPlayer: (player: Player) => void;
}

const ATTRIBUTE_TRANSLATIONS: Record<string, string> = {
  finishing: 'Remate',
  passing: 'Pase',
  tackling: 'Entrada',
  dribbling: 'Regate',
  marking: 'Marcaje',
  heading: 'Cabeceo',
  technique: 'Técnica',
  firstTouch: 'Primer toque',
  crossing: 'Centro',
  longShots: 'Tiro lejano',
  vision: 'Visión',
  decisions: 'Decisiones',
  composure: 'Serenidad',
  determination: 'Determinación',
  positioning: 'Colocación',
  anticipation: 'Anticipación',
  teamwork: 'Trabajo equipo',
  workRate: 'Sacrificio',
  leadership: 'Liderazgo',
  bravery: 'Valentía',
  aggression: 'Agresividad',
  concentration: 'Concentración',
  offTheBall: 'Desmarque',
  flair: 'Talento',
};

const ZONE_ICONS: Record<string, React.ReactNode> = {
  LOCAL: <Building2 size={13} />,
  REGIONAL: <MapPin size={13} />,
  NATIONAL: <Flag size={13} />,
  CONTINENTAL: <Globe2 size={13} />,
  GLOBAL: <Compass size={13} />,
};

const REGION_LABELS: Record<string, string> = {
  ARG: 'Argentina',
  BRA: 'Brasil',
  URU: 'Uruguay',
  CHL: 'Chile',
  COL: 'Colombia',
  ECU: 'Ecuador',
  PAR: 'Paraguay',
  PER: 'Perú',
  VEN: 'Venezuela',
  BOL: 'Bolivia',
  GLO: 'Global',
};

export const ScoutingView: React.FC<ScoutingViewProps> = ({ clubId, onSelectPlayer }) => {
  const clubs = useWorldStore((s) => s.clubs);
  const [mobileSection, setMobileSection] = useState<'REPORTS' | 'ZONES' | 'SEARCH' | 'CLUBS'>('REPORTS');
  const [desktopMode, setDesktopMode] = useState<'PANEL' | 'CLUBS'>('PANEL');
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNREAD' | 'SHORTLIST'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [zoneFeedback, setZoneFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // World club browser state
  const [clubSearch, setClubSearch] = useState('');
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>('ALL');
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<string>('ALL');
  const [selectedExploreClubId, setSelectedExploreClubId] = useState<string | null>(null);

  const currentDate = useGameStore((s) => s.currentDate) || new Date();
  const club = clubs.find((c) => c.id === clubId) || world.getClub(clubId);
  const chiefScout = getChiefScout(clubId);

  const allReports = world.getScoutingReports(clubId, 200);
  const unreadCount = allReports.filter((r) => !r.isRead).length;

  const reports = useMemo(() => {
    let filtered = filterMode === 'UNREAD' ? allReports.filter((r) => !r.isRead) : allReports;
    if (filterMode === 'SHORTLIST' && club) {
      const shortlisted = new Set(club.shortlistedPlayerIds);
      filtered = filtered.filter((r) => shortlisted.has(r.playerId));
    }
    return filtered;
  }, [allReports, filterMode, club]);

  const shortlistedCount = club?.shortlistedPlayerIds.length || 0;

  // World leagues & countries metadata for club exploration
  const leagueList = useMemo(
    () => world.competitions.filter((c) => c.type === 'LEAGUE'),
    [clubs.length]
  );

  const leagueById = useMemo(() => {
    const map = new Map<string, (typeof leagueList)[number]>();
    leagueList.forEach((l) => map.set(l.id, l));
    return map;
  }, [leagueList]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    leagueList.forEach((l) => {
      if (l.country) set.add(l.country);
    });
    return Array.from(set).sort((a, b) => {
      if (a === 'Argentina') return -1;
      if (b === 'Argentina') return 1;
      return a.localeCompare(b, 'es');
    });
  }, [leagueList]);

  const leaguesForCountry = useMemo(() => {
    const list =
      selectedCountryFilter === 'ALL'
        ? leagueList
        : leagueList.filter((l) => l.country === selectedCountryFilter);
    return [...list].sort((a, b) => (a.tier || 9) - (b.tier || 9) || a.name.localeCompare(b.name, 'es'));
  }, [leagueList, selectedCountryFilter]);

  const filteredWorldClubs = useMemo(() => {
    const q = clubSearch.trim().toLowerCase();
    return clubs
      .filter((c) => {
        if (selectedLeagueFilter !== 'ALL' && c.leagueId !== selectedLeagueFilter) return false;
        if (selectedCountryFilter !== 'ALL') {
          const lg = leagueById.get(c.leagueId);
          if (lg?.country !== selectedCountryFilter) return false;
        }
        if (q) {
          const lg = leagueById.get(c.leagueId);
          const hit =
            c.name.toLowerCase().includes(q) ||
            (c.shortName && c.shortName.toLowerCase().includes(q)) ||
            (lg?.country && lg.country.toLowerCase().includes(q)) ||
            (lg?.name && lg.name.toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => (b.reputation || 0) - (a.reputation || 0) || a.name.localeCompare(b.name, 'es'))
      .slice(0, 120);
  }, [clubs, clubSearch, selectedCountryFilter, selectedLeagueFilter, leagueById]);

  const exploredClub: Club | undefined = useMemo(
    () => (selectedExploreClubId ? clubs.find((c) => c.id === selectedExploreClubId) || world.getClub(selectedExploreClubId) : undefined),
    [selectedExploreClubId, clubs]
  );

  const exploredClubPlayers = useMemo(() => {
    if (!exploredClub) return [];
    const squadOrder: Record<string, number> = { SENIOR: 0, RESERVE: 1, U20: 2 };
    return [...world.getPlayersByClub(exploredClub.id)].sort((a, b) => {
      const sa = squadOrder[a.squad] ?? 3;
      const sb = squadOrder[b.squad] ?? 3;
      if (sa !== sb) return sa - sb;
      if (Boolean(a.isStarter) !== Boolean(b.isStarter)) return a.isStarter ? -1 : 1;
      return (b.currentAbility || 0) - (a.currentAbility || 0);
    });
  }, [exploredClub, clubs]);

  const markRead = (reportId: string) => {
    const r = world.scoutingReports.find((sr) => sr.id === reportId);
    if (r) {
      r.isRead = true;
      notifyAll();
    }
  };

  const scoutPlayer = (playerId: string) => {
    world.generateScoutingReport(playerId, clubId, currentDate, clubId);
    notifyAll();
  };

  const toggleShortlist = (playerId: string) => {
    if (!club) return;
    const idx = club.shortlistedPlayerIds.indexOf(playerId);
    if (idx >= 0) club.shortlistedPlayerIds.splice(idx, 1);
    else club.shortlistedPlayerIds.push(playerId);
    notifyAll();
  };

  const isShortlisted = (playerId: string) => club?.shortlistedPlayerIds.includes(playerId);

  const handleScoutZone = (zone: string) => {
    const result = world.scoutByZone(clubId, zone as any, currentDate, clubId);
    setZoneFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    notifyAll();
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = world.players
      .filter((p) => p.clubId !== clubId && p.name.toLowerCase().includes(q) && p.age > 16)
      .slice(0, 20);
    setSearchResults(results);
  };

  const renderReportCard = (report: ScoutingReport) => {
    const player = world.players.find((p) => p.id === report.playerId);
    if (!player) return null;
    const pClub = world.getClub(player.clubId);
    return (
      <div
        key={report.id}
        className={`border rounded-sm shadow-sm transition-colors cursor-pointer ${
          report.isRead ? 'bg-white border-[#a0b0a0]' : 'bg-amber-50 border-amber-300'
        }`}
        onClick={() => {
          markRead(report.id);
          onSelectPlayer(player);
        }}
      >
        <div className="p-2 flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 border border-slate-300">
            <User size={14} className="text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-[11px] text-slate-900 truncate">{player.name}</span>
              {!report.isRead && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
              <span className="ml-auto flex items-center gap-2 text-[9px] font-black shrink-0">
                <span className="flex items-center gap-0.5 text-amber-700">
                  <Star size={10} className="text-amber-500" />
                  {report.currentAbility}
                </span>
                <span className="flex items-center gap-0.5 text-green-700">
                  <TrendingUp size={10} />
                  {report.potentialAbility}
                </span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleShortlist(player.id);
                }}
                className="shrink-0 cursor-pointer"
                title={isShortlisted(player.id) ? 'Quitar de seguimiento' : 'Agregar a seguimiento'}
              >
                {isShortlisted(player.id) ? (
                  <BookmarkCheck size={13} className="text-blue-600" />
                ) : (
                  <BookmarkPlus size={13} className="text-slate-400" />
                )}
              </button>
            </div>
            <div className="text-[8.5px] text-slate-500 font-bold truncate">
              {player.positions[0]} · {player.age}a · {pClub?.name || 'Agente Libre'} · {report.personality}
            </div>
            <div className="text-[9px] text-slate-700 mt-0.5 italic line-clamp-1">{report.summary}</div>
            {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {report.strengths.slice(0, 3).map((s) => (
                  <span key={s} className="text-[7.5px] font-bold text-green-700 bg-green-100 px-1 py-0.5 rounded-sm uppercase">
                    +{ATTRIBUTE_TRANSLATIONS[s] || s}
                  </span>
                ))}
                {report.weaknesses.slice(0, 2).map((w) => (
                  <span key={w} className="text-[7.5px] font-bold text-red-700 bg-red-100 px-1 py-0.5 rounded-sm uppercase">
                    -{ATTRIBUTE_TRANSLATIONS[w] || w}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWorldClubsExplorer = () => {
    if (exploredClub) {
      const exploredLeague = leagueById.get(exploredClub.leagueId);
      const squadLabel: Record<string, string> = { SENIOR: '1ra', RESERVE: 'Res', U20: 'S20' };
      return (
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#8e9b90] rounded-sm overflow-hidden shadow-xs">
          <div className="bg-[#3a4a3a] text-white px-2.5 py-2 flex items-center justify-between gap-2 shrink-0 border-b border-[#1c261c]">
            <button
              type="button"
              onClick={() => setSelectedExploreClubId(null)}
              className="flex items-center gap-1 px-2 py-1 rounded-[2px] bg-white/15 hover:bg-white/25 text-[10px] font-bold uppercase cursor-pointer shrink-0"
            >
              <ChevronLeft size={13} /> Clubes
            </button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FmClubShield club={exploredClub} size="xs" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase truncate leading-tight">{exploredClub.name}</p>
                <p className="text-[9px] text-slate-200 truncate">
                  {exploredLeague ? `${exploredLeague.country} · ${exploredLeague.name}` : 'Liga internacional'} · {exploredClubPlayers.length} jugadores
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scroll divide-y divide-slate-200">
            {exploredClubPlayers.length === 0 ? (
              <div className="p-6">
                <FMEmptyState
                  icon={<User size={24} />}
                  title="Plantel sin datos"
                  subtitle="No se encontraron jugadores registrados en este club."
                />
              </div>
            ) : (
              exploredClubPlayers.map((p) => {
                const hasReport = world.scoutingReports.some((r) => r.playerId === p.id && r.clubId === clubId);
                const isOwn = exploredClub.id === clubId;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#ebf3eb] transition-colors"
                  >
                    <img
                      src={getFlagUrl(p.nationality)}
                      alt={p.nationality}
                      className="w-3.5 h-2.5 object-cover rounded-[1px] shrink-0 border border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(p)}
                      className="flex-1 min-w-0 text-left cursor-pointer group"
                    >
                      <span className="text-[11px] font-bold text-slate-900 group-hover:underline truncate block">
                        {p.name}
                      </span>
                      <span className="text-[9px] text-slate-500 font-semibold">
                        {p.positions.join('/')} · {p.age} años · {squadLabel[p.squad] || p.squad}
                      </span>
                    </button>
                    {!isOwn && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasReport ? (
                          <span className="text-[9px] text-emerald-700 font-black px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 rounded-[2px]">
                            ✓ Ojeado
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => scoutPlayer(p.id)}
                            className="text-[9px] bg-[#2b5d2c] hover:bg-[#1f4720] text-white px-2 py-0.5 rounded-[2px] font-bold uppercase cursor-pointer"
                          >
                            Ojear
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleShortlist(p.id)}
                          className="p-0.5 cursor-pointer"
                          title={isShortlisted(p.id) ? 'Quitar de seguimiento' : 'Agregar a seguimiento'}
                        >
                          {isShortlisted(p.id) ? (
                            <BookmarkCheck size={14} className="text-blue-600" />
                          ) : (
                            <BookmarkPlus size={14} className="text-slate-400 hover:text-slate-700" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
        {/* Filters bar */}
        <div className="bg-white border border-[#8e9b90] rounded-sm p-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 shrink-0">
          <select
            value={selectedCountryFilter}
            onChange={(e) => {
              setSelectedCountryFilter(e.target.value);
              setSelectedLeagueFilter('ALL');
            }}
            aria-label="Filtrar por país"
            className="bg-[#f4f7f4] border border-[#8e9b90] rounded-[2px] px-2 py-1 text-[10.5px] font-bold text-slate-900 outline-none cursor-pointer"
          >
            <option value="ALL">Todos los países ({countries.length})</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={selectedLeagueFilter}
            onChange={(e) => setSelectedLeagueFilter(e.target.value)}
            aria-label="Filtrar por liga"
            className="bg-[#f4f7f4] border border-[#8e9b90] rounded-[2px] px-2 py-1 text-[10.5px] font-bold text-slate-900 outline-none cursor-pointer"
          >
            <option value="ALL">Todas las ligas ({leaguesForCountry.length})</option>
            {leaguesForCountry.map((l) => (
              <option key={l.id} value={l.id}>
                {selectedCountryFilter === 'ALL' ? `${l.country} · ${l.name}` : l.name}
              </option>
            ))}
          </select>

          <div className="flex items-center bg-[#f4f7f4] border border-[#8e9b90] rounded-[2px] px-2">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={clubSearch}
              onChange={(e) => setClubSearch(e.target.value)}
              placeholder="Buscar club del mundo..."
              className="flex-1 py-1 px-1.5 text-[10.5px] font-bold text-slate-900 bg-transparent outline-none min-w-0"
            />
          </div>
        </div>

        {/* Club cards grid */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-0.5">
          {filteredWorldClubs.length === 0 ? (
            <div className="h-full flex items-center justify-center bg-white/70 border border-[#a0b0a0] rounded-sm p-4">
              <FMEmptyState
                icon={<Shield size={24} />}
                title="Sin clubes coincidentes"
                subtitle="Probá cambiando el filtro de país, liga o búsqueda."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {filteredWorldClubs.map((c) => {
                const lg = leagueById.get(c.leagueId);
                const playerCount = world.getPlayersByClub(c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedExploreClubId(c.id)}
                    className="flex items-center gap-2.5 p-2 bg-white hover:bg-[#ebf3eb] border border-[#8e9b90] hover:border-[#2b5d2c] rounded-sm text-left transition-colors shadow-xs cursor-pointer"
                  >
                    <FmClubShield club={c} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-slate-900 truncate leading-tight">
                        {c.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5 text-[9px] text-slate-600 font-semibold truncate">
                        {lg?.country && (
                          <img
                            src={getFlagUrl(lg.country)}
                            alt={lg.country}
                            className="w-3 h-2 object-cover rounded-[1px] shrink-0 border border-slate-300"
                          />
                        )}
                        <span className="truncate">
                          {lg ? `${lg.name}` : 'Internacional'} · {playerCount} jug.
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const budget = club?.finances.scoutingBudget || 0;

  return (
    <div className="p-1.5 sm:p-2 h-full flex flex-col gap-1.5 bg-[#d4dcd4] overflow-hidden">
      {/* Top Bar with Chief Scout Character ALWAYS Visible at Top */}
      <header className="shrink-0 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1.5 bg-[#3a4a3a] rounded-sm text-white shrink-0">
            <Binoculars size={14} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2
                className="text-xs sm:text-base font-black text-slate-900 uppercase italic tracking-tighter truncate leading-none"
                style={{ fontFamily: 'Verdana, sans-serif' }}
              >
                Scouting
              </h2>
              {club && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[7.5px] font-black uppercase px-1.5 py-0.5 rounded-sm border bg-white/80 border-[#a0b0a0] text-slate-700 shrink-0">
                  <Radar size={9} className="text-[#3a4a3a]" />{' '}
                  {REGION_LABELS[club.scoutingRegion] || club.scoutingRegion}
                </span>
              )}
            </div>
            <p className="text-slate-600 font-bold text-[8.5px] uppercase tracking-wider truncate">
              {allReports.length} informes · Presupuesto:{' '}
              <span className="text-green-800 font-mono">${budget.toLocaleString()}</span>
            </p>
          </div>
        </div>
        <DialogueAvatar
          position="inline"
          clubColor={club?.primaryColor || '#2b5d2c'}
          cargo="Ojeador"
          name={chiefScout?.name}
          badge={unreadCount > 0}
          onClick={() => useDialogueStore.getState().open('SCOUT', { clubId, source: 'SCOUTING' })}
        />
      </header>

      {/* Desktop Mode Switcher: Panel de Scouting vs Clubes del Mundo */}
      <div className="hidden md:flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setDesktopMode('PANEL')}
          className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-[2px] border cursor-pointer transition-all ${
            desktopMode === 'PANEL'
              ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
              : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
          }`}
        >
          Informes, Zonas y Búsqueda
        </button>
        <button
          type="button"
          onClick={() => setDesktopMode('CLUBS')}
          className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-[2px] border cursor-pointer transition-all flex items-center gap-1.5 ${
            desktopMode === 'CLUBS'
              ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
              : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
          }`}
        >
          <Globe2 size={12} /> Clubes del Mundo ({clubs.length})
        </button>
      </div>

      {/* Mobile Section Tabs — Zero scroll needed on mobile */}
      <div className="flex md:hidden gap-1 shrink-0">
        {(
          [
            { id: 'REPORTS', label: `Informes (${allReports.length})` },
            { id: 'ZONES', label: 'Zonas' },
            { id: 'SEARCH', label: 'Buscar' },
            { id: 'CLUBS', label: 'Clubes' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileSection(tab.id)}
            className={`flex-1 py-1 text-[9px] font-black uppercase rounded-[2px] border cursor-pointer transition-all ${
              mobileSection === tab.id
                ? 'bg-[#2b5d2c] text-white border-[#142b15] shadow-inner'
                : 'bg-gradient-to-b from-[#f3f4f6] to-[#cfd5dc] text-[#1f2428] border-[#6b7280]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* World Clubs Explorer — Active on mobile 'CLUBS' tab OR desktop 'CLUBS' mode */}
      <div
        className={`${mobileSection === 'CLUBS' ? 'flex' : 'hidden'} ${
          desktopMode === 'CLUBS' ? 'md:flex' : 'md:hidden'
        } flex-col flex-1 min-h-0 overflow-hidden`}
      >
        {renderWorldClubsExplorer()}
      </div>

      {/* Zonas de scouting */}
      <div
        className={`${mobileSection === 'ZONES' ? 'flex flex-col flex-1 min-h-0' : 'hidden'} ${
          desktopMode === 'PANEL' ? 'md:block md:shrink-0' : 'md:hidden'
        }`}
      >
        <FMBox
          title="Zonas de Scouting"
          className="flex-1 md:flex-none"
          headerRight={
            <span className={`text-[8px] font-black uppercase ${budget > 0 ? 'text-green-800' : 'text-red-700'}`}>
              Saldo ${budget.toLocaleString()}
            </span>
          }
        >
          <div className="p-1.5 flex flex-col gap-1.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
              {(Object.keys(SCOUTING_ZONE_COSTS) as string[]).map((zone) => {
                const cost = SCOUTING_ZONE_COSTS[zone];
                const disabled = budget < cost;
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => handleScoutZone(zone)}
                    disabled={disabled}
                    className={`flex flex-col gap-0.5 items-center justify-center border rounded-sm px-1.5 py-1.5 text-center transition-all ${
                      disabled
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-white border-[#a0b0a0] hover:border-[#3a4a3a] hover:bg-[#f2f7f2] text-slate-700 cursor-pointer'
                    }`}
                    title={`${SCOUTING_ZONE_DESC[zone]} · Costo $${cost.toLocaleString()}`}
                  >
                    <span className="text-[#3a4a3a]">{ZONE_ICONS[zone]}</span>
                    <span className="text-[8px] font-black uppercase leading-tight">
                      {SCOUTING_ZONE_LABELS[zone]}
                    </span>
                    <span className={`text-[7.5px] font-bold uppercase ${disabled ? 'text-slate-400' : 'text-green-700'}`}>
                      ${cost.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[7.5px] text-slate-500 italic font-bold uppercase leading-tight">
              {club
                ? `Región: ${REGION_LABELS[club.scoutingRegion] || club.scoutingRegion} · Toca una zona para enviar ojeadores o consulta al Ojeador Jefe arriba.`
                : ''}
            </p>
            {zoneFeedback && (
              <div
                className={`px-2 py-1 rounded-sm border ${
                  zoneFeedback.type === 'success'
                    ? 'bg-green-100 border-green-400 text-green-900'
                    : 'bg-red-100 border-red-400 text-red-900'
                } text-[8.5px] font-bold`}
              >
                {zoneFeedback.message}
              </div>
            )}
          </div>
        </FMBox>
      </div>

      {/* Search bar + results */}
      <div
        className={`${mobileSection === 'SEARCH' ? 'flex flex-col flex-1 min-h-0 gap-1.5' : 'hidden'} ${
          desktopMode === 'PANEL' ? 'md:flex md:flex-col md:shrink-0 md:gap-1' : 'md:hidden'
        }`}
      >
        <div className="flex gap-1.5 shrink-0">
          <div className="flex-1 flex items-center bg-white border border-slate-400 rounded-sm px-2">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Buscar jugador para pedir informe..."
              className="flex-1 py-1.5 px-1.5 text-[11px] font-bold text-slate-800 bg-transparent outline-none"
            />
          </div>
          <FMButton onClick={handleSearch} className="text-[9px] shrink-0 px-2.5">
            <Search size={12} /> Buscar
          </FMButton>
        </div>

        {searchResults.length > 0 ? (
          <div className="flex-1 md:flex-none md:max-h-36 overflow-y-auto bg-white border border-[#a0b0a0] rounded-sm shadow-sm custom-scroll">
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-2 py-1 border-b border-slate-200 bg-[#f0f4f0]">
              Resultados ({searchResults.length})
            </div>
            {searchResults.map((p) => {
              const hasReport = world.scoutingReports.some((r) => r.playerId === p.id && r.clubId === clubId);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2 py-1 hover:bg-blue-50 border-b border-slate-100 last:border-0"
                >
                  <img src={getFlagUrl(p.nationality)} alt="" className="w-3 h-2 object-cover rounded-[1px] shrink-0" />
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(p)}
                    className="flex-1 text-left text-[10px] font-bold text-slate-900 truncate hover:underline cursor-pointer"
                  >
                    {p.name}
                  </button>
                  <span className="text-[8px] text-slate-500 shrink-0">
                    {p.positions[0]} · {p.age}a
                  </span>
                  {hasReport ? (
                    <span className="text-[8px] text-green-700 font-bold shrink-0">✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => scoutPlayer(p.id)}
                      className="text-[8px] bg-[#3a4a3a] text-white px-1.5 py-0.5 rounded-sm font-bold hover:bg-[#2a3a2a] cursor-pointer shrink-0"
                    >
                      Ojear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleShortlist(p.id)}
                    className="shrink-0 cursor-pointer"
                    title={isShortlisted(p.id) ? 'Quitar' : 'Seguimiento'}
                  >
                    {isShortlisted(p.id) ? (
                      <BookmarkCheck size={13} className="text-blue-600" />
                    ) : (
                      <BookmarkPlus size={13} className="text-slate-400" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          mobileSection === 'SEARCH' && (
            <div className="flex-1 flex items-center justify-center bg-white/70 border border-[#a0b0a0] rounded-sm p-4">
              <FMEmptyState
                icon={<Search size={24} />}
                title="Buscar Jugadores"
                subtitle="Escribe un nombre para solicitar un informe directo o agregarlo a seguimiento."
              />
            </div>
          )
        )}
      </div>

      {/* Reports section */}
      <div
        className={`${mobileSection === 'REPORTS' ? 'flex' : 'hidden'} ${
          desktopMode === 'PANEL' ? 'md:flex' : 'md:hidden'
        } flex-col flex-1 min-h-0 gap-1.5 overflow-hidden`}
      >
        <div className="flex gap-1 shrink-0">
          <FMButton
            variant={filterMode === 'ALL' ? 'primary' : 'secondary'}
            onClick={() => setFilterMode('ALL')}
            className="flex-1 text-[9px] py-1"
          >
            Todos ({allReports.length})
          </FMButton>
          <FMButton
            variant={filterMode === 'UNREAD' ? 'primary' : 'secondary'}
            onClick={() => setFilterMode('UNREAD')}
            className="flex-1 text-[9px] py-1"
          >
            Nuevos ({unreadCount})
          </FMButton>
          <FMButton
            variant={filterMode === 'SHORTLIST' ? 'primary' : 'secondary'}
            onClick={() => setFilterMode('SHORTLIST')}
            className="flex-1 text-[9px] py-1"
          >
            <BookmarkCheck size={11} /> Cartera ({shortlistedCount})
          </FMButton>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll space-y-1.5 pr-0.5">
          {reports.length === 0 ? (
            <div className="h-full flex items-center justify-center bg-white/60 border border-[#a0b0a0] rounded-sm p-3">
              <FMEmptyState
                icon={<Binoculars size={24} />}
                title="Sin informes todavía"
                subtitle="Envía ojeadores desde 'Zonas' o consulta al Ojeador Jefe arriba para recomendaciones."
              />
            </div>
          ) : (
            reports.map(renderReportCard)
          )}
        </div>
      </div>
    </div>
  );
};