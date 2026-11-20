import React, { useState } from 'react';
import { MediaNews } from '../types';
import { world } from '../services/worldManager';
import { Newspaper, ArrowLeft, Clock, Trophy, AlertTriangle, Star, Info } from 'lucide-react';

interface MediaViewProps {
  onBack: () => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  HEADLINE: <Star size={12} className="text-amber-600 shrink-0" />,
  FEATURE: <Info size={12} className="text-blue-600 shrink-0" />,
  RUMOR: <Clock size={12} className="text-purple-600 shrink-0" />,
  CRITICISM: <AlertTriangle size={12} className="text-red-600 shrink-0" />,
  PRAISE: <Trophy size={12} className="text-green-600 shrink-0" />,
};

const TYPE_LABELS: Record<string, string> = {
  HEADLINE: 'Titular',
  FEATURE: 'Reportaje',
  RUMOR: 'Rumor',
  CRITICISM: 'Crítica',
  PRAISE: 'Elogio',
};

const SECTION_LABELS: Record<string, string> = {
  MERCADO: 'Mercado',
  CLASIFICACION: 'Tabla',
  DESPIDOS: 'Despidos',
  RESULTADOS: 'Resultados',
  LESIONES: 'Lesiones',
  INTERNACIONAL: 'Mundo',
  TU_CLUB: 'Tu club',
};

const TABS: { id: string; label: string }[] = [
  { id: 'PORTADA', label: 'Portada' },
  { id: 'TU_CLUB', label: 'Tu club' },
  { id: 'MERCADO', label: 'Mercado' },
  { id: 'RESULTADOS', label: 'Resultados' },
  { id: 'CLASIFICACION', label: 'Tabla' },
  { id: 'LESIONES', label: 'Lesiones' },
  { id: 'DESPIDOS', label: 'Despidos' },
  { id: 'INTERNACIONAL', label: 'Mundo' },
];

export const MediaView: React.FC<MediaViewProps> = ({ onBack: _onBack }) => {
  const [tab, setTab] = useState<string>('PORTADA');
  const [selectedNews, setSelectedNews] = useState<MediaNews | null>(null);
  const [, setTick] = useState(0);

  const allNews = world.getAllNews().filter(n => {
    const userClub = world.getUserClub();
    if (!userClub) return true;
    if (n.isUserClubNews || n.section === 'TU_CLUB') return true;
    if (world.isNewsRelevantToUser({ clubId: n.clubId, playerId: n.playerId, competitionId: n.competitionId })) return true;
    if (n.section === 'INTERNACIONAL') {
      return !n.clubId && (!n.competitionId || ['W_CLUB', 'WC_FINAL', 'UCL', 'COPA', 'EURO'].includes(n.competitionId));
    }
    if (n.section === 'DESPIDOS' && n.clubId) {
      return (world.getClub(n.clubId)?.reputation || 0) >= 8500;
    }
    if ((n.section === 'MERCADO' || n.section === 'LESIONES') && n.playerId) {
      return (world.getPlayer(n.playerId)?.currentAbility || 0) >= 165;
    }
    return false;
  });

  const visible = (() => {
    if (tab === 'PORTADA') {
      return [...allNews]
        .sort((a, b) =>
          ((b.isUserClubNews ? 1 : 0) - (a.isUserClubNews ? 1 : 0)) ||
          ((b.featured ? 1 : 0) - (a.featured ? 1 : 0)) ||
          (b.date.getTime() - a.date.getTime())
        )
        .slice(0, 15);
    }
    if (tab === 'TU_CLUB') return allNews.filter(n => n.section === 'TU_CLUB' || n.isUserClubNews).slice(0, 20);
    return allNews.filter(n => n.section === tab).slice(0, 20);
  })();

  const openNews = (news: MediaNews) => {
    if (!news.read) news.read = true;
    setSelectedNews(news);
  };

  const markAllRead = () => {
    world.mediaNews.forEach(n => { if (!n.read) n.read = true; });
    setTick(t => t + 1);
  };

  return (
    <div className="flex flex-col h-full bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <header className="bg-gradient-to-b from-[#e2e8f0] to-[#c8d2c8] px-2 py-1.5 sm:px-3 sm:py-2 border-b border-[#a0b0a0] shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="bg-[#3a4a3a] rounded-sm p-1 shrink-0">
              <Newspaper size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-base font-black text-slate-900 uppercase tracking-tighter truncate leading-none">
                Diario Deportivo
              </h2>
              <p className="hidden sm:block text-[9px] text-slate-500 font-bold truncate">
                Portadas, titulares y noticias del mundo del fútbol
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="px-2 py-0.5 text-[8.5px] font-black uppercase rounded-[2px] border border-[#6b7280] text-[#1f2428] shrink-0 cursor-pointer hover:brightness-105"
            style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 50%, #b9bfc6 100%)' }}
          >
            Marcar leído
          </button>
        </div>

        {/* Compact equal-width button grid: 4x2 on mobile, 8x1 on desktop — zero horizontal scroll */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setSelectedNews(null); }}
              className={`w-full px-1 py-1 text-[8.5px] sm:text-[9px] font-black uppercase tracking-tight text-center leading-tight rounded-[2px] border transition-all cursor-pointer active:translate-y-px ${
                tab === t.id
                  ? 'bg-gradient-to-b from-[#2b5d2c] to-[#1d431e] border-[#133014] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.45)]'
                  : 'border-[#5f666e] text-[#1f2428] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_1px_rgba(0,0,0,0.25)] hover:brightness-105'
              }`}
              style={
                tab === t.id
                  ? undefined
                  : { background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 50%, #b9bfc6 100%)' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
        {selectedNews ? (
          <div className="p-2 sm:p-4">
            <button
              type="button"
              onClick={() => setSelectedNews(null)}
              className="text-slate-700 hover:text-slate-950 text-[10px] font-black uppercase mb-2 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft size={12} /> Volver a {TABS.find(t => t.id === tab)?.label || 'Portada'}
            </button>
            <div className="bg-white border border-[#a0b0a0] rounded-sm overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-[#e2e8f0] to-[#d0d8d0] p-2.5 sm:p-4 border-b border-[#a0b0a0]">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {TYPE_ICONS[selectedNews.type]}
                  <span className="text-[9px] font-black uppercase text-[#3a4a3a]">{TYPE_LABELS[selectedNews.type]}</span>
                  <span className="text-[9px] font-bold text-slate-400">|</span>
                  <span className="text-[9px] font-bold uppercase text-slate-600">{SECTION_LABELS[selectedNews.section] || selectedNews.section}</span>
                  {selectedNews.featured && <span className="text-[8px] font-black uppercase bg-amber-400 text-black px-1.5 py-0.5 rounded-sm">Destacada</span>}
                  {selectedNews.isUserClubNews && <span className="text-[8px] font-bold uppercase text-[#3a4a3a] bg-[#3a4a3a]/10 px-1.5 py-0.5 rounded-sm">Tu club</span>}
                </div>
                <h3 className="text-sm sm:text-lg font-black text-slate-900 uppercase leading-tight">{selectedNews.headline}</h3>
                <p className="text-[11px] sm:text-sm text-slate-600 mt-1 italic">{selectedNews.subheadline}</p>
              </div>
              <div className="p-2.5 sm:p-4">
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">{selectedNews.body}</p>
                <div className="mt-3 pt-2 border-t border-slate-200 flex items-center gap-2 text-[9px] text-slate-500">
                  <Clock size={11} /> {selectedNews.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {selectedNews.clubId && <span className="ml-auto font-bold truncate">Club: {world.getClub(selectedNews.clubId)?.name}</span>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 p-2 sm:p-3">
            {visible.length === 0 && (
              <div className="text-center text-slate-500 py-8 bg-white/70 border border-[#a0b0a0] rounded-sm">
                <Newspaper size={32} className="mx-auto mb-2 text-slate-400" />
                <p className="text-xs font-black uppercase">Sin noticias en esta sección</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Avanzá días para que el diario publique nuevas notas</p>
              </div>
            )}
            {visible.map(news => (
              <button
                key={news.id}
                type="button"
                onClick={() => openNews(news)}
                className={`w-full text-left p-2 sm:p-2.5 bg-white hover:bg-[#f2f7f2] border border-[#a0b0a0] rounded-sm transition-all cursor-pointer ${
                  news.isUserClubNews || news.section === 'TU_CLUB' ? 'border-l-4 border-l-[#2b5d2c]' : 'border-l-4 border-l-[#9ab09a]'
                } ${news.featured ? 'ring-1 ring-amber-400/60 bg-[#fffdf5]' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{TYPE_ICONS[news.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[8px] font-black uppercase text-slate-500 truncate">{SECTION_LABELS[news.section] || news.section}</span>
                      {news.featured && <span className="text-[7.5px] font-black uppercase bg-amber-400 text-black px-1 py-0.2 rounded-sm shrink-0">Destacada</span>}
                      {(news.isUserClubNews || news.section === 'TU_CLUB') && <span className="text-[8px] font-black uppercase text-[#2b5d2c] shrink-0">Tu club</span>}
                      {!news.read && <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0" />}
                      <span className="ml-auto text-[8px] text-slate-400 font-mono shrink-0">{news.date.toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-[11px] sm:text-xs font-black uppercase leading-snug text-slate-900 line-clamp-2">{news.headline}</h4>
                    <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-1">{news.subheadline}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
