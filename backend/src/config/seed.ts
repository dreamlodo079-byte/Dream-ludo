import { Types } from 'mongoose';
import { User } from '../models/User';
import { Tournament, TournamentStatus } from '../models/Tournament';

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
    const activeTournament = await Tournament.findOne({ status: TournamentStatus.UPCOMING });
    if (!activeTournament) {
      console.log('No active tournaments found. Seeding Sexus Blast tournament...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const newTournament = new Tournament({
        title: 'Sexus Blast',
        totalPrizePool: 70000,
        entryFee: 10,
        maxEntries: 10000,
        registeredCount: 169,
        endsAt: tomorrow,
        status: TournamentStatus.UPCOMING,
      });
      await newTournament.save();
      console.log('Seeded Sexus Blast tournament successfully.');
    }
  } catch (error) {
    console.error('Failed to seed platform configuration accounts:', error);
  }
};
export default seedPlatformDatabase;
