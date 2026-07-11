import { Schema, model, Document, Types } from 'mongoose';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ENTRY_FEE = 'ENTRY_FEE',
  WINNINGS = 'WINNINGS',
  PLATFORM_COMMISSION = 'PLATFORM_COMMISSION',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  amount: number; // Signed: positive for credits (DEPOSIT, WINNINGS, PLATFORM_COMMISSION), negative for debits (WITHDRAWAL, ENTRY_FEE)
  type: TransactionType;
  status: TransactionStatus;
  referenceId: string; // Unique constraint to prevent double-processing (e.g. gateway txn ID, payout ref)
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
      index: true,
    },
    referenceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ userId: 1, referenceId: 1, status: 1 });

export const Transaction = model<ITransaction>('Transaction', TransactionSchema);

/**
 * Aggregates user transactions and computes current balance details:
 * - deposits: Remaining deposits balance (DEPOSIT - spent ENTRY_FEEs)
 * - winnings: Remaining winnings balance (WINNINGS - spent WITHDRAWALs - excess ENTRY_FEEs)
 * - total: Total net withdrawable / usable balance
 */
export const getUserBalances = async (
  userId: Types.ObjectId | string
): Promise<{ deposits: number; winnings: number; total: number }> => {
  const transactions = await Transaction.find({
    userId: new Types.ObjectId(userId),
    status: TransactionStatus.SUCCESS,
  }).sort({ createdAt: 1 });

  let deposits = 0;
  let winnings = 0;

  for (const txn of transactions) {
    if (txn.type === TransactionType.DEPOSIT) {
      deposits += txn.amount; // Positive
    } else if (txn.type === TransactionType.WINNINGS) {
      winnings += txn.amount; // Positive
    } else if (txn.type === TransactionType.WITHDRAWAL) {
      winnings += txn.amount; // Negative amount
    } else if (txn.type === TransactionType.ENTRY_FEE) {
      // Deduct entry fee: deposits first, then winnings
      const fee = Math.abs(txn.amount);
      if (deposits >= fee) {
        deposits -= fee;
      } else {
        const remainingFee = fee - deposits;
        deposits = 0;
        winnings -= remainingFee;
      }
    }
  }

  // Ensure precision to 2 decimal places to avoid floating point bugs
  return {
    deposits: Math.max(0, Math.round(deposits * 100) / 100),
    winnings: Math.round(winnings * 100) / 100, // Winnings can be negative only if over-withdrawn, but math ensures boundaries
    total: Math.max(0, Math.round((deposits + winnings) * 100) / 100),
  };
};
