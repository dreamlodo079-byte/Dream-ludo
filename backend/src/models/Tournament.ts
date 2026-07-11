import { Schema, model, Document, Types } from 'mongoose';

export enum TournamentStatus {
  UPCOMING = 'UPCOMING',
  ACTIVE = 'ACTIVE',
  CONCLUDED = 'CONCLUDED',
}

export interface ITournament extends Document {
  title: string;
  totalPrizePool: number;
  entryFee: number;
  maxEntries: number;
  registeredCount: number;
  registeredUsers: Types.ObjectId[];
  endsAt: Date;
  status: TournamentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const TournamentSchema = new Schema<ITournament>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    totalPrizePool: {
      type: Number,
      required: true,
    },
    entryFee: {
      type: Number,
      required: true,
    },
    maxEntries: {
      type: Number,
      required: true,
    },
    registeredCount: {
      type: Number,
      default: 0,
    },
    registeredUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    endsAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TournamentStatus),
      default: TournamentStatus.UPCOMING,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Tournament = model<ITournament>('Tournament', TournamentSchema);
