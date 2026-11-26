
import React, { useState } from 'react';
import { Staff, Club, SquadType, STAFF_ATTRIBUTE_LABELS } from '../types';
import { world } from '../services/worldManager';
import { notifyClubs, useWorldStore } from '../stores/worldStore';
import { useGameStore } from '../stores/gameStore';
import { openClubSquad, useUIStore } from '../stores/uiStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { getAttributeColor } from '../constants';
import { getFlagUrl } from '../data/static';
import { ArrowLeft, Activity, History, Wallet, BookOpen, Trophy, Star, Shield, Zap, Swords, MapPin, Users, ClipboardList, Dumbbell, Mic, MessageCircle, GraduationCap, Binoculars, HeartPulse, Trash2 } from 'lucide-react';
import { FMBox, FMTable, FMTableCell, FMButton } from './FMUI';

const TACTICAL_STYLE_LABELS: Record<string, string> = {
  CONTROL: 'Control',
  ATTACK: 'Ataque',
  DEFENSE: 'Defensa',
  COUNTER: 'Contraataque',
  BALANCED: 'Equilibrado',
};

const PRESS_LABELS: Record<string, string> = {
  LOW: 'Presión baja',
  MEDIUM: 'Presión media',
  HIGH: 'Presión alta',
};

const POSSESSION_LABELS: Record<string, string> = {
  POSSESSION: 'Posesión',
  COUNTER: 'Contraataque',
  BALANCED: 'Equilibrado',
};

const PERSONALITY_LABELS: Record<string, string> = {
  VISIONARY: 'Visionario',
  CALM: 'Calmado',
  PASSIONATE: 'Pasional',
  DISCIPLINARIAN: 'Disciplinado',
  LEADER: 'Líder',
};

const getRoleShort = (role: string) => {
  switch(role) {
    case 'HEAD_COACH': return 'DT';
    case 'ASSISTANT_MANAGER': return 'AYDT';
    case 'COACH': return 'ENT';
    case 'PHYSIO': return 'FISIO';
    case 'FITNESS_COACH': return 'PF';
    case 'RESERVE_MANAGER': return 'RESERVA';
    case 'YOUTH_MANAGER': return 'SUB-20';
    case 'SCOUT': return 'OJEADOR';
    case 'SPORTING_DIRECTOR': return 'DD';
    case 'TREASURER': return 'TES';
    default: return role;
  }
};

function hashStaffSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant(options: string[], seed: number, salt: number): string {
  return options[(seed + salt * 7919) % options.length];
}

export function generateStaffProfileText(staff: Staff): string {
  const seed = hashStaffSeed(`${staff.id}|${staff.name}|${staff.role}`);
  const attrs = staff.attributes;

  if (staff.biography) {
    const extra: string[] = [staff.biography.trim()];
    if (staff.preferredFormation && !staff.biography.includes(staff.preferredFormation)) {
      extra.push(`Suele estructurar a sus equipos en torno al ${staff.preferredFormation}.`);
    }
    if (staff.playingStyle && !staff.biography.toLowerCase().includes(staff.playingStyle.toLowerCase())) {
      extra.push(`En la pizarra prioriza ${staff.playingStyle.toLowerCase()}.`);
    }
    return extra.join(' ');
  }

  const parts: string[] = [];

  // 1. Apertura según rol, edad y trayectoria
  const expTier = staff.age >= 56 ? 'VETERAN' : staff.age >= 40 ? 'PRIME' : 'YOUNG';
  const roleOpenings: Record<string, Record<'YOUNG' | 'PRIME' | 'VETERAN', string[]>> = {
    HEAD_COACH: {
      YOUNG: [
        `Técnico de nueva generación (${staff.age} años), metódico en la preparación semanal y muy cercano al análisis moderno.`,
        `Entrenador joven con ambición táctica, acostumbrado a exprimir el rendimiento diario en el campo de entrenamiento.`,
      ],
      PRIME: [
        `Director técnico en plena madurez profesional, con criterio firme para conducir proyectos competitivos.`,
        `Entrenador experimentado de perfil completo, capaz de sostener la exigencia de un vestuario profesional.`,
      ],
      VETERAN: [
        `Estratega curtido en mil batallas (${staff.age} años), cuya lectura de contextos adversos marca diferencias en momentos límite.`,
        `Técnico de amplia trayectoria y pulso sereno, acostumbrado a gestionar planteles con jerarquía.`,
      ],
    },
    ASSISTANT_MANAGER: {
      YOUNG: [
        `Segundo entrenador dinámico, atento a las métricas diarias y al ajuste fino durante los noventa minutos.`,
        `Asistente técnico de perfil moderno, muy activo en la coordinación de sesiones y análisis rival.`,
      ],
      PRIME: [
        `Mano derecha confiable para el cuerpo técnico, equilibrado entre la pizarra y el trato cotidiano con el plantel.`,
        `Segundo entrenador con sólido oficio, clave para detectar desajustes en pleno partido.`,
      ],
      VETERAN: [
        `Asistente veterano de consejo valioso, experto en detectar detalles silenciosos en el vestuario y el campo.`,
        `Segundo entrenador de larga escuela, aporta templanza y experiencia práctica al día a día.`,
      ],
    },
    COACH: {
      YOUNG: [
        `Entrenador de campo enérgico y metódico, ideal para potenciar rutinas técnicas y tácticas en distintos planteles.`,
        `Preparador joven acostumbrado a trabajar en grupos reducidos y acelerar el aprendizaje individual.`,
      ],
      PRIME: [
        `Entrenador polivalente de sólido criterio pedagógico, capaz de colaborar indistintamente con Primera, Reserva o juveniles.`,
        `Colaborador técnico experimentado, aporta precisión diaria en la ejecución de cada sesión semanal.`,
      ],
      VETERAN: [
        `Maestro de campo con décadas de oficio, muy valorado por futbolistas jóvenes y consagrados para pulir detalles.`,
        `Entrenador veterano de mirada experta para corregir movimientos y hábitos competitivos.`,
      ],
    },
    PHYSIO: {
      YOUNG: [
        `Especialista en recuperación deportiva actualizado en protocolos preventivos y readaptación muscular.`,
        `Fisioterapeuta minucioso, enfocado en reducir recaídas y acortar plazos sin arriesgar la salud del futbolista.`,
      ],
      PRIME: [
        `Profesional sanitario de criterio seguro, acostumbrado a gestionar cargas críticas en calendarios exigentes.`,
        `Fisioterapeuta metódico cuyo trabajo silencioso sostiene la disponibilidad física del plantel.`,
      ],
      VETERAN: [
        `Eminencia médica de amplia experiencia clínica, muy respetado por los futbolistas en procesos largos de rehabilitación.`,
        `Fisioterapeuta veterano con enorme ojo diagnóstico para distinguir molestias pasajeras de lesiones serias.`,
      ],
    },
    FITNESS_COACH: {
      YOUNG: [
        `Preparador físico innovador, diseña microciclos intensos y controlados para sostener el ritmo hasta el minuto noventa.`,
        `Especialista en acondicionamiento moderno, obsesionado con la explosividad y la prevención de fatiga acumulada.`,
      ],
      PRIME: [
        `Preparador físico de gran solvencia, sabe dosificar picos de forma para llegar entero a las fases decisivas.`,
        `Encargado de la puesta a punto atlética con equilibrio entre fuerza, resistencia y recuperación.`,
      ],
      VETERAN: [
        `Preparador físico de amplia escuela, domina la gestión del desgaste en planteles sometidos a doble competencia.`,
        `Profesional veterano de la preparación atlética, reconocido por mantener equipos intensos durante toda la temporada.`,
      ],
    },
    SCOUT: {
      YOUNG: [
        `Ojeador incansable con buena red de contactos y gran predisposición para viajar en busca de oportunidades de mercado.`,
        `Cazatalentos de mirada fresca, atento tanto al rendimiento inmediato como a las joyas sub-20.`,
      ],
      PRIME: [
        `Ojeador analítico y riguroso, elabora informes detallados que distinguen al buen proyecto del jugador sobrevalorado.`,
        `Especialista en seguimiento de mercados, combina observación en vivo con evaluación fría del potencial.`,
      ],
      VETERAN: [
        `Ojeador de vasta experiencia internacional, capaz de intuir carácter competitivo más allá de las estadísticas.`,
        `Histórico detector de talento con olfato afinado tras años recorriendo canchas y torneos juveniles.`,
      ],
    },
    SPORTING_DIRECTOR: {
      YOUNG: [
        `Director deportivo ágil en las negociaciones, inclinado a planificar planteles sostenibles y con margen de revalorización.`,
        `Ejecutivo futbolístico de perfil moderno, activo en el diseño de mercado y coordinación con la secretaría técnica.`,
      ],
      PRIME: [
        `Director deportivo pragmático y firme en la mesa de negociación, enfocado en equilibrar jerarquía y presupuesto.`,
        `Gestor deportivo con visión integral del club, conecta las necesidades del cuerpo técnico con la realidad financiera.`,
      ],
      VETERAN: [
        `Director deportivo de enorme peso institucional y agenda extensa, acostumbrado a cerrar operaciones complejas.`,
        `Ejecutivo experimentado en ingeniería de planteles, aporta calma estratégica en cada ventana de fichajes.`,
      ],
    },
    RESERVE_MANAGER: {
      YOUNG: [
        `Formador ambicioso al frente del equipo Reserva, preocupado por replicar las exigencias tácticas del primer equipo.`,
        `Técnico joven para el segundo equipo, muy atento a recuperar ritmo competitivo de suplentes y juveniles avanzados.`,
      ],
      PRIME: [
        `Entrenador de Reserva metódico, prepara al futbolista para dar el salto definitivo sin sobresaltos.`,
        `Conductor sólido del plantel satélite, equilibra resultados formativos con la puesta a punto de cada pieza.`,
      ],
      VETERAN: [
        `Maestro de transición entre inferiores y Primera, experto en pulir detalles madurativos antes del debut.`,
        `Técnico experimentado para la Reserva, sabe exigir profesionalismo en cada entrenamiento.`,
      ],
    },
    YOUTH_MANAGER: {
      YOUNG: [
        `Formador entusiasta del Sub-20, paciente en la corrección técnica y cercano a la evolución de las promesas.`,
        `Técnico juvenil con sensibilidad pedagógica para potenciar virtudes naturales sin quemar etapas.`,
      ],
      PRIME: [
        `Especialista en fútbol base con criterio claro para detectar quién está listo para competir arriba.`,
        `Entrenador juvenil organizado, inculca hábitos tácticos sólidos desde categorías formativas.`,
      ],
      VETERAN: [
        `Formador histórico de cantera, moldeó generaciones enteras combinando docencia, carácter y sentido de pertenencia.`,
        `Referente en divisiones juveniles, su ojo clínico suele anticipar qué chicos llegarán al primer equipo.`,
      ],
    },
    TREASURER: {
      YOUNG: [
        `Tesorero analítico y detallista, mantiene bajo lupa los flujos de caja y topes salariales del club.`,
        `Especialista financiero joven, enfocado en optimizar ingresos comerciales y evitar desvíos presupuestarios.`,
      ],
      PRIME: [
        `Tesorero riguroso y previsor, garantiza estabilidad contable incluso en mercados turbulentos.`,
        `Gestor económico confiable que traduce cada decisión deportiva en impacto real sobre las arcas.`,
      ],
      VETERAN: [
        `Contador experimentado en finanzas futbolísticas, experto en blindar la tesorería en épocas de austeridad.`,
        `Tesorero de larga trayectoria, prioriza la salud patrimonial del club por encima de apuestas temerarias.`,
      ],
    },
  };

  const rolePool = (roleOpenings[staff.role] || roleOpenings.HEAD_COACH)[expTier];
  parts.push(pickVariant(rolePool, seed, 1));

  // 2. Fortalezas derivadas de los mejores atributos reales del empleado
  const rankedAttrs = [
    { key: 'coaching', val: attrs.coaching || 0 },
    { key: 'tacticalKnowledge', val: attrs.tacticalKnowledge || 0 },
    { key: 'manManagement', val: attrs.manManagement || 0 },
    { key: 'motivation', val: attrs.motivation || 0 },
    { key: 'judgingAbility', val: attrs.judgingAbility || 0 },
    { key: 'judgingPotential', val: attrs.judgingPotential || 0 },
    { key: 'adaptability', val: attrs.adaptability || 0 },
    { key: 'medical', val: attrs.medical || 0 },
    { key: 'physiotherapy', val: attrs.physiotherapy || 0 },
  ].sort((a, b) => b.val - a.val);

  const attrHighlights: Record<string, { high: string[]; mid: string[] }> = {
    coaching: {
      high: ['Brilla en la conducción de prácticas y en la mejora individual de sus dirigidos.', 'Sus sesiones de campo destacan por la precisión pedagógica y la intensidad.'],
      mid: ['Cumple con solvencia en la rutina semanal de entrenamientos.'],
    },
    tacticalKnowledge: {
      high: ['Posee una lectura táctica sobresaliente para ajustar marcas y espacios.', 'Prepara cada plan de partido con estudio exhaustivo de las debilidades ajenas.'],
      mid: ['Maneja conceptos tácticos ordenados y coherentes.'],
    },
    manManagement: {
      high: ['Sobresale en el manejo del vestuario, desactivando tensiones antes de que escalen.', 'Sabe exactamente qué botón tocar con cada futbolista según su carácter.'],
      mid: ['Mantiene un trato correcto y ordenado con el grupo.'],
    },
    motivation: {
      high: ['Es un motivador nato capaz de levantar equipos golpeados en charlas clave.', 'Contagia convicción competitiva incluso en las semanas de mayor presión.'],
      mid: ['Logra sostener la concentración competitiva en los momentos importantes.'],
    },
    judgingAbility: {
      high: ['Tiene ojo clínico para valorar el nivel real e inmediato de cualquier futbolista.', 'Rara vez se equivoca al diagnosticar si un jugador rinde hoy para el club.'],
      mid: ['Evalúa con criterio equilibrado el presente de los futbolistas observados.'],
    },
    judgingPotential: {
      high: ['Detecta techos de crecimiento con enorme antelación, ideal para proyectar refuerzos y canteranos.', 'Su lectura sobre el margen de progresión juvenil es uno de sus mayores activos.'],
      mid: ['Aporta estimaciones razonables sobre la proyección de jugadores jóvenes.'],
    },
    adaptability: {
      high: ['Se amolda con naturalidad a ligas, culturas y escenarios cambiantes.', 'Reacciona con flexibilidad cuando el contexto institucional o deportivo se modifica.'],
      mid: ['Se integra sin fricciones a distintas dinámicas de trabajo.'],
    },
    medical: {
      high: ['Su criterio médico inspira absoluta confianza en diagnósticos complejos.', 'Domina la prevención clínica y el seguimiento integral de la salud del plantel.'],
      mid: ['Ofrece respaldo sanitario sólido en el control cotidiano.'],
    },
    physiotherapy: {
      high: ['Acelera readaptaciones musculares minimizando riesgos de recaída.', 'Su trabajo en camilla y gimnasio resulta diferencial para recuperar titulares a tiempo.'],
      mid: ['Acompaña con eficacia los procesos habituales de recuperación física.'],
    },
  };

  const primaryAttr = rankedAttrs[0];
  const secondaryAttr = rankedAttrs[1];
  const pPool = attrHighlights[primaryAttr.key];
  if (pPool) {
    parts.push(
      primaryAttr.val >= 14
        ? pickVariant(pPool.high, seed, 2)
        : pickVariant(pPool.mid, seed, 2)
    );
  }
  if (secondaryAttr && secondaryAttr.val >= 13 && attrHighlights[secondaryAttr.key]) {
    parts.push(pickVariant(attrHighlights[secondaryAttr.key].high, seed, 3));
  } else if (primaryAttr.val <= 9) {
    parts.push(
      pickVariant(
        [
          'Trabajador discreto y funcional que prioriza no complicar las rutinas simples del puesto.',
          'Perfil terrenal y pragmático, aporta orden básico sin alardes.',
        ],
        seed,
        3
      )
    );
  }

  // 3. Rasgo táctico o de identidad de juego (cuando aplica)
  const tacticFragments: string[] = [];
  if (staff.preferredFormation) {
    tacticFragments.push(`prefiere partir desde un ${staff.preferredFormation}`);
  }
  if (staff.tacticalStyle) {
    const styleDesc: Record<string, string> = {
      CONTROL: 'apuesta por controlar los ritmos desde la tenencia',
      POSSESSION: 'apuesta por controlar los ritmos desde la tenencia',
      ATTACK: 'busca protagonismo ofensivo y volumen en campo contrario',
      ATTACKING: 'busca protagonismo ofensivo y volumen en campo contrario',
      DEFENSE: 'prioriza el bloque compacto y la solidez sin balón',
      DEFENSIVE: 'prioriza el bloque compacto y la solidez sin balón',
      COUNTER: 'explota transiciones veloces a la espalda rival',
      BALANCED: 'alterna prudencia y ambición según el trámite',
    };
    const fallbackLabel = TACTICAL_STYLE_LABELS[staff.tacticalStyle] || POSSESSION_LABELS[staff.tacticalStyle];
    tacticFragments.push(styleDesc[staff.tacticalStyle] || (fallbackLabel ? `adopta una postura de ${fallbackLabel.toLowerCase()}` : 'ajusta su plan según el rival'));
  }
  if (staff.pressIntensity === 'HIGH') {
    tacticFragments.push('suele exigir presión alta tras pérdida');
  } else if (staff.pressIntensity === 'LOW') {
    tacticFragments.push('opta por replegar y cerrar carriles interiores');
  }
  if (tacticFragments.length > 0) {
    const joined = tacticFragments.join(', ');
    parts.push(`En lo futbolístico, ${joined}.`);
  } else if (staff.playingStyle) {
    parts.push(`Su sello operativo se resume en: ${staff.playingStyle}.`);
  }

  // 4. Carácter / personalidad / palmarés
  if (staff.personality) {
    const persona = PERSONALITY_LABELS[staff.personality] || staff.personality;
    const flourishByPersona: Record<string, string[]> = {
      VISIONARY: [
        `De perfil ${persona.toLowerCase()}, suele mirar dos pasos adelante e introducir matices poco convencionales.`,
        `Su carácter ${persona.toLowerCase()} lo impulsa a probar soluciones creativas en lugar de repetir recetas.`,
      ],
      CALM: [
        `Su temple ${persona.toLowerCase()} transmite serenidad en semanas turbulentas y partidos cerrados.`,
        `De trato ${persona.toLowerCase()}, rara vez pierde la compostura frente a la presión externa.`,
      ],
      PASSIONATE: [
        `Con temperamento ${persona.toLowerCase()}, vive cada jornada al borde del campo y exige entrega total.`,
        `Su espíritu ${persona.toLowerCase()} suele encender rápido el compromiso emocional del plantel.`,
      ],
      DISCIPLINARIAN: [
        `Fiel a una ética ${persona.toLowerCase()}, no negocia el orden, la puntualidad ni el rigor táctico.`,
        `De corte ${persona.toLowerCase()}, marca reglas claras desde el primer entrenamiento.`,
      ],
      LEADER: [
        `Ejerce un perfil ${persona.toLowerCase()} natural que ordena jerarquías y genera respeto inmediato.`,
        `Su condición de ${persona.toLowerCase()} lo convierte en referencia natural para jugadores y dirigentes.`,
      ],
    };
    const pool = flourishByPersona[staff.personality];
    parts.push(pool ? pickVariant(pool, seed, 4) : `Muestra un temperamento ${persona.toLowerCase()} en el trabajo diario.`);
  }

  if (staff.careerHonours && staff.careerHonours.length > 0) {
    parts.push(`Llega respaldado por ${staff.careerHonours.length} título${staff.careerHonours.length > 1 ? 's' : ''} en su trayectoria (${staff.careerHonours[0]}).`);
  } else if (staff.previousClubs && staff.previousClubs.length > 0) {
    const prevClub = staff.previousClubs[0] as any;
    const prevName = typeof prevClub === 'string' ? prevClub : prevClub?.clubName;
    if (prevName) {
      parts.push(`Acumula recorrido previo en instituciones como ${prevName}.`);
    }
  }

  return parts.join(' ');
}

interface StaffViewProps {
  staff: Staff[];
  club?: Club;
  isOwnClub?: boolean;
}

export const StaffView: React.FC<StaffViewProps> = ({ staff: staffProp, club, isOwnClub }) => {
  const { selectedStaff, setSelectedStaff, userClub } = useUIStore();
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'DELEGACION'>('PERSONAL');
  const [confirmFireId, setConfirmFireId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const clubs = useWorldStore(s => s.clubs);
  useWorldStore(s => s._tick);
  const currentDate = useGameStore(s => s.currentDate);
  const liveClub = clubs.find(c => c.id === club?.id) || club;
  const resolvedIsOwnClub = isOwnClub ?? (!liveClub || !userClub || liveClub.id === userClub.id);

  // Ensure existing saves also get a Treasurer in the club staff
  if (liveClub && resolvedIsOwnClub) {
    world.ensureClubTreasurer(liveClub.id);
  }
  const staff = liveClub ? world.getStaffByClub(liveClub.id) : staffProp;
  const staffBudget = liveClub && resolvedIsOwnClub ? world.getClubStaffBudgetStatus(liveClub.id) : null;

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'HEAD_COACH': return 'Director Técnico';
      case 'ASSISTANT_MANAGER': return 'Segundo Entrenador';
      case 'COACH': return 'Entrenador';
      case 'PHYSIO': return 'Fisioterapeuta';
      case 'FITNESS_COACH': return 'Preparador Físico';
      case 'RESERVE_MANAGER': return 'E. Reserva';
      case 'YOUTH_MANAGER': return 'E. Juveniles';
      case 'SCOUT': return 'Ojeador';
      case 'SPORTING_DIRECTOR': return 'Director Deportivo';
      case 'TREASURER': return 'Tesorero';
      default: return role;
    }
  };

  // Sort staff to show Head Coach first
  const sortedStaff = [...staff].sort((a, b) => {
     if (a.role === 'HEAD_COACH') return -1;
     if (b.role === 'HEAD_COACH') return 1;
     return 0;
  });

  const headCoach = staff.find(s => s.role === 'HEAD_COACH');

  const DELEGABLE_TASKS: { key: 'trainingDelegatedTo' | 'pressDelegatedTo' | 'talksDelegatedTo' | 'reserveDelegatedTo' | 'u20DelegatedTo' | 'scoutingDelegatedTo' | 'financeDelegatedTo'; label: string; icon: React.ReactNode; suggestedRoles: string[] }[] = [
    { key: 'trainingDelegatedTo', label: 'Entrenamiento', icon: <Dumbbell size={12} />, suggestedRoles: ['COACH', 'FITNESS_COACH', 'ASSISTANT_MANAGER'] },
    { key: 'pressDelegatedTo', label: 'Prensa', icon: <Mic size={12} />, suggestedRoles: ['ASSISTANT_MANAGER', 'SPORTING_DIRECTOR'] },
    { key: 'talksDelegatedTo', label: 'Charlas', icon: <MessageCircle size={12} />, suggestedRoles: ['ASSISTANT_MANAGER', 'COACH'] },
    { key: 'reserveDelegatedTo', label: 'Reserva', icon: <Users size={12} />, suggestedRoles: ['RESERVE_MANAGER', 'COACH', 'ASSISTANT_MANAGER'] },
    { key: 'u20DelegatedTo', label: 'Sub-20', icon: <GraduationCap size={12} />, suggestedRoles: ['YOUTH_MANAGER', 'COACH', 'ASSISTANT_MANAGER'] },
    { key: 'scoutingDelegatedTo', label: 'Scouting', icon: <Binoculars size={12} />, suggestedRoles: ['SCOUT', 'SPORTING_DIRECTOR', 'ASSISTANT_MANAGER'] },
    { key: 'financeDelegatedTo', label: 'Finanzas', icon: <Wallet size={12} />, suggestedRoles: ['TREASURER', 'SPORTING_DIRECTOR'] },
  ];

  const setDelegation = (key: string, staffId: string | undefined) => {
    if (!liveClub) return;
    if (staffId && staffId !== headCoach?.id) liveClub[key as 'trainingDelegatedTo'] = staffId;
    else delete liveClub[key as 'trainingDelegatedTo'];
    notifyClubs();
  };

  const delegateAllRecommended = () => {
    if (!liveClub) return;
    DELEGABLE_TASKS.forEach(task => {
      const best = staff.find(s => s.role !== 'HEAD_COACH' && task.suggestedRoles.includes(s.role));
      if (best) liveClub[task.key] = best.id;
    });
    notifyClubs();
  };

  const takeAllControl = () => {
    if (!liveClub) return;
    DELEGABLE_TASKS.forEach(task => {
      delete liveClub[task.key];
    });
    notifyClubs();
  };

  const getDelegationBadges = (s: Staff) => {
    if (!liveClub) return [];
    return [
      liveClub.trainingDelegatedTo === s.id && 'Entreno',
      liveClub.pressDelegatedTo === s.id && 'Prensa',
      liveClub.talksDelegatedTo === s.id && 'Charlas',
      liveClub.reserveDelegatedTo === s.id && 'Reserva',
      liveClub.u20DelegatedTo === s.id && 'Sub-20',
      liveClub.scoutingDelegatedTo === s.id && 'Scouting',
      liveClub.financeDelegatedTo === s.id && 'Finanzas',
    ].filter(Boolean) as string[];
  };

  const renderDelegationTab = () => (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
      {!liveClub ? (
        <div className="p-8 text-center text-slate-500 font-black uppercase text-[10px]">Selecciona un club para gestionar delegaciones</div>
      ) : (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 bg-[#e8ece8] border border-[#a0b0a0] rounded-sm px-2.5 py-1.5">
            <span className="text-[9px] font-black uppercase text-slate-700 truncate">Elegí quién se ocupa de cada área</span>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={delegateAllRecommended}
                className="px-2 py-1 text-[8px] font-black uppercase rounded-[2px] bg-[#2b5d2c] text-white border border-[#133014] cursor-pointer"
              >
                Delegar Todo
              </button>
              <button
                type="button"
                onClick={takeAllControl}
                className="px-2 py-1 text-[8px] font-black uppercase rounded-[2px] bg-white text-slate-700 border border-[#8e9b90] cursor-pointer"
              >
                Todo Yo
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1.5 content-start overflow-y-auto custom-scroll">
            {DELEGABLE_TASKS.map(task => {
              const rawDelegatedId = liveClub[task.key] || '';
              const delegatedId = rawDelegatedId === headCoach?.id ? '' : rawDelegatedId;
              const candidates = staff.filter(s => s.role !== 'HEAD_COACH' && task.suggestedRoles.includes(s.role));
              return (
                <div key={task.key} className="bg-white border border-[#a0b0a0] rounded-sm px-2.5 py-1.5 flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-sm flex items-center justify-center shrink-0 border ${delegatedId ? 'bg-green-100 border-green-400 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                      {task.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase text-slate-900 truncate leading-tight">{task.label}</div>
                      <div className={`text-[7.5px] font-bold uppercase ${delegatedId ? 'text-green-700' : 'text-amber-700'}`}>
                        {delegatedId ? 'Delegada' : 'A tu cargo'}
                      </div>
                    </div>
                  </div>
                  <select
                    value={delegatedId}
                    onChange={(e) => setDelegation(task.key, e.target.value || undefined)}
                    aria-label={`Responsable de ${task.label}`}
                    className="max-w-[165px] sm:max-w-[205px] bg-gradient-to-b from-[#f3f4f6] to-[#d4d8de] border border-[#737a82] rounded-[2px] px-1.5 py-1 text-[9px] font-black uppercase text-[#1f2428] outline-none cursor-pointer"
                  >
                    <option value="">{headCoach ? `Tú (${headCoach.name} · DT)` : 'Tú (DT)'}</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({getRoleShort(c.role)})</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  if (selectedStaff) {
    const liveSelected = staff.find(s => s.id === selectedStaff.id) || selectedStaff;
    const badges = resolvedIsOwnClub ? getDelegationBadges(liveSelected) : [];
    const assignedSquads = world.getEffectiveStaffSquads(liveSelected);
    const canCoach = resolvedIsOwnClub && world.isCoachingRole(liveSelected.role) && liveClub && liveSelected.clubId === liveClub.id;
    const canFire = resolvedIsOwnClub && liveClub && liveSelected.clubId === liveClub.id && liveSelected.role !== 'HEAD_COACH';

    const openStaffChat = (memberId: string) => {
      useDialogueStore.getState().open('STAFF_DIALOG', {
        clubId: userClub?.id || liveClub?.id || '',
        staffId: memberId,
        source: resolvedIsOwnClub ? 'STAFF' : 'EXTERNAL_CLUB',
      });
    };

    const handleToggleSquad = (sq: SquadType) => {
      if (!liveClub) return;
      const res = world.toggleStaffSquadAssignment(liveClub.id, liveSelected.id, sq);
      setActionNotice(res.ok ? null : res.message);
      useWorldStore.getState().notify({ staff: true });
    };

    const handleFire = () => {
      if (!liveClub) return;
      const res = world.fireStaffMember(liveClub.id, liveSelected.id, currentDate);
      if (res.ok) {
        setConfirmFireId(null);
        setActionNotice(null);
        setSelectedStaff(null);
        notifyClubs();
        useWorldStore.getState().notify({ staff: true, clubs: true });
      } else {
        setActionNotice(res.message);
      }
    };

    return (
      <div className="p-2 md:p-3 h-full flex flex-col gap-2 bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-2.5 py-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => { setConfirmFireId(null); setActionNotice(null); setSelectedStaff(null); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border border-[#5f666e] text-[10px] font-black uppercase text-[#1f2428] cursor-pointer active:translate-y-px"
            style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 50%, #b9bfc6 100%)' }}
          >
            <ArrowLeft size={12} /> Cuerpo Técnico
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <img
              src={getFlagUrl(liveSelected.nationality)}
              alt={liveSelected.nationality}
              className="w-4 h-3 object-cover rounded-[1px] border border-slate-400 shrink-0"
            />
            <span className="text-[9.5px] font-black uppercase text-slate-700 truncate">
              {liveSelected.name} · {getRoleLabel(liveSelected.role)} · {liveSelected.age} años
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <FMButton
              onClick={() => openStaffChat(liveSelected.id)}
              className="shrink-0 px-2.5 py-1 text-[9px]"
            >
              <MessageCircle size={11} /> Charlar
            </FMButton>
            {resolvedIsOwnClub && liveSelected.role === 'FITNESS_COACH' && liveClub && (
              <FMButton
                variant="secondary"
                onClick={() => useDialogueStore.getState().open('FITNESS', { clubId: liveClub.id, source: 'STAFF' })}
                className="shrink-0 px-2.5 py-1 text-[9px]"
              >
                <HeartPulse size={11} /> Plan físico
              </FMButton>
            )}
            {canFire && (
              confirmFireId === liveSelected.id ? (
                <div className="flex items-center gap-1 bg-red-50 border border-red-300 rounded-sm px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={handleFire}
                    className="px-2 py-0.5 bg-red-700 text-white rounded-[2px] text-[8.5px] font-black uppercase cursor-pointer"
                  >
                    Confirmar baja
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmFireId(null)}
                    className="px-1.5 py-0.5 bg-white border border-slate-300 text-slate-700 rounded-[2px] text-[8.5px] font-black uppercase cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmFireId(liveSelected.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 text-[9px] font-black uppercase cursor-pointer"
                >
                  <Trash2 size={11} /> Rescindir
                </button>
              )
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll space-y-2.5 pr-0.5">
          {actionNotice && (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-sm px-2.5 py-1.5 text-[10px] font-bold">
              {actionNotice}
            </div>
          )}

          {canCoach && (
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[9.5px] font-black uppercase text-slate-700">Colaboración en Entrenamientos</div>
                <div className="text-[9px] text-slate-500">Elegí en qué planteles trabaja este integrante para potenciar el desarrollo.</div>
              </div>
              <div className="flex gap-1.5">
                {([
                  ['SENIOR', 'Primera'],
                  ['RESERVE', 'Reserva'],
                  ['U20', 'Sub-20'],
                ] as const).map(([sq, label]) => {
                  const active = assignedSquads.includes(sq);
                  return (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => handleToggleSquad(sq)}
                      className={`px-2.5 py-1 rounded-[2px] border text-[9px] font-black uppercase cursor-pointer transition-all ${
                        active
                          ? 'bg-[#2b5d2c] border-[#133014] text-white shadow-xs'
                          : 'bg-[#f4f7f4] border-[#8e9b90] text-slate-700 hover:bg-[#e0e8e0]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resumen rápido + Delegaciones */}
          <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 sm:p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
              <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen size={12} /> Perfil Profesional
              </h4>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {badges.map(b => (
                    <span key={b} className="px-1.5 py-0.5 bg-green-100 border border-green-400 rounded-[2px] text-green-800 text-[7.5px] font-black uppercase">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-700 leading-relaxed">
              {generateStaffProfileText(liveSelected)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Atributos Clave */}
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 sm:p-3 shadow-xs">
              <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                <Activity size={12} /> Atributos Clave
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-x-4">
                {Object.entries(liveSelected.attributes).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600 font-bold text-[10px] uppercase tracking-tight">
                      {STAFF_ATTRIBUTE_LABELS[key] || key}
                    </span>
                    <span className={`font-black text-[11px] ${getAttributeColor(val as number)} bg-slate-50 px-1.5 py-0.5 rounded-sm min-w-[24px] text-center font-mono`}>
                      {val as number}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: Contrato, Reputación, Perfil Táctico e Historial */}
            <div className="space-y-2.5">
              {/* Contrato y Reputación */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs space-y-1.5">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Wallet size={11} /> Contrato
                  </h4>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Sueldo</span>
                    <span className="text-slate-900 font-black text-[11px] font-mono">£{liveSelected.salary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Expira</span>
                    <span className="text-slate-900 font-black text-[10px] font-mono">
                      {liveSelected.contractExpiry ? liveSelected.contractExpiry.toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs space-y-1.5">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Star size={11} /> Reputación
                  </h4>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Nacional</span>
                    <span className="text-slate-900 font-black text-[11px] font-mono">{liveSelected.reputation ?? 50}/100</span>
                  </div>
                  {liveSelected.boardRelationship != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Directiva</span>
                      <span className="text-slate-900 font-black text-[11px] font-mono">{liveSelected.boardRelationship}/100</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Perfil Táctico */}
              {(liveSelected.preferredFormation || liveSelected.tacticalStyle || liveSelected.pressIntensity || liveSelected.possessionVsCounter) && (
                <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs">
                  <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 border-b border-slate-200 pb-1">
                    <Shield size={12} /> Perfil Táctico
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {liveSelected.preferredFormation && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Formación</span>
                        <span className="text-[11px] text-slate-900 font-black">{liveSelected.preferredFormation}</span>
                      </div>
                    )}
                    {liveSelected.tacticalStyle && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-0.5"><Swords size={10} /> Estilo</span>
                        <span className="text-[11px] text-slate-900 font-black">{TACTICAL_STYLE_LABELS[liveSelected.tacticalStyle] || liveSelected.tacticalStyle}</span>
                      </div>
                    )}
                    {liveSelected.pressIntensity && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-0.5"><Zap size={10} /> Presión</span>
                        <span className="text-[11px] text-slate-900 font-black">{PRESS_LABELS[liveSelected.pressIntensity] || liveSelected.pressIntensity}</span>
                      </div>
                    )}
                    {liveSelected.possessionVsCounter && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Enfoque</span>
                        <span className="text-[11px] text-slate-900 font-black">{POSSESSION_LABELS[liveSelected.possessionVsCounter] || liveSelected.possessionVsCounter}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Historial */}
              {(() => {
                world.ensureStaffPastHistory(liveSelected);
                const sortedStaffHistory = [...(liveSelected.history || [])].sort((a, b) => b.year - a.year);
                return (
              <div className="bg-white border border-[#a0b0a0] rounded-sm overflow-hidden shadow-xs">
                <div className="px-2.5 py-1.5 bg-[#f2f7f2] border-b border-slate-200">
                  <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <History size={12} /> Historial ({sortedStaffHistory.length})
                  </h4>
                </div>
                <FMTable headers={['Año', 'Club', 'Rol']} colWidths={['50px', 'auto', 'auto']}>
                  {sortedStaffHistory.length > 0 ? (
                    sortedStaffHistory.map((h, i) => {
                      const histClub = world.getClub(h.clubId);
                      return (
                      <tr key={`${h.year}_${h.clubId}_${i}`} className="border-b border-slate-100 last:border-0">
                        <FMTableCell className="text-slate-500 font-mono">{h.year}</FMTableCell>
                        <FMTableCell className="text-slate-900 font-bold">
                          {histClub ? (
                            <button
                              type="button"
                              onClick={() => openClubSquad(histClub.id, world.clubs)}
                              className="text-slate-900 hover:text-[#1f5922] hover:underline cursor-pointer text-left"
                            >
                              {histClub.name}
                            </button>
                          ) : (
                            <span>{h.clubId || 'Desconocido'}</span>
                          )}
                        </FMTableCell>
                        <FMTableCell className="text-slate-500 text-[9px] uppercase">{getRoleLabel(h.role)}</FMTableCell>
                      </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={3} className="p-3 text-center text-slate-400 italic text-[10px]">Sin historial previo</td></tr>
                  )}
                </FMTable>
              </div>
                );
              })()}
            </div>
          </div>

          {/* Palmarés */}
          {liveSelected.careerHonours && liveSelected.careerHonours.length > 0 && (
            <div className="bg-white border border-[#a0b0a0] rounded-sm p-2.5 shadow-xs">
              <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
                <Trophy size={12} /> Palmarés
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {liveSelected.careerHonours.map((honour, i) => (
                  <span key={i} className="px-2 py-1 bg-amber-50 border border-amber-300 rounded-sm text-amber-900 font-bold text-[10px] uppercase">
                    {honour}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Clubes Anteriores */}
          {liveSelected.previousClubs && liveSelected.previousClubs.length > 0 && (
            <div className="bg-white border border-[#a0b0a0] rounded-sm overflow-hidden shadow-xs">
              <div className="px-2.5 py-1.5 bg-[#f2f7f2] border-b border-slate-200">
                <h4 className="text-[9.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin size={12} /> Clubes Anteriores
                </h4>
              </div>
              {liveSelected.previousClubs.map((prev, i) => {
                const prevClubObj = prev.clubId ? world.getClub(prev.clubId) : undefined;
                return (
                <div key={i} className="px-2.5 py-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between items-center">
                    {prevClubObj ? (
                      <button
                        type="button"
                        onClick={() => openClubSquad(prevClubObj.id, world.clubs)}
                        className="text-[#1f5922] hover:underline font-black text-xs cursor-pointer text-left"
                      >
                        {prev.clubName}
                      </button>
                    ) : (
                      <span className="text-slate-900 font-black text-xs">{prev.clubName}</span>
                    )}
                    <span className="text-slate-500 text-[10px] font-mono">{prev.years}</span>
                  </div>
                  {prev.titles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prev.titles.map((t, j) => (
                        <span key={j} className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-sm text-amber-800 font-bold text-[8.5px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const squadTagLabel: Record<SquadType, string> = { SENIOR: '1ª', RESERVE: 'RES', U20: 'S20' };
  const openStaffChat = (memberId: string) => {
    useDialogueStore.getState().open('STAFF_DIALOG', {
      clubId: userClub?.id || liveClub?.id || '',
      staffId: memberId,
      source: resolvedIsOwnClub ? 'STAFF' : 'EXTERNAL_CLUB',
    });
  };

  return (
    <div className="p-2 md:p-3 h-full flex flex-col gap-2 bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-2 bg-[#e8ece8] border border-[#8e9b90] rounded-sm px-2.5 py-1.5 shadow-xs">
        <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
          <h2 className="text-xs sm:text-base font-black text-slate-900 uppercase italic tracking-tight truncate">
            Cuerpo Técnico{!resolvedIsOwnClub && liveClub ? ` · ${liveClub.name}` : ''} ({sortedStaff.length})
          </h2>
          {staffBudget && (
            <span className="px-2 py-0.5 bg-white border border-[#a0b0a0] rounded-sm text-[8.5px] font-bold text-slate-700">
              Cupo <strong className={staffBudget.currentCount >= staffBudget.maxCount ? 'text-red-700' : 'text-[#2b5d2c]'}>{staffBudget.currentCount}/{staffBudget.maxCount}</strong> · Masa <strong className="font-mono">£{staffBudget.currentWeeklyWage.toLocaleString()}/£{staffBudget.maxWeeklyWage.toLocaleString()}</strong> sem
            </span>
          )}
        </div>
        {resolvedIsOwnClub && (
          <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shrink-0 shadow-xs">
            <button type="button" onClick={() => setActiveTab('PERSONAL')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-[1px] transition-all flex items-center gap-1 cursor-pointer ${activeTab === 'PERSONAL' ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-black/5'}`}>
              <Users size={11} /> Personal
            </button>
            <button type="button" onClick={() => setActiveTab('DELEGACION')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-[1px] transition-all flex items-center gap-1 cursor-pointer ${activeTab === 'DELEGACION' ? 'bg-[#2b5d2c] text-white shadow-sm' : 'text-slate-700 hover:bg-black/5'}`}>
              <ClipboardList size={11} /> Delegación
            </button>
          </div>
        )}
      </header>

      {(activeTab === 'PERSONAL' || !resolvedIsOwnClub) ? (
      <div className="flex-1 min-h-0 overflow-hidden">
        <FMBox title={`Plantel de Empleados (${sortedStaff.length})`} className="h-full" noPadding>
          {/* Desktop Table View */}
          <div className="hidden md:block h-full overflow-y-auto">
            <FMTable
              headers={['Rol', 'Nombre', 'Edad', 'Nacionalidad', 'Rep', 'Sueldo', 'Áreas / Delegaciones', 'Charla']}
              colWidths={['70px', 'auto', '40px', '90px', '40px', '70px', '165px', '82px']}
            >
              {sortedStaff.map((s, idx) => {
                const badges = resolvedIsOwnClub ? getDelegationBadges(s) : [];
                const squads = resolvedIsOwnClub ? world.getEffectiveStaffSquads(s) : [];
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedStaff(s)}
                    className={`cursor-pointer transition-colors border-b border-[#e0e0e0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${s.role === 'HEAD_COACH' ? 'font-bold' : ''}`}
                  >
                    <FMTableCell className="text-center text-slate-700 font-bold">{getRoleShort(s.role)}</FMTableCell>
                    <FMTableCell className="text-slate-900">
                      <div className="flex items-center min-w-0">
                        <img src={getFlagUrl(s.nationality)} alt={s.nationality} className="w-4 h-3 object-cover shadow-sm rounded-[1px] mr-2 shrink-0 border border-slate-300" />
                        <span className="truncate">{s.name}</span>
                        {s.role === 'HEAD_COACH' && s.reputation && (
                          <span className="ml-2 flex items-center gap-0.5 text-amber-700 shrink-0"><Star size={10} className="fill-amber-500" /> {s.reputation}</span>
                        )}
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center font-bold" isNumber>{s.age}</FMTableCell>
                    <FMTableCell className="text-slate-500 text-[10px]">{s.nationality}</FMTableCell>
                    <FMTableCell className="text-center font-bold" isNumber>{s.reputation ?? '-'}</FMTableCell>
                    <FMTableCell className="text-right font-bold" isNumber>£{(s.salary / 1000).toFixed(0)}k</FMTableCell>
                    <FMTableCell>
                      <div className="flex flex-wrap gap-1">
                        {squads.map(sq => (
                          <span key={sq} className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded-sm text-slate-700 text-[8px] font-black uppercase whitespace-nowrap">
                            {squadTagLabel[sq]}
                          </span>
                        ))}
                        {badges.map(b => (
                          <span key={b} className="px-1.5 py-0.5 bg-green-100 border border-green-400 rounded-sm text-green-800 text-[8px] font-black uppercase whitespace-nowrap">{b}</span>
                        ))}
                        {!resolvedIsOwnClub && s.preferredFormation && (
                          <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded-sm text-slate-700 text-[8px] font-mono font-bold whitespace-nowrap">{s.preferredFormation}</span>
                        )}
                        {squads.length === 0 && badges.length === 0 && (!resolvedIsOwnClub ? !s.preferredFormation : true) && <span className="text-slate-300 text-[9px]">—</span>}
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openStaffChat(s.id); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-[#2b5d2c] hover:bg-[#1f4920] text-white border border-[#133014] text-[8.5px] font-black uppercase cursor-pointer whitespace-nowrap"
                        title={`Charlar con ${s.name}`}
                      >
                        <MessageCircle size={10} /> Charlar
                      </button>
                    </FMTableCell>
                  </tr>
                );
              })}
            </FMTable>
          </div>

          {/* Mobile Compact Table View */}
          <div className="md:hidden h-full overflow-y-auto">
            <FMTable
              headers={['Rol', 'Nombre', 'Edad', 'Charla']}
              colWidths={['48px', 'auto', '32px', '66px']}
            >
              {sortedStaff.map((s, idx) => {
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedStaff(s)}
                    className={`cursor-pointer transition-colors border-b border-[#e0e0e0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f7f2]'} hover:bg-[#ccd9cc] ${s.role === 'HEAD_COACH' ? 'font-bold' : ''}`}
                  >
                    <FMTableCell className="text-center text-slate-700 font-black text-[8.5px] px-1 py-1">{getRoleShort(s.role)}</FMTableCell>
                    <FMTableCell className="text-slate-900 px-1.5 py-1">
                      <div className="flex items-center min-w-0">
                        <img src={getFlagUrl(s.nationality)} alt={s.nationality} className="w-3 h-2 object-cover rounded-[1px] mr-1 shrink-0 border border-slate-300" />
                        <span className="truncate max-w-[130px] text-[9.5px] font-bold">{s.name}</span>
                      </div>
                    </FMTableCell>
                    <FMTableCell className="text-center font-bold text-[9.5px] px-1 py-1" isNumber>{s.age}</FMTableCell>
                    <FMTableCell className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openStaffChat(s.id); }}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[2px] bg-[#2b5d2c] text-white border border-[#133014] text-[7.5px] font-black uppercase cursor-pointer whitespace-nowrap"
                      >
                        <MessageCircle size={9} /> Charlar
                      </button>
                    </FMTableCell>
                  </tr>
                );
              })}
            </FMTable>
          </div>
        </FMBox>
      </div>
      ) : renderDelegationTab()}
    </div>
  );
};
