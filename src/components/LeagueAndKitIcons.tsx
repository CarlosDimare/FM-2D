import React from 'react';
import { Competition } from '../types';

interface KitSpec {
  primary: string;
  secondary: string;
  trim: string;
  pattern?: 'SOLID' | 'STRIPES' | 'SASH' | 'CHECKERS' | 'HOOPS' | 'HALF';
  badge?: string;
}

const normalizeKey = (raw: string): string =>
  (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');

const NATIONAL_KIT_MAP: Record<string, KitSpec> = {
  argentina: { primary: '#5eb5f7', secondary: '#ffffff', trim: '#1e3a8a', pattern: 'STRIPES', badge: '#eab308' },
  brasil: { primary: '#facc15', secondary: '#15803d', trim: '#15803d', pattern: 'SOLID', badge: '#166534' },
  brazil: { primary: '#facc15', secondary: '#15803d', trim: '#15803d', pattern: 'SOLID', badge: '#166534' },
  uruguay: { primary: '#38bdf8', secondary: '#0f172a', trim: '#f8fafc', pattern: 'SOLID', badge: '#facc15' },
  colombia: { primary: '#facc15', secondary: '#1e3a8a', trim: '#dc2626', pattern: 'SOLID', badge: '#1e3a8a' },
  chile: { primary: '#dc2626', secondary: '#1e3a8a', trim: '#ffffff', pattern: 'SOLID', badge: '#1e3a8a' },
  paraguay: { primary: '#dc2626', secondary: '#ffffff', trim: '#1e3a8a', pattern: 'STRIPES', badge: '#1e3a8a' },
  ecuador: { primary: '#facc15', secondary: '#1d4ed8', trim: '#dc2626', pattern: 'SOLID', badge: '#1d4ed8' },
  peru: { primary: '#ffffff', secondary: '#dc2626', trim: '#dc2626', pattern: 'SASH', badge: '#dc2626' },
  bolivia: { primary: '#15803d', secondary: '#facc15', trim: '#ffffff', pattern: 'SOLID', badge: '#facc15' },
  venezuela: { primary: '#7f1d1d', secondary: '#f59e0b', trim: '#f59e0b', pattern: 'SOLID', badge: '#facc15' },
  espana: { primary: '#b91c1c', secondary: '#facc15', trim: '#1e3a8a', pattern: 'SOLID', badge: '#facc15' },
  spain: { primary: '#b91c1c', secondary: '#facc15', trim: '#1e3a8a', pattern: 'SOLID', badge: '#facc15' },
  francia: { primary: '#1e3a8a', secondary: '#ffffff', trim: '#dc2626', pattern: 'SOLID', badge: '#facc15' },
  france: { primary: '#1e3a8a', secondary: '#ffffff', trim: '#dc2626', pattern: 'SOLID', badge: '#facc15' },
  italia: { primary: '#2563eb', secondary: '#ffffff', trim: '#16a34a', pattern: 'SOLID', badge: '#facc15' },
  italy: { primary: '#2563eb', secondary: '#ffffff', trim: '#16a34a', pattern: 'SOLID', badge: '#facc15' },
  alemania: { primary: '#f8fafc', secondary: '#111827', trim: '#dc2626', pattern: 'SOLID', badge: '#111827' },
  germany: { primary: '#f8fafc', secondary: '#111827', trim: '#dc2626', pattern: 'SOLID', badge: '#111827' },
  inglaterra: { primary: '#f8fafc', secondary: '#1e3a8a', trim: '#dc2626', pattern: 'SOLID', badge: '#1e3a8a' },
  england: { primary: '#f8fafc', secondary: '#1e3a8a', trim: '#dc2626', pattern: 'SOLID', badge: '#1e3a8a' },
  portugal: { primary: '#b91c1c', secondary: '#15803d', trim: '#facc15', pattern: 'SOLID', badge: '#facc15' },
  paises_bajos: { primary: '#f97316', secondary: '#111827', trim: '#ffffff', pattern: 'SOLID', badge: '#111827' },
  holanda: { primary: '#f97316', secondary: '#111827', trim: '#ffffff', pattern: 'SOLID', badge: '#111827' },
  netherlands: { primary: '#f97316', secondary: '#111827', trim: '#ffffff', pattern: 'SOLID', badge: '#111827' },
  belgica: { primary: '#b91c1c', secondary: '#111827', trim: '#facc15', pattern: 'SOLID', badge: '#facc15' },
  croacia: { primary: '#dc2626', secondary: '#ffffff', trim: '#1e3a8a', pattern: 'CHECKERS', badge: '#1e3a8a' },
  suiza: { primary: '#dc2626', secondary: '#ffffff', trim: '#ffffff', pattern: 'SOLID', badge: '#ffffff' },
  austria: { primary: '#dc2626', secondary: '#ffffff', trim: '#111827', pattern: 'SOLID', badge: '#ffffff' },
  dinamarca: { primary: '#dc2626', secondary: '#ffffff', trim: '#ffffff', pattern: 'SOLID', badge: '#ffffff' },
  suecia: { primary: '#facc15', secondary: '#1d4ed8', trim: '#1d4ed8', pattern: 'SOLID', badge: '#1d4ed8' },
  noruega: { primary: '#dc2626', secondary: '#1e3a8a', trim: '#ffffff', pattern: 'SOLID', badge: '#1e3a8a' },
  polonia: { primary: '#f8fafc', secondary: '#dc2626', trim: '#dc2626', pattern: 'SOLID', badge: '#dc2626' },
  ucrania: { primary: '#facc15', secondary: '#2563eb', trim: '#2563eb', pattern: 'SOLID', badge: '#2563eb' },
  serbia: { primary: '#b91c1c', secondary: '#1e3a8a', trim: '#facc15', pattern: 'SOLID', badge: '#facc15' },
  turquia: { primary: '#dc2626', secondary: '#ffffff', trim: '#ffffff', pattern: 'HOOPS', badge: '#ffffff' },
  mexico: { primary: '#15803d', secondary: '#ffffff', trim: '#dc2626', pattern: 'SOLID', badge: '#dc2626' },
  estados_unidos: { primary: '#f8fafc', secondary: '#1e3a8a', trim: '#dc2626', pattern: 'SOLID', badge: '#1e3a8a' },
  japon: { primary: '#1d4ed8', secondary: '#ffffff', trim: '#dc2626', pattern: 'SOLID', badge: '#ffffff' },
  marruecos: { primary: '#b91c1c', secondary: '#15803d', trim: '#facc15', pattern: 'SOLID', badge: '#15803d' },
  escocia: { primary: '#1e3a8a', secondary: '#ffffff', trim: '#facc15', pattern: 'SOLID', badge: '#ffffff' },
  gales: { primary: '#dc2626', secondary: '#15803d', trim: '#ffffff', pattern: 'SOLID', badge: '#15803d' },
  irlanda: { primary: '#15803d', secondary: '#ffffff', trim: '#f97316', pattern: 'SOLID', badge: '#ffffff' },
  grecia: { primary: '#2563eb', secondary: '#ffffff', trim: '#ffffff', pattern: 'SOLID', badge: '#ffffff' },
  rusia: { primary: '#b91c1c', secondary: '#ffffff', trim: '#1d4ed8', pattern: 'SOLID', badge: '#facc15' },
  republica_checa: { primary: '#dc2626', secondary: '#1e3a8a', trim: '#ffffff', pattern: 'SOLID', badge: '#ffffff' },
  corea_del_sur: { primary: '#dc2626', secondary: '#111827', trim: '#1d4ed8', pattern: 'SOLID', badge: '#ffffff' },
  australia: { primary: '#facc15', secondary: '#15803d', trim: '#15803d', pattern: 'SOLID', badge: '#15803d' },
  nigeria: { primary: '#16a34a', secondary: '#ffffff', trim: '#14532d', pattern: 'SOLID', badge: '#ffffff' },
  senegal: { primary: '#f8fafc', secondary: '#16a34a', trim: '#facc15', pattern: 'SOLID', badge: '#16a34a' },
  egipto: { primary: '#dc2626', secondary: '#111827', trim: '#facc15', pattern: 'SOLID', badge: '#111827' },
};

const FALLBACK_PALETTES: KitSpec[] = [
  { primary: '#1d4ed8', secondary: '#ffffff', trim: '#facc15', pattern: 'SOLID', badge: '#facc15' },
  { primary: '#b91c1c', secondary: '#ffffff', trim: '#111827', pattern: 'SOLID', badge: '#ffffff' },
  { primary: '#15803d', secondary: '#ffffff', trim: '#facc15', pattern: 'SOLID', badge: '#facc15' },
  { primary: '#f8fafc', secondary: '#1e3a8a', trim: '#dc2626', pattern: 'STRIPES', badge: '#1e3a8a' },
];

export const NationalJerseyIcon: React.FC<{
  country?: string;
  name?: string;
  className?: string;
}> = ({ country = '', name = '', className = 'w-11 h-11' }) => {
  const key = normalizeKey(country || name);
  const hash = key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const spec = NATIONAL_KIT_MAP[key] || FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length];
  const uid = React.useId().replace(/:/g, '');
  const clipId = `jersey-clip-${uid}`;

  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)] ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d="M20 9 L26 12 Q32 15 38 12 L44 9 L58 17 L53 31 L45 28 L45 55 L19 55 L19 28 L11 31 L6 17 Z" />
        </clipPath>
      </defs>

      {/* Base Jersey Silhouette */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="64" height="64" fill={spec.primary} />

        {spec.pattern === 'STRIPES' && (
          <>
            <rect x="20" y="6" width="6" height="52" fill={spec.secondary} />
            <rect x="29" y="6" width="6" height="52" fill={spec.secondary} />
            <rect x="38" y="6" width="6" height="52" fill={spec.secondary} />
          </>
        )}

        {spec.pattern === 'SASH' && (
          <polygon points="14,56 42,8 50,8 22,56" fill={spec.secondary} />
        )}

        {spec.pattern === 'HOOPS' && (
          <rect x="14" y="25" width="36" height="9" fill={spec.secondary} />
        )}

        {spec.pattern === 'CHECKERS' && (
          <>
            <rect x="19" y="14" width="6.5" height="8" fill={spec.secondary} />
            <rect x="32" y="14" width="6.5" height="8" fill={spec.secondary} />
            <rect x="25.5" y="22" width="6.5" height="8" fill={spec.secondary} />
            <rect x="38.5" y="22" width="6.5" height="8" fill={spec.secondary} />
            <rect x="19" y="30" width="6.5" height="8" fill={spec.secondary} />
            <rect x="32" y="30" width="6.5" height="8" fill={spec.secondary} />
            <rect x="25.5" y="38" width="6.5" height="8" fill={spec.secondary} />
            <rect x="38.5" y="38" width="6.5" height="8" fill={spec.secondary} />
            <rect x="19" y="46" width="6.5" height="9" fill={spec.secondary} />
            <rect x="32" y="46" width="6.5" height="9" fill={spec.secondary} />
          </>
        )}

        {/* Sleeve cuffs */}
        <polygon points="6,17 12,30 14,29 8,16" fill={spec.trim} opacity="0.9" />
        <polygon points="58,17 52,30 50,29 56,16" fill={spec.trim} opacity="0.9" />

        {/* Subtle shoulder/chest shading */}
        <path d="M6 17 L20 9 L44 9 L58 17 L53 31 L45 28 L45 19 L19 19 L19 28 L11 31 Z" fill="#ffffff" opacity="0.1" />
        <rect x="19" y="51" width="26" height="4" fill="#000000" opacity="0.14" />
      </g>

      {/* Collar & Outline */}
      <path
        d="M20 9 L26 12 Q32 15 38 12 L44 9 L58 17 L53 31 L45 28 L45 55 L19 55 L19 28 L11 31 L6 17 Z"
        fill="none"
        stroke="#0f172a"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M24.5 10.5 Q32 17.5 39.5 10.5" fill="none" stroke={spec.trim} strokeWidth="2.4" strokeLinecap="round" />

      {/* National Federation Crest on left chest */}
      <path
        d="M36 22 L41 22 L41 27 C41 29.5 38.5 31 38.5 31 C38.5 31 36 29.5 36 27 Z"
        fill={spec.badge || spec.trim}
        stroke="#0f172a"
        strokeWidth="0.9"
      />
    </svg>
  );
};

interface LeagueVisualTheme {
  bg1: string;
  bg2: string;
  accent: string;
  text: string;
}

const COUNTRY_LEAGUE_THEMES: Record<string, LeagueVisualTheme> = {
  argentina: { bg1: '#0ea5e9', bg2: '#0369a1', accent: '#facc15', text: '#ffffff' },
  brasil: { bg1: '#15803d', bg2: '#14532d', accent: '#facc15', text: '#facc15' },
  inglaterra: { bg1: '#3b0764', bg2: '#1e1b4b', accent: '#ec4899', text: '#ffffff' },
  england: { bg1: '#3b0764', bg2: '#1e1b4b', accent: '#ec4899', text: '#ffffff' },
  espana: { bg1: '#b91c1c', bg2: '#7f1d1d', accent: '#facc15', text: '#ffffff' },
  spain: { bg1: '#b91c1c', bg2: '#7f1d1d', accent: '#facc15', text: '#ffffff' },
  italia: { bg1: '#1d4ed8', bg2: '#1e3a8a', accent: '#22c55e', text: '#ffffff' },
  italy: { bg1: '#1d4ed8', bg2: '#1e3a8a', accent: '#22c55e', text: '#ffffff' },
  alemania: { bg1: '#b91c1c', bg2: '#18181b', accent: '#facc15', text: '#ffffff' },
  germany: { bg1: '#b91c1c', bg2: '#18181b', accent: '#facc15', text: '#ffffff' },
  francia: { bg1: '#1e3a8a', bg2: '#0f172a', accent: '#38bdf8', text: '#ffffff' },
  france: { bg1: '#1e3a8a', bg2: '#0f172a', accent: '#38bdf8', text: '#ffffff' },
  portugal: { bg1: '#15803d', bg2: '#7f1d1d', accent: '#facc15', text: '#ffffff' },
  paises_bajos: { bg1: '#ea580c', bg2: '#9a3412', accent: '#ffffff', text: '#ffffff' },
  turquia: { bg1: '#dc2626', bg2: '#7f1d1d', accent: '#ffffff', text: '#ffffff' },
  uruguay: { bg1: '#0284c7', bg2: '#0f172a', accent: '#facc15', text: '#ffffff' },
  colombia: { bg1: '#ca8a04', bg2: '#1e3a8a', accent: '#dc2626', text: '#ffffff' },
  chile: { bg1: '#b91c1c', bg2: '#1e3a8a', accent: '#ffffff', text: '#ffffff' },
  mexico: { bg1: '#166534', bg2: '#14532d', accent: '#dc2626', text: '#ffffff' },
};

function getLeagueMonogram(league: Pick<Competition, 'name' | 'id' | 'tier'>): string {
  const cleanWords = (league.name || '')
    .replace(/^(liga|primera|segunda|torneo|division|división)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0 && !['de', 'del', 'la', 'el', 'the', 'and'].includes(w.toLowerCase()));

  const rawWords = (league.name || '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0 && !['de', 'del', 'la', 'el'].includes(w.toLowerCase()));

  if (rawWords.length >= 2) {
    return (rawWords[0][0] + rawWords[1][0] + (rawWords[2]?.[0] || '')).toUpperCase().slice(0, 3);
  }
  if (cleanWords.length === 1) {
    return cleanWords[0].slice(0, 3).toUpperCase();
  }
  return (league.id || `L${league.tier}`).replace(/^L_/, '').slice(0, 3).toUpperCase();
}

export const LeagueLogoBadge: React.FC<{
  league: Pick<Competition, 'id' | 'name' | 'country' | 'tier' | 'confederation'>;
  className?: string;
}> = ({ league, className = 'w-11 h-11' }) => {
  const key = normalizeKey(league.country || league.confederation || league.name);
  const theme = COUNTRY_LEAGUE_THEMES[key] || {
    bg1: league.tier === 1 ? '#2b5d2c' : '#3a4a3a',
    bg2: '#19231a',
    accent: league.tier === 1 ? '#facc15' : '#cbd5e1',
    text: '#ffffff',
  };
  const uid = React.useId().replace(/:/g, '');
  const gradId = `lg-grad-${uid}`;
  const monogram = getLeagueMonogram(league);
  const tierBadgeColor = league.tier === 1 ? theme.accent : league.tier === 2 ? '#e2e8f0' : '#d97706';

  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={theme.bg1} />
          <stop offset="100%" stopColor={theme.bg2} />
        </linearGradient>
      </defs>

      {/* Outer Shield / Trophy Crest */}
      <path
        d="M10 10 L54 10 L54 31 C54 45 32 56 32 56 C32 56 10 45 10 31 Z"
        fill={`url(#${gradId})`}
        stroke="#1c1f24"
        strokeWidth="2.2"
      />
      <path
        d="M13 13 L51 13 L51 31 C51 42.5 32 52 32 52 C32 52 13 42.5 13 31 Z"
        fill="none"
        stroke={tierBadgeColor}
        strokeWidth="1.3"
        strokeOpacity="0.85"
      />

      {/* Top Crown / Division Bar */}
      <rect x="13" y="13" width="38" height="7" fill="#000000" fillOpacity="0.28" />
      {league.tier === 1 ? (
        <path d="M23 18.5 L25 14.5 L29 17 L32 13.8 L35 17 L39 14.5 L41 18.5 Z" fill={tierBadgeColor} />
      ) : (
        <text x="32" y="18.2" textAnchor="middle" fontSize="6.5" fontWeight="900" fill={tierBadgeColor} fontFamily="Verdana, sans-serif">
          DIV {league.tier}
        </text>
      )}

      {/* Center Ribbon / Emblem */}
      <circle cx="32" cy="33" r="12" fill="#000000" fillOpacity="0.22" stroke={tierBadgeColor} strokeWidth="1" strokeOpacity="0.55" />
      <text
        x="32"
        y="36.5"
        textAnchor="middle"
        fontSize={monogram.length >= 3 ? '10.5' : '12'}
        fontWeight="900"
        letterSpacing="0.5"
        fill={theme.text}
        fontFamily="Verdana, sans-serif"
      >
        {monogram}
      </text>

      {/* Bottom Trophy Star */}
      <polygon points="32,45 33.4,48 36.6,48.3 34.1,50.3 34.9,53.4 32,51.7 29.1,53.4 29.9,50.3 27.4,48.3 30.6,48" fill={tierBadgeColor} />
    </svg>
  );
};
