import { football11Content } from "@/lib/sports-content/football11";
import { futsalContent } from "@/lib/sports-content/futsal";

export const sportContentRegistry = {
  football_11: football11Content,
  futsal: futsalContent,
} as const;

export type SportType = keyof typeof sportContentRegistry;
