import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IUser extends Document {
  phone: string;
  username: string;
  upiId?: string;
  isActive: boolean;
  isKycVerified: boolean;
  role: 'USER' | 'SUPER_ADMIN';
  isAdmin: boolean;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  kycStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  kycType?: 'PAN' | 'AADHAAR' | null;
  kycDocumentNumber?: string | null;
  kycName?: string | null;
  depositBalance: number;
  winningsBalance: number;
  bonusBalance: number;
  referralCode?: string;
  friendsJoined?: number;
  referredBy?: string | null;
  password?: string;
  isPromoter?: boolean;
  promoMatchState?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserModel extends Model<IUser> {
  handleReferralSuccess(referrerId: string | Types.ObjectId, session?: any): Promise<void>;
}

const UserSchema = new Schema<IUser, IUserModel>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    upiId: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isKycVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['USER', 'SUPER_ADMIN'],
      default: 'USER',
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isPromoter: {
      type: Boolean,
      default: false,
    },
    promoMatchState: {
      type: Schema.Types.Mixed,
      default: {},
    },
    panNumber: {
      type: String,
      default: null,
      trim: true,
    },
    aadhaarNumber: {
      type: String,
      default: null,
      trim: true,
    },
    kycStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'NONE',
    },
    kycType: {
      type: String,
      enum: ['PAN', 'AADHAAR', null],
      default: null,
    },
    kycDocumentNumber: {
      type: String,
      default: null,
      trim: true,
    },
    kycName: {
      type: String,
      default: null,
      trim: true,
    },
    password: {
      type: String,
      default: '',
    },
    depositBalance: {
      type: Number,
      default: 0,
    },
    winningsBalance: {
      type: Number,
      default: 0,
    },
    bonusBalance: {
      type: Number,
      default: 0,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    friendsJoined: {
      type: Number,
      default: 0,
    },
    referredBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: set bonusBalance and unique uppercase referralCode for new registrations
UserSchema.pre('save', function (next) {
  if (this.isNew) {
    if (!this.bonusBalance) {
      this.bonusBalance = 10.00;
    }
    if (!this.referralCode) {
      const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.referralCode = `SEXUS${suffix}`;
    }
  }
  next();
});

// Static method: append 100.00 to referrer's bonusBalance
UserSchema.statics.handleReferralSuccess = async function (
  referrerId: string | Types.ObjectId,
  session?: any
): Promise<void> {
  const user = await this.findById(referrerId).session(session);
  if (user) {
    user.bonusBalance = Math.round(((user.bonusBalance || 0) + 100.00) * 100) / 100;
    await user.save({ session });
  }
};

export const User = model<IUser, IUserModel>('User', UserSchema);
