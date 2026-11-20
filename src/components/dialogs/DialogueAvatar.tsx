import React from 'react';
import { getClubHexPalette } from '../ClubBannerChrome';

export type AvatarPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline';

interface DialogueAvatarProps {
  clubColor: string;
  cargo: string;
  name?: string;
  badge?: boolean;
  onClick: () => void;
  position?: AvatarPosition;
  className?: string;
}

const positionClasses: Record<Exclude<AvatarPosition, 'inline'>, string> = {
  // Always anchor floating avatars at the top below the broadcast header so BottomNav NEVER hides them on mobile
  'bottom-right': 'fixed top-[46px] sm:top-[62px] right-2 sm:right-4 z-[240]',
  'bottom-left': 'fixed top-[46px] sm:top-[62px] right-2 sm:right-4 z-[240]',
  'top-right': 'fixed top-[46px] sm:top-[62px] right-2 sm:right-4 z-[240]',
  'top-left': 'fixed top-[46px] sm:top-[62px] left-2 sm:left-4 z-[240]',
};

/**
 * Deterministic friendly face seed from name/cargo so each staff character looks like a distinct person.
 */
function faceHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

const SKIN_TONES = ['#f2ccb0', '#e5b894', '#d19b72', '#b97e56', '#f6d5be'];
const HAIR_TONES = ['#241c18', '#4a3525', '#6b4c35', '#7c828a', '#18181b'];

const PersonPortraitSvg: React.FC<{ seed: string; accent: string }> = ({ seed, accent }) => {
  const h = faceHash(seed);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_TONES[(h >> 3) % HAIR_TONES.length];
  const hasBeard = (h & 4) !== 0;

  return (
    <svg viewBox="0 0 40 40" className="w-full h-full" aria-hidden="true">
      {/* Subtle radial background glow */}
      <circle cx="20" cy="20" r="20" fill="rgba(0,0,0,0.18)" />
      {/* Shoulders / Suit or Tracksuit jacket */}
      <path d="M6 40 C7 31, 13 28, 20 28 C27 28, 33 31, 34 40 Z" fill="#1f2937" />
      {/* Shirt collar / V-neck */}
      <path d="M16 28 L20 35 L24 28 Z" fill="#f8fafc" />
      <path d="M19 30 L20 36 L21 30 Z" fill={accent} />
      {/* Neck */}
      <rect x="17.2" y="23.5" width="5.6" height="5.5" rx="2" fill={skin} />
      {/* Ears */}
      <circle cx="12.2" cy="17.5" r="2" fill={skin} />
      <circle cx="27.8" cy="17.5" r="2" fill={skin} />
      {/* Head / Face */}
      <ellipse cx="20" cy="17.2" rx="7.6" ry="8.6" fill={skin} />
      {/* Hair */}
      <path d="M12.2 16 C12.2 9.5, 16 7.5, 20 7.5 C24 7.5, 27.8 9.5, 27.8 16 C26.4 12.6, 23.8 11.4, 20 11.4 C16.2 11.4, 13.6 12.6, 12.2 16 Z" fill={hair} />
      {/* Eyes */}
      <circle cx="17.1" cy="17" r="1.05" fill="#111827" />
      <circle cx="22.9" cy="17" r="1.05" fill="#111827" />
      {/* Eyebrows */}
      <path d="M15.4 14.8 Q17.1 14.1 18.6 14.8" stroke={hair} strokeWidth="0.9" strokeLinecap="round" fill="none" />
      <path d="M21.4 14.8 Q22.9 14.1 24.6 14.8" stroke={hair} strokeWidth="0.9" strokeLinecap="round" fill="none" />
      {/* Optional beard/stubble */}
      {hasBeard && (
        <path d="M13.5 19.8 C14.2 24.8, 17 26.2, 20 26.2 C23 26.2, 25.8 24.8, 26.5 19.8 C25 22.8, 22.8 23.7, 20 23.7 C17.2 23.7, 15 22.8, 13.5 19.8 Z" fill={hair} fillOpacity="0.45" />
      )}
      {/* Smile */}
      <path d="M17.5 21.4 Q20 23.2 22.5 21.4" stroke="#7c2d12" strokeWidth="1.05" strokeLinecap="round" fill="none" />
    </svg>
  );
};

function formatShortName(fullName?: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export const DialogueAvatar: React.FC<DialogueAvatarProps> = ({
  clubColor, cargo, name, badge = false, onClick, position = 'top-right', className,
}) => {
  const pal = getClubHexPalette(clubColor, '#2b5d2c', '#facc15');
  const isInline = position === 'inline';
  const shortName = formatShortName(name);

  return (
    <div className={`${className || (isInline ? 'shrink-0' : positionClasses[position])} flex items-center justify-center`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Hablar con ${name ? `${name} (${cargo})` : cargo}`}
        title={name ? `${name} · ${cargo}` : cargo}
        className="group relative flex flex-col items-center justify-center shrink-0 cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
      >
        {/* Circular Character Token ("círculo ficha") with Human Face */}
        <span
          className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-[#facc15] shadow-[0_2px_6px_rgba(0,0,0,0.45),inset_0_1px_2px_rgba(255,255,255,0.4)] flex items-center justify-center shrink-0"
          style={{
            background: `radial-gradient(circle at 35% 25%, ${pal.primary} 0%, #191c20 100%)`,
          }}
        >
          <PersonPortraitSvg seed={`${name || ''}-${cargo}`} accent={pal.secondary} />
          {badge && (
            <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-85" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#facc15] border border-[#14171a]" />
            </span>
          )}
        </span>

        {/* Compact Name & Role Label Directly Below Circle */}
        <span
          className={`mt-0.5 flex flex-col items-center leading-none px-1.5 py-0.5 rounded-[2px] max-w-[82px] ${
            isInline
              ? 'bg-[#e8ece8]/90 border border-[#8f9d8f]/80 text-[#14171a]'
              : 'bg-[#14171a]/90 border border-[#facc15]/60 text-white shadow-md'
          }`}
        >
          {shortName && (
            <span className="text-[7.5px] sm:text-[8px] font-black uppercase tracking-tight truncate max-w-[74px]">
              {shortName}
            </span>
          )}
          <span
            className={`text-[6.5px] sm:text-[7px] font-bold uppercase tracking-tight truncate max-w-[74px] ${
              isInline ? 'text-[#2b5d2c]' : 'text-[#facc15]'
            }`}
          >
            {cargo}
          </span>
        </span>
      </button>
    </div>
  );
};
