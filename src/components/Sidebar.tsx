import React from 'react';
import {
  Home,
  Users,
  Clipboard,
  Trophy,
  ShoppingBag,
  Wallet,
  Briefcase,
  Dumbbell,
  Binoculars,
  Award,
  BookMarked,
  Sun,
  Newspaper,
  TrendingUp,
  Save,
  Calendar,
  Medal,
} from 'lucide-react';
import { Club } from '../types';
import { PWAInstallButton } from './PWAControls';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  club: Club | null;
  onVacation?: () => void;
  onSave: () => void;
  nationalTeamId?: string | null;
}

const primaryClubItems = [
  { id: 'HOME', label: 'Inicio', icon: Home },
  { id: 'SENIOR_SQUAD', label: 'Plantilla', icon: Users },
  { id: 'SENIOR_TACTICS', label: 'Táctica', icon: Clipboard },
  { id: 'SENIOR_SCHEDULE', label: 'Partidos', icon: Calendar },
];

const clubMoreItems = [
  { id: 'TABLE', label: 'Clasificación', icon: Trophy },
  { id: 'LEAGUE_RANKING', label: 'Ranking Ligas', icon: TrendingUp },
  { id: 'MEDIA', label: 'Prensa', icon: Newspaper },
  { id: 'MANAGER_PROFILE', label: 'Mi Carrera', icon: Briefcase },
  { id: 'ECONOMY', label: 'Economía', icon: Wallet },
  { id: 'STAFF', label: 'Staff', icon: Briefcase },
  { id: 'TRAINING', label: 'Entreno', icon: Dumbbell },
  { id: 'SCOUTING', label: 'Scouting', icon: Binoculars },
  { id: 'MARKET', label: 'Mercado', icon: ShoppingBag },
  { id: 'CHRONICLES', label: 'Crónicas', icon: BookMarked },
  { id: 'SEASON_HISTORY', label: 'Libro Temp.', icon: BookMarked },
  { id: 'BOARD', label: 'Directiva', icon: Award },
  { id: 'VACATION', label: 'Vacaciones', icon: Sun },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  club,
  nationalTeamId,
  onSave,
}) => {
  const isNationalOnly = !club && Boolean(nationalTeamId);

  const isClubItemActive = (id: string) => {
    if (id === currentView) return true;
    if (id === 'SENIOR_SQUAD' && currentView.endsWith('_SQUAD')) return true;
    if (id === 'SENIOR_TACTICS' && currentView.endsWith('_TACTICS')) return true;
    if (id === 'SENIOR_SCHEDULE' && currentView.endsWith('_SCHEDULE')) return true;
    return false;
  };

  const nationalItems = nationalTeamId
    ? [
        { id: `NT_${nationalTeamId}`, label: 'Selección', icon: Users },
        { id: 'MANAGER_PROFILE', label: 'Mi carrera', icon: Briefcase },
        { id: 'CHRONICLES', label: 'Crónicas', icon: Trophy },
        { id: 'SEASON_HISTORY', label: 'Libro Temp.', icon: BookMarked },
      ]
    : [];

  return (
    <aside
      id="main-sidebar"
      className="hidden lg:flex lg:static top-0 left-0 bottom-0 w-56 bg-[#e2e7e2] border-r border-[#8e9b90] h-full flex-col shrink-0"
    >
      <nav className="flex-1 overflow-y-auto custom-scroll py-2.5 flex flex-col gap-0.5">
        {isNationalOnly ? (
          nationalItems.map((item) => {
            const active =
              currentView === item.id ||
              (item.id.startsWith('NT_') && currentView.startsWith('NT_'));
            return (
              <NavItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                active={active}
                onClick={() => setView(item.id)}
              />
            );
          })
        ) : (
          <>
            <div className="space-y-0.5">
              {primaryClubItems.map((item) => (
                <NavItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={isClubItemActive(item.id)}
                  onClick={() => setView(item.id)}
                />
              ))}
            </div>

            <div className="h-px bg-[#a0b0a0] mx-3 my-2" />

            <div className="space-y-0.5">
              {clubMoreItems.map((item) => (
                <NavItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={currentView === item.id || (item.id === 'CUPS' && currentView.startsWith('COMP_'))}
                  onClick={() => setView(item.id)}
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-auto pt-3 px-3 pb-3 border-t border-[#a0b0a0]/60 space-y-1.5">
          <button
            type="button"
            onClick={onSave}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#bcc8bc] hover:bg-[#a9b7a9] text-slate-900 rounded-[2px] border border-[#6e7b6e] shadow-xs transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer active:translate-y-px"
          >
            <Save size={14} /> Guardar
          </button>
          <PWAInstallButton />
        </div>
      </nav>
    </aside>
  );
};

interface NavItemProps {
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon: Icon, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center px-3.5 py-2 text-[11px] font-bold uppercase tracking-tight transition-colors cursor-pointer ${
      active
        ? 'bg-[#2b5d2c] text-white shadow-inner'
        : 'text-slate-700 hover:bg-[#cfd7cf] hover:text-slate-950'
    }`}
  >
    <Icon
      size={15}
      className={`mr-2.5 shrink-0 ${active ? 'text-[#facc15]' : 'text-slate-600'}`}
    />
    <span className="truncate">{label}</span>
  </button>
);
