import React, { useMemo, useEffect, useState } from 'react';
import { world } from '../../services/worldManager';
import { generateUUID } from '../../services/utils';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import {
  generateTacticAdvice, applyTacticPreset, generateLineupAdvice, generateBestLineupForChosenTactic, applyLineup,
  applyAssistantInstructions, getTacticalStaff, TacticArchetype,
} from '../../services/staffAdviceService';
import { notifyTactics } from '../../stores/worldStore';
import { CharacterDialog } from './CharacterDialog';
import { SpeechBubble } from './SpeechBubble';
import { LineupPitch } from './LineupPitch';
import { FMButton } from '../FMUI';

interface AssistantAdviceDialogProps {
  onStartMatch?: () => void;
}

type DialogPhase = 'recommendation' | 'alternatives' | 'lineup';

export const AssistantAdviceDialog: React.FC<AssistantAdviceDialogProps> = ({ onStartMatch }) => {
  const { kind, phase, selection, data, advance, select, close, setClosingPhrase } = useDialogueStore();
  const [localPhase, setLocalPhase] = useState<DialogPhase>('recommendation');
  const [selectedAlt, setSelectedAlt] = useState<TacticArchetype | null>(null);
  const [chosenArchetype, setChosenArchetype] = useState<TacticArchetype | null>(null);
  const [keepChosenTactic, setKeepChosenTactic] = useState(false);
  const nextFixture = useGameStore(s => s.nextFixture);
  const currentDate = useGameStore(s => s.currentDate);

  useEffect(() => {
    if (kind === 'ASSISTANT' && phase === 'opening') {
      setKeepChosenTactic(false);
      setLocalPhase('recommendation');
      setSelectedAlt(null);
      const timer = setTimeout(() => advance(), 250);
      return () => clearTimeout(timer);
    }
  }, [kind, phase, advance]);

  useEffect(() => {
    if (phase === 'closing') {
      const timer = setTimeout(() => {
        const fromTactics = data?.source === 'TACTICS';
        close();
        if (!fromTactics) onStartMatch?.();
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [phase, close, onStartMatch, data?.source]);

  const recordEffects = (accion: string) => {
    if (!currentDate) return;
    world.addInboxMessage('SQUAD', 'Consejo del staff', `${staffName}: ${accion}`, currentDate, tacticalStaff?.id);
    world.recordInteraction({
      id: generateUUID(),
      date: currentDate,
      channel: 'COACH_STAFF',
      actorId: 'COACH',
      targetId: tacticalStaff?.id || club.id,
      type: 'TACTICAL_ADVICE',
      tone: 'MODERATE',
      result: 'POSITIVE',
      moraleChange: 0,
      tensionChange: 0,
      description: accion,
    });
  };

  const applySelectedTactic = (arch: TacticArchetype) => {
    setChosenArchetype(arch);
    const tactics = world.getTactics();
    const tactic = (data?.tacticId && tactics.find(t => t.id === data.tacticId)) || world.getActiveTactic() || tactics[0];
    if (!tactic) return;
    if (advice.formacionRecomendada) {
      const targetTactic = tactics.find(t => t.id === advice.formacionRecomendada!.id) || tactic;
      targetTactic.positions = [...advice.formacionRecomendada.positions];
      applyTacticPreset(targetTactic, arch);
      world.setActiveTactic(targetTactic.id);
      notifyTactics();
    } else {
      applyTacticPreset(tactic, arch);
      world.setActiveTactic(tactic.id);
      notifyTactics();
    }
    recordEffects(`Aplicó el plan táctico ${arch} con formación ${advice.formacionNombre || tactic.id} e instrucciones de equipo.`);
    if (tacticalStaff) {
      const staff = world.getStaff(tacticalStaff.id);
      if (staff) staff.siguioConsejoUltimaVez = true;
    }
  };

  const handleAcceptRecommendation = () => {
    setKeepChosenTactic(false);
    applySelectedTactic(advice.recomendacion);
    setLocalPhase('lineup');
  };

  const handleCompleteElevenWithCurrentTactic = () => {
    setKeepChosenTactic(true);
    if (data?.tacticId) {
      world.setActiveTactic(data.tacticId);
      notifyTactics();
    }
    setLocalPhase('lineup');
  };

  const handleShowAlternatives = () => {
    setKeepChosenTactic(false);
    setLocalPhase('alternatives');
  };

  const handleSelectAlternative = () => {
    if (!selectedAlt) return;
    setKeepChosenTactic(false);
    applySelectedTactic(selectedAlt);
    setLocalPhase('lineup');
  };

  const clubId = data?.clubId;
  const club = clubId ? world.getClub(clubId) : undefined;
  const opponentId = data?.opponentId || (nextFixture && clubId
    ? (nextFixture.homeTeamId === clubId ? nextFixture.awayTeamId : nextFixture.homeTeamId)
    : undefined);
  const opponent = opponentId ? world.getClub(opponentId) : undefined;

  const tacticalStaff = clubId ? getTacticalStaff(clubId, data?.staffId) : null;
  const staffRole = tacticalStaff?.role || 'ASSISTANT_MANAGER';
  const staffName = tacticalStaff?.name || 'El Asistente';
  const staffTitle = staffRole === 'RESERVE_MANAGER' ? 'Entrenador Reserva'
    : staffRole === 'YOUTH_MANAGER' ? 'Entrenador Sub-20'
    : 'Ayudante de Campo';
  const iniciales = staffName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const clubPrimary = club?.primaryColor || '#3a4a3a';
  const clubBorder = clubPrimary;

  const advice = useMemo(() => {
    const raw = club ? generateTacticAdvice(club, opponent, data?.squad || 'SENIOR', tacticalStaff || undefined) : null;
    if (!raw || !tacticalStaff) return raw;
    if (tacticalStaff.siguioConsejoUltimaVez && selection) {
      const lastArch = selection as TacticArchetype;
      raw.textoPrincipal = `La última vez fuimos con ${lastArch === 'CONSERVATIVE' ? 'Conservador' : lastArch === 'RISKY' ? 'Arriesgado' : 'Equilibrado'} y salió bien. ¿repetimos o probamos algo nuevo?`;
    }
    return raw;
  }, [club?.id, opponent?.id, tacticalStaff?.siguioConsejoUltimaVez, tacticalStaff?.id, tacticalStaff?.preferredFormation, selection, data?.squad]);

  const lineup = useMemo(
    () =>
      club
        ? keepChosenTactic
          ? generateBestLineupForChosenTactic(club, data?.squad || 'SENIOR', data?.tacticId)
          : generateLineupAdvice(club, data?.squad || 'SENIOR')
        : null,
    [club?.id, localPhase, data?.squad, data?.tacticId, keepChosenTactic],
  );

  if (kind !== 'ASSISTANT' || !club || !advice || !lineup) return null;

  const cargoMostrado = staffRole === 'RESERVE_MANAGER' ? 'Entrenador Reserva'
    : staffRole === 'YOUTH_MANAGER' ? 'Entrenador Sub-20'
    : 'Segundo Entrenador · Ayudante de Campo';

  const handleAceptarOnce = () => {
    const activeTactic = (data?.tacticId && world.getTactics().find(t => t.id === data.tacticId)) || world.getActiveTactic() || world.getTactics()[0];
    if (keepChosenTactic) {
      if (data?.tacticId) world.setActiveTactic(data.tacticId);
      applyLineup(club.id, lineup.xi, data?.squad || 'SENIOR', lineup.banquillo);
      const tacticLabel = activeTactic?.name || 'actual';
      recordEffects(`Completó el mejor once (11) y suplentes (${Math.min(7, lineup.banquillo.length)}) manteniendo la táctica ${tacticLabel}.`);
      setClosingPhrase(`Listo, Jefe. Completé el mejor once y el banco respetando tu esquema ${tacticLabel}.`);
      return;
    }
    const arch = chosenArchetype || (selection as TacticArchetype) || advice.recomendacion;
    applyLineup(club.id, lineup.xi, data?.squad || 'SENIOR', lineup.banquillo);
    if (activeTactic) {
      applyAssistantInstructions(activeTactic, arch, lineup.xi);
    }
    const formacion = advice.formacionNombre || activeTactic?.name || '4-4-2';
    recordEffects(`Confirmó el once (11), suplentes (${Math.min(7, lineup.banquillo.length)}), instrucciones de equipo e instrucciones individuales (${arch}).`);
    setClosingPhrase(arch === 'CONSERVATIVE' ? `Listo, Jefe. Plan Conservador con bloque bajo, contragolpe e instrucciones individuales aplicadas (${formacion}).`
      : arch === 'RISKY' ? `Listo, Jefe. Plan Arriesgado con presión alta, proyección ofensiva e instrucciones individuales aplicadas (${formacion}).`
      : `Listo, Jefe. Plan Equilibrado con instrucciones de equipo e individuales aplicadas para los 11 (${formacion}).`);
  };

  const handleAceptarYPartido = () => {
    handleAceptarOnce();
    onStartMatch?.();
  };

  const handleVolverConsejo = () => {
    setKeepChosenTactic(false);
    setLocalPhase('recommendation');
    setSelectedAlt(null);
  };

  const alternativeOptions = advice.opciones.filter(op => op.id !== advice.recomendacion);

  const archetypeMeta: Record<TacticArchetype, { titulo: string; descripcion: string; efectos: string[] }> = {
    CONSERVATIVE: {
      titulo: 'Conservador',
      descripcion: 'Cerrar filas y golpear de contra.',
      efectos: ['Equipo: Mentalidad 5 · Línea 5 · Contragolpe + Marcaje estrecho', 'Individuales: Laterales contenidos, contención y salida rápida', 'Cierra líneas y protege el área ante rivales ofensivos'],
    },
    BALANCED: {
      titulo: 'Equilibrado',
      descripcion: 'Control asociativo y balance por líneas.',
      efectos: ['Equipo: Mentalidad 11 · Ritmo 11 · Pase combinativo (9)', 'Individuales: Organizador en medio y roles según perfil de cada titular', 'Presión y altura de líneas equilibradas'],
    },
    RISKY: {
      titulo: 'Arriesgado',
      descripcion: 'Presión total y ataque vertical.',
      efectos: ['Equipo: Mentalidad 17 · Presión 16 · Línea alta + Fuera de juego', 'Individuales: Laterales y extremos al ataque, pases filtrados y presión', 'Marcaje al hombre e intensidad ofensiva máxima'],
    },
  };

  const renderArchetypeCard = (arch: TacticArchetype, isRecommended: boolean, isSelected: boolean) => {
    const meta = archetypeMeta[arch];
    return (
      <div
        className={`p-3 rounded-sm border-2 bg-white transition-all ${
          isSelected ? 'border-[#3a4a3a] shadow-md' : 'border-[#a0b0a0]'
        } ${isRecommended ? 'ring-1 ring-[#3a4a3a]/30' : ''}`}
      >
        {isRecommended && (
          <div className="bg-[#3a4a3a] text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm mb-2 inline-block">
            Recomendado
          </div>
        )}
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">{meta.titulo}</p>
        <p className="text-[9px] font-bold text-slate-500 mt-0.5 leading-snug">{meta.descripcion}</p>
        <ul className="mt-2 space-y-1">
          {meta.efectos.map((ef, j) => (
            <li key={j} className="flex items-start gap-1.5 text-[9px] font-bold text-slate-600 leading-snug">
              <span className="text-green-700 shrink-0 mt-0.5">✓</span> {ef}
            </li>
          ))}
        </ul>
        {isRecommended && (
          <p className="mt-2 pt-2 border-t border-[#a0b0a0]/40 text-[9px] italic font-bold text-slate-600 leading-snug">
            {advice.justificacion}
          </p>
        )}
      </div>
    );
  };

  return (
    <CharacterDialog
      nombre={staffName}
      cargo={cargoMostrado}
      iniciales={iniciales}
      clubColor={clubPrimary}
      onClose={close}
      footer={phase === 'closing' ? null : (localPhase === 'lineup' ? (
        <>
          <FMButton variant="primary" onClick={handleAceptarOnce} className="px-6 py-2.5 text-[10px]">
            Aceptar once
          </FMButton>
          {onStartMatch ? (
            <FMButton variant="secondary" onClick={handleAceptarYPartido} className="px-6 py-2.5 text-[10px]">
              Aceptar e ir al partido
            </FMButton>
          ) : (
            <FMButton variant="secondary" onClick={handleVolverConsejo} className="px-6 py-2.5 text-[10px]">
              Volver al consejo
            </FMButton>
          )}
        </>
      ) : localPhase === 'recommendation' ? (
        <div className="flex flex-wrap items-center justify-center gap-2 w-full">
          <FMButton variant="primary" onClick={handleAcceptRecommendation} className="px-4 py-2 text-[10px]">
            Sí, vamos con esa
          </FMButton>
          <FMButton variant="secondary" onClick={handleCompleteElevenWithCurrentTactic} className="px-4 py-2 text-[10px]">
            Completar 11 con mi táctica
          </FMButton>
          <FMButton variant="secondary" onClick={handleShowAlternatives} className="px-4 py-2 text-[10px]">
            No, probemos otra
          </FMButton>
        </div>
      ) : (
        <>
          <FMButton variant="primary" onClick={handleSelectAlternative} disabled={!selectedAlt} className="px-6 py-2.5 text-[10px]">
            Confirmar
          </FMButton>
          <FMButton variant="secondary" onClick={handleVolverConsejo} className="px-6 py-2.5 text-[10px]">
            Volver
          </FMButton>
        </>
      ))}
      quickReplies={undefined}
    >
      {phase === 'closing' ? (
        <div className="space-y-4 pt-2 animate-fade-up">
          <SpeechBubble texto={useDialogueStore.getState().closingPhrase || ''} />
          <p className="text-[9px] italic font-bold text-slate-500 uppercase tracking-widest px-1">
            Los cambios quedaron aplicados al plan táctico del plantel.
          </p>
        </div>
      ) : localPhase === 'recommendation' ? (
        <div className="space-y-4">
          <SpeechBubble
            texto={advice.textoPrincipal}
            subtitulo="Informe basado en el estado de ambos planteles"
          />
          {advice.formacionNombre && (
            <div className="bg-[#3a4a3a] text-white p-3 rounded-sm flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Formación Recomendada</span>
                <p className="text-sm font-black uppercase">{advice.formacionNombre}</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Estilo Recomendado</p>
            {renderArchetypeCard(advice.recomendacion, true, true)}
          </div>
        </div>
      ) : localPhase === 'alternatives' ? (
        <div className="space-y-4">
          <SpeechBubble
            texto="Entiendo. Tenemos otras dos opciones sobre la mesa. Elegí con cuál seguimos."
            subtitulo="Alternativas disponibles"
          />
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Otras Opciones</p>
            <div className="flex flex-col sm:flex-row gap-3">
              {alternativeOptions.map(op => (
                <div
                  key={op.id}
                  onClick={() => setSelectedAlt(op.id)}
                  className={`flex-1 cursor-pointer transition-all ${
                    selectedAlt === op.id ? 'ring-2 ring-[#3a4a3a] shadow-md' : ''
                  }`}
                >
                  {renderArchetypeCard(op.id, false, selectedAlt === op.id)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <SpeechBubble
            texto={lineup.textoPaso2}
            subtitulo={lineup.resumen}
          />
          <LineupPitch
            clubId={club.id}
            clubColor={clubPrimary}
            xi={lineup.xi}
            banquillo={lineup.banquillo}
          />
        </div>
      )}
    </CharacterDialog>
  );
};
