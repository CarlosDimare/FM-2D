import {
  Player,
  PlayerChatMessage,
  PlayerMatchStats,
  PlayerPromise,
  PlayerPromiseCategory,
} from '../types';
import { world } from './worldManager';
import { clearPlayerDialogue } from './playerDialogueTriggers';
import { useGameStore } from '../stores/gameStore';
import { notifyAll } from '../stores/worldStore';
import { generateUUID } from './utils';

export interface PlayerChatApiResponse {
  reply: string;
  tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  moraleDelta: number;
  tensionDelta: number;
  trustDelta: number;
  shouldResolvePending: boolean;
  transferRequestAction: 'KEEP' | 'WITHDRAW' | 'REQUEST';
  promiseCreated: {
    category: PlayerPromiseCategory;
    summary: string;
    matchesDuration?: number;
    deadlineDays?: number;
  } | null;
  suggestedReplies: string[];
}

export type FormulaIntent =
  | 'SUPPORT'
  | 'CHALLENGE'
  | 'FIRM'
  | 'PROMISE_MINUTES'
  | 'PROMISE_CONTRACT'
  | 'OPEN_TRANSFER'
  | 'CALM_GROUP';

export interface FormulaSuggestion {
  id: string;
  label: string;
  intent: FormulaIntent;
}

function getLastName(player: Player): string {
  const parts = player.name.trim().split(/\s+/);
  return parts[parts.length - 1] || player.name;
}

export function getMotiveBadgeLabel(motive?: string): string {
  switch (motive) {
    case 'MINUTES_DISCONTENT':
      return 'Falta de minutos';
    case 'CONTRACT_EXPIRING':
      return 'Contrato por vencer';
    case 'CONTRACT_RENEWAL':
      return 'Renovación pendiente';
    case 'TRANSFER_RUMOR':
      return 'Rumores de salida';
    case 'DRESSING_ROOM_CONFLICT':
      return 'Tensión en el vestuario';
    case 'PRE_MATCH_CHAT':
      return 'Previa de partido';
    case 'POST_MATCH_WARNING':
      return 'Revisión post-partido';
    case 'POST_MATCH_PRAISE':
      return 'Elogio post-partido';
    default:
      return 'Charla privada';
  }
}

export function getPlayerMotiveOpening(player: Player, clubName: string): string {
  const motive = player.pendingDialogue;
  const personality = player.personality || 'PROFESSIONAL';
  const last = getLastName(player);

  switch (motive) {
    case 'TRANSFER_RUMOR':
      if (personality === 'VOLATILE' || personality === 'AMBITIOUS') {
        return `Míster, mi teléfono no para de sonar con versiones sobre mi salida de ${clubName}. Prefiero escuchar de su boca qué planes reales tiene conmigo.`;
      }
      if (personality === 'LOYAL') {
        return `Profe, salieron notas vinculándome con otros clubes, pero mi cabeza está acá en ${clubName}. Solo quería confirmar que seguimos en la misma sintonía.`;
      }
      return `Míster, vi los rumores de mercado que circularon esta semana. Antes de que crezcan, quería hablarlo directo con usted.`;

    case 'MINUTES_DISCONTENT':
      if (personality === 'VOLATILE') {
        return `Míster, no me sirve estar mirando los partidos desde el banco en ${clubName}. Entreno fuerte y necesito minutos ya, o tendremos que replantear mi lugar.`;
      }
      if (personality === 'PROFESSIONAL' || personality === 'LOYAL') {
        return `Profe, respeto sus decisiones técnicas, pero siento que vengo trabajando bien y necesito un poco más de continuidad para agarrar ritmo.`;
      }
      return `Míster, ¿podemos charlar un segundo? Me preocupa la falta de minutos en estos últimos partidos y quiero saber qué espera de mí para entrar.`;

    case 'CONTRACT_EXPIRING':
    case 'CONTRACT_RENEWAL':
      if (personality === 'MERCENARY') {
        return `Míster, mi contrato entra en su tramo final y ya tengo sondeos de afuera. Me gustaría saber si ${clubName} va a acercar una mejora acorde pronto.`;
      }
      if (personality === 'LEADER' || personality === 'LOYAL') {
        return `Profe, me siento muy cómodo en ${clubName} y quiero seguir siendo importante acá. ¿Cómo ve el club el tema de mi renovación?`;
      }
      return `Míster, quería conversar sobre mi situación contractual. El tiempo corre y prefiero tener claridad sobre mi futuro en el club.`;

    case 'DRESSING_ROOM_CONFLICT':
      return `Profe, hay roces internos en el vestuario que nos están distrayendo del objetivo en ${clubName}. Quería comentárselo cara a cara antes de que afecte al grupo.`;

    case 'PRE_MATCH_CHAT':
      return `Míster, el plantel está mentalizado para el partido que viene. ¿Alguna indicación especial o mensaje para bajar al vestuario, ${last} al firme?`;

    case 'POST_MATCH_WARNING':
      return `Míster, sé que mi rendimiento en el último encuentro no estuvo a la altura de ${clubName}. Lo escucho para corregir lo que haga falta.`;

    case 'POST_MATCH_PRAISE':
      return `Gracias por la confianza del último partido, míster. Me sentí muy suelto en la cancha y quiero sostener este nivel para ayudar al equipo.`;

    default:
      if ((player.morale || 50) < 42) {
        return `Míster, la verdad es que anímicamente no vengo pasando mi mejor semana en ${clubName}, pero estoy acá para hablar de frente con usted.`;
      }
      return `Míster, ¿tiene un minuto? Estoy a disposición para charlar sobre mi momento y lo que necesita de mí en ${clubName}.`;
  }
}

export function getInitialSuggestedReplies(player: Player, clubName: string): string[] {
  const motive = player.pendingDialogue;
  switch (motive) {
    case 'MINUTES_DISCONTENT':
      return [
        'Vas a tener minutos en los próximos 4 partidos.',
        'El puesto se gana entrenando, demostrame más nivel.',
        'Hoy tengo otro once en mente, tenés que esperar.',
      ];
    case 'CONTRACT_EXPIRING':
    case 'CONTRACT_RENEWAL':
      return [
        `Cuento con vos en ${clubName}, vamos a preparar una oferta.`,
        'Sostené este nivel en cancha y hablamos de números.',
        'Por ahora el club va a esperar antes de renovar.',
      ];
    case 'TRANSFER_RUMOR':
      return [
        `Son solo rumores, sos pieza clave en ${clubName}.`,
        'Si llega una oferta seria la evaluaremos con vos.',
        'Concentrate en entrenar y dejá el mercado de lado.',
      ];
    case 'DRESSING_ROOM_CONFLICT':
      return [
        'Necesito que sumes al grupo y bajemos las tensiones.',
        'Decime qué está pasando así lo corto de raíz.',
        'Acá las cosas se resuelven jugando al 100% en cancha.',
      ];
    case 'POST_MATCH_WARNING':
      return [
        'Necesito mucha más intensidad tuya en el próximo partido.',
        'Todos tenemos un mal partido, levantá la cabeza y seguí.',
        'Si no mejora tu nivel voy a tener que hacer cambios.',
      ];
    case 'POST_MATCH_PRAISE':
      return [
        'Jugaste un partidazo, quiero verte mantener ese nivel.',
        'Fuiste decisivo, seguí siendo referente dentro de la cancha.',
        'Muy buen trabajo, ahora a pensar rápido en el próximo rival.',
      ];
    default:
      return [
        'Estoy conforme con tu entrega, seguí así esta semana.',
        'Necesito un plus tuyo en los entrenamientos y en el juego.',
        `Sos importante para lo que buscamos en ${clubName}.`,
      ];
  }
}

export function getFormulaSuggestions(
  player: Player,
  clubName: string,
  followUpStep = 0
): FormulaSuggestion[] {
  const motive = player.pendingDialogue;

  if (followUpStep > 0) {
    return [
      {
        id: `fu-support-${followUpStep}`,
        label: `Perfecto, contamos con vos al 100% para ${clubName}.`,
        intent: 'SUPPORT',
      },
      {
        id: `fu-challenge-${followUpStep}`,
        label: 'Ahora demostralo desde el próximo entrenamiento.',
        intent: 'CHALLENGE',
      },
      {
        id: `fu-firm-${followUpStep}`,
        label: 'La charla termina acá, cabeza en el próximo partido.',
        intent: 'FIRM',
      },
    ];
  }

  switch (motive) {
    case 'MINUTES_DISCONTENT':
      return [
        {
          id: 'min-promise',
          label: 'Vas a tener minutos en los próximos 4 partidos.',
          intent: 'PROMISE_MINUTES',
        },
        {
          id: 'min-challenge',
          label: 'El puesto se gana entrenando, demostrame más nivel.',
          intent: 'CHALLENGE',
        },
        {
          id: 'min-firm',
          label: 'Hoy tengo otro once en mente, tenés que esperar tu turno.',
          intent: 'FIRM',
        },
      ];
    case 'CONTRACT_EXPIRING':
    case 'CONTRACT_RENEWAL':
      return [
        {
          id: 'ctr-promise',
          label: `Cuento con vos en ${clubName}, vamos a preparar una oferta.`,
          intent: 'PROMISE_CONTRACT',
        },
        {
          id: 'ctr-challenge',
          label: 'Sostené este nivel en cancha y hablamos de números.',
          intent: 'CHALLENGE',
        },
        {
          id: 'ctr-firm',
          label: 'Por ahora el club va a esperar antes de renovar.',
          intent: 'FIRM',
        },
      ];
    case 'TRANSFER_RUMOR':
      return [
        {
          id: 'trf-support',
          label: `Son solo rumores, sos pieza clave en ${clubName}.`,
          intent: 'SUPPORT',
        },
        {
          id: 'trf-open',
          label: 'Si llega una oferta seria la evaluaremos con vos.',
          intent: 'OPEN_TRANSFER',
        },
        {
          id: 'trf-challenge',
          label: 'Concentrate en entrenar y dejá el mercado de lado.',
          intent: 'CHALLENGE',
        },
      ];
    case 'DRESSING_ROOM_CONFLICT':
      return [
        {
          id: 'drc-calm',
          label: 'Necesito que sumes al grupo y bajemos las tensiones.',
          intent: 'CALM_GROUP',
        },
        {
          id: 'drc-support',
          label: 'Contás con mi respaldo para ordenar el vestuario.',
          intent: 'SUPPORT',
        },
        {
          id: 'drc-firm',
          label: 'Acá las cosas se resuelven jugando al 100% en cancha.',
          intent: 'FIRM',
        },
      ];
    case 'POST_MATCH_WARNING':
      return [
        {
          id: 'pmw-challenge',
          label: 'Necesito mucha más intensidad tuya en el próximo partido.',
          intent: 'CHALLENGE',
        },
        {
          id: 'pmw-support',
          label: 'Todos tenemos un mal partido, levantá la cabeza y seguí.',
          intent: 'SUPPORT',
        },
        {
          id: 'pmw-firm',
          label: 'Si no mejora tu nivel voy a tener que hacer cambios.',
          intent: 'FIRM',
        },
      ];
    case 'POST_MATCH_PRAISE':
      return [
        {
          id: 'pmp-support',
          label: 'Jugaste un partidazo, quiero verte mantener ese nivel.',
          intent: 'SUPPORT',
        },
        {
          id: 'pmp-challenge',
          label: 'Fuiste decisivo, mantené esa exigencia cada semana.',
          intent: 'CHALLENGE',
        },
        {
          id: 'pmp-firm',
          label: 'Muy bien, ahora cabeza rápida en el próximo rival.',
          intent: 'FIRM',
        },
      ];
    default:
      return [
        {
          id: 'gen-support',
          label: 'Estoy conforme con tu entrega, seguí así esta semana.',
          intent: 'SUPPORT',
        },
        {
          id: 'gen-challenge',
          label: 'Necesito un plus tuyo en los entrenamientos y en el juego.',
          intent: 'CHALLENGE',
        },
        {
          id: 'gen-firm',
          label: `Acá nadie tiene el puesto asegurado en ${clubName}.`,
          intent: 'FIRM',
        },
      ];
  }
}

export async function checkPlayerChatAvailability(): Promise<boolean> {
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

export function ensureInitialGreeting(
  player: Player,
  clubName: string,
  currentDate: Date
): boolean {
  if (!player.chatHistory) {
    player.chatHistory = [];
  }
  const hasOpening = player.chatHistory.some((m) => m.sender === 'PLAYER');
  if (player.pendingDialogue && player.chatHistory.length === 0) {
    player.chatHistory.push({
      id: generateUUID(),
      sender: 'PLAYER',
      text: getPlayerMotiveOpening(player, clubName),
      dateIso: currentDate.toISOString(),
    });
    return true;
  }
  if (!hasOpening && player.chatHistory.length === 0) {
    player.chatHistory.push({
      id: generateUUID(),
      sender: 'PLAYER',
      text: getPlayerMotiveOpening(player, clubName),
      dateIso: currentDate.toISOString(),
    });
    return true;
  }
  return false;
}

export function resolvePendingDialogueManually(playerId: string, currentDate: Date) {
  const player = world.getPlayer(playerId);
  if (!player || !player.pendingDialogue) return;
  if (!player.chatHistory) player.chatHistory = [];
  player.chatHistory.push({
    id: generateUUID(),
    sender: 'SYSTEM',
    text: `Charla cerrada sobre: ${getMotiveBadgeLabel(player.pendingDialogue)}.`,
    dateIso: currentDate.toISOString(),
  });
  if (player.chatHistory.length > 30) {
    player.chatHistory = player.chatHistory.slice(-30);
  }
  clearPlayerDialogue(playerId);
  notifyAll();
}

function applyChatTurnOutcome(
  player: Player,
  managerMessage: string,
  data: PlayerChatApiResponse,
  currentDate: Date
): { response: PlayerChatApiResponse; appliedPromise: PlayerPromise | null } {
  if (!player.chatHistory) player.chatHistory = [];
  if (!player.activePromises) player.activePromises = [];

  const nowIso = currentDate.toISOString();

  player.chatHistory.push({
    id: generateUUID(),
    sender: 'MANAGER',
    text: managerMessage,
    dateIso: nowIso,
  });

  player.morale = Math.max(0, Math.min(100, (player.morale ?? 50) + data.moraleDelta));
  world.adjustRelationship(
    'COACH',
    player.id,
    data.trustDelta,
    Math.round(data.trustDelta * 0.5),
    data.tensionDelta
  );

  if (data.transferRequestAction === 'WITHDRAW' && player.transferRequestReason) {
    player.transferRequestReason = undefined;
    player.isTransferListed = false;
  } else if (data.transferRequestAction === 'REQUEST' && !player.transferRequestReason) {
    player.transferRequestReason = 'Solicitó salir tras diferencias en una charla privada';
  }

  let appliedPromise: PlayerPromise | null = null;
  if (data.promiseCreated) {
    const pc = data.promiseCreated;
    const isMatchBased =
      pc.category === 'PLAYING_TIME' ||
      pc.category === 'TACTICAL_ROLE' ||
      pc.category === 'POSITION_ROLE';
    const matchesDur = isMatchBased ? Math.max(2, Math.min(10, pc.matchesDuration || 4)) : undefined;
    const deadlineDays = pc.deadlineDays || (isMatchBased ? undefined : 21);
    const deadlineDate =
      typeof deadlineDays === 'number'
        ? new Date(currentDate.getTime() + deadlineDays * 24 * 60 * 60 * 1000)
        : undefined;

    const existingSameIdx = player.activePromises.findIndex(
      (pr) => pr.status === 'ACTIVE' && pr.category === pc.category
    );
    const newPromise: PlayerPromise = {
      id: generateUUID(),
      category: pc.category,
      summary: pc.summary,
      status: 'ACTIVE',
      createdDateIso: nowIso,
      deadlineDateIso: deadlineDate?.toISOString(),
      matchesRemaining: matchesDur,
      matchesRequired: matchesDur ? Math.max(2, Math.ceil(matchesDur * 0.65)) : undefined,
      matchesFulfilled: matchesDur ? 0 : undefined,
    };
    if (existingSameIdx >= 0) {
      player.activePromises[existingSameIdx] = newPromise;
    } else {
      player.activePromises.push(newPromise);
    }
    if (player.activePromises.length > 15) {
      player.activePromises = player.activePromises.slice(-15);
    }
    appliedPromise = newPromise;

    world.addInboxMessage(
      'SQUAD',
      `Promesa acordada con ${player.name}`,
      `${pc.summary}${matchesDur ? ` (Plazo: ${matchesDur} partidos)` : deadlineDate ? ` (Hasta ${deadlineDate.toLocaleDateString('es-AR')})` : ''}.`,
      currentDate,
      player.id
    );
  }

  player.chatHistory.push({
    id: generateUUID(),
    sender: 'PLAYER',
    text: data.reply,
    dateIso: nowIso,
    tone: data.tone,
    moraleDelta: data.moraleDelta,
    tensionDelta: data.tensionDelta,
    trustDelta: data.trustDelta,
    promiseSummary: appliedPromise?.summary,
  });

  if (appliedPromise) {
    player.chatHistory.push({
      id: generateUUID(),
      sender: 'SYSTEM',
      text: `Promesa asumida: ${appliedPromise.summary}${
        appliedPromise.matchesRemaining
          ? ` (${appliedPromise.matchesRequired}/${appliedPromise.matchesRemaining} partidos)`
          : ''
      }`,
      dateIso: nowIso,
    });
  }

  if (data.shouldResolvePending && player.pendingDialogue) {
    clearPlayerDialogue(player.id);
  }

  if (player.chatHistory.length > 30) {
    player.chatHistory = player.chatHistory.slice(-30);
  }

  world.recordInteraction({
    id: generateUUID(),
    date: currentDate,
    channel: 'COACH_PLAYER',
    actorId: 'COACH',
    targetId: player.id,
    type:
      data.tone === 'NEGATIVE'
        ? 'WARN_CONDUCT'
        : data.moraleDelta >= 5
        ? 'PRAISE_FORM'
        : 'TACTICAL_ADVICE',
    tone: data.tone === 'NEGATIVE' ? 'AGGRESSIVE' : data.tone === 'POSITIVE' ? 'MILD' : 'MODERATE',
    result: data.tone,
    moraleChange: data.moraleDelta,
    tensionChange: data.tensionDelta,
    description: `${managerMessage.slice(0, 80)} → ${data.reply.slice(0, 120)}`,
  });

  notifyAll();
  return { response: data, appliedPromise };
}

export async function sendPlayerChatMessage(
  player: Player,
  clubId: string,
  managerMessage: string,
  currentDate: Date
): Promise<{ response: PlayerChatApiResponse; appliedPromise: PlayerPromise | null }> {
  const trimmed = managerMessage.trim();
  if (!trimmed) {
    throw new Error('Escribí un mensaje antes de enviar.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sin conexión a internet.');
  }

  const club = world.getClub(clubId || player.clubId) || world.getClub(player.clubId);
  const clubName = club?.name || 'el club';
  const gs = useGameStore.getState();

  let leaguePosition: number | null = null;
  if (club?.leagueId) {
    const table = world.getLeagueTable(club.leagueId, gs.fixtures, 'SENIOR');
    const idx = table.findIndex((row) => row.clubId === club.id);
    if (idx >= 0) leaguePosition = idx + 1;
  }

  let recentForm = '';
  if (club) {
    const recent = gs.fixtures
      .filter(
        (f) =>
          f.played &&
          f.squadType === 'SENIOR' &&
          (f.homeTeamId === club.id || f.awayTeamId === club.id)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);
    recentForm = recent
      .map((f) => {
        const isHome = f.homeTeamId === club.id;
        const gf = isHome ? f.homeScore ?? 0 : f.awayScore ?? 0;
        const ga = isHome ? f.awayScore ?? 0 : f.homeScore ?? 0;
        return gf > ga ? 'G' : gf === ga ? 'E' : 'P';
      })
      .join('');
  }

  const rel = world.getRelationship('COACH', player.id);
  const contractMonthsLeft = player.contractExpiry
    ? Math.max(
        0,
        Math.round(
          (new Date(player.contractExpiry).getTime() - currentDate.getTime()) /
            (1000 * 60 * 60 * 24 * 30)
        )
      )
    : null;
  const avgRating =
    player.formRatings && player.formRatings.length > 0
      ? player.formRatings.reduce((acc, r) => acc + r, 0) / player.formRatings.length
      : null;

  const history = (player.chatHistory || []).slice(-12).map((m) => ({
    sender: m.sender,
    text: m.text,
  }));

  const payload = {
    player: {
      id: player.id,
      name: player.name,
      age: player.age,
      nationality: player.nationality,
      positions: player.positions,
      personality: player.personality || 'PROFESSIONAL',
      morale: Math.round(player.morale ?? 65),
      fitness: Math.round(player.fitness ?? 85),
      currentAbility: player.currentAbility,
      isStarter: Boolean(player.isStarter),
      seasonApps: player.seasonStats?.appearances ?? 0,
      seasonGoals: player.seasonStats?.goals ?? 0,
      seasonAssists: player.seasonStats?.assists ?? 0,
      avgRating,
      contractMonthsLeft,
      salary: player.salary,
      transferRequestReason: player.transferRequestReason,
      pendingDialogue: player.pendingDialogue,
      trust: Math.round(rel.trust),
      respect: Math.round(rel.respect),
      tension: Math.round(rel.tension),
      activePromises: (player.activePromises || [])
        .filter((pr) => pr.status === 'ACTIVE')
        .map((pr) => ({
          id: pr.id,
          category: pr.category,
          summary: pr.summary,
          status: pr.status,
          matchesLeft: pr.matchesRemaining,
          deadlineDateIso: pr.deadlineDateIso,
        })),
    },
    club: {
      name: clubName,
      shortName: club?.shortName,
      leaguePosition,
      recentForm,
      managerName: world.managerProfile?.fullName || 'Director Técnico',
    },
    currentDateIso: currentDate.toISOString(),
    conversationHistory: history,
    managerMessage: trimmed,
  };

  const res = await fetch('/api/player-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(18000),
  });

  let data: PlayerChatApiResponse | { error?: string };
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

  return applyChatTurnOutcome(player, trimmed, data, currentDate);
}

export function sendPlayerFormulaReply(
  player: Player,
  clubId: string,
  suggestion: FormulaSuggestion,
  currentDate: Date
): { response: PlayerChatApiResponse; appliedPromise: PlayerPromise | null } {
  const club = world.getClub(clubId || player.clubId) || world.getClub(player.clubId);
  const clubName = club?.name || 'el club';
  const personality = player.personality || 'PROFESSIONAL';
  const motive = player.pendingDialogue || 'GENERAL';
  const last = getLastName(player);

  let reply = '';
  let tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
  let moraleDelta = 0;
  let tensionDelta = 0;
  let trustDelta = 0;
  let shouldResolvePending = true;
  let transferRequestAction: 'KEEP' | 'WITHDRAW' | 'REQUEST' = 'KEEP';
  let promiseCreated: PlayerChatApiResponse['promiseCreated'] = null;

  switch (suggestion.intent) {
    case 'PROMISE_MINUTES':
      tone = 'POSITIVE';
      moraleDelta = 7;
      trustDelta = 6;
      tensionDelta = -10;
      promiseCreated = {
        category: 'PLAYING_TIME',
        summary: `Darle minutos reales a ${last} en los próximos 4 partidos`,
        matchesDuration: 4,
      };
      reply =
        personality === 'VOLATILE'
          ? `Eso quería escuchar, míster. Si me da minutos en estos partidos le voy a responder adentro de la cancha.`
          : `Le tomo la palabra, profe. Voy a estar preparado para aprovechar cada oportunidad que me dé en ${clubName}.`;
      break;

    case 'PROMISE_CONTRACT':
      tone = 'POSITIVE';
      moraleDelta = 6;
      trustDelta = 6;
      tensionDelta = -9;
      promiseCreated = {
        category: 'CONTRACT_OFFER',
        summary: `Acercar una propuesta de renovación para ${last}`,
        deadlineDays: 21,
      };
      reply =
        personality === 'MERCENARY'
          ? `Me parece perfecto, míster. Si la oferta está a la altura, cerramos cuanto antes.`
          : `Qué tranquilidad me da saber que me quiere en ${clubName}. Espero la charla por la renovación.`;
      break;

    case 'OPEN_TRANSFER':
      tone = 'NEUTRAL';
      moraleDelta = 1;
      trustDelta = 2;
      tensionDelta = -4;
      promiseCreated = {
        category: 'TRANSFER_DECISION',
        summary: `Evaluar ofertas concretas por ${last}`,
        deadlineDays: 21,
      };
      reply = `Valoro que sea frontal conmigo, míster. Mientras siga defendiendo a ${clubName}, voy a dejar todo en cada práctica.`;
      break;

    case 'CALM_GROUP':
      tone = 'POSITIVE';
      moraleDelta = 4;
      trustDelta = 5;
      tensionDelta = -9;
      reply =
        personality === 'LEADER'
          ? `Cuente conmigo, profe. Voy a hablar con los muchachos para tirar todos para el mismo lado.`
          : `Tiene razón, míster. Vamos a bajar un cambio y enfocarnos en el grupo.`;
      break;

    case 'SUPPORT':
      if (
        (motive === 'MINUTES_DISCONTENT' || motive === 'CONTRACT_EXPIRING') &&
        (personality === 'VOLATILE' || personality === 'MERCENARY')
      ) {
        tone = 'NEUTRAL';
        moraleDelta = 2;
        trustDelta = 1;
        tensionDelta = -2;
        shouldResolvePending = false;
        reply = `Agradezco las palabras, míster, pero necesito hechos concretos dentro de poco en ${clubName}.`;
      } else {
        tone = 'POSITIVE';
        moraleDelta = 5;
        trustDelta = 5;
        tensionDelta = -7;
        if (motive === 'TRANSFER_RUMOR') transferRequestAction = 'WITHDRAW';
        reply =
          personality === 'LOYAL' || personality === 'LEADER'
            ? `Gracias por el respaldo, míster. Acá estoy al firme para lo que necesite ${clubName}.`
            : `Me sirve mucho sentir su confianza, profe. Voy a seguir metiéndole para sostener este nivel.`;
      }
      break;

    case 'CHALLENGE':
      if (personality === 'VOLATILE' || personality === 'LAZY') {
        tone = 'NEGATIVE';
        moraleDelta = -3;
        trustDelta = -2;
        tensionDelta = 6;
        reply =
          personality === 'LAZY'
            ? `Bueno, profe, tampoco es para exigirme así... pero voy a tratar de meterle un poco más.`
            : `Si cree que me falta actitud, míster, lo voy a discutir en la cancha, pero no comparto esa lectura.`;
      } else {
        tone = 'POSITIVE';
        moraleDelta = 4;
        trustDelta = 4;
        tensionDelta = -3;
        reply = `Acepto el desafío, míster. Voy a doblar el esfuerzo esta semana para demostrarle que estoy para titular.`;
      }
      break;

    case 'FIRM':
      if (personality === 'VOLATILE' || personality === 'AMBITIOUS' || personality === 'MERCENARY') {
        tone = 'NEGATIVE';
        moraleDelta = -6;
        trustDelta = -5;
        tensionDelta = 10;
        if (motive === 'TRANSFER_RUMOR' || motive === 'MINUTES_DISCONTENT') {
          transferRequestAction = 'REQUEST';
        }
        reply = `No me gusta esa postura tan fría, míster. Si la situación no cambia, voy a tener que pensar en mi futuro.`;
      } else {
        tone = 'NEUTRAL';
        moraleDelta = 0;
        trustDelta = 1;
        tensionDelta = 0;
        reply = `Entendido, míster. Respeto su decisión técnica y sigo trabajando a disposición del equipo.`;
      }
      break;
  }

  const outcome: PlayerChatApiResponse = {
    reply,
    tone,
    moraleDelta,
    tensionDelta,
    trustDelta,
    shouldResolvePending,
    transferRequestAction,
    promiseCreated,
    suggestedReplies: [],
  };

  return applyChatTurnOutcome(player, suggestion.label, outcome, currentDate);
}

function finalizePromise(
  player: Player,
  promise: PlayerPromise,
  status: 'FULFILLED' | 'BROKEN',
  currentDate: Date,
  reason: string
) {
  promise.status = status;
  if (!player.chatHistory) player.chatHistory = [];

  if (status === 'FULFILLED') {
    player.morale = Math.max(0, Math.min(100, (player.morale ?? 60) + 8));
    world.adjustRelationship('COACH', player.id, 10, 6, -10);
    player.chatHistory.push({
      id: generateUUID(),
      sender: 'SYSTEM',
      text: `Promesa cumplida: ${promise.summary}. ${reason}`,
      dateIso: currentDate.toISOString(),
    });
    world.addInboxMessage(
      'SQUAD',
      `Promesa cumplida: ${player.name}`,
      `${player.name} valora que cumpliste tu palabra (${promise.summary}). Su moral y confianza suben.`,
      currentDate,
      player.id
    );
  } else {
    player.morale = Math.max(0, Math.min(100, (player.morale ?? 60) - 14));
    world.adjustRelationship('COACH', player.id, -15, -8, 18);
    if (!player.pendingDialogue) {
      player.pendingDialogue =
        promise.category === 'CONTRACT_OFFER' ? 'CONTRACT_EXPIRING' : 'MINUTES_DISCONTENT';
    }
    player.chatHistory.push({
      id: generateUUID(),
      sender: 'SYSTEM',
      text: `Promesa incumplida: ${promise.summary}. ${reason}`,
      dateIso: currentDate.toISOString(),
    });
    world.addInboxMessage(
      'SQUAD',
      `Promesa incumplida: ${player.name}`,
      `${player.name} está molesto porque no se cumplió la promesa: "${promise.summary}".`,
      currentDate,
      player.id,
      'IMPORTANT'
    );
  }

  if (player.chatHistory.length > 30) {
    player.chatHistory = player.chatHistory.slice(-30);
  }
}

export function evaluatePlayerPromisesAfterMatch(
  clubId: string,
  stats: Record<string, PlayerMatchStats>,
  currentDate: Date
) {
  const players = world.getPlayersByClub(clubId).filter((p) => p.squad === 'SENIOR');
  let changed = false;

  for (const player of players) {
    if (!player.activePromises || player.activePromises.length === 0) continue;

    for (const pr of player.activePromises) {
      if (pr.status !== 'ACTIVE') continue;
      if (
        pr.category !== 'PLAYING_TIME' &&
        pr.category !== 'TACTICAL_ROLE' &&
        pr.category !== 'POSITION_ROLE'
      ) {
        continue;
      }

      const st = stats[player.id];
      const playedMeaningful =
        pr.category === 'PLAYING_TIME'
          ? Boolean(st && st.minutesPlayed >= 20)
          : Boolean(st && st.minutesPlayed >= 45);

      if (playedMeaningful) {
        pr.matchesFulfilled = (pr.matchesFulfilled ?? 0) + 1;
      }
      if (typeof pr.matchesRemaining === 'number') {
        pr.matchesRemaining = Math.max(0, pr.matchesRemaining - 1);
      }

      const required = pr.matchesRequired ?? 2;
      const fulfilled = pr.matchesFulfilled ?? 0;
      const remaining = pr.matchesRemaining ?? 0;

      if (fulfilled >= required) {
        finalizePromise(
          player,
          pr,
          'FULFILLED',
          currentDate,
          'Cumplió la cuota de protagonismo acordada.'
        );
        changed = true;
      } else if (remaining <= 0 || fulfilled + remaining < required) {
        finalizePromise(
          player,
          pr,
          'BROKEN',
          currentDate,
          'No tuvo el rodaje prometido en el plazo acordado.'
        );
        changed = true;
      } else {
        changed = true;
      }
    }
  }

  if (changed) notifyAll();
}

export function evaluatePlayerPromisesDaily(clubId: string, currentDate: Date) {
  const players = world.getPlayersByClub(clubId);
  const nowTs = currentDate.getTime();
  let changed = false;

  for (const player of players) {
    if (!player.activePromises || player.activePromises.length === 0) continue;

    for (const pr of player.activePromises) {
      if (pr.status !== 'ACTIVE') continue;

      if (pr.category === 'TRANSFER_DECISION') {
        if (player.transferStatus === 'TRANSFERABLE' || player.isTransferListed) {
          finalizePromise(
            player,
            pr,
            'FULFILLED',
            currentDate,
            'El club facilitó su situación de mercado.'
          );
          changed = true;
          continue;
        }
      }

      if (pr.deadlineDateIso) {
        const deadlineTs = new Date(pr.deadlineDateIso).getTime();
        if (Number.isFinite(deadlineTs) && nowTs > deadlineTs) {
          finalizePromise(
            player,
            pr,
            'BROKEN',
            currentDate,
            'Se venció el plazo sin novedades concretas.'
          );
          changed = true;
        }
      }
    }
  }

  if (changed) notifyAll();
}

export function markContractPromiseFulfilled(player: Player, currentDate: Date) {
  if (!player.activePromises || player.activePromises.length === 0) return;
  let changed = false;

  for (const pr of player.activePromises) {
    if (pr.status === 'ACTIVE' && pr.category === 'CONTRACT_OFFER') {
      finalizePromise(
        player,
        pr,
        'FULFILLED',
        currentDate,
        'Se cerró la renovación contractual acordada.'
      );
      changed = true;
    }
  }

  if (changed) notifyAll();
}
