import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Club, Staff } from '../types';
import { world } from '../services/worldManager';
import { notifyPlayers, notifyClubs } from '../stores/worldStore';
import { FMButton, FMBox } from './FMUI';
import { FmClubShield, FmLedDisplay, getClubHexPalette } from './ClubBannerChrome';
import { ChevronRight, Mic, Minus, Newspaper, SkipForward, ThumbsDown, ThumbsUp } from 'lucide-react';

export interface DelegatedPressResult {
  staffName: string;
  staffRole: string;
  moraleDelta: number;
  confidenceDelta: number;
}

export function getPressDelegate(club: Club | null | undefined): Staff | null {
  if (!club?.pressDelegatedTo) return null;
  return world.getStaffByClub(club.id).find((s) => s.id === club.pressDelegatedTo) || null;
}

export function resolveDelegatedPressConference(
  club: Club,
  opponent: Club | null | undefined,
  context: 'PRE_MATCH' | 'POST_MATCH',
  homeScore?: number,
  awayScore?: number,
  isUserHome = true
): DelegatedPressResult | null {
  const delegate = getPressDelegate(club);
  if (!delegate) return null;

  const commSkill = Math.round(
    ((delegate.attributes?.manManagement ?? 12) + (delegate.attributes?.motivation ?? 12)) / 2
  );
  const skillBonus = commSkill >= 16 ? 3 : commSkill >= 13 ? 2 : 1;

  let moraleDelta = skillBonus;
  let confidenceDelta = Math.max(1, skillBonus - 1);

  if (context === 'POST_MATCH' && homeScore !== undefined && awayScore !== undefined) {
    const us = isUserHome ? homeScore : awayScore;
    const them = isUserHome ? awayScore : homeScore;
    if (us > them) {
      moraleDelta = skillBonus + 2;
      confidenceDelta = skillBonus + 1;
    } else if (us < them) {
      moraleDelta = Math.max(0, skillBonus - 2);
      confidenceDelta = Math.max(0, skillBonus - 2);
    }
  } else if (opponent && club.country === opponent.country) {
    moraleDelta += 1;
  }

  const squad = world.getPlayersByClub(club.id).filter((p) => p.squad === 'SENIOR');
  squad.forEach((p) => {
    p.morale = Math.max(1, Math.min(100, (p.morale ?? 70) + moraleDelta));
  });
  club.boardConfidence = Math.max(1, Math.min(100, (club.boardConfidence ?? 50) + confidenceDelta));
  notifyPlayers();
  notifyClubs();

  return {
    staffName: delegate.name,
    staffRole: delegate.role,
    moraleDelta,
    confidenceDelta,
  };
}

interface PressConferenceViewProps {
  club: Club;
  opponent: Club;
  context: 'PRE_MATCH' | 'POST_MATCH';
  homeTeam?: Club;
  awayTeam?: Club;
  homeScore?: number;
  awayScore?: number;
  onFinish: () => void;
}

interface PressOption {
  text: string;
  toneLabel: string;
  moraleEffect: number;
  confidenceEffect: number;
  reaction: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}

interface PressQuestion {
  id: string;
  outlet: string;
  question: string;
  options: PressOption[];
}

const PRE_MATCH_QUESTIONS: PressQuestion[] = [
  {
    id: 'q1',
    outlet: 'Diario Deportivo',
    question: '¿Cómo ves a tu equipo en la previa de este compromiso?',
    options: [
      {
        toneLabel: 'Confiado',
        text: 'Confío plenamente en mis jugadores. Saldremos a buscar la victoria.',
        moraleEffect: 4,
        confidenceEffect: 2,
        reaction: 'POSITIVE',
      },
      {
        toneLabel: 'Mesurado',
        text: 'Será un partido exigente, pero el grupo está preparado para competir.',
        moraleEffect: 2,
        confidenceEffect: 1,
        reaction: 'NEUTRAL',
      },
      {
        toneLabel: 'Cauteloso',
        text: 'El rival llega muy fuerte. Tendremos que replegarnos y aguantar.',
        moraleEffect: -3,
        confidenceEffect: -3,
        reaction: 'NEGATIVE',
      },
    ],
  },
  {
    id: 'q2',
    outlet: 'Radio Fútbol',
    question: 'Se habla de posibles variantes en el once inicial. ¿Habrá sorpresas?',
    options: [
      {
        toneLabel: 'Respaldo',
        text: 'Mantengo la base. Confío en los jugadores que vienen respondiendo.',
        moraleEffect: 3,
        confidenceEffect: 2,
        reaction: 'POSITIVE',
      },
      {
        toneLabel: 'Reservado',
        text: 'Lo definiremos antes del inicio. Todos en el plantel tienen opciones.',
        moraleEffect: 1,
        confidenceEffect: 0,
        reaction: 'NEUTRAL',
      },
      {
        toneLabel: 'Exigente',
        text: 'Varios jugadores no están al nivel esperado y habrá cambios.',
        moraleEffect: -4,
        confidenceEffect: -2,
        reaction: 'NEGATIVE',
      },
    ],
  },
  {
    id: 'q3',
    outlet: 'TV Oficial',
    question: '¿Qué impacto tiene este encuentro en los objetivos de la temporada?',
    options: [
      {
        toneLabel: 'Ambicioso',
        text: 'Queremos pelear arriba y hoy es una gran oportunidad para demostrarlo.',
        moraleEffect: 4,
        confidenceEffect: 3,
        reaction: 'POSITIVE',
      },
      {
        toneLabel: 'Prudente',
        text: 'Vamos partido a partido, enfocados únicamente en hacer nuestro trabajo.',
        moraleEffect: 1,
        confidenceEffect: 1,
        reaction: 'NEUTRAL',
      },
      {
        toneLabel: 'Defensivo',
        text: 'No podemos prometer resultados. Nuestra prioridad es no sufrir atrás.',
        moraleEffect: -2,
        confidenceEffect: -3,
        reaction: 'NEGATIVE',
      },
    ],
  },
];

function buildPostMatchQuestions(
  result: 'win' | 'draw' | 'loss',
  opponentName: string
): PressQuestion[] {
  if (result === 'win') {
    return [
      {
        id: 'pq_win_1',
        outlet: 'TV Oficial',
        question: `Gran triunfo frente a ${opponentName}. ¿Qué destacás del rendimiento del equipo?`,
        options: [
          {
            toneLabel: 'Elogio',
            text: 'Estoy orgulloso del plantel. Jugaron con autoridad y merecieron ganar.',
            moraleEffect: 5,
            confidenceEffect: 4,
            reaction: 'POSITIVE',
          },
          {
            toneLabel: 'Equilibrado',
            text: 'Sumamos tres puntos valiosos, aunque todavía hay detalles por pulir.',
            moraleEffect: 2,
            confidenceEffect: 2,
            reaction: 'NEUTRAL',
          },
          {
            toneLabel: 'Crítico',
            text: 'Ganamos, pero no me gustó cómo manejamos varios pasajes del partido.',
            moraleEffect: -3,
            confidenceEffect: -1,
            reaction: 'NEGATIVE',
          },
        ],
      },
      {
        id: 'pq_win_2',
        outlet: 'Diario Deportivo',
        question: '¿Este resultado marca un punto de inflexión en la campaña?',
        options: [
          {
            toneLabel: 'Ambicioso',
            text: 'Sí, el vestuario está convencido de que podemos pelear por todo.',
            moraleEffect: 4,
            confidenceEffect: 3,
            reaction: 'POSITIVE',
          },
          {
            toneLabel: 'Mesurado',
            text: 'Nos da impulso, pero debemos mantener los pies sobre la tierra.',
            moraleEffect: 2,
            confidenceEffect: 2,
            reaction: 'NEUTRAL',
          },
          {
            toneLabel: 'Frío',
            text: 'Es solo un partido más. Todavía no hemos logrado nada.',
            moraleEffect: -2,
            confidenceEffect: 0,
            reaction: 'NEGATIVE',
          },
        ],
      },
      {
        id: 'pq_win_3',
        outlet: 'Prensa Local',
        question: '¿Algún mensaje para la afición tras la victoria?',
        options: [
          {
            toneLabel: 'Cercano',
            text: 'Gracias por el aliento constante. Esta victoria es para ellos.',
            moraleEffect: 3,
            confidenceEffect: 3,
            reaction: 'POSITIVE',
          },
          {
            toneLabel: 'Profesional',
            text: 'Seguiremos trabajando duro para mantener este nivel en cada fecha.',
            moraleEffect: 1,
            confidenceEffect: 1,
            reaction: 'NEUTRAL',
          },
          {
            toneLabel: 'Distante',
            text: 'Solo pensamos en el próximo entrenamiento. Sin euforia.',
            moraleEffect: -1,
            confidenceEffect: -1,
            reaction: 'NEGATIVE',
          },
        ],
      },
    ];
  }

  if (result === 'draw') {
    return [
      {
        id: 'pq_draw_1',
        outlet: 'TV Oficial',
        question: `Empate ante ${opponentName}. ¿Te deja conforme el punto o sentís que se escapó?`,
        options: [
          {
            toneLabel: 'Positivo',
            text: 'El equipo mostró carácter y generó situaciones. Es un punto que suma.',
            moraleEffect: 3,
            confidenceEffect: 2,
            reaction: 'POSITIVE',
          },
          {
            toneLabel: 'Analítico',
            text: 'Fue un partido parejo con altibajos. Hay aspectos claros para mejorar.',
            moraleEffect: 1,
            confidenceEffect: 1,
            reaction: 'NEUTRAL',
          },
          {
            toneLabel: 'Exigente',
            text: 'Dejamos escapar puntos que no podemos regalar. Faltó ambición.',
            moraleEffect: -4,
            confidenceEffect: -2,
            reaction: 'NEGATIVE',
          },
        ],
      },
      {
        id: 'pq_draw_2',
        outlet: 'Radio Fútbol',
        question: '¿Cómo evalúas el funcionamiento táctico del equipo hoy?',
        options: [
          {
            toneLabel: 'Respaldo',
            text: 'El bloque estuvo ordenado y los jugadores cumplieron el plan.',
            moraleEffect: 3,
            confidenceEffect: 2,
            reaction: 'POSITIVE',
          },
          {
            toneLabel: 'Equilibrado',
            text: 'Controlamos por momentos, pero nos faltó precisión en el último tercio.',
            moraleEffect: 0,
            confidenceEffect: 1,
            reaction: 'NEUTRAL',
          },
          {
            toneLabel: 'Crítico',
            text: 'Nos costó demasiado encontrar circuitos de pase. Debemos corregir rápido.',
            moraleEffect: -3,
            confidenceEffect: -2,
            reaction: 'NEGATIVE',
          },
        ],
      },
      {
        id: 'pq_draw_3',
        outlet: 'Prensa Local',
        question: '¿Qué le decís a los hinchas pensando en el próximo encuentro?',
        options: [
          {
            toneLabel: 'Motivador',
            text: 'Que sigan confiando. Este grupo va a dar pelea en cada cancha.',
            moraleEffect: 3,
            confidenceEffect: 2,
            reaction: 'POSITIVE',
          },
          {
            toneLabel: 'Mesurado',
            text: 'Agradecemos el apoyo. Trabajaremos toda la semana para volver al triunfo.',
            moraleEffect: 1,
            confidenceEffect: 1,
            reaction: 'NEUTRAL',
          },
          {
            toneLabel: 'Autocrítico',
            text: 'Entiendo que esperaban más. Nosotros también nos vamos molestos.',
            moraleEffect: -2,
            confidenceEffect: -2,
            reaction: 'NEGATIVE',
          },
        ],
      },
    ];
  }

  return [
    {
      id: 'pq_loss_1',
      outlet: 'TV Oficial',
      question: `Derrota dura frente a ${opponentName}. ¿Cuál es tu análisis inmediato?`,
      options: [
        {
          toneLabel: 'Protector',
          text: 'El resultado duele, pero los jugadores lo dejaron todo. Nos levantaremos juntos.',
          moraleEffect: 3,
          confidenceEffect: 1,
          reaction: 'POSITIVE',
        },
        {
          toneLabel: 'Autocrítico',
          text: 'Cometimos errores que pagamos caro. Toca corregir en el entrenamiento.',
          moraleEffect: 0,
          confidenceEffect: 0,
          reaction: 'NEUTRAL',
        },
        {
          toneLabel: 'Duro',
          text: 'Fue una actuación inaceptable. Así no podemos competir a este nivel.',
          moraleEffect: -5,
          confidenceEffect: -4,
          reaction: 'NEGATIVE',
        },
      ],
    },
    {
      id: 'pq_loss_2',
      outlet: 'Diario Deportivo',
      question: '¿Qué falló en el plano defensivo para recibir esos goles?',
      options: [
        {
          toneLabel: 'Respaldo',
          text: 'Fueron acciones puntuales. Confío en la solidez de nuestra defensa.',
          moraleEffect: 2,
          confidenceEffect: 1,
          reaction: 'POSITIVE',
        },
        {
          toneLabel: 'Técnico',
          text: 'Perdimos marcas clave en transiciones. Lo revisaremos en video.',
          moraleEffect: -1,
          confidenceEffect: 0,
          reaction: 'NEUTRAL',
        },
        {
          toneLabel: 'Severo',
          text: 'Hubo desatenciones graves atrás. Habrá cambios si esto se repite.',
          moraleEffect: -5,
          confidenceEffect: -3,
          reaction: 'NEGATIVE',
        },
      ],
    },
    {
      id: 'pq_loss_3',
      outlet: 'Prensa Local',
      question: '¿Cómo impacta este tropiezo en los objetivos del club?',
      options: [
        {
          toneLabel: 'Firme',
          text: 'Es un golpe, pero queda mucho camino y tenemos plantel para reaccionar.',
          moraleEffect: 3,
          confidenceEffect: 2,
          reaction: 'POSITIVE',
        },
        {
          toneLabel: 'Calmo',
          text: 'No cambia nuestra hoja de ruta. Mantenemos la calma y seguimos trabajando.',
          moraleEffect: 1,
          confidenceEffect: 0,
          reaction: 'NEUTRAL',
        },
        {
          toneLabel: 'Pesimista',
          text: 'Es un revés preocupante que nos obliga a replantear nuestras metas.',
          moraleEffect: -4,
          confidenceEffect: -5,
          reaction: 'NEGATIVE',
        },
      ],
    },
  ];
}

export const PressConferenceView: React.FC<PressConferenceViewProps> = ({
  club,
  opponent,
  context,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  onFinish,
}) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [impactSummary, setImpactSummary] = useState<{ morale: number; confidence: number }>({
    morale: 0,
    confidence: 0,
  });
  const autoSkippedRef = useRef(false);

  const resolvedHome = homeTeam || club;
  const resolvedAway = awayTeam || opponent;
  const isUserHome = resolvedHome.id === club.id;
  const clubPalette = getClubHexPalette(club);

  // Safety guard: if an employee has press delegated, auto-resolve and skip immediately
  const activeDelegate = useMemo(() => getPressDelegate(club), [club]);
  useEffect(() => {
    if (activeDelegate && !autoSkippedRef.current) {
      autoSkippedRef.current = true;
      resolveDelegatedPressConference(club, opponent, context, homeScore, awayScore, isUserHome);
      onFinish();
    }
  }, [activeDelegate, awayScore, club, context, homeScore, isUserHome, onFinish, opponent]);

  const matchResult: 'win' | 'draw' | 'loss' = useMemo(() => {
    if (homeScore === undefined || awayScore === undefined) return 'draw';
    const us = isUserHome ? homeScore : awayScore;
    const them = isUserHome ? awayScore : homeScore;
    if (us > them) return 'win';
    if (us < them) return 'loss';
    return 'draw';
  }, [awayScore, homeScore, isUserHome]);

  const starPlayerQuestion = useMemo<PressQuestion | null>(() => {
    if (context === 'POST_MATCH') return null;
    const topScorer = world
      .getPlayersByClub(club.id)
      .filter((p) => p.squad === 'SENIOR' && p.seasonStats.goals >= 5)
      .sort((a, b) => b.seasonStats.goals - a.seasonStats.goals)[0];

    if (!topScorer) return null;
    return {
      id: 'star1',
      outlet: 'Prensa Local',
      question: `${topScorer.name} acumula ${topScorer.seasonStats.goals} goles esta temporada. ¿Es la pieza clave del equipo?`,
      options: [
        {
          toneLabel: 'Elogio',
          text: `Sin duda. ${topScorer.name} atraviesa un gran momento y es fundamental.`,
          moraleEffect: 4,
          confidenceEffect: 2,
          reaction: 'POSITIVE',
        },
        {
          toneLabel: 'Colectivo',
          text: 'Es importante, pero la fortaleza está en el funcionamiento del grupo.',
          moraleEffect: 2,
          confidenceEffect: 1,
          reaction: 'NEUTRAL',
        },
        {
          toneLabel: 'Exigente',
          text: 'Nadie tiene el puesto asegurado; todos deben rendir al máximo.',
          moraleEffect: -1,
          confidenceEffect: 0,
          reaction: 'NEGATIVE',
        },
      ],
    };
  }, [club.id, context]);

  const questions = useMemo<PressQuestion[]>(() => {
    if (context === 'POST_MATCH') {
      return buildPostMatchQuestions(matchResult, opponent.name);
    }
    const pool = [...PRE_MATCH_QUESTIONS];
    if (starPlayerQuestion) {
      pool[2] = starPlayerQuestion;
    }
    return pool;
  }, [context, matchResult, opponent.name, starPlayerQuestion]);

  const applyEffects = (selected: number[]) => {
    let totalMorale = 0;
    let totalConfidence = 0;

    selected.forEach((optIdx, i) => {
      const opt = questions[i]?.options[optIdx];
      if (opt) {
        totalMorale += opt.moraleEffect;
        totalConfidence += opt.confidenceEffect;
      }
    });

    const squad = world.getPlayersByClub(club.id).filter((p) => p.squad === 'SENIOR');
    squad.forEach((p) => {
      p.morale = Math.max(1, Math.min(100, (p.morale ?? 70) + totalMorale));
    });

    club.boardConfidence = Math.max(1, Math.min(100, (club.boardConfidence ?? 50) + totalConfidence));
    notifyPlayers();
    notifyClubs();
    setImpactSummary({ morale: totalMorale, confidence: totalConfidence });
  };

  const handleAnswer = (optionIdx: number) => {
    const newAnswers = [...answers, optionIdx];
    setAnswers(newAnswers);

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      applyEffects(newAnswers);
      setFinished(true);
    }
  };

  const handleSkipConference = () => {
    if (answers.length > 0 && !finished) {
      applyEffects(answers);
    }
    onFinish();
  };

  if (activeDelegate) {
    return null;
  }

  const activeQuestion = questions[currentQ];
  const scoreSummary =
    context === 'POST_MATCH' && homeScore !== undefined && awayScore !== undefined
      ? `${resolvedHome.shortName} ${homeScore} - ${awayScore} ${resolvedAway.shortName}`
      : `Previa vs ${opponent.shortName}`;

  return (
    <div className="flex flex-col h-full bg-[#cfd7cf] overflow-hidden">
      {/* FM08 Steel Sub-Toolbar */}
      <div className="h-9 sm:h-10 bg-[#3a3f45] border-b border-[#1c1f24] px-2.5 sm:px-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Mic size={14} className="text-[#facc15] shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100 truncate">
            {context === 'PRE_MATCH' ? 'Sala de Prensa · Previa' : 'Sala de Prensa · Post-Partido'}
          </span>
          <span className="hidden sm:inline text-[10.5px] font-mono text-slate-300 tabular-nums shrink-0">
            · {scoreSummary}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!finished && (
            <>
              <FmLedDisplay className="px-2 py-0.5 rounded-[2px]">
                <span className="font-mono text-[10.5px] font-bold text-[#facc15] tabular-nums">
                  {currentQ + 1}/{questions.length}
                </span>
              </FmLedDisplay>
              <button
                type="button"
                onClick={handleSkipConference}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[2px] border border-[#737a82] text-[10px] font-bold uppercase tracking-wide text-[#1f2428] cursor-pointer active:translate-y-px hover:brightness-105"
                style={{
                  background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
                }}
              >
                <SkipForward size={11} />
                <span>Salir</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Stage */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2 sm:p-4 flex flex-col">
        <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center">
          {!finished && activeQuestion ? (
            <FMBox
              title={
                <span className="flex items-center gap-1.5">
                  <Newspaper size={12} className="text-[#facc15] shrink-0" />
                  <span>
                    {activeQuestion.outlet} · Pregunta {currentQ + 1} de {questions.length}
                  </span>
                </span>
              }
              headerRight={
                <div className="flex items-center gap-1">
                  {questions.map((q, idx) => (
                    <span
                      key={q.id}
                      className={`h-1.5 w-5 rounded-[1px] border border-black/30 ${
                        idx < currentQ
                          ? 'bg-[#2b5d2c]'
                          : idx === currentQ
                          ? 'bg-[#facc15]'
                          : 'bg-[#1b1f23]'
                      }`}
                    />
                  ))}
                </div>
              }
              className="shadow-lg"
            >
              <div className="space-y-2.5">
                {/* Match & Journalist Prompt */}
                <div
                  className="bg-white border border-[#9aa69a] rounded-[2px] p-3 shadow-inner"
                  style={{ borderLeftWidth: '4px', borderLeftColor: clubPalette.primary }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#3a4a3a]">
                      {activeQuestion.outlet}
                    </span>
                    <span className="text-[9.5px] font-mono font-bold text-slate-500 tabular-nums">
                      {scoreSummary}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[#181c20] leading-snug">
                    &ldquo;{activeQuestion.question}&rdquo;
                  </p>
                </div>

                {/* FM08 Raised Bevel Response Options */}
                <div className="space-y-1.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-600 px-0.5">
                    Seleccioná tu respuesta
                  </div>
                  {activeQuestion.options.map((opt, idx) => {
                    const badgeStyle =
                      opt.reaction === 'POSITIVE'
                        ? 'bg-[#2b5d2c] text-white border-[#133014]'
                        : opt.reaction === 'NEGATIVE'
                        ? 'bg-[#991b1b] text-white border-[#5c1111]'
                        : 'bg-[#3a3f45] text-slate-100 border-[#1c1f24]';
                    const Icon =
                      opt.reaction === 'POSITIVE'
                        ? ThumbsUp
                        : opt.reaction === 'NEGATIVE'
                        ? ThumbsDown
                        : Minus;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAnswer(idx)}
                        className="w-full text-left p-2.5 sm:p-3 rounded-[2px] border border-[#6e7680] bg-gradient-to-b from-[#f5f7f9] via-[#e4e8ec] to-[#cfd5dc] hover:brightness-105 active:translate-y-px shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(0,0,0,0.28)] transition-all cursor-pointer flex items-start gap-2.5"
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border text-[9px] font-extrabold uppercase tracking-wide shrink-0 mt-0.5 ${badgeStyle}`}
                        >
                          <Icon size={10} />
                          <span>{opt.toneLabel}</span>
                        </span>
                        <span className="text-xs sm:text-[13px] font-semibold text-[#181c20] leading-snug flex-1">
                          &ldquo;{opt.text}&rdquo;
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </FMBox>
          ) : (
            <FMBox
              title={
                <span className="flex items-center gap-1.5">
                  <Newspaper size={12} className="text-[#facc15]" />
                  <span>Resumen de la Rueda de Prensa</span>
                </span>
              }
              className="shadow-lg"
            >
              <div className="py-2 sm:py-4 flex flex-col items-center text-center gap-3">
                <div className="flex items-center gap-3">
                  <FmClubShield club={club} size="lg" />
                  <div className="text-left">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900">
                      Conferencia Finalizada
                    </h3>
                    <p className="text-[11px] text-slate-600 font-semibold">
                      {club.name} · {scoreSummary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  <FmLedDisplay className="rounded-[2px] p-2.5 flex flex-col items-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Moral del Plantel
                    </span>
                    <span
                      className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                        impactSummary.morale > 0
                          ? 'text-emerald-400'
                          : impactSummary.morale < 0
                          ? 'text-rose-400'
                          : 'text-[#facc15]'
                      }`}
                    >
                      {impactSummary.morale > 0 ? `+${impactSummary.morale}` : impactSummary.morale}
                    </span>
                  </FmLedDisplay>
                  <FmLedDisplay className="rounded-[2px] p-2.5 flex flex-col items-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Confianza Directiva
                    </span>
                    <span
                      className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                        impactSummary.confidence > 0
                          ? 'text-emerald-400'
                          : impactSummary.confidence < 0
                          ? 'text-rose-400'
                          : 'text-[#facc15]'
                      }`}
                    >
                      {impactSummary.confidence > 0
                        ? `+${impactSummary.confidence}`
                        : impactSummary.confidence}
                    </span>
                  </FmLedDisplay>
                </div>

                <p className="text-[11px] text-slate-600 max-w-md">
                  Tus declaraciones ya impactaron en el ánimo del vestuario y en la valoración de la directiva.
                </p>

                <FMButton onClick={onFinish} className="px-8 py-2.5 text-xs">
                  <span>{context === 'PRE_MATCH' ? 'Ir al Partido' : 'Continuar'}</span>
                  <ChevronRight size={14} />
                </FMButton>
              </div>
            </FMBox>
          )}
        </div>
      </div>

      {/* Compact FM08 Footer Strip */}
      <footer className="bg-[#bcc8bc] border-t border-[#8e9b90] px-3 py-1.5 text-center text-[9px] text-slate-700 font-bold uppercase tracking-wide shrink-0">
        Las declaraciones ante la prensa influyen en la moral del plantel y la confianza de la directiva.
      </footer>
    </div>
  );
};
