/**
 * Dynamic Tiered Commission Engine
 * 
 * Entry Fee Schedule:
 * - ₹1 to ₹100      --> Platform Rake: 10.0%
 * - ₹101 to ₹500    --> Platform Rake: 8.5%
 * - ₹501 to ₹5,000  --> Platform Rake: 7.5%
 * - ₹5,001+          --> Platform Rake: 5.0%
 * - ₹0 (Practice)   --> Platform Rake: 0.0%
 */

export interface CommissionBreakdown {
  entryFee: number;
  totalPool: number;
  rakeRate: number; // percentage (e.g. 10.0, 8.5, 7.5, 5.0)
  rakeFraction: number; // fraction (e.g. 0.10, 0.085, 0.075, 0.05)
  platformFee: number; // Rounded to 2 decimals
  winnerPayout: number; // Rounded to 2 decimals
}

/**
 * Calculates platform rake rate fraction based on single-player entry fee
 */
export const calculateRakeRate = (entryFee: number): number => {
  if (entryFee <= 0) return 0;
  if (entryFee <= 100) return 0.10; // 10.0%
  if (entryFee <= 500) return 0.085; // 8.5%
  if (entryFee <= 5000) return 0.075; // 7.5%
  return 0.05; // 5.0% for ₹5,001+
};

/**
 * Recalculates platform fee and winner payout for a given entry fee
 */
export const calculateCommission = (entryFee: number): CommissionBreakdown => {
  const fee = Math.max(0, entryFee);
  const totalPool = fee * 2;
  const rakeFraction = calculateRakeRate(fee);
  const platformFee = Math.round(totalPool * rakeFraction * 100) / 100;
  const winnerPayout = Math.round((totalPool - platformFee) * 100) / 100;

  return {
    entryFee: fee,
    totalPool,
    rakeRate: Math.round(rakeFraction * 100 * 10) / 10,
    rakeFraction,
    platformFee,
    winnerPayout,
  };
};

/**
 * Validates minimum (₹1) and maximum (₹10,000) entry fee limits
 */
export const validateEntryFee = (entryFee: number): { valid: boolean; message?: string } => {
  if (entryFee === 0) return { valid: true }; // Free practice play
  if (typeof entryFee !== 'number' || isNaN(entryFee) || entryFee < 1 || entryFee > 10000) {
    return {
      valid: false,
      message: 'Entry fee must be between ₹1 and ₹10,000 (or ₹0 for practice mode).',
    };
  }
  return { valid: true };
};
