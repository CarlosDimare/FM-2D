import { world } from './worldManager';
import { Player } from '../types';
import { useGameStore } from '../stores/gameStore';

export type PlayerDialogueMotive =
  | 'MINUTES_DISCONTENT'
  | 'CONTRACT_EXPIRING'
  | 'TRANSFER_RUMOR'
  | 'DRESSING_ROOM_CONFLICT'
  | 'PRE_MATCH_CHAT'
  | 'POST_MATCH_PRAISE'
  | 'POST_MATCH_WARNING'
  | 'CONTRACT_RENEWAL';

const DAY_MS = 1000 * 60 * 60 * 24;
const MAX_PENDING_DIALOGUES_PER_CLUB = 2;

function resolveSimDate(date?: Date): Date {
  return date || useGameStore.getState().currentDate || new Date(2008, 6, 20);
}

export function getDaysSinceLastDialogue(playerId: string, simDate?: Date): number | null {
  const refDate = resolveSimDate(simDate);
  const recent = (world.interactionLog || [])
    .filter(
      (entry) =>
        entry.channel === 'COACH_PLAYER' &&
        (entry.targetId === playerId || entry.actorId === playerId)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (!recent) return null;
  const diff = (refDate.getTime() - new Date(recent.date).getTime()) / DAY_MS;
  return Math.max(0, Math.floor(diff));
}

function isOnDialogueCooldown(playerId: string, simDate: Date, cooldownDays = 35): boolean {
  const days = getDaysSinceLastDialogue(playerId, simDate);
  return days !== null && days < cooldownDays;
}

function getClubPlayedFixturesCount(clubId: string): number {
  const fixtures = useGameStore.getState().fixtures || [];
  return fixtures.filter(
    (f) =>
      f.played &&
      f.squadType === 'SENIOR' &&
      (f.homeTeamId === clubId || f.awayTeamId === clubId)
  ).length;
}

export function detectPlayerDialogueTriggers(clubId: string, currentDate?: Date): Player[] {
  const simDate = resolveSimDate(currentDate);
  const players = world.getPlayersByClub(clubId).filter((p) => p.squad === 'SENIOR' && !p.injury);
  const existingPending = players.filter((p) => Boolean(p.pendingDialogue));
  const triggered: Player[] = [...existingPending];

  if (existingPending.length >= MAX_PENDING_DIALOGUES_PER_CLUB) {
    return triggered;
  }

  const teamPlayedCount = getClubPlayedFixturesCount(clubId);

  for (const player of players) {
    if (triggered.length >= MAX_PENDING_DIALOGUES_PER_CLUB) break;
    if (player.pendingDialogue) continue;
    if (isOnDialogueCooldown(player.id, simDate, 35)) continue;

    const personality = player.personality || 'PROFESSIONAL';
    if (personality === 'LAZY') continue;

    // 1. Conflicto real en el vestuario (tensión muy alta, probabilidad acotada)
    if (player.playerTensions) {
      const highTensions = Object.entries(player.playerTensions).filter(([, tension]) => tension >= 72);
      if (highTensions.length > 0 && Math.random() < 0.12) {
        player.pendingDialogue = 'DRESSING_ROOM_CONFLICT';
        triggered.push(player);
        continue;
      }
    }

    // 2. Pedido o rumor concreto de traspaso
    if (player.transferRequestReason && Math.random() < 0.25) {
      player.pendingDialogue = 'TRANSFER_RUMOR';
      triggered.push(player);
      continue;
    }

    // 3. Contrato por vencer (< 5 meses reales del calendario simulado, con temporada ya iniciada)
    if (teamPlayedCount >= 3 && player.contractExpiry) {
      const monthsUntilExpiry =
        (new Date(player.contractExpiry).getTime() - simDate.getTime()) / (DAY_MS * 30);
      if (monthsUntilExpiry > 0 && monthsUntilExpiry < 5 && (player.currentAbility >= 68 || Math.random() < 0.1)) {
        player.pendingDialogue = 'CONTRACT_EXPIRING';
        triggered.push(player);
        continue;
      }
    }

    // 4. Descontento realista por falta de minutos:
    //    Recién después de >= 6 partidos oficiales jugados por el club, suplente habitual con pocos partidos y personalidad exigente o moral caída.
    if (teamPlayedCount >= 6 && !player.isStarter && personality !== 'LOYAL') {
      const seasonApps = player.seasonStats?.appearances || 0;
      const underplayed = seasonApps <= Math.floor(teamPlayedCount * 0.35);
      const proneToComplain = personality === 'AMBITIOUS' || personality === 'VOLATILE' || player.morale < 62;
      if (underplayed && proneToComplain && Math.random() < 0.12) {
        player.pendingDialogue = 'MINUTES_DISCONTENT';
        triggered.push(player);
        continue;
      }
    }
  }

  return triggered;
}

export function detectManagerInitiatedTriggers(
  clubId: string,
  context: 'PRE_MATCH' | 'POST_MATCH' | 'TRAINING',
  currentDate?: Date
): Player[] {
  const simDate = resolveSimDate(currentDate);
  const players = world.getPlayersByClub(clubId).filter((p) => p.squad === 'SENIOR' && !p.injury);
  const existingPending = players.filter((p) => Boolean(p.pendingDialogue));
  const triggered: Player[] = [];

  // Evitar saturar de alertas pendientes en un mismo plantel
  if (existingPending.length >= MAX_PENDING_DIALOGUES_PER_CLUB) {
    return triggered;
  }

  const teamPlayedCount = getClubPlayedFixturesCount(clubId);

  if (context === 'PRE_MATCH') {
    // Nunca marcar a los 11 titulares antes del partido: como máximo 1 referente ocasional tras al menos 2 partidos jugados.
    if (teamPlayedCount < 2 || existingPending.length > 0 || Math.random() > 0.08) {
      return triggered;
    }
    const leader = players
      .filter((p) => p.isStarter && p.fitness >= 80 && !p.pendingDialogue && !isOnDialogueCooldown(p.id, simDate, 45))
      .sort((a, b) => {
        const aScore = (a.personality === 'LEADER' ? 100 : 0) + a.currentAbility;
        const bScore = (b.personality === 'LEADER' ? 100 : 0) + b.currentAbility;
        return bScore - aScore;
      })[0];

    if (leader) {
      leader.pendingDialogue = 'PRE_MATCH_CHAT';
      triggered.push(leader);
    }
    return triggered;
  }

  if (context === 'POST_MATCH') {
    for (const player of players) {
      if (existingPending.length + triggered.length >= MAX_PENDING_DIALOGUES_PER_CLUB) break;
      if (player.pendingDialogue || isOnDialogueCooldown(player.id, simDate, 25)) continue;

      const lastRating = player.formRatings[player.formRatings.length - 1];
      if (lastRating !== undefined && lastRating < 4.5) {
        player.pendingDialogue = 'POST_MATCH_WARNING';
        triggered.push(player);
        break;
      }
      if (
        (player.careerStats?.totalGoals && player.careerStats.totalGoals >= 10 && player.careerStats.totalGoals % 25 === 0) ||
        (lastRating !== undefined && lastRating >= 9.0 && Math.random() < 0.25)
      ) {
        player.pendingDialogue = 'POST_MATCH_PRAISE';
        triggered.push(player);
        break;
      }
    }
    return triggered;
  }

  if (context === 'TRAINING') {
    if (teamPlayedCount < 4) return triggered;
    for (const player of players) {
      if (existingPending.length + triggered.length >= MAX_PENDING_DIALOGUES_PER_CLUB) break;
      if (player.pendingDialogue || !player.contractExpiry || isOnDialogueCooldown(player.id, simDate, 45)) continue;

      const monthsUntilExpiry =
        (new Date(player.contractExpiry).getTime() - simDate.getTime()) / (DAY_MS * 30);
      if (monthsUntilExpiry >= 5 && monthsUntilExpiry < 10 && player.currentAbility >= 65 && Math.random() < 0.15) {
        player.pendingDialogue = 'CONTRACT_RENEWAL';
        triggered.push(player);
        break;
      }
    }
  }

  return triggered;
}

export function clearPlayerDialogue(playerId: string) {
  const player = world.getPlayer(playerId);
  if (player) {
    player.pendingDialogue = undefined;
  }
}
