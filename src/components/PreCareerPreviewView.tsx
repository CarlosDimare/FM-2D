import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  Flag,
  RefreshCw,
  Shield,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { getFlagUrl } from '../data/static';
import { world } from '../services/worldManager';
import { Club, NationalTeam, Player, Position, SquadType } from '../types';
import { FmBroadcastHeader } from './ClubBannerChrome';
import { FMButton } from './FMUI';
import { PlayerModal } from './PlayerModal';

interface PreCareerPreviewViewProps {
  mode: 'CLUB' | 'NATIONAL';
  club?: Club | null;
  leagueName?: string;
  nationalTeam?: NationalTeam | null;
  currentDate: Date;
  chooseButtonLabel?: string;
  onBack: () => void;
  onConfirmChoose: () => void;
}

const POSITION_ORDER: Record<string, number> = {
  [Position.GK]: 0,
  [Position.SW]: 1,
  [Position.DC]: 2,
  [Position.DL]: 3,
  [Position.DR]: 4,
  [Position.DML]: 5,
  [Position.DMR]: 6,
  [Position.DM]: 7,
  [Position.MC]: 8,
  [Position.ML]: 9,
  [Position.MR]: 10,
  [Position.AM]: 11,
  [Position.AML]: 12,
  [Position.AMR]: 13,
  [Position.ST]: 14,
  [Position.STL]: 15,
  [Position.STR]: 16,
};

const OBJECTIVE_LABELS: Record<string, string> = {
  WIN_LEAGUE: 'Pelear el Título',
  TOP_4: 'Clasificar a Copas',
  TOP_HALF: 'Mitad Superior',
  AVOID_RELEGATION: 'Mantener la Categoría',
  WIN_CUP: 'Ganar la Copa',
  CUP_SEMIS: 'Semifinales de Copa',
};

export const PreCareerPreviewView: React.FC<PreCareerPreviewViewProps> = ({
  mode,
  club,
  leagueName,
  nationalTeam,
  currentDate,
  chooseButtonLabel,
  onBack,
  onConfirmChoose,
}) => {
  const [worldReady, setWorldReady] = useState(() => world.isReady);
  const [squadFilter, setSquadFilter] = useState<SquadType | 'ALL'>('SENIOR');
  const [inspectedPlayer, setInspectedPlayer] = useState<Player | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      setWorldReady(world.isReady);
      if (mode === 'CLUB' && club) {
        world.ensureDeepSquads(club.leagueId);
      }
      setRefreshTick((t) => t + 1);
    };

    if (!world.isReady) {
      world.readyPromise.then(sync);
    } else {
      sync();
    }

    return () => {
      active = false;
    };
  }, [mode, club?.id, club?.leagueId, nationalTeam?.id]);

  const rawPlayers = useMemo(() => {
    if (!worldReady) return [];
    if (mode === 'CLUB' && club) {
      return world.getPlayersByClub(club.id);
    }
    if (mode === 'NATIONAL' && nationalTeam) {
      return (
        world.nationalTeamManager?.getEligiblePlayers(
          nationalTeam.id,
          world.players,
          world.clubs
        ) || []
      );
    }
    return [];
  }, [worldReady, mode, club, nationalTeam, refreshTick]);

  const headCoach = useMemo(() => {
    if (mode !== 'CLUB' || !club || !worldReady) return null;
    return world.staff.find((s) => s.clubId === club.id && s.role === 'HEAD_COACH') || null;
  }, [mode, club, worldReady, refreshTick]);

  const filteredPlayers = useMemo(() => {
    let list = [...rawPlayers];
    if (mode === 'CLUB' && squadFilter !== 'ALL') {
      list = list.filter((p) => p.squad === squadFilter);
    }

    list.sort((a, b) => {
      const pa = POSITION_ORDER[a.positions[0]] ?? 99;
      const pb = POSITION_ORDER[b.positions[0]] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.currentAbility - a.currentAbility;
    });

    return list;
  }, [rawPlayers, mode, squadFilter]);

  const avgSquadCa = useMemo(() => {
    const base = mode === 'CLUB' ? rawPlayers.filter((p) => p.squad === 'SENIOR') : rawPlayers.slice(0, 23);
    if (base.length === 0) return 0;
    return Math.round(base.reduce((acc, p) => acc + p.currentAbility, 0) / base.length);
  }, [rawPlayers, mode]);

  const ctaLabel =
    chooseButtonLabel ||
    (mode === 'CLUB' ? 'Elegir Club' : 'Elegir Selección');

  const pillBtnClass = (active: boolean) =>
    `px-2.5 py-1 rounded-[2px] border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer transition-all ${
      active
        ? 'bg-gradient-to-b from-[#2b5d2c] to-[#1d431e] border-[#133014] text-white shadow-inner'
        : 'bg-gradient-to-b from-[#f3f4f6] via-[#d4d8de] to-[#b9bfc6] border-[#737a82] text-[#1f2428] hover:brightness-105'
    }`;

  return (
    <div
      className="h-[100dvh] w-screen bg-[#d4dcd4] flex flex-col overflow-hidden"
      style={{ fontFamily: 'Verdana, sans-serif' }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2 sm:p-4 md:p-6">
        <div className="max-w-5xl mx-auto bg-[#e8ece8] rounded-sm border border-[#1c1f24] shadow-2xl overflow-hidden flex flex-col">
          {/* Dynamic FM08 Broadcast Header */}
          {mode === 'CLUB' && club ? (
            <FmBroadcastHeader
              club={club}
              title={club.name}
              shortCode={club.shortName}
              subtitle={`${leagueName || 'Liga'} · ${club.country} · Rep ${Math.round(club.reputation / 10)}`}
              shieldSize="lg"
              rightSlot={
                <img
                  src={getFlagUrl(club.country)}
                  alt={club.country}
                  className="w-8 h-6 rounded-[2px] border border-white/50 object-cover shadow"
                />
              }
            />
          ) : nationalTeam ? (
            <div
              className="relative px-3 sm:px-5 py-3 border-b border-[#14171a] flex items-center justify-between gap-3 overflow-hidden"
              style={{
                background: 'linear-gradient(90deg, #1e3a8a 0%, #172554 45%, #1c1f24 100%)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
                }}
              />
              <div className="relative z-10 flex items-center gap-3 min-w-0">
                <img
                  src={getFlagUrl(nationalTeam.country)}
                  alt={nationalTeam.country}
                  className="w-11 h-8 sm:w-14 sm:h-10 rounded-[2px] border border-white/60 object-cover shadow-md shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="text-base sm:text-xl font-black text-white uppercase tracking-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    {nationalTeam.name}
                  </h2>
                  <p className="text-[10.5px] sm:text-xs text-slate-200 font-semibold truncate">
                    Selección Nacional · {nationalTeam.confederation} · Rep {Math.round(nationalTeam.reputation / 10)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* FM08 Steel Navigation + Confirm Ribbon */}
          <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-2.5 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 px-3 py-1.5 rounded-[2px] border border-[#737a82] bg-gradient-to-b from-[#f3f4f6] via-[#d4d8de] to-[#b9bfc6] text-[#1f2428] text-xs font-bold hover:brightness-105 cursor-pointer"
            >
              <ChevronLeft size={14} /> Volver
            </button>

            <button
              type="button"
              onClick={onConfirmChoose}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-[2px] border border-[#0f2410] bg-gradient-to-b from-[#3b7a3d] via-[#2b5d2c] to-[#1a3d1b] text-white text-xs font-black uppercase tracking-wider shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_4px_rgba(0,0,0,0.5)] hover:brightness-110 cursor-pointer"
            >
              <CheckCircle2 size={14} className="text-[#facc15]" />
              <span>{ctaLabel}</span>
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-3 bg-[#d4dcd4]">
            {/* Club or National Team Information Grid */}
            {mode === 'CLUB' && club ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <Building2 size={12} className="text-[#1f5922]" /> Estadio
                  </div>
                  <div className="text-xs font-bold text-slate-900 truncate mt-0.5">{club.stadium}</div>
                  <div className="text-[10px] font-mono text-slate-600 tabular-nums">
                    Cap: {club.stadiumCapacity.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <DollarSign size={12} className="text-emerald-700" /> Economía
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                    Bal: £{(club.finances.balance / 1_000_000).toFixed(1)}M
                  </div>
                  <div className="text-[10px] font-mono text-emerald-800 tabular-nums">
                    Fichajes: £{(club.finances.transferBudget / 1_000_000).toFixed(1)}M
                  </div>
                </div>

                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <UserCheck size={12} className="text-sky-700" /> Técnico Actual
                  </div>
                  <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                    {headCoach?.name || 'Vacante'}
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    {headCoach?.preferredFormation ? `Esquema: ${headCoach.preferredFormation}` : `Media plantel: ${avgSquadCa || '—'}`}
                  </div>
                </div>

                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <Trophy size={12} className="text-amber-600" /> Expectativa y Nivel
                  </div>
                  <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                    {OBJECTIVE_LABELS[club.seasonObjective || 'TOP_HALF'] || 'Competir'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-600 tabular-nums">
                    Entr {club.trainingFacilities}/20 · Juv {club.youthFacilities}/20
                  </div>
                </div>
              </div>
            ) : nationalTeam ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <Flag size={12} className="text-sky-700" /> Confederación
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">{nationalTeam.confederation}</div>
                  <div className="text-[10px] text-slate-600">{nationalTeam.country}</div>
                </div>

                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <Shield size={12} className="text-[#1f5922]" /> Esquema Base
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 mt-0.5">
                    {nationalTeam.formation || '4-4-2'}
                  </div>
                  <div className="text-[10px] text-slate-600">Preselección internacional</div>
                </div>

                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <Users size={12} className="text-emerald-700" /> Elegibles
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                    {rawPlayers.length} jugadores
                  </div>
                  <div className="text-[10px] text-slate-600">Base internacional activa</div>
                </div>

                <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase text-slate-500">
                    <Trophy size={12} className="text-amber-600" /> Media Top-23
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                    {avgSquadCa || '—'} / 200
                  </div>
                  <div className="text-[10px] font-mono text-slate-600">
                    Rep {Math.round(nationalTeam.reputation / 10)}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Squad Roster Panel */}
            <div className="bg-[#e8ece8] border border-[#8e9b90] rounded-sm overflow-hidden shadow-sm">
              <div
                className="px-3 py-2 border-b border-[#1c1f24] flex flex-wrap items-center justify-between gap-2"
                style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white">
                  <Users size={14} className="text-[#facc15]" />
                  <span>
                    {mode === 'CLUB' ? 'Plantilla del Club' : 'Jugadores Elegibles'} ({filteredPlayers.length})
                  </span>
                </div>
                <span className="text-[10px] text-slate-300">
                  Toca cualquier jugador para ver su ficha completa
                </span>
              </div>

              {/* Squad Category Tabs (Club only) */}
              {mode === 'CLUB' && (
                <div className="p-2.5 border-b border-[#b8c4b8] bg-[#dde4dd] flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'SENIOR', label: '1º Equipo' },
                      { id: 'RESERVE', label: 'Reserva' },
                      { id: 'U20', label: 'Sub-20' },
                      { id: 'ALL', label: 'Todos' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSquadFilter(tab.id)}
                      className={pillBtnClass(squadFilter === tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Players Table */}
              {!worldReady ? (
                <div className="p-8 bg-white flex flex-col items-center justify-center gap-2 text-slate-600">
                  <RefreshCw size={22} className="animate-spin text-[#1f5922]" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Cargando plantilla de jugadores...
                  </span>
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className="p-8 bg-white text-center text-xs text-slate-500">
                  No se encontraron jugadores con los filtros seleccionados.
                </div>
              ) : (
                <div className="max-h-[48vh] overflow-y-auto custom-scroll bg-white">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead
                      className="sticky top-0 z-10 border-b border-[#737a82] text-[10px]"
                      style={{
                        background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 52%, #c2c8cf 100%)',
                      }}
                    >
                      <tr>
                        <th className="py-1.5 px-2 font-bold uppercase text-[#1f2428] w-14">Pos</th>
                        <th className="py-1.5 px-2 font-bold uppercase text-[#1f2428]">Jugador</th>
                        {mode === 'NATIONAL' && (
                          <th className="py-1.5 px-2 font-bold uppercase text-[#1f2428] hidden sm:table-cell">
                            Club
                          </th>
                        )}
                        <th className="py-1.5 px-2 font-bold uppercase text-[#1f2428] text-right">
                          Edad
                        </th>
                        <th className="py-1.5 px-2 font-bold uppercase text-[#1f2428] text-right">
                          Media
                        </th>
                        <th className="py-1.5 px-2 font-bold uppercase text-[#1f2428] text-right hidden sm:table-cell">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e7e2]">
                      {filteredPlayers.map((p, idx) => {
                        const pos = p.positions[0] || Position.MC;
                        const playerClub = p.clubId ? world.getClub(p.clubId) : null;
                        const ratingColor =
                          p.currentAbility >= 145
                            ? 'bg-[#1f5922] text-white border-[#133815]'
                            : p.currentAbility >= 115
                            ? 'bg-[#dde6dd] text-slate-900 border-[#96a696]'
                            : 'bg-slate-100 text-slate-700 border-slate-300';

                        return (
                          <tr
                            key={p.id}
                            onClick={() => setInspectedPlayer(p)}
                            className={`cursor-pointer transition-colors ${
                              idx % 2 === 0
                                ? 'bg-white hover:bg-[#eaf3ea]'
                                : 'bg-[#f6f9f6] hover:bg-[#eaf3ea]'
                            }`}
                          >
                            <td className="py-1.5 px-2">
                              <span className="inline-block px-1.5 py-0.5 rounded-[2px] bg-[#e2e7e2] border border-[#b4c0b4] text-[9.5px] font-black text-slate-800 w-10 text-center">
                                {pos}
                              </span>
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={getFlagUrl(p.nationality)}
                                  alt={p.nationality}
                                  className="w-4 h-3 rounded-[1px] border border-slate-300 object-cover shrink-0"
                                />
                                <span className="font-semibold text-slate-900 truncate">
                                  {p.name}
                                </span>
                              </div>
                            </td>
                            {mode === 'NATIONAL' && (
                              <td className="py-1.5 px-2 text-slate-600 truncate max-w-[140px] hidden sm:table-cell">
                                {playerClub?.shortName || playerClub?.name || 'Agente Libre'}
                              </td>
                            )}
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700">
                              {p.age}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                              <span
                                className={`inline-block min-w-[30px] px-1.5 py-0.5 rounded-[2px] border text-[10px] font-black text-center ${ratingColor}`}
                              >
                                {Math.round(p.currentAbility / 2)}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 hidden sm:table-cell">
                              £{p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : `${Math.round(p.value / 1000)}K`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bottom CTA */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <FMButton
                type="button"
                variant="secondary"
                onClick={onBack}
                className="sm:w-44 py-2.5 text-xs"
              >
                <ChevronLeft size={14} /> Volver
              </FMButton>
              <FMButton
                type="button"
                variant="primary"
                onClick={onConfirmChoose}
                className="flex-1 py-2.5 text-xs"
              >
                <CheckCircle2 size={14} /> {ctaLabel}
              </FMButton>
            </div>
          </div>
        </div>
      </div>

      {/* Full Read-Only Player Inspection Modal */}
      {inspectedPlayer && (
        <PlayerModal
          player={inspectedPlayer}
          onClose={() => setInspectedPlayer(null)}
          currentDate={currentDate}
        />
      )}
    </div>
  );
};
