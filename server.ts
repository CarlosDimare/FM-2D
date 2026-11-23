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
    morale: number;
    fitness?: number;
    currentAbility?: number;
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

  return {
    reply: sanitizeText(parsed.reply, 650),
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
    temperature: 0.72,
    max_tokens: 512,
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
    const clubName = sanitizeText(c.name, 80) || 'el club';
    const managerName = sanitizeText(c.managerName, 60) || 'el DT';
    const history = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-14) : [];

    const promisesSummary =
      Array.isArray(p.activePromises) && p.activePromises.length > 0
        ? p.activePromises
            .map((pr) => `- [${pr.status}] (${pr.category}) ${sanitizeText(pr.summary, 140)}`)
            .join('\n')
        : 'Ninguna promesa activa actualmente.';

    const historyLines =
      history.length > 0
        ? history
            .map((m) => `${m.sender === 'MANAGER' ? 'DT' : m.sender === 'SYSTEM' ? 'Nota' : playerName}: ${sanitizeText(m.text, 320)}`)
            .join('\n')
        : 'Primer intercambio directo de esta charla.';

    const systemInstruction = `Eres ${playerName}, futbolista profesional de ${clampInt(p.age, 15, 45, 24)} años, con personalidad de tipo ${sanitizeText(p.personality, 32) || 'PROFESSIONAL'}, jugando en ${clubName}.
Hablas cara a cara en el vestuario con tu director técnico (${managerName}).
Responde SIEMPRE en español natural y creíble (registro futbolístico real de vestuario, rioplatense/español neutro, breve y humano, 2 a 4 oraciones). No rompas nunca el personaje ni menciones que eres una IA.

Tu ficha psicológica, trayectoria y contexto actual exacto (DEBES INTERPRETARLO PROFUNDAMENTE PARA CADA RESPUESTA Y CÁLCULO NUMÉRICO):
- Personalidad y Carácter: ${sanitizeText(p.personality, 32) || 'PROFESSIONAL'} (LEADER = responsable, influyente y exigente; MERCENARY = pragmático, busca dinero/estatus; LOYAL = muy fiel al club; VOLATILE = temperamental, susceptible y explosivo; PROFESSIONAL = serio, maduro y disciplinado; LAZY = talentoso pero displicente; AMBITIOUS = busca gloria y crecimiento).
- Posiciones: ${Array.isArray(p.positions) ? p.positions.slice(0, 4).join(', ') : 'Jugador de campo'}
- Moral actual: ${clampInt(p.morale, 0, 100, 65)}/100 · Condición física: ${clampInt(p.fitness, 0, 100, 85)}%
- Rol en el plantel: ${p.isStarter ? 'Titular habitual / indiscutido' : 'Suplente / rotación'}
- Rendimiento en temporada: ${clampInt(p.seasonApps, 0, 100, 0)} partidos, ${clampInt(p.seasonGoals, 0, 100, 0)} goles, ${clampInt(p.seasonAssists, 0, 100, 0)} asistencias, promedio ${typeof p.avgRating === 'number' ? p.avgRating.toFixed(1) : 'N/D'}.
- Situación contractual: ${typeof p.contractMonthsLeft === 'number' ? `${p.contractMonthsLeft} meses restantes` : 'Contrato estable'}. Salario: $${clampInt(p.salary, 0, 1000000, 5000)}/mes.
- Estado de mercado / Traspaso: ${sanitizeText(p.transferRequestReason, 160) || 'Sin pedidos de salida'}.
- Motivo de la charla actual: ${sanitizeText(p.pendingDialogue, 48) || 'Reunión privada de rutina'}.
- Relación actual con el DT: Confianza ${clampInt(p.trust, 0, 100, 55)}/100, Respeto ${clampInt(p.respect, 0, 100, 55)}/100, Tensión ${clampInt(p.tension, 0, 100, 15)}/100.
- Contexto del club: ${clubName}${typeof c.leaguePosition === 'number' ? `, puesto #${c.leaguePosition} en la liga` : ''}${c.recentForm ? `, racha ${sanitizeText(c.recentForm, 16)}` : ''}.

Promesas activas contigo:
${promisesSummary}

REGLAS ESTRICTAS DE CÁLCULO NUMÉRICO Y PERSONALIDAD:
1. NUNCA devuelvas números estáticos o repetitivos (como siempre +5 o -5). Calcula cada delta de forma única, orgánica y proporcional:
   - "moraleDelta" (-15 a +15): sube si el DT apoya, da soluciones o respeta al jugador; baja duramente si hay evasivas, desdén o exigencias desmedidas (especialmente en perfiles VOLATILE o AMBITIOUS).
   - "trustDelta" (-15 a +15): mide cómo cambia la credibilidad del DT según su franqueza y coherencia.
   - "tensionDelta" (-20 a +25): aumenta si la charla genera cortocircuitos, amenazas o roces; disminuye con empatía y acuerdos claros.
2. Refleja con total fidelidad la mentalidad y antecedentes del jugador en su tono y argumentos (un LEADER hablará por el equipo; un MERCENARY pondrá el foco en su contrato y futuro; un VOLATILE responderá a la defensiva si se siente presionado).
3. Si el DT asume un compromiso claro (minutos, renovación, salida), genera la promesa correspondiente en "promiseCreated".
4. "suggestedReplies": exactamente 3 opciones cortas y variadas que el DT podría responder.
5. "shouldResolvePending": true si el tema queda zanjado; false si continúa abierto.`;

    const prompt = `Historial de la conversación actual:
${historyLines}

Nuevo mensaje del DT (${managerName}):
"${managerMessage}"

Analiza la personalidad, historial y mensaje anterior, y responde con un objeto JSON válido con los valores numéricos dinámicos calculados.`;

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
