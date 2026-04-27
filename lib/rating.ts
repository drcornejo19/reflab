export function calculateRating(avg: number, attempts: number) {
  // Base 1000, crece con promedio y volumen (suavizado)
  const volumeFactor = Math.min(attempts / 20, 1); // cap
  const rating = 1000 + avg * 5 + volumeFactor * 200;
  return Math.round(rating);
}

export function getLevelFromRating(rating: number) {
  if (rating < 1100) return { name: "Inicial", color: "text-zinc-400" };
  if (rating < 1250) return { name: "Promesa", color: "text-blue-400" };
  if (rating < 1400) return { name: "Árbitro", color: "text-green-400" };
  if (rating < 1600) return { name: "Elite", color: "text-yellow-400" };
  return { name: "FIFA", color: "text-purple-400" };
}