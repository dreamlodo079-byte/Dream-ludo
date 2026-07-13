import { Schema, model, Document } from 'mongoose';

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
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
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
  },
  {
    timestamps: true,
  }
);

export const User = model<IUser>('User', UserSchema);
