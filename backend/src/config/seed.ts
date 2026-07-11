import { Types } from 'mongoose';
import { User } from '../models/User';

const PLATFORM_USER_ID = '000000000000000000000000';

/**
 * Automates seeding of mandatory system platform configuration accounts.
 * Checks for user presence and safely initializes profile.
 */
export const seedPlatformDatabase = async (): Promise<void> => {
  try {
    const platformUser = await User.findById(PLATFORM_USER_ID);

    if (!platformUser) {
      console.log('System Platform Account is missing. Initializing platform profile...');
      
      const newPlatformUser = new User({
        _id: new Types.ObjectId(PLATFORM_USER_ID),
        phone: '+0000000000',
        username: 'Platform Profits',
        isActive: true,
      });

      await newPlatformUser.save();
      console.log('System Platform Account seeded successfully.');
    } else {
      console.log('System Platform Account check passed.');
    }
  } catch (error) {
    console.error('Failed to seed platform configuration accounts:', error);
  }
};
export default seedPlatformDatabase;
