import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'DEPOSIT_SUCCESS'
  | 'DEPOSIT_REJECTED'
  | 'WITHDRAWAL_SUCCESS'
  | 'WITHDRAWAL_REJECTED'
  | 'GENERAL';

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT_SUCCESS', 'DEPOSIT_REJECTED', 'WITHDRAWAL_SUCCESS', 'WITHDRAWAL_REJECTED', 'GENERAL'],
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', NotificationSchema);
