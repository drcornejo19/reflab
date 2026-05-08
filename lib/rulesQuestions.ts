export type RuleQuestion = {
  id: number;
  question: string;
  options: string[];
  correct: number;
  topic: string;
  explanation: string;
};

export const rulesQuestions: RuleQuestion[] = [
  {
    id: 1,
    question:
      "Un defensor sujeta a un atacante fuera del área, pero la sujeción continúa dentro del área penal. ¿Qué corresponde?",
    options: [
      "Tiro libre directo",
      "Penal",
      "Balón a tierra",
      "Tiro libre indirecto",
    ],
    correct: 1,
    topic: "Regla 12",
    explanation:
      "Si la infracción continúa dentro del área penal, debe sancionarse penal.",
  },

  {
    id: 2,
    question:
      "Un jugador en posición de fuera de juego bloquea claramente la visión del guardameta. ¿Qué corresponde?",
    options: [
      "Seguir el juego",
      "Fuera de juego",
      "Tiro libre directo",
      "Balón a tierra",
    ],
    correct: 1,
    topic: "Regla 11",
    explanation:
      "Interferir en un adversario bloqueando la visión del guardameta constituye infracción de fuera de juego.",
  },

  {
    id: 3,
    question:
      "Un jugador comete una entrada con fuerza excesiva poniendo en peligro la integridad física del adversario. ¿Qué corresponde?",
    options: [
      "Sin tarjeta",
      "Amarilla",
      "Roja",
      "Advertencia",
    ],
    correct: 2,
    topic: "Disciplina",
    explanation:
      "La fuerza excesiva implica expulsión por juego brusco grave.",
  },

  {
    id: 4,
    question:
      "¿Cuál de estas situaciones NO es revisable por VAR?",
    options: [
      "Gol/no gol",
      "Penal",
      "Segundo amonestado",
      "Roja directa",
    ],
    correct: 2,
    topic: "VAR",
    explanation:
      "El VAR no interviene en segundas amonestaciones.",
  },

  {
    id: 5,
    question:
      "Un jugador marca inmediatamente después de que el balón toca accidentalmente su mano. ¿Qué corresponde?",
    options: [
      "Gol válido",
      "Seguir el juego",
      "Anular el gol",
      "Balón a tierra",
    ],
    correct: 2,
    topic: "Manos",
    explanation:
      "No puede marcarse gol inmediatamente después de una mano accidental del atacante.",
  },

  //nuevas


  {
  id: 1,
  topic: "Fuera de juego",
  question:
    "Un atacante en posición de fuera de juego recibe el balón directamente de un saque de meta. ¿Cuál es la decisión correcta?",
  options: [
    "Fuera de juego",
    "Tiro libre indirecto",
    "Seguir el juego",
    "Balón a tierra",
  ],
  correct: 2,
  explanation:
    "No existe infracción de fuera de juego al recibir directamente un balón de saque de meta.",
},

{
  id: 2,
  topic: "Fuera de juego",
  question:
    "¿Cuándo se sanciona una infracción de fuera de juego?",
  options: [
    "Cuando un jugador está adelantado",
    "Cuando participa activamente del juego",
    "Cuando pisa campo rival",
    "Cuando toca el árbitro",
  ],
  correct: 1,
  explanation:
    "La posición por sí sola no constituye infracción. Debe existir participación activa.",
},

{
  id: 3,
  topic: "Fuera de juego",
  question:
    "¿Cuál de las siguientes acciones constituye ganar ventaja en fuera de juego?",
  options: [
    "Recibir un rebote del poste",
    "Recibir un pase de un adversario controlado",
    "Recibir un saque lateral",
    "Estar cerca del arquero",
  ],
  correct: 0,
  explanation:
    "Ganar ventaja incluye jugar un balón proveniente de un rebote o desvío.",
},

{
  id: 4,
  topic: "Fuera de juego",
  question:
    "Un defensor realiza una salvada deliberada y el balón queda a un atacante adelantado. ¿Decisión?",
  options: [
    "Seguir el juego",
    "TLI por fuera de juego",
    "Balón a tierra",
    "Penal",
  ],
  correct: 1,
  explanation:
    "Una salvada deliberada no habilita al atacante en posición de fuera de juego.",
},

{
  id: 5,
  topic: "Fuera de juego",
  question:
    "¿Desde dónde se ejecuta el tiro libre indirecto por fuera de juego?",
  options: [
    "Desde donde salió el pase",
    "Desde mitad de cancha",
    "Desde donde participa el atacante",
    "Desde el área penal",
  ],
  correct: 2,
  explanation:
    "El TLI se ejecuta desde el lugar donde el jugador participa activamente.",
},

{
  id: 6,
  topic: "Fuera de juego",
  question:
    "¿Cuál de estas NO es una excepción al fuera de juego?",
  options: [
    "Saque lateral",
    "Saque de meta",
    "Saque de esquina",
    "Balón a tierra",
  ],
  correct: 3,
  explanation:
    "Las excepciones son saque de meta, saque lateral y saque de esquina.",
},

{
  id: 7,
  topic: "Fuera de juego",
  question:
    "Un atacante adelantado obstruye claramente la visión del arquero sin tocar el balón. ¿Qué corresponde?",
  options: [
    "Seguir el juego",
    "Fuera de juego",
    "Balón a tierra",
    "TLD",
  ],
  correct: 1,
  explanation:
    "Obstruir la visión del adversario constituye interferir con un adversario.",
},

{
  id: 8,
  topic: "Fuera de juego",
  question:
    "¿Qué parte del cuerpo se considera para evaluar el fuera de juego?",
  options: [
    "Solo pies",
    "Todo el cuerpo",
    "Las partes habilitadas para jugar el balón",
    "Solo cabeza",
  ],
  correct: 2,
  explanation:
    "Se consideran únicamente partes con las que legalmente se puede jugar el balón.",
},

{
  id: 9,
  topic: "Fuera de juego",
  question:
    "¿Cuál es la línea de referencia principal para determinar fuera de juego?",
  options: [
    "El balón",
    "El penúltimo adversario",
    "El árbitro",
    "El círculo central",
  ],
  correct: 1,
  explanation:
    "La referencia es el penúltimo adversario o el balón si está más cerca de la línea de meta.",
},

{
  id: 10,
  topic: "Fuera de juego",
  question:
    "Si atacante y defensor están exactamente alineados, ¿qué decisión corresponde?",
  options: [
    "Fuera de juego",
    "TLI",
    "Seguir el juego",
    "Balón a tierra",
  ],
  correct: 2,
  explanation:
    "Estar en línea con el penúltimo adversario no constituye fuera de juego.",
},

{
  id: 11,
  topic: "Mano",
  question:
    "¿Cuál es el criterio principal para sancionar una mano deliberada?",
  options: [
    "La distancia",
    "La posición del arquero",
    "El movimiento de la mano hacia el balón",
    "La velocidad del balón",
  ],
  correct: 2,
  explanation:
    "El movimiento de la mano o brazo hacia el balón es un criterio clave de mano deliberada.",
},

{
  id: 12,
  topic: "Mano",
  question:
    "Un jugador marca un gol inmediatamente después de que el balón toque accidentalmente su mano. ¿Qué corresponde?",
  options: [
    "Gol válido",
    "Tiro de esquina",
    "Gol anulado y TLD/TLP",
    "Balón a tierra",
  ],
  correct: 2,
  explanation:
    "Si un atacante marca inmediatamente tras tocar accidentalmente el balón con la mano, el gol debe anularse.",
},

{
  id: 13,
  topic: "Mano",
  question:
    "¿Qué se considera una posición antinatural del brazo?",
  options: [
    "Brazo pegado al cuerpo",
    "Brazo ocupando espacio injustificado",
    "Brazo detrás de la espalda",
    "Brazo en carrera natural",
  ],
  correct: 1,
  explanation:
    "Se considera antinatural cuando el jugador asume un riesgo ocupando más espacio corporal.",
},

{
  id: 14,
  topic: "Mano",
  question:
    "Si el balón rebota accidentalmente desde el propio cuerpo del jugador hacia su brazo pegado, ¿qué corresponde generalmente?",
  options: [
    "Mano sancionable",
    "Tarjeta amarilla",
    "Seguir el juego",
    "Penal obligatorio",
  ],
  correct: 2,
  explanation:
    "Los rebotes inesperados con brazo en posición natural normalmente no son infracción.",
},

{
  id: 15,
  topic: "Mano",
  question:
    "¿Qué decisión corresponde si un defensor bloquea un disparo con brazo extendido dentro de su área penal?",
  options: [
    "Seguir el juego",
    "TLI",
    "Penal",
    "Balón a tierra",
  ],
  correct: 2,
  explanation:
    "El brazo extendido aumentando volumen corporal suele constituir infracción sancionable.",
},

{
  id: 16,
  topic: "Mano",
  question:
    "¿La mano accidental de un defensor dentro de su área siempre es penal?",
  options: [
    "Sí",
    "No",
    "Solo con VAR",
    "Solo si protesta",
  ],
  correct: 1,
  explanation:
    "No toda mano accidental constituye infracción.",
},

{
  id: 17,
  topic: "Mano",
  question:
    "¿Qué criterio aumenta la probabilidad de sancionar mano?",
  options: [
    "Brazo pegado",
    "Distancia corta inesperada",
    "Brazo sobre hombro o extendido",
    "Jugador cayendo naturalmente",
  ],
  correct: 2,
  explanation:
    "El brazo extendido o por encima del hombro suele considerarse antinatural.",
},

{
  id: 18,
  topic: "Mano",
  question:
    "Un jugador cae y utiliza el brazo de apoyo entre cuerpo y suelo. El balón impacta allí. ¿Decisión?",
  options: [
    "Penal",
    "TLD",
    "Seguir el juego",
    "Amarilla",
  ],
  correct: 2,
  explanation:
    "El brazo de apoyo en caída natural normalmente no constituye infracción.",
},

{
  id: 19,
  topic: "Mano",
  question:
    "¿Cuál de estas situaciones puede implicar DOGSO por mano?",
  options: [
    "Bloquear un gol con la mano",
    "Saque lateral",
    "Mano accidental",
    "Balón dividido",
  ],
  correct: 0,
  explanation:
    "Impedir un gol o una ocasión manifiesta con mano deliberada puede implicar expulsión.",
},

{
  id: 20,
  topic: "Mano",
  question:
    "¿Qué reanudación corresponde tras sancionar mano deliberada fuera del área?",
  options: [
    "Balón a tierra",
    "TLD",
    "TLI",
    "Saque de meta",
  ],
  correct: 1,
  explanation:
    "La mano deliberada se sanciona con tiro libre directo.",
},
{
  id: 21,
  topic: "SPA / DOGSO",
  question:
    "¿Qué significa SPA en terminología arbitral?",
  options: [
    "Serious Physical Action",
    "Stopping a Promising Attack",
    "Stopping Play Aggressively",
    "Special Penalty Action",
  ],
  correct: 1,
  explanation:
    "SPA significa detener un ataque prometedor.",
},

{
  id: 22,
  topic: "SPA / DOGSO",
  question:
    "¿Qué sanción disciplinaria corresponde normalmente por SPA?",
  options: [
    "Sin tarjeta",
    "Tarjeta amarilla",
    "Tarjeta roja",
    "Advertencia verbal",
  ],
  correct: 1,
  explanation:
    "SPA generalmente implica amonestación.",
},

{
  id: 23,
  topic: "SPA / DOGSO",
  question:
    "DOGSO significa:",
  options: [
    "Dangerous Offensive Goal Situation",
    "Denial of an Obvious Goal Scoring Opportunity",
    "Direct Offensive Goal Scoring Offence",
    "Dangerous Open Goal Situation",
  ],
  correct: 1,
  explanation:
    "DOGSO refiere a impedir una ocasión manifiesta de gol.",
},

{
  id: 24,
  topic: "SPA / DOGSO",
  question:
    "¿Cuál de estos criterios se analiza para DOGSO?",
  options: [
    "Condición climática",
    "Cantidad de suplentes",
    "Dirección del juego",
    "Color de camiseta",
  ],
  correct: 2,
  explanation:
    "La dirección del juego es uno de los 4 criterios clásicos de DOGSO.",
},

{
  id: 25,
  topic: "SPA / DOGSO",
  question:
    "Un defensor dentro del área intenta jugar el balón y comete una falta DOGSO. ¿Qué corresponde actualmente?",
  options: [
    "Roja siempre",
    "Amarilla y penal",
    "Sin tarjeta",
    "Balón a tierra",
  ],
  correct: 1,
  explanation:
    "Si existe intento genuino de jugar el balón dentro del área, DOGSO se reduce a amarilla.",
},

{
  id: 26,
  topic: "SPA / DOGSO",
  question:
    "¿Qué sanción corresponde por DOGSO sin intento de jugar el balón?",
  options: [
    "Sin sanción",
    "Amarilla",
    "Roja",
    "Solo advertencia",
  ],
  correct: 2,
  explanation:
    "DOGSO sin intento genuino implica expulsión.",
},

{
  id: 27,
  topic: "SPA / DOGSO",
  question:
    "¿Cuál NO es un criterio DOGSO?",
  options: [
    "Distancia al arco",
    "Control del balón",
    "Cantidad de fotógrafos",
    "Posición de defensores",
  ],
  correct: 2,
  explanation:
    "Los fotógrafos no forman parte del análisis DOGSO.",
},

{
  id: 28,
  topic: "SPA / DOGSO",
  question:
    "¿Qué reanudación corresponde tras una zancadilla SPA?",
  options: [
    "TLI",
    "Balón a tierra",
    "TLD",
    "Saque lateral",
  ],
  correct: 2,
  explanation:
    "Una zancadilla es infracción de tiro libre directo.",
},

{
  id: 29,
  topic: "SPA / DOGSO",
  question:
    "¿Puede existir DOGSO por mano deliberada?",
  options: [
    "No",
    "Solo VAR",
    "Sí",
    "Solo fuera del área",
  ],
  correct: 2,
  explanation:
    "La mano deliberada puede impedir una ocasión manifiesta de gol.",
},

{
  id: 30,
  topic: "SPA / DOGSO",
  question:
    "¿Qué criterio diferencia principalmente SPA de DOGSO?",
  options: [
    "Color de camiseta",
    "Cantidad de árbitros",
    "La magnitud de la oportunidad de gol",
    "La tribuna",
  ],
  correct: 2,
  explanation:
    "DOGSO implica ocasión manifiesta; SPA ataque prometedor.",
},

{
  id: 31,
  topic: "VAR",
  question:
    "¿En qué situaciones puede intervenir el VAR?",
  options: [
    "Todas las faltas",
    "Solo goles",
    "Incidentes claros y manifiestos",
    "Cualquier saque lateral",
  ],
  correct: 2,
  explanation:
    "El VAR interviene únicamente en incidentes claros y manifiestos dentro de los protocolos establecidos.",
},

{
  id: 32,
  topic: "VAR",
  question:
    "¿Cuál de estas situaciones es revisable por VAR?",
  options: [
    "Saque lateral incorrecto",
    "Posible penal",
    "Tiro de esquina",
    "Balón a tierra",
  ],
  correct: 1,
  explanation:
    "Los posibles penales forman parte del protocolo VAR.",
},

{
  id: 33,
  topic: "VAR",
  question:
    "¿Qué significa OFR?",
  options: [
    "Official Field Review",
    "On-Field Review",
    "Offside Final Review",
    "Official Foul Review",
  ],
  correct: 1,
  explanation:
    "OFR significa revisión en campo por parte del árbitro.",
},

{
  id: 34,
  topic: "VAR",
  question:
    "¿Qué tipo de decisiones suelen requerir OFR?",
  options: [
    "Decisiones subjetivas",
    "Solo fueras de juego automáticos",
    "Saque lateral",
    "Balón a tierra",
  ],
  correct: 0,
  explanation:
    "Las decisiones subjetivas suelen requerir revisión en campo.",
},

{
  id: 35,
  topic: "VAR",
  question:
    "¿Qué significa 'check complete'?",
  options: [
    "El VAR recomienda OFR",
    "La revisión terminó sin cambio",
    "Gol anulado",
    "Partido suspendido",
  ],
  correct: 1,
  explanation:
    "Check complete indica que el VAR revisó y confirma la decisión original.",
},

{
  id: 36,
  topic: "VAR",
  question:
    "¿Qué ocurre si el árbitro realiza el gesto de TV?",
  options: [
    "Finaliza el partido",
    "Indica revisión VAR",
    "Expulsa un jugador",
    "Solicita ambulancia",
  ],
  correct: 1,
  explanation:
    "El gesto de TV indica revisión VAR.",
},

{
  id: 37,
  topic: "VAR",
  question:
    "¿Puede el VAR intervenir en una segunda amarilla?",
  options: [
    "Sí",
    "No",
    "Solo en finales",
    "Solo si hay gol",
  ],
  correct: 1,
  explanation:
    "El VAR no interviene en segundas amonestaciones.",
},

{
  id: 38,
  topic: "VAR",
  question:
    "¿Qué tipo de fuera de juego revisa el VAR?",
  options: [
    "Solo posicional",
    "Solo interferencia",
    "Situaciones APP y goles",
    "Todos automáticamente",
  ],
  correct: 2,
  explanation:
    "VAR revisa APP y situaciones relacionadas con goles.",
},

{
  id: 39,
  topic: "VAR",
  question:
    "¿Cuál es el estándar principal de intervención VAR?",
  options: [
    "Error mínimo",
    "Error claro y manifiesto",
    "Criterio del público",
    "Intensidad media",
  ],
  correct: 1,
  explanation:
    "El estándar VAR es error claro y manifiesto.",
},

{
  id: 40,
  topic: "VAR",
  question:
    "¿Quién toma la decisión final después de una OFR?",
  options: [
    "El VAR",
    "El AVAR",
    "El árbitro principal",
    "El cuarto árbitro",
  ],
  correct: 2,
  explanation:
    "La decisión final siempre pertenece al árbitro principal.",
},

{
  id: 41,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde tras una falta imprudente fuera del área?",
  options: [
    "TLI",
    "Balón a tierra",
    "TLD",
    "Saque de meta",
  ],
  correct: 2,
  explanation:
    "Las faltas imprudentes se sancionan con tiro libre directo.",
},

{
  id: 42,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde por juego peligroso sin contacto?",
  options: [
    "TLD",
    "TLI",
    "Penal",
    "Balón a tierra",
  ],
  correct: 1,
  explanation:
    "El juego peligroso sin contacto se sanciona con tiro libre indirecto.",
},

{
  id: 43,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde cuando el balón golpea al árbitro y genera ataque prometedor?",
  options: [
    "Seguir el juego",
    "TLD",
    "Balón a tierra",
    "TLI",
  ],
  correct: 2,
  explanation:
    "Si el balón toca al árbitro y cambia una posesión prometedora, corresponde balón a tierra.",
},

{
  id: 44,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde tras una mano deliberada dentro del área defensiva?",
  options: [
    "TLD",
    "TLI",
    "Penal",
    "Saque de esquina",
  ],
  correct: 2,
  explanation:
    "La mano deliberada dentro del área defensiva se sanciona con penal.",
},

{
  id: 45,
  topic: "Reanudaciones",
  question:
    "¿Cuál es la reanudación tras un fuera de juego?",
  options: [
    "TLD",
    "Penal",
    "TLI",
    "Balón a tierra",
  ],
  correct: 2,
  explanation:
    "El fuera de juego se reanuda con tiro libre indirecto.",
},

{
  id: 46,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde si el arquero toma con la mano un pase deliberado con el pie de un compañero?",
  options: [
    "Penal",
    "TLD",
    "Balón a tierra",
    "TLI",
  ],
  correct: 3,
  explanation:
    "El arquero no puede tomar con la mano un pase deliberado con el pie de un compañero.",
},

{
  id: 47,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde si el balón sale completamente por línea lateral?",
  options: [
    "Saque de meta",
    "Saque lateral",
    "Balón a tierra",
    "TLI",
  ],
  correct: 1,
  explanation:
    "Cuando el balón sale por línea lateral corresponde saque lateral.",
},

{
  id: 48,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde si un jugador insulta al árbitro con el balón detenido?",
  options: [
    "Balón a tierra",
    "TLI",
    "La reanudación original",
    "TLD",
  ],
  correct: 2,
  explanation:
    "Las sanciones disciplinarias con balón detenido mantienen la reanudación original.",
},

{
  id: 49,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde si un suplente ingresa y comete interferencia?",
  options: [
    "Balón a tierra",
    "TLI",
    "TLD",
    "Penal automático",
  ],
  correct: 2,
  explanation:
    "La interferencia de un suplente normalmente se sanciona con tiro libre directo.",
},

{
  id: 50,
  topic: "Reanudaciones",
  question:
    "¿Qué reanudación corresponde tras conducta violenta fuera del terreno?",
  options: [
    "Balón a tierra",
    "TLI",
    "Según interferencia y ubicación",
    "Siempre penal",
  ],
  correct: 2,
  explanation:
    "La reanudación depende del contexto y ubicación de la infracción.",
},
{
  id: 51,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde por conducta violenta?",
  options: [
    "Sin tarjeta",
    "Amarilla",
    "Roja",
    "Advertencia",
  ],
  correct: 2,
  explanation:
    "La conducta violenta se sanciona con expulsión.",
},

{
  id: 52,
  topic: "Disciplina",
  question:
    "¿Cuál es la principal diferencia entre imprudente y temeraria?",
  options: [
    "La velocidad",
    "El uso de fuerza excesiva",
    "El riesgo asumido",
    "La protesta",
  ],
  correct: 2,
  explanation:
    "La acción temeraria implica ignorar el riesgo o consecuencias para el adversario.",
},

{
  id: 53,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde por una entrada con fuerza excesiva?",
  options: [
    "Sin tarjeta",
    "Amarilla",
    "Roja",
    "TLI",
  ],
  correct: 2,
  explanation:
    "El uso de fuerza excesiva constituye juego brusco grave.",
},

{
  id: 54,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde normalmente por protesta persistente?",
  options: [
    "Sin sanción",
    "Advertencia verbal únicamente",
    "Tarjeta amarilla",
    "Tarjeta roja",
  ],
  correct: 2,
  explanation:
    "La protesta persistente suele implicar amonestación.",
},

{
  id: 55,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde por escupir a un adversario?",
  options: [
    "Amarilla",
    "Sin tarjeta",
    "Roja",
    "TLI",
  ],
  correct: 2,
  explanation:
    "Escupir constituye conducta violenta y es expulsión.",
},

{
  id: 56,
  topic: "Disciplina",
  question:
    "¿Cuál de estas acciones puede constituir juego brusco grave?",
  options: [
    "Carga legal",
    "Entrada con tacos arriba y fuerza excesiva",
    "Disputa aérea normal",
    "Uso legal del hombro",
  ],
  correct: 1,
  explanation:
    "La fuerza excesiva en disputa de balón constituye juego brusco grave.",
},

{
  id: 57,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde por impedir reanudación rápida?",
  options: [
    "Sin sanción",
    "Advertencia",
    "Amarilla",
    "Roja",
  ],
  correct: 2,
  explanation:
    "Retrasar una reanudación rápida es conducta antideportiva.",
},

{
  id: 58,
  topic: "Disciplina",
  question:
    "¿Qué criterio principal define fuerza excesiva?",
  options: [
    "Cantidad de jugadores",
    "Intensidad desmedida y peligro para integridad física",
    "Velocidad del árbitro",
    "Ubicación del VAR",
  ],
  correct: 1,
  explanation:
    "La fuerza excesiva pone en riesgo la integridad física del adversario.",
},

{
  id: 59,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde por cortar un ataque con mano deliberada SPA?",
  options: [
    "Sin tarjeta",
    "Amarilla",
    "Roja",
    "Balón a tierra",
  ],
  correct: 1,
  explanation:
    "Cortar un ataque prometedor con mano deliberada suele implicar amarilla.",
},

{
  id: 60,
  topic: "Disciplina",
  question:
    "¿Qué sanción corresponde si un jugador usa lenguaje ofensivo hacia el árbitro?",
  options: [
    "Advertencia",
    "Sin sanción",
    "Amarilla",
    "Roja",
  ],
  correct: 3,
  explanation:
    "El lenguaje ofensivo, insultante o humillante implica expulsión.",
},
{
  id: 61,
  topic: "Procedimientos arbitrales",
  question:
    "¿Cuándo puede mostrar una tarjeta el árbitro?",
  options: [
    "Solo con balón detenido",
    "Desde ingresar al terreno hasta salir tras el partido",
    "Solo durante el juego",
    "Solo después del VAR",
  ],
  correct: 1,
  explanation:
    "La autoridad disciplinaria del árbitro comienza al ingresar al terreno de juego.",
},

{
  id: 62,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué debe hacer el árbitro antes de iniciar el partido?",
  options: [
    "Elegir el balón solamente",
    "Realizar inspección del terreno y equipamiento",
    "Hablar únicamente con capitanes",
    "Revisar solo redes",
  ],
  correct: 1,
  explanation:
    "El árbitro debe verificar terreno, equipamiento y condiciones generales.",
},

{
  id: 63,
  topic: "Procedimientos arbitrales",
  question:
    "¿Quién tiene autoridad final sobre hechos relacionados con el juego?",
  options: [
    "VAR",
    "Capitán",
    "Árbitro",
    "Cuarto árbitro",
  ],
  correct: 2,
  explanation:
    "El árbitro tiene autoridad total sobre decisiones del juego.",
},

{
  id: 64,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué ocurre si un equipo queda con menos de 7 jugadores?",
  options: [
    "Se continúa normalmente",
    "Debe finalizar el partido",
    "VAR decide",
    "Tiempo suplementario",
  ],
  correct: 1,
  explanation:
    "No puede continuar un partido con menos de 7 jugadores.",
},

{
  id: 65,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué debe hacer el árbitro si un jugador sangra?",
  options: [
    "Continuar el juego",
    "Ignorarlo",
    "Ordenar salida para detener sangrado",
    "Solo advertir",
  ],
  correct: 2,
  explanation:
    "El jugador debe salir hasta detener completamente el sangrado.",
},

{
  id: 66,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué documento oficial debe completar el árbitro tras el partido?",
  options: [
    "Solo planilla médica",
    "Informe arbitral",
    "Informe policial",
    "Acta VAR",
  ],
  correct: 1,
  explanation:
    "El árbitro debe confeccionar informe arbitral oficial.",
},

{
  id: 67,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué ocurre si el balón explota durante el juego?",
  options: [
    "Saque lateral",
    "Balón a tierra",
    "TLD",
    "Penal",
  ],
  correct: 1,
  explanation:
    "El juego se reanuda con balón a tierra.",
},

{
  id: 68,
  topic: "Procedimientos arbitrales",
  question:
    "¿Quién controla las sustituciones?",
  options: [
    "VAR",
    "Entrenador",
    "Equipo arbitral",
    "Capitán",
  ],
  correct: 2,
  explanation:
    "Las sustituciones son controladas por el equipo arbitral.",
},

{
  id: 69,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué debe verificar el árbitro sobre los jugadores?",
  options: [
    "Solo camiseta",
    "Equipamiento reglamentario",
    "Redes sociales",
    "Nacionalidad",
  ],
  correct: 1,
  explanation:
    "El árbitro debe controlar el equipamiento reglamentario.",
},

{
  id: 70,
  topic: "Procedimientos arbitrales",
  question:
    "¿Qué ocurre si un objeto externo interfiere el juego?",
  options: [
    "Siempre penal",
    "Continuar",
    "Detener y reanudar según situación",
    "Expulsar entrenador",
  ],
  correct: 2,
  explanation:
    "El árbitro debe evaluar interferencia y reanudar según las reglas.",
},

{
  id: 71,
  topic: "Tiros libres y penales",
  question:
    "¿Cuándo está el balón en juego en un tiro libre?",
  options: [
    "Cuando se señala",
    "Cuando se mueve claramente",
    "Cuando lo toca otro jugador",
    "Cuando sale del área",
  ],
  correct: 1,
  explanation:
    "El balón está en juego cuando es golpeado y se mueve claramente.",
},

{
  id: 72,
  topic: "Tiros libres y penales",
  question:
    "¿Qué distancia deben respetar los adversarios en un tiro libre?",
  options: [
    "5 metros",
    "7 metros",
    "9,15 metros",
    "10 metros exactos",
  ],
  correct: 2,
  explanation:
    "La distancia reglamentaria es 9,15 metros.",
},

{
  id: 73,
  topic: "Tiros libres y penales",
  question:
    "¿Puede ejecutarse un tiro libre hacia atrás?",
  options: [
    "No",
    "Solo indirectos",
    "Sí",
    "Solo con VAR",
  ],
  correct: 2,
  explanation:
    "El balón puede jugarse en cualquier dirección.",
},

{
  id: 74,
  topic: "Tiros libres y penales",
  question:
    "¿Qué ocurre si un ejecutor toca dos veces seguidas el balón en un penal?",
  options: [
    "Gol válido",
    "Repetición",
    "TLI",
    "TLD",
  ],
  correct: 2,
  explanation:
    "El doble toque se sanciona con tiro libre indirecto.",
},

{
  id: 75,
  topic: "Tiros libres y penales",
  question:
    "¿Qué sucede si el arquero se adelanta y ataja un penal?",
  options: [
    "Seguir",
    "Gol automático",
    "Repetición",
    "Balón a tierra",
  ],
  correct: 2,
  explanation:
    "Si el arquero infringe claramente y evita el gol, el penal se repite.",
},

{
  id: 76,
  topic: "Tiros libres y penales",
  question:
    "¿Qué sanción corresponde si un atacante invade el área y convierte el penal?",
  options: [
    "Gol válido",
    "Repetición",
    "TLI defensivo",
    "Saque de meta",
  ],
  correct: 2,
  explanation:
    "Si invade un atacante y el balón entra, corresponde TLI para defensa.",
},

{
  id: 77,
  topic: "Tiros libres y penales",
  question:
    "¿Qué indica el árbitro en un tiro libre indirecto?",
  options: [
    "Silbato doble",
    "Brazo levantado",
    "Señal VAR",
    "Sin señal",
  ],
  correct: 1,
  explanation:
    "El árbitro mantiene el brazo levantado hasta el segundo toque.",
},

{
  id: 78,
  topic: "Tiros libres y penales",
  question:
    "¿Qué ocurre si un defensor forma barrera con menos de un metro respecto de atacantes?",
  options: [
    "Seguir",
    "TLI",
    "Amarilla",
    "Penal",
  ],
  correct: 1,
  explanation:
    "Los atacantes deben mantenerse a un metro de la barrera defensiva.",
},

{
  id: 79,
  topic: "Tiros libres y penales",
  question:
    "¿Qué reanudación corresponde si un penal rebota en poste y ejecutor juega el rebote sin otro toque?",
  options: [
    "Seguir",
    "TLI",
    "Gol automático",
    "Repetición",
  ],
  correct: 1,
  explanation:
    "El ejecutor no puede jugar nuevamente el balón sin intervención de otro jugador.",
},

{
  id: 80,
  topic: "Tiros libres y penales",
  question:
    "¿Qué debe hacer el árbitro antes de autorizar un penal?",
  options: [
    "Mirar VAR",
    "Verificar posición correcta de jugadores y arquero",
    "Hablar con entrenadores",
    "Esperar silencio",
  ],
  correct: 1,
  explanation:
    "El árbitro debe controlar posiciones reglamentarias antes de ejecutar.",
},

{
  id: 81,
  topic: "Balón en juego",
  question:
    "¿Cuándo está el balón fuera del juego?",
  options: [
    "Cuando toca la línea",
    "Cuando supera completamente las líneas",
    "Cuando protesta un jugador",
    "Cuando el arquero lo toma",
  ],
  correct: 1,
  explanation:
    "El balón debe superar completamente las líneas para estar fuera del juego.",
},

{
  id: 82,
  topic: "Balón en juego",
  question:
    "¿Puede anotarse un gol directamente desde saque inicial?",
  options: [
    "No",
    "Solo en tiempo suplementario",
    "Sí",
    "Solo con desvío",
  ],
  correct: 2,
  explanation:
    "Puede anotarse directamente desde saque inicial.",
},

{
  id: 83,
  topic: "Balón en juego",
  question:
    "¿Qué ocurre si el balón toca el techo?",
  options: [
    "Balón a tierra",
    "TLI",
    "Saque lateral",
    "Seguir",
  ],
  correct: 2,
  explanation:
    "Se reanuda con saque lateral para el rival.",
},

{
  id: 84,
  topic: "Balón en juego",
  question:
    "¿Qué reanudación corresponde si el balón sale por línea de meta tocado último por atacante?",
  options: [
    "Córner",
    "Saque de meta",
    "TLI",
    "Balón a tierra",
  ],
  correct: 1,
  explanation:
    "Corresponde saque de meta.",
},

{
  id: 85,
  topic: "Balón en juego",
  question:
    "¿Qué reanudación corresponde si el balón sale por línea de meta tocado último por defensor?",
  options: [
    "Córner",
    "Saque de meta",
    "TLI",
    "Balón a tierra",
  ],
  correct: 0,
  explanation:
    "Corresponde saque de esquina.",
},

{
  id: 86,
  topic: "Balón en juego",
  question:
    "¿Puede anotarse un gol directamente desde saque lateral?",
  options: [
    "Sí",
    "No",
    "Solo con VAR",
    "Solo si pica",
  ],
  correct: 1,
  explanation:
    "No puede anotarse directamente desde saque lateral.",
},

{
  id: 87,
  topic: "Balón en juego",
  question:
    "¿Qué ocurre si un saque lateral entra directamente en arco propio?",
  options: [
    "Gol válido",
    "TLI",
    "Córner",
    "Repetición",
  ],
  correct: 2,
  explanation:
    "Si entra directamente en propia meta, corresponde córner.",
},

{
  id: 88,
  topic: "Balón en juego",
  question:
    "¿Qué ocurre si el ejecutor de saque lateral pisa completamente el campo?",
  options: [
    "Seguir",
    "Repetición",
    "Saque lateral rival",
    "TLI",
  ],
  correct: 2,
  explanation:
    "La ejecución incorrecta entrega saque lateral al adversario.",
},

{
  id: 89,
  topic: "Balón en juego",
  question:
    "¿Cuándo puede el arquero tomar nuevamente el balón con la mano tras soltarlo?",
  options: [
    "Nunca",
    "Después de que otro jugador lo toque",
    "Inmediatamente",
    "Solo en área chica",
  ],
  correct: 1,
  explanation:
    "Debe existir toque de otro jugador.",
},

{
  id: 90,
  topic: "Balón en juego",
  question:
    "¿Qué reanudación corresponde si el árbitro detiene el juego por lesión grave sin infracción?",
  options: [
    "TLI",
    "Penal",
    "Balón a tierra",
    "Saque lateral",
  ],
  correct: 2,
  explanation:
    "La reanudación corresponde con balón a tierra.",
},
{
  id: 91,
  topic: "Situaciones especiales",
  question:
    "¿Puede el árbitro revertir una decisión antes de reanudar el juego?",
  options: [
    "No",
    "Sí",
    "Solo con VAR",
    "Solo capitanes",
  ],
  correct: 1,
  explanation:
    "El árbitro puede modificar una decisión antes de la reanudación.",
},

{
  id: 92,
  topic: "Situaciones especiales",
  question:
    "¿Qué ocurre si un jugador suplente evita un gol ingresando al campo?",
  options: [
    "Gol válido",
    "Penal/TLD y expulsión",
    "Balón a tierra",
    "Solo amarilla",
  ],
  correct: 1,
  explanation:
    "La interferencia ilegal evitando gol implica expulsión.",
},

{
  id: 93,
  topic: "Situaciones especiales",
  question:
    "¿Puede el VAR intervenir por identidad equivocada?",
  options: [
    "Sí",
    "No",
    "Solo finales",
    "Solo roja directa",
  ],
  correct: 0,
  explanation:
    "La identidad equivocada es revisable por VAR.",
},

{
  id: 94,
  topic: "Situaciones especiales",
  question:
    "¿Qué ocurre si ambos equipos cometen infracción simultánea en penal?",
  options: [
    "Gol automático",
    "TLI",
    "Repetición",
    "Saque de meta",
  ],
  correct: 2,
  explanation:
    "Las infracciones simultáneas normalmente generan repetición.",
},

{
  id: 95,
  topic: "Situaciones especiales",
  question:
    "¿Qué ocurre si un objeto lanzado impacta el balón dentro del campo?",
  options: [
    "Seguir",
    "Detener juego y sancionar",
    "Gol automático",
    "VAR decide",
  ],
  correct: 1,
  explanation:
    "La interferencia externa debe sancionarse.",
},

{
  id: 96,
  topic: "Situaciones especiales",
  question:
    "¿Puede un jugador ejecutar un saque inicial hacia adelante y marcar?",
  options: [
    "Sí",
    "No",
    "Solo con desvío",
    "Solo VAR",
  ],
  correct: 0,
  explanation:
    "Puede marcarse directamente desde saque inicial.",
},

{
  id: 97,
  topic: "Situaciones especiales",
  question:
    "¿Qué sanción corresponde por entrada usando fuerza excesiva sin disputar balón?",
  options: [
    "Sin tarjeta",
    "Amarilla",
    "Roja",
    "TLI",
  ],
  correct: 2,
  explanation:
    "La fuerza excesiva implica expulsión.",
},

{
  id: 98,
  topic: "Situaciones especiales",
  question:
    "¿Qué ocurre si un jugador abandona deliberadamente el campo para habilitar fuera de juego?",
  options: [
    "Nada",
    "Debe considerarse sobre línea de meta",
    "Balón a tierra",
    "VAR automático",
  ],
  correct: 1,
  explanation:
    "El jugador sigue considerándose sobre línea hasta próxima detención.",
},

{
  id: 99,
  topic: "Situaciones especiales",
  question:
    "¿Qué sanción corresponde por morder a un adversario?",
  options: [
    "Amarilla",
    "Advertencia",
    "Roja",
    "TLI",
  ],
  correct: 2,
  explanation:
    "Morder constituye conducta violenta.",
},

{
  id: 100,
  topic: "Situaciones especiales",
  question:
    "¿Qué criterio define principalmente una entrada temeraria?",
  options: [
    "Ignorar el riesgo para el adversario",
    "Velocidad del balón",
    "Cantidad de jugadores",
    "Lugar del partido",
  ],
  correct: 0,
  explanation:
    "Una acción temeraria ignora el peligro o consecuencias para el rival.",
},
];