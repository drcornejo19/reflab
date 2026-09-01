export const physicalTrainingPresets = {
  yoyo: { title: "Yo-Yo", preparation: 60, work: 40, rest: 20, sets: 10 },
  intermittent_40x75: {
    title: "Intermitencia 40x75",
    preparation: 60,
    work: 15,
    rest: 15,
    sets: 16,
  },
  sprint: { title: "Sprint", preparation: 45, work: 8, rest: 40, sets: 8 },
  resistance: {
    title: "Resistencia",
    preparation: 45,
    work: 45,
    rest: 20,
    sets: 8,
  },
  recovery: {
    title: "Recuperacion",
    preparation: 30,
    work: 30,
    rest: 20,
    sets: 6,
  },
  custom: {
    title: "Personalizado",
    preparation: 30,
    work: 20,
    rest: 10,
    sets: 8,
  },
} as const;

export type PhysicalTrainingPresetKey = keyof typeof physicalTrainingPresets;
