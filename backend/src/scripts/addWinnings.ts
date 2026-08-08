import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load backend .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models/User';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://dreamlodo079_db_user:Eqs8oXt6XdpxRwOf@ludodev.kbv7gvv.mongodb.net/ludo_rmg?retryWrites=true&w=majority&appName=LudoDev';

async function addWinnings() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully.');

  const targetPhoneSuffix = '7389927777';

  // Find users ending with 7389927777
  const users = await User.find({ phone: new RegExp(targetPhoneSuffix) });
  
  if (users.length === 0) {
    console.log('No user found with phone number containing ' + targetPhoneSuffix);
    console.log('Fetching all users in the database to see what numbers exist...');
    const allUsers = await User.find({}).limit(5);
    allUsers.forEach(u => console.log(`Found in DB: ${u.username} - Phone: ${u.phone}`));
  } else {
    for (const user of users) {
      user.winningsBalance = (user.winningsBalance || 0) + 1000;
      await user.save();
      console.log(`Successfully added ₹1000 Winnings Balance to user ${user.username} (Phone: ${user.phone}).`);
      console.log(`New Winnings Balance: ₹${user.winningsBalance}`);
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

addWinnings().catch(console.error);
