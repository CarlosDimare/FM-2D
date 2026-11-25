import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Map as MapIcon } from 'lucide-react';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  MatchSnapshot,
  ShotRecord,
  TeamSide,
} from '../../types/match';

export const FmCollapsibleSection: React.FC<{
  title: React.ReactNode;
  icon?: React.ReactNode;
  rightSummary?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, rightSummary, isOpen, onToggle, children }) => (
  <section className="bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="w-full relative border-b border-[#1c1f24] px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2 text-left cursor-pointer hover:brightness-110 transition-all"
      style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-3"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 100%)' }}
      />
      <div className="relative z-10 flex items-center gap-2 min-w-0">
        <span className="text-[#facc15] shrink-0">
          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        {icon && <span className="text-[#facc15] shrink-0">{icon}</span>}
        <span className="text-slate-100 font-bold text-[11px] sm:text-xs tracking-wide uppercase truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
          {title}
        </span>
      </div>
      {rightSummary && (
        <div className="relative z-10 text-[10px] font-mono text-slate-200 shrink-0 flex items-center gap-2">
          {rightSummary}
        </div>
      )}
    </button>
    {isOpen && <div className="p-2.5 sm:p-3.5 bg-[#e8ece8]">{children}</div>}
  </section>
);

export const FmStatBarRow: React.FC<{
  label: string;
  homeVal: string | number;
  awayVal: string | number;
  homeNum: number;
  awayNum: number;
  homeColor: string;
  awayColor: string;
}> = ({ label, homeVal, awayVal, homeNum, awayNum, homeColor, awayColor }) => {
  const total = homeNum + awayNum;
  const homePct = total > 0 ? (homeNum / total) * 100 : 50;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-800">
        <span className="font-bold text-slate-900">{homeVal}</span>
        <span className="font-sans text-[10.5px] font-semibold text-slate-600 px-2 text-center">
          {label}
        </span>
        <span className="font-bold text-slate-900">{awayVal}</span>
      </div>
      <div className="flex h-2 rounded-[2px] overflow-hidden bg-[#cfd7cf] border border-[#a5b2a5]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${homePct}%`, backgroundColor: homeColor }}
        />
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }}
        />
      </div>
    </div>
  );
};

const PitchMarkingsSvg: React.FC = () => (
  <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.45" fill="none">
    <rect x="-52.5" y="-34" width="105" height="68" />
    <line x1="0" y1="-34" x2="0" y2="34" />
    <circle cx="0" cy="0" r="9.15" />
    <circle cx="0" cy="0" r="0.5" fill="rgba(255,255,255,0.4)" />
    <rect x="-52.5" y="-20.16" width="16.5" height="40.32" />
    <rect x="-52.5" y="-9.16" width="5.5" height="18.32" />
    <rect x="36" y="-20.16" width="16.5" height="40.32" />
    <rect x="47" y="-9.16" width="5.5" height="18.32" />
  </g>
);

const HeatmapGridSvg: React.FC<{
  heatmap: number[];
  color: string;
  label?: string;
}> = ({ heatmap, color, label }) => {
  const maxVal = Math.max(1, ...heatmap);
  const totalTouches = heatmap.reduce((acc, v) => acc + v, 0);
  const cellW = 105 / HEATMAP_COLS;
  const cellH = 68 / HEATMAP_ROWS;

  if (totalTouches === 0) {
    return (
      <div className="relative w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] flex items-center justify-center text-center px-4">
        <span className="text-xs text-slate-200">
          Sin registros espaciales disponibles.
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] overflow-hidden">
      <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
        {heatmap.map((val, idx) => {
          if (val <= 0) return null;
          const col = idx % HEATMAP_COLS;
          const row = Math.floor(idx / HEATMAP_COLS);
          const intensity = Math.min(1, val / maxVal);
          const x = -52.5 + col * cellW;
          const y = -34 + row * cellH;
          const fillColor =
            intensity > 0.72 ? '#ef4444' : intensity > 0.42 ? '#f59e0b' : color;
          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width={cellW + 0.15}
              height={cellH + 0.15}
              fill={fillColor}
              fillOpacity={0.18 + intensity * 0.65}
            />
          );
        })}
        <PitchMarkingsSvg />
      </svg>
      {label && (
        <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[9px] text-white/90 font-semibold pointer-events-none drop-shadow">
          <span>Propia portería</span>
          <span>{label}</span>
          <span>Ataque →</span>
        </div>
      )}
    </div>
  );
};

interface AdvancedProps {
  snapshot: MatchSnapshot;
  homeColor: string;
  awayColor: string;
  isMapsOpen: boolean;
  onToggleMaps: () => void;
  onSelectPlayerId: (id: string) => void;
}

type TeamFilter = 'all' | TeamSide;

export const PostMatchAdvancedSections: React.FC<AdvancedProps> = ({
  snapshot,
  homeColor,
  awayColor,
  isMapsOpen,
  onToggleMaps,
  onSelectPlayerId,
}) => {
  const { homeStats, awayStats, homeClub, awayClub, shots, passLinks } = snapshot;

  const [mapSide, setMapSide] = useState<TeamSide>('home');
  const [shotFilter, setShotFilter] = useState<TeamFilter>('all');

  const filteredShots = useMemo(
    () => (shotFilter === 'all' ? shots : shots.filter((s) => s.side === shotFilter)),
    [shots, shotFilter]
  );

  const networkPlayers = useMemo(() => {
    const list = mapSide === 'home' ? snapshot.homePlayers : snapshot.awayPlayers;
    return list.filter((p) => (p.onPitch || p.minutesPlayed > 1) && p.touches > 0);
  }, [mapSide, snapshot.homePlayers, snapshot.awayPlayers]);

  const networkEdges = useMemo(() => {
    const validIds = new Set(networkPlayers.map((p) => p.id));
    return passLinks.filter(
      (l) => l.side === mapSide && l.count >= 1 && validIds.has(l.fromId) && validIds.has(l.toId)
    );
  }, [passLinks, mapSide, networkPlayers]);

  const maxEdgeCount = Math.max(1, ...networkEdges.map((e) => e.count));

  const pillBtnClass = (active: boolean) =>
    `px-2.5 py-1 rounded-[2px] border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer transition-all ${
      active
        ? 'bg-gradient-to-b from-[#2b5d2c] to-[#1d431e] border-[#133014] text-white shadow-inner'
        : 'bg-gradient-to-b from-[#f3f4f6] via-[#d4d8de] to-[#b9bfc6] border-[#737a82] text-[#1f2428] hover:brightness-105'
    }`;

  return (
    <FmCollapsibleSection
      title="Mapas de Tiros, Calor y Red de Pases"
      icon={<MapIcon size={14} />}
      rightSummary={`${shots.length} tiros · ${passLinks.length} enlaces`}
      isOpen={isMapsOpen}
      onToggle={onToggleMaps}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMapSide('home')}
              className={pillBtnClass(mapSide === 'home')}
            >
              {homeClub.shortCode} (Red y Calor)
            </button>
            <button
              type="button"
              onClick={() => setMapSide('away')}
              className={pillBtnClass(mapSide === 'away')}
            >
              {awayClub.shortCode} (Red y Calor)
            </button>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase text-slate-600 mr-1">Tiros:</span>
            {(['all', 'home', 'away'] as TeamFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setShotFilter(f)}
                className={pillBtnClass(shotFilter === f)}
              >
                {f === 'all' ? 'Ambos' : f === 'home' ? homeClub.shortCode : awayClub.shortCode}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Shot & xGOT Map */}
          <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Mapa de Tiros &amp; xGOT</span>
              <span className="text-[10.5px] font-mono text-slate-500 tabular-nums">
                {filteredShots.length} remates
              </span>
            </div>
            {filteredShots.length === 0 ? (
              <div className="w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] flex items-center justify-center text-center px-4">
                <span className="text-xs text-slate-200">Sin remates en esta selección.</span>
              </div>
            ) : (
              <div className="relative w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] overflow-hidden">
                <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
                  <PitchMarkingsSvg />
                  {filteredShots.map((s: ShotRecord) => {
                    const cx = s.side === 'home' ? s.x : -s.x;
                    const cz = s.side === 'home' ? s.z : -s.z;
                    const radius = 1.25 + s.xg * 4.4;
                    const isGoal = s.outcome === 'gol';
                    const color = s.side === 'home' ? homeColor : awayColor;
                    return (
                      <g key={s.id}>
                        <circle
                          cx={cx}
                          cy={cz}
                          r={radius}
                          fill={isGoal ? '#10b981' : color}
                          fillOpacity={isGoal ? 0.94 : 0.6}
                          stroke="#ffffff"
                          strokeWidth={isGoal ? 0.65 : 0.35}
                        >
                          <title>
                            {`${s.minute}' ${s.playerName} (${s.outcome.toUpperCase()}) · xG: ${s.xg.toFixed(
                              2
                            )} · xGOT: ${s.xgot.toFixed(2)}`}
                          </title>
                        </circle>
                        {s.xgot > 0.12 && (
                          <circle
                            cx={cx}
                            cy={cz}
                            r={Math.max(0.55, s.xgot * 1.9)}
                            fill="#fde047"
                            fillOpacity={0.85}
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>
                <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[9px] text-white/90 font-semibold pointer-events-none drop-shadow">
                  <span>← {awayClub.shortCode}</span>
                  <span>Verde = Gol</span>
                  <span>{homeClub.shortCode} →</span>
                </div>
              </div>
            )}
          </div>

          {/* Pass Network */}
          <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>
                Red de Pases ({mapSide === 'home' ? homeClub.shortCode : awayClub.shortCode})
              </span>
              <span className="text-[10.5px] font-mono text-slate-500 tabular-nums">
                {networkEdges.length} enlaces
              </span>
            </div>
            {networkEdges.length < 3 ? (
              <div className="w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] flex items-center justify-center text-center px-4">
                <span className="text-xs text-slate-200">
                  Pocos enlaces registrados para construir la red.
                </span>
              </div>
            ) : (
              <div className="relative w-full aspect-[105/68] rounded-sm bg-[#163c24] border border-[#1c1f24] overflow-hidden">
                <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
                  <PitchMarkingsSvg />
                  {networkEdges.map((edge) => {
                    const fromP = networkPlayers.find((p) => p.id === edge.fromId);
                    const toP = networkPlayers.find((p) => p.id === edge.toId);
                    if (!fromP || !toP) return null;
                    const weight = edge.count / maxEdgeCount;
                    return (
                      <line
                        key={`${edge.fromId}-${edge.toId}`}
                        x1={fromP.avgX}
                        y1={fromP.avgZ}
                        x2={toP.avgX}
                        y2={toP.avgZ}
                        stroke="#facc15"
                        strokeOpacity={0.28 + weight * 0.65}
                        strokeWidth={0.45 + weight * 1.9}
                        strokeLinecap="round"
                      >
                        <title>
                          {`#${fromP.number} ${fromP.shortName} → #${toP.number} ${toP.shortName}: ${edge.count} pases`}
                        </title>
                      </line>
                    );
                  })}
                  {networkPlayers.map((p) => {
                    const r = Math.min(3.8, 1.9 + Math.sqrt(p.touches) * 0.25);
                    return (
                      <g
                        key={p.id}
                        onClick={() => onSelectPlayerId(p.id)}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={p.avgX}
                          cy={p.avgZ}
                          r={r}
                          fill={mapSide === 'home' ? homeColor : awayColor}
                          stroke="#ffffff"
                          strokeWidth="0.45"
                        >
                          <title>
                            {`#${p.number} ${p.name} (${p.assignedRole}) · ${p.touches} toques · Clic para ver ficha`}
                          </title>
                        </circle>
                        <text
                          x={p.avgX}
                          y={p.avgZ + 0.85}
                          textAnchor="middle"
                          fontSize="2.35"
                          fontWeight="bold"
                          fill="#ffffff"
                        >
                          {p.number}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[9px] text-white/90 font-semibold pointer-events-none drop-shadow">
                  <span>Clic en dorsal = Ficha</span>
                  <span>Ataque →</span>
                </div>
              </div>
            )}
          </div>

          {/* Team Heatmap */}
          <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>
                Mapa de Calor ({mapSide === 'home' ? homeClub.shortCode : awayClub.shortCode})
              </span>
              <span className="text-[10.5px] font-mono text-slate-500">12×8</span>
            </div>
            <HeatmapGridSvg
              heatmap={mapSide === 'home' ? homeStats.heatmap : awayStats.heatmap}
              color={mapSide === 'home' ? homeColor : awayColor}
              label="Densidad de acciones"
            />
          </div>
        </div>

        {/* 9-Zone Tactical Matrix */}
        {(() => {
          const activeStats = mapSide === 'home' ? homeStats : awayStats;
          const zoneSum = activeStats.zoneActivity.reduce((a, b) => a + b, 0) || 1;
          const zonePcts = activeStats.zoneActivity.map((v) => Math.round((v / zoneSum) * 100));
          const maxZonePct = Math.max(1, ...zonePcts);
          const laneNames = ['Banda Izq.', 'Carril Central', 'Banda Der.'];
          const thirdNames = ['Salida', 'Creación', 'Ataque'];
          return (
            <div className="bg-white border border-[#8e9b90] rounded-sm p-2.5 space-y-2 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-800">
                  Matriz Táctica 9 Zonas ({mapSide === 'home' ? homeClub.shortCode : awayClub.shortCode})
                </span>
                <span className="text-[10.5px] text-slate-600 font-mono tabular-nums">
                  Zona 14 (Frontal área): {zonePcts[7]}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10.5px] font-mono tabular-nums">
                <div className="text-[9.5px] font-sans font-bold text-slate-500 flex items-center">
                  Carril / Tercio
                </div>
                {thirdNames.map((tn) => (
                  <div key={tn} className="text-center text-[9.5px] font-sans font-bold text-slate-700">
                    {tn}
                  </div>
                ))}
                {[0, 1, 2].map((ch) => (
                  <React.Fragment key={ch}>
                    <div className="text-[9.5px] font-sans font-semibold text-slate-700 flex items-center">
                      {laneNames[ch]}
                    </div>
                    {[0, 1, 2].map((th) => {
                      const idx = th * 3 + ch;
                      const pct = zonePcts[idx];
                      const isZone14 = idx === 7;
                      const intensity = pct / maxZonePct;
                      return (
                        <div
                          key={idx}
                          className={`py-1 px-1.5 rounded-[2px] border text-center ${
                            isZone14 ? 'border-amber-600 font-black' : 'border-[#b8c4b8]'
                          }`}
                          style={{
                            backgroundColor: `rgba(31, 89, 34, ${(0.08 + intensity * 0.34).toFixed(2)})`,
                          }}
                        >
                          <span className="font-bold text-slate-900">{pct}%</span>
                          {isZone14 && (
                            <span className="ml-1 text-[8.5px] font-sans font-black text-amber-800">
                              Z14
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </FmCollapsibleSection>
  );
};
