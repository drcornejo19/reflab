export type RankingRow = {
  position: number;
  displayName: string;
  refCardId: string;
  averageScore: number;
  bestScore: number;
  evaluations: number;
  lastEvaluationAt: string;
  isCurrentUser: boolean;
};

export type RankingResponse = {
  rows: RankingRow[];
  selfPosition: RankingRow | null;
};
