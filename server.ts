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

function normalizeModelPayload(parsed: Record<string, unknown> | null) {
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

  const suggestedReplies = Array.isArray(parsed.suggestedReplies)
    ? parsed.suggestedReplies
        .map((s) => sanitizeText(s, 120))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const cleanReply = sanitizeText(parsed.reply, 900).replace(/\bm[ií]ster\b/gi, 'Señor');

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

async function callNvidiaChat(
  apiKey: string,
  systemInstruction: string,
  prompt: string
): Promise<Record<string, unknown> | null> {
  const model = process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3.5-bolt-e4b';
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const jsonGuidance = `${systemInstruction}

FORMATO DE RESPUESTA OBLIGATORIO:
Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto antes ni después, sin bloques markdown) con exactamente estas propiedades:
{
  "reply": "Respuesta natural del jugador en español (2 a 4 oraciones)",
  "tone": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "moraleDelta": número entero dinámico entre -15 y 15 (calculado según impacto real),
  "tensionDelta": número entero dinámico entre -20 y 25 (calculado según fricción),
  "trustDelta": número entero dinámico entre -15 y 15 (calculado según afinidad),
  "shouldResolvePending": boolean,
  "transferRequestAction": "KEEP" | "WITHDRAW" | "REQUEST",
  "promiseCreated": null o { "category": "PLAYING_TIME" | "POSITION_ROLE" | "CONTRACT_OFFER" | "TACTICAL_ROLE" | "COMPETITION_TARGET" | "TRANSFER_DECISION", "summary": "descripción corta en español", "matchesDuration": entero 2..10 opcional, "deadlineDays": entero 7..45 opcional },
  "suggestedReplies": ["respuesta corta 1 para el DT", "respuesta corta 2", "respuesta corta 3"]
}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: jsonGuidance },
      { role: 'user', content: prompt },
    ],
    temperature: 0.82,
    max_tokens: 760,
  });

  const content = completion.choices[0]?.message?.content || '';
  return parseJsonSafe(content);
}

async function callGeminiChat(
  apiKey: string,
  systemInstruction: string,
  prompt: string
): Promise<Record<string, unknown> | null> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: 'Respuesta natural del jugador en español (2 a 4 oraciones).',
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
          shouldResolvePending: {
            type: Type.BOOLEAN,
            description: 'True si el motivo pendiente quedó resuelto o zanjado en esta charla.',
          },
          transferRequestAction: {
            type: Type.STRING,
            description: 'KEEP, WITHDRAW o REQUEST según corresponda al diálogo.',
          },
          promiseCreated: {
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
          },
          suggestedReplies: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactamente 3 respuestas rápidas sugeridas para el DT.',
          },
        },
        required: [
          'reply',
          'tone',
          'moraleDelta',
          'tensionDelta',
          'trustDelta',
          'shouldResolvePending',
          'suggestedReplies',
        ],
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
- Personalidad y carácter: ${sanitizeText(p.personality, 32) || 'PROFESSIONAL'}${p.personalityDesc ? ` — ${sanitizeText(p.personalityDesc, 160)}` : ''}. (LEADER = referente, habla por el grupo y exige mentalidad; MERCENARY = calculador, prioriza dinero/contratos/escaparate; LOYAL = muy apegado a su club y compañeros; VOLATILE = temperamental, frontal y explosivo; PROFESSIONAL = serio, autocrítico y disciplinado; LAZY = talentoso pero relajado; AMBITIOUS = obsesionado con títulos y dar saltos de calidad).
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
4. "suggestedReplies": exactamente 3 respuestas cortas, naturales y variadas que ${managerName} podría decir a continuación.
5. "shouldResolvePending": ${isUserClubPlayer ? 'true si el tema pendiente quedó zanjado; false si sigue abierto.' : 'false'}`;

    const prompt = `Historial reciente de la charla:
${historyLines}

Nuevo mensaje de ${managerName}:
"${managerMessage}"

Responde estrictamente en personaje según toda tu ficha real (especialmente si eres de ${clubName} o de ${userClubName}) en JSON válido.`;

    try {
      let parsed: Record<string, unknown> | null = null;
      let lastError: unknown = null;

      if (nvidiaKey) {
        try {
          parsed = await callNvidiaChat(nvidiaKey, systemInstruction, prompt);
        } catch (err) {
          lastError = err;
          console.warn('NVIDIA chat failed, attempting Gemini fallback...', err);
        }
      }

      if (!parsed && geminiKey) {
        try {
          parsed = await callGeminiChat(geminiKey, systemInstruction, prompt);
        } catch (err) {
          lastError = err;
          console.error('Gemini fallback chat also failed:', err);
        }
      }

      const normalized = normalizeModelPayload(parsed);
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
