
import React, { useMemo, useState } from 'react';
import { Club } from '../types';
import { world } from '../services/worldManager';
import { FMBox } from './FMUI';
import { ChevronRight, ChevronDown, Globe } from 'lucide-react';
import { FmClubShield, getClubHexPalette } from './ClubBannerChrome';

interface ClubsListViewProps {
  onSelectClub: (club: Club) => void;
}

export const ClubsListView: React.FC<ClubsListViewProps> = ({ onSelectClub }) => {
  const [expandedCountries, setExpandedCountries] = useState<Record<string, boolean>>({
     "Argentina": true // Start with Argentina open by default
  });

  const groupedClubs = useMemo(() => {
    const groups: Record<string, Club[]> = {};
    
    world.clubs.forEach(club => {
       const league = world.competitions.find(c => c.id === club.leagueId);
       const country = league ? league.country : "Resto del Mundo";
       
       if (!groups[country]) groups[country] = [];
       groups[country].push(club);
    });
    
    return groups;
  }, []);

  const countries = Object.keys(groupedClubs).sort((a,b) => {
      if (a === "Argentina") return -1;
      if (b === "Argentina") return 1;
      return a.localeCompare(b);
  });

  const toggleCountry = (country: string) => {
    setExpandedCountries(prev => ({
        ...prev,
        [country]: !prev[country]
    }));
  };

  return (
    <div className="p-2 md:p-4 h-full flex flex-col gap-4 bg-[#d4dcd4] overflow-hidden">
        <header className="border-b border-[#a0b0a0] pb-3 shrink-0">
          <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Base de Datos de Clubes</h2>
          <p className="text-slate-600 font-bold text-[9px] md:text-[10px] uppercase tracking-widest italic">Explora todos los equipos del mundo.</p>
        </header>

        <div className="flex-1 overflow-y-auto custom-scroll space-y-2 pr-1 pb-4">
            {countries.map(country => {
                const isOpen = expandedCountries[country];
                const clubCount = groupedClubs[country].length;

                return (
                    <div key={country} className="flex flex-col border border-[#a0b0a0] rounded-sm bg-[#e8ece8] shadow-sm overflow-hidden">
                        <button 
                            onClick={() => toggleCountry(country)}
                            className="w-full px-3 py-2 flex justify-between items-center transition-colors hover:bg-[#ccd9cc]"
                            style={{ background: isOpen ? 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' : 'linear-gradient(to bottom, #f0f4f0 0%, #d0d8d0 100%)' }}
                        >
                            <div className="flex items-center gap-2">
                                <Globe size={14} className="text-slate-600" />
                                <span className="text-slate-900 font-bold text-[11px] uppercase tracking-tight" style={{ fontFamily: 'Verdana, sans-serif' }}>
                                    {country}
                                </span>
                                <span className="text-[9px] bg-black/10 px-1.5 rounded-full text-slate-700 font-bold">
                                    {clubCount}
                                </span>
                            </div>
                            {isOpen ? <ChevronDown size={14} className="text-slate-700" /> : <ChevronRight size={14} className="text-slate-700" />}
                        </button>

                        {isOpen && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 p-2 bg-[#cfd7cf] animate-fade-up">
                                {groupedClubs[country].sort((a,b) => b.reputation - a.reputation).map(club => {
                                    const pal = getClubHexPalette(club);
                                    return (
                                    <button 
                                        key={club.id}
                                        onClick={() => onSelectClub(club)}
                                        className="relative flex items-center gap-2.5 px-2.5 py-2 border border-[#1c1f24] rounded-sm hover:brightness-110 transition-all text-left group shadow-sm overflow-hidden cursor-pointer"
                                        style={{
                                          background: `linear-gradient(90deg, ${pal.primary} 0%, ${pal.primary}dd 38%, #23272c 76%, #191c20 100%)`,
                                        }}
                                    >
                                        <div
                                          className="pointer-events-none absolute inset-x-0 top-0 h-3.5"
                                          style={{
                                            background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
                                          }}
                                        />
                                        {pal.isLightPrimary && (
                                          <div
                                            className="pointer-events-none absolute inset-0"
                                            style={{
                                              background: 'linear-gradient(180deg, rgba(15,18,22,0.16) 0%, rgba(15,18,22,0.48) 100%)',
                                            }}
                                          />
                                        )}
                                        <FmClubShield club={club} size="sm" className="relative z-10" />
                                        <div className="relative z-10 flex-1 min-w-0">
                                            <h4 className="font-bold text-white text-xs tracking-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">{club.name}</h4>
                                            <p className="text-[10px] text-white/75 font-medium truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                                {world.competitions.find(c=>c.id===club.leagueId)?.name || 'Liga Internacional'}
                                            </p>
                                        </div>
                                        <ChevronRight size={14} className="relative z-10 text-white/60 group-hover:text-white shrink-0" />
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    </div>
  );
};
