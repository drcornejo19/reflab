import type { SportType } from "@/lib/sports";

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

const goalkeeperDecisionOptions = [
  { value: "control_legal", label: "Control legal del guardameta" },
  { value: "cuatro_segundos", label: "Infraccion de cuatro segundos" },
  { value: "segunda_recepcion", label: "Segunda recepcion en propia mitad" },
  { value: "cesion_prohibida", label: "Cesion prohibida con el pie" },
  { value: "portero_jugador_legal", label: "Portero-jugador permitido" },
];

const substitutionProcedureOptions = [
  { value: "procedimiento_correcto", label: "Procedimiento correcto" },
  { value: "ingreso_anticipado", label: "El sustituto ingreso antes de tiempo" },
  { value: "ingreso_fuera_zona", label: "Ingreso fuera de zona de sustitucion" },
  { value: "salida_fuera_zona", label: "Salida fuera de zona de sustitucion" },
];

const positioningOptions = [
  { value: "mecanica_correcta", label: "Mecanica correcta" },
  { value: "angulo_insuficiente", label: "Angulo insuficiente" },
  { value: "segundo_arbitro_debia_apoyar", label: "Debio intervenir el segundo arbitro" },
  { value: "tercer_arbitro_debia_intervenir", label: "Debio intervenir tercer arbitro / cronometrador" },
];

const supportOfficialOptions = [
  { value: "intervencion_correcta", label: "Intervencion correcta" },
  { value: "debio_intervenir", label: "Debio intervenir" },
  { value: "no_debia_intervenir", label: "No debia intervenir" },
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
    topic: "Fouls and contact",
    title: "Faltas y contactos",
    description: "Evalua infraccion, reanudacion, disciplina, acumulada y ventaja.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "infringement_type",
        label: "Tipo de infraccion",
        kind: "single_select",
        required: false,
        persistenceKey: "subtype_correct",
        options: futsalInfringementOptions,
      },
      {
        key: "accumulated_foul",
        label: "Cuenta como falta acumulada",
        kind: "single_select",
        required: false,
        persistenceKey: "accumulated_foul_correct",
        options: yesNoOptions,
      },
      {
        key: "advantage",
        label: "Aplicacion de ventaja",
        kind: "single_select",
        required: false,
        options: yesNoOptions,
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Accumulated fouls",
    title: "Faltas acumuladas",
    description: "Decision sobre acumulada, sexto foul y segundo punto penal.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "accumulated_foul",
        label: "Cuenta como falta acumulada",
        kind: "single_select",
        required: true,
        persistenceKey: "accumulated_foul_correct",
        options: yesNoOptions,
      },
      {
        key: "procedure",
        label: "Procedimiento correcto",
        kind: "single_select",
        required: false,
        options: [
          { value: "dfksaf_desde_10m", label: "Se ejecuta como sexto foul desde 10 m" },
          { value: "dfksaf_desde_punto_falta", label: "Puede ejecutarse desde el punto de la falta" },
          { value: "penal_por_area", label: "Corresponde penal por falta dentro del area" },
        ],
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Four-second count",
    title: "Cuatro segundos",
    description: "Control del tiempo reglamentario en reinicios y posesion del guardameta.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "four_second",
        label: "Aplicacion correcta de los cuatro segundos",
        kind: "single_select",
        required: true,
        persistenceKey: "four_second_correct",
        options: yesNoOptions,
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Goalkeeper",
    title: "Guardameta y portero-jugador",
    description: "Evalua cesion, control en propia mitad y decisiones del portero-jugador.",
    fields: [
      ...createSharedDecisionFields(futsalRestartOptions),
      {
        key: "goalkeeper_decision",
        label: "Decision sobre guardameta",
        kind: "single_select",
        required: true,
        persistenceKey: "goalkeeper_correct",
        options: goalkeeperDecisionOptions,
      },
      {
        key: "four_second",
        label: "Cuenta de cuatro segundos",
        kind: "single_select",
        required: false,
        persistenceKey: "four_second_correct",
        options: yesNoOptions,
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Substitution procedure",
    title: "Procedimiento de sustitucion",
    description: "Control del ingreso, egreso y responsabilidades del tercer arbitro.",
    fields: [
      {
        key: "procedure",
        label: "Procedimiento correcto",
        kind: "single_select",
        required: true,
        options: substitutionProcedureOptions,
      },
      {
        key: "third_referee_timekeeper",
        label: "Intervencion de tercer arbitro / cronometrador",
        kind: "single_select",
        required: false,
        options: supportOfficialOptions,
      },
      {
        key: "justification",
        label: "Fundamento reglamentario",
        kind: "text",
        required: false,
      },
    ],
  },
  {
    sportType: "futsal",
    topic: "Referee positioning",
    title: "Posicionamiento y trabajo arbitral",
    description: "Evalua mecanica, posicionamiento y apoyo del segundo arbitro.",
    fields: [
      {
        key: "positioning",
        label: "Ubicacion / mecanica arbitral",
        kind: "single_select",
        required: true,
        options: positioningOptions,
      },
      {
        key: "second_referee",
        label: "Intervencion del segundo arbitro",
        kind: "single_select",
        required: false,
        options: supportOfficialOptions,
      },
      {
        key: "third_referee_timekeeper",
        label: "Intervencion de tercer arbitro / cronometrador",
        kind: "single_select",
        required: false,
        options: supportOfficialOptions,
      },
      {
        key: "justification",
        label: "Justificacion de la mecanica",
        kind: "text",
        required: false,
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
  return getVideoAnalysisSchemas(sportType).find((schema) => schema.topic === topic);
}
