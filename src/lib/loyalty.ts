export function calculateLoyaltyPoints(orderTotal: number): number {
  return Math.floor(orderTotal); // $1 = 1 point
}

export function getLoyaltyTier(points: number): { name: string; discount: number } {
  if (points >= 5000) return { name: 'Platinum', discount: 0.15 };
  if (points >= 2000) return { name: 'Gold', discount: 0.10 };
  if (points >= 500) return { name: 'Silver', discount: 0.05 };
  return { name: 'Bronze', discount: 0 };
}
