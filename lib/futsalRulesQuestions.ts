import { withQuestionDefaults, type RuleQuestion } from "./questionBank.ts";

const FUTSAL_SOURCE_URL =
  "https://digitalhub.fifa.com/m/7b1da24ec7a25f67/original/Futsal-Laws-of-the-Game-2024-2025.pdf";
const FUTSAL_SOURCE_VERSION = "Futsal Laws of the Game 2024-25";

type FutsalSeedQuestion = Omit<
  RuleQuestion,
  | "sport_type"
  | "question_mode"
  | "season"
  | "language"
  | "source_official"
  | "source_version"
  | "governing_body"
  | "rule_reference"
>;

const futsalSeedQuestions: FutsalSeedQuestion[] = [
  {
    id: "futsal-q1",
    topic: "Law 15",
    subtopic: "Kick-in",
    lawReference: "Ley 15",
    difficulty: "Basica",
    question:
      "El balon sale por la linea de banda y el equipo ejecutor ya esta listo para reanudar. Cuanto tiempo tiene para ponerlo en juego en un saque de banda?",
    options: [
      "4 segundos",
      "5 segundos",
      "6 segundos",
      "8 segundos",
    ],
    correct: 0,
    explanation:
      "En futsal, el kick-in debe ejecutarse dentro de los cuatro segundos desde que el equipo esta listo para reanudar.",
    officialExplanation:
      "La Ley 15 dispone que el balon debe ponerse en juego dentro de los cuatro segundos desde que el equipo esta listo para ejecutarlo o el arbitro senala que puede hacerlo.",
    normative_reference: "Law 15 - Procedure",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["kick_in", "four_seconds"],
  },
  {
    id: "futsal-q2",
    topic: "Law 12",
    subtopic: "Goalkeeper",
    lawReference: "Ley 12",
    difficulty: "Media",
    question:
      "El guardameta controla el balon con el pie en su propia mitad durante mas de cuatro segundos sin presion. Cual es la decision?",
    options: [
      "Seguir el juego",
      "Tiro libre indirecto para los adversarios",
      "Tiro libre directo para los adversarios",
      "Balon a tierra",
    ],
    correct: 1,
    explanation:
      "El exceso del limite temporal del guardameta en su propia mitad se sanciona con tiro libre indirecto.",
    officialExplanation:
      "La Ley 12 sanciona con tiro libre indirecto al guardameta que controla el balon con manos, brazos o pies en su propia mitad durante mas de cuatro segundos.",
    normative_reference: "Law 12 - Indirect free kick",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["goalkeeper", "four_seconds"],
  },
  {
    id: "futsal-q3",
    topic: "Law 12",
    subtopic: "Back-pass to goalkeeper",
    lawReference: "Ley 12",
    difficulty: "Avanzada",
    question:
      "El guardameta ya jugo el balon con posesion controlada. Luego un companero se lo devuelve deliberadamente en propia mitad sin toque rival y el guardameta vuelve a jugarlo alli. Que corresponde?",
    options: [
      "Seguir el juego porque uso los pies",
      "Tiro libre indirecto y sin sancion disciplinaria",
      "Tiro libre directo y amarilla",
      "Penal",
    ],
    correct: 1,
    explanation:
      "La segunda recepcion en propia mitad tras pase deliberado de un companero, sin toque rival, es infraccion tecnica del guardameta.",
    officialExplanation:
      "La Ley 12 dispone tiro libre indirecto cuando, tras jugar el balon con posesion controlada, el guardameta lo toca de nuevo en su propia mitad despues de un pase deliberado de un companero sin toque rival.",
    normative_reference: "Law 12 - Indirect free kick",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["goalkeeper", "second_touch"],
  },
  {
    id: "futsal-q4",
    topic: "Law 12",
    subtopic: "Back-pass to goalkeeper",
    lawReference: "Ley 12",
    difficulty: "Media",
    question:
      "Un companero patea deliberadamente el balon al guardameta dentro de su propia area, incluso desde un saque de banda, y este lo toma con las manos. Cual es la reanudacion?",
    options: [
      "Seguir el juego",
      "Tiro libre indirecto para el rival",
      "Tiro libre directo para el rival",
      "Penal",
    ],
    correct: 1,
    explanation:
      "La cesion deliberada al guardameta dentro de su area no le permite usar las manos.",
    officialExplanation:
      "La Ley 12 sanciona con tiro libre indirecto si el guardameta toca con las manos o brazos el balon en su propia area tras un pase deliberado de un companero, incluso desde un kick-in.",
    normative_reference: "Law 12 - Indirect free kick",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["goalkeeper", "back_pass"],
  },
  {
    id: "futsal-q5",
    topic: "Law 15",
    subtopic: "Kick-in",
    lawReference: "Ley 15",
    difficulty: "Media",
    question:
      "Se ejecuta un saque de banda y el balon entra directamente en la porteria adversaria sin tocar a nadie. Como se reanuda?",
    options: [
      "Gol valido",
      "Tiro libre indirecto para el rival",
      "Saque de meta para el rival",
      "Balon a tierra",
    ],
    correct: 2,
    explanation:
      "En futsal no se puede marcar gol directamente desde un kick-in al arco contrario.",
    officialExplanation:
      "La Ley 15 indica que no puede marcarse gol directo desde un kick-in; si entra en la meta adversaria, corresponde saque de meta.",
    normative_reference: "Law 15",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["restart", "kick_in"],
  },
  {
    id: "futsal-q6",
    topic: "Law 15",
    subtopic: "Kick-in",
    lawReference: "Ley 15",
    difficulty: "Media",
    question:
      "El ejecutor demora mas de cuatro segundos en poner el balon en juego desde un saque de banda. Que corresponde?",
    options: [
      "Se repite el saque de banda",
      "Saque de banda para el equipo adversario",
      "Tiro libre indirecto para el rival",
      "Advertencia sin cambiar la posesion",
    ],
    correct: 1,
    explanation:
      "La demora de cuatro segundos en el kick-in provoca la perdida de la reanudacion.",
    officialExplanation:
      "La Ley 15 establece que, ante otras infracciones del kick-in, incluida la demora superior a cuatro segundos, el saque de banda pasa al equipo adversario.",
    normative_reference: "Law 15 - Offences and sanctions",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["restart", "four_seconds", "kick_in"],
  },
  {
    id: "futsal-q7",
    topic: "Law 8",
    subtopic: "Dropped ball",
    lawReference: "Ley 8",
    difficulty: "Avanzada",
    question:
      "Los arbitros detienen el juego cuando el balon estaba en el area defensiva y el ultimo toque habia sido de un atacante. Donde se ejecuta el balon a tierra?",
    options: [
      "Para un defensor dentro del area",
      "Para un atacante sobre la linea del area, en el punto mas cercano",
      "En el centro de la pista",
      "Con tiro libre indirecto para la defensa",
    ],
    correct: 1,
    explanation:
      "Si la ultima posesion atacante estaba en el area defensiva rival, el balon a tierra se traslada a la linea del area en el punto mas cercano.",
    officialExplanation:
      "La Ley 8 ordena que, si la ultima tocada fue del equipo atacante en el area defensiva rival, el balon se deje caer para un atacante sobre la linea del area en el punto mas cercano.",
    normative_reference: "Law 8 - Dropped ball",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["dropped_ball", "restart"],
  },
  {
    id: "futsal-q8",
    topic: "Law 3",
    subtopic: "Substitution procedure",
    lawReference: "Ley 3",
    difficulty: "Avanzada",
    question:
      "Un sustituto entra por su zona antes de que el jugador reemplazado haya salido completamente. Si los arbitros detienen el juego por esa infraccion, cual es la combinacion correcta?",
    options: [
      "Amonestacion al sustituto e indirecto para el rival",
      "Advertencia verbal y saque de banda",
      "Roja al sustituto y penal",
      "Solo se repite la sustitucion",
    ],
    correct: 0,
    explanation:
      "La entrada anticipada vulnera el procedimiento de sustitucion; el sustituto debe ser amonestado y la reanudacion es indirecta si el juego se detuvo por ello.",
    officialExplanation:
      "La Ley 3 dispone que, si el sustituto entra antes de que salga el reemplazado o por lugar indebido, se le amonesta y, si se detuvo el juego, se reanuda con tiro libre indirecto al adversario.",
    normative_reference: "Law 3 - Offences and sanctions",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["substitution", "discipline", "restart"],
  },
  {
    id: "futsal-q9",
    topic: "Law 13",
    subtopic: "Accumulated fouls",
    lawReference: "Ley 13",
    difficulty: "Avanzada",
    question:
      "Con cinco faltas acumuladas previas en el periodo, un equipo comete otra falta sancionable con tiro libre directo fuera del area. Que cambia en la reanudacion?",
    options: [
      "Nada: se ejecuta como cualquier tiro libre directo con barrera",
      "Corresponde DFKSAF y la defensa no puede formar barrera",
      "Siempre corresponde penal",
      "Se concede balon a tierra",
    ],
    correct: 1,
    explanation:
      "Desde la sexta falta acumulada de cada periodo se aplica el procedimiento especial de DFKSAF y no hay barrera defensiva.",
    officialExplanation:
      "La Ley 13 establece un tiro libre directo especial desde la sexta falta acumulada y prohbe a los defensores formar barrera.",
    normative_reference: "Law 13 - DFKSAF",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["accumulated_fouls", "restart"],
  },
  {
    id: "futsal-q10",
    topic: "Law 13",
    subtopic: "Accumulated fouls",
    lawReference: "Ley 13",
    difficulty: "Avanzada",
    question:
      "La sexta falta acumulada del periodo se comete dentro del area del equipo infractor. Cual es la reanudacion correcta?",
    options: [
      "DFKSAF desde 10 metros",
      "DFKSAF desde el punto de la falta",
      "Penal",
      "Tiro libre indirecto",
    ],
    correct: 2,
    explanation:
      "Cuando la sexta o posterior falta acumulada ocurre dentro del area del infractor, la reanudacion deja de ser DFKSAF y pasa a penal.",
    officialExplanation:
      "La Ley 13 aclara que si la sexta o posterior falta acumulada se comete dentro del area del infractor, se concede penal.",
    normative_reference: "Law 13 - DFKSAF",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["accumulated_fouls", "penalty"],
  },
  {
    id: "futsal-q11",
    topic: "Law 13",
    subtopic: "Advantage",
    lawReference: "Ley 13",
    difficulty: "Avanzada",
    question:
      "Se produce una infraccion de tiro libre directo y los arbitros valoran ventaja. En que contexto puede aplicarse sin perder el registro de falta acumulada?",
    options: [
      "Siempre, sin condiciones",
      "Solo si el equipo infractor aun no llego a cinco acumuladas y no se priva al rival de gol u ocasion manifiesta",
      "Nunca en faltas acumuladas",
      "Solo en la segunda mitad",
    ],
    correct: 1,
    explanation:
      "La ventaja en faltas acumulables tiene limites: no debe haberse llegado a cinco acumuladas previas y tampoco puede negarse gol u ocasion manifiesta.",
    officialExplanation:
      "La Ley 13 permite ventaja en una falta acumulable si el equipo infractor no habia cometido previamente cinco y el rival no es privado de gol u ocasion manifiesta; luego debe informarse la acumulada al tiempo muerto oficial cuando el balon salga.",
    normative_reference: "Law 13 - Accumulated fouls",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["advantage", "accumulated_fouls"],
  },
  {
    id: "futsal-q12",
    topic: "Law 16",
    subtopic: "Goal clearance",
    lawReference: "Ley 16",
    difficulty: "Media",
    question:
      "El guardameta demora mas de cuatro segundos en ejecutar el saque de meta cuando su equipo ya estaba listo para reanudar. Que corresponde?",
    options: [
      "Se repite el saque de meta",
      "Tiro libre indirecto para el rival",
      "Saque de esquina para el rival",
      "Solo advertencia",
    ],
    correct: 1,
    explanation:
      "El limite de cuatro segundos tambien rige para el goal clearance cuando el equipo esta listo o el arbitro lo indica.",
    officialExplanation:
      "La Ley 16 sanciona con tiro libre indirecto la demora superior a cuatro segundos en el goal clearance.",
    normative_reference: "Law 16 - Offences and sanctions",
    reviewed_at: "2026-07-10T00:00:00.000Z",
    criterion_tags: ["goal_clearance", "four_seconds", "restart"],
  },
];

function toMode(mode: "practice" | "exam") {
  return futsalSeedQuestions.map((question) =>
    withQuestionDefaults(
      {
        ...question,
      },
      {
        sport_type: "futsal",
        question_mode: mode,
        season: "2024-25",
        language: "es",
        source_official: FUTSAL_SOURCE_URL,
        source_version: FUTSAL_SOURCE_VERSION,
        governing_body: "FIFA",
      }
    )
  );
}

export const futsalRulesPracticeQuestions = toMode("practice");
export const futsalRulesExamQuestions = toMode("exam");
