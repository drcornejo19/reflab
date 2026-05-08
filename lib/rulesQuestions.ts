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
];