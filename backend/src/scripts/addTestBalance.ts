import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models/User';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dream_ludo_rmg';

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const phoneQuery = { $regex: '7389927777' };
    const users = await User.find({ phone: phoneQuery });

    if (users.length === 0) {
      console.log('No user found matching phone 7389927777. Creating test profile...');
      const newUser = new User({
        username: 'AdminTest',
        phone: '7389927777',
        winningsBalance: 10000,
        depositBalance: 10000,
        bonusBalance: 500,
        role: 'SUPER_ADMIN',
        isAdmin: true,
      });
      await newUser.save();
      console.log('Created user with ₹10,000 Winnings & ₹10,000 Deposit Balance!');
    } else {
      for (const u of users) {
        u.winningsBalance = (u.winningsBalance || 0) + 10000;
        u.depositBalance = (u.depositBalance || 0) + 10000;
        u.role = 'SUPER_ADMIN';
        u.isAdmin = true;
        await u.save();
        console.log(`Updated user ${u.username} (${u.phone}): New Winnings = ₹${u.winningsBalance}, Deposit = ₹${u.depositBalance}`);
      }
    }
  } catch (err) {
    console.error('Error adding test balance:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
