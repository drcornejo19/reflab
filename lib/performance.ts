import { getPublicRankingName, resolveRefCardId } from "@/lib/refCard";

export type PerformanceSource = "training" | "exam" | "rules_exam";
export type ModuleKey = "decision" | "video" | "var" | "english" | "communication" | "preparation";
export type CriterionKey = "technical" | "restart" | "discipline" | "interpretation" | "justification" | "var";

export type AttemptRecord = {
  id?: string;
  user_id?: string | null;
  ref_card_id?: string | null;
  clip_id?: string | null;
  clip_title?: string | null;
  module?: string | null;
  mode?: string | null;
  foul?: boolean | null;
  restart?: string | null;
  discipline?: string | null;
  score?: number | null;
  topic?: string | null;
  difficulty?: string | null;
  is_correct?: boolean | null;
  selected_decision?: string | null;
  correct_decision?: string | null;
  selected_restart?: string | null;
  correct_restart?: string | null;
  selected_discipline?: string | null;
  correct_discipline?: string | null;
  answer_text?: string | null;
  feedback?: string | null;
  workout_name?: string | null;
  total_duration?: number | null;
  completed_rounds?: number | null;
  total_rounds?: number | null;
  completed?: boolean | null;
  perceived_effort?: number | null;
  fatigue_level?: number | null;
  notes?: string | null;
  time_spent?: number | null;
  time_spent_seconds?: number | null;
  technical_correct?: boolean | null;
  restart_correct?: boolean | null;
  discipline_correct?: boolean | null;
  subtype_correct?: boolean | null;
  justification_correct?: boolean | null;
  var_correct?: boolean | null;
  app_correct?: boolean | null;
  ofr_correct?: boolean | null;
  var_intervention_correct?: boolean | null;
  factual_vs_interpretative_correct?: boolean | null;
  final_decision_correct?: boolean | null;
  english_score?: number | null;
  vocabulary_score?: number | null;
  clarity_score?: number | null;
  terminology_score?: number | null;
  grammar_score?: number | null;
  technical_accuracy_score?: number | null;
  justification_score?: number | null;
  pronunciation_score?: number | null;
  protocol_score?: number | null;
  created_at?: string | null;
};
export type ExamAnswerRecord = {
  clipId?: string; clipTitle?: string; topic?: string | null; difficulty?: string | null;
  foul?: boolean | null; restart?: string | null; discipline?: string | null;
  technicalCorrect?: boolean | null; restartCorrect?: boolean | null;
  disciplineCorrect?: boolean | null; subtypeCorrect?: boolean | null; score?: number | null;
};
export type ExamResultRecord = {
  id?: string; user_id?: string | null; total_questions?: number | null; total_score?: number | null;
  avg_score?: number | null; correct_count?: number | null; details?: ExamAnswerRecord[] | null; created_at?: string | null;
};
export type RulesAnswerRecord = {
  question_id?: string | number | null; topic?: string | null; question?: string | null;
  selected_text?: string | null; correct_text?: string | null; is_correct?: boolean | null;
  unanswered?: boolean | null; explanation?: string | null;
};
export type RulesExamResultRecord = {
  id?: string; user_id?: string | null; total_questions?: number | null; correct_count?: number | null;
  percentage?: number | null; unanswered_count?: number | null; finish_reason?: string | null; level?: string | null;
  details?: RulesAnswerRecord[] | null; topic_performance?: unknown[] | null; created_at?: string | null;
};
export type RankingProfileRecord = {
  user_id?: string | null;
  ref_card_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  ranking_display_name?: string | null;
  show_real_name_in_ranking?: boolean | null;
};
export type PerformanceItem = {
  id: string; source: PerformanceSource; module: ModuleKey; modeLabel: string; date: string;
  title: string; topic: string; rawTopic: string; difficulty?: string | null; score: number | null;
  result: "Correcto" | "Parcial" | "Incorrecto" | "Sin datos";
  selectedDecision?: string | null; correctDecision?: string | null; selectedRestart?: string | null;
  correctRestart?: string | null; selectedDiscipline?: string | null; correctDiscipline?: string | null;
  answerText?: string | null; feedback?: string | null; timeSpentSeconds?: number | null;
  criteria: Partial<Record<CriterionKey, boolean>>;
};
export type PerformanceSession = { id: string; source: PerformanceSource; label: string; date: string; score: number | null; totalItems: number; };
export type SummaryMetric = { label: string; value: string; detail: string; tone?: "success" | "warning" | "danger" | "neutral"; };
export type TopicMetric = { topic: string; attempts: number; correct: number; errors: number; accuracy: number | null; avgScore: number | null; lastScore: number | null; trend: string; status: string; };
export type CriterionMetric = { key: CriterionKey; label: string; attempts: number; correct: number; accuracy: number | null; status: string; description: string; };
export type ModuleMetric = { label: string; value: string; detail: string; available: boolean; };
export type ModulePerformance = { key: ModuleKey; title: string; description: string; status: "Disponible" | "Sin datos" | "Metricas en construccion"; metrics: ModuleMetric[]; };
export type EvolutionData = { historicalAverage: number | null; lastAverage: number | null; previousAverage: number | null; variation: number | null; trend: string; weeklyCount: number; monthlyCount: number; bestScore: number | null; worstScore: number | null; regularity: string; series: PerformanceSession[]; };
export type PerformanceSummary = { hasData: boolean; avgScore: number | null; totalAttempts: number; totalTrainings: number; totalEvaluations: number; bestScore: number | null; lastScore: number | null; strongestTopic?: TopicMetric; weakestTopic?: TopicMetric; strongestCriterion?: CriterionMetric; weakestCriterion?: CriterionMetric; recommendedModule: string; status: string; sampleNote: string; metrics: SummaryMetric[]; };
export type RecommendedPlan = { diagnosis: string; priority1: string; priority2: string; nextStep: string; reason: string; href: string; };
export type RankingRow = { userId: string; position: number; name: string; refCardId: string; attempts: number; trainings: number; tests: number; avgScore: number; bestScore: number; lastAttempt: string; };

const criterionLabels: Record<CriterionKey, string> = { technical: "Decision tecnica", restart: "Reanudacion", discipline: "Sancion disciplinaria", interpretation: "Interpretacion", justification: "Justificacion", var: "Criterio VAR" };
const criterionDescriptions: Record<CriterionKey, string> = { technical: "Si la decision principal fue correcta.", restart: "Si la reanudacion reglamentaria fue correcta.", discipline: "Si la sancion disciplinaria fue correcta.", interpretation: "Si interpreto correctamente contexto, intensidad y consecuencia.", justification: "Calidad del fundamento tecnico.", var: "Aplicacion de protocolo o criterio VAR." };
const topicDictionary: Record<string, string> = { Dispute: "Disputas", Challenge: "Disputas", "Tactical foul": "Faltas tacticas", Handball: "Manos", Mano: "Manos", Offside: "Fuera de juego", VAR: "VAR", "SPA / DOGSO": "SPA / DOGSO", SPA: "SPA / DOGSO", DOGSO: "SPA / DOGSO", Disciplina: "Disciplina" };
export function buildPerformanceDataset({ attempts, examResults, rulesExamResults }: { attempts: AttemptRecord[]; examResults: ExamResultRecord[]; rulesExamResults: RulesExamResultRecord[]; }) {
  const items: PerformanceItem[] = [];
  const sessions: PerformanceSession[] = [];

  attempts.forEach((attempt, index) => {
    const score = cleanScore(attempt.score);
    const topic = normalizeTopic(attempt.topic);
    const date = attempt.created_at ?? "";
    const moduleKey = normalizeModule(attempt.module, attempt.mode, topic);
    const modeLabel = getModeLabel(moduleKey, attempt.mode, topic);
    const title = attempt.clip_title ?? attempt.workout_name ?? fallbackTitleForModule(moduleKey);
    const timeSpentSeconds = cleanDuration(attempt.time_spent_seconds ?? attempt.time_spent);

    items.push({
      id: attempt.id ?? `attempt-${index}`,
      source: "training",
      module: moduleKey,
      modeLabel,
      date,
      title,
      topic,
      rawTopic: attempt.topic ?? topic,
      difficulty: attempt.difficulty,
      score,
      result: resultFromAttempt(attempt, score),
      selectedDecision: attempt.selected_decision ?? decisionFromBoolean(attempt.foul),
      correctDecision: attempt.correct_decision,
      selectedRestart: attempt.selected_restart ?? attempt.restart,
      correctRestart: attempt.correct_restart,
      selectedDiscipline: attempt.selected_discipline ?? attempt.discipline,
      correctDiscipline: attempt.correct_discipline,
      answerText: attempt.answer_text,
      feedback: attempt.feedback,
      timeSpentSeconds,
      criteria: {
        technical:
          attempt.technical_correct ??
          attempt.final_decision_correct ??
          attempt.is_correct ??
          booleanFromScore(attempt.technical_accuracy_score),
        restart: attempt.restart_correct ?? undefined,
        discipline: attempt.discipline_correct ?? undefined,
        interpretation: undefined,
        justification:
          attempt.justification_correct ??
          booleanFromScore(attempt.justification_score) ??
          booleanFromScore(attempt.clarity_score),
        var:
          attempt.var_intervention_correct ??
          attempt.var_correct ??
          attempt.ofr_correct ??
          attempt.app_correct ??
          attempt.factual_vs_interpretative_correct ??
          undefined,
      },
    });

    sessions.push({
      id: attempt.id ?? `attempt-session-${index}`,
      source: "training",
      label: modeLabel,
      date,
      score,
      totalItems: 1,
    });
  });
  examResults.forEach((exam, examIndex) => {
    const date = exam.created_at ?? "";
    const score = cleanScore(exam.avg_score);
    const answers = Array.isArray(exam.details) ? exam.details : [];
    sessions.push({ id: exam.id ?? `exam-session-${examIndex}`, source: "exam", label: "Examen arbitral", date, score, totalItems: Number(exam.total_questions ?? answers.length ?? 0) });
    answers.forEach((answer, answerIndex) => {
      const answerScore = cleanScore(answer.score);
      const topic = normalizeTopic(answer.topic);
      items.push({
        id: `${exam.id ?? `exam-${examIndex}`}-${answer.clipId ?? answerIndex}`,
        source: "exam",
        module: topic === "VAR" ? "var" : "video",
        modeLabel: "Examen arbitral",
        date,
        title: answer.clipTitle ?? "Clip de examen",
        topic,
        rawTopic: answer.topic ?? topic,
        difficulty: answer.difficulty,
        score: answerScore,
        result: resultFromScore(answerScore),
        selectedDecision: decisionFromBoolean(answer.foul),
        selectedRestart: answer.restart,
        selectedDiscipline: answer.discipline,
        criteria: { technical: answer.technicalCorrect ?? undefined, restart: answer.restartCorrect ?? undefined, discipline: answer.disciplineCorrect ?? undefined, interpretation: undefined },
      });
    });
  });

  rulesExamResults.forEach((exam, examIndex) => {
    const date = exam.created_at ?? "";
    const score = cleanScore(exam.percentage);
    const answers = Array.isArray(exam.details) ? exam.details : [];
    sessions.push({ id: exam.id ?? `rules-session-${examIndex}`, source: "rules_exam", label: "Examen de reglas", date, score, totalItems: Number(exam.total_questions ?? answers.length ?? 0) });
    answers.forEach((answer, answerIndex) => {
      const topic = normalizeTopic(answer.topic);
      const answered = answer.unanswered !== true;
      const scoreValue = answered ? (answer.is_correct ? 100 : 0) : 0;
      items.push({
        id: `${exam.id ?? `rules-${examIndex}`}-${answer.question_id ?? answerIndex}`,
        source: "rules_exam",
        module: "decision",
        modeLabel: "Examen de reglas",
        date,
        title: answer.question ?? "Pregunta de reglas",
        topic,
        rawTopic: answer.topic ?? topic,
        score: scoreValue,
        result: answer.is_correct ? "Correcto" : "Incorrecto",
        selectedDecision: answer.selected_text,
        correctDecision: answer.correct_text,
        feedback: answer.explanation,
        criteria: { technical: answer.is_correct ?? undefined },
      });
    });
  });

  return { items: sortByDateDesc(items), sessions: sortByDateDesc(sessions) };
}
export function getPerformanceSummary(items: PerformanceItem[], sessions: PerformanceSession[]): PerformanceSummary {
  const scores = items.map((item) => item.score).filter(isNumber);
  const avgScore = average(scores);
  const topics = getTopicPerformance(items);
  const criteria = getCriterionPerformance(items);
  const strongestTopic = topMetric(topics);
  const weakestTopic = bottomMetric(topics);
  const strongestCriterion = topCriterion(criteria);
  const weakestCriterion = bottomCriterion(criteria);
  const totalTrainings = sessions.filter((session) => session.source === "training").length;
  const totalEvaluations = sessions.filter((session) => session.source !== "training").length;
  const bestScore = scores.length ? Math.max(...scores) : null;
  const lastScore = sessions.find((session) => isNumber(session.score))?.score ?? null;
  const status = getGeneralStatus(avgScore, items.length);
  const recommendedModule = inferRecommendedModule(weakestTopic, weakestCriterion);
  const sampleNote = items.length === 0 ? "Todavia no hay datos registrados." : items.length < 5 ? "Muestra inicial: completa mas ejercicios para un diagnostico mas preciso." : "Diagnostico calculado con actividad real registrada.";

  return {
    hasData: items.length > 0,
    avgScore,
    totalAttempts: items.length,
    totalTrainings,
    totalEvaluations,
    bestScore,
    lastScore,
    strongestTopic,
    weakestTopic,
    strongestCriterion,
    weakestCriterion,
    recommendedModule,
    status,
    sampleNote,
    metrics: [
      { label: "Promedio general", value: formatScore(avgScore), detail: sampleNote, tone: avgScore === null ? "neutral" : avgScore >= 85 ? "success" : avgScore >= 70 ? "warning" : "danger" },
      { label: "Intentos analizados", value: String(items.length), detail: "Respuestas, ejercicios y preguntas guardadas." },
      { label: "Entrenamientos", value: String(totalTrainings), detail: "Intentos individuales guardados." },
      { label: "Evaluaciones", value: String(totalEvaluations), detail: "Examen arbitral y examen de reglas." },
      { label: "Mejor score", value: formatScore(bestScore), detail: "Mayor resultado individual registrado.", tone: "success" },
      { label: "Ultimo score", value: formatScore(lastScore), detail: "Ultima sesion registrada." },
      { label: "Topico fuerte", value: strongestTopic?.topic ?? "Sin datos", detail: strongestTopic ? `${formatPercent(strongestTopic.accuracy)} de acierto` : "Completa ejercicios para detectarlo.", tone: "success" },
      { label: "Topico debil", value: weakestTopic?.topic ?? "Sin datos", detail: weakestTopic ? `${formatPercent(weakestTopic.accuracy)} de acierto` : "Completa ejercicios para detectarlo.", tone: "danger" },
      { label: "Criterio fuerte", value: strongestCriterion?.label ?? "Sin datos", detail: strongestCriterion ? `${formatPercent(strongestCriterion.accuracy)} de precision` : "No hay criterios suficientes.", tone: "success" },
      { label: "Criterio a mejorar", value: weakestCriterion?.label ?? "Sin datos", detail: weakestCriterion ? `${formatPercent(weakestCriterion.accuracy)} de precision` : "No hay criterios suficientes.", tone: "danger" },
      { label: "Modulo recomendado", value: recommendedModule, detail: "Sugerido segun debilidades disponibles.", tone: "warning" },
      { label: "Estado general", value: status, detail: sampleNote },
    ],
  };
}

export function getEvolutionData(sessions: PerformanceSession[]): EvolutionData {
  const scored = sortByDateAsc(sessions).filter((session) => isNumber(session.score));
  const scores = scored.map((session) => session.score).filter(isNumber);
  const latestWindow = scores.slice(-5);
  const previousWindow = scores.length >= 10 ? scores.slice(-10, -5) : scores.slice(0, Math.max(0, scores.length - 5));
  const lastAverage = average(latestWindow);
  const previousAverage = average(previousWindow);
  const variation = lastAverage !== null && previousAverage !== null ? Math.round(lastAverage - previousAverage) : null;
  return { historicalAverage: average(scores), lastAverage, previousAverage, variation, trend: getTrendLabel(scores.length, variation), weeklyCount: countSince(scored, 7), monthlyCount: countSince(scored, 30), bestScore: scores.length ? Math.max(...scores) : null, worstScore: scores.length ? Math.min(...scores) : null, regularity: getRegularity(scored), series: scored.slice(-12) };
}

export function getTopicPerformance(items: PerformanceItem[]): TopicMetric[] {
  const groups = groupBy(items.filter((item) => item.topic), (item) => item.topic);
  return Array.from(groups.entries()).map(([topic, topicItems]) => {
    const scores = topicItems.map((item) => item.score).filter(isNumber);
    const correct = topicItems.filter((item) => item.result === "Correcto").length;
    const errors = topicItems.filter((item) => item.result === "Incorrecto").length;
    const accuracy = topicItems.length ? Math.round((correct / topicItems.length) * 100) : null;
    return { topic, attempts: topicItems.length, correct, errors, accuracy, avgScore: average(scores), lastScore: sortByDateDesc(topicItems).find((item) => isNumber(item.score))?.score ?? null, trend: getSmallTrend(topicItems), status: getTopicStatus(topicItems.length, accuracy) };
  }).sort((a, b) => {
    const aScore = a.accuracy ?? -1;
    const bScore = b.accuracy ?? -1;
    if (bScore !== aScore) return bScore - aScore;
    return b.attempts - a.attempts;
  });
}

export function getCriterionPerformance(items: PerformanceItem[]): CriterionMetric[] {
  const keys: CriterionKey[] = ["technical", "restart", "discipline", "interpretation", "justification", "var"];
  return keys.map((key) => {
    const values = items.map((item) => item.criteria[key]).filter((value): value is boolean => typeof value === "boolean");
    const correct = values.filter(Boolean).length;
    const accuracy = values.length ? Math.round((correct / values.length) * 100) : null;
    return { key, label: criterionLabels[key], attempts: values.length, correct, accuracy, status: getCriterionStatus(values.length, accuracy), description: criterionDescriptions[key] };
  });
}
export function getModulePerformance(items: PerformanceItem[]): ModulePerformance[] {
  const topicMetrics = getTopicPerformance(items);
  const criteria = getCriterionPerformance(items);
  const preparationItems = items.filter((item) => item.module === "preparation");
  const preparationSeconds = preparationItems
    .map((item) => item.timeSpentSeconds)
    .filter(isNumber)
    .reduce((acc, value) => acc + value, 0);

  return [
    {
      key: "decision",
      title: "Decision arbitral",
      description: "Evalua si cobraste bien, la reanudacion, la sancion disciplinaria y la interpretacion de la jugada.",
      status: moduleStatus(items, "decision"),
      metrics: [
        metricFromItems("Intentos realizados", items.filter((item) => item.module === "decision")),
        metricFromAverage("Promedio del modulo", moduleAverage(items, "decision")),
        metricFromCriterion("Precision tecnica", criteria.find((item) => item.key === "technical")),
        metricFromCriterion("Precision disciplinaria", criteria.find((item) => item.key === "discipline")),
        metricFromCriterion("Precision en reanudacion", criteria.find((item) => item.key === "restart")),
        metricFromTopic("Aciertos en manos", topicMetrics.find((item) => item.topic === "Manos")),
        metricFromTopic("Aciertos en faltas", topicMetrics.find((item) => item.topic === "Faltas tacticas")),
        metricFromTopic("Aciertos en fuera de juego", topicMetrics.find((item) => item.topic === "Fuera de juego")),
        metricUnavailable("Tiempo promedio de decision", "Disponible cuando se registre tiempo por intento."),
      ],
    },
    {
      key: "video",
      title: "Video analisis",
      description: "Evalua lectura tecnica, comprension de la jugada, contexto, observacion y justificacion.",
      status: moduleStatus(items, "video"),
      metrics: [
        metricFromItems("Clips analizados", items.filter((item) => item.module === "video")),
        metricFromAverage("Promedio de analisis", moduleAverage(items, "video")),
        metricFromCriterion("Deteccion correcta de infraccion", criteria.find((item) => item.key === "technical")),
        metricUnavailable("Lectura de intensidad", "Requiere registrar intensidad o punto de contacto."),
        metricUnavailable("Punto de contacto", "Metrica preparada para carga futura."),
        metricFromCriterion("Calidad de justificacion", criteria.find((item) => item.key === "justification")),
      ],
    },
    {
      key: "var",
      title: "VAR Lab",
      description: "Evalua APP, OFR, factual vs interpretativo, intervencion VAR y uso correcto del protocolo.",
      status: moduleStatus(items, "var"),
      metrics: [
        metricFromItems("Casos VAR analizados", items.filter((item) => item.module === "var" || item.topic === "VAR")),
        metricFromAverage("Precision VAR", moduleAverage(items, "var")),
        metricFromCriterion("Criterio VAR", criteria.find((item) => item.key === "var")),
        metricUnavailable("Aciertos en OFR", "Disponible cuando el ejercicio VAR guarde OFR."),
        metricUnavailable("Aciertos en APP", "Disponible cuando el ejercicio VAR guarde APP."),
        metricUnavailable("Factual vs interpretativo", "Metrica preparada para VAR Lab."),
      ],
    },
    {
      key: "english",
      title: "Ingles arbitral",
      description: "Evalua vocabulario, claridad, terminologia FIFA/VAR y comunicacion tecnica en ingles.",
      status: moduleStatus(items, "english"),
      metrics: [
        metricFromItems("Respuestas en ingles", items.filter((item) => item.module === "english")),
        metricFromAverage("Promedio del modulo", moduleAverage(items, "english")),
        metricFromCriterion("Precision tecnica del texto", criteria.find((item) => item.key === "technical")),
        metricFromCriterion("Claridad comunicacional", criteria.find((item) => item.key === "justification")),
        metricUnavailable("Vocabulario FIFA", "Requiere rubrica especifica del feedback de ingles."),
        metricUnavailable("Terminologia VAR", "Metrica preparada para respuestas VAR en ingles."),
      ],
    },
    {
      key: "communication",
      title: "Comunicacion y liderazgo",
      description: "Este modulo medira autoridad, comunicacion, liderazgo, lenguaje corporal y manejo de conflictos dentro del partido.",
      status: "Metricas en construccion",
      metrics: [
        metricUnavailable("Manejo de protestas", "Metrica futura."),
        metricUnavailable("Puesta de limites", "Metrica futura."),
        metricUnavailable("Comunicacion verbal", "Metrica futura."),
        metricUnavailable("Comunicacion no verbal", "Metrica futura."),
        metricUnavailable("Control emocional", "Metrica futura."),
        metricUnavailable("Resolucion de conflictos", "Metrica futura."),
      ],
    },
    {
      key: "preparation",
      title: "Preparacion del arbitro",
      description: "Evalua adherencia, constancia, sesiones completadas y progreso de preparacion fisica y mental.",
      status: preparationItems.length > 0 ? "Disponible" : "Metricas en construccion",
      metrics: [
        metricFromItems("Sesiones fisicas completadas", preparationItems),
        {
          label: "Minutos entrenados",
          value: preparationSeconds > 0 ? formatDuration(preparationSeconds) : "Sin datos",
          detail: preparationSeconds > 0 ? "Suma de sesiones registradas." : "Disponible cuando se guarden sesiones fisicas.",
          available: preparationSeconds > 0,
        },
        metricUnavailable("Rutina mas realizada", "Disponible cuando haya mas sesiones registradas."),
        metricUnavailable("Cumplimiento semanal", "Metrica futura."),
        metricUnavailable("Carga percibida", "Metrica futura."),
        metricUnavailable("Fatiga percibida", "Metrica futura."),
        metricUnavailable("Foco y confianza pre-partido", "Metrica futura."),
      ],
    },
  ];
}
export function getRecentHistory(items: PerformanceItem[], limit = 12) {
  return sortByDateDesc(items).slice(0, limit);
}

export function getRecommendedPlan(summary: PerformanceSummary): RecommendedPlan {
  if (!summary.hasData) return { diagnosis: "Todavia no hay intentos guardados para generar diagnostico.", priority1: "Comenzar con Decision arbitral.", priority2: "Completar una evaluacion formal para activar metricas.", nextStep: "Realizar el primer entrenamiento con clips.", reason: "RefLab necesita datos reales para detectar patrones.", href: "/training/decision" };
  if (summary.totalAttempts < 5) return { diagnosis: "Hay actividad inicial, pero la muestra todavia es pequena.", priority1: "Completar al menos 5 ejercicios.", priority2: "Incluir topicos distintos: manos, disputas, offside, faltas y VAR.", nextStep: "Seguir entrenando Decision arbitral.", reason: "Con mas intentos el diagnostico tecnico sera mas confiable.", href: "/training/decision" };
  const weakCriterion = summary.weakestCriterion;
  const weakTopic = summary.weakestTopic;
  if (weakCriterion?.key === "discipline") return { diagnosis: "El rendimiento general muestra una debilidad en criterio disciplinario.", priority1: "Trabajar intensidad, punto de contacto y consecuencia tactica.", priority2: weakTopic ? `Entrenar ${weakTopic.topic}.` : "Entrenar faltas tacticas y disputas.", nextStep: "Realizar 5 clips de disputas o faltas tacticas.", reason: "Aciertos tecnicos pueden perder valor si la sancion disciplinaria falla.", href: "/training/field" };
  if (weakCriterion?.key === "restart") return { diagnosis: "La decision puede ser correcta, pero la reanudacion necesita refuerzo.", priority1: "Revisar reanudaciones y aplicacion reglamentaria.", priority2: weakTopic ? `Aplicarlo en ${weakTopic.topic}.` : "Practicar offside, manos y faltas.", nextStep: "Entrenar clips con foco exclusivo en reanudacion.", reason: "La reanudacion es parte central de la decision arbitral final.", href: "/training/decision" };
  if (weakCriterion?.key === "var" || weakTopic?.topic === "VAR") return { diagnosis: "El patron mas debil aparece relacionado con criterio VAR.", priority1: "Practicar protocolo VAR, APP y error claro y obvio.", priority2: "Separar factual vs interpretativo.", nextStep: "Abrir VAR Lab.", reason: "El VAR exige una capa de decision distinta a la lectura de campo.", href: "/training/var" };
  if ((summary.avgScore ?? 0) >= 85) return { diagnosis: "El rendimiento general es alto con los datos disponibles.", priority1: "Subir dificultad.", priority2: "Usar simulaciones cronometradas o examenes formales.", nextStep: "Rendir una evaluacion completa.", reason: "Cuando el promedio es alto, el crecimiento viene por presion, volumen y dificultad.", href: "/evaluations" };
  return { diagnosis: weakTopic ? `El topico que mas conviene reforzar es ${weakTopic.topic}.` : "El sistema detecta una oportunidad general de mejora.", priority1: weakTopic ? `Entrenar ${weakTopic.topic}.` : "Entrenar Decision arbitral.", priority2: weakCriterion ? `Cuidar especialmente ${weakCriterion.label.toLowerCase()}.` : "Completar ejercicios de distintos topicos.", nextStep: "Completar una serie corta de 5 clips.", reason: "El plan se basa en la debilidad real mas marcada de tu actividad.", href: "/training/decision" };
}

export function getRankingRows(attempts: AttemptRecord[], currentUserId?: string | null, profiles: RankingProfileRecord[] = []): RankingRow[] {
  const profileMap = new Map(
    profiles
      .filter((profile) => profile.user_id)
      .map((profile) => [profile.user_id as string, profile])
  );
  const grouped = groupBy(attempts.filter((attempt) => attempt.user_id && isNumber(cleanScore(attempt.score))), (attempt) => attempt.user_id as string);
  const rows = Array.from(grouped.entries()).map(([userId, userAttempts]) => {
    const scores = userAttempts.map((attempt) => cleanScore(attempt.score)).filter(isNumber);
    const sorted = sortByDateDesc(userAttempts);
    const profile = profileMap.get(userId);
    const tests = userAttempts.filter((attempt) => ["exam", "rules_exam"].includes(String(attempt.mode ?? ""))).length;
    return {
      userId,
      position: 0,
      name: getPublicRankingName(userId, profile, currentUserId),
      refCardId: resolveRefCardId(userId, profile),
      attempts: scores.length,
      trainings: Math.max(0, scores.length - tests),
      tests,
      avgScore: average(scores) ?? 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
      lastAttempt: sorted[0]?.created_at ?? "",
    };
  });
  return rows.sort((a, b) => b.avgScore !== a.avgScore ? b.avgScore - a.avgScore : b.bestScore !== a.bestScore ? b.bestScore - a.bestScore : b.attempts - a.attempts).map((row, index) => ({ ...row, position: index + 1 }));
}
export function formatScore(value: number | null | undefined) {
  return isNumber(value) ? `${value}/100` : "Sin datos";
}
export function formatPercent(value: number | null | undefined) {
  return isNumber(value) ? `${value}%` : "Sin datos";
}
export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function normalizeModule(module?: string | null, mode?: string | null, topic?: string | null): ModuleKey {
  const value = `${module ?? ""} ${mode ?? ""} ${topic ?? ""}`.toLowerCase();

  if (value.includes("english") || value.includes("ingles")) return "english";
  if (value.includes("var")) return "var";
  if (value.includes("preparation") || value.includes("physical") || value.includes("fisic")) return "preparation";
  if (value.includes("communication") || value.includes("liderazgo")) return "communication";
  if (value.includes("video")) return "video";

  return "decision";
}

function getModeLabel(module: ModuleKey, mode?: string | null, topic?: string | null) {
  if (module === "var") return "VAR Lab";
  if (module === "english") return "Ingles arbitral";
  if (module === "preparation") return mode === "physical_training" ? "Entrenamiento fisico" : "Preparacion del arbitro";
  if (module === "communication") return "Comunicacion y liderazgo";
  if (module === "video") return "Video analisis";
  return topic === "VAR" ? "VAR Lab" : "Entrenamiento";
}

function fallbackTitleForModule(module: ModuleKey) {
  const titles: Record<ModuleKey, string> = {
    decision: "Ejercicio de entrenamiento",
    video: "Analisis de video",
    var: "Caso VAR Lab",
    english: "Respuesta de ingles arbitral",
    communication: "Comunicacion y liderazgo",
    preparation: "Sesion de preparacion del arbitro",
  };

  return titles[module];
}

function resultFromAttempt(attempt: AttemptRecord, score: number | null): PerformanceItem["result"] {
  if (typeof attempt.is_correct === "boolean") return attempt.is_correct ? "Correcto" : "Incorrecto";
  if (typeof attempt.completed === "boolean" && attempt.module === "referee_preparation") return attempt.completed ? "Correcto" : "Parcial";
  return resultFromScore(score);
}

function booleanFromScore(value?: number | null) {
  if (!isNumber(value)) return undefined;
  return value >= 70;
}

function cleanDuration(value?: number | null) {
  if (!isNumber(value)) return null;
  return Math.max(0, Math.round(value));
}

function formatDuration(seconds: number | null | undefined) {
  if (!isNumber(seconds)) return "Sin datos";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}
function normalizeTopic(topic?: string | null) {
  if (!topic) return "Sin topico";
  return topicDictionary[topic] ?? topic;
}
function cleanScore(value?: number | null) {
  if (!isNumber(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
function resultFromScore(score: number | null): PerformanceItem["result"] {
  if (!isNumber(score)) return "Sin datos";
  if (score >= 85) return "Correcto";
  if (score >= 60) return "Parcial";
  return "Incorrecto";
}
function decisionFromBoolean(value?: boolean | null) {
  if (value === true) return "Infraccion";
  if (value === false) return "No infraccion";
  return null;
}
function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const key = getKey(item);
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
  });
  return map;
}
function sortByDateDesc<T extends { date?: string | null; created_at?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => dateMs(b.date ?? b.created_at) - dateMs(a.date ?? a.created_at));
}
function sortByDateAsc<T extends { date?: string | null; created_at?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => dateMs(a.date ?? a.created_at) - dateMs(b.date ?? b.created_at));
}
function dateMs(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function topMetric(metrics: TopicMetric[]) {
  return metrics.filter((metric) => metric.attempts > 0 && metric.accuracy !== null)[0];
}
function bottomMetric(metrics: TopicMetric[]) {
  return [...metrics].filter((metric) => metric.attempts > 0 && metric.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0];
}
function topCriterion(metrics: CriterionMetric[]) {
  return [...metrics].filter((metric) => metric.attempts > 0 && metric.accuracy !== null).sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
}
function bottomCriterion(metrics: CriterionMetric[]) {
  return [...metrics].filter((metric) => metric.attempts > 0 && metric.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0];
}
function getGeneralStatus(avg: number | null, attempts: number) {
  if (attempts === 0 || avg === null) return "Sin datos";
  if (attempts < 5) return "Inicial";
  if (avg < 70) return "En desarrollo";
  if (avg < 85) return "Solido";
  if (avg < 95) return "Avanzado";
  return "Elite";
}
function inferRecommendedModule(topic?: TopicMetric, criterion?: CriterionMetric) {
  if (criterion?.key === "var" || topic?.topic === "VAR") return "VAR Lab";
  if (criterion?.key === "justification") return "Video analisis";
  if (criterion || topic) return "Decision arbitral";
  return "Sin datos suficientes";
}
function getTrendLabel(total: number, variation: number | null) {
  if (total < 5 || variation === null) return "Sin datos suficientes";
  if (Math.abs(variation) <= 2) return "Estable";
  return variation > 0 ? "Subiendo" : "Bajando";
}
function countSince(sessions: PerformanceSession[], days: number) {
  const now = Date.now();
  const limit = days * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => {
    const value = dateMs(session.date);
    return value > 0 && now - value <= limit;
  }).length;
}
function getRegularity(sessions: PerformanceSession[]) {
  const weekly = countSince(sessions, 7);
  const monthly = countSince(sessions, 30);
  if (sessions.length === 0) return "Sin actividad";
  if (weekly >= 3) return "Alta";
  if (weekly >= 1 || monthly >= 4) return "Media";
  return "Baja";
}
function getSmallTrend(items: PerformanceItem[]) {
  const sorted = sortByDateAsc(items).map((item) => item.score).filter(isNumber);
  if (sorted.length < 5) return "Sin datos suficientes";
  const recent = average(sorted.slice(-3));
  const previous = average(sorted.slice(0, -3));
  if (recent === null || previous === null) return "Sin datos suficientes";
  const diff = recent - previous;
  if (Math.abs(diff) <= 2) return "Estable";
  return diff > 0 ? "Subiendo" : "Bajando";
}
function getTopicStatus(attempts: number, accuracy: number | null) {
  if (attempts === 0 || accuracy === null) return "Sin datos";
  if (attempts < 3) return "Muestra insuficiente";
  if (accuracy < 70) return "A mejorar";
  if (accuracy < 85) return "Correcto";
  return "Fortaleza";
}
function getCriterionStatus(attempts: number, accuracy: number | null) {
  if (attempts === 0 || accuracy === null) return "Metrica en construccion";
  if (attempts < 3) return "Muestra insuficiente";
  if (accuracy < 70) return "A mejorar";
  if (accuracy < 85) return "Correcto";
  return "Fortaleza";
}
function moduleStatus(items: PerformanceItem[], key: ModuleKey): ModulePerformance["status"] {
  return items.some((item) => item.module === key) ? "Disponible" : "Sin datos";
}
function moduleAverage(items: PerformanceItem[], key: ModuleKey) {
  return average(items.filter((item) => item.module === key).map((item) => item.score).filter(isNumber));
}
function metricFromItems(label: string, items: PerformanceItem[]): ModuleMetric {
  return { label, value: items.length > 0 ? String(items.length) : "Sin datos", detail: items.length > 0 ? "Calculado con registros reales." : "Disponible cuando existan intentos registrados.", available: items.length > 0 };
}
function metricFromAverage(label: string, value: number | null): ModuleMetric {
  return { label, value: formatScore(value), detail: value === null ? "Sin datos suficientes." : "Promedio real del modulo.", available: value !== null };
}
function metricFromCriterion(label: string, metric?: CriterionMetric): ModuleMetric {
  const available = Boolean(metric && metric.attempts > 0 && metric.accuracy !== null);
  return { label, value: available ? formatPercent(metric?.accuracy) : "Sin datos", detail: available ? `${metric?.correct}/${metric?.attempts} aciertos.` : "Sin registros para este criterio.", available };
}
function metricFromTopic(label: string, metric?: TopicMetric): ModuleMetric {
  const available = Boolean(metric && metric.attempts > 0 && metric.accuracy !== null);
  return { label, value: available ? formatPercent(metric?.accuracy) : "Sin datos", detail: available ? `${metric?.correct}/${metric?.attempts} aciertos.` : "Sin registros para este topico.", available };
}
function metricUnavailable(label: string, detail: string): ModuleMetric {
  return { label, value: "En construccion", detail, available: false };
}









