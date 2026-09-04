export function compareQuotes(quotes: Array<{ supplier: string; price: number; currency?: string }>) {
  const sorted = [...quotes].sort((a, b) => a.price - b.price);
  const winner = sorted[0]?.supplier ?? "";
  const highest = sorted[sorted.length - 1]?.price ?? 0;
  const winnerPrice = sorted[0]?.price ?? 0;

  return {
    winner,
    winnerPrice,
    savingsVsHighest: Number((highest - winnerPrice).toFixed(2)),
    ranked: sorted,
  };
}
