export const psychologyModuleSlugs = [
  "gestion-error",
  "presion-competitiva",
  "concentracion-foco",
  "confianza-arbitral",
  "resiliencia",
  "preparacion-mental-pre-partido",
  "evaluacion-post-partido",
  "sin-clasificar",
] as const;

export type PsychologyModuleSlug = (typeof psychologyModuleSlugs)[number];

export type PsychologyInteractionMode =
  | "guided_reflection"
  | "written_question"
  | "scale_1_10"
  | "practical_scenario"
  | "self_assessment"
  | "checklist"
  | "pre_post_match_register";

export type PsychologyModuleDefinition = {
  slug: PsychologyModuleSlug;
  title: string;
  description: string;
  introduction: string;
  status: "available" | "building";
  interactionModes: PsychologyInteractionMode[];
  exerciseTitles: string[];
  guidedReflection: string;
};

export type PsychologyCheckinRecord = {
  id: string;
  user_id?: string;
  module_slug?: string | null;
  checkin_type?: string | null;
  match_context?: string | null;
  pressure_source?: string | null;
  focus_goal?: string | null;
  reset_cue?: string | null;
  incident_summary?: string | null;
  learning?: string | null;
  next_action?: string | null;
  mental_score?: number | null;
  confidence_score?: number | null;
  pressure_score?: number | null;
  concentration_score?: number | null;
  emotional_control_score?: number | null;
  mental_fatigue_score?: number | null;
  error_impact_score?: number | null;
  recovery_score?: number | null;
  process_orientation_score?: number | null;
  responses?: {
    notes?: string | null;
  } | null;
  feedback?: {
    summary?: string | null;
    focus?: string | null;
    action?: string | null;
    risk?: string | null;
  } | null;
  created_at: string;
};

export type PsychologyWellbeingRecord = {
  id: string;
  user_id?: string;
  module_slug?: string | null;
  week_context?: string | null;
  emotional_exhaustion_score?: number | null;
  cynicism_score?: number | null;
  motivation_score?: number | null;
  sleep_disruption_score?: number | null;
  concentration_difficulty_score?: number | null;
  external_pressure_score?: number | null;
  institutional_support_score?: number | null;
  violence_exposure_score?: number | null;
  recovery_quality_score?: number | null;
  workload_score?: number | null;
  burnout_risk_score?: number | null;
  burnout_risk_level?: string | null;
  stressors?: string[] | null;
  protective_factors?: string[] | null;
  notes?: string | null;
  feedback?: {
    summary?: string | null;
    priority?: string | null;
    action?: string | null;
    protection?: string | null;
    note?: string | null;
  } | null;
  created_at: string;
};

export type PsychologyExerciseRecord = {
  id: string;
  user_id?: string;
  module_slug?: string | null;
  exercise_type?: string | null;
  scenario_title?: string | null;
  pressure_level?: number | null;
  before_score?: number | null;
  after_score?: number | null;
  clarity_score?: number | null;
  response_strategy?: string | null;
  internal_dialogue_before?: string | null;
  internal_dialogue_after?: string | null;
  communication_phrase?: string | null;
  action_plan?: string | null;
  notes?: string | null;
  feedback?: {
    summary?: string | null;
    learning?: string | null;
    nextCue?: string | null;
    application?: string | null;
  } | null;
  created_at: string;
};

export type PsychologyUnifiedRecord = {
  id: string;
  userId: string | null;
  source: "checkin" | "wellbeing" | "exercise";
  sourceLabel: string;
  subtypeLabel: string;
  moduleSlug: PsychologyModuleSlug;
  moduleTitle: string;
  classificationStatus: "Clasificado" | "Inferido" | "Sin clasificar";
  title: string;
  summary: string;
  detail: string | null;
  createdAt: string;
  progressState: "Completado";
  interactionModes: PsychologyInteractionMode[];
  metrics: {
    emotion: number | null;
    confidence: number | null;
    focus: number | null;
    score: number | null;
  };
};

export type PsychologyModuleOverview = PsychologyModuleDefinition & {
  statusLabel: "Disponible" | "En construccion";
  recordCount: number;
  progressLabel: string;
  lastActivityAt: string | null;
  lastSummary: string | null;
};

export type PsychologyWeeklyMetric = {
  weekStart: string;
  completedRecords: number;
  emotionalAverage: number | null;
  confidenceAverage: number | null;
  focusAverage: number | null;
};

export type PsychologyFutureMetrics = {
  completedRecords: number;
  workedModules: number;
  emotionalAverage: number | null;
  confidenceAverage: number | null;
  focusAverage: number | null;
  weeklyEvolution: PsychologyWeeklyMetric[];
};

export type PsychologyInterfaceData = {
  modules: PsychologyModuleOverview[];
  records: PsychologyUnifiedRecord[];
  futureMetrics: PsychologyFutureMetrics;
};

type ModuleResolution = {
  moduleSlug: PsychologyModuleSlug;
  classificationStatus: PsychologyUnifiedRecord["classificationStatus"];
};

export const psychologyInteractionLabels: Record<PsychologyInteractionMode, string> = {
  guided_reflection: "Reflexion guiada",
  written_question: "Pregunta escrita",
  scale_1_10: "Escala 1 a 10",
  practical_scenario: "Situacion practica",
  self_assessment: "Autodiagnostico",
  checklist: "Checklist",
  pre_post_match_register: "Registro antes/despues del partido",
};

export const psychologyModuleDefinitions: PsychologyModuleDefinition[] = [
  {
    slug: "gestion-error",
    title: "Gestion del error",
    description: "Errores, recuperacion mental y vuelta al foco.",
    introduction:
      "Ordena lo que paso, identifica factores modificables y convierte una decision dificil en una accion concreta para el proximo partido.",
    status: "available",
    interactionModes: [
      "guided_reflection",
      "written_question",
      "scale_1_10",
      "checklist",
      "self_assessment",
    ],
    exerciseTitles: [
      "Reset despues de una protesta",
      "Aprendizaje despues de una decision dificil",
    ],
    guidedReflection:
      "Que paso, que senti y que accion concreta me ayuda a no arrastrar el error a la siguiente decision?",
  },
  {
    slug: "presion-competitiva",
    title: "Presion competitiva",
    description: "Publico, protestas, evaluaciones y contexto exigente.",
    introduction:
      "Entrena respuestas utiles cuando el partido, el entorno o la evaluacion intentan mover tu criterio.",
    status: "available",
    interactionModes: [
      "practical_scenario",
      "guided_reflection",
      "scale_1_10",
      "written_question",
      "self_assessment",
    ],
    exerciseTitles: [
      "Banco tecnico presiona una sancion",
      "Final cerrado con ambiente alto",
    ],
    guidedReflection:
      "Que presion externa aparece y como la convierto en una consigna corta para sostener criterio y calma?",
  },
  {
    slug: "concentracion-foco",
    title: "Concentracion y foco",
    description: "Atencion, lectura del juego y control de distracciones.",
    introduction:
      "Recupera la siguiente decision con una rutina breve y visible: respirar, mirar zona activa y volver al proceso.",
    status: "available",
    interactionModes: [
      "practical_scenario",
      "guided_reflection",
      "scale_1_10",
      "written_question",
      "checklist",
    ],
    exerciseTitles: [
      "Protesta fuerte despues de una decision",
      "Error percibido durante el partido",
    ],
    guidedReflection:
      "Que me saca del presente y cual es mi secuencia minima para volver a leer el juego con claridad?",
  },
  {
    slug: "confianza-arbitral",
    title: "Confianza arbitral",
    description: "Autoconfianza, presencia y autoridad.",
    introduction:
      "Trabaja tu dialogo interno para que la seguridad arbitral salga de una consigna operativa y no de la impulsividad.",
    status: "available",
    interactionModes: [
      "practical_scenario",
      "guided_reflection",
      "written_question",
      "scale_1_10",
      "self_assessment",
    ],
    exerciseTitles: [
      "Miedo a equivocarte en una jugada grande",
      "Critica externa despues del partido anterior",
    ],
    guidedReflection:
      "Que frase me ordena cuando aparece la duda y como la sostengo con presencia antes de la siguiente decision?",
  },
  {
    slug: "resiliencia",
    title: "Resiliencia",
    description: "Continuidad, frustracion y vuelta a competir.",
    introduction:
      "Mide desgaste, apoyo y recuperacion para sostener continuidad sin normalizar cansancio, violencia o autocritica excesiva.",
    status: "available",
    interactionModes: [
      "guided_reflection",
      "scale_1_10",
      "self_assessment",
      "checklist",
      "written_question",
    ],
    exerciseTitles: [
      "Lectura semanal de desgaste",
      "Factores protectores antes de volver a competir",
    ],
    guidedReflection:
      "Que me desgasta hoy, que me protege y que necesito ajustar para seguir compitiendo con claridad?",
  },
  {
    slug: "preparacion-mental-pre-partido",
    title: "Preparacion mental pre partido",
    description: "Rutina previa, visualizacion y activacion mental.",
    introduction:
      "Define foco, activacion y frase operativa antes de competir para llegar con una consigna clara al inicio del partido.",
    status: "available",
    interactionModes: [
      "pre_post_match_register",
      "guided_reflection",
      "scale_1_10",
      "written_question",
      "checklist",
    ],
    exerciseTitles: [
      "Charla arbitral con foco en equipo",
      "Partido con antecedentes de conflicto",
    ],
    guidedReflection:
      "Que necesito sentir, ver y repetir antes del inicio para entrar al partido con foco y presencia?",
  },
  {
    slug: "evaluacion-post-partido",
    title: "Evaluacion post partido",
    description: "Reflexion posterior, aprendizaje y cierre emocional.",
    introduction:
      "Cierra el partido con una lectura simple: que hice bien, que debo ajustar y cual es la accion puntual que sigue.",
    status: "available",
    interactionModes: [
      "pre_post_match_register",
      "guided_reflection",
      "written_question",
      "scale_1_10",
      "self_assessment",
    ],
    exerciseTitles: [
      "Lectura post partido",
      "Registro emocional y accion siguiente",
    ],
    guidedReflection:
      "Que mantengo, que corrijo y que me conviene soltar para que el cierre del partido sea aprendizaje y no arrastre?",
  },
  {
    slug: "sin-clasificar",
    title: "Sin clasificar",
    description: "Registros pendientes de metadata o revision admin.",
    introduction:
      "Estos registros siguen visibles, pero necesitan una categoria definitiva para entrar al modulito correcto.",
    status: "building",
    interactionModes: ["guided_reflection"],
    exerciseTitles: ["Revision admin o metadata"],
    guidedReflection:
      "Asigna una categoria desde Admin o metadata para que este registro entre en el flujo correcto.",
  },
];

const moduleKeywordMap: Record<PsychologyModuleSlug, string[]> = {
  "gestion-error": [
    "error",
    "decision dificil",
    "recuperacion",
    "reset",
    "culpa",
    "volver al foco",
    "siguiente decision",
  ],
  "presion-competitiva": [
    "presion",
    "publico",
    "protesta",
    "banco",
    "evaluacion",
    "externa",
    "resultado",
    "ambiente",
  ],
  "concentracion-foco": [
    "foco",
    "concentr",
    "atencion",
    "distraccion",
    "lectura del juego",
    "presente",
    "claridad",
  ],
  "confianza-arbitral": [
    "confianza",
    "autoconfianza",
    "seguridad",
    "presencia",
    "autoridad",
    "dialogo interno",
    "duda",
  ],
  resiliencia: [
    "resiliencia",
    "continuidad",
    "frustracion",
    "desgaste",
    "burnout",
    "volver a competir",
    "proteccion",
  ],
  "preparacion-mental-pre-partido": [
    "pre partido",
    "rutina",
    "activacion",
    "visualizacion",
    "objetivo del partido",
    "charla arbitral",
  ],
  "evaluacion-post-partido": [
    "post partido",
    "cierre",
    "aprendizaje",
    "que hice bien",
    "mejorar",
    "reflexion",
  ],
  "sin-clasificar": [],
};

const checkinTypeToModule: Record<string, PsychologyModuleSlug> = {
  pre_match: "preparacion-mental-pre-partido",
  post_match: "evaluacion-post-partido",
  error_recovery: "gestion-error",
};

const exerciseTypeToModule: Record<string, PsychologyModuleSlug> = {
  focus_reset: "concentracion-foco",
  pressure_scenario: "presion-competitiva",
  self_talk: "confianza-arbitral",
  team_prebrief: "preparacion-mental-pre-partido",
};

const checkinTypeLabels: Record<string, string> = {
  pre_match: "Registro pre partido",
  post_match: "Registro post partido",
  error_recovery: "Gestion del error",
};

const exerciseTypeLabels: Record<string, string> = {
  focus_reset: "Reset de foco",
  pressure_scenario: "Escenario de presion",
  self_talk: "Dialogo interno",
  team_prebrief: "Charla arbitral",
};

export function isPsychologyModuleSlug(value: unknown): value is PsychologyModuleSlug {
  return psychologyModuleSlugs.includes(value as PsychologyModuleSlug);
}

export function normalizePsychologyModuleSlug(value: unknown): PsychologyModuleSlug | null {
  if (typeof value !== "string") return null;
  return isPsychologyModuleSlug(value) ? value : null;
}

export function getPsychologyModuleDefinition(slug: PsychologyModuleSlug) {
  return (
    psychologyModuleDefinitions.find((moduleDefinition) => moduleDefinition.slug === slug) ??
    psychologyModuleDefinitions[0]
  );
}

export function buildPsychologyInterfaceData(input: {
  checkins: PsychologyCheckinRecord[];
  wellbeingAssessments: PsychologyWellbeingRecord[];
  exerciseSessions: PsychologyExerciseRecord[];
}): PsychologyInterfaceData {
  const records = [
    ...input.checkins.map(normalizeCheckinRecord),
    ...input.wellbeingAssessments.map(normalizeWellbeingRecord),
    ...input.exerciseSessions.map(normalizeExerciseRecord),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const countByModule = new Map<PsychologyModuleSlug, number>();
  const latestByModule = new Map<PsychologyModuleSlug, PsychologyUnifiedRecord>();

  for (const record of records) {
    countByModule.set(record.moduleSlug, (countByModule.get(record.moduleSlug) ?? 0) + 1);
    if (!latestByModule.has(record.moduleSlug)) {
      latestByModule.set(record.moduleSlug, record);
    }
  }

  const modules = psychologyModuleDefinitions
    .filter((moduleDefinition) => {
      if (moduleDefinition.slug !== "sin-clasificar") return true;
      return (countByModule.get("sin-clasificar") ?? 0) > 0;
    })
    .map((moduleDefinition) => {
      const latest = latestByModule.get(moduleDefinition.slug) ?? null;
      const recordCount = countByModule.get(moduleDefinition.slug) ?? 0;

      return {
        ...moduleDefinition,
        statusLabel:
          moduleDefinition.status === "available"
            ? ("Disponible" as const)
            : ("En construccion" as const),
        recordCount,
        progressLabel: buildProgressLabel(recordCount),
        lastActivityAt: latest?.createdAt ?? null,
        lastSummary: latest?.summary ?? null,
      };
    });

  return {
    modules,
    records,
    futureMetrics: buildFutureMetrics(records),
  };
}

function normalizeCheckinRecord(record: PsychologyCheckinRecord): PsychologyUnifiedRecord {
  const resolution = resolveCheckinModule(record);
  const moduleDefinition = getPsychologyModuleDefinition(resolution.moduleSlug);
  const detail =
    firstText(record.feedback?.action, record.feedback?.risk, record.feedback?.summary) ?? null;
  const summary =
    firstText(
      record.feedback?.focus,
      record.learning,
      record.next_action,
      record.incident_summary,
      record.match_context
    ) ?? "Registro psicologico guardado.";

  return {
    id: record.id,
    userId: cleanText(record.user_id),
    source: "checkin",
    sourceLabel: "Registro",
    subtypeLabel: checkinTypeLabels[record.checkin_type ?? ""] ?? "Check-in",
    moduleSlug: resolution.moduleSlug,
    moduleTitle: moduleDefinition.title,
    classificationStatus: resolution.classificationStatus,
    title: checkinTypeLabels[record.checkin_type ?? ""] ?? "Check-in psicologico",
    summary,
    detail,
    createdAt: record.created_at,
    progressState: "Completado",
    interactionModes: buildCheckinInteractionModes(record.checkin_type),
    metrics: {
      emotion: normalizeScale(record.emotional_control_score),
      confidence: normalizeScale(record.confidence_score),
      focus: normalizeScale(record.concentration_score),
      score: normalizeScore(record.mental_score),
    },
  };
}

function normalizeWellbeingRecord(record: PsychologyWellbeingRecord): PsychologyUnifiedRecord {
  const resolution = resolveWellbeingModule(record);
  const moduleDefinition = getPsychologyModuleDefinition(resolution.moduleSlug);
  const detail =
    firstText(record.feedback?.action, record.feedback?.protection, record.feedback?.note) ?? null;
  const summary =
    firstText(
      record.feedback?.priority,
      record.feedback?.summary,
      record.week_context,
      listToSentence(record.stressors)
    ) ?? "Lectura semanal de bienestar guardada.";

  return {
    id: record.id,
    userId: cleanText(record.user_id),
    source: "wellbeing",
    sourceLabel: "Bienestar",
    subtypeLabel: "Chequeo semanal",
    moduleSlug: resolution.moduleSlug,
    moduleTitle: moduleDefinition.title,
    classificationStatus: resolution.classificationStatus,
    title: "Chequeo de resiliencia",
    summary,
    detail,
    createdAt: record.created_at,
    progressState: "Completado",
    interactionModes: [
      "guided_reflection",
      "scale_1_10",
      "self_assessment",
      "checklist",
      "written_question",
    ],
    metrics: {
      emotion: buildWellbeingEmotionScore(record),
      confidence: null,
      focus: buildWellbeingFocusScore(record),
      score: normalizeScore(record.burnout_risk_score),
    },
  };
}

function normalizeExerciseRecord(record: PsychologyExerciseRecord): PsychologyUnifiedRecord {
  const resolution = resolveExerciseModule(record);
  const moduleDefinition = getPsychologyModuleDefinition(resolution.moduleSlug);
  const detail =
    firstText(record.feedback?.nextCue, record.feedback?.application, record.action_plan) ?? null;
  const summary =
    firstText(
      record.scenario_title,
      record.feedback?.learning,
      record.response_strategy,
      record.communication_phrase
    ) ?? "Ejercicio psicologico guardado.";

  return {
    id: record.id,
    userId: cleanText(record.user_id),
    source: "exercise",
    sourceLabel: "Ejercicio",
    subtypeLabel: exerciseTypeLabels[record.exercise_type ?? ""] ?? "Situacion guiada",
    moduleSlug: resolution.moduleSlug,
    moduleTitle: moduleDefinition.title,
    classificationStatus: resolution.classificationStatus,
    title: exerciseTypeLabels[record.exercise_type ?? ""] ?? "Ejercicio psicologico",
    summary,
    detail,
    createdAt: record.created_at,
    progressState: "Completado",
    interactionModes: ["practical_scenario", "guided_reflection", "written_question", "scale_1_10"],
    metrics: {
      emotion: buildExerciseEmotionScore(record, resolution.moduleSlug),
      confidence: buildExerciseConfidenceScore(record, resolution.moduleSlug),
      focus: buildExerciseFocusScore(record, resolution.moduleSlug),
      score: buildExerciseScore(record),
    },
  };
}

function resolveCheckinModule(record: PsychologyCheckinRecord): ModuleResolution {
  const explicit = normalizePsychologyModuleSlug(record.module_slug);
  if (explicit) {
    return {
      moduleSlug: explicit,
      classificationStatus: explicit === "sin-clasificar" ? "Sin clasificar" : ("Clasificado" as const),
    };
  }

  const keywordMatch = matchModuleFromText([
    record.match_context,
    record.pressure_source,
    record.focus_goal,
    record.reset_cue,
    record.incident_summary,
    record.learning,
    record.next_action,
    record.responses?.notes,
    record.feedback?.focus,
    record.feedback?.action,
    record.feedback?.risk,
  ]);

  if (keywordMatch) {
    return {
      moduleSlug: keywordMatch,
      classificationStatus: "Inferido" as const,
    };
  }

  if ((record.pressure_score ?? 0) >= 8) {
    return {
      moduleSlug: "presion-competitiva" as const,
      classificationStatus: "Inferido" as const,
    };
  }

  if ((record.concentration_score ?? 0) >= 8) {
    return {
      moduleSlug: "concentracion-foco" as const,
      classificationStatus: "Inferido" as const,
    };
  }

  if ((record.confidence_score ?? 0) >= 8 && (record.pressure_score ?? 10) <= 6) {
    return {
      moduleSlug: "confianza-arbitral" as const,
      classificationStatus: "Inferido" as const,
    };
  }

  const fallback = checkinTypeToModule[record.checkin_type ?? ""];
  if (fallback) {
    return {
      moduleSlug: fallback,
      classificationStatus: "Inferido" as const,
    };
  }

  return {
    moduleSlug: "sin-clasificar" as const,
    classificationStatus: "Sin clasificar" as const,
  };
}

function resolveWellbeingModule(record: PsychologyWellbeingRecord): ModuleResolution {
  const explicit = normalizePsychologyModuleSlug(record.module_slug);
  if (explicit) {
    return {
      moduleSlug: explicit,
      classificationStatus: explicit === "sin-clasificar" ? "Sin clasificar" : ("Clasificado" as const),
    };
  }

  const keywordMatch = matchModuleFromText([
    record.week_context,
    listToSentence(record.stressors),
    listToSentence(record.protective_factors),
    record.notes,
    record.feedback?.summary,
    record.feedback?.priority,
    record.feedback?.action,
  ]);

  if (keywordMatch) {
    return {
      moduleSlug: keywordMatch,
      classificationStatus: "Inferido" as const,
    };
  }

  if ((record.external_pressure_score ?? 0) >= 8) {
    return {
      moduleSlug: "presion-competitiva" as const,
      classificationStatus: "Inferido" as const,
    };
  }

  if (
    (record.burnout_risk_score ?? 0) >= 45 ||
    (record.recovery_quality_score ?? 10) <= 4 ||
    (record.motivation_score ?? 10) <= 4 ||
    (record.emotional_exhaustion_score ?? 0) >= 6
  ) {
    return {
      moduleSlug: "resiliencia" as const,
      classificationStatus: "Inferido" as const,
    };
  }

  return {
    moduleSlug: "sin-clasificar" as const,
    classificationStatus: "Sin clasificar" as const,
  };
}

function resolveExerciseModule(record: PsychologyExerciseRecord): ModuleResolution {
  const explicit = normalizePsychologyModuleSlug(record.module_slug);
  if (explicit) {
    return {
      moduleSlug: explicit,
      classificationStatus: explicit === "sin-clasificar" ? "Sin clasificar" : ("Clasificado" as const),
    };
  }

  const keywordMatch = matchModuleFromText([
    record.scenario_title,
    record.response_strategy,
    record.internal_dialogue_before,
    record.internal_dialogue_after,
    record.communication_phrase,
    record.action_plan,
    record.notes,
    record.feedback?.summary,
    record.feedback?.learning,
    record.feedback?.application,
  ]);

  if (keywordMatch) {
    return {
      moduleSlug: keywordMatch,
      classificationStatus: "Inferido" as const,
    };
  }

  const fallback = exerciseTypeToModule[record.exercise_type ?? ""];
  if (fallback) {
    return {
      moduleSlug: fallback,
      classificationStatus: "Inferido" as const,
    };
  }

  return {
    moduleSlug: "sin-clasificar" as const,
    classificationStatus: "Sin clasificar" as const,
  };
}

function buildFutureMetrics(records: PsychologyUnifiedRecord[]): PsychologyFutureMetrics {
  const moduleSet = new Set(
    records
      .map((record) => record.moduleSlug)
      .filter((moduleSlug) => moduleSlug !== "sin-clasificar")
  );

  const groupedByWeek = new Map<string, PsychologyUnifiedRecord[]>();
  for (const record of records) {
    const weekStart = toWeekStart(record.createdAt);
    if (!groupedByWeek.has(weekStart)) {
      groupedByWeek.set(weekStart, []);
    }
    groupedByWeek.get(weekStart)?.push(record);
  }

  const weeklyEvolution = [...groupedByWeek.entries()]
    .sort((left, right) => new Date(right[0]).getTime() - new Date(left[0]).getTime())
    .slice(0, 8)
    .map(([weekStart, weekRecords]) => ({
      weekStart,
      completedRecords: weekRecords.length,
      emotionalAverage: averageOf(weekRecords.map((record) => record.metrics.emotion)),
      confidenceAverage: averageOf(weekRecords.map((record) => record.metrics.confidence)),
      focusAverage: averageOf(weekRecords.map((record) => record.metrics.focus)),
    }));

  return {
    completedRecords: records.length,
    workedModules: moduleSet.size,
    emotionalAverage: averageOf(records.map((record) => record.metrics.emotion)),
    confidenceAverage: averageOf(records.map((record) => record.metrics.confidence)),
    focusAverage: averageOf(records.map((record) => record.metrics.focus)),
    weeklyEvolution,
  };
}

function buildCheckinInteractionModes(checkinType?: string | null): PsychologyInteractionMode[] {
  if (checkinType === "pre_match" || checkinType === "post_match") {
    return [
      "pre_post_match_register",
      "guided_reflection",
      "written_question",
      "scale_1_10",
      "self_assessment",
    ];
  }

  if (checkinType === "error_recovery") {
    return [
      "guided_reflection",
      "written_question",
      "scale_1_10",
      "checklist",
      "self_assessment",
    ];
  }

  return ["guided_reflection", "written_question", "scale_1_10"];
}

function buildExerciseScore(record: PsychologyExerciseRecord) {
  const values = [record.after_score, record.clarity_score].filter(isNumber);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildExerciseEmotionScore(
  record: PsychologyExerciseRecord,
  moduleSlug: PsychologyModuleSlug
) {
  if (moduleSlug === "presion-competitiva" || moduleSlug === "gestion-error") {
    return normalizeScale(record.after_score);
  }
  return null;
}

function buildExerciseConfidenceScore(
  record: PsychologyExerciseRecord,
  moduleSlug: PsychologyModuleSlug
) {
  if (moduleSlug === "confianza-arbitral" || moduleSlug === "preparacion-mental-pre-partido") {
    return normalizeScale(record.after_score);
  }
  return null;
}

function buildExerciseFocusScore(
  record: PsychologyExerciseRecord,
  moduleSlug: PsychologyModuleSlug
) {
  if (
    moduleSlug === "concentracion-foco" ||
    moduleSlug === "presion-competitiva" ||
    moduleSlug === "preparacion-mental-pre-partido"
  ) {
    return normalizeScale(record.clarity_score ?? record.after_score ?? null);
  }
  return null;
}

function buildWellbeingEmotionScore(record: PsychologyWellbeingRecord) {
  const values = [
    invertScale(record.emotional_exhaustion_score),
    normalizeScale(record.motivation_score),
    normalizeScale(record.recovery_quality_score),
  ].filter(isNumber);

  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildWellbeingFocusScore(record: PsychologyWellbeingRecord) {
  const values = [
    invertScale(record.concentration_difficulty_score),
    normalizeScale(record.recovery_quality_score),
  ].filter(isNumber);

  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildProgressLabel(recordCount: number) {
  if (recordCount === 0) return "Sin iniciar";
  if (recordCount === 1) return "Primer paso";
  if (recordCount <= 4) return "En trabajo";
  return "Con continuidad";
}

function matchModuleFromText(values: Array<string | null | undefined>) {
  const haystack = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) return null;

  for (const moduleDefinition of psychologyModuleDefinitions) {
    if (moduleDefinition.slug === "sin-clasificar") continue;
    const keywords = moduleKeywordMap[moduleDefinition.slug];
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return moduleDefinition.slug;
    }
  }

  return null;
}

function listToSentence(values?: string[] | null) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.filter(Boolean).join(", ");
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }

  return null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeScale(value: number | null | undefined) {
  if (!isNumber(value)) return null;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function normalizeScore(value: number | null | undefined) {
  if (!isNumber(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function invertScale(value: number | null | undefined) {
  if (!isNumber(value)) return null;
  return Math.max(1, Math.min(10, 11 - Math.round(value)));
}

function averageOf(values: Array<number | null | undefined>) {
  const numbers = values.filter(isNumber);
  if (!numbers.length) return null;
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toWeekStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
