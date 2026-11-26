import { Staff, StaffChatMessage, StaffRole } from '../types';
import { world } from './worldManager';
import { useGameStore } from '../stores/gameStore';
import { notifyAll } from '../stores/worldStore';
import { generateUUID } from './utils';

export interface StaffChatApiResponse {
  reply: string;
  tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  moraleDelta: number;
  tensionDelta: number;
  trustDelta: number;
  suggestedReplies: string[];
}

export type StaffFormulaIntent =
  | 'ASK_SQUAD'
  | 'ASK_TACTIC'
  | 'ASK_FITNESS'
  | 'ASK_YOUTH'
  | 'PRAISE_WORK'
  | 'PROBE_HIRE';

export interface StaffFormulaSuggestion {
  id: string;
  label: string;
  intent: StaffFormulaIntent;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  HEAD_COACH: 'Director Técnico',
  ASSISTANT_MANAGER: 'Segundo Entrenador',
  COACH: 'Entrenador',
  PHYSIO: 'Fisioterapeuta',
  FITNESS_COACH: 'Preparador Físico',
  RESERVE_MANAGER: 'Entrenador Reserva',
  YOUTH_MANAGER: 'Entrenador Sub-20',
  SCOUT: 'Ojeador',
  SPORTING_DIRECTOR: 'Director Deportivo',
  TREASURER: 'Tesorero',
};

const PERSONALITY_LABELS: Record<string, string> = {
  VISIONARY: 'Visionario',
  CALM: 'Calmado',
  PASSIONATE: 'Pasional',
  DISCIPLINARIAN: 'Disciplinado',
  LEADER: 'Líder',
};

export function getStaffRoleLabel(role: StaffRole): string {
  return ROLE_LABELS[role] || role;
}

export function getStaffPersonalityLabel(personality?: string): string {
  if (!personality) return 'Equilibrado';
  return PERSONALITY_LABELS[personality] || personality;
}

function getStaffLastName(staff: Staff): string {
  const parts = staff.name.trim().split(/\s+/);
  return parts[parts.length - 1] || staff.name;
}

function getManagerFormOfAddress(isUserClubStaff: boolean): string {
  const fullName = world.managerProfile?.fullName?.trim();
  const first = fullName && fullName !== 'Director Técnico' ? fullName.split(/\s+/)[0] : '';
  if (!isUserClubStaff) {
    return first || 'colega';
  }
  return first && Math.random() < 0.45 ? first : 'Señor';
}

function isFreeAgentStaff(staff: Staff): boolean {
  return !staff.clubId || staff.clubId === 'FREE_AGENT';
}

function getDelegationLabels(staff: Staff, clubId?: string): string[] {
  if (!clubId) return [];
  const club = world.getClub(clubId);
  if (!club) return [];
  const labels: string[] = [];
  if (club.trainingDelegatedTo === staff.id) labels.push('Entrenamientos');
  if (club.pressDelegatedTo === staff.id) labels.push('Prensa');
  if (club.talksDelegatedTo === staff.id) labels.push('Charlas de vestuario');
  if (club.reserveDelegatedTo === staff.id) labels.push('Reserva');
  if (club.u20DelegatedTo === staff.id) labels.push('Sub-20');
  if (club.scoutingDelegatedTo === staff.id) labels.push('Scouting');
  if (club.financeDelegatedTo === staff.id) labels.push('Finanzas');
  return labels;
}

function getClubContextSnapshot(
  staff: Staff,
  userClubId: string,
  currentDate: Date
) {
  const gs = useGameStore.getState();
  const freeAgent = isFreeAgentStaff(staff);
  const staffActualClub = !freeAgent ? world.getClub(staff.clubId) : undefined;
  const userClub = userClubId ? world.getClub(userClubId) : undefined;
  const isUserClubStaff = Boolean(userClub && staffActualClub && staffActualClub.id === userClub.id);
  const clubName = staffActualClub?.name || 'Agente Libre';
  const userClubName = userClub?.name || clubName;

  const getLeaguePos = (clubId?: string, leagueId?: string): number | null => {
    if (!clubId || !leagueId) return null;
    const table = world.getLeagueTable(leagueId, gs.fixtures, 'SENIOR');
    const idx = table.findIndex((r) => r.clubId === clubId);
    return idx >= 0 ? idx + 1 : null;
  };

  const leaguePosition = staffActualClub
    ? getLeaguePos(staffActualClub.id, staffActualClub.leagueId)
    : null;
  const userClubLeaguePos = userClub
    ? getLeaguePos(userClub.id, userClub.leagueId)
    : null;

  let recentForm = '';
  let nextOpponentName: string | undefined;
  if (staffActualClub) {
    const played = gs.fixtures
      .filter(
        (f) =>
          f.played &&
          f.squadType === 'SENIOR' &&
          (f.homeTeamId === staffActualClub.id || f.awayTeamId === staffActualClub.id)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
    recentForm = played
      .map((f) => {
        const isHome = f.homeTeamId === staffActualClub.id;
        const gf = isHome ? f.homeScore ?? 0 : f.awayScore ?? 0;
        const ga = isHome ? f.awayScore ?? 0 : f.homeScore ?? 0;
        return gf > ga ? 'G' : gf === ga ? 'E' : 'P';
      })
      .join('');

    const nextFix = gs.fixtures
      .filter(
        (f) =>
          !f.played &&
          f.squadType === 'SENIOR' &&
          (f.homeTeamId === staffActualClub.id || f.awayTeamId === staffActualClub.id) &&
          new Date(f.date).getTime() >= currentDate.getTime() - 24 * 60 * 60 * 1000
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

    if (nextFix) {
      const oppId =
        nextFix.homeTeamId === staffActualClub.id ? nextFix.awayTeamId : nextFix.homeTeamId;
      nextOpponentName = world.getClub(oppId)?.name;
    }
  }

  const allClubPlayers = staffActualClub ? world.getPlayersByClub(staffActualClub.id) : [];
  // Prioritize injured players, senior starters, top U20 prospects, low morale/fitness
  const prioritized = [...allClubPlayers].sort((a, b) => {
    const scoreA =
      (a.injury ? 500 : 0) +
      (a.squad === 'SENIOR' && a.isStarter ? 300 : a.squad === 'SENIOR' ? 150 : 0) +
      (a.squad === 'U20' && a.potentialAbility >= 135 ? 120 : 0) +
      ((a.morale ?? 65) < 50 ? 90 : 0) +
      (a.currentAbility || 0);
    const scoreB =
      (b.injury ? 500 : 0) +
      (b.squad === 'SENIOR' && b.isStarter ? 300 : b.squad === 'SENIOR' ? 150 : 0) +
      (b.squad === 'U20' && b.potentialAbility >= 135 ? 120 : 0) +
      ((b.morale ?? 65) < 50 ? 90 : 0) +
      (b.currentAbility || 0);
    return scoreB - scoreA;
  });

  const squadSnapshot = prioritized.slice(0, 18).map((pl) => ({
    name: pl.name,
    pos: pl.positions[0] || 'JUG',
    age: pl.age,
    ca: Math.round(pl.currentAbility || 100),
    pa: Math.round(pl.potentialAbility || 110),
    squad: pl.squad,
    isStarter: Boolean(pl.isStarter),
    morale: Math.round(pl.morale ?? 65),
    fitness: Math.round(pl.fitness ?? 85),
    injuredDays: pl.injury?.daysLeft ?? 0,
    transferStatus: pl.transferStatus || 'NONE',
    seasonApps: pl.seasonStats?.appearances ?? 0,
    seasonGoals: pl.seasonStats?.goals ?? 0,
    seasonAssists: pl.seasonStats?.assists ?? 0,
  }));

  let activeTactic:
    | {
        formation: string;
        style: string;
        passingStyle?: string;
        pressingIntensity?: string;
      }
    | undefined;

  if (isUserClubStaff) {
    const t = world.getActiveTactic();
    if (t) {
      const m = t.settings.mentality ?? 10;
      const p = t.settings.passingStyle ?? 10;
      const c = t.settings.closingDown ?? 10;
      activeTactic = {
        formation: t.name,
        style: m >= 14 ? 'ATTACK' : m <= 7 ? 'DEFENSE' : t.settings.counterAttack ? 'COUNTER' : 'BALANCED',
        passingStyle: p <= 7 ? 'SHORT' : p >= 14 ? 'DIRECT' : 'MIXED',
        pressingIntensity: c >= 14 ? 'HIGH' : c <= 7 ? 'LOW' : 'MEDIUM',
      };
    }
  } else if (staffActualClub) {
    const clubHeadCoach = world
      .getStaffByClub(staffActualClub.id)
      .find((st) => st.role === 'HEAD_COACH');
    activeTactic = {
      formation: staff.preferredFormation || clubHeadCoach?.preferredFormation || '4-4-2',
      style: staff.tacticalStyle || clubHeadCoach?.tacticalStyle || 'BALANCED',
      pressingIntensity: staff.pressIntensity || clubHeadCoach?.pressIntensity || 'MEDIUM',
    };
  }

  const staffColleagues = staffActualClub
    ? world
        .getStaffByClub(staffActualClub.id)
        .filter((col) => col.id !== staff.id)
        .slice(0, 8)
        .map((col) => ({
          name: col.name,
          roleLabel: getStaffRoleLabel(col.role),
        }))
    : [];

  return {
    freeAgent,
    staffActualClub,
    userClub,
    isUserClubStaff,
    clubName,
    userClubName,
    leaguePosition,
    userClubLeaguePos,
    recentForm,
    nextOpponentName,
    allClubPlayers,
    squadSnapshot,
    activeTactic,
    staffColleagues,
    delegations: isUserClubStaff ? getDelegationLabels(staff, staffActualClub?.id) : [],
  };
}

export async function checkStaffChatAvailability(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const res = await fetch('/api/player-chat/status', {
      method: 'GET',
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: boolean };
    return Boolean(data.available);
  } catch {
    return false;
  }
}

export function getStaffMotiveOpening(
  staff: Staff,
  staffClubName: string,
  isUserClubStaff: boolean,
  userClubName: string
): string {
  const fullMgr = world.managerProfile?.fullName?.trim();
  const mgrFirst = fullMgr && fullMgr !== 'Director Técnico' ? fullMgr.split(/\s+/)[0] : '';
  const roleLabel = getStaffRoleLabel(staff.role);
  const freeAgent = isFreeAgentStaff(staff);

  if (freeAgent) {
    return `Buenas, ${mgrFirst || 'colega'}. Hoy estoy libre esperando un proyecto serio como ${roleLabel.toLowerCase()}. ¿Qué idea tienen en mente en ${userClubName || 'su club'}?`;
  }

  const clubPlayers = staff.clubId ? world.getPlayersByClub(staff.clubId) : [];
  const injuredTop = clubPlayers.find((p) => p.injury && p.squad === 'SENIOR');
  const starPlayer = [...clubPlayers]
    .filter((p) => p.squad === 'SENIOR')
    .sort((a, b) => (b.currentAbility || 0) - (a.currentAbility || 0))[0];
  const topYouth = [...clubPlayers]
    .filter((p) => p.squad === 'U20')
    .sort((a, b) => (b.potentialAbility || 0) - (a.potentialAbility || 0))[0];

  if (!isUserClubStaff) {
    const formationTxt = staff.preferredFormation ? ` con base en el ${staff.preferredFormation}` : '';
    const refPlayer = starPlayer ? ` Con gente como ${starPlayer.name} en el plantel estamos compitiendo fuerte.` : '';
    return `Un gusto saludarlo, ${mgrFirst || 'colega'}. Hoy trabajo como ${roleLabel} en ${staffClubName}${formationTxt}.${refPlayer} ¿Sobre qué quería intercambiar opiniones?`;
  }

  const addr = mgrFirst ? `${mgrFirst}` : 'Señor';
  switch (staff.role) {
    case 'PHYSIO':
    case 'FITNESS_COACH':
      if (injuredTop) {
        return `${addr}, justo estaba repasando el parte físico de ${staffClubName}: tenemos a ${injuredTop.name} en recuperación (${injuredTop.injury?.daysLeft} días). ¿Cómo querés dosificar las cargas del plantel esta semana?`;
      }
      return `${addr}, el grupo de ${staffClubName} viene respondiendo bien en lo físico${starPlayer ? `, con ${starPlayer.name} en muy buen tono` : ''}. ¿Necesitás ajustar cargas o revisar algún jugador puntual?`;

    case 'YOUTH_MANAGER':
    case 'RESERVE_MANAGER':
      if (topYouth) {
        return `${addr}, vengo siguiendo de cerca la evolución de los chicos en ${staffClubName}; ${topYouth.name} viene pidiendo pista para entrenar arriba. ¿Qué perfil estás buscando potenciar?`;
      }
      return `${addr}, estoy al día con el seguimiento de Reserva y Sub-20 en ${staffClubName}. Decime qué puestos te preocupa cubrir desde abajo.`;

    case 'SCOUT':
    case 'SPORTING_DIRECTOR':
      return `${addr}, tengo los informes del plantel de ${staffClubName} y del mercado sobre la mesa${starPlayer ? ` — hoy ${starPlayer.name} es nuestra referencia` : ''}. ¿Revisamos refuerzos o necesidades del equipo?`;

    case 'TREASURER':
      return `${addr}, tengo los números de masa salarial y contratos de ${staffClubName} actualizados al día. ¿Querés analizar margen para fichajes o renovaciones?`;

    default: {
      const tactic = world.getActiveTactic();
      return `${addr}, ya tengo analizado el plantel${tactic ? ` y nuestro dibujo ${tactic.name}` : ''} en ${staffClubName}${injuredTop ? ` (atentos a la baja de ${injuredTop.name})` : ''}. ¿Qué querés ajustar del equipo o de la táctica?`;
    }
  }
}

export function ensureStaffInitialGreeting(
  staff: Staff,
  staffClubName: string,
  currentDate: Date,
  isUserClubStaff: boolean,
  userClubName: string
): boolean {
  if (!staff.chatHistory) {
    staff.chatHistory = [];
  }
  const hasOpening = staff.chatHistory.some((m) => m.sender === 'STAFF');
  if (!hasOpening && staff.chatHistory.length === 0) {
    staff.chatHistory.push({
      id: generateUUID(),
      sender: 'STAFF',
      text: getStaffMotiveOpening(staff, staffClubName, isUserClubStaff, userClubName),
      dateIso: currentDate.toISOString(),
    });
    return true;
  }
  return false;
}

export function getStaffInitialSuggestedReplies(
  staff: Staff,
  staffClubName: string,
  isUserClubStaff: boolean,
  userClubName: string
): string[] {
  if (isFreeAgentStaff(staff)) {
    return [
      `¿Te interesaría sumarte al cuerpo técnico de ${userClubName || 'nuestro club'}?`,
      'Contame cómo trabajás la táctica y el día a día con los jugadores.',
      '¿Qué rol y condiciones contractuales estás buscando?',
    ];
  }
  if (!isUserClubStaff) {
    return [
      `¿Cómo ves al plantel de ${staffClubName} y a sus figuras esta temporada?`,
      '¿Cuál es tu mirada táctica sobre el esquema que vienen utilizando?',
      `Si se abriera una oportunidad en ${userClubName || 'mi club'}, ¿escucharías una oferta?`,
    ];
  }
  switch (staff.role) {
    case 'PHYSIO':
    case 'FITNESS_COACH':
      return [
        '¿Qué jugadores están más cargados o en riesgo de lesión?',
        '¿Cómo ves la recuperación física para el próximo partido?',
        'Bajemos un poco la carga de los titulares esta semana.',
      ];
    case 'SCOUT':
    case 'SPORTING_DIRECTOR':
      return [
        '¿Qué puesto del plantel necesita un refuerzo con más urgencia?',
        '¿Qué jugador actual sentís que puede rendir más o conviene vender?',
        'Enfocate en buscar talento joven con buen potencial.',
      ];
    case 'YOUTH_MANAGER':
    case 'RESERVE_MANAGER':
      return [
        '¿Qué juvenil está listo para sumar minutos en Primera?',
        '¿Cómo están evolucionando los chicos de Reserva y Sub-20?',
        'Quiero que repliquen la táctica del primer equipo.',
      ];
    case 'TREASURER':
      return [
        '¿Cómo estamos de presupuesto salarial para renovar o fichar?',
        '¿Qué contratos altos deberíamos revisar antes del próximo mercado?',
        'Mantené la disciplina financiera en todas las áreas.',
      ];
    default:
      return [
        '¿Qué ajustes tácticos harías en el esquema para el próximo partido?',
        '¿Qué jugador del plantel está para titular y quién bajó su nivel?',
        '¿Cómo ves el clima del vestuario y los entrenamientos?',
      ];
  }
}

export function getStaffFormulaSuggestions(
  staff: Staff,
  staffClubName: string,
  followUpStep: number,
  isUserClubStaff: boolean,
  userClubName: string
): StaffFormulaSuggestion[] {
  if (isFreeAgentStaff(staff)) {
    return followUpStep > 0
      ? [
          {
            id: `st-fa-fu1-${followUpStep}`,
            label: `Analizamos tu incorporación para ${userClubName || 'el club'}, seguimos en contacto.`,
            intent: 'PROBE_HIRE',
          },
          {
            id: `st-fa-fu2-${followUpStep}`,
            label: '¿Cómo adaptás tu metodología cuando agarrás un plantel en marcha?',
            intent: 'ASK_TACTIC',
          },
        ]
      : [
          {
            id: 'st-fa-1',
            label: `¿Te seduce sumarte al proyecto de ${userClubName || 'nuestro club'}?`,
            intent: 'PROBE_HIRE',
          },
          {
            id: 'st-fa-2',
            label: 'Contame cuál es tu dibujo preferido y tu forma de entrenar.',
            intent: 'ASK_TACTIC',
          },
          {
            id: 'st-fa-3',
            label: '¿Cómo manejás las cargas físicas y el vestuario en torneos largos?',
            intent: 'ASK_FITNESS',
          },
        ];
  }

  if (!isUserClubStaff) {
    return followUpStep > 0
      ? [
          {
            id: `st-ext-fu1-${followUpStep}`,
            label: `Si surge la chance de trabajar juntos en ${userClubName || 'nuestro club'}, te aviso.`,
            intent: 'PROBE_HIRE',
          },
          {
            id: `st-ext-fu2-${followUpStep}`,
            label: `Éxitos en ${staffClubName}, fue una gran charla de fútbol.`,
            intent: 'PRAISE_WORK',
          },
        ]
      : [
          {
            id: 'st-ext-1',
            label: `¿Cómo ves hoy al plantel de ${staffClubName} y sus puntos fuertes?`,
            intent: 'ASK_SQUAD',
          },
          {
            id: 'st-ext-2',
            label: '¿Qué lectura táctica tenés del funcionamiento actual del equipo?',
            intent: 'ASK_TACTIC',
          },
          {
            id: 'st-ext-3',
            label: `¿Evaluarías dejar ${staffClubName} si te acercamos una propuesta?`,
            intent: 'PROBE_HIRE',
          },
        ];
  }

  if (followUpStep > 0) {
    return [
      {
        id: `st-own-fu1-${followUpStep}`,
        label: 'Perfecto, sigamos trabajando con esa línea esta semana.',
        intent: 'PRAISE_WORK',
      },
      {
        id: `st-own-fu2-${followUpStep}`,
        label: '¿Qué juvenil o suplente ves pidiendo lugar para el próximo once?',
        intent: 'ASK_YOUTH',
      },
      {
        id: `st-own-fu3-${followUpStep}`,
        label: 'Revisame también el estado físico y las lesiones del plantel.',
        intent: 'ASK_FITNESS',
      },
    ];
  }

  return [
    {
      id: 'st-own-1',
      label: '¿Cómo evaluás al plantel actual y quién está rindiendo mejor?',
      intent: 'ASK_SQUAD',
    },
    {
      id: 'st-own-2',
      label: '¿Qué pensás de la táctica actual y qué ajustarías para el próximo rival?',
      intent: 'ASK_TACTIC',
    },
    {
      id: 'st-own-3',
      label: '¿Cómo está el plantel en lo físico, lesionados y promesas Sub-20?',
      intent: 'ASK_FITNESS',
    },
  ];
}

function applyStaffChatTurnOutcome(
  staff: Staff,
  managerMessage: string,
  data: StaffChatApiResponse,
  currentDate: Date,
  isUserClubStaff: boolean
): StaffChatApiResponse {
  if (!staff.chatHistory) staff.chatHistory = [];
  const nowIso = currentDate.toISOString();

  staff.chatHistory.push({
    id: generateUUID(),
    sender: 'MANAGER',
    text: managerMessage,
    dateIso: nowIso,
  });

  const clampedMorale = isUserClubStaff
    ? data.moraleDelta
    : Math.max(-3, Math.min(3, data.moraleDelta));
  staff.morale = Math.max(0, Math.min(100, (staff.morale ?? 70) + clampedMorale));

  world.adjustRelationship(
    'COACH',
    staff.id,
    data.trustDelta,
    Math.round(data.trustDelta * 0.5),
    data.tensionDelta
  );

  staff.chatHistory.push({
    id: generateUUID(),
    sender: 'STAFF',
    text: data.reply,
    dateIso: nowIso,
    tone: data.tone,
    moraleDelta: clampedMorale,
    tensionDelta: data.tensionDelta,
    trustDelta: data.trustDelta,
  });

  if (staff.chatHistory.length > 30) {
    staff.chatHistory = staff.chatHistory.slice(-30);
  }

  world.recordInteraction({
    id: generateUUID(),
    date: currentDate,
    channel: isUserClubStaff || isFreeAgentStaff(staff) ? 'COACH_STAFF' : 'COACH_MANAGER',
    actorId: 'COACH',
    targetId: staff.id,
    type:
      data.tone === 'NEGATIVE'
        ? 'REPRIMAND'
        : staff.role === 'HEAD_COACH' && !isUserClubStaff
        ? 'CONTACT_MANAGER'
        : 'TACTICAL_ADVICE',
    tone: data.tone === 'NEGATIVE' ? 'AGGRESSIVE' : data.tone === 'POSITIVE' ? 'MILD' : 'MODERATE',
    result: data.tone,
    moraleChange: clampedMorale,
    tensionChange: data.tensionDelta,
    description: `${managerMessage.slice(0, 70)} → ${data.reply.slice(0, 120)}`,
  });

  notifyAll();
  return data;
}

export async function sendStaffChatMessage(
  staff: Staff,
  userClubId: string,
  managerMessage: string,
  currentDate: Date
): Promise<StaffChatApiResponse> {
  const trimmed = managerMessage.trim();
  if (!trimmed) {
    throw new Error('Escribí un mensaje antes de enviar.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sin conexión a internet.');
  }

  const ctx = getClubContextSnapshot(staff, userClubId, currentDate);
  const rel = world.getRelationship('COACH', staff.id);
  const contractMonthsLeft =
    !ctx.freeAgent && staff.contractExpiry
      ? Math.max(
          0,
          Math.round(
            (new Date(staff.contractExpiry).getTime() - currentDate.getTime()) /
              (1000 * 60 * 60 * 24 * 30)
          )
        )
      : null;

  const payload = {
    staff: {
      id: staff.id,
      name: staff.name,
      age: staff.age,
      nationality: staff.nationality,
      role: staff.role,
      roleLabel: getStaffRoleLabel(staff.role),
      personality: staff.personality || 'CALM',
      morale: Math.round(staff.morale ?? 70),
      reputation: Math.round(staff.reputation ?? 50),
      salary: staff.salary,
      contractMonthsLeft,
      attributes: staff.attributes,
      preferredFormation: staff.preferredFormation,
      tacticalStyle: staff.tacticalStyle,
      pressIntensity: staff.pressIntensity,
      biography: staff.biography,
      careerHonours: staff.careerHonours,
      previousClubs: staff.previousClubs?.map((pc) => ({
        clubName: pc.clubName,
        years: pc.years,
      })),
      delegations: ctx.delegations,
      trust: Math.round(rel.trust),
      respect: Math.round(rel.respect),
      tension: Math.round(rel.tension),
    },
    club: {
      name: ctx.clubName,
      isUserClubStaff: ctx.isUserClubStaff,
      isFreeAgent: ctx.freeAgent,
      userClubName: ctx.userClubName,
      managerName: world.managerProfile?.fullName || 'Director Técnico',
      leaguePosition: ctx.leaguePosition,
      userClubLeaguePos: ctx.userClubLeaguePos,
      recentForm: ctx.recentForm,
      nextOpponentName: ctx.nextOpponentName,
      activeTactic: ctx.activeTactic,
      squadSnapshot: ctx.squadSnapshot,
      staffColleagues: ctx.staffColleagues,
    },
    currentDateIso: currentDate.toISOString(),
    conversationHistory: (staff.chatHistory || []).slice(-12).map((m) => ({
      sender: m.sender,
      text: m.text,
    })),
    managerMessage: trimmed,
  };

  const res = await fetch('/api/staff-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(18000),
  });

  let data: StaffChatApiResponse | { error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error('No se pudo leer la respuesta del servidor.');
  }

  if (!res.ok || !('reply' in data)) {
    const errMsg =
      'error' in data && typeof data.error === 'string' && data.error.trim()
        ? data.error
        : `Error de conexión con la IA (HTTP ${res.status}).`;
    throw new Error(errMsg);
  }

  return applyStaffChatTurnOutcome(staff, trimmed, data, currentDate, ctx.isUserClubStaff);
}

export function sendStaffFormulaReply(
  staff: Staff,
  userClubId: string,
  suggestion: StaffFormulaSuggestion,
  currentDate: Date
): StaffChatApiResponse {
  const ctx = getClubContextSnapshot(staff, userClubId, currentDate);
  const addr = getManagerFormOfAddress(ctx.isUserClubStaff);
  const last = getStaffLastName(staff);

  const seniors = ctx.allClubPlayers.filter((p) => p.squad === 'SENIOR');
  const topStar = [...seniors].sort((a, b) => (b.currentAbility || 0) - (a.currentAbility || 0))[0];
  const injuredList = seniors.filter((p) => p.injury);
  const lowMorale = seniors.filter((p) => (p.morale ?? 65) < 50);
  const topYouth = [...ctx.allClubPlayers]
    .filter((p) => p.squad === 'U20' || p.squad === 'RESERVE')
    .sort((a, b) => (b.potentialAbility || 0) - (a.potentialAbility || 0))[0];

  let reply = '';
  let tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'POSITIVE';
  let moraleDelta = 3;
  let trustDelta = 4;
  let tensionDelta = -4;

  if (ctx.freeAgent) {
    switch (suggestion.intent) {
      case 'PROBE_HIRE':
        reply = `Me entusiasma escuchar sobre el proyecto de ${ctx.userClubName}, ${addr}. Estoy sin club, en plena forma y listo para sumarme como ${getStaffRoleLabel(staff.role)} si acercan una oferta formal.`;
        trustDelta = 5;
        break;
      case 'ASK_TACTIC':
        reply = `Trabajo cómodo con ${staff.preferredFormation || 'un 4-3-3 equilibrado'} y estilo ${(staff.tacticalStyle || 'BALANCED').toLowerCase()}. Me adapto rápido a la calidad del plantel que haya disponible.`;
        trustDelta = 3;
        break;
      default:
        reply = `La clave en torneos largos es gestionar bien las cargas y hablar de frente en el vestuario. Con ${staff.attributes.manManagement}/20 en manejo de grupo, siempre priorizo orden y convicción.`;
        trustDelta = 3;
        break;
    }
  } else if (!ctx.isUserClubStaff) {
    switch (suggestion.intent) {
      case 'ASK_SQUAD':
        reply = topStar
          ? `Acá en ${ctx.clubName} tenemos una base competitiva alrededor de ${topStar.name} (${topStar.positions[0]}).${injuredList.length > 0 ? ` Hoy lamentablemente extrañamos a ${injuredList[0].name} por lesión.` : ' El grupo está firme y enchufado.'}`
          : `En ${ctx.clubName} estamos trabajando duro para sacar lo mejor del plantel fecha a fecha.`;
        moraleDelta = 1;
        trustDelta = 3;
        break;
      case 'ASK_TACTIC':
        reply = `En ${ctx.clubName} priorizamos un ${ctx.activeTactic?.formation || '4-4-2'} ordenado${ctx.nextOpponentName ? `, pensando ya en cómo neutralizar a ${ctx.nextOpponentName}` : ''}. La clave siempre está en sostener el bloque corto.`;
        moraleDelta = 1;
        trustDelta = 3;
        break;
      case 'PROBE_HIRE':
        tone = 'NEUTRAL';
        moraleDelta = 0;
        trustDelta = 2;
        tensionDelta = 0;
        reply = `Hoy tengo contrato vigente y respeto a ${ctx.clubName}, ${addr}. Pero si desde ${ctx.userClubName} presentan una propuesta formal seria, siempre se analiza como profesional.`;
        break;
      default:
        reply = `Gracias por el respeto, ${addr}. Un abrazo grande y éxitos para ${ctx.userClubName} en lo que viene.`;
        moraleDelta = 1;
        trustDelta = 3;
        break;
    }
  } else {
    switch (suggestion.intent) {
      case 'ASK_SQUAD':
        reply = topStar
          ? `${addr}, hoy ${topStar.name} (${topStar.positions[0]}, moral ${Math.round(topStar.morale)}%) marca el pulso del equipo.${lowMorale.length > 0 ? ` Donde sí pondría el ojo es en ${lowMorale[0].name}, que viene caído de ánimo y necesita respaldo.` : ' En líneas generales el vestuario está comprometido.'}`
          : `${addr}, el plantel está entrenando parejo y respondiendo a las indicaciones semanales.`;
        break;
      case 'ASK_TACTIC':
        reply = `${addr}, con el ${ctx.activeTactic?.formation || 'esquema actual'}${ctx.nextOpponentName ? ` pensando en ${ctx.nextOpponentName}` : ''}, creo que podemos ajustar las coberturas en el medio para no partir al equipo${topStar ? ` y liberar más a ${topStar.name}` : ''}.`;
        break;
      case 'ASK_FITNESS':
        reply = injuredList.length > 0
          ? `${addr}, en enfermería hoy tenemos a ${injuredList.map((p) => `${p.name} (${p.injury?.daysLeft}d)`).slice(0, 3).join(', ')}. Al resto hay que regularle cargas para no sumar más bajas.`
          : `${addr}, por suerte no tenemos lesionados graves en Primera${topYouth ? ` y en juveniles ${topYouth.name} viene volando en lo físico` : ''}. Podemos apretar un poco más en la semana.`;
        break;
      case 'ASK_YOUTH':
        reply = topYouth
          ? `${addr}, ${topYouth.name} (${topYouth.positions[0]}, ${topYouth.age} años) está creciendo muchísimo en ${topYouth.squad === 'U20' ? 'Sub-20' : 'Reserva'}. Si le das entrenamientos con Primera va a dar un salto rápido.`
          : `${addr}, los chicos de Reserva y Sub-20 vienen sumando rodaje, pero todavía les falta un poco de roce antes de subir.`;
        break;
      default:
        reply = `Gracias, ${addr}. Acá ${last} y todo el equipo de trabajo seguimos tirando para adelante por ${ctx.clubName}.`;
        moraleDelta = 5;
        trustDelta = 5;
        tensionDelta = -6;
        break;
    }
  }

  return applyStaffChatTurnOutcome(
    staff,
    suggestion.label,
    {
      reply,
      tone,
      moraleDelta,
      tensionDelta,
      trustDelta,
      suggestedReplies: [],
    },
    currentDate,
    ctx.isUserClubStaff
  );
}
