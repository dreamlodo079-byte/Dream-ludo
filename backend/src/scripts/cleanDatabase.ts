import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load backend .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Match } from '../models/Match';
import { Notification } from '../models/Notification';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://dreamlodo079_db_user:Eqs8oXt6XdpxRwOf@ludodev.kbv7gvv.mongodb.net/ludo_rmg?retryWrites=true&w=majority&appName=LudoDev';
const PLATFORM_USER_ID = '000000000000000000000000';

async function cleanProductionDatabase() {
  console.log('Connecting to MongoDB Atlas database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully.');

  console.log('\n--- Starting Production Database Cleanup ---');

  // 1. Delete ALL users (except the Platform Profits system account)
  const deletedTesters = await User.deleteMany({
    _id: { $ne: PLATFORM_USER_ID }
  });
  console.log(`✓ Deleted ${deletedTesters.deletedCount} user accounts for a completely fresh start.`);

  // 2. Wipe all historical test transactions
  const deletedTxns = await Transaction.deleteMany({});
  console.log(`✓ Wiped ${deletedTxns.deletedCount} historical test transaction records.`);

  // 3. Wipe all historical test matches
  const deletedMatches = await Match.deleteMany({});
  console.log(`✓ Wiped ${deletedMatches.deletedCount} historical test matches.`);

  // 4. Wipe all test notifications
  const deletedNotifs = await Notification.deleteMany({});
  console.log(`✓ Wiped ${deletedNotifs.deletedCount} test notifications.`);

  // 5. Reset Platform Profits System Account to 0 balance
  let platformUser = await User.findById(PLATFORM_USER_ID);
  if (platformUser) {
    platformUser.walletBalance = 0;
    platformUser.depositBalance = 0;
    platformUser.winningsBalance = 0;
    await platformUser.save();
    console.log('✓ Reset "Platform Profits" system account balance cleanly to ₹0.00.');
  } else {
    platformUser = new User({
      _id: new mongoose.Types.ObjectId(PLATFORM_USER_ID),
      phone: '+0000000000',
      username: 'Platform Profits',
      walletBalance: 0,
      depositBalance: 0,
      winningsBalance: 0,
      isActive: true,
    });
    await platformUser.save();
    console.log('✓ Created fresh "Platform Profits" system account with ₹0.00 balance.');
  }

  // 6. Reset all remaining user balances (if any test users exist)
  const remainingUsers = await User.find({ _id: { $ne: PLATFORM_USER_ID } });
  for (const u of remainingUsers) {
    u.walletBalance = 0;
    u.depositBalance = 0;
    u.winningsBalance = 0;
    await u.save();
  }
  console.log(`✓ Reset balances for ${remainingUsers.length} registered user profiles.`);

  console.log('\n✅ DATABASE CLEANUP COMPLETE! Production database is now 100% fresh.');
  await mongoose.disconnect();
  process.exit(0);
}

cleanProductionDatabase().catch((err) => {
  console.error('Database cleanup error:', err);
  process.exit(1);
});
