import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import OpenAI from 'openai';

interface IncomingHistoryMessage {
  sender: string;
  text: string;
}

interface PlayerChatRequestBody {
  player: {
    id: string;
    name: string;
    age: number;
    nationality?: string;
    positions?: string[];
    personality?: string;
    personalityDesc?: string;
    morale: number;
    fitness?: number;
    currentAbility?: number;
    marketValue?: number;
    isStarter?: boolean;
    seasonApps?: number;
    seasonGoals?: number;
    seasonAssists?: number;
    avgRating?: number | null;
    contractMonthsLeft?: number | null;
    salary?: number;
    transferRequestReason?: string;
    pendingDialogue?: string;
    trust?: number;
    respect?: number;
    tension?: number;
    teammates?: Array<{
      name: string;
      pos: string;
      isStarter: boolean;
    }>;
    careerStats?: {
      totalApps: number;
      totalGoals: number;
      totalAssists: number;
      clubsPlayedNames?: string[];
    };
    recentSeasons?: Array<{
      year: number;
      club: string;
      apps: number;
      goals: number;
      assists: number;
    }>;
    activePromises?: Array<{
      id: string;
      category: string;
      summary: string;
      status: string;
      matchesLeft?: number;
      deadlineDateIso?: string;
    }>;
  };
  club: {
    name: string;
    shortName?: string;
    leaguePosition?: number | null;
    recentForm?: string;
    managerName?: string;
    isUserClubPlayer?: boolean;
    isFreeAgent?: boolean;
    userClubName?: string;
  };
  currentDateIso?: string;
  conversationHistory?: IncomingHistoryMessage[];
  managerMessage: string;
}

interface StaffChatRequestBody {
  staff: {
    id: string;
    name: string;
    age: number;
    nationality?: string;
    role: string;
    roleLabel?: string;
    personality?: string;
    morale?: number;
    reputation?: number;
    salary?: number;
    contractMonthsLeft?: number | null;
    preferredFormation?: string;
    tacticalStyle?: string;
    pressIntensity?: string;
    possessionVsCounter?: string;
    playingStyle?: string;
    biography?: string;
    attributes?: Record<string, number>;
    careerHonours?: string[];
    previousClubs?: Array<{ clubName: string; years: string; titles?: string[] }>;
    trust?: number;
    respect?: number;
    tension?: number;
    delegations?: string[];
  };
  club: {
    name: string;
    shortName?: string;
    country?: string;
    leaguePosition?: number | null;
    recentForm?: string;
    managerName?: string;
    isUserClubStaff?: boolean;
    isFreeAgent?: boolean;
    userClubName?: string;
    userClubLeaguePos?: number | null;
    activeTactic?: {
      name?: string;
      formation?: string;
      style?: string;
      passingStyle?: string;
      pressingIntensity?: string;
    } | null;
    nextOpponentName?: string | null;
    squadSnapshot?: Array<{
      name: string;
      pos: string;
      age: number;
      ca: number;
      pa: number;
      squad: string;
      isStarter: boolean;
      morale: number;
      fitness: number;
      injuredDays?: number | null;
      seasonApps?: number;
      seasonGoals?: number;
      seasonAssists?: number;
      transferStatus?: string;
    }>;
    staffColleagues?: Array<{ name: string; roleLabel: string }>;
  };
  currentDateIso?: string;
  conversationHistory?: IncomingHistoryMessage[];
  managerMessage: string;
}

const VALID_TONES = new Set(['POSITIVE', 'NEUTRAL', 'NEGATIVE']);
const VALID_PROMISE_CATEGORIES = new Set([
  'PLAYING_TIME',
  'POSITION_ROLE',
  'CONTRACT_OFFER',
  'TACTICAL_ROLE',
  'COMPETITION_TARGET',
  'TRANSFER_DECISION',
]);

function getNvidiaApiKey(): string | undefined {
  const candidates = [
    process.env.NVIDIA_API_KEY,
    process.env['NVIDIA API KEY'],
    process.env.NVIDIA_NIM_API_KEY,
    process.env.NVAPI_KEY,
    process.env.NVIDIA_KEY,
    process.env.VITE_NVIDIA_API_KEY,
  ];
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed) return trimmed;
  }
  const gem = process.env.GEMINI_API_KEY?.trim();
  if (gem && gem.startsWith('nvapi-')) return gem;
  return undefined;
}

function getGeminiApiKey(): string | undefined {
  const gem = process.env.GEMINI_API_KEY?.trim();
  if (!gem || gem.startsWith('nvapi-')) return undefined;
  return gem;
}

function clampInt(val: unknown, min: number, max: number, fallback = 0): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function parseJsonSafe(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(withoutFences);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Fallback search
  }

  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(withoutFences.slice(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function isWrongPovSuggestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return true;
  if (/\b(señor|m[ií]ster|profe)\b/i.test(lower)) return true;
  if (
    /^(gracias por|muchas gracias|voy a dar|voy a dejar|quiero demostrar|estoy a disposici[oó]n|prometo |le agradezco|respeto su decisi[oó]n|cuente conmigo|har[eé] todo lo posible|seguir[eé] entrenando|espero tener|si me da |le tomo la palabra|entiendo su postura)/i.test(
      lower
    )
  ) {
    return true;
  }
  return false;
}

function filterSuggestedReplies(
  raw: unknown,
  fallbackPool: string[]
): string[] {
  const clean = Array.isArray(raw)
    ? raw
        .map((s) => sanitizeText(s, 120))
        .filter((s) => s.length >= 6 && !isWrongPovSuggestion(s))
    : [];

  const result: string[] = [];
  for (const item of clean) {
    if (!result.includes(item)) result.push(item);
    if (result.length >= 3) break;
  }
  for (const fb of fallbackPool) {
    if (result.length >= 3) break;
    if (!result.includes(fb)) result.push(fb);
  }
  return result.slice(0, 3);
}

function normalizeModelPayload(
  parsed: Record<string, unknown> | null,
  fallbackSuggestions: string[]
) {
  if (!parsed || typeof parsed.reply !== 'string' || !parsed.reply.trim()) {
    return null;
  }

  const rawTone = String(parsed.tone || 'NEUTRAL').toUpperCase();
  const tone = VALID_TONES.has(rawTone) ? rawTone : 'NEUTRAL';
  const moraleDelta = clampInt(parsed.moraleDelta, -15, 15, 0);
  const tensionDelta = clampInt(parsed.tensionDelta, -20, 25, 0);
  const trustDelta = clampInt(parsed.trustDelta, -15, 15, 0);
  const shouldResolvePending = Boolean(parsed.shouldResolvePending);
  const rawTransferAction = String(parsed.transferRequestAction || 'KEEP').toUpperCase();
  const transferRequestAction =
    rawTransferAction === 'WITHDRAW' || rawTransferAction === 'REQUEST' ? rawTransferAction : 'KEEP';

  let promiseCreated: {
    category: string;
    summary: string;
    matchesDuration?: number;
    deadlineDays?: number;
  } | null = null;

  if (parsed.promiseCreated && typeof parsed.promiseCreated === 'object') {
    const pc = parsed.promiseCreated as Record<string, unknown>;
    const cat = String(pc.category || '').toUpperCase();
    const sum = sanitizeText(pc.summary, 160);
    if (VALID_PROMISE_CATEGORIES.has(cat) && sum.length >= 4) {
      promiseCreated = {
        category: cat,
        summary: sum,
        matchesDuration:
          typeof pc.matchesDuration === 'number' && Number.isFinite(pc.matchesDuration)
            ? clampInt(pc.matchesDuration, 2, 10, 4)
            : undefined,
        deadlineDays:
          typeof pc.deadlineDays === 'number' && Number.isFinite(pc.deadlineDays)
            ? clampInt(pc.deadlineDays, 7, 60, 21)
            : undefined,
      };
    }
  }

  const suggestedReplies = filterSuggestedReplies(parsed.suggestedReplies, fallbackSuggestions);
  const cleanReply = sanitizeText(parsed.reply, 950).replace(/\bm[ií]ster\b/gi, 'Señor');

  return {
    reply: cleanReply,
    tone,
    moraleDelta,
    tensionDelta,
    trustDelta,
    shouldResolvePending,
    transferRequestAction,
    promiseCreated,
    suggestedReplies,
  };
}

interface ChatCallOptions {
  speakerLabel: string;
  includePlayerFields: boolean;
  managerName: string;
  targetName: string;
}

async function callNvidiaChat(
  apiKey: string,
  systemInstruction: string,
  prompt: string,
  opts: ChatCallOptions
): Promise<Record<string, unknown> | null> {
  const model = process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3.5-bolt-e4b';
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const playerOnlySchemaLines = opts.includePlayerFields
    ? `  "shouldResolvePending": boolean,
  "transferRequestAction": "KEEP" | "WITHDRAW" | "REQUEST",
  "promiseCreated": null o { "category": "PLAYING_TIME" | "POSITION_ROLE" | "CONTRACT_OFFER" | "TACTICAL_ROLE" | "COMPETITION_TARGET" | "TRANSFER_DECISION", "summary": "descripción corta en español", "matchesDuration": entero 2..10 opcional, "deadlineDays": entero 7..45 opcional },`
    : '';

  const jsonGuidance = `${systemInstruction}

FORMATO DE RESPUESTA OBLIGATORIO:
Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto antes ni después, sin bloques markdown) con exactamente estas propiedades:
{
  "reply": "Respuesta natural de ${opts.targetName} (${opts.speakerLabel}) en español (2 a 5 oraciones)",
  "tone": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "moraleDelta": número entero dinámico entre -15 y 15 (calculado según impacto real),
  "tensionDelta": número entero dinámico entre -20 y 25 (calculado según fricción),
  "trustDelta": número entero dinámico entre -15 y 15 (calculado según afinidad),
${playerOnlySchemaLines}
  "suggestedReplies": [
    "Opción 1 EN LA VOZ DE ${opts.managerName} (EL DT USUARIO) hablándole DE VOS a ${opts.targetName} (ej: 'Contame cómo ves al grupo esta semana')",
    "Opción 2 EN LA VOZ DE ${opts.managerName} preguntando o dando una indicación a ${opts.targetName}",
    "Opción 3 EN LA VOZ DE ${opts.managerName} reaccionando a lo que dijo ${opts.targetName}"
  ]
}
IMPORTANTE SOBRE "suggestedReplies": Cada frase es lo que el USUARIO (${opts.managerName}) le va a decir a ${opts.targetName} en el próximo clic. NUNCA escribas frases en la voz de ${opts.targetName} ni uses "Señor" o "profe" en "suggestedReplies".`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: jsonGuidance },
      { role: 'user', content: prompt },
    ],
    temperature: 0.82,
    max_tokens: 780,
  });

  const content = completion.choices[0]?.message?.content || '';
  return parseJsonSafe(content);
}

async function callGeminiChat(
  apiKey: string,
  systemInstruction: string,
  prompt: string,
  opts: ChatCallOptions
): Promise<Record<string, unknown> | null> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const properties: Record<string, any> = {
    reply: {
      type: Type.STRING,
      description: `Respuesta natural de ${opts.targetName} (${opts.speakerLabel}) en español (2 a 5 oraciones).`,
    },
    tone: {
      type: Type.STRING,
      description: 'Sentimiento resultante: POSITIVE, NEUTRAL o NEGATIVE.',
    },
    moraleDelta: {
      type: Type.INTEGER,
      description: 'Cambio dinámico de moral entre -15 y +15.',
    },
    tensionDelta: {
      type: Type.INTEGER,
      description: 'Cambio dinámico de tensión entre -20 y +25.',
    },
    trustDelta: {
      type: Type.INTEGER,
      description: 'Cambio dinámico de confianza entre -15 y +15.',
    },
    suggestedReplies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: `Exactamente 3 frases cortas que DIRÍA ${opts.managerName} (el entrenador usuario) hablándole de "vos" a ${opts.targetName} en el próximo turno. SIEMPRE desde la perspectiva del DT hacia ${opts.targetName}. PROHIBIDO hablar como ${opts.targetName} o usar "Señor".`,
    },
  };

  const required = ['reply', 'tone', 'moraleDelta', 'tensionDelta', 'trustDelta', 'suggestedReplies'];

  if (opts.includePlayerFields) {
    properties.shouldResolvePending = {
      type: Type.BOOLEAN,
      description: 'True si el motivo pendiente quedó resuelto o zanjado en esta charla.',
    };
    properties.transferRequestAction = {
      type: Type.STRING,
      description: 'KEEP, WITHDRAW o REQUEST según corresponda al diálogo.',
    };
    properties.promiseCreated = {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        category: {
          type: Type.STRING,
          description:
            'PLAYING_TIME | POSITION_ROLE | CONTRACT_OFFER | TACTICAL_ROLE | COMPETITION_TARGET | TRANSFER_DECISION',
        },
        summary: {
          type: Type.STRING,
          description: 'Descripción corta en español de la promesa asumida.',
        },
        matchesDuration: {
          type: Type.INTEGER,
          nullable: true,
          description: 'Cantidad de partidos de plazo (entre 2 y 8) si aplica a cancha.',
        },
        deadlineDays: {
          type: Type.INTEGER,
          nullable: true,
          description: 'Días de plazo (entre 7 y 45) si aplica a contrato o mercado.',
        },
      },
      required: ['category', 'summary'],
    };
    required.push('shouldResolvePending');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties,
        required,
      },
    },
  });

  return parseJsonSafe(response.text || '');
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/player-chat/status', (_req: Request, res: Response) => {
    const hasNvidia = Boolean(getNvidiaApiKey());
    const hasGemini = Boolean(getGeminiApiKey());
    res.json({
      available: hasNvidia || hasGemini,
      provider: hasNvidia ? 'nvidia' : hasGemini ? 'gemini' : 'none',
    });
  });

  app.post('/api/player-chat', async (req: Request, res: Response) => {
    const nvidiaKey = getNvidiaApiKey();
    const geminiKey = getGeminiApiKey();

    if (!nvidiaKey && !geminiKey) {
      res.status(503).json({
        error: 'No hay clave de IA configurada en Secrets.',
        unavailable: true,
      });
      return;
    }

    const body = req.body as Partial<PlayerChatRequestBody> | undefined;
    const managerMessage = sanitizeText(body?.managerMessage, 600);
    if (!body?.player || !body?.club || !managerMessage) {
      res.status(400).json({
        error: 'Solicitud inválida: faltan datos del jugador, del club o el mensaje del entrenador.',
      });
      return;
    }

    const p = body.player;
    const c = body.club;
    const playerName = sanitizeText(p.name, 80) || 'Jugador';
    const clubName = sanitizeText(c.name, 80) || 'Agente Libre';
    const userClubName = sanitizeText(c.userClubName, 80) || clubName;
    const isUserClubPlayer = c.isUserClubPlayer !== false;
    const isFreeAgent = Boolean(c.isFreeAgent);
    const rawMgrName = sanitizeText(c.managerName, 60);
    const managerName = rawMgrName && rawMgrName !== 'Director Técnico' ? rawMgrName : 'Señor';
    const managerFirstName = managerName.split(/\s+/)[0] || 'Señor';
    const history = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-14) : [];

    const promisesSummary =
      Array.isArray(p.activePromises) && p.activePromises.length > 0
        ? p.activePromises
            .map((pr) => `- [${pr.status}] (${pr.category}) ${sanitizeText(pr.summary, 140)}`)
            .join('\n')
        : 'Ninguna promesa activa actualmente.';

    const teammatesSummary =
      Array.isArray(p.teammates) && p.teammates.length > 0
        ? p.teammates
            .map((tm) => `${sanitizeText(tm.name, 50)} (${sanitizeText(tm.pos, 8)}${tm.isStarter ? ', titular' : ', rotación'})`)
            .join(', ')
        : isFreeAgent
        ? 'Actualmente sin club ni plantel.'
        : 'Compañeros del plantel profesional.';

    const careerSummaryParts: string[] = [];
    if (p.careerStats) {
      careerSummaryParts.push(
        `${p.careerStats.totalApps} PJ, ${p.careerStats.totalGoals} goles, ${p.careerStats.totalAssists} asistencias en total`
      );
      if (Array.isArray(p.careerStats.clubsPlayedNames) && p.careerStats.clubsPlayedNames.length > 0) {
        careerSummaryParts.push(`Clubes anteriores/actuales: ${p.careerStats.clubsPlayedNames.join(' → ')}`);
      }
    }
    if (Array.isArray(p.recentSeasons) && p.recentSeasons.length > 0) {
      const seasonsStr = p.recentSeasons
        .map((s) => `${s.year} en ${sanitizeText(s.club, 40)} (${s.apps} PJ, ${s.goals}G/${s.assists}A)`)
        .join(' | ');
      careerSummaryParts.push(`Últimas temporadas: ${seasonsStr}`);
    }
    const careerSummary = careerSummaryParts.length > 0 ? careerSummaryParts.join('. ') : 'Sin historial previo extenso.';

    const historyLines =
      history.length > 0
        ? history
            .map((m) => `${m.sender === 'MANAGER' ? `DT (${managerName})` : m.sender === 'SYSTEM' ? 'Nota' : playerName}: ${sanitizeText(m.text, 320)}`)
            .join('\n')
        : 'Primer intercambio directo de esta charla.';

    const relationshipContext = isUserClubPlayer
      ? `SITUACIÓN ACTUAL: Eres jugador de ${clubName} y estás hablando cara a cara en el vestuario con TU director técnico, ${managerName}.`
      : isFreeAgent
      ? `SITUACIÓN ACTUAL: Eres AGENTE LIBRE (sin club actual) conversando con ${managerName}, director técnico de ${userClubName}. NO eres jugador de ${userClubName} todavía; hablas desde tu postura de jugador libre escuchando propuestas o consultas.`
      : `SITUACIÓN ACTUAL CRÍTICA: Eres futbolista ACTUAL DE **${clubName}** (tu club y tus compañeros son de ${clubName}). Estás hablando con ${managerName}, quien NO es tu entrenador — es el DT de OTRO CLUB (${userClubName}).
PROHIBICIÓN ABSOLUTA: JAMÁS digas que juegas para ${userClubName}, que vas a "dar todo por ${userClubName}", que entrenas bajo sus órdenes o que él te elige como titular. Tienes lealtad/contrato vigente con ${clubName}, hablas como rival/jugador de otro plantel y solo puedes opinar sobre ${userClubName} desde afuera (halagos, cautela, ambición, pedir que hablen con tu club si te quiere fichar, etc.).`;

    const systemInstruction = `Eres ${playerName}, futbolista profesional de ${clampInt(p.age, 15, 45, 24)} años (${sanitizeText(p.nationality, 40) || 'Argentina'}), personalidad ${sanitizeText(p.personality, 32) || 'PROFESSIONAL'}.
${relationshipContext}

REGLAS DE TRATO Y ESTILO (OBLIGATORIAS):
- PROHIBIDO usar la palabra "Míster" o "míster" en CUALQUIER contexto. Dirígete al entrenador como "Señor" o "${managerFirstName}"${isUserClubPlayer ? ' (o "profe" ocasionalmente si hay confianza alta)' : ''}.
- Responde SIEMPRE en español natural, futbolístico y expresivo (3 a 5 oraciones ricas y específicas, con personalidad propia y sin respuestas genéricas ni repetitivas). Nunca menciones que eres una IA ni rompas el papel.
- Varía tu forma de expresarte: menciona detalles reales de tu momento, tus compañeros de vestuario, tus números, tu contrato o tu historia cuando venga al caso, sin sonar acartonado ni repetir frases de plantilla.

TU FICHA COMPLETA Y REALIDAD ACTUAL:
- Club real actual: ${clubName}${typeof c.leaguePosition === 'number' ? ` (puesto #${c.leaguePosition} en la liga)` : ''}${c.recentForm ? ` · Racha reciente de ${clubName}: ${sanitizeText(c.recentForm, 16)}` : ''}.
- Tus compañeros actuales en ${clubName}: ${teammatesSummary}.
- Trayectoria e historia: ${careerSummary}.
- Personalidad y carácter: ${sanitizeText(p.personality, 32) || 'PROFESSIONAL'}${p.personalityDesc ? ` — ${sanitizeText(p.personalityDesc, 160)}` : ''}. (LEADER = referente del grupo; MODEL_PRO = ética intachable; PROFESSIONAL = serio y disciplinado; DRIVEN = determinado y combativo; AMBITIOUS = obsesionado con títulos y dar saltos; COMPETITIVE = odia perder; RESILIENT = frío ante presión/lesiones; PERFECTIONIST = autocrítico y detallista; CHARISMATIC = cercano y une al grupo; LOYAL = muy apegado a su club; RESERVED = perfil bajo; TEMPERAMENTAL = pasional al límite; VOLATILE = explosivo; MERCENARY = prioriza salario/contrato; LAZY = talentoso pero relajado).
- Posiciones: ${Array.isArray(p.positions) ? p.positions.slice(0, 4).join(', ') : 'Jugador de campo'} · Calidad actual: ${clampInt(p.currentAbility, 1, 200, 110)}/200 · Valor de mercado: £${clampInt(p.marketValue, 0, 500000000, 500000).toLocaleString('en-US')}.
- Moral actual: ${clampInt(p.morale, 0, 100, 65)}/100 · Condición física: ${clampInt(p.fitness, 0, 100, 85)}%
- Rol en ${clubName}: ${isFreeAgent ? 'Sin club actualmente' : p.isStarter ? `Titular habitual en ${clubName}` : `Suplente / rotación en ${clubName}`}
- Rendimiento esta temporada: ${clampInt(p.seasonApps, 0, 100, 0)} partidos, ${clampInt(p.seasonGoals, 0, 100, 0)} goles, ${clampInt(p.seasonAssists, 0, 100, 0)} asistencias, calificación media ${typeof p.avgRating === 'number' ? p.avgRating.toFixed(1) : 'N/D'}.
- Situación contractual: ${isFreeAgent ? 'Agente libre sin contrato' : typeof p.contractMonthsLeft === 'number' ? `${p.contractMonthsLeft} meses restantes en ${clubName}` : `Contrato vigente en ${clubName}`}. Salario actual: £${clampInt(p.salary, 0, 1000000, 5000)}/mes.
- Situación de traspaso: ${sanitizeText(p.transferRequestReason, 160) || 'Sin pedidos de salida'}.
- Motivo de esta charla: ${isUserClubPlayer ? sanitizeText(p.pendingDialogue, 48) || 'Conversación privada de vestuario' : 'Contacto directo con entrenador de otro club'}.
- Relación con ${managerName}: Confianza ${clampInt(p.trust, 0, 100, 55)}/100, Respeto ${clampInt(p.respect, 0, 100, 55)}/100, Tensión ${clampInt(p.tension, 0, 100, 15)}/100.

Promesas activas contigo:
${promisesSummary}

REGLAS ESTRICTAS DE CÁLCULO NUMÉRICO:
1. NUNCA devuelvas números fijos o repetitivos (como siempre +5 o -5). Calcula "moraleDelta" (-15..+15), "trustDelta" (-15..+15) y "tensionDelta" (-20..+25) de forma orgánica según el tono real de lo dicho y tu personalidad.${!isUserClubPlayer ? '\n2. Como NO eres jugador de su club, normalmente "moraleDelta" y "tensionDelta" de vestuario deben ser 0 o muy moderados (±2) y NO crees promesas de minutos en tu club ajeno ("promiseCreated": null).' : ''}
3. Si el DT asume un compromiso claro con un jugador propio (minutos, renovación, salida), genera "promiseCreated".
4. "suggestedReplies": CRÍTICO — NO son frases tuyas como jugador. Son exactamente 3 respuestas cortas y variadas que EL ENTRENADOR (${managerName}) podría decirte a VOS en su próximo mensaje, escritas desde el punto de vista del DT hablándote de "vos" (ej: "Necesito más intensidad tuya en los entrenamientos", "Vas a tener minutos en el próximo partido", "¿Cómo te sentís físicamente para jugar?"). PROHIBIDO escribir frases como futbolista, prohibido usar "Señor"/"profe", y prohibido decir "voy a dar todo".
5. "shouldResolvePending": ${isUserClubPlayer ? 'true si el tema pendiente quedó zanjado; false si sigue abierto.' : 'false'}`;

    const prompt = `Historial reciente de la charla:
${historyLines}

Nuevo mensaje de ${managerName}:
"${managerMessage}"

Responde estrictamente en personaje según toda tu ficha real (especialmente si eres de ${clubName} o de ${userClubName}) en JSON válido.`;

    const fallbackPlayerSuggestions = isUserClubPlayer
      ? [
          'Seguí entrenando así que vas a tener tu oportunidad en cancha.',
          '¿Cómo te sentís física y futbolísticamente para el próximo partido?',
          'Necesito que estés al 100% enfocado en lo que viene con el plantel.',
        ]
      : [
          `Me gusta tu nivel actual, ¿qué buscás para el próximo paso de tu carrera?`,
          `¿Cómo evaluás la campaña actual de ${isFreeAgent ? 'tu búsqueda de club' : clubName}?`,
          `Seguimos en contacto por si surge una posibilidad en ${userClubName}.`,
        ];

    const callOpts: ChatCallOptions = {
      speakerLabel: 'futbolista profesional',
      includePlayerFields: true,
      managerName,
      targetName: playerName,
    };

    try {
      let parsed: Record<string, unknown> | null = null;
      let lastError: unknown = null;

      if (nvidiaKey) {
        try {
          parsed = await callNvidiaChat(nvidiaKey, systemInstruction, prompt, callOpts);
        } catch (err) {
          lastError = err;
          console.warn('NVIDIA chat failed, attempting Gemini fallback...', err);
        }
      }

      if (!parsed && geminiKey) {
        try {
          parsed = await callGeminiChat(geminiKey, systemInstruction, prompt, callOpts);
        } catch (err) {
          lastError = err;
          console.error('Gemini fallback chat also failed:', err);
        }
      }

      const normalized = normalizeModelPayload(parsed, fallbackPlayerSuggestions);
      if (!normalized) {
        const detail = lastError instanceof Error ? lastError.message : 'Modelo agotado o sin respuesta válida';
        res.status(502).json({
          error: `No se pudo obtener respuesta de la IA: ${detail}`,
          unavailable: true,
        });
        return;
      }

      res.json(normalized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al contactar con la IA.';
      console.error('Error en /api/player-chat:', err);
      res.status(502).json({
        error: `No se pudo obtener respuesta de la IA: ${msg}`,
        unavailable: true,
      });
    }
  });

  app.post('/api/staff-chat', async (req: Request, res: Response) => {
    const nvidiaKey = getNvidiaApiKey();
    const geminiKey = getGeminiApiKey();

    if (!nvidiaKey && !geminiKey) {
      res.status(503).json({
        error: 'No hay clave de IA configurada en Secrets.',
        unavailable: true,
      });
      return;
    }

    const body = req.body as Partial<StaffChatRequestBody> | undefined;
    const managerMessage = sanitizeText(body?.managerMessage, 600);
    if (!body?.staff || !body?.club || !managerMessage) {
      res.status(400).json({
        error: 'Solicitud inválida: faltan datos del empleado, del club o el mensaje del entrenador.',
      });
      return;
    }

    const s = body.staff;
    const c = body.club;
    const staffName = sanitizeText(s.name, 80) || 'Empleado';
    const roleLabel = sanitizeText(s.roleLabel, 50) || sanitizeText(s.role, 40) || 'Miembro del cuerpo técnico';
    const clubName = sanitizeText(c.name, 80) || 'Agente Libre';
    const userClubName = sanitizeText(c.userClubName, 80) || clubName;
    const isUserClubStaff = c.isUserClubStaff !== false;
    const isFreeAgent = Boolean(c.isFreeAgent);
    const rawMgrName = sanitizeText(c.managerName, 60);
    const managerName = rawMgrName && rawMgrName !== 'Director Técnico' ? rawMgrName : 'Señor';
    const managerFirstName = managerName.split(/\s+/)[0] || 'Señor';
    const history = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-14) : [];

    const attrsList = s.attributes
      ? Object.entries(s.attributes)
          .map(([k, v]) => `${sanitizeText(k, 24)}:${clampInt(v, 1, 20, 10)}`)
          .join(', ')
      : 'Perfil estándar';

    const squadLines =
      Array.isArray(c.squadSnapshot) && c.squadSnapshot.length > 0
        ? c.squadSnapshot
            .slice(0, 18)
            .map((pl) => {
              const tags: string[] = [pl.isStarter ? 'Titular' : pl.squad === 'SENIOR' ? 'Suplente' : pl.squad];
              if (pl.injuredDays && pl.injuredDays > 0) tags.push(`LESIONADO(${pl.injuredDays}d)`);
              if (pl.morale < 50) tags.push(`moral baja ${pl.morale}%`);
              if (pl.fitness < 65) tags.push(`físico ${pl.fitness}%`);
              if (pl.transferStatus && pl.transferStatus !== 'NONE') tags.push(pl.transferStatus);
              return `- ${sanitizeText(pl.name, 45)} (${sanitizeText(pl.pos, 6)}, ${pl.age}a, CA ${pl.ca}/PA ${pl.pa}, ${tags.join(', ')}, ${pl.seasonApps ?? 0}PJ ${pl.seasonGoals ?? 0}G/${pl.seasonAssists ?? 0}A)`;
            })
            .join('\n')
        : isFreeAgent
        ? 'Actualmente sin club asignado (analiza el mercado general y ofrece su criterio profesional).'
        : 'Plantel profesional completo.';

    const colleaguesSummary =
      Array.isArray(c.staffColleagues) && c.staffColleagues.length > 0
        ? c.staffColleagues.map((col) => `${sanitizeText(col.name, 45)} (${sanitizeText(col.roleLabel, 30)})`).join(', ')
        : 'Sin otros colegas listados.';

    const tacticSummary = c.activeTactic
      ? `${c.activeTactic.formation || '4-4-2'} · estilo ${c.activeTactic.style || 'BALANCED'} · pase ${c.activeTactic.passingStyle || 'MIXED'} · presión ${c.activeTactic.pressingIntensity || 'MEDIUM'}`
      : s.preferredFormation
      ? `Formación predilecta propia: ${s.preferredFormation} (${s.tacticalStyle || 'BALANCED'})`
      : 'Esquema táctico estándar';

    const prevClubsSummary =
      Array.isArray(s.previousClubs) && s.previousClubs.length > 0
        ? s.previousClubs
            .slice(0, 5)
            .map((pc) => `${sanitizeText(pc.clubName, 45)} (${sanitizeText(pc.years, 20)})`)
            .join(' · ')
        : 'Sin historial previo destacado';

    const historyLines =
      history.length > 0
        ? history
            .map((m) => `${m.sender === 'MANAGER' ? `DT (${managerName})` : m.sender === 'SYSTEM' ? 'Nota' : staffName}: ${sanitizeText(m.text, 320)}`)
            .join('\n')
        : 'Primer intercambio directo de esta charla.';

    const situationContext = isUserClubStaff
      ? `SITUACIÓN ACTUAL: Eres ${roleLabel} de **${clubName}** y trabajas codo a codo con TU director técnico, ${managerName}. Estás completamente al tanto del plantel, los lesionados, las promesas juveniles, la táctica actual del club y el próximo rival.`
      : isFreeAgent
      ? `SITUACIÓN ACTUAL: Eres ${roleLabel} actualmente **LIBRE (sin club)**. Estás conversando con ${managerName}, director técnico de ${userClubName}${typeof c.userClubLeaguePos === 'number' ? ` (puesto #${c.userClubLeaguePos})` : ''}. Conoces tu propio valor, tu salario pretendido y estás atento a si quieren sumarte a su cuerpo técnico.`
      : `SITUACIÓN ACTUAL CRÍTICA: Eres ${roleLabel} con contrato vigente en **${clubName}**${typeof c.leaguePosition === 'number' ? ` (puesto #${c.leaguePosition})` : ''}. Estás hablando con ${managerName}, quien es el DT de OTRO CLUB (${userClubName}).
REGLA DE LEALTAD: Hablas con conocimiento real de TU propio club (${clubName}) y TU propio plantel listado abajo. NO trabajas en ${userClubName}. Puedes intercambiar opiniones de fútbol, hablar de tus jugadores en ${clubName}, de tu método táctico o escuchar con cautela/profesionalismo si te sondean para un cambio de club.`;

    const systemInstruction = `Eres ${staffName}, ${roleLabel} profesional de ${clampInt(s.age, 25, 75, 45)} años (${sanitizeText(s.nationality, 40) || 'Argentina'}), personalidad ${sanitizeText(s.personality, 32) || 'CALM'}.
${situationContext}

REGLAS DE TRATO Y ESTILO (OBLIGATORIAS):
- PROHIBIDO usar la palabra "Míster" o "míster". Dirígete a ${managerName} como "${isUserClubStaff ? `Señor o ${managerFirstName}` : `${managerFirstName} / colega`}".
- Responde SIEMPRE en español futbolístico natural, técnico y concreto (3 a 5 oraciones). Nunca digas que eres una IA.
- USA LOS DATOS REALES: cuando hablen de táctica, entrenamientos, lesionados, juveniles, refuerzos o jugadores específicos, cita NOMBRES REALES del plantel listado abajo, sus posiciones, lesiones, moral o forma real.
- Habla fiel a tu cargo (${roleLabel}): por ejemplo, un Preparador Físico o Fisioterapeuta habla con foco en cargas/lesiones; un Ojeador o Director Deportivo en calidad/potencial/mercado; un Segundo Entrenador o DT en táctica/once/rival; un Entrenador de Reserva/Sub-20 en los juveniles; un Tesorero en presupuestos y salarios.

TU FICHA Y SITUACIÓN ACTUAL:
- Cargo real: ${roleLabel} (${sanitizeText(s.role, 32)}) · Reputación: ${clampInt(s.reputation, 1, 100, 50)}/100 · Moral: ${clampInt(s.morale, 0, 100, 70)}/100.
- Situación contractual: ${isFreeAgent ? 'Agente libre disponible para contratar' : typeof s.contractMonthsLeft === 'number' ? `${s.contractMonthsLeft} meses restantes en ${clubName}` : `Con contrato vigente en ${clubName}`}. Sueldo: £${clampInt(s.salary, 0, 500000, 5000)}/sem.
- Atributos clave (1-20): ${attrsList}.
- Delegaciones actuales a tu cargo: ${Array.isArray(s.delegations) && s.delegations.length > 0 ? s.delegations.join(', ') : 'Tareas estándar del cargo'}.
- Perfil táctico y biografía: Formación preferida ${s.preferredFormation || '4-4-2'} · Estilo ${s.tacticalStyle || 'BALANCED'} · Presión ${s.pressIntensity || 'MEDIUM'} · ${sanitizeText(s.biography, 220) || 'Profesional de sólida trayectoria.'}
- Trayectoria y palmarés: ${prevClubsSummary}${Array.isArray(s.careerHonours) && s.careerHonours.length > 0 ? ` | Títulos: ${s.careerHonours.slice(0, 4).join(', ')}` : ''}.
- Relación con ${managerName}: Confianza ${clampInt(s.trust, 0, 100, 55)}/100, Respeto ${clampInt(s.respect, 0, 100, 55)}/100, Tensión ${clampInt(s.tension, 0, 100, 15)}/100.

CONTEXTO DEL CLUB (${isFreeAgent ? 'Sin club actual' : clubName}):
- Posición y racha: ${typeof c.leaguePosition === 'number' ? `Puesto #${c.leaguePosition}` : 'Sin tabla activa'}${c.recentForm ? ` · Últimos 5 partidos: ${sanitizeText(c.recentForm, 10)}` : ''}${c.nextOpponentName ? ` · Próximo rival: ${sanitizeText(c.nextOpponentName, 50)}` : ''}.
- Táctica actual del equipo: ${tacticSummary}.
- Colegas del cuerpo técnico: ${colleaguesSummary}.
- Jugadores del plantel actual (${isFreeAgent ? 'ninguno propio' : clubName}):
${squadLines}

REGLAS DE RESPUESTA Y "suggestedReplies":
1. Calcula "moraleDelta" (-15..+15), "trustDelta" (-15..+15) y "tensionDelta" (-20..+25) según el tono y sintonía de la charla.${!isUserClubStaff ? ' Como no trabajas en su club, mantén moraleDelta moderado (±3).' : ''}
2. "suggestedReplies": CRÍTICO — NO son frases tuyas como empleado. Son exactamente 3 preguntas o comentarios cortos que EL USUARIO (${managerName}) podría decirte a VOS a continuación, hablando de "vos" o en primera persona del DT (ej: "¿Qué ajustes tácticos harías para el próximo partido?", "¿A qué juvenil ves listo para subir a Primera?", "¿Qué jugador del plantel te preocupa más hoy?"). PROHIBIDO escribir respuestas desde tu voz como empleado o usar "Señor"/"profe".`;

    const prompt = `Historial reciente de la charla:
${historyLines}

Nuevo mensaje de ${managerName}:
"${managerMessage}"

Responde estrictamente en personaje como ${staffName} (${roleLabel}) usando los datos reales en JSON válido.`;

    const fallbackStaffSuggestions = isUserClubStaff
      ? [
          '¿Cómo ves el nivel del plantel y qué posición reforzarías o ajustarías?',
          '¿Qué opinás de nuestro esquema táctico actual para el próximo partido?',
          '¿Hay algún jugador con baja moral o físico que deba seguir de cerca?',
        ]
      : isFreeAgent
      ? [
          `¿Qué te parecería sumarte a nuestro proyecto en ${userClubName}?`,
          'Contame cuál es tu estilo táctico y cómo trabajás con los jugadores.',
          '¿Qué condiciones buscás para aceptar un nuevo desafío?',
        ]
      : [
          `¿Cómo evaluás la campaña actual de ${clubName} y a tus jugadores clave?`,
          '¿Cuál es tu lectura táctica sobre el fútbol de esta liga?',
          `Si surgiera una propuesta para sumarte a ${userClubName}, ¿la escucharías?`,
        ];

    const callOpts: ChatCallOptions = {
      speakerLabel: roleLabel,
      includePlayerFields: false,
      managerName,
      targetName: staffName,
    };

    try {
      let parsed: Record<string, unknown> | null = null;
      let lastError: unknown = null;

      if (nvidiaKey) {
        try {
          parsed = await callNvidiaChat(nvidiaKey, systemInstruction, prompt, callOpts);
        } catch (err) {
          lastError = err;
          console.warn('NVIDIA staff chat failed, attempting Gemini fallback...', err);
        }
      }

      if (!parsed && geminiKey) {
        try {
          parsed = await callGeminiChat(geminiKey, systemInstruction, prompt, callOpts);
        } catch (err) {
          lastError = err;
          console.error('Gemini fallback staff chat also failed:', err);
        }
      }

      const normalized = normalizeModelPayload(parsed, fallbackStaffSuggestions);
      if (!normalized) {
        const detail = lastError instanceof Error ? lastError.message : 'Modelo agotado o sin respuesta válida';
        res.status(502).json({
          error: `No se pudo obtener respuesta de la IA: ${detail}`,
          unavailable: true,
        });
        return;
      }

      res.json({
        reply: normalized.reply,
        tone: normalized.tone,
        moraleDelta: normalized.moraleDelta,
        tensionDelta: normalized.tensionDelta,
        trustDelta: normalized.trustDelta,
        suggestedReplies: normalized.suggestedReplies,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al contactar con la IA.';
      console.error('Error en /api/staff-chat:', err);
      res.status(502).json({
        error: `No se pudo obtener respuesta de la IA: ${msg}`,
        unavailable: true,
      });
    }
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`FM Argentina server running on http://0.0.0.0:${port}`);
  });
}

void createApp();
