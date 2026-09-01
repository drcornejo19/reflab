import { football11Content } from "./football11/index.ts";
import { futsalContent } from "./futsal/index.ts";

export const sportContentRegistry = {
  football_11: football11Content,
  futsal: futsalContent,
} as const;

export type SportType = keyof typeof sportContentRegistry;
