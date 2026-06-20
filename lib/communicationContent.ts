export type TriviaMode = "choice" | "true_false" | "match" | "flashcards";

export type TriviaItem = {
  id: string;
  mode: TriviaMode;
  term: string;
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  reference: string;
  difficulty: "Media" | "Avanzada";
};

export type SpanishDecisionExercise = {
  id: string;
  title: string;
  prompt: string;
  match: {
    topic?: string;
    correctRestart?: string;
    correctDiscipline?: string;
    correctFoul?: boolean;
  };
};

export const ifabGlossaryTerms = [
  "Referee",
  "Assistant Referee",
  "Fourth Official",
  "Video Assistant Referee (VAR)",
  "Assistant Video Assistant Referee (AVAR)",
  "Match Officials",
  "DOGSO",
  "SPA",
  "Play On",
  "Advantage",
  "Direct Free Kick",
  "Indirect Free Kick",
  "Penalty Kick",
  "Throw-in",
  "Goal Kick",
  "Corner Kick",
  "Dropped Ball",
  "Deliberate Handball",
  "Offside",
  "Interfering with Play",
  "Interfering with an Opponent",
  "Gaining an Advantage",
  "Careless",
  "Reckless",
  "Excessive Force",
  "Serious Foul Play",
  "Violent Conduct",
  "Caution",
  "Sending-off",
  "Yellow Card",
  "Red Card",
  "Temporary Dismissal",
  "Restart",
  "Technical Area",
  "Substitute",
  "Substituted Player",
  "Extra Time",
  "Penalties (Penalty Shoot-out)",
  "Check",
  "Silent Check",
  "On-Field Review (OFR)",
  "VAR-only Review",
  "Clear and Obvious Error",
  "Serious Missed Incident",
];

export const spanishDecisionExercises: SpanishDecisionExercise[] = [
  {
    id: "handball",
    title: "Mano sancionable",
    prompt: "Explicá la posición del brazo, el riesgo asumido, la reanudación y la sanción disciplinaria si corresponde.",
    match: { topic: "Handball", correctFoul: true },
  },
  {
    id: "penalty",
    title: "Penal",
    prompt: "Identificá la infracción, confirmá que ocurre dentro del área y comunicá decisión técnica y disciplina.",
    match: { correctRestart: "Penal", correctFoul: true },
  },
  {
    id: "no-penalty",
    title: "No penal",
    prompt: "Explicá por qué el contacto o la acción no reúne los elementos de una infracción sancionable.",
    match: { correctFoul: false },
  },
  {
    id: "offside",
    title: "Fuera de juego",
    prompt: "Indicá posición, participación activa y forma de interferencia antes de comunicar la reanudación.",
    match: { topic: "Offside" },
  },
  {
    id: "red-card",
    title: "Tarjeta roja",
    prompt: "Describí la naturaleza de la acción, el criterio de expulsión y la reanudación correspondiente.",
    match: { correctDiscipline: "Roja", correctFoul: true },
  },
];

export const triviaItems: TriviaItem[] = [
  {
    id: "dogso-definition",
    mode: "choice",
    term: "DOGSO",
    prompt: "Which expansion of DOGSO is used in the IFAB Laws of the Game?",
    options: [
      "Denying an Obvious Goal-Scoring Opportunity",
      "Delaying an Offensive Goal-Scoring Outcome",
      "Dangerous Offence in a Goal Situation",
      "Direct Offside Goal-Scoring Offence",
    ],
    answer: "Denying an Obvious Goal-Scoring Opportunity",
    explanation: "DOGSO identifies an offence that denies the opposing team a goal or an obvious goal-scoring opportunity.",
    reference: "Law 12 - Fouls and Misconduct",
    difficulty: "Media",
  },
  {
    id: "spa-definition",
    mode: "choice",
    term: "SPA",
    prompt: "What does SPA mean in disciplinary terminology?",
    options: [
      "Stopping a Promising Attack",
      "Serious Physical Assault",
      "Suspending Play Automatically",
      "Stopping a Penalty Action",
    ],
    answer: "Stopping a Promising Attack",
    explanation: "SPA refers to interfering with or stopping an attack that had promising characteristics.",
    reference: "Law 12 - Disciplinary action",
    difficulty: "Media",
  },
  {
    id: "dropped-ball-allocation",
    mode: "choice",
    term: "Dropped Ball",
    prompt: "Outside the penalty area, who receives a dropped ball when play was stopped without an offence?",
    options: [
      "One player from each team",
      "A player of the team that last touched the ball",
      "The defending goalkeeper in every case",
      "The team selected by the referee",
    ],
    answer: "A player of the team that last touched the ball",
    explanation: "Outside the penalty area, the ball is dropped for one player of the team that last touched it at the prescribed position.",
    reference: "Law 8 - The Start and Restart of Play",
    difficulty: "Avanzada",
  },
  {
    id: "var-category",
    mode: "choice",
    term: "Reviewable Category",
    prompt: "Which incident is not independently reviewable under the VAR protocol?",
    options: ["Direct red card", "Mistaken identity", "Second caution", "Penalty/no penalty"],
    answer: "Second caution",
    explanation: "The protocol covers direct red cards, not a second yellow card as an independent review category.",
    reference: "VAR Protocol 2025/26",
    difficulty: "Avanzada",
  },
  {
    id: "reckless-sanction",
    mode: "true_false",
    term: "Reckless",
    prompt: "A reckless challenge requires a caution because the player acts with disregard to the danger to, or consequences for, an opponent.",
    options: ["True", "False"],
    answer: "True",
    explanation: "Reckless is the IFAB threshold that requires a yellow card.",
    reference: "Law 12.1 - Direct free kick",
    difficulty: "Media",
  },
  {
    id: "replay-speed",
    mode: "true_false",
    term: "Normal Speed",
    prompt: "Slow motion should normally be the primary replay speed for judging the intensity of a challenge.",
    options: ["True", "False"],
    answer: "False",
    explanation: "Normal speed is generally used for intensity; slow motion is primarily used for factual points such as contact or position.",
    reference: "VAR Protocol 2025/26 - Check and Review",
    difficulty: "Avanzada",
  },
  {
    id: "sfp-match",
    mode: "match",
    term: "Serious Foul Play",
    prompt: "Match Serious Foul Play with the correct technical description.",
    options: [
      "A challenge for the ball using excessive force or endangering an opponent",
      "Any verbal disagreement with the referee",
      "A tactical foul without contact",
      "Any handball offence in the penalty area",
    ],
    answer: "A challenge for the ball using excessive force or endangering an opponent",
    explanation: "Serious foul play occurs in a challenge for the ball and is punished by a sending-off.",
    reference: "Law 12 - Sending-off offences",
    difficulty: "Avanzada",
  },
  {
    id: "ofr-match",
    mode: "match",
    term: "On-Field Review",
    prompt: "Match an OFR with the type of decision for which it is normally appropriate.",
    options: [
      "A subjective decision such as challenge intensity or offside interference",
      "A routine throw-in direction",
      "The referee's timekeeping",
      "A purely administrative substitution",
    ],
    answer: "A subjective decision such as challenge intensity or offside interference",
    explanation: "Subjective incidents are normally reviewed by the referee at the referee review area.",
    reference: "VAR Protocol 2025/26 - Review",
    difficulty: "Avanzada",
  },
  {
    id: "offside-gaining-advantage",
    mode: "flashcards",
    term: "Gaining an Advantage",
    prompt: "In offside terminology, what does gaining an advantage mean?",
    answer: "Playing a ball that rebounds or is deflected from the goalpost, crossbar, match official or opponent, or comes from a deliberate save, after being in an offside position.",
    explanation: "A deliberate save does not reset the attacker's offside position.",
    reference: "Law 11 - Offside",
    difficulty: "Avanzada",
  },
  {
    id: "temporary-dismissal",
    mode: "flashcards",
    term: "Temporary Dismissal",
    prompt: "How does the IFAB glossary define a temporary dismissal?",
    answer: "A temporary suspension from the next part of the match for a player guilty of some or all cautionable offences, when competition rules allow it.",
    explanation: "It is a competition option and does not apply automatically in every competition.",
    reference: "IFAB Glossary 2025/26",
    difficulty: "Media",
  },
];
