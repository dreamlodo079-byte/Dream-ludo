import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IUser extends Document {
  phone: string;
  username: string;
  upiId?: string;
  isActive: boolean;
  isKycVerified: boolean;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  kycStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  kycType?: 'PAN' | 'AADHAAR' | null;
  kycDocumentNumber?: string | null;
  kycName?: string | null;
  depositBalance: number;
  winningsBalance: number;
  bonusBalance: number;
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
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: set bonusBalance to 10.00 for new registrations
UserSchema.pre('save', function (next) {
  if (this.isNew) {
    this.bonusBalance = 10.00;
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
