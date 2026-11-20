import React, { useMemo, useState } from 'react';
import { world } from '../../services/worldManager';
import { notifyAll, useWorldStore } from '../../stores/worldStore';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import { CharacterDialog } from './CharacterDialog';
import { SpeechBubble } from './SpeechBubble';
import { FMButton } from '../FMUI';
import { Club } from '../../types';
import { Award, DollarSign, Building2, Users, Target, ShieldCheck } from 'lucide-react';

const PRESIDENT_FIRST = ['Alberto', 'Carlos', 'Eduardo', 'Jorge', 'Ricardo', 'Fernando', 'Luis', 'Héctor', 'Roberto', 'Enrique'];
const PRESIDENT_LAST = ['Mendoza', 'Aguilar', 'Castellanos', 'Salazar', 'Montoya', 'Domínguez', 'Villarreal', 'Peralta', 'Escobar', 'Sarmiento'];

export function getClubPresidentName(clubId: string): string {
  let hash = 0;
  for (let i = 0; i < clubId.length; i++) {
    hash = (hash * 31 + clubId.charCodeAt(i)) >>> 0;
  }
  const f = PRESIDENT_FIRST[hash % PRESIDENT_FIRST.length];
  const l = PRESIDENT_LAST[Math.floor(hash / 7) % PRESIDENT_LAST.length];
  return `${f} ${l}`;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  WIN_LEAGUE: 'Ganar la Liga',
  TOP_4: 'Clasificar Top 4',
  WIN_CUP: 'Ganar la Copa',
  CUP_SEMIS: 'Semifinal de Copa',
  TOP_HALF: 'Mitad superior',
  AVOID_RELEGATION: 'Evitar el descenso',
};

export const PresidentDialog: React.FC = () => {
  const { kind, data, close } = useDialogueStore();
  const currentDate = useGameStore(s => s.currentDate) || new Date();
  const clubs = useWorldStore(s => s.clubs);
  const [reply, setReply] = useState<string | null>(null);
  const [replyTone, setReplyTone] = useState<'ok' | 'warn' | 'info'>('info');
  const [showObjectives, setShowObjectives] = useState(false);

  const clubId = data?.clubId;
  const club = clubs.find(c => c.id === clubId) || (clubId ? world.getClub(clubId) : undefined);

  const presidentName = useMemo(() => (clubId ? getClubPresidentName(clubId) : 'Presidente'), [clubId]);

  if (kind !== 'PRESIDENT' || !club) return null;

  const iniciales = presidentName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const clubPrimary = club.primaryColor || 'bg-[#3a4a3a]';
  const conf = Math.round(club.boardConfidence);
  const currentObjLabel = OBJECTIVE_LABELS[club.seasonObjective || 'TOP_HALF'] || 'Mitad superior';

  const openingLine =
    conf >= 75
      ? `Bienvenido a mi despacho, Míster. La junta está muy satisfecha con tu gestión (${conf}% de confianza). ¿En qué te podemos respaldar hoy?`
      : conf >= 45
      ? `Pasá, Míster. Estamos siguiendo de cerca la campaña (confianza ${conf}%). Cumplir el objetivo «${currentObjLabel}» es nuestra prioridad. ¿Qué necesitás plantear?`
      : `Míster, la presión de la comisión es alta (${conf}% de confianza). Necesitamos resultados inmediatos. Te escucho, pero sé concreto.`;

  const askBudget = () => {
    const res = world.requestBudgetIncrease(club.id, currentDate);
    notifyAll();
    setReplyTone(res.success ? 'ok' : 'warn');
    setReply(res.message);
  };

  const askUpgrade = (facility: 'training' | 'youth') => {
    const res = world.requestFacilityUpgrade(club.id, facility, currentDate);
    notifyAll();
    setReplyTone(res.success ? 'ok' : 'warn');
    setReply(res.message);
  };

  const askSupport = () => {
    setShowObjectives(false);
    if (conf >= 70) {
      setReplyTone('ok');
      setReply(`Tenés nuestro respaldo absoluto frente a la prensa y el vestuario. Seguí con esta línea y te garantizamos estabilidad a largo plazo.`);
    } else if (conf >= 45) {
      setReplyTone('info');
      setReply(`Confiamos en tu trabajo, pero la junta evaluará semana a semana. Un par de victorias en liga nos dará tranquilidad a todos.`);
    } else {
      setReplyTone('warn');
      setReply(`No puedo mentirte: hay directivos impacientes. Necesitamos revertir la racha cuanto antes para sostener el proyecto.`);
    }
  };

  const proposeObjective = (obj: NonNullable<Club['seasonObjective']>) => {
    const res = world.setSeasonObjective(club.id, obj, currentDate);
    notifyAll();
    setReplyTone(res.success ? 'ok' : 'warn');
    setReply(res.message);
    setShowObjectives(false);
  };

  const trainingCost = Math.round((club.trainingFacilities + 1) * (club.trainingFacilities + 1) * 50000);
  const youthCost = Math.round((club.youthFacilities + 1) * (club.youthFacilities + 1) * 50000);

  return (
    <CharacterDialog
      nombre={presidentName}
      cargo={`Presidente · ${club.shortName}`}
      iniciales={iniciales}
      clubColor={clubPrimary}
      onClose={close}
      footer={
        <FMButton variant="secondary" onClick={close} className="px-6 py-2 text-[10px]">
          Salir del despacho
        </FMButton>
      }
    >
      <div className="space-y-3">
        <SpeechBubble
          texto={reply || openingLine}
          subtitulo={`Confianza: ${conf}% · Objetivo: ${currentObjLabel}`}
        />

        {reply && (
          <div className={`px-2.5 py-1.5 rounded-sm border text-[9px] font-black uppercase ${
            replyTone === 'ok'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
              : replyTone === 'warn'
              ? 'bg-amber-50 border-amber-400 text-amber-900'
              : 'bg-slate-100 border-slate-300 text-slate-700'
          }`}>
            Respuesta oficial de presidencia registrada
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={askSupport}
            className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
              <ShieldCheck size={13} className="text-[#2b5d2c]" /> Consultar Respaldo
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">Preguntá cómo evalúa la directiva tu continuidad.</p>
          </button>

          <button
            type="button"
            onClick={askBudget}
            className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
              <DollarSign size={13} className="text-emerald-700" /> Pedir Más Presupuesto
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">Solicitá +30% extra para refuerzos esta temporada.</p>
          </button>

          <button
            type="button"
            onClick={() => askUpgrade('training')}
            className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
              <Building2 size={13} className="text-slate-700" /> Mejorar Entrenamiento ({club.trainingFacilities}/20)
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">Costo estimado: £{(trainingCost / 1000).toFixed(0)}k</p>
          </button>

          <button
            type="button"
            onClick={() => askUpgrade('youth')}
            className="p-2.5 bg-white border border-[#a0b0a0] hover:border-[#2b5d2c] hover:bg-[#f2f7f2] rounded-sm text-left transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-900">
              <Users size={13} className="text-blue-700" /> Mejorar Cantera ({club.youthFacilities}/20)
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">Costo estimado: £{(youthCost / 1000).toFixed(0)}k</p>
          </button>
        </div>

        <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5">
          <button
            type="button"
            onClick={() => setShowObjectives(v => !v)}
            className="w-full flex items-center justify-between text-[10px] font-black uppercase text-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-1.5"><Target size={13} className="text-amber-600" /> Renegociar Objetivo de Temporada ({currentObjLabel})</span>
            <Award size={12} className="text-slate-400" />
          </button>
          {showObjectives && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-slate-200">
              {Object.entries(OBJECTIVE_LABELS).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => proposeObjective(id as NonNullable<Club['seasonObjective']>)}
                  className={`px-2 py-1.5 text-[9px] font-black uppercase rounded-sm border transition-all cursor-pointer ${
                    club.seasonObjective === id
                      ? 'bg-[#2b5d2c] text-white border-[#133014]'
                      : 'bg-[#f4f7f4] text-slate-700 border-[#a0b0a0] hover:bg-[#e0e8e0]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </CharacterDialog>
  );
};
