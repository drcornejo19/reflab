export type InstitutionType = "school" | "league" | "association" | "federation";

export type InstitutionalClipStatus =
  | "uploaded"
  | "under_review"
  | "processing"
  | "approved"
  | "rejected"
  | "published";

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
  modules: string[];
  metrics: string[];
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

export const institutionalExperiences: Record<InstitutionType, InstitutionalExperience> = {
  school: {
    type: "school",
    title: "Escuela Arbitral Demo",
    headline: "Formacion inicial guiada desde cero",
    description:
      "Pensada para alumnos que empiezan: reglamento, fundamentos, senales, posicionamiento y criterios basicos.",
    tone: "Educativa, pedagogica y formativa",
    trainingLevel: "introductory",
    plan: "Licencia Escuela Semestral",
    seatsTotal: 50,
    seatsUsed: 37,
    instructors: 3,
    customVideoEnabled: false,
    publicClipSharingEnabled: false,
    modules: [
      "Reglamento IFAB basico",
      "Resumenes simples",
      "Fundamentos arbitrales",
      "Posicionamiento basico",
      "Senales arbitrales",
      "Introduccion al fuera de juego",
      "Mano y faltas simples",
      "Comunicacion y etica",
      "Examenes basicos",
      "Aprendizaje guiado",
    ],
    metrics: [
      "Progreso por tema",
      "Examenes basicos",
      "Asistencia por cohorte",
      "Temas pendientes",
      "Seguimiento de alumnos nuevos",
    ],
    kpis: [
      { label: "Alumnos activos", value: "37", detail: "sobre 50 cupos" },
      { label: "Progreso promedio", value: "64%", detail: "programa inicial" },
      { label: "Evaluaciones basicas", value: "92", detail: "realizadas este ciclo" },
      { label: "Tema a reforzar", value: "Fuera de juego", detail: "introduccion y senales" },
      { label: "Tema fuerte", value: "Manos", detail: "conceptos basicos" },
      { label: "Actividad semanal", value: "76%", detail: "alumnos activos" },
      { label: "Etica arbitral", value: "82%", detail: "bloque formativo" },
      { label: "Cupos usados", value: "37/50", detail: "13 disponibles" },
    ],
    cohorts: [
      { name: "Inicial 2026", students: 18, progress: 64 },
      { name: "Reglamento I", students: 12, progress: 58 },
      { name: "Senales y campo", students: 9, progress: 72 },
      { name: "Fuera de juego inicial", students: 8, progress: 43 },
      { name: "Preparacion arbitral inicial", students: 21, progress: 69 },
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
        weak: "Reanudaciones",
        status: "En aprendizaje",
      },
      {
        name: "Sofia Mendez",
        level: "Inicial",
        score: "76",
        last: "2 dias",
        weak: "Senales",
        status: "Requiere seguimiento",
      },
      {
        name: "Tomas Herrera",
        level: "Inicial",
        score: "88",
        last: "Esta semana",
        weak: "Faltas simples",
        status: "Activo",
      },
    ],
    instructorFocus: [
      "Asignar bloque introductorio de fuera de juego.",
      "Revisar alumnos con menos de 50% de avance semanal.",
      "Programar examen basico de Regla 12.",
      "Enviar material de senales y mecanica arbitral.",
    ],
  },
  league: {
    type: "league",
    title: "Liga Regional Demo",
    headline: "Capacitacion continua para arbitros activos",
    description:
      "Combina formacion basica, evaluaciones periodicas, seguimiento de arbitros y entrenamiento tecnico intermedio.",
    tone: "Operativa, regional y de seguimiento",
    trainingLevel: "intermediate",
    plan: "Licencia Liga Anual",
    seatsTotal: 120,
    seatsUsed: 84,
    instructors: 5,
    customVideoEnabled: true,
    publicClipSharingEnabled: false,
    modules: [
      "Reglas aplicadas",
      "Evaluaciones periodicas",
      "Video analisis regional",
      "Faltas tacticas",
      "Manos",
      "Fuera de juego",
      "Disciplina",
      "Seguimiento semanal",
      "Ref Performance basico",
      "Panel administrativo",
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
      { label: "Ref Performance", value: "74%", detail: "readiness promedio" },
      { label: "Licencias usadas", value: "84/120", detail: "36 disponibles" },
    ],
    cohorts: [
      { name: "Primera local", students: 22, progress: 76 },
      { name: "Reserva", students: 18, progress: 69 },
      { name: "Juveniles", students: 25, progress: 62 },
      { name: "Asistentes", students: 11, progress: 73 },
      { name: "Preparacion fisica", students: 42, progress: 67 },
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
    headline: "Entrenamiento tecnico avanzado y seguimiento competitivo",
    description:
      "Para arbitros recibidos: video analisis, toma de decisiones, DOGSO/SPA, VAR Lab, rendimiento y metricas comparativas.",
    tone: "Tecnica, competitiva y de alto rendimiento",
    trainingLevel: "advanced",
    plan: "Licencia Asociacion Anual",
    seatsTotal: 200,
    seatsUsed: 148,
    instructors: 8,
    customVideoEnabled: true,
    publicClipSharingEnabled: true,
    modules: [
      "Video analisis avanzado",
      "VAR Lab",
      "DOGSO / SPA",
      "Disputas complejas",
      "Manos complejas",
      "Fuera de juego avanzado",
      "Gestion disciplinaria",
      "Simulaciones",
      "Evaluaciones profesionales",
      "Ref Performance",
    ],
    metrics: [
      "Comparativa por grupo",
      "Precision por criterio",
      "Ranking tecnico",
      "Readiness promedio",
      "Carga y actividad competitiva",
    ],
    kpis: [
      { label: "Arbitros activos", value: "148", detail: "sobre 200 cupos" },
      { label: "Evaluaciones", value: "396", detail: "ultimo trimestre" },
      { label: "Promedio general", value: "84/100", detail: "plantel completo" },
      { label: "Topico debil", value: "APP", detail: "VAR y ataque prometedor" },
      { label: "Topico fuerte", value: "Faltas tacticas", detail: "89% de precision" },
      { label: "Actividad semanal", value: "82%", detail: "arbitros activos" },
      { label: "Ref Performance", value: "81%", detail: "readiness promedio" },
      { label: "Clips propios", value: "27", detail: "en revision y publicados" },
    ],
    cohorts: [
      { name: "Plantel superior", students: 38, progress: 84 },
      { name: "Regional", students: 41, progress: 78 },
      { name: "VAR Lab", students: 24, progress: 71 },
      { name: "Asistentes avanzados", students: 18, progress: 82 },
      { name: "Ref Performance", students: 63, progress: 76 },
    ],
    students: [
      {
        name: "Mauro Benitez",
        level: "Regional",
        score: "91",
        last: "Hoy",
        weak: "APP",
        status: "Alto rendimiento",
      },
      {
        name: "Florencia Arias",
        level: "Superior",
        score: "88",
        last: "Ayer",
        weak: "OFR",
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
      "Asignar VAR Lab a plantel regional.",
      "Comparar precision disciplinaria entre grupos.",
      "Cruzar readiness con rendimiento en evaluaciones.",
    ],
  },
  federation: {
    type: "federation",
    title: "Federacion Demo",
    headline: "Estandarizacion nacional y analytics profesional",
    description:
      "Infraestructura para federaciones: criterios tecnicos, contenido actualizado, video analisis, VAR, rendimiento y seguimiento escalable.",
    tone: "Institucional, profesional y escalable",
    trainingLevel: "elite",
    plan: "Licencia Federacion Enterprise",
    seatsTotal: 800,
    seatsUsed: 512,
    instructors: 24,
    customVideoEnabled: true,
    publicClipSharingEnabled: true,
    modules: [
      "Panel tecnico nacional",
      "VAR Lab avanzado",
      "Biblioteca de clips federativos",
      "Evaluaciones profesionales",
      "Metricas comparativas",
      "Ranking por categoria",
      "Seguimiento fisico",
      "Readiness",
      "Capacitacion permanente",
      "Publicacion de criterios",
    ],
    metrics: [
      "Estandarizacion por region",
      "Ranking tecnico",
      "Evolucion por categoria",
      "Clips federativos",
      "Readiness y carga",
    ],
    kpis: [
      { label: "Arbitros activos", value: "512", detail: "sobre 800 cupos" },
      { label: "Evaluaciones", value: "1.284", detail: "ultimo trimestre" },
      { label: "Promedio general", value: "86/100", detail: "ecosistema completo" },
      { label: "Criterio critico", value: "OFR", detail: "revision recomendada" },
      { label: "Criterio fuerte", value: "DOGSO", detail: "91% de precision" },
      { label: "Actividad semanal", value: "88%", detail: "arbitros activos" },
      { label: "Ref Performance", value: "83%", detail: "readiness promedio" },
      { label: "Clips propios", value: "134", detail: "federativos y privados" },
    ],
    cohorts: [
      { name: "Elite nacional", students: 48, progress: 88 },
      { name: "Proyeccion", students: 96, progress: 79 },
      { name: "VAR", students: 64, progress: 74 },
      { name: "Asistentes FIFA", students: 32, progress: 86 },
      { name: "Performance nacional", students: 280, progress: 81 },
    ],
    students: [
      {
        name: "Daniel Castro",
        level: "Elite",
        score: "94",
        last: "Hoy",
        weak: "OFR",
        status: "Elite",
      },
      {
        name: "Mariana Torres",
        level: "Proyeccion",
        score: "90",
        last: "Ayer",
        weak: "APP",
        status: "Seguimiento elite",
      },
      {
        name: "Pablo Suarez",
        level: "Nacional",
        score: "87",
        last: "2 dias",
        weak: "Factual vs interpretativo",
        status: "Competitivo",
      },
      {
        name: "Carla Ruiz",
        level: "Asistente",
        score: "95",
        last: "Esta semana",
        weak: "FDJ complejo",
        status: "Elite",
      },
    ],
    instructorFocus: [
      "Publicar criterio federativo de APP y OFR.",
      "Analizar variaciones de decision por region.",
      "Priorizar clips federativos de alta complejidad.",
      "Cruzar carga fisica con performance tecnica.",
    ],
  },
};

export function getInstitutionalExperience(type: InstitutionType) {
  return institutionalExperiences[type] ?? institutionalExperiences.school;
}
