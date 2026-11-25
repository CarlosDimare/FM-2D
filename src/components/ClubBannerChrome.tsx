import React from 'react';
import { Club } from '../types';
import { ClubPreset } from '../types/match';
import { tailwindClassToHex } from '../services/matchEngineBridge';

export interface ClubHexPalette {
  primary: string;
  secondary: string;
  isLightPrimary: boolean;
}

function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function getClubHexPalette(
  source?:
    | Pick<Club, 'primaryColor' | 'secondaryColor'>
    | Pick<ClubPreset, 'colors'>
    | { primary?: string; secondary?: string }
    | string
    | null,
  fallbackPrimary = '#2b5d2c',
  fallbackSecondary = '#f8fafc'
): ClubHexPalette {
  let primary = fallbackPrimary;
  let secondary = fallbackSecondary;

  if (typeof source === 'string') {
    primary = tailwindClassToHex(source, fallbackPrimary);
  } else if (source && 'colors' in source && source.colors) {
    primary = tailwindClassToHex(source.colors.primary, fallbackPrimary);
    secondary = tailwindClassToHex(source.colors.secondary, fallbackSecondary);
  } else if (source && 'primaryColor' in source) {
    primary = tailwindClassToHex(source.primaryColor, fallbackPrimary);
    secondary = tailwindClassToHex(source.secondaryColor, fallbackSecondary);
  } else if (source && ('primary' in source || 'secondary' in source)) {
    primary = tailwindClassToHex(source.primary, fallbackPrimary);
    secondary = tailwindClassToHex(source.secondary, fallbackSecondary);
  }

  return {
    primary,
    secondary,
    isLightPrimary: hexLuminance(primary) > 0.72,
  };
}

export type ShieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SHIELD_SIZE_CLASSES: Record<ShieldSize, string> = {
  xs: 'w-4 h-5',
  sm: 'w-5 h-6',
  md: 'w-6 h-7 sm:w-8 sm:h-9',
  lg: 'w-10 h-12 sm:w-12 sm:h-14',
  xl: 'w-14 h-16 sm:w-16 sm:h-[74px]',
};

export const FmClubShield: React.FC<{
  club?:
    | Pick<Club, 'primaryColor' | 'secondaryColor'>
    | Pick<ClubPreset, 'colors'>
    | { primary?: string; secondary?: string }
    | string
    | null;
  size?: ShieldSize;
  className?: string;
}> = ({ club, size = 'md', className = '' }) => {
  const { primary, secondary, isLightPrimary } = getClubHexPalette(club);
  const strokeColor = isLightPrimary ? '#cbd5e1' : '#e2e8f0';

  return (
    <svg
      viewBox="0 0 36 42"
      className={`${SHIELD_SIZE_CLASSES[size]} shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)] ${className}`}
      aria-hidden="true"
    >
      <path
        d="M4 3 L32 3 L32 21 C32 31 18 39 18 39 C18 39 4 31 4 21 Z"
        fill={primary}
        stroke={strokeColor}
        strokeWidth="2.2"
      />
      <path
        d="M18 4.2 L30.8 4.2 L30.8 21 C30.8 29.8 18 37.4 18 37.4 Z"
        fill={secondary}
        fillOpacity="0.88"
      />
      <path
        d="M4.8 4 L31.2 4 L31.2 15 C23 18 13 18 4.8 15 Z"
        fill="#ffffff"
        fillOpacity="0.18"
      />
    </svg>
  );
};

export const FmLedDisplay: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`border border-[#0b0d0f] shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)] ${className}`}
    style={{
      backgroundColor: '#14171a',
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 0)',
      backgroundSize: '4px 4px',
    }}
  >
    {children}
  </div>
);

interface FmBroadcastHeaderProps {
  club?:
    | Pick<Club, 'primaryColor' | 'secondaryColor'>
    | Pick<ClubPreset, 'colors'>
    | { primary?: string; secondary?: string }
    | string
    | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  shortCode?: string;
  showShield?: boolean;
  shieldSize?: ShieldSize;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  compact?: boolean;
  onClickTitle?: () => void;
  className?: string;
}

/**
 * Single-team / entity FM08 broadcast banner matching TopScoreboard.tsx:
 * Club primary gradient blending into charcoal (#23272c -> #191c20) with top gloss highlight.
 */
export const FmBroadcastHeader: React.FC<FmBroadcastHeaderProps> = ({
  club,
  title,
  subtitle,
  shortCode,
  showShield = true,
  shieldSize = 'md',
  leftSlot,
  rightSlot,
  compact = false,
  onClickTitle,
  className = '',
}) => {
  const { primary, isLightPrimary } = getClubHexPalette(club);

  return (
    <div
      className={`relative w-full flex items-center justify-between gap-2 sm:gap-3 border-b border-[#14171a] overflow-hidden select-none ${
        compact ? 'h-10 px-2.5 sm:px-3.5' : 'h-10 sm:h-14 px-2 sm:px-5'
      } ${className}`}
      style={{
        background: `linear-gradient(90deg, ${primary} 0%, ${primary}dd 34%, #23272c 72%, #191c20 100%)`,
      }}
    >
      {/* Subtle FM08 top gloss highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-4 sm:h-5"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
        }}
      />
      {/* Readability wash for very bright club primaries (e.g. white / yellow) */}
      {isLightPrimary && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(15,18,22,0.18) 0%, rgba(15,18,22,0.52) 100%)',
          }}
        />
      )}

      <div className="relative z-10 flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        {leftSlot}
        {showShield && <FmClubShield club={club} size={compact ? 'sm' : shieldSize} />}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-baseline gap-2 min-w-0">
            {onClickTitle ? (
              <button
                type="button"
                onClick={onClickTitle}
                className="text-xs sm:text-base md:text-xl font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] hover:underline cursor-pointer text-left"
              >
                {title}
              </button>
            ) : (
              <h2 className="text-xs sm:text-base md:text-xl font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                {title}
              </h2>
            )}
            {shortCode && (
              <span className="hidden md:inline text-[11px] font-semibold uppercase tracking-wider text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] shrink-0">
                {shortCode}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="hidden sm:block text-[10.5px] text-white/85 font-medium truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {rightSlot && (
        <div className="relative z-10 flex items-center gap-2 shrink-0">{rightSlot}</div>
      )}
    </div>
  );
};

interface FmMatchupBannerProps {
  homeClub: Pick<Club, 'name' | 'shortName' | 'primaryColor' | 'secondaryColor'>;
  awayClub: Pick<Club, 'name' | 'shortName' | 'primaryColor' | 'secondaryColor'>;
  homeScore?: number;
  awayScore?: number;
  centerTopLabel?: React.ReactNode;
  centerBottomLabel?: React.ReactNode;
  centerMainLabel?: React.ReactNode;
  size?: 'md' | 'lg';
  onClickHome?: () => void;
  onClickAway?: () => void;
  className?: string;
}

/**
 * Dual-team broadcast matchup banner locked to exact TopScoreboard.tsx dimensions:
 * h-10 sm:h-14, Home Club Gradient -> Central Dot-Matrix LED Scoreboard -> Away Club Gradient.
 */
export const FmMatchupBanner: React.FC<FmMatchupBannerProps> = ({
  homeClub,
  awayClub,
  homeScore,
  awayScore,
  centerTopLabel,
  centerBottomLabel,
  centerMainLabel,
  onClickHome,
  onClickAway,
  className = '',
}) => {
  const homePalette = getClubHexPalette(homeClub, '#b91c1c', '#f8fafc');
  const awayPalette = getClubHexPalette(awayClub, '#1d4ed8', '#f8fafc');
  const hasScore = homeScore !== undefined && awayScore !== undefined;

  return (
    <div
      className={`relative h-10 sm:h-14 w-full flex items-stretch border-b border-[#14171a] overflow-hidden select-none ${className}`}
      style={{
        background: `linear-gradient(90deg, ${homePalette.primary} 0%, ${homePalette.primary}dd 26%, #23272c 43%, #191c20 57%, ${awayPalette.primary}dd 74%, ${awayPalette.primary} 100%)`,
      }}
    >
      {/* Subtle FM08 top gloss highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-4 sm:h-5"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
        }}
      />
      {(homePalette.isLightPrimary || awayPalette.isLightPrimary) && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${
              homePalette.isLightPrimary ? 'rgba(15,18,22,0.42)' : 'rgba(15,18,22,0)'
            } 0%, rgba(15,18,22,0) 42%, rgba(15,18,22,0) 58%, ${
              awayPalette.isLightPrimary ? 'rgba(15,18,22,0.42)' : 'rgba(15,18,22,0)'
            } 100%)`,
          }}
        />
      )}

      {/* Home Side */}
      <div
        onClick={onClickHome}
        role={onClickHome ? 'button' : undefined}
        tabIndex={onClickHome ? 0 : undefined}
        onKeyDown={onClickHome ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickHome(); } } : undefined}
        className={`relative z-10 flex-1 min-w-0 flex items-center justify-between px-2 sm:px-5 gap-1.5 sm:gap-2 ${
          onClickHome ? 'cursor-pointer hover:brightness-110 transition-all group' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <FmClubShield club={homeClub} size="md" />
          <span className="hidden md:inline text-[11px] font-semibold uppercase tracking-wider text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {homeClub.shortName}
          </span>
        </div>
        <span
          className={`sm:hidden text-xs font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
            onClickHome ? 'group-hover:underline' : ''
          }`}
          title={homeClub.name}
        >
          {homeClub.shortName}
        </span>
        <span
          className={`hidden sm:inline text-base md:text-xl font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
            onClickHome ? 'group-hover:underline' : ''
          }`}
          title={homeClub.name}
        >
          {homeClub.name}
        </span>
      </div>

      {/* Central Dot-Matrix LED Score / Match Box — Exact TopScoreboard Dimensions */}
      <FmLedDisplay className="relative z-10 w-[138px] min-[400px]:w-[164px] sm:w-[270px] shrink-0 border-y-0 flex items-center justify-between px-2.5 sm:px-5">
        {hasScore ? (
          <>
            <span className="font-mono text-lg sm:text-[28px] font-bold text-[#facc15] tabular-nums leading-none drop-shadow-[0_0_6px_rgba(250,204,21,0.35)]">
              {homeScore}
            </span>
            <div className="flex flex-col items-center justify-center leading-tight px-1 text-center min-w-0">
              {centerTopLabel && (
                <span className="font-mono text-[10px] sm:text-xs font-semibold text-[#e5e7eb] tabular-nums tracking-wider uppercase truncate">
                  {centerTopLabel}
                </span>
              )}
              {centerBottomLabel && (
                <span className="font-mono text-[8.5px] sm:text-[10px] font-medium text-[#9ca3af] tabular-nums uppercase truncate">
                  {centerBottomLabel}
                </span>
              )}
            </div>
            <span className="font-mono text-lg sm:text-[28px] font-bold text-[#facc15] tabular-nums leading-none drop-shadow-[0_0_6px_rgba(250,204,21,0.35)]">
              {awayScore}
            </span>
          </>
        ) : (
          <div className="w-full flex flex-col items-center justify-center text-center leading-tight">
            <span className="font-mono text-xs sm:text-lg font-bold text-[#facc15] tabular-nums tracking-widest drop-shadow-[0_0_6px_rgba(250,204,21,0.35)]">
              {centerMainLabel || 'VS'}
            </span>
            {centerBottomLabel && (
              <span className="font-mono text-[8.5px] sm:text-[10px] font-medium text-[#9ca3af] tabular-nums uppercase truncate max-w-[120px] sm:max-w-[220px]">
                {centerBottomLabel}
              </span>
            )}
          </div>
        )}
      </FmLedDisplay>

      {/* Away Side */}
      <div
        onClick={onClickAway}
        role={onClickAway ? 'button' : undefined}
        tabIndex={onClickAway ? 0 : undefined}
        onKeyDown={onClickAway ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickAway(); } } : undefined}
        className={`relative z-10 flex-1 min-w-0 flex items-center justify-between px-2 sm:px-5 gap-1.5 sm:gap-2 ${
          onClickAway ? 'cursor-pointer hover:brightness-110 transition-all group' : ''
        }`}
      >
        <span
          className={`sm:hidden text-xs font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
            onClickAway ? 'group-hover:underline' : ''
          }`}
          title={awayClub.name}
        >
          {awayClub.shortName}
        </span>
        <span
          className={`hidden sm:inline text-base md:text-xl font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
            onClickAway ? 'group-hover:underline' : ''
          }`}
          title={awayClub.name}
        >
          {awayClub.name}
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <span className="hidden md:inline text-[11px] font-semibold uppercase tracking-wider text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {awayClub.shortName}
          </span>
          <FmClubShield club={awayClub} size="md" />
        </div>
      </div>
    </div>
  );
};
