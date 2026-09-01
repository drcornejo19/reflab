import {
  DEFAULT_SPORT_TYPE,
  getGoverningBodyForSport,
  type GoverningBody,
  type SportType,
} from "./sports.ts";

export type QuestionMode = "practice" | "exam";
export type QuestionDifficulty = "Basica" | "Media" | "Avanzada";
export type QuestionLanguage = "es" | "en" | "pt" | "multi";

export type RuleQuestion = {
  id: number | string;
  sport_type: SportType;
  question_mode: QuestionMode;
  topic: string;
  subtopic?: string | null;
  lawReference: string;
  rule_reference: string;
  season: string;
  difficulty: QuestionDifficulty;
  language: QuestionLanguage;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  ifabExplanation?: string;
  officialExplanation?: string | null;
  normative_reference?: string | null;
  source_official: string;
  source_version: string;
  governing_body: GoverningBody;
  reviewed_at?: string | null;
  is_active?: boolean;
  criterion_tags?: string[];
};

type QuestionDefaults = {
  sport_type?: SportType;
  question_mode?: QuestionMode;
  season: string;
  language?: QuestionLanguage;
  source_official: string;
  source_version: string;
  governing_body?: GoverningBody;
};

export function withQuestionDefaults(
  question: Omit<
    RuleQuestion,
    | "sport_type"
    | "question_mode"
    | "season"
    | "language"
    | "source_official"
    | "source_version"
    | "governing_body"
    | "rule_reference"
  > & { rule_reference?: string },
  defaults: QuestionDefaults
): RuleQuestion {
  const sportType = defaults.sport_type ?? DEFAULT_SPORT_TYPE;
  const governingBody =
    defaults.governing_body ?? getGoverningBodyForSport(sportType);

  return {
    ...question,
    sport_type: sportType,
    question_mode: defaults.question_mode ?? "practice",
    season: defaults.season,
    language: defaults.language ?? "es",
    source_official: defaults.source_official,
    source_version: defaults.source_version,
    governing_body: governingBody,
    rule_reference: question.rule_reference ?? question.lawReference,
    officialExplanation:
      question.officialExplanation ?? question.ifabExplanation ?? null,
    is_active: question.is_active ?? true,
    criterion_tags: question.criterion_tags ?? [],
  };
}

export function filterQuestionsBySport(
  questions: RuleQuestion[],
  sportType: SportType
) {
  return questions.filter((question) => question.sport_type === sportType);
}

export function validateRuleQuestion(question: RuleQuestion) {
  const errors: string[] = [];

  if (!question.question.trim()) {
    errors.push("La pregunta no puede quedar vacia.");
  }

  if (!Array.isArray(question.options) || question.options.length < 2) {
    errors.push("La pregunta debe tener al menos dos opciones.");
  }

  if (question.correct < 0 || question.correct >= question.options.length) {
    errors.push("La respuesta correcta queda fuera del rango de opciones.");
  }

  if (question.governing_body !== getGoverningBodyForSport(question.sport_type)) {
    errors.push("La fuente reglamentaria no coincide con la disciplina.");
  }

  if (!question.rule_reference.trim()) {
    errors.push("La referencia reglamentaria es obligatoria.");
  }

  if (!question.source_official.trim()) {
    errors.push("La fuente oficial es obligatoria.");
  }

  return errors;
}
