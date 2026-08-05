import { Schema, model, Document, Types } from 'mongoose';

export enum MatchStatus {
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface IMatch extends Document {
  matchId: string;
  creatorId: Types.ObjectId;
  joinerId?: Types.ObjectId | null;
  entryFee: number;
  platformFee: number;
  winnerPayout: number;
  status: MatchStatus;
  winnerId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const MatchSchema = new Schema<IMatch>(
  {
    matchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    joinerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    entryFee: {
      type: Number,
      required: true,
      min: 0,
      max: 50000,
    },
    platformFee: {
      type: Number,
      required: true,
      min: 0,
    },
    winnerPayout: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(MatchStatus),
      default: MatchStatus.WAITING,
      index: true,
    },
    winnerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

MatchSchema.index({ creatorId: 1, status: 1 });

export const Match = model<IMatch>('Match', MatchSchema);
