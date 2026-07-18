import { Schema, model, Document, Types } from 'mongoose';

export enum TournamentStatus {
  UPCOMING = 'UPCOMING',
  ACTIVE = 'ACTIVE',
  CONCLUDED = 'CONCLUDED',
}

export interface ITournamentMatch {
  matchId: string;
  playerIds: Types.ObjectId[];
  winnerId?: Types.ObjectId | null;
  status: 'PENDING' | 'ACTIVE' | 'CONCLUDED';
}

export interface ITournamentRound {
  roundNumber: number;
  playerIds: Types.ObjectId[];
  matches: ITournamentMatch[];
}

export interface ITournamentRanking {
  userId: Types.ObjectId;
  rank: number;
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
  currentRound: number;
  rounds: ITournamentRound[];
  rankings: ITournamentRanking[];
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
    currentRound: {
      type: Number,
      default: 0,
    },
    rounds: [
      {
        roundNumber: Number,
        playerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        matches: [
          {
            matchId: String,
            playerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
            winnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
            status: {
              type: String,
              enum: ['PENDING', 'ACTIVE', 'CONCLUDED'],
              default: 'PENDING',
            },
          },
        ],
      },
    ],
    rankings: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        rank: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Tournament = model<ITournament>('Tournament', TournamentSchema);
