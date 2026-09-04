export function calculateSavings(quantity: number, currentPrice: number, proposedPrice: number) {
  const unitSavings = currentPrice - proposedPrice;
  const totalSavings = unitSavings * quantity;

  return {
    unitSavings,
    totalSavings: Number(totalSavings.toFixed(2)),
  };
}
