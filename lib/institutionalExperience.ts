export type InstitutionType = "school" | "league" | "association" | "federation";

export type InstitutionalClipStatus =
  | "uploaded"
  | "under_review"
  | "processing"
  | "approved"
  | "rejected"
  | "published";

export type InstitutionalModule = {
  title: string;
  description: string;
  status: "available" | "configured" | "coming_soon";
};

export type InstitutionalMetricGroup = {
  title: string;
  description: string;
  metrics: string[];
};

export type InstitutionalExperience = {
  type: InstitutionType;
  title: string;
  headline: string;
  description: string;
  tone: string;
  trainingLevel: string;
  plan: string;
  seatsTotal: number;
  seatsUsed: number;
  instructors: number;
  customVideoEnabled: boolean;
  publicClipSharingEnabled: boolean;
  modules: InstitutionalModule[];
  metrics: string[];
  metricGroups?: InstitutionalMetricGroup[];
  kpis: { label: string; value: string; detail: string }[];
  cohorts: { name: string; students: number; progress: number }[];
  students: {
    name: string;
    level: string;
    score: string;
    last: string;
    weak: string;
    status: string;
  }[];
  instructorFocus: string[];
};

export const activeInstitutionTypes: InstitutionType[] = [
  "school",
  "league",
  "association",
];

export const institutionTypeLabels: Record<InstitutionType, string> = {
  school: "Escuela arbitral",
  league: "Liga",
  association: "Asociacion",
  federation: "Federacion",
};

export const institutionTypeShortLabels: Record<InstitutionType, string> = {
  school: "Escuela",
  league: "Liga",
  association: "Asociacion",
  federation: "Federacion",
};

export const institutionalClipStatusLabels: Record<InstitutionalClipStatus, string> = {
  uploaded: "Subido",
  under_review: "Revision pendiente",
  processing: "Procesando",
  approved: "Aprobado",
  rejected: "Rechazado",
  published: "Publicado",
};

export const institutionalClipStatuses = Object.keys(
  institutionalClipStatusLabels
) as InstitutionalClipStatus[];

export const schoolVideoTopics = [
  "Fuera de juego",
  "Manos",
  "Disputas",
  "Faltas tacticas",
];

export const schoolExamFormats = [
  "Multiple choice",
  "Verdadero / falso",
  "Situaciones arbitrales con video",
];

export const schoolStudentMetricGroups: InstitutionalMetricGroup[] = [
  {
    title: "Progreso academico",
    description: "Lectura simple para alumnos que estan aprendiendo el reglamento.",
    metrics: [
      "Promedio general",
      "Cantidad de examenes",
      "Porcentaje de aprobacion",
      "Evolucion por bloque",
    ],
  },
  {
    title: "Practica con videos",
    description: "Seguimiento de clips formativos por topico oficial de escuela.",
    metrics: [
      "Videos completados",
      "Mejor topico",
      "Topico a mejorar",
      "Actividad reciente",
    ],
  },
];

export const associationRefereeMetrics: InstitutionalMetricGroup[] = [
  {
    title: "Arbitro",
    description: "Analisis tecnico para arbitros principales recibidos.",
    metrics: [
      "Fuera de juego",
      "Manos",
      "Disputas",
      "Faltas tacticas",
      "Decision tecnica",
      "Reanudacion",
      "Sancion disciplinaria",
      "VAR",
    ],
  },
];

export const associationAssistantMetrics: InstitutionalMetricGroup[] = [
  {
    title: "Arbitro asistente",
    description: "Lectura especifica para asistentes y colaboracion arbitral.",
    metrics: [
      "Fuera de juego",
      "Posicionamiento",
      "Colaboracion arbitral",
      "Reanudaciones",
      "Senalizacion",
      "Comunicacion",
    ],
  },
];

export const institutionalComparatives = [
  { label: "Regional", average: "82/100", ranking: "1", trend: "+6%" },
  { label: "Provincial", average: "78/100", ranking: "2", trend: "+3%" },
  { label: "Nacional", average: "86/100", ranking: "1", trend: "+5%" },
];

export const institutionalExperiences: Record<InstitutionType, InstitutionalExperience> = {
  school: {
    type: "school",
    title: "Escuela Arbitral Demo",
    headline: "Formacion inicial para alumnos que empiezan desde cero",
    description:
      "Pensada para estudiantes que todavia no son arbitros recibidos: reglamento, fundamentos, examenes, videos formativos y seguimiento academico.",
    tone: "Educativa, pedagogica y formativa",
    trainingLevel: "Inicial",
    plan: "Licencia Escuela Semestral",
    seatsTotal: 50,
    seatsUsed: 37,
    instructors: 3,
    customVideoEnabled: false,
    publicClipSharingEnabled: false,
    modules: [
      {
        title: "Reglas de Juego IFAB",
        description: "Biblioteca resumida por reglas, con conceptos, puntos clave y errores frecuentes.",
        status: "available",
      },
      {
        title: "Examenes",
        description: "Multiple choice y verdadero/falso para medir aprendizaje reglamentario.",
        status: "available",
      },
      {
        title: "Videos de entrenamiento",
        description: "Clips pedagogicos de fuera de juego, manos, disputas y faltas tacticas.",
        status: "available",
      },
      {
        title: "Estadisticas del alumno",
        description: "Promedio, examenes, aprobacion, evolucion, videos completados y actividad.",
        status: "configured",
      },
      {
        title: "Gestion academica",
        description: "Cohortes, alumnos, instructores, avances y seguimiento simple.",
        status: "configured",
      },
    ],
    metrics: [
      "Promedio general",
      "Cantidad de examenes",
      "Porcentaje de aprobacion",
      "Mejor topico",
      "Topico a mejorar",
      "Evolucion",
      "Videos completados",
      "Actividad reciente",
    ],
    metricGroups: schoolStudentMetricGroups,
    kpis: [
      { label: "Alumnos activos", value: "37", detail: "sobre 50 cupos" },
      { label: "Promedio general", value: "76/100", detail: "programa inicial" },
      { label: "Examenes", value: "92", detail: "multiple choice y V/F" },
      { label: "Aprobacion", value: "74%", detail: "cohorte inicial" },
      { label: "Mejor topico", value: "Manos", detail: "conceptos basicos" },
      { label: "A reforzar", value: "Fuera de juego", detail: "regla y senales" },
      { label: "Videos completados", value: "318", detail: "formativos" },
      { label: "Cupos usados", value: "37/50", detail: "13 disponibles" },
    ],
    cohorts: [
      { name: "Inicial 2026", students: 18, progress: 64 },
      { name: "Reglamento I", students: 12, progress: 58 },
      { name: "Senales y campo", students: 9, progress: 72 },
      { name: "Fuera de juego inicial", students: 8, progress: 43 },
    ],
    students: [
      {
        name: "Lucia Fernandez",
        level: "Inicial",
        score: "84",
        last: "Hoy",
        weak: "Fuera de juego",
        status: "Activo",
      },
      {
        name: "Martin Acosta",
        level: "Inicial",
        score: "79",
        last: "Ayer",
        weak: "Manos",
        status: "En aprendizaje",
      },
      {
        name: "Sofia Mendez",
        level: "Inicial",
        score: "76",
        last: "2 dias",
        weak: "Disputas",
        status: "Requiere seguimiento",
      },
      {
        name: "Tomas Herrera",
        level: "Inicial",
        score: "88",
        last: "Esta semana",
        weak: "Faltas tacticas",
        status: "Activo",
      },
    ],
    instructorFocus: [
      "Asignar bloque introductorio de fuera de juego.",
      "Tomar examen basico de Reglas 11 y 12.",
      "Revisar alumnos con menos de 60% de aprobacion.",
      "Usar videos formativos de manos, disputas y faltas tacticas.",
    ],
  },
  league: {
    type: "league",
    title: "Liga Regional Demo",
    headline: "Capacitacion continua para arbitros en actividad",
    description:
      "Combina formacion permanente, evaluaciones, videos, rendimiento y estadisticas para arbitros que ya dirigen en competencia local.",
    tone: "Operativa, regional y de seguimiento",
    trainingLevel: "Intermedio",
    plan: "Licencia Liga Anual",
    seatsTotal: 120,
    seatsUsed: 84,
    instructors: 5,
    customVideoEnabled: true,
    publicClipSharingEnabled: false,
    modules: [
      {
        title: "Examenes",
        description: "Evaluaciones periodicas para sostener actualizacion reglamentaria.",
        status: "available",
      },
      {
        title: "Videos",
        description: "Entrenamiento tecnico con jugadas de liga y biblioteca RefLab.",
        status: "available",
      },
      {
        title: "Rendimiento",
        description: "Lectura de progreso, topicos criticos y actividad por categoria.",
        status: "configured",
      },
      {
        title: "Estadisticas",
        description: "Promedios, ranking interno, actividad semanal y evolucion.",
        status: "configured",
      },
    ],
    metrics: [
      "Arbitros activos",
      "Rendimiento semanal",
      "Topicos criticos",
      "Evaluaciones por fecha",
      "Actividad por categoria",
    ],
    kpis: [
      { label: "Arbitros activos", value: "84", detail: "sobre 120 cupos" },
      { label: "Evaluaciones", value: "214", detail: "ultimos 30 dias" },
      { label: "Promedio general", value: "78/100", detail: "liga completa" },
      { label: "Topico debil", value: "Disputas", detail: "64% de precision" },
      { label: "Topico fuerte", value: "Manos", detail: "88% de precision" },
      { label: "Actividad semanal", value: "71%", detail: "arbitros activos" },
      { label: "Videos propios", value: "12", detail: "revision interna" },
      { label: "Licencias usadas", value: "84/120", detail: "36 disponibles" },
    ],
    cohorts: [
      { name: "Primera local", students: 22, progress: 76 },
      { name: "Reserva", students: 18, progress: 69 },
      { name: "Juveniles", students: 25, progress: 62 },
      { name: "Asistentes", students: 11, progress: 73 },
    ],
    students: [
      {
        name: "Valentina Perez",
        level: "Liga",
        score: "82",
        last: "Hoy",
        weak: "Disputas",
        status: "Activo",
      },
      {
        name: "Nicolas Silva",
        level: "Primera local",
        score: "86",
        last: "Ayer",
        weak: "Disciplina",
        status: "Seguimiento tecnico",
      },
      {
        name: "Agustin Rios",
        level: "Reserva",
        score: "74",
        last: "3 dias",
        weak: "Manos",
        status: "Requiere refuerzo",
      },
      {
        name: "Camila Duarte",
        level: "Asistente",
        score: "89",
        last: "Esta semana",
        weak: "Fuera de juego",
        status: "Activo",
      },
    ],
    instructorFocus: [
      "Asignar bloque de disputas a categorias competitivas.",
      "Revisar actividad semanal por grupo.",
      "Programar evaluacion mensual de criterios disciplinarios.",
      "Subir clips regionales para revision RefLab.",
    ],
  },
  association: {
    type: "association",
    title: "Asociacion Arbitral Demo",
    headline: "Entrenamiento tecnico avanzado para arbitros recibidos",
    description:
      "Para arbitros y asistentes ya formados: video analisis, clips propios, VAR Lab, toma de decisiones, actualizacion y evaluaciones tecnicas.",
    tone: "Tecnica, competitiva y avanzada",
    trainingLevel: "Avanzado",
    plan: "Licencia Asociacion Anual",
    seatsTotal: 200,
    seatsUsed: 148,
    instructors: 8,
    customVideoEnabled: true,
    publicClipSharingEnabled: true,
    modules: [
      {
        title: "Video analisis",
        description: "Lectura tecnica, criterios y discusion metodologica sobre jugadas.",
        status: "available",
      },
      {
        title: "Clips propios",
        description: "Carga de material real de la competencia, privado o compartible.",
        status: "available",
      },
      {
        title: "VAR Lab",
        description: "APP, OFR, factual vs interpretativo y protocolo VAR.",
        status: "available",
      },
      {
        title: "Toma de decisiones",
        description: "Decision tecnica, reanudacion y sancion disciplinaria.",
        status: "available",
      },
      {
        title: "Actualizacion arbitral",
        description: "Criterios, circulares, enfoque tecnico y cambios reglamentarios.",
        status: "configured",
      },
      {
        title: "Evaluaciones tecnicas",
        description: "Examenes y ejercicios por rol, categoria, grupo o promocion.",
        status: "configured",
      },
    ],
    metrics: [
      "Promedio general",
      "Evolucion",
      "Precision por topico",
      "Actividad reciente",
      "Comparativa por categoria",
      "Ranking por grupo",
    ],
    metricGroups: [...associationRefereeMetrics, ...associationAssistantMetrics],
    kpis: [
      { label: "Arbitros activos", value: "148", detail: "sobre 200 cupos" },
      { label: "Evaluaciones", value: "396", detail: "ultimo trimestre" },
      { label: "Promedio general", value: "84/100", detail: "plantel completo" },
      { label: "Topico debil", value: "VAR", detail: "protocolo y APP" },
      { label: "Topico fuerte", value: "Faltas tacticas", detail: "89% de precision" },
      { label: "Actividad semanal", value: "82%", detail: "arbitros activos" },
      { label: "Clips propios", value: "27", detail: "en revision y publicados" },
      { label: "Comparativas", value: "3", detail: "regional, provincial, nacional" },
    ],
    cohorts: [
      { name: "Plantel superior", students: 38, progress: 84 },
      { name: "Regional", students: 41, progress: 78 },
      { name: "VAR Lab", students: 24, progress: 71 },
      { name: "Asistentes avanzados", students: 18, progress: 82 },
    ],
    students: [
      {
        name: "Mauro Benitez",
        level: "Regional",
        score: "91",
        last: "Hoy",
        weak: "VAR",
        status: "Alto rendimiento",
      },
      {
        name: "Florencia Arias",
        level: "Superior",
        score: "88",
        last: "Ayer",
        weak: "Reanudacion",
        status: "Competitivo",
      },
      {
        name: "Joaquin Morales",
        level: "Regional",
        score: "79",
        last: "2 dias",
        weak: "Disputas",
        status: "Plan tecnico",
      },
      {
        name: "Rocio Medina",
        level: "Asistente",
        score: "93",
        last: "Esta semana",
        weak: "FDJ avanzado",
        status: "Elite regional",
      },
    ],
    instructorFocus: [
      "Revisar clips propios pendientes de aprobacion.",
      "Separar analisis entre arbitros y asistentes.",
      "Comparar precision por categoria y promocion.",
      "Asignar VAR Lab a plantel regional.",
    ],
  },
  federation: {
    type: "federation",
    title: "Federacion",
    headline: "Proximamente",
    description:
      "La experiencia federativa se definira mas adelante: observadores, instructores, estructura nacional y evaluaciones federativas.",
    tone: "Pendiente de definicion",
    trainingLevel: "Proximamente",
    plan: "Proximamente",
    seatsTotal: 0,
    seatsUsed: 0,
    instructors: 0,
    customVideoEnabled: false,
    publicClipSharingEnabled: false,
    modules: [
      {
        title: "Federaciones",
        description: "Modulo reservado para una etapa posterior.",
        status: "coming_soon",
      },
    ],
    metrics: ["Proximamente"],
    kpis: [
      { label: "Estado", value: "Proximamente", detail: "no desarrollado por ahora" },
    ],
    cohorts: [],
    students: [],
    instructorFocus: ["Definir diferencias con asociaciones antes de desarrollar."],
  },
};

export function getInstitutionalExperience(type: InstitutionType) {
  return institutionalExperiences[type] ?? institutionalExperiences.school;
}
