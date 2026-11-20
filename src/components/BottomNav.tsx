import React from 'react';
import { Home, Users, Clipboard, Play, MoreHorizontal, Trophy, ShoppingBag, Wallet, Briefcase, Dumbbell, Binoculars, Award, RefreshCw, Zap, SkipForward, BookMarked, Sun, Newspaper, TrendingUp, Save } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';

const tabs = [
  { id: 'HOME', label: 'Inicio', icon: Home },
  { id: 'SENIOR_SQUAD', label: 'Plantilla', icon: Users },
  { id: 'SENIOR_TACTICS', label: 'Táctica', icon: Clipboard },
  { id: '__ADVANCE__', label: 'Continuar', icon: RefreshCw, isAction: true },
  { id: '__MORE__', label: 'Más', icon: MoreHorizontal },
];

const moreItems = [
  { id: 'TABLE', label: 'Clasificación', icon: Trophy },
  { id: 'LEAGUE_RANKING', label: 'Ranking Ligas', icon: TrendingUp },
  { id: 'CHRONICLES', label: 'Crónicas', icon: BookMarked },
  { id: 'MEDIA', label: 'Prensa', icon: Newspaper },
  { id: 'MANAGER_PROFILE', label: 'Mi Carrera', icon: Briefcase },
  { id: 'MARKET', label: 'Mercado', icon: ShoppingBag },
  { id: 'ECONOMY', label: 'Economía', icon: Wallet },
  { id: 'STAFF', label: 'Staff', icon: Briefcase },
  { id: 'TRAINING', label: 'Entreno', icon: Dumbbell },
  { id: 'SEASON_HISTORY', label: 'Libro Temp.', icon: BookMarked },
  { id: 'SCOUTING', label: 'Scouting', icon: Binoculars },
  { id: 'BOARD', label: 'Directiva', icon: Award },
  { id: 'VACATION', label: 'Vacaciones', icon: Sun },
  { id: '__SAVE__', label: 'Guardar', icon: Save },
];

interface BottomNavProps {
  advanceTime: () => void;
  simulateToNextMatch: () => void;
  onSave: () => void;
  isSimulating: boolean;
  isPreMatchView: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ advanceTime, simulateToNextMatch, onSave, isSimulating, isPreMatchView }) => {
  const { currentView, setView, userClub, selectedNationalTeamId } = useUIStore();

  const [showMore, setShowMore] = React.useState(false);

  if (!userClub && !selectedNationalTeamId) return null;

  const isNationalOnly = !userClub && Boolean(selectedNationalTeamId);
  const isActive = (tabId: string) => {
    if (tabId === '__ADVANCE__') return false;
    if (tabId === currentView) return true;
    if (!isNationalOnly && tabId === 'SENIOR_SQUAD' && currentView.endsWith('_SQUAD')) return true;
    if (!isNationalOnly && tabId === 'SENIOR_TACTICS' && currentView.endsWith('_TACTICS')) return true;
    if (tabId === 'PRE_MATCH' && (currentView === 'MATCH' || currentView === 'PRE_MATCH')) return true;
    return false;
  };

  const handleTab = (id: string) => {
    if (id === '__MORE__') {
      setShowMore(prev => !prev);
      return;
    }
    if (id === '__ADVANCE__') {
      setShowMore(false);
      advanceTime();
      return;
    }
    setShowMore(false);
    setView(id);
  };

const nationalTabs = [
  { id: `NT_${selectedNationalTeamId}`, label: 'Selección', icon: Users },
  { id: 'CHRONICLES', label: 'Crónicas', icon: Trophy },
  { id: '__ADVANCE__', label: 'Continuar', icon: RefreshCw, isAction: true },
  { id: '__MORE__', label: 'Más', icon: MoreHorizontal },
];

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[200] bg-gradient-to-b from-[#343a40] to-[#191c20] border-t border-[#4b525a] px-1.5 py-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.45)] lg:hidden"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-stretch justify-between gap-1 h-12">
          {(isNationalOnly ? nationalTabs : tabs).map(tab => {
            const Icon = tab.icon;
            const active = tab.id === '__MORE__' ? showMore : isActive(tab.id);
            const isAdvancing = Boolean(tab.isAction && isSimulating);
            const btnStyle = tab.isAction
              ? 'bg-gradient-to-b from-[#3b7a3d] via-[#2b5d2c] to-[#1a3d1b] border-[#0f2410] text-[#facc15] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.65)]'
              : active
              ? 'bg-gradient-to-b from-[#2b5d2c] to-[#1d431e] border-[#133014] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_1px_2px_rgba(0,0,0,0.6)]'
              : 'bg-gradient-to-b from-[#f3f4f6] via-[#d4d8de] to-[#b9bfc6] border-[#5f666e] text-[#1f2428] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(0,0,0,0.5)]';
            return (
              <button
                key={tab.id}
                type="button"
                disabled={isAdvancing}
                onClick={() => handleTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 rounded-[2px] border active:translate-y-px transition-all ${isAdvancing ? 'opacity-80 cursor-wait' : 'cursor-pointer'} ${btnStyle}`}
              >
                <Icon
                  size={17}
                  className={`${isAdvancing ? 'animate-spin' : ''} ${
                    tab.isAction
                      ? 'text-[#facc15] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]'
                      : active
                      ? 'text-[#facc15] drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]'
                      : 'text-[#23272c]'
                  }`}
                />
                <span className="text-[8.5px] font-extrabold uppercase tracking-tight leading-none truncate max-w-full px-0.5">
                  {isAdvancing ? 'Avanzando' : tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {showMore && (
        <>
          <div className="fixed inset-0 z-[199] bg-black/55 lg:hidden" onClick={() => setShowMore(false)} />
          <div
            className="fixed bottom-[60px] left-0 right-0 z-[200] bg-gradient-to-b from-[#343a40] to-[#1b1f23] border-t-2 border-[#6e7680] rounded-t-md p-3 shadow-2xl lg:hidden animate-slide-up"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {(isNationalOnly ? [
                { id: `NT_${selectedNationalTeamId}`, label: 'Selección', icon: Users },
                { id: 'CHRONICLES', label: 'Crónicas', icon: Trophy },
                { id: 'MANAGER_PROFILE', label: 'Mi carrera', icon: Briefcase },
                { id: 'SEASON_HISTORY', label: 'Libro Temp.', icon: BookMarked },
                { id: '__SAVE__', label: 'Guardar', icon: Save },
              ] : moreItems).map(item => {
                const Icon = item.icon;
                const active = currentView === item.id;
                const isSaveItem = item.id === '__SAVE__';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowMore(false);
                      if (isSaveItem) {
                        onSave();
                      } else {
                        setView(item.id);
                      }
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1.5 rounded-[2px] border active:translate-y-px transition-all cursor-pointer ${
                      active
                        ? 'bg-gradient-to-b from-[#2b5d2c] to-[#1d431e] border-[#133014] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.6)]'
                        : 'bg-gradient-to-b from-[#f3f4f6] via-[#d4d8de] to-[#b9bfc6] border-[#5f666e] text-[#1f2428] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(0,0,0,0.5)] hover:brightness-105'
                    }`}
                  >
                    <Icon size={17} className={active ? 'text-[#facc15]' : 'text-[#23272c]'} />
                    <span className="text-[9px] font-extrabold uppercase tracking-tight leading-none truncate max-w-full">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
};

