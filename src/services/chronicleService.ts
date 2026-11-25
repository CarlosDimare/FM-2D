import {
  Fixture,
  FixtureMatchReport,
  FixtureMatchReportCard,
  FixtureMatchReportGoal,
  FixtureMatchReportLineupEntry,
  FixtureMatchReportStats,
  Player,
  PlayerMatchStats,
  Club,
  Chronicle,
  MatchEvent,
  NationalTeamChronicleContext,
} from '../types';
import { world } from './worldManager';
import { generateUUID } from './utils';

export interface BuildMatchReportMeta {
  squadType?: string;
  summary?: Partial<FixtureMatchReportStats> & {
    homeFormation?: string;
    awayFormation?: string;
  };
}

export function buildFixtureMatchReport(
  events: MatchEvent[],
  stats: Record<string, PlayerMatchStats>,
  homeTeamId: string,
  awayTeamId: string,
  meta?: BuildMatchReportMeta
): FixtureMatchReport {
  const goals: FixtureMatchReportGoal[] = [];
  const cards: FixtureMatchReportCard[] = [];

  for (const ev of events || []) {
    if (ev.type === 'GOAL') {
      const player = ev.playerId ? world.getPlayer(ev.playerId) : undefined;
      goals.push({
        minute: Math.max(1, Math.round(ev.minute || 1)),
        playerId: player?.id || ev.playerId,
        playerName: player?.name || 'Gol',
        teamId: ev.teamId || player?.clubId || homeTeamId,
        shotType: ev.shotType,
      });
    } else if (ev.type === 'YELLOW_CARD' || ev.type === 'RED_CARD') {
      const player = ev.playerId ? world.getPlayer(ev.playerId) : undefined;
      if (player) {
        cards.push({
          minute: Math.max(1, Math.round(ev.minute || 1)),
          playerId: player.id,
          playerName: player.name,
          teamId: ev.teamId || player.clubId || homeTeamId,
          type: ev.type === 'RED_CARD' ? 'RED' : 'YELLOW',
        });
      }
    }
  }

  let bestId = '';
  let bestName = '';
  let bestTeamId = homeTeamId;
  let bestRating = 0;
  let homeShots = 0;
  let awayShots = 0;
  let homeShotsOnTarget = 0;
  let awayShotsOnTarget = 0;
  let homeFouls = 0;
  let awayFouls = 0;
  let homePasses = 0;
  let awayPasses = 0;

  const homeLineup: FixtureMatchReportLineupEntry[] = [];
  const awayLineup: FixtureMatchReportLineupEntry[] = [];

  for (const [pid, st] of Object.entries(stats || {})) {
    const pl = world.getPlayer(pid);
    if (!pl) continue;
    const isAwayPlayer = pl.clubId === awayTeamId || (pl as any).nationalTeamId === awayTeamId;
    const teamId = isAwayPlayer ? awayTeamId : homeTeamId;

    if (teamId === homeTeamId) {
      homeShots += st.shots || 0;
      homeShotsOnTarget += st.shotsOnTarget || 0;
      homeFouls += st.foulsCommitted || 0;
      homePasses += st.passesCompleted || 0;
    } else {
      awayShots += st.shots || 0;
      awayShotsOnTarget += st.shotsOnTarget || 0;
      awayFouls += st.foulsCommitted || 0;
      awayPasses += st.passesCompleted || 0;
    }

    if ((st.minutesPlayed || 0) > 0 && (st.rating || 0) > bestRating) {
      bestRating = st.rating;
      bestId = pl.id;
      bestName = pl.name;
      bestTeamId = teamId;
    }

    if ((st.minutesPlayed || 0) > 0 || pl.isStarter) {
      const entry: FixtureMatchReportLineupEntry = {
        playerId: pl.id,
        playerName: pl.name,
        role: pl.primaryPosition || pl.positions[0] || 'MC',
        isStarter: Boolean(pl.isStarter && (st.minutesPlayed || 0) > 0 ? (st.minutesPlayed || 0) >= 45 || pl.isStarter : pl.isStarter),
        minutesPlayed: Math.round(st.minutesPlayed || 0),
        rating: Number((st.rating || 6.3).toFixed(1)),
        goals: st.goals || 0,
        assists: st.assists || 0,
        card: st.card,
      };
      if (teamId === awayTeamId) awayLineup.push(entry);
      else homeLineup.push(entry);
    }

    if (goals.length === 0 && (st.goals || 0) > 0) {
      for (let g = 0; g < st.goals; g++) {
        goals.push({
          minute: Math.min(90, 14 + goals.length * 17),
          playerId: pl.id,
          playerName: pl.name,
          teamId,
        });
      }
    }
    if (cards.length === 0 && st.card) {
      cards.push({
        minute: 38 + cards.length * 14,
        playerId: pl.id,
        playerName: pl.name,
        teamId,
        type: st.card,
      });
    }
  }

  const sortLineup = (list: FixtureMatchReportLineupEntry[]) =>
    list.sort((a, b) => {
      if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
      if (a.role === 'GK' || a.role === 'POR') return -1;
      if (b.role === 'GK' || b.role === 'POR') return 1;
      return b.minutesPlayed - a.minutesPlayed || b.rating - a.rating;
    }).slice(0, 18);

  sortLineup(homeLineup);
  sortLineup(awayLineup);

  goals.sort((a, b) => a.minute - b.minute);
  cards.sort((a, b) => a.minute - b.minute);

  const summary = meta?.summary;
  const totalPasses = homePasses + awayPasses;
  const fallbackPossHome = totalPasses > 0 ? Math.max(30, Math.min(70, Math.round((homePasses / totalPasses) * 100))) : 50;
  const homePossession = summary?.homePossession ?? fallbackPossHome;
  const awayPossession = summary?.awayPossession ?? (100 - homePossession);
  const resolvedHomeShots = summary?.homeShots ?? homeShots;
  const resolvedAwayShots = summary?.awayShots ?? awayShots;
  const resolvedHomeOnTarget = summary?.homeShotsOnTarget ?? Math.min(resolvedHomeShots, homeShotsOnTarget);
  const resolvedAwayOnTarget = summary?.awayShotsOnTarget ?? Math.min(resolvedAwayShots, awayShotsOnTarget);

  const resolvedStats: FixtureMatchReportStats = {
    homePossession,
    awayPossession,
    homeShots: resolvedHomeShots,
    awayShots: resolvedAwayShots,
    homeShotsOnTarget: resolvedHomeOnTarget,
    awayShotsOnTarget: resolvedAwayOnTarget,
    homeCorners: summary?.homeCorners ?? Math.max(0, Math.round(resolvedHomeShots * 0.42)),
    awayCorners: summary?.awayCorners ?? Math.max(0, Math.round(resolvedAwayShots * 0.42)),
    homeFouls: summary?.homeFouls ?? homeFouls,
    awayFouls: summary?.awayFouls ?? awayFouls,
    homeOffsides: summary?.homeOffsides ?? 0,
    awayOffsides: summary?.awayOffsides ?? 0,
    homeXg: summary?.homeXg,
    awayXg: summary?.awayXg,
  };

  const homeClubTactic = undefined;
  const awayClubTactic = undefined;

  return {
    goals: goals.slice(0, 14),
    cards: cards.slice(0, 12),
    mvp: bestName ? { playerId: bestId || undefined, playerName: bestName, teamId: bestTeamId, rating: Number(bestRating.toFixed(1)) } : undefined,
    homeShots: resolvedStats.homeShots || undefined,
    awayShots: resolvedStats.awayShots || undefined,
    homeFormation: summary?.homeFormation || homeClubTactic?.formation || '4-4-2',
    awayFormation: summary?.awayFormation || awayClubTactic?.formation || '4-4-2',
    stats: resolvedStats,
    homeLineup,
    awayLineup,
  };
}

const HEADLINES_WIN = [
  "¡Victoria contundente!", "Triunfo que ilusiona", "Los tres puntos se quedan en casa",
  "¡Ganamos con autoridad!", "Victoria que da moral", "El equipo responde",
  "¡Vamos con todo!", "Triunfo merecido", "Noche de festejo", "Victoria trabajada",
];

const HEADLINES_DRAW = [
  "Puntos que se escapan", "Empate que deja gusto amargo", "Un punto que no alcanza",
  "Empate sin brillo", "Se escapan los puntos", "Empate frustrante",
  "Tablas en el marcador", "Reparto de puntos",
];

const HEADLINES_LOSS = [
  "Derrota que duele", "Noche para el olvido", "Golpe duro a la ilusión",
  "Derrota amarga", "El equipo se derrumba", "Mala noche en el campo",
  "Caída inesperada", "El equipo no levanta cabeza",
];

const HEADLINES_THRILLER_WIN = [
  "¡Partidazo y victoria!", "Triunfo de infarto", "Remontada épica",
  "Corazón y garra: se ganó sufriendo", "Victoria con sabor a hazaña",
];

const HEADLINES_BORING = [
  "Aburrimiento en el campo", "Partido para el olvido", "Fútbol escaso, emociones nulas",
  "Cero espectáculo", "Un partido que no merece crónica",
];

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getGoalDescription(scorer: Player, minute: number, shotType?: string): string {
  if (shotType === 'free_kick') {
    return pick([
      `Golazo de tiro libre de ${scorer.name} en el minuto ${minute}`,
      `${scorer.name} clavó un tiro libre magistral al minuto ${minute}`,
    ]);
  }
  if (shotType === 'corner_header') {
    return pick([
      `Cabezazo imponente de ${scorer.name} tras un córner en el minuto ${minute}`,
      `${scorer.name} ganó en lo alto a la salida de un córner al minuto ${minute}`,
    ]);
  }
  if (shotType === 'header') {
    return pick([
      `Cabezazo certero de ${scorer.name} al minuto ${minute}`,
      `${scorer.name} conectó de cabeza a la red en el minuto ${minute}`,
    ]);
  }
  if (shotType === 'long_range') {
    return pick([
      `Misil desde fuera del área de ${scorer.name} en el minuto ${minute}`,
      `${scorer.name} sacó un remate lejano imparable al minuto ${minute}`,
    ]);
  }
  if (shotType === 'volley') {
    return `${scorer.name} empalmó una volea espectacular en el minuto ${minute}`;
  }
  if (shotType === 'curler') {
    return pick([
      `${scorer.name} dibujó una comba exquisita al palo más lejano en el minuto ${minute}`,
      `Golazo con efecto de ${scorer.name} imposible para el arquero al minuto ${minute}`,
    ]);
  }
  if (shotType === 'chip') {
    return `${scorer.name} definió con sutileza de vaselina en el minuto ${minute}`;
  }
  if (shotType === 'penalty') {
    return `${scorer.name} convirtió de penal en el minuto ${minute}`;
  }

  const descs = [
    `${scorer.name} abrió el marcador en el minuto ${minute}`,
    `Golazo de ${scorer.name} en el minuto ${minute}`,
    `${scorer.name} define con clase en el minuto ${minute}`,
    `Tiro imparable de ${scorer.name} en el minuto ${minute}`,
    `${scorer.name} marca en el minuto ${minute}`,
    `${scorer.name} fusila al arquero en el minuto ${minute}`,
  ];
  return pick(descs);
}

function getGoalCommentary(minute: number, scorerName: string, isUserClub: boolean): string {
  const early = minute <= 20;
  const late = minute >= 70;
  const mid = minute > 20 && minute < 70;

  if (early) {
    return pick([
      `Arranque fulminante: ${scorerName} golpea temprano y enciende las alarmas del rival.`,
      `Antes de los 20 minutos, ${scorerName} ya había puesto el 1-0. El partido se abrió de inmediato.`,
      `Gol madrugador de ${scorerName}. El encuentro tomó temperatura desde el vamos.`,
    ]);
  }
  if (late) {
    return pick([
      `En los minutos finales, ${scorerName} apareció para definir con jerarquía. Golpe letal sobre el cierre.`,
      `Sobre el final, cuando todo parecía resuelto, ${scorerName} liquidó el partido con un gol que desató la celebración.`,
      `Cierre de película: ${scorerName} anota en el tramo final y sella la historia.`,
    ]);
  }
  return pick([
    `Transcurrían ${minute} minutos cuando ${scorerName} encontró espacio y no perdonó.`,
    `En plena etapa de control del partido, ${scorerName} rompió la paridad.`,
    `Corría el minuto ${minute} y ${scorerName} ejecutó una jugada brillante para marcar.`,
  ]);
}

function getComment(scorer: Player, minute: number, isUserClub: boolean, shotType?: string): string {
  return `${getGoalDescription(scorer, minute, shotType)}. ${getGoalCommentary(minute, scorer.name, isUserClub)}`;
}

function getAtmosphere(isWin: boolean, isDraw: boolean, isHome: boolean): string {
  if (isWin) {
    return isHome
      ? pick(["La afición celebró con euforia.", "El público aplaudió de pie.", "La hinchada cantó hasta el final.", "Ambiente festivo en las gradas."])
      : pick(["Los hinchas viajeros celebraron lejos de casa.", "La afición visitante se fue feliz.", "Victoria celebrada por la afición visitante."]);
  }
  if (isDraw) {
    return pick(["La afición mostró descontento.", "Silbidos mezclados con aplausos tibios.", "Los hinchas se fueron frustrados."]);
  }
  return isHome
    ? pick(["Silbidos ensordecedores.", "La afición abandonó en silencio.", "Malestar generalizado.", "Decepción en las gradas."])
    : pick(["La afición visitante no pudo celebrar.", "Los hinchas viajeros se marchan decepcionados."]);
}

export function generateMatchChronicle(
  fixture: Fixture,
  homeScore: number,
  awayScore: number,
  stats: Record<string, PlayerMatchStats>,
  userClubId: string,
  events?: MatchEvent[]
): Chronicle | null {
  const homeClub = world.getClub(fixture.homeTeamId);
  const awayClub = world.getClub(fixture.awayTeamId);
  if (!homeClub || !awayClub) return null;

  const existing = world.chronicles.find(
    c => c.type === 'MATCH' && c.fixtureId === fixture.id && c.clubId === userClubId
  );
  if (existing) return existing;

  const isHome = fixture.homeTeamId === userClubId;
  const userClubName = isHome ? homeClub.name : awayClub.name;
  const opponentName = isHome ? awayClub.name : homeClub.name;
  const userScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;
  const win = userScore > oppScore;
  const draw = userScore === oppScore;
  const isGoleada = userScore >= 4 || oppScore >= 4;
  const isThriller = !draw && Math.abs(userScore - oppScore) === 1 && (userScore + oppScore >= 3);
  const isBoring = userScore + oppScore === 0;

  // ── Collect aggregate stats ──
  const allIds = Object.keys(stats);
  const userClubPlayers = world.getPlayersByClub(userClubId).filter(p => p.squad === fixture.squadType);
  const userPlayerIds = new Set(userClubPlayers.map(p => p.id));

  let bestPlayer: Player | null = null, bestRating = 0;
  let worstPlayer: Player | null = null, worstRating = 10;
  let bestPasser: Player | null = null, bestPasses = 0;
  let bestTackler: Player | null = null, bestTackles = 0;
  let totalShots = 0, totalOnTarget = 0;
  let totalUserPasses = 0, totalUserPassesCompleted = 0;
  let totalUserTackles = 0;

  allIds.forEach(pid => {
    const s = stats[pid];
    if (!s || s.minutesPlayed < 30) return;
    totalShots += s.shots || 0;
    totalOnTarget += s.shotsOnTarget || 0;

    if (userPlayerIds.has(pid)) {
      totalUserPasses += s.passesAttempted || 0;
      totalUserPassesCompleted += s.passesCompleted || 0;
      totalUserTackles += s.tacklesCompleted || 0;

      if (s.rating > bestRating) { bestRating = s.rating; bestPlayer = world.getPlayer(pid); }
      if (s.rating < worstRating) { worstRating = s.rating; worstPlayer = world.getPlayer(pid); }
      if ((s.passesCompleted || 0) > bestPasses) { bestPasses = s.passesCompleted || 0; bestPasser = world.getPlayer(pid); }
      if ((s.tacklesCompleted || 0) + (s.interceptions || 0) > bestTackles) {
        bestTackles = (s.tacklesCompleted || 0) + (s.interceptions || 0);
        bestTackler = world.getPlayer(pid);
      }
    }
  });

  // ── Scorers ──
  const goalEvents = (events || []).filter(e => e.type === 'GOAL');
  const scorers: { player: Player; minute: number; shotType?: string }[] = [];
  if (goalEvents.length > 0) {
    // Use real goal events
    goalEvents.forEach(e => {
      const p = world.getPlayer(e.playerId || '');
      if (p) scorers.push({ player: p, minute: e.minute, shotType: e.shotType });
    });
  } else {
    // Fallback: infer from stats with random minutes
    allIds.forEach(pid => {
      const s = stats[pid];
      if (!s || s.goals <= 0) return;
      const p = world.getPlayer(pid);
      if (p) {
        for (let g = 0; g < s.goals; g++) {
          scorers.push({ player: p, minute: 8 + Math.floor(Math.random() * 78) });
        }
      }
    });
  }
  const seen = new Set<string>();
  const uniqueScorers = scorers.filter(s => { if (seen.has(s.player.id + s.minute)) return false; seen.add(s.player.id + s.minute); return true; });
  uniqueScorers.sort((a, b) => a.minute - b.minute);

  const userScorers = uniqueScorers.filter(s => userPlayerIds.has(s.player.id));
  const oppScorers = uniqueScorers.filter(s => !userPlayerIds.has(s.player.id));

  // ── Possession estimate from passes ──
  const allUserPassAttempts = allIds.filter(id => userPlayerIds.has(id)).reduce((s, id) => s + (stats[id]?.passesAttempted || 0), 0);
  const allOppPassAttempts = allIds.filter(id => !userPlayerIds.has(id)).reduce((s, id) => s + (stats[id]?.passesAttempted || 0), 0);
  const totalPassAttempts = allUserPassAttempts + allOppPassAttempts;
  const userPossession = totalPassAttempts > 0 ? Math.round((allUserPassAttempts / totalPassAttempts) * 100) : 50;

  // ── Headline selection ──
  let headline: string;
  if (isBoring) headline = pick(HEADLINES_BORING);
  else if (isGoleada && win) headline = pick(HEADLINES_WIN);
  else if (isThriller && win) headline = pick(HEADLINES_THRILLER_WIN);
  else if (draw) headline = pick(HEADLINES_DRAW);
  else if (win) headline = pick(HEADLINES_WIN);
  else headline = pick(HEADLINES_LOSS);

  // ── Lead paragraph ──
  const scoreStr = `${userScore}-${oppScore}`;
  const devParts: string[] = [];

  if (isGoleada && win) {
    devParts.push(pick([
      `${userClubName} aplastó a ${opponentName} con un contundente ${scoreStr} en una exhibición de fútbol ofensivo.`,
      `Festival de goles de ${userClubName}, que goleó ${scoreStr} a un ${opponentName} completamente superado.`,
      `Baile en el campo: ${userClubName} le pasó por encima a ${opponentName} con un ${scoreStr} que no admite discusión.`,
    ]));
  } else if (isGoleada && !win && !draw) {
    devParts.push(pick([
      `Noche trágica: ${userClubName} fue humillado ${scoreStr} por ${opponentName}.`,
      `${opponentName} le propinó una paliza a ${userClubName}: ${scoreStr}.`,
    ]));
  } else if (isThriller) {
    devParts.push(pick([
      `Partido de infarto: ${userClubName} venció ${scoreStr} a ${opponentName} en un duelo vibrante hasta el último minuto.`,
      `${userClubName} y ${opponentName} regalaron un partidazo que terminó ${scoreStr}.`,
    ]));
  } else if (isBoring) {
    devParts.push(pick([
      `${userClubName} y ${opponentName} firmaron un insípido 0-0. El fútbol brilló por su ausencia.`,
      `Empate sin goles entre ${userClubName} y ${opponentName}. Poco para destacar.`,
    ]));
  } else if (win) {
    devParts.push(pick([
      `En una jornada vibrante, ${userClubName} superó a ${opponentName} por ${scoreStr} y sumó tres puntos clave.`,
      `${userClubName} se impuso con autoridad ante ${opponentName} con un marcador de ${scoreStr}.`,
      `Triunfo trabajado de ${userClubName} sobre ${opponentName}. El ${scoreStr} refleja lo visto en cancha.`,
    ]));
  } else if (draw) {
    devParts.push(pick([
      `${userClubName} y ${opponentName} igualaron ${scoreStr} en un partido parejo que dejó sabor a poco.`,
      `Reparto de puntos entre ${userClubName} y ${opponentName}: ${scoreStr} fue el resultado final.`,
    ]));
  } else {
    devParts.push(pick([
      `${userClubName} cayó derrotado ${scoreStr} frente a ${opponentName} en una tarde para el olvido.`,
      `Golpe duro para ${userClubName}: ${opponentName} se llevó la victoria por ${scoreStr}.`,
    ]));
  }

  // ── Possession & style ──
  const passCompletion = totalUserPasses > 0 ? Math.round((totalUserPassesCompleted / totalUserPasses) * 100) : 0;
  if (userPossession > 55) {
    devParts.push(`El equipo dominó la posesión (${userPossession}%) y manejó los hilos del partido.`);
  } else if (userPossession < 45) {
    devParts.push(`El equipo cedió la posesión (${userPossession}%) y apostó al contragolpe.`);
  } else {
    devParts.push(`La posesión estuvo repartida (${userPossession}%), con ambos equipos alternando el control.`);
  }

  // ── Goal narrative ──
  const firstHalfGoals = uniqueScorers.filter(s => s.minute <= 45);
  const secondHalfGoals = uniqueScorers.filter(s => s.minute > 45);

  if (uniqueScorers.length > 0) {
    if (firstHalfGoals.length > 0) {
      devParts.push(`El primer tiempo arrancó con intensidad.`);
      firstHalfGoals.forEach(s => {
        const isUserGoal = userPlayerIds.has(s.player.id);
        devParts.push(`${getGoalDescription(s.player, s.minute, s.shotType)}. ${getGoalCommentary(s.minute, s.player.name, isUserGoal)}`);
      });
    } else if (!isBoring) {
      devParts.push(`Los primeros 45 minutos transcurrieron con dominio alternado, pero sin goles en la primera etapa.`);
    }

    if (secondHalfGoals.length > 0) {
      devParts.push(`En el complemento, el encuentro ganó en emotividad.`);
      secondHalfGoals.forEach(s => {
        devParts.push(`${getComment(s.player, s.minute, userPlayerIds.has(s.player.id), s.shotType)}`);
      });
    }
  } else if (isBoring) {
    devParts.push(`El partido fue un monólogo sin ideas. Ni ${userClubName} ni ${opponentName} generaron peligro real.`);
  }

  // ── Key performers ──
  if (bestPlayer && bestRating >= 7.5) {
    const extra = bestPlayer.id === bestPasser?.id
      ? ` Además, fue el eje del juego con ${bestPasses} pases completados.`
      : bestPlayer.id === bestTackler?.id
        ? ` Recuperó ${bestTackles} balones y fue un muro.`
        : '';
    devParts.push(`⭐ ${bestPlayer.name} fue la figura del partido (${bestRating.toFixed(1)}).${extra}`);
  } else if (bestPlayer) {
    devParts.push(`${bestPlayer.name} fue el más regular del equipo (${bestRating.toFixed(1)}).`);
  }

  // Best passer (different from best player)
  if (bestPasser && bestPasser.id !== bestPlayer?.id && bestPasses > 25) {
    devParts.push(`${bestPasser.name} fue el motor del equipo con ${bestPasses} pases acertados (${Math.round((stats[bestPasser.id]?.passesCompleted || 0) / Math.max(1, stats[bestPasser.id]?.passesAttempted || 1) * 100)}% de precisión).`);
  }

  // Best defender
  if (bestTackler && bestTackler.id !== bestPlayer?.id && bestTackler.id !== bestPasser?.id && bestTackles > 6) {
    devParts.push(`En defensa, ${bestTackler.name} se destacó con ${bestTackles} recuperaciones.`);
  }

  if (worstPlayer && worstRating < 5.5) {
    devParts.push(`Opaco partido de ${worstPlayer.name} (${worstRating.toFixed(1)}). Su rendimiento quedó en deuda.`);
  }

  // ── Stats paragraph ──
  if (totalShots > 0) {
    devParts.push(`El equipo acumuló ${totalShots} disparos (${totalOnTarget} al arco) y completó ${totalUserPassesCompleted} de ${totalUserPasses} pases (${passCompletion}%).`);
  } else if (!isBoring) {
    devParts.push(`El equipo no logró generar disparos al arco rival.`);
  }

  // ── Tactical analysis based on actual stats ──
  if (isGoleada && win) {
    devParts.push(pick([
      'El plan táctico fue ejecutado a la perfección. Cada pieza encajó con precisión quirúrgica.',
      'Desde el banco se tomaron decisiones estratégicas que inclinaron la balanza a favor.',
    ]));
  } else if (win && userScore >= 2 && oppScore === 0) {
    devParts.push(pick([
      'Victoria con autoridad: el equipo defendió con orden y fue letal en ataque.',
      'Dominio de principio a fin. El rival nunca encontró respuesta táctica.',
    ]));
  } else if (win && userScore === 1 && oppScore === 0) {
    devParts.push(pick([
      'Triunfo por la mínima. El equipo supo defender la ventaja con oficio.',
      'Tres puntos sufridos pero merecidos. La defensa fue clave para mantener el cero.',
    ]));
  } else if (draw && userScore + oppScore >= 3) {
    devParts.push(pick([
      'Partido de ida y vuelta. Las defensas hicieron agua pero el espectáculo estuvo garantizado.',
      'Empate con goles: el equipo mostró carácter para reaccionar pero no alcanzó.',
    ]));
  } else if (draw) {
    devParts.push(pick([
      'Un punto que suma pero que no termina de convencer.',
      'El equipo necesita encontrar más profundidad ofensiva.',
    ]));
  } else if (totalUserPasses > 300 && passCompletion > 75) {
    devParts.push(pick([
      'A pesar del resultado, el equipo mostró buena circulación de balón.',
      'El mediocampo funcionó en la elaboración pero faltó definición.',
    ]));
  } else {
    devParts.push(pick([
      'Una tarde gris: el equipo no encontró su juego y el rival se aprovechó.',
      'Tocará revisar el esquema táctico: el plan nunca se vio en la cancha.',
    ]));
  }

  // ── Atmosphere ──
  devParts.push(getAtmosphere(win, draw, isHome));

  const chronicle: Chronicle = {
    id: generateUUID(),
    type: 'MATCH',
    date: new Date(fixture.date),
    title: headline,
    body: devParts.join('\n\n'),
    fixtureId: fixture.id,
    clubId: userClubId,
  };

  world.chronicles.push(chronicle);
  return chronicle;
}

const NATIONAL_HEADLINES_WIN = [
  '¡Noche de gloria internacional!',
  'La selección responde con autoridad',
  'Tres puntos que ilusionan a todo un país',
  'Victoria que fortalece el proyecto',
];

const NATIONAL_HEADLINES_DRAW = [
  'Reparto de puntos con sabor a poco',
  'La selección rescata un empate',
  'Tablas en una batalla internacional',
];

const NATIONAL_HEADLINES_LOSS = [
  'Golpe para la selección',
  'Una noche internacional para olvidar',
  'La clasificación se complica',
  'Derrota que obliga a reaccionar',
];

function getNationalTeamName(teamId: string): string {
  return world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === teamId)?.name || teamId;
}

function getNationalPlayerIds(teamId: string, squadIds?: string[]): Set<string> {
  if (squadIds && squadIds.length > 0) return new Set(squadIds);
  return new Set(world.getPlayersByNationalTeam(teamId).map(player => player.id));
}

export function generateNationalTeamChronicle(
  fixture: Fixture,
  homeScore: number,
  awayScore: number,
  stats: Record<string, PlayerMatchStats>,
  nationalTeamId: string,
  events: MatchEvent[] = [],
  managerContext?: NationalTeamChronicleContext
): Chronicle | null {
  const homeName = getNationalTeamName(fixture.homeTeamId);
  const awayName = getNationalTeamName(fixture.awayTeamId);
  const userIsHome = fixture.homeTeamId === nationalTeamId;
  const userIsAway = fixture.awayTeamId === nationalTeamId;
  if (!userIsHome && !userIsAway) return null;

  const existingChronicle = world.chronicles.find(c =>
    c.fixtureId === fixture.id && c.nationalTeamId === nationalTeamId
  );
  if (existingChronicle) return existingChronicle;

  const userName = userIsHome ? homeName : awayName;
  const opponentName = userIsHome ? awayName : homeName;
  const userScore = userIsHome ? homeScore : awayScore;
  const opponentScore = userIsHome ? awayScore : homeScore;
  const won = userScore > opponentScore;
  const drawn = userScore === opponentScore;
  const userPlayerIds = getNationalPlayerIds(nationalTeamId, managerContext?.squadIds);
  const allIds = Object.keys(stats);

  let totalShots = 0;
  let totalOnTarget = 0;
  let totalPasses = 0;
  let completedPasses = 0;
  let standout: Player | null = null;
  let standoutRating = 0;

  allIds.forEach(playerId => {
    const playerStats = stats[playerId];
    if (!playerStats) return;
    totalShots += playerStats.shots || 0;
    totalOnTarget += playerStats.shotsOnTarget || 0;
    if (!userPlayerIds.has(playerId)) return;
    totalPasses += playerStats.passesAttempted || 0;
    completedPasses += playerStats.passesCompleted || 0;
    if (playerStats.minutesPlayed > 0 && playerStats.rating > standoutRating) {
      standoutRating = playerStats.rating;
      standout = world.getPlayer(playerId);
    }
  });

  const goalLines = events
    .filter(event => event.type === 'GOAL')
    .map(event => {
      const scorer = world.getPlayer(event.playerId || '');
      return scorer
        ? `${getGoalDescription(scorer, event.minute)}.`
        : `${event.text} en el minuto ${event.minute}.`;
    });
  const competitionName = world.competitions.find(c => c.id === fixture.competitionId)?.name || fixture.competitionId;
  const possessionEstimate = totalPasses > 0
    ? Math.round((totalPasses / Math.max(1, allIds.reduce((sum, id) => sum + (stats[id]?.passesAttempted || 0), 0))) * 100)
    : 50;
  const passAccuracy = totalPasses > 0 ? Math.round((completedPasses / totalPasses) * 100) : 0;
  const score = `${userScore}-${opponentScore}`;
  const headline = won
    ? pick(NATIONAL_HEADLINES_WIN)
    : drawn
      ? pick(NATIONAL_HEADLINES_DRAW)
      : pick(NATIONAL_HEADLINES_LOSS);

  const paragraphs: string[] = [];
  if (won) {
    paragraphs.push(`${userName} se impuso ${score} ante ${opponentName} en ${competitionName}. La victoria refuerza la confianza del grupo y mantiene vivo el objetivo internacional.`);
  } else if (drawn) {
    paragraphs.push(`${userName} igualó ${score} frente a ${opponentName} en ${competitionName}. Fue un encuentro equilibrado, con poco margen para el error.`);
  } else {
    paragraphs.push(`${userName} cayó ${score} contra ${opponentName} en ${competitionName}. El resultado deja deberes pendientes para la próxima fecha internacional.`);
  }

  if (managerContext?.controlled) {
    const tactic = managerContext.tactic;
    const tacticalNotes = tactic
      ? `mentalidad ${tactic.mentality}/20, presión ${tactic.closingDown}/20 y ${tactic.counterAttack ? 'contraataques' : 'elaboración'} como prioridad`
      : 'un planteamiento personalizado';
    const tacticalActions = tactic
      ? `${tactic.focusPassing === 'MIXED' ? 'circulación variada' : `juego cargado hacia ${tactic.focusPassing === 'LEFT' ? 'la izquierda' : tactic.focusPassing === 'RIGHT' ? 'la derecha' : 'el centro'}`}, ${tactic.longShots === 'OFTEN' ? 'remates lejanos' : tactic.throughBalls === 'OFTEN' ? 'pases al espacio' : 'ataque elaborado'}`
      : 'un plan adaptado al rival';
    paragraphs.push(`El seleccionador tomó el control del proyecto: utilizó una convocatoria de ${managerContext.squadSize} futbolistas y apostó por ${tacticalNotes}, con ${tacticalActions}.`);
  }

  if (goalLines.length > 0) {
    goalLines.forEach(line => paragraphs.push(line));
  } else {
    paragraphs.push('El marcador no tuvo goles y el partido se resolvió en los pequeños detalles defensivos.');
  }

  if (possessionEstimate > 55) {
    paragraphs.push(`La selección controló el balón (${possessionEstimate}%) y encontró espacios con paciencia.`);
  } else if (possessionEstimate < 45) {
    paragraphs.push(`El equipo cedió la posesión (${possessionEstimate}%) y buscó lastimar con transiciones rápidas.`);
  } else {
    paragraphs.push(`La posesión estuvo repartida (${possessionEstimate}%), reflejo de un duelo muy disputado en la mitad de la cancha.`);
  }

  if (totalShots > 0) {
    paragraphs.push(`Se registraron ${totalShots} remates, ${totalOnTarget} de ellos a puerta. La selección completó ${completedPasses} de ${totalPasses} pases (${passAccuracy}%).`);
  }
  if (standout) {
    paragraphs.push(`${standout.name} fue el jugador más destacado de ${userName} con una valoración de ${standoutRating.toFixed(1)}.`);
  }
  paragraphs.push(won
    ? 'La afición celebra una actuación que puede marcar el rumbo de la campaña.'
    : drawn
      ? 'El cuerpo técnico deberá ajustar detalles antes del próximo compromiso.'
      : 'La prensa pide una reacción inmediata en la siguiente convocatoria.');

  const chronicle: Chronicle = {
    id: generateUUID(),
    type: 'MATCH',
    date: new Date(fixture.date),
    title: headline,
    body: paragraphs.join('\n\n'),
    fixtureId: fixture.id,
    nationalTeamId,
  };

  world.chronicles.push(chronicle);
  return chronicle;
}

export function generateMonthlyChronicle(
  clubId: string,
  date: Date,
  results: { won: number; drawn: number; lost: number }
): Chronicle | null {
  const club = world.getClub(clubId);
  if (!club) return null;

  const total = results.won + results.drawn + results.lost;
  if (total === 0) return null;

  const monthName = MONTH_NAMES[date.getMonth()];

  let balance: string;
  if (results.won >= 4) balance = 'excelente';
  else if (results.won >= 3 && results.lost <= 1) balance = 'positivo';
  else if (results.won >= 2 && results.lost >= 2) balance = 'de altibajos';
  else if (results.won >= 1 && results.lost >= 3) balance = 'negativo';
  else balance = 'para olvidar';

  const squad = world.getPlayersByClub(clubId).filter(p => p.squad === 'SENIOR' && p.formRatings && p.formRatings.length > 0);
  let bestP: Player | null = null;
  let worstP: Player | null = null;
  let bestAvg = 0;
  let worstAvg = 10;
  squad.forEach(p => {
    const avg = p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length;
    if (avg > bestAvg) { bestAvg = avg; bestP = p; }
    if (avg < worstAvg && p.formRatings.length >= 2) { worstAvg = avg; worstP = p; }
  });

  const parts: string[] = [];
  parts.push(`${monthName} fue un mes ${balance} para el equipo.`);
  parts.push(`${results.won} victoria${results.won !== 1 ? 's' : ''}, ${results.drawn} empate${results.drawn !== 1 ? 's' : ''} y ${results.lost} derrota${results.lost !== 1 ? 's' : ''}.`);

  if (bestP) parts.push(`${bestP.name} fue el mejor del mes (${bestAvg.toFixed(1)} de promedio).`);
  if (worstP && worstAvg < 6.5) parts.push(`${worstP.name} necesita mejorar (${worstAvg.toFixed(1)} de promedio).`);

  parts.push(pick(["La directiva respalda al entrenador.", "La directiva vigila los resultados.", "La presión crece con cada partido."]));

  const chronicle: Chronicle = {
    id: generateUUID(),
    type: 'MONTHLY',
    date: new Date(date),
    title: `Informe: ${monthName} ${date.getFullYear()}`,
    body: parts.join(' '),
    clubId,
    month: date.getMonth(),
    year: date.getFullYear(),
  };

  world.chronicles.push(chronicle);
  return chronicle;
}

export function generateCareerChronicle(
  managerName: string,
  clubId: string,
  seasons: number,
  stats: { totalGames: number; totalWins: number; totalDraws: number; totalLosses: number; titles: string[]; youthDebuts: number },
  endDate: Date
): Chronicle | null {
  const club = world.getClub(clubId);
  if (!club) return null;

  const winRate = stats.totalGames > 0 ? stats.totalWins / stats.totalGames : 0;
  let balance: string;
  if (stats.titles.length >= 3) balance = 'extraordinaria';
  else if (stats.titles.length >= 1) balance = 'exitosa';
  else if (winRate >= 0.5) balance = 'sólida';
  else if (winRate >= 0.35) balance = 'irregular';
  else balance = 'complicada';

  const parts: string[] = [];
  parts.push(`El entrenador ${managerName} cierra su etapa en ${club.name} después de ${seasons} temporada${seasons > 1 ? 's' : ''}.`);
  parts.push(`Se va con una carrera ${balance}.`);
  parts.push(`En total disputó ${stats.totalGames} partidos: ${stats.totalWins} victorias, ${stats.totalDraws} empates y ${stats.totalLosses} derrotas.`);

  if (stats.titles.length > 0) {
    parts.push(`Títulos: ${stats.titles.join(', ')}.`);
  }
  if (stats.youthDebuts > 0) {
    parts.push(`Hizo debutar a ${stats.youthDebuts} jugador${stats.youthDebuts > 1 ? 'es' : ''} de la cantera.`);
  }

  parts.push(pick([
    "Dejó una huella imborrable en la historia del club.",
    "La afición lo recordará como un líder nato.",
    "Construyó un equipo con identidad y carácter.",
    "Su legado trasciende los resultados.",
  ]));

  parts.push(pick([
    "La prensa lo recuerda como un técnico meticuloso y exigente.",
    "Los medios lo describen como un hombre de confianza.",
    "Destacó por sacar lo mejor de cada jugador.",
  ]));

  parts.push(pick([
    `Ahora ${managerName} busca nuevos desafíos.`,
    `${managerName} se despide, pero su legado permanece.`,
    `Su nombre ya suena para futuros proyectos.`,
  ]));

  const chronicle: Chronicle = {
    id: generateUUID(),
    type: 'CAREER',
    date: new Date(endDate),
    title: `El adiós de ${managerName}`,
    body: parts.join(' '),
    clubId,
  };

  world.chronicles.push(chronicle);
  return chronicle;
}

const STAGE_LABELS: Record<string, string> = {
  FINAL: 'Final',
  SEMI_FINAL: 'Semifinales',
  QUARTER_FINAL: 'Cuartos de Final',
  ROUND_OF_16: 'Octavos de Final',
  ROUND_OF_32: '16avos de Final',
  GROUP_STAGE: 'Fase de Grupos',
};

export function generateTournamentChronicles(
  fixtures: Fixture[],
  userClubId?: string,
  nationalTeamId?: string,
  summaries: { compId: string; compName: string; compType: string; championId?: string; championName?: string }[] = [],
  endDate: Date = new Date()
): Chronicle[] {
  const created: Chronicle[] = [];
  const seasonYear = endDate.getFullYear();

  const buildForTeam = (teamId: string, isNational: boolean) => {
    const teamName = isNational
      ? getNationalTeamName(teamId)
      : world.getClub(teamId)?.name || 'Mi club';

    const teamMatches = fixtures.filter(
      f =>
        f.played &&
        f.squadType === 'SENIOR' &&
        f.competitionId !== 'FRIENDLY' &&
        (f.homeTeamId === teamId || f.awayTeamId === teamId)
    );
    if (teamMatches.length === 0) return;

    const byComp = new Map<string, Fixture[]>();
    teamMatches.forEach(f => {
      const list = byComp.get(f.competitionId) || [];
      list.push(f);
      byComp.set(f.competitionId, list);
    });

    const squadPool = isNational
      ? world.getPlayersByNationalTeam(teamId)
      : world.getPlayersByClub(teamId).filter(p => p.squad === 'SENIOR');

    byComp.forEach((compFixtures, compId) => {
      // Avoid duplicate tournament chronicle for same team/comp/year
      const exists = world.chronicles.some(
        c =>
          c.type === 'TOURNAMENT' &&
          c.competitionId === compId &&
          c.year === seasonYear &&
          (isNational ? c.nationalTeamId === teamId : c.clubId === teamId)
      );
      if (exists) return;

      const comp = world.competitions.find(c => c.id === compId);
      const compName = comp?.name || summaries.find(s => s.compId === compId)?.compName || compId;
      const summary = summaries.find(s => s.compId === compId);

      let played = 0;
      let won = 0;
      let drawn = 0;
      let lost = 0;
      let gf = 0;
      let ga = 0;
      let bestWin: { diff: number; text: string } | null = null;
      let worstLoss: { diff: number; text: string } | null = null;
      let deepestStage: string | null = null;
      const stageOrder = ['GROUP_STAGE', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];

      compFixtures.forEach(f => {
        const isHome = f.homeTeamId === teamId;
        const us = isHome ? (f.homeScore ?? 0) : (f.awayScore ?? 0);
        const them = isHome ? (f.awayScore ?? 0) : (f.homeScore ?? 0);
        const oppId = isHome ? f.awayTeamId : f.homeTeamId;
        const oppName = isNational
          ? getNationalTeamName(oppId)
          : world.getClub(oppId)?.name || 'Rival';

        played++;
        gf += us;
        ga += them;
        if (us > them) won++;
        else if (us < them) lost++;
        else drawn++;

        const diff = us - them;
        if (diff > 0 && (!bestWin || diff > bestWin.diff)) {
          bestWin = { diff, text: `${us}-${them} ante ${oppName}` };
        }
        if (diff < 0 && (!worstLoss || diff < worstLoss.diff)) {
          worstLoss = { diff, text: `${us}-${them} frente a ${oppName}` };
        }
        if (f.stage && stageOrder.includes(f.stage)) {
          if (!deepestStage || stageOrder.indexOf(f.stage) > stageOrder.indexOf(deepestStage)) {
            deepestStage = f.stage;
          }
        }
      });

      const isChampion = summary?.championId === teamId;
      let outcomeText = '';
      let leaguePos: number | null = null;
      let leagueSize = 0;

      if (isChampion) {
        outcomeText = `${teamName} se consagró CAMPEÓN de ${compName} tras una campaña inolvidable.`;
      } else if (comp?.type === 'LEAGUE' && !isNational) {
        const table = world.getLeagueTable(compId, fixtures, 'SENIOR');
        leagueSize = table.length;
        const idx = table.findIndex(e => e.clubId === teamId);
        leaguePos = idx >= 0 ? idx + 1 : null;
        const pts = idx >= 0 ? table[idx].points : won * 3 + drawn;
        const champText = summary?.championName ? ` El título quedó en manos de ${summary.championName}.` : '';
        outcomeText = leaguePos
          ? `${teamName} finalizó en el ${leaguePos}.º puesto de ${table.length} equipos con ${pts} puntos.${champText}`
          : `${teamName} completó su participación en ${compName} con ${won * 3 + drawn} puntos.${champText}`;
      } else if (deepestStage) {
        const stageLabel = STAGE_LABELS[deepestStage] || deepestStage;
        const champText = summary?.championName ? ` El campeón del certamen fue ${summary.championName}.` : '';
        outcomeText =
          deepestStage === 'FINAL'
            ? `${teamName} alcanzó la gran Final de ${compName}, quedando a un paso de la gloria.${champText}`
            : `${teamName} llegó hasta ${stageLabel} en ${compName}.${champText}`;
      } else {
        outcomeText = `${teamName} completó su recorrido en ${compName}.${summary?.championName ? ` Campeón: ${summary.championName}.` : ''}`;
      }

      // Team leaders in this competition (captured before season stats reset)
      const withCompStats = squadPool
        .map(p => ({ p, st: p.statsByCompetition?.[compId] }))
        .filter(x => x.st && x.st.appearances > 0);
      const topGoal = [...withCompStats].sort((a, b) => (b.st!.goals || 0) - (a.st!.goals || 0))[0];
      const topAst = [...withCompStats].sort((a, b) => (b.st!.assists || 0) - (a.st!.assists || 0))[0];
      const topMvp = [...withCompStats].sort(
        (a, b) => (b.st!.totalRating / Math.max(1, b.st!.appearances)) - (a.st!.totalRating / Math.max(1, a.st!.appearances))
      )[0];

      const paragraphs: string[] = [];
      paragraphs.push(outcomeText);
      paragraphs.push(
        `En ${played} partido${played !== 1 ? 's' : ''} disputado${played !== 1 ? 's' : ''}, el equipo registró ${won} victoria${won !== 1 ? 's' : ''}, ${drawn} empate${drawn !== 1 ? 's' : ''} y ${lost} derrota${lost !== 1 ? 's' : ''}, con ${gf} goles a favor y ${ga} en contra (${gf - ga >= 0 ? `+${gf - ga}` : gf - ga}).`
      );

      const highlights: string[] = [];
      if (bestWin) highlights.push(`Mejor triunfo: ${(bestWin as { text: string }).text}`);
      if (worstLoss) highlights.push(`Derrota más dura: ${(worstLoss as { text: string }).text}`);
      if (highlights.length > 0) paragraphs.push(highlights.join('. ') + '.');

      const stars: string[] = [];
      if (topGoal && (topGoal.st?.goals || 0) > 0) {
        stars.push(`Goleador del equipo: ${topGoal.p.name} (${topGoal.st!.goals} gol${topGoal.st!.goals !== 1 ? 'es' : ''})`);
      }
      if (topAst && (topAst.st?.assists || 0) > 0) {
        stars.push(`Máximo asistidor: ${topAst.p.name} (${topAst.st!.assists})`);
      }
      if (topMvp && topMvp.st && topMvp.st.appearances > 0) {
        const avg = (topMvp.st.totalRating / topMvp.st.appearances).toFixed(2);
        stars.push(`Figura por promedio: ${topMvp.p.name} (${avg})`);
      }
      if (stars.length > 0) paragraphs.push(stars.join(' · ') + '.');

      paragraphs.push(
        isChampion
          ? 'La hinchada y la prensa celebran una campaña histórica que quedará grabada en las vitrinas del club.'
          : won > lost
            ? 'El balance competitivo dejó buenas sensaciones y base sólida para la próxima temporada.'
            : 'El análisis final exige autocrítica y ajustes tácticos de cara al próximo calendario.'
      );

      let headline: string;
      if (isChampion) {
        if (lost === 0 && played >= 4) {
          headline = `🏆 ${compName}: ¡Campeón invicto!`;
        } else if (played > 0 && won / played >= 0.72) {
          headline = `🏆 ${compName}: Campaña arrolladora y título`;
        } else {
          headline = `🏆 ¡Campeón de ${compName}!`;
        }
      } else if (comp?.type === 'LEAGUE' && !isNational && leaguePos !== null && leagueSize > 0) {
        if (leaguePos === 2) {
          headline = `${compName}: Subcampeonato y pelea hasta el final`;
        } else if (leaguePos === 3) {
          headline = `${compName}: Podio (3.º) y sólida campaña`;
        } else if (leaguePos <= Math.max(4, Math.ceil(leagueSize * 0.28))) {
          headline = `${compName}: Gran campaña (${leaguePos}.º puesto)`;
        } else if (leaguePos <= Math.ceil(leagueSize * 0.55)) {
          headline = `${compName}: Mitad superior (${leaguePos}.º lugar)`;
        } else if (leaguePos >= leagueSize - 2) {
          headline = `${compName}: Sufriendo en el fondo (${leaguePos}.º puesto)`;
        } else {
          headline = `${compName}: Temporada irregular (${leaguePos}.º puesto)`;
        }
      } else if (deepestStage) {
        if (deepestStage === 'FINAL') headline = `${compName}: Subcampeón tras caer en la Final`;
        else if (deepestStage === 'SEMI_FINAL') headline = `${compName}: Semifinalista del certamen`;
        else if (deepestStage === 'QUARTER_FINAL') headline = `${compName}: Eliminación en Cuartos de Final`;
        else if (deepestStage === 'ROUND_OF_16') headline = `${compName}: Hasta Octavos de Final`;
        else if (deepestStage === 'ROUND_OF_32') headline = `${compName}: Paso por 16avos de Final`;
        else headline = `${compName}: Eliminación en Fase de Grupos`;
      } else if (won > lost) {
        headline = `${compName}: Campaña competitiva (${won}G-${drawn}E-${lost}P)`;
      } else {
        headline = `${compName}: Balance discreto (${won}G-${drawn}E-${lost}P)`;
      }

      const chronicle: Chronicle = {
        id: generateUUID(),
        type: 'TOURNAMENT',
        date: new Date(endDate),
        title: headline,
        body: paragraphs.join('\n\n'),
        competitionId: compId,
        clubId: isNational ? undefined : teamId,
        nationalTeamId: isNational ? teamId : undefined,
        year: seasonYear,
      };
      world.chronicles.push(chronicle);
      created.push(chronicle);
    });
  };

  if (userClubId) buildForTeam(userClubId, false);
  if (nationalTeamId) buildForTeam(nationalTeamId, true);
  return created;
}

