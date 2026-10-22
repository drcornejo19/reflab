import { normalizeSportTopicKey, type SportType } from "./sports.ts";

export type VideoFieldKey =
  | "technical_decision"
  | "infringement_type"
  | "restart"
  | "disciplinary_action"
  | "subtype"
  | "accumulated_foul"
  | "four_second"
  | "goalkeeper_decision"
  | "advantage"
  | "procedure"
  | "positioning"
  | "second_referee"
  | "third_referee_timekeeper"
  | "justification";

export type VideoFieldKind = "boolean" | "single_select" | "text";

export type VideoFieldDefinition = {
  key: VideoFieldKey;
  label: string;
  kind: VideoFieldKind;
  required: boolean;
  persistenceKey?: string;
  helperText?: string;
  options?: Array<{ value: string; label: string }>;
};

export type VideoTopicSchema = {
  sportType: SportType;
  topic: string;
  title: string;
  description: string;
  fields: VideoFieldDefinition[];
};

const yesNoOptions = [
  { value: "true", label: "Si" },
  { value: "false", label: "No" },
];

const disciplinaryOptions = [
  { value: "Sin sancion", label: "Sin sancion" },
  { value: "Amarilla", label: "Amarilla" },
  { value: "Roja", label: "Roja" },
];

const footballRestartOptions = [
  { value: "Seguir el juego", label: "Seguir el juego" },
  { value: "Tiro libre directo", label: "Tiro libre directo" },
  { value: "Tiro libre indirecto", label: "Tiro libre indirecto" },
  { value: "Penal", label: "Penal" },
  { value: "Saque de meta", label: "Saque de meta" },
  { value: "Saque de esquina", label: "Saque de esquina" },
  { value: "Saque de banda", label: "Saque de banda" },
  { value: "Balon a tierra", label: "Balon a tierra" },
];

const futsalRestartOptions = [
  { value: "Seguir el juego", label: "Seguir el juego" },
  { value: "Tiro libre directo", label: "Tiro libre directo" },
  { value: "Tiro libre indirecto", label: "Tiro libre indirecto" },
  { value: "Penal", label: "Penal" },
  { value: "Segundo punto penal", label: "Segundo punto penal" },
  { value: "Saque de banda", label: "Saque de banda" },
  { value: "Saque de meta", label: "Saque de meta" },
  { value: "Saque de esquina", label: "Saque de esquina" },
  { value: "Balon a tierra", label: "Balon a tierra" },
];

const offsideSubtypeOptions = [
  { value: "no_offside", label: "No fuera de juego" },
  { value: "interferir_juego", label: "Interfiere en el juego" },
  { value: "interferir_adversario", label: "Interfiere en el adversario" },
  { value: "sacar_ventaja", label: "Saca ventaja" },
];

const handballSubtypeOptions = [
  { value: "no_sancionable", label: "No sancionable" },
  { value: "inmediatez", label: "Inmediatez" },
  { value: "bloqueo", label: "Bloqueo" },
  { value: "deliberada", label: "Deliberada" },
];

const futsalInfringementOptions = [
  { value: "contacto_cuidadoso", label: "Contacto permitido" },
  { value: "carga_imprudente", label: "Carga imprudente" },
  { value: "entrada_temeraria", label: "Entrada temeraria" },
  { value: "uso_fuerza_excesiva", label: "Uso de fuerza excesiva" },
  { value: "mano_sancionable", label: "Mano sancionable" },
  { value: "sin_infraccion", label: "Sin infraccion" },
];

function createSharedDecisionFields(
  restartOptions: Array<{ value: string; label: string }>
): VideoFieldDefinition[] {
  return [
    {
      key: "technical_decision",
      label: "Existe infraccion",
      kind: "single_select",
      required: true,
      persistenceKey: "technical_correct",
      options: yesNoOptions,
    },
    {
      key: "restart",
      label: "Reanudacion",
      kind: "single_select",
      required: true,
      persistenceKey: "restart_correct",
      options: restartOptions,
    },
    {
      key: "disciplinary_action",
      label: "Sancion disciplinaria",
      kind: "single_select",
      required: true,
      persistenceKey: "disciplinary_correct",
      options: disciplinaryOptions,
    },
    {
      key: "justification",
      label: "Justificacion reglamentaria",
      kind: "text",
      required: false,
    },
  ];
}

const football11Schemas: VideoTopicSchema[] = [
  {
    sportType: "football_11",
    topic: "Dispute",
    title: "Disputas",
    description: "Decision tecnica, reanudacion y disciplina para contactos y duelos.",
    fields: createSharedDecisionFields(footballRestartOptions),
  },
  {
    sportType: "football_11",
    topic: "Tactical foul",
    title: "Faltas tacticas",
    description: "Decision tecnica con foco en SPA, DOGSO y control disciplinario.",
    fields: createSharedDecisionFields(footballRestartOptions),
  },
  {
    sportType: "football_11",
    topic: "Offside",
    title: "Fuera de juego",
    description: "Incluye subtipo para interferencia, ventaja o no infraccion.",
    fields: [
        ...createSharedDecisionFields(footballRestartOptions),
      {
        key: "subtype",
        label: "Subtipo",
        kind: "single_select",
        required: false,
        persistenceKey: "subtype_correct",
        options: offsideSubtypeOptions,
      },
    ],
  },
  {
    sportType: "football_11",
    topic: "Handball",
    title: "Manos",
    description: "Incluye subtipo para deliberada, bloqueo, inmediatez o no sancionable.",
    fields: [
        ...createSharedDecisionFields(footballRestartOptions),
      {
        key: "subtype",
        label: "Subtipo",
        kind: "single_select",
        required: false,
        persistenceKey: "subtype_correct",
        options: handballSubtypeOptions,
      },
    ],
  },
  {
    sportType: "football_11",
    topic: "VAR",
    title: "VAR",
    description: "Caso de laboratorio VAR con protocolo y validacion de intervencion.",
    fields: [
      {
        key: "technical_decision",
        label: "Decision VAR",
        kind: "single_select",
        required: true,
        options: [
          { value: "check_complete", label: "Check complete" },
          { value: "review_recommended", label: "Review recommended" },
          { value: "on_field_review", label: "On-field review" },
        ],
      },
      {
        key: "restart",
        label: "APP / reanudacion",
        kind: "single_select",
        required: false,
        persistenceKey: "app_correct",
        options: footballRestartOptions,
      },
      {
        key: "disciplinary_action",
        label: "Decision final",
        kind: "single_select",
        required: false,
        persistenceKey: "var_intervention_correct",
        options: [
          { value: "confirm_decision", label: "Confirmar decision" },
          { value: "overturn_decision", label: "Revertir decision" },
        ],
      },
      {
        key: "justification",
        label: "Fundamento de protocolo",
        kind: "text",
        required: false,
      },
    ],
  },
];

const futsalSchemas: VideoTopicSchema[] = [
  {
    sportType: "futsal",
    topic: "Handball",
    title: "Manos",
    description: "Evalua mano sancionable, reanudacion y consecuencia disciplinaria.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "subtype",
        label: "Tipo de mano",
        kind: "single_select",
        required: false,
        persistenceKey: "subtype_correct",
        options: handballSubtypeOptions,
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Dispute",
    title: "Disputas",
    description: "Evalua contacto, intensidad, reanudacion y sancion disciplinaria.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "infringement_type",
        label: "Tipo de contacto",
        kind: "single_select",
        required: false,
        persistenceKey: "subtype_correct",
        options: futsalInfringementOptions,
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Tactical foul",
    title: "Faltas tacticas",
    description: "Evalua SPA, DOGSO, reanudacion, disciplina y falta acumulada.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "accumulated_foul",
        label: "Cuenta como falta acumulada",
        kind: "single_select",
        required: false,
        persistenceKey: "accumulated_foul_correct",
        options: yesNoOptions,
      },
    ],
  },
];

export const videoAnalysisSchemasBySport: Record<SportType, VideoTopicSchema[]> = {
  football_11: football11Schemas,
  futsal: futsalSchemas,
};

export function getVideoAnalysisSchemas(sportType: SportType) {
  return videoAnalysisSchemasBySport[sportType];
}

export function getVideoTopicSchema(sportType: SportType, topic: string) {
  const normalizedTopic = normalizeSportTopicKey(topic, sportType);
  if (!normalizedTopic) return undefined;

  return getVideoAnalysisSchemas(sportType).find(
    (schema) => schema.topic === normalizedTopic
  );
}
