import { Schema, model, Document } from 'mongoose';

export interface IPlatformConfig extends Document {
  key: string;
  platformUpiId: string;
  platformQrUrl?: string;
  updatedAt: Date;
}

const PlatformConfigSchema = new Schema<IPlatformConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'main_config',
    },
    platformUpiId: {
      type: String,
      required: true,
      default: '6261069826-2.wallet@phonepe',
      trim: true,
    },
    platformQrUrl: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const PlatformConfig = model<IPlatformConfig>('PlatformConfig', PlatformConfigSchema);

export const getOrCreatePlatformConfig = async (): Promise<IPlatformConfig> => {
  let config = await PlatformConfig.findOne({ key: 'main_config' });
  if (!config) {
    config = new PlatformConfig({
      key: 'main_config',
      platformUpiId: '6261069826-2.wallet@phonepe',
      platformQrUrl: '',
    });
    await config.save();
  } else if (config.platformUpiId === 'dreamludoplatform@bank') {
    config.platformUpiId = '6261069826-2.wallet@phonepe';
    await config.save();
  }
  return config;
};
