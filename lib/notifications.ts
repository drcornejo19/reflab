export type NotificationCategory =
  | "training"
  | "exams"
  | "evolution"
  | "matches"
  | "newContent";

export type SmartNotificationType =
  | "training_pending"
  | "new_clip_available"
  | "exam_available"
  | "weekly_progress"
  | "weakness_detected"
  | "training_streak"
  | "match_reminder"
  | "post_match_reminder"
  | "admin_broadcast";

export type NotificationPreferences = Record<NotificationCategory, boolean> & {
  pushEnabled: boolean;
};

export type SmartNotification = {
  type: SmartNotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  training: true,
  exams: true,
  evolution: true,
  matches: true,
  newContent: true,
  pushEnabled: false,
};

export const notificationPreferenceItems: {
  key: NotificationCategory;
  label: string;
  description: string;
}[] = [
  {
    key: "training",
    label: "Entrenamientos",
    description: "Recordatorios de continuidad y debilidades detectadas.",
  },
  {
    key: "exams",
    label: "Examenes",
    description: "Avisos cuando haya evaluaciones disponibles.",
  },
  {
    key: "evolution",
    label: "Evolucion",
    description: "Resumen semanal, rachas y progreso arbitral.",
  },
  {
    key: "matches",
    label: "Partidos",
    description: "Recordatorios pre y post partido desde Ref Performance.",
  },
  {
    key: "newContent",
    label: "Contenido nuevo",
    description: "Nuevos clips y situaciones arbitrales disponibles.",
  },
];

const notificationTemplates: Record<SmartNotificationType, SmartNotification> = {
  training_pending: {
    type: "training_pending",
    category: "training",
    title: "Entrenamiento pendiente",
    message:
      "Hace varios dias que no realizas actividades en RefLab. Mantene tu continuidad arbitral.",
    actionLabel: "Entrenar ahora",
    actionUrl: "/training",
  },
  new_clip_available: {
    type: "new_clip_available",
    category: "newContent",
    title: "Nueva situacion arbitral",
    message: "Hay nuevos clips disponibles para entrenar tu toma de decisiones.",
    actionLabel: "Ver clip",
    actionUrl: "/training",
  },
  exam_available: {
    type: "exam_available",
    category: "exams",
    title: "Nuevo examen habilitado",
    message:
      "Tenes una evaluacion disponible para poner a prueba tu criterio arbitral.",
    actionLabel: "Rendir examen",
    actionUrl: "/evaluations",
  },
  weekly_progress: {
    type: "weekly_progress",
    category: "evolution",
    title: "Resumen semanal",
    message: "Tu rendimiento mejoro un 8% respecto a la semana pasada.",
    actionLabel: "Ver evolucion",
    actionUrl: "/stats",
  },
  weakness_detected: {
    type: "weakness_detected",
    category: "training",
    title: "Oportunidad de mejora",
    message:
      "Tus resultados muestran dificultades en Faltas Tacticas. Te recomendamos entrenar este topico.",
    actionLabel: "Entrenar ahora",
    actionUrl: "/training",
  },
  training_streak: {
    type: "training_streak",
    category: "evolution",
    title: "Segui asi",
    message: "Llevas 7 dias consecutivos entrenando en RefLab.",
    actionLabel: "Continuar",
    actionUrl: "/dashboard",
  },
  match_reminder: {
    type: "match_reminder",
    category: "matches",
    title: "Partido programado",
    message: "Registra tu preparacion y estado fisico antes del encuentro.",
    actionLabel: "Abrir Ref Performance",
    actionUrl: "/performance",
  },
  post_match_reminder: {
    type: "post_match_reminder",
    category: "matches",
    title: "Analiza tu rendimiento",
    message:
      "Registra como te sentiste despues del partido y mantene actualizado tu historial.",
    actionLabel: "Completar registro",
    actionUrl: "/performance",
  },
  admin_broadcast: {
    type: "admin_broadcast",
    category: "newContent",
    title: "Aviso RefLab",
    message: "Hay una novedad importante disponible en RefLab.",
    actionLabel: "Abrir RefLab",
    actionUrl: "/dashboard",
  },
};

export function getSmartNotification(
  type: SmartNotificationType,
  overrides: Partial<Pick<SmartNotification, "message" | "actionUrl">> = {}
) {
  return {
    ...notificationTemplates[type],
    ...overrides,
  };
}

export function getNotificationExamples() {
  return Object.values(notificationTemplates);
}

export function isSmartNotificationType(value: unknown): value is SmartNotificationType {
  return typeof value === "string" && value in notificationTemplates;
}

export function normalizeNotificationPreferences(
  value?: Partial<Record<NotificationCategory | "pushEnabled", unknown>> | null
): NotificationPreferences {
  return {
    training: toBoolean(value?.training, defaultNotificationPreferences.training),
    exams: toBoolean(value?.exams, defaultNotificationPreferences.exams),
    evolution: toBoolean(value?.evolution, defaultNotificationPreferences.evolution),
    matches: toBoolean(value?.matches, defaultNotificationPreferences.matches),
    newContent: toBoolean(value?.newContent, defaultNotificationPreferences.newContent),
    pushEnabled: toBoolean(value?.pushEnabled, defaultNotificationPreferences.pushEnabled),
  };
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
