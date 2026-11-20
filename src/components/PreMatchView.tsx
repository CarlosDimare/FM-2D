import React, { useEffect, useState } from 'react';
import { Club, Player } from '../types';
import { Play, AlertOctagon, Mic, Wand2 } from 'lucide-react';
import { useDialogueStore } from '../stores/dialogueStore';
import { detectManagerInitiatedTriggers } from '../services/playerDialogueTriggers';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { checkAssistantTrigger } from '../services/dialogueTriggers';
import { FmBroadcastHeader, FmMatchupBanner, getClubHexPalette } from './ClubBannerChrome';

interface PreMatchViewProps {
  club: Club;
  opponent: Club;
  starters: Player[];
  opponentStarters: Player[];
  onStart: () => void;
  onGoToTactics: () => void;
  onPressConference?: () => void;
  pressDelegateName?: string | null;
  onAutoFixLineup?: () => void;
  nextFixture?: import('../types').Fixture;
}

export const PreMatchView: React.FC<PreMatchViewProps> = ({
  club,
  opponent,
  starters,
  opponentStarters,
  onStart,
  onGoToTactics,
  onPressConference,
  pressDelegateName = null,
  onAutoFixLineup,
  nextFixture,
}) => {
  const invalidStarters = starters.filter(p => p.injury || (p.suspension && p.suspension.matchesLeft > 0));
  const hasInvalidStarters = invalidStarters.length > 0;
  const isReady = starters.length === 11 && !hasInvalidStarters;

  const assistantTrigger = checkAssistantTrigger({
    currentView: 'PRE_MATCH',
    currentDate: new Date(),
    userClubId: club.id,
    nextFixture,
  });

  useEffect(() => {
    detectManagerInitiatedTriggers(club.id, 'PRE_MATCH');
  }, [club.id]);

  const validOpponentStarters = opponentStarters.length >= 11 ? opponentStarters : opponentStarters;
  const [page, setPage] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipe = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipe && page === 0) setPage(1);
    if (distance < -minSwipe && page === 1) setPage(0);
  };

  const renderFormation = (title: string, players: Player[], teamClub: Club) => {
    const pal = getClubHexPalette(teamClub);
    return (
      <div className="flex flex-col h-full">
        <div className="space-y-1 flex-1 overflow-y-auto">
          {players.length === 0 ? (
            <div className="p-10 border-2 border-dashed border-[#a0b0a0] rounded-sm bg-[#f2f7f2] text-center text-slate-600 font-bold uppercase tracking-wider text-xs">
              Alineación no definida
            </div>
          ) : (
            [...players].sort((a, b) => (a.tacticalPosition || 0) - (b.tacticalPosition || 0)).map(p => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-sm border-b transition-colors ${
                  p.injury || p.suspension ? 'bg-red-50 border-red-200' : 'bg-[#f4f7f4] border-[#c4cfc4]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-8 h-6 rounded-[2px] flex items-center justify-center text-[10px] font-mono font-bold shrink-0 border border-black/20 shadow-xs"
                    style={{
                      backgroundColor: pal.primary,
                      color: pal.isLightPrimary ? '#111827' : '#ffffff',
                    }}
                  >
                    {p.positions[0]}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-slate-900 font-bold text-xs sm:text-sm truncate">{p.name}</span>
                    {(p.injury || p.suspension) && (
                      <span className="text-[10px] text-red-700 font-semibold uppercase">No disponible</span>
                    )}
                  </div>
                </div>
                <span className="text-slate-800 font-mono font-bold text-xs tabular-nums shrink-0">
                  {(p.currentAbility / 20).toFixed(1)} ★
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const isUserHome = !nextFixture || nextFixture.homeTeamId === club.id;
  const homeClub = isUserHome ? club : opponent;
  const awayClub = isUserHome ? opponent : club;

  return (
    <div className="h-full flex flex-col bg-[#d4dcd4] overflow-hidden">
      {/* Top Broadcast Matchup Banner */}
      <div className="shrink-0">
        <FmMatchupBanner
          homeClub={homeClub}
          awayClub={awayClub}
          centerMainLabel="VS"
          centerBottomLabel={nextFixture ? nextFixture.date.toLocaleDateString() : 'Previa'}
        />
        <div className="h-9 sm:h-10 bg-[#3a3f45] border-b border-[#1c1f24] px-2 sm:px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                page === 0 ? 'bg-[#2b5d2c] text-white' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              Tu Formación ({club.shortName})
            </button>
            <button
              onClick={() => setPage(1)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                page === 1 ? 'bg-[#2b5d2c] text-white' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              Rival ({opponent.shortName})
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pressDelegateName ? (
              <span
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-[#23272c] border border-[#525962] text-[10px] font-bold text-emerald-300 whitespace-nowrap"
                title={`Prensa delegada automáticamente a ${pressDelegateName}`}
              >
                <Mic size={11} /> Prensa: Auto
              </span>
            ) : onPressConference ? (
              <button
                type="button"
                onClick={onPressConference}
                className="flex items-center gap-1 px-2.5 py-1 rounded border border-[#737a82] text-xs font-semibold text-[#1f2428] cursor-pointer whitespace-nowrap"
                style={{
                  background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
                }}
              >
                <Mic size={12} /> Prensa
              </button>
            ) : null}
            <button
              type="button"
              onClick={onGoToTactics}
              className="px-2.5 py-1 rounded border border-[#737a82] text-xs font-semibold text-[#1f2428] cursor-pointer whitespace-nowrap"
              style={{
                background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
              }}
            >
              Táctica
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={!isReady}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded bg-[#1f5922] hover:bg-[#174619] border border-[#133815] text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Play size={12} className="fill-current" /> Jugar Partido
            </button>
          </div>
        </div>

        {!isReady && (
          <div className="bg-[#231919] border-b border-red-900 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-red-100">
            <div className="flex items-center gap-2 min-w-0">
              <AlertOctagon size={15} className="text-red-400 shrink-0" />
              <span className="truncate">
                {hasInvalidStarters
                  ? `Titulares no disponibles (${invalidStarters.map(p => p.name).join(', ')}). Reemplazalos antes de iniciar.`
                  : `Faltan titulares en tu once (${starters.length}/11). Completá la alineación para iniciar.`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onAutoFixLineup && (
                <button
                  type="button"
                  onClick={onAutoFixLineup}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2b5d2c] hover:bg-[#1f4920] text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Wand2 size={12} /> Autocompletar XI
                </button>
              )}
              <button
                type="button"
                onClick={onGoToTactics}
                className="px-2.5 py-1 rounded bg-red-800 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
              >
                Ir a Táctica
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative">
         <div
           className="flex h-full transition-transform duration-300 ease-out"
           style={{ transform: `translateX(-${page * 100}%)` }}
           onTouchStart={onTouchStart}
           onTouchMove={onTouchMove}
           onTouchEnd={onTouchEnd}
         >
            <div className="w-full shrink-0 h-full overflow-y-auto custom-scroll p-3 sm:p-6">
               <div className="max-w-3xl mx-auto bg-white rounded-sm border border-[#1c1f24] shadow-xl overflow-hidden flex flex-col min-h-[460px]">
                  <FmBroadcastHeader
                    club={club}
                    title={club.name}
                    shortCode={club.shortName}
                    subtitle={`Tu Formación · ${starters.length}/11 titulares`}
                    shieldSize="md"
                  />
                  <div className="p-3 sm:p-5 flex-1">
                     {renderFormation('Tu Formación', starters, club)}
                  </div>
               </div>
            </div>
            <div className="w-full shrink-0 h-full overflow-y-auto custom-scroll p-3 sm:p-6">
               <div className="max-w-3xl mx-auto bg-white rounded-sm border border-[#1c1f24] shadow-xl overflow-hidden flex flex-col min-h-[460px]">
                  <FmBroadcastHeader
                    club={opponent}
                    title={opponent.name}
                    shortCode={opponent.shortName}
                    subtitle={`Formación Rival · ${validOpponentStarters.length} jugadores`}
                    shieldSize="md"
                  />
                  <div className="p-3 sm:p-5 flex-1">
                     {renderFormation('Formación Rival', validOpponentStarters, opponent)}
                  </div>
               </div>
            </div>
         </div>
      </div>
      {club && (
        <DialogueAvatar
          clubColor={club.primaryColor}
          cargo="Ayudante de Campo"
          badge={assistantTrigger}
          onClick={() => useDialogueStore.getState().open('ASSISTANT', { clubId: club.id, opponentId: opponent.id, source: 'PRE_MATCH' })}
        />
      )}
    </div>
  );
};
