import { Schema, model, Document, Types } from 'mongoose';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ENTRY_FEE = 'ENTRY_FEE',
  ENTRY_FEE_DEBIT = 'ENTRY_FEE_DEBIT',
  ENTRY_FEE_REFUND = 'ENTRY_FEE_REFUND',
  WINNINGS = 'WINNINGS',
  TOURNAMENT_WIN_CREDIT = 'TOURNAMENT_WIN_CREDIT',
  PLATFORM_COMMISSION = 'PLATFORM_COMMISSION',
  REFERRAL_BONUS_CREDIT = 'REFERRAL_BONUS_CREDIT',
  REFERRAL_COMMISSION = 'REFERRAL_COMMISSION',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  amount: number; // Signed: positive for credits (DEPOSIT, WINNINGS, PLATFORM_COMMISSION), negative for debits (WITHDRAWAL, ENTRY_FEE)
  type: TransactionType;
  status: TransactionStatus;
  referenceId: string; // Unique constraint to prevent double-processing (e.g. gateway txn ID, payout ref)
  utr?: string | null; // Unique 12-digit transaction reference (sparse index)
  paymentAddress?: string | null; // User's UPI ID or Phone number for payouts/withdrawals
  rejectionReason?: string | null; // Admin-provided reason if transaction is REJECTED
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
    utr: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    paymentAddress: {
      type: String,
      default: null,
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure null/empty utr is set to undefined before saving so sparse index never receives null values
TransactionSchema.pre('save', function (next) {
  if (this.utr === null || this.utr === '' || this.utr === undefined) {
    this.utr = undefined;
  }
  next();
});

TransactionSchema.index({ userId: 1, referenceId: 1, status: 1 });

// Post-save hook to automatically synchronize User document running balances
TransactionSchema.post('save', async function (doc) {
  try {
    if (doc.status === TransactionStatus.SUCCESS) {
      const User = model('User');
      const session = doc.$session();
      let update = {};

      if (doc.type === TransactionType.DEPOSIT) {
        update = { $inc: { depositBalance: doc.amount } };
      } else if (doc.type === TransactionType.WINNINGS || doc.type === TransactionType.TOURNAMENT_WIN_CREDIT || doc.type === TransactionType.REFERRAL_COMMISSION) {
        update = { $inc: { winningsBalance: doc.amount } };
      } else if (doc.type === TransactionType.REFERRAL_BONUS_CREDIT) {
        update = { $inc: { bonusBalance: doc.amount } };
      } else if (doc.type === TransactionType.ENTRY_FEE_REFUND) {
        // Safe refunding is manually handled inside transactions, but as a fallback,
        // let's prevent auto-increments if handled elsewhere, or keep it clean.
        // We do manual updates in refundEntryFee, so we don't do automatic increments here to prevent double-increment.
      } else if (doc.type === TransactionType.PLATFORM_COMMISSION) {
        update = { $inc: { winningsBalance: doc.amount } };
      } else if (doc.type === TransactionType.ENTRY_FEE) {
        // Fallback deduction priority for general/legacy ENTRY_FEE (e.g. re-rolls, tournaments)
        const fee = Math.abs(doc.amount);
        const user = await User.findById(doc.userId).session(session);
        if (user) {
          const depositDec = Math.min(user.depositBalance || 0, fee);
          const remaining = fee - depositDec;
          user.depositBalance = Math.round((user.depositBalance - depositDec) * 100) / 100;
          user.winningsBalance = Math.round((user.winningsBalance - remaining) * 100) / 100;
          await user.save({ session });
        }
      }

      if (Object.keys(update).length > 0) {
        await User.updateOne({ _id: doc.userId }, update, { session: session || undefined });
      }
    }
  } catch (err) {
    console.error('Error in Transaction post-save balance sync hook:', err);
  }
});

export const Transaction = model<ITransaction>('Transaction', TransactionSchema);

/**
 * Retrieves current balance details directly from the User document:
 * - deposits: Remaining deposit balance
 * - winnings: Remaining winnings balance
 * - bonus: Remaining bonus balance
 * - total: Total aggregate balance (deposits + winnings + bonus)
 */
export const getUserBalances = async (
  userId: Types.ObjectId | string
): Promise<{ deposits: number; winnings: number; bonus: number; total: number }> => {
  const User = model('User');
  const user = await User.findById(userId);
  if (!user) {
    return { deposits: 0, winnings: 0, bonus: 0, total: 0 };
  }
  const deposits = user.depositBalance || 0;
  const winnings = user.winningsBalance || 0;
  const bonus = user.bonusBalance || 0;

  return {
    deposits: Math.max(0, Math.round(deposits * 100) / 100),
    winnings: Math.max(0, Math.round(winnings * 100) / 100),
    bonus: Math.max(0, Math.round(bonus * 100) / 100),
    total: Math.max(0, Math.round((deposits + winnings + bonus) * 100) / 100),
  };
};

export const syncTransactionIndexes = async (): Promise<void> => {
  try {
    const collection = model('Transaction').collection;
    const indexes = await collection.indexes();
    const utrIndex = indexes.find((idx: any) => idx.name === 'utr_1');
    if (utrIndex && !utrIndex.sparse) {
      console.log('Dropping legacy non-sparse utr_1 index from MongoDB...');
      await collection.dropIndex('utr_1');
      await model('Transaction').syncIndexes();
      console.log('Sparse utr_1 index rebuilt successfully.');
    }
  } catch (err: any) {
    // Ignore if index drop fails or collection doesn't exist yet
  }
};
