import {
  type AttemptRecord,
  type ExamResultRecord,
  type ModuleKey,
  type PerformanceClipRecord,
  type PerformanceSession,
  type PerformanceWarning,
  type RulesExamResultRecord,
  type SummaryMetric,
  type TopicMetric,
} from "./performance.ts";
import { getDisciplineAction, getDisciplineRoute } from "./discipline.ts";
import { getRadarAxesForSport, type MetricFieldKey } from "./sportMetrics.ts";
import {
  DEFAULT_SPORT_TYPE,
  getSportLabel,
  getSportTopicLabels,
  normalizeSportTopic,
  normalizeSportType,
  type SportType,
} from "./sports.ts";

export type SportCriterionKey =
  | "technical"
  | "restart"
  | "discipline"
  | "subtype"
  | "accumulated_fouls"
  | "four_seconds"
  | "goalkeeper"
  | "justification"
  | "var";

export type SportPerformanceItem = {
  id: string;
  source: "training" | "exam" | "rules_exam";
  module: ModuleKey;
  modeLabel: string;
  date: string;
  title: string;
  topic: string;
  rawTopic: string;
  difficulty?: string | null;
  score: number | null;
  result: "Correcto" | "Parcial" | "Incorrecto" | "Sin datos";
  topicValid?: boolean;
  clipId?: string | null;
  selectedDecision?: string | null;
  correctDecision?: string | null;
  selectedRestart?: string | null;
  correctRestart?: string | null;
  selectedDiscipline?: string | null;
  correctDiscipline?: string | null;
  answerText?: string | null;
  feedback?: string | null;
  timeSpentSeconds?: number | null;
  ruleReference?: string | null;
  criteria: Partial<Record<SportCriterionKey, boolean>>;
};

export type SportCriterionMetric = {
  key: SportCriterionKey;
  label: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
  status: string;
  description: string;
};

export type SportModuleMetric = {
  label: string;
  value: string;
  detail: string;
  available: boolean;
};

export type SportModulePerformance = {
  key: ModuleKey;
  title: string;
  description: string;
  status: "Disponible" | "Sin datos" | "Metricas en construccion";
  metrics: SportModuleMetric[];
};

export type SportPerformanceSummary = {
  hasData: boolean;
  avgScore: number | null;
  totalAttempts: number;
  totalTrainings: number;
  totalEvaluations: number;
  bestScore: number | null;
  lastScore: number | null;
  strongestTopic?: TopicMetric;
  weakestTopic?: TopicMetric;
  strongestCriterion?: SportCriterionMetric;
  weakestCriterion?: SportCriterionMetric;
  recommendedModule: string;
  status: string;
  sampleNote: string;
  metrics: SummaryMetric[];
};

export type SportRecommendedPlan = {
  diagnosis: string;
  priority1: string;
  priority2: string;
  nextStep: string;
  reason: string;
  href: string;
};

export type RadarMetric = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  attempts: number;
  measurements: number;
  correct: number;
  accuracy: number | null;
  emptyStateLabel: string;
};

export type DifficultyMetric = {
  difficulty: string;
  attempts: number;
  accuracy: number | null;
  avgScore: number | null;
};

export type RuleMetric = {
  ruleReference: string;
  attempts: number;
  accuracy: number | null;
};

const criterionLabels: Record<SportCriterionKey, string> = {
  technical: "Decision tecnica",
  restart: "Reanudacion",
  discipline: "Sancion disciplinaria",
  subtype: "Subtipo de infraccion",
  accumulated_fouls: "Faltas acumuladas",
  four_seconds: "Control de cuatro segundos",
  goalkeeper: "Guardameta y portero-jugador",
  justification: "Justificacion",
  var: "Criterio VAR",
};

const criterionDescriptions: Record<SportCriterionKey, string> = {
  technical: "Si la decision principal fue correcta.",
  restart: "Si la reanudacion reglamentaria fue correcta.",
  discipline: "Si la sancion disciplinaria fue correcta.",
  subtype: "Si el subtipo o la clasificacion especifica fue correcta.",
  accumulated_fouls:
    "Si se reconocio correctamente el regimen de faltas acumuladas.",
  four_seconds:
    "Si se aplico correctamente el control reglamentario de cuatro segundos.",
  goalkeeper:
    "Si la actuacion del guardameta o portero-jugador fue evaluada correctamente.",
  justification:
    "Si la explicacion escrita sostuvo correctamente la decision.",
  var: "Si el criterio o protocolo VAR fue aplicado correctamente.",
};

const radarFieldToCriterion: Record<MetricFieldKey, SportCriterionKey> = {
  technical_correct: "technical",
  restart_correct: "restart",
  disciplinary_correct: "discipline",
  subtype_correct: "subtype",
  accumulated_foul_correct: "accumulated_fouls",
  four_second_correct: "four_seconds",
  goalkeeper_correct: "goalkeeper",
};

export function buildSportPerformanceDataset({
  attempts,
  examResults,
  rulesExamResults,
  clips = [],
  sportType = DEFAULT_SPORT_TYPE,
  validatedOfficialExamResultIds,
}: {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
  rulesExamResults: RulesExamResultRecord[];
  clips?: PerformanceClipRecord[];
  sportType?: SportType;
  validatedOfficialExamResultIds?: ReadonlySet<string>;
}) {
  const items: SportPerformanceItem[] = [];
  const sessions: PerformanceSession[] = [];
  const warnings: PerformanceWarning[] = [];
  const clipMap = new Map(
    clips
      .filter((clip) => normalizeSportType(clip.sport_type) === sportType)
      .filter((clip) => Boolean(clip.id))
      .map((clip) => [String(clip.id), clip])
  );
  const hasClipIndex = clipMap.size > 0;
  const radarTopics = new Set(getSportTopicLabels(sportType));
  const examAttemptKeys = new Set<string>();

  attempts.forEach((attempt, index) => {
    if (normalizeSportType(attempt.sport_type) !== sportType) return;

    const score = cleanScore(attempt.score);
    const examResultId = attempt.exam_result_id?.trim() ?? "";
    const isValidatedOfficialAttempt = Boolean(
      examResultId && validatedOfficialExamResultIds?.has(examResultId)
    );
    const clipId = attempt.clip_id?.trim() ?? "";
    const clip = clipId ? clipMap.get(clipId) : undefined;
    const isExamAttempt =
      isValidatedOfficialAttempt ||
      String(attempt.mode ?? "").toLowerCase() === "exam";
    const hasMissingClip = hasClipIndex && clipId && !clip;

    if (hasMissingClip) {
      warnings.push({
        type: "attempt",
        id: attempt.id ?? clipId,
        message: `Intento con clip_id ${clipId} sin clip asociado en clips.`,
      });
    }

    if (hasMissingClip && !isExamAttempt) return;

    if (clip && !isActiveClip(clip) && !isExamAttempt) {
      warnings.push({
        type: "attempt",
        id: attempt.id ?? clipId,
        message: `Intento vinculado a un clip inactivo: ${clipId}.`,
      });
      return;
    }

    const storedTopic = normalizeSportTopic(attempt.topic, sportType);
    const resolvedTopic = isValidatedOfficialAttempt
      ? attempt.topic
      : getClipTopic(clip, sportType) || attempt.topic;
    const topic = normalizeSportTopic(resolvedTopic, sportType);
    const topicValid = isRadarTopicValid(
      topic,
      clip,
      hasClipIndex,
      storedTopic,
      sportType,
      isValidatedOfficialAttempt
    );
    const date = attempt.created_at ?? "";
    const moduleKey = normalizeModule(
      clip?.module ?? attempt.module,
      clip?.mode ?? attempt.mode,
      topic
    );
    const modeLabel = getModeLabel(moduleKey, attempt.mode, topic);
    const title =
      clip?.title ??
      attempt.clip_title ??
      attempt.workout_name ??
      fallbackTitleForModule(moduleKey);
    const timeSpentSeconds = cleanDuration(
      attempt.time_spent_seconds ?? attempt.time_spent
    );

    if (isExamAttempt) {
      examAttemptKeys.add(makeExamAnswerKey(clipId, storedTopic, score));
    }

    items.push({
      id: attempt.id ?? `attempt-${index}`,
      source: isExamAttempt ? "exam" : "training",
      module: moduleKey,
      modeLabel,
      date,
      title,
      topic,
      rawTopic: resolvedTopic ?? topic,
      topicValid,
      clipId: clipId || null,
      difficulty: attempt.difficulty,
      score,
      result: resultFromAttempt(attempt, score),
      selectedDecision:
        attempt.selected_decision ?? decisionFromBoolean(attempt.foul),
      correctDecision: attempt.correct_decision,
      selectedRestart: attempt.selected_restart ?? attempt.restart,
      correctRestart: attempt.correct_restart,
      selectedDiscipline: attempt.selected_discipline ?? attempt.discipline,
      correctDiscipline: attempt.correct_discipline,
      answerText: attempt.answer_text,
      feedback: attempt.feedback,
      timeSpentSeconds,
      ruleReference: attempt.rule_reference,
      criteria: {
        technical:
          attempt.technical_correct ??
          attempt.final_decision_correct ??
          attempt.is_correct ??
          booleanFromScore(attempt.technical_accuracy_score),
        restart: attempt.restart_correct ?? undefined,
        discipline:
          attempt.disciplinary_correct ?? attempt.discipline_correct ?? undefined,
        subtype: attempt.subtype_correct ?? undefined,
        accumulated_fouls: attempt.accumulated_foul_correct ?? undefined,
        four_seconds: attempt.four_second_correct ?? undefined,
        goalkeeper: attempt.goalkeeper_correct ?? undefined,
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

    if (!isExamAttempt) {
      sessions.push({
        id: attempt.id ?? `attempt-session-${index}`,
        source: "training",
        label: modeLabel,
        date,
        score,
        totalItems: 1,
      });
    }
  });

  examResults.forEach((exam, examIndex) => {
    if (normalizeSportType(exam.sport_type) !== sportType) return;

    const date = exam.created_at ?? "";
    const score = cleanScore(exam.avg_score);
    const answers = Array.isArray(exam.details) ? exam.details : [];

    sessions.push({
      id: exam.id ?? `exam-session-${examIndex}`,
      source: "exam",
      label: "Examen arbitral",
      date,
      score,
      totalItems: Number(exam.total_questions ?? answers.length ?? 0),
    });

    answers.forEach((answer, answerIndex) => {
      const answerScore = cleanScore(answer.score);
      const clipId = answer.clipId?.trim() ?? "";
      const clip = clipId ? clipMap.get(clipId) : undefined;
      const storedTopic = normalizeSportTopic(answer.topic, sportType);
      const topic = normalizeSportTopic(getClipTopic(clip, sportType) || answer.topic, sportType);
      const dedupeKey = makeExamAnswerKey(clipId, storedTopic, answerScore);
      const topicValid = isRadarTopicValid(
        topic,
        clip,
        hasClipIndex,
        storedTopic,
        sportType
      );

      if (examAttemptKeys.has(dedupeKey)) return;

      items.push({
        id: `${exam.id ?? `exam-${examIndex}`}-${answer.clipId ?? answerIndex}`,
        source: "exam",
        module: topic === "VAR" ? "var" : "video",
        modeLabel: "Examen arbitral",
        date,
        title: answer.clipTitle ?? "Clip de examen",
        topic,
        rawTopic: answer.topic ?? topic,
        topicValid,
        clipId: clipId || null,
        difficulty: answer.difficulty,
        score: answerScore,
        result: resultFromScore(answerScore),
        selectedDecision: decisionFromBoolean(answer.foul),
        correctDecision: decisionFromBoolean(answer.correctFoul),
        selectedRestart: answer.restart,
        correctRestart: answer.correctRestart,
        selectedDiscipline: answer.discipline,
        correctDiscipline: answer.correctDiscipline,
        ruleReference: null,
        criteria: {
          technical: answer.technicalCorrect ?? undefined,
          restart: answer.restartCorrect ?? undefined,
          discipline: answer.disciplineCorrect ?? undefined,
          subtype: answer.subtypeCorrect ?? undefined,
        },
      });
    });
  });

  rulesExamResults.forEach((exam, examIndex) => {
    if (normalizeSportType(exam.sport_type) !== sportType) return;

    const date = exam.created_at ?? "";
    const score = cleanScore(exam.percentage);
    const answers = Array.isArray(exam.details) ? exam.details : [];

    sessions.push({
      id: exam.id ?? `rules-session-${examIndex}`,
      source: "rules_exam",
      label: "Examen de reglas",
      date,
      score,
      totalItems: Number(exam.total_questions ?? answers.length ?? 0),
    });

    answers.forEach((answer, answerIndex) => {
      const topic = normalizeSportTopic(answer.topic, sportType);
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
        topicValid: !radarTopics.has(topic),
        clipId: null,
        score: scoreValue,
        result: answer.is_correct ? "Correcto" : "Incorrecto",
        selectedDecision: answer.selected_text,
        correctDecision: answer.correct_text,
        feedback: answer.explanation,
        ruleReference: null,
        criteria: { technical: answer.is_correct ?? undefined },
      });
    });
  });

  return {
    items: sortByDateDesc(items),
    sessions: sortByDateDesc(sessions),
    warnings,
  };
}

export function getSportTopicPerformance(
  items: SportPerformanceItem[],
  sportType: SportType
): TopicMetric[] {
  const orderedTopics = getSportTopicLabels(sportType);

  return orderedTopics
    .map((topic) => {
      const topicItems = items.filter(
        (item) => item.topic === topic && item.topicValid !== false
      );
      if (topicItems.length === 0) return null;

      const scores = topicItems.map((item) => item.score).filter(isNumber);
      const correct = topicItems.filter((item) => item.result === "Correcto").length;
      const errors = topicItems.filter((item) => item.result === "Incorrecto").length;
      const accuracy = Math.round((correct / topicItems.length) * 100);

      const metric: TopicMetric = {
        topic,
        attempts: topicItems.length,
        correct,
        errors,
        accuracy,
        avgScore: averageToHundredths(scores),
        lastScore:
          sortByDateDesc(topicItems).find((item) => isNumber(item.score))?.score ??
          null,
        trend: getSmallTrend(topicItems),
        status: getTopicStatus(topicItems.length, accuracy),
      };

      return metric;
    })
    .filter((metric): metric is TopicMetric => metric !== null);
}

export function getSportCriterionPerformance(
  items: SportPerformanceItem[],
  sportType: SportType
): SportCriterionMetric[] {
  const metricItems = getMetricEligibleItems(items, sportType);
  const criterionKeys: SportCriterionKey[] =
    sportType === "futsal"
      ? ["technical", "restart", "discipline", "subtype", "accumulated_fouls"]
      : ["technical", "restart", "discipline", "subtype"];

  const optionalCriterionKeys: SportCriterionKey[] =
    sportType === "futsal" ? ["justification"] : ["justification", "var"];
  const optionalKeys = optionalCriterionKeys.filter((key) =>
    metricItems.some((item) => typeof item.criteria[key] === "boolean")
  );

  return [...criterionKeys, ...optionalKeys].map((key) => {
    const values = metricItems
      .map((item) => item.criteria[key])
      .filter((value): value is boolean => typeof value === "boolean");
    const correct = values.filter(Boolean).length;
    const accuracy = values.length
      ? Math.round((correct / values.length) * 100)
      : null;

    const metric: SportCriterionMetric = {
      key,
      label: criterionLabels[key],
      attempts: values.length,
      correct,
      accuracy,
      status: getCriterionStatus(values.length, accuracy),
      description: criterionDescriptions[key],
    };

    return metric;
  });
}

export function getSportRadarData(
  items: SportPerformanceItem[],
  sportType: SportType
): RadarMetric[] {
  return getRadarAxesForSport(sportType).map((axis) => {
    const axisTopics = new Set(
      axis.topics.map((topic) => normalizeSportTopic(topic, sportType, topic))
    );
    const axisItems = items.filter(
      (item) => axisTopics.has(item.topic) && item.topicValid !== false
    );
    const measurements = axisItems.flatMap((item) =>
      axis.requiredFields
        .map((field) => item.criteria[radarFieldToCriterion[field]])
        .filter((value): value is boolean => typeof value === "boolean")
    );
    const correct = measurements.filter(Boolean).length;
    const accuracy = measurements.length
      ? Math.round((correct / measurements.length) * 100)
      : null;

    return {
      key: axis.key,
      label: axis.label,
      shortLabel: axis.shortLabel,
      description: axis.description,
      attempts: axisItems.length,
      measurements: measurements.length,
      correct,
      accuracy,
      emptyStateLabel: axis.emptyStateLabel,
    } satisfies RadarMetric;
  });
}

export function getSportPerformanceSummary(
  items: SportPerformanceItem[],
  sessions: PerformanceSession[],
  sportType: SportType
) {
  const metricItems = getMetricEligibleItems(items, sportType);
  const scores = metricItems.map((item) => item.score).filter(isNumber);
  const avgScore = average(scores);
  const topics = getSportTopicPerformance(metricItems, sportType);
  const criteria = getSportCriterionPerformance(metricItems, sportType);
  const strongestTopic = topMetric(topics);
  const weakestTopic = bottomMetric(topics);
  const strongestCriterion = topCriterion(criteria);
  const weakestCriterion = bottomCriterion(criteria);
  const totalTrainings =
    sportType === "futsal"
      ? metricItems.filter((item) => item.source === "training").length
      : sessions.filter((session) => session.source === "training").length;
  const totalEvaluations =
    sportType === "futsal"
      ? metricItems.filter((item) => item.source !== "training").length
      : sessions.filter((session) => session.source !== "training").length;
  const bestScore = scores.length ? Math.max(...scores) : null;
  const lastScore =
    sportType === "futsal"
      ? sortByDateDesc(metricItems).find((item) => isNumber(item.score))?.score ?? null
      : sessions.find((session) => isNumber(session.score))?.score ?? null;
  const status = getGeneralStatus(avgScore, metricItems.length);
  const recommendedModule = inferRecommendedModule(sportType, weakestTopic, weakestCriterion);
  const sampleNote =
    metricItems.length === 0
      ? "Todavia no hay datos registrados."
      : metricItems.length < 5
        ? "Muestra inicial: completa mas ejercicios para un diagnostico mas preciso."
        : "Diagnostico calculado con actividad real registrada.";

  return {
    hasData: metricItems.length > 0,
    avgScore,
    totalAttempts: metricItems.length,
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
      {
        label: "Promedio general",
        value: formatScore(avgScore),
        detail: sampleNote,
        tone:
          avgScore === null
            ? "neutral"
            : avgScore >= 85
              ? "success"
              : avgScore >= 70
                ? "warning"
                : "danger",
      },
      {
        label: "Intentos analizados",
        value: String(metricItems.length),
        detail: `Actividad real de ${getSportLabel(sportType)}.`,
      },
      {
        label: "Entrenamientos",
        value: String(totalTrainings),
        detail: "Intentos individuales guardados.",
      },
      {
        label: "Evaluaciones",
        value: String(totalEvaluations),
        detail: "Videoanalisis y examen de reglas.",
      },
      {
        label: "Mejor score",
        value: formatScore(bestScore),
        detail: "Mayor resultado individual registrado.",
        tone: "success",
      },
      {
        label: "Ultimo score",
        value: formatScore(lastScore),
        detail: "Ultima sesion registrada.",
      },
      {
        label: "Topico fuerte",
        value: strongestTopic?.topic ?? "Sin datos",
        detail: strongestTopic
          ? `${formatPercent(strongestTopic.accuracy)} de acierto`
          : "Completa ejercicios para detectarlo.",
        tone: "success",
      },
      {
        label: "Topico debil",
        value: weakestTopic?.topic ?? "Sin datos",
        detail: weakestTopic
          ? `${formatPercent(weakestTopic.accuracy)} de acierto`
          : "Completa ejercicios para detectarlo.",
        tone: "danger",
      },
      {
        label: "Criterio fuerte",
        value: strongestCriterion?.label ?? "Sin datos",
        detail: strongestCriterion
          ? `${formatPercent(strongestCriterion.accuracy)} de precision`
          : "No hay criterios suficientes.",
        tone: "success",
      },
      {
        label: "Criterio a mejorar",
        value: weakestCriterion?.label ?? "Sin datos",
        detail: weakestCriterion
          ? `${formatPercent(weakestCriterion.accuracy)} de precision`
          : "No hay criterios suficientes.",
        tone: "danger",
      },
      {
        label: "Modulo recomendado",
        value: recommendedModule,
        detail: "Sugerido segun debilidades disponibles.",
        tone: "warning",
      },
      { label: "Estado general", value: status, detail: sampleNote },
    ],
  } satisfies SportPerformanceSummary;
}

export function getSportRecommendedPlan(
  summary: SportPerformanceSummary,
  sportType: SportType
) {
  const trainingHref = getDisciplineAction(sportType, "primaryTraining");
  const evaluationHref = getDisciplineRoute(sportType, "rulesExam");

  if (!summary.hasData) {
    return {
      diagnosis: "Todavia no hay intentos guardados para generar diagnostico.",
      priority1:
        sportType === "futsal"
          ? "Comenzar con videoanalisis de futsal."
          : "Comenzar con entrenamiento con clips.",
      priority2: "Completar una evaluacion formal para activar metricas.",
      nextStep: "Realizar el primer entrenamiento con casos reales.",
      reason: "RefLab necesita datos reales para detectar patrones.",
      href: trainingHref,
    } satisfies SportRecommendedPlan;
  }

  if (summary.totalAttempts < 5) {
    const exampleTopics = getSportTopicLabels(sportType).slice(0, 3).join(", ");
    return {
      diagnosis: "Hay actividad inicial, pero la muestra todavia es pequena.",
      priority1: "Completar al menos 5 ejercicios.",
      priority2: `Incluir topicos distintos: ${exampleTopics}.`,
      nextStep: "Seguir entrenando con clips de la disciplina seleccionada.",
      reason: "Con mas intentos el diagnostico tecnico sera mas confiable.",
      href: trainingHref,
    } satisfies SportRecommendedPlan;
  }

  const weakCriterion = summary.weakestCriterion;
  const weakTopic = summary.weakestTopic;

  if (
    weakCriterion?.key === "discipline" ||
    weakCriterion?.key === "accumulated_fouls"
  ) {
    return {
      diagnosis:
        "El rendimiento general muestra una debilidad en criterio disciplinario o especifico de la disciplina.",
      priority1:
        sportType === "futsal"
          ? "Trabajar disputas, faltas tacticas y consecuencia disciplinaria."
          : "Trabajar intensidad, punto de contacto y consecuencia tactica.",
      priority2: weakTopic ? `Entrenar ${weakTopic.topic}.` : "Profundizar el topico mas debil.",
      nextStep: "Realizar 5 casos enfocados en la debilidad detectada.",
      reason:
        "Los aciertos tecnicos pierden valor cuando falla la consecuencia reglamentaria.",
      href: trainingHref,
    } satisfies SportRecommendedPlan;
  }

  if (
    weakCriterion?.key === "restart" ||
    weakCriterion?.key === "subtype"
  ) {
    return {
      diagnosis:
        "La decision principal puede ser correcta, pero la aplicacion reglamentaria necesita refuerzo.",
      priority1:
        sportType === "futsal"
          ? "Revisar reanudaciones y clasificacion en los tres topicos tecnicos."
          : "Revisar reanudaciones, subtipo y aplicacion reglamentaria.",
      priority2: weakTopic ? `Aplicarlo en ${weakTopic.topic}.` : "Practicar topicos con reanudacion.",
      nextStep: "Entrenar clips con foco exclusivo en la aplicacion final.",
      reason: "La reanudacion y el procedimiento son parte central de la decision final.",
      href: trainingHref,
    } satisfies SportRecommendedPlan;
  }

  if (weakCriterion?.key === "var" || weakTopic?.topic === "VAR") {
    return {
      diagnosis: "El patron mas debil aparece relacionado con criterio VAR.",
      priority1: "Practicar protocolo VAR, APP y error claro y obvio.",
      priority2: "Separar factual vs interpretativo.",
      nextStep: "Abrir VAR Lab.",
      reason: "El VAR exige una capa de decision distinta a la lectura de campo.",
      href: "/training/var",
    } satisfies SportRecommendedPlan;
  }

  if ((summary.avgScore ?? 0) >= 85) {
    return {
      diagnosis: "El rendimiento general es alto con los datos disponibles.",
      priority1: "Subir dificultad.",
      priority2: "Usar simulaciones cronometradas o examenes formales.",
      nextStep: "Rendir una evaluacion completa.",
      reason:
        "Cuando el promedio es alto, el crecimiento viene por presion, volumen y dificultad.",
      href: evaluationHref,
    } satisfies SportRecommendedPlan;
  }

  return {
    diagnosis: weakTopic
      ? `El topico que mas conviene reforzar es ${weakTopic.topic}.`
      : "El sistema detecta una oportunidad general de mejora.",
    priority1: weakTopic ? `Entrenar ${weakTopic.topic}.` : "Entrenar con clips reales.",
    priority2: weakCriterion
      ? `Cuidar especialmente ${weakCriterion.label.toLowerCase()}.`
      : "Completar ejercicios de distintos topicos.",
    nextStep: "Completar una serie corta de 5 casos.",
    reason: "El plan se basa en la debilidad real mas marcada de tu actividad.",
    href: trainingHref,
  } satisfies SportRecommendedPlan;
}

export function getSportModulePerformance(
  items: SportPerformanceItem[],
  sportType: SportType
) {
  const metricItems = getMetricEligibleItems(items, sportType);
  const topics = getSportTopicPerformance(metricItems, sportType);
  const criteria = getSportCriterionPerformance(metricItems, sportType);
  const preparationItems = items.filter((item) => item.module === "preparation");
  const preparationSeconds = preparationItems
    .map((item) => item.timeSpentSeconds)
    .filter(isNumber)
    .reduce((acc, value) => acc + value, 0);

  const modules: SportModulePerformance[] = [
    {
      key: "decision",
      title:
        sportType === "futsal"
          ? "Videoanalisis de futsal"
          : "Entrenamiento con clips",
      description:
        sportType === "futsal"
          ? "Evalua lectura tecnica, reanudaciones, disciplina y criterios propios de futsal."
          : "Evalua si cobraste bien, la reanudacion y la sancion disciplinaria.",
      status: moduleStatus(metricItems, "decision"),
      metrics: [
        metricFromItems("Intentos realizados", metricItems.filter((item) => item.module === "decision")),
        metricFromAverage("Promedio del modulo", moduleAverage(metricItems, "decision")),
        metricFromCriterion("Precision tecnica", criteria.find((item) => item.key === "technical")),
        metricFromCriterion("Precision disciplinaria", criteria.find((item) => item.key === "discipline")),
        metricFromCriterion("Precision en reanudacion", criteria.find((item) => item.key === "restart")),
        metricFromTopic(
          sportType === "futsal" ? "Rendimiento en disputas" : "Aciertos en manos",
          topics.find((item) =>
            item.topic ===
            (sportType === "futsal" ? "Disputas" : "Manos")
          )
        ),
      ],
    },
    {
      key: "video",
      title: "Videoanalisis",
      description:
        "Evalua lectura tecnica, comprension de la jugada y observacion aplicada.",
      status: moduleStatus(metricItems, "video"),
      metrics: [
        metricFromItems("Clips analizados", metricItems.filter((item) => item.module === "video")),
        metricFromAverage("Promedio de analisis", moduleAverage(metricItems, "video")),
        metricFromCriterion(
          "Deteccion correcta de infraccion",
          criteria.find((item) => item.key === "technical")
        ),
        metricFromTopic(
          "Topico con mejor lectura",
          getBestMetric(topics)
        ),
      ],
    },
    {
      key: "communication",
      title: "Comunicacion arbitral",
      description:
        "Evalua explicacion de decisiones, claridad y precision tecnica.",
      status: moduleStatus(metricItems, "communication"),
      metrics: [
        metricFromItems(
          "Explicaciones guardadas",
          metricItems.filter((item) => item.module === "communication")
        ),
        metricFromAverage(
          "Comunicacion global",
          moduleAverage(metricItems, "communication")
        ),
        metricFromCriterion(
          "Precision tecnica",
          criteria.find((item) => item.key === "technical")
        ),
      ],
    },
    {
      key: "preparation",
      title: "Preparacion integral",
      description:
        "Evalua adherencia, constancia y sesiones registradas de preparacion fisica y mental.",
      status:
        preparationItems.length > 0 ? "Disponible" : "Metricas en construccion",
      metrics: [
        metricFromItems("Sesiones fisicas completadas", preparationItems),
        {
          label: "Minutos entrenados",
          value:
            preparationSeconds > 0 ? formatDuration(preparationSeconds) : "Sin datos",
          detail:
            preparationSeconds > 0
              ? "Suma de sesiones registradas."
              : "Disponible cuando se guarden sesiones fisicas.",
          available: preparationSeconds > 0,
        },
      ],
    },
  ];

  if (sportType === "football_11") {
    modules.splice(2, 0, {
      key: "var",
      title: "VAR Lab",
      description:
        "Evalua APP, OFR, factual vs interpretativo e intervencion VAR.",
      status: moduleStatus(items, "var"),
      metrics: [
        metricFromItems(
          "Casos VAR analizados",
          items.filter((item) => item.module === "var" || item.topic === "VAR")
        ),
        metricFromAverage("Precision VAR", moduleAverage(items, "var")),
        metricFromCriterion(
          "Criterio VAR",
          criteria.find((item) => item.key === "var")
        ),
      ],
    });
  }

  return modules;
}

export function getSportDifficultyPerformance(items: SportPerformanceItem[]) {
  return groupBy(
    items.filter((item) => textValue(item.difficulty)),
    (item) => String(item.difficulty)
  )
    .map(([difficulty, difficultyItems]) => {
      const scores = difficultyItems.map((item) => item.score).filter(isNumber);
      const correct = difficultyItems.filter((item) => item.result === "Correcto").length;
      return {
        difficulty,
        attempts: difficultyItems.length,
        accuracy: Math.round((correct / difficultyItems.length) * 100),
        avgScore: average(scores),
      } satisfies DifficultyMetric;
    })
    .sort((a, b) => b.attempts - a.attempts);
}

export function getSportRulePerformance(items: SportPerformanceItem[]) {
  return groupBy(
    items.filter((item) => textValue(item.ruleReference)),
    (item) => String(item.ruleReference)
  )
    .map(([ruleReference, ruleItems]) => {
      const correct = ruleItems.filter((item) => item.result === "Correcto").length;
      return {
        ruleReference,
        attempts: ruleItems.length,
        accuracy: Math.round((correct / ruleItems.length) * 100),
      } satisfies RuleMetric;
    })
    .sort((a, b) => b.attempts - a.attempts);
}

function getClipTopic(
  clip: PerformanceClipRecord | undefined,
  sportType: SportType
) {
  if (!clip) return "";
  const value = `${clip.topic ?? ""} ${clip.mode ?? ""} ${clip.module ?? ""}`.toLowerCase();
  if (sportType === "football_11" && value.includes("var")) return "VAR";
  return String(clip.topic ?? "");
}

function isRadarTopicValid(
  topic: string,
  clip: PerformanceClipRecord | undefined,
  hasClipIndex: boolean,
  storedTopic: string,
  sportType: SportType,
  isValidatedOfficialAttempt = false
) {
  const radarTopics = new Set(getSportTopicLabels(sportType));
  if (isValidatedOfficialAttempt) return radarTopics.has(topic);
  if (!radarTopics.has(topic)) return sportType === "football_11";
  if (!hasClipIndex) return false;
  if (!clip || !isActiveClip(clip)) return false;
  if (storedTopic && storedTopic !== "Sin topico" && storedTopic !== topic) return false;
  return true;
}

function getMetricEligibleItems(
  items: SportPerformanceItem[],
  sportType: SportType
) {
  if (sportType === "football_11") return items;

  const allowedTopics = new Set(getSportTopicLabels(sportType));
  return items.filter(
    (item) => allowedTopics.has(item.topic) && item.topicValid !== false
  );
}

function isActiveClip(clip: PerformanceClipRecord) {
  const status = String(clip.status ?? "").toLowerCase();
  return clip.is_active !== false && status !== "archived" && status !== "inactive";
}

function normalizeModule(
  module?: string | null,
  mode?: string | null,
  topic?: string | null
): ModuleKey {
  const value = `${module ?? ""} ${mode ?? ""} ${topic ?? ""}`.toLowerCase();

  if (value.includes("english") || value.includes("ingles")) return "english";
  if (value.includes("var")) return "var";
  if (
    value.includes("preparation") ||
    value.includes("physical") ||
    value.includes("fisic")
  ) {
    return "preparation";
  }
  if (value.includes("communication") || value.includes("liderazgo")) {
    return "communication";
  }
  if (value.includes("video")) return "video";

  return "decision";
}

function getModeLabel(module: ModuleKey, mode?: string | null, topic?: string | null) {
  if (module === "var") return "VAR Lab";
  if (module === "english") return "Ingles arbitral";
  if (module === "preparation") {
    return mode === "physical_training"
      ? "Entrenamiento fisico"
      : "Preparacion Integral";
  }
  if (module === "communication") return "Comunicacion arbitral";
  if (module === "video") return "Videoanalisis";
  return topic === "VAR" ? "VAR Lab" : "Entrenamiento";
}

function fallbackTitleForModule(module: ModuleKey) {
  const titles: Record<ModuleKey, string> = {
    decision: "Ejercicio de entrenamiento",
    video: "Analisis de video",
    var: "Caso VAR Lab",
    english: "Respuesta de ingles arbitral",
    communication: "Explicacion de decision",
    preparation: "Sesion de preparacion del arbitro",
  };

  return titles[module];
}

function resultFromAttempt(attempt: AttemptRecord, score: number | null) {
  if (typeof attempt.is_correct === "boolean") {
    return attempt.is_correct ? "Correcto" : "Incorrecto";
  }
  if (
    typeof attempt.completed === "boolean" &&
    attempt.module === "referee_preparation"
  ) {
    return attempt.completed ? "Correcto" : "Parcial";
  }
  return resultFromScore(score);
}

function resultFromScore(score: number | null) {
  if (!isNumber(score)) return "Sin datos" as const;
  if (score >= 85) return "Correcto" as const;
  if (score >= 60) return "Parcial" as const;
  return "Incorrecto" as const;
}

function booleanFromScore(value?: number | null) {
  if (!isNumber(value)) return undefined;
  return value >= 70;
}

function decisionFromBoolean(value?: boolean | null) {
  if (value === true) return "Infraccion";
  if (value === false) return "No infraccion";
  return null;
}

function cleanScore(value?: number | null) {
  if (!isNumber(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
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

function makeExamAnswerKey(clipId: string, topic: string, score: number | null) {
  return [clipId, topic, score ?? "null"].join("|").toLowerCase();
}

function sortByDateDesc<T extends { date?: string | null; created_at?: string | null }>(
  items: T[]
) {
  return [...items].sort(
    (a, b) => dateMs(b.date ?? b.created_at) - dateMs(a.date ?? a.created_at)
  );
}

function dateMs(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

function averageToHundredths(values: number[]) {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((acc, value) => acc + value, 0) / values.length) * 100
    ) / 100
  );
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
  return Array.from(map.entries());
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function getSmallTrend(items: SportPerformanceItem[]) {
  const ordered = sortByDateDesc(items).slice(0, 5);
  const scores = ordered.map((item) => item.score).filter(isNumber);
  if (scores.length < 2) return "Sin datos";
  const latest = scores[0];
  const oldest = scores[scores.length - 1];
  if (latest - oldest >= 5) return "Subiendo";
  if (oldest - latest >= 5) return "Bajando";
  return "Estable";
}

function getTopicStatus(attempts: number, accuracy: number | null) {
  if (attempts === 0 || accuracy === null) return "Sin datos";
  if (attempts < 3) return "Muestra corta";
  if (accuracy < 70) return "Critico";
  if (accuracy < 85) return "En desarrollo";
  return "Solido";
}

function getCriterionStatus(attempts: number, accuracy: number | null) {
  if (attempts === 0 || accuracy === null) return "Sin datos";
  if (attempts < 3) return "Muestra corta";
  if (accuracy < 70) return "Critico";
  if (accuracy < 85) return "En desarrollo";
  return "Solido";
}

function getGeneralStatus(avg: number | null, attempts: number) {
  if (attempts === 0 || avg === null) return "Sin datos";
  if (attempts < 5) return "Inicial";
  if (avg < 70) return "En desarrollo";
  if (avg < 85) return "Solido";
  if (avg < 95) return "Avanzado";
  return "Elite";
}

function topMetric(metrics: TopicMetric[]) {
  return [...metrics]
    .filter((metric) => metric.attempts > 0 && metric.accuracy !== null)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
}

function bottomMetric(metrics: TopicMetric[]) {
  return [...metrics]
    .filter((metric) => metric.attempts > 0 && metric.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0];
}

function topCriterion(metrics: SportCriterionMetric[]) {
  return [...metrics]
    .filter((metric) => metric.attempts > 0 && metric.accuracy !== null)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
}

function bottomCriterion(metrics: SportCriterionMetric[]) {
  return [...metrics]
    .filter((metric) => metric.attempts > 0 && metric.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0];
}

function inferRecommendedModule(
  sportType: SportType,
  topic?: TopicMetric,
  criterion?: SportCriterionMetric
) {
  if (sportType === "football_11" && (criterion?.key === "var" || topic?.topic === "VAR")) {
    return "VAR Lab";
  }
  if (criterion || topic) return "Videoanalisis";
  return "Sin datos suficientes";
}

function moduleStatus(items: SportPerformanceItem[], key: ModuleKey) {
  const scoped = items.filter((item) => item.module === key);
  if (scoped.length === 0) return "Sin datos" as const;
  return "Disponible" as const;
}

function moduleAverage(items: SportPerformanceItem[], key: ModuleKey) {
  return average(
    items
      .filter((item) => item.module === key)
      .map((item) => item.score)
      .filter(isNumber)
  );
}

function metricFromItems(label: string, items: Array<{ score?: number | null }>) {
  return {
    label,
    value: String(items.length),
    detail: items.length > 0 ? "Registros reales disponibles." : "Sin datos",
    available: items.length > 0,
  } satisfies SportModuleMetric;
}

function metricFromAverage(label: string, value: number | null) {
  return {
    label,
    value: formatScore(value),
    detail: value === null ? "Sin datos" : "Promedio sobre actividad real.",
    available: value !== null,
  } satisfies SportModuleMetric;
}

function metricFromCriterion(label: string, criterion?: SportCriterionMetric) {
  return {
    label,
    value: formatPercent(criterion?.accuracy ?? null),
    detail:
      criterion && criterion.attempts > 0
        ? `${criterion.correct}/${criterion.attempts} aciertos registrados.`
        : "Sin datos",
    available: Boolean(criterion && criterion.attempts > 0),
  } satisfies SportModuleMetric;
}

function metricFromTopic(label: string, topic?: TopicMetric) {
  return {
    label,
    value: topic ? `${topic.topic} - ${formatPercent(topic.accuracy)}` : "Sin datos",
    detail:
      topic && topic.attempts > 0
        ? `${topic.attempts} intentos registrados.`
        : "Sin datos",
    available: Boolean(topic && topic.attempts > 0),
  } satisfies SportModuleMetric;
}

function getBestMetric(metrics: TopicMetric[]) {
  return [...metrics]
    .filter((metric) => metric.attempts > 0 && metric.accuracy !== null)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
}

export function formatScore(value: number | null | undefined) {
  return isNumber(value) ? `${value}/100` : "Sin datos";
}

export function formatPercent(value: number | null | undefined) {
  return isNumber(value) ? `${value}%` : "Sin datos";
}
