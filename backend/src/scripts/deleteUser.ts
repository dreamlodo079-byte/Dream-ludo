import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load backend .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models/User';
import { Transaction } from '../models/Transaction';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://dreamlodo079_db_user:Eqs8oXt6XdpxRwOf@ludodev.kbv7gvv.mongodb.net/ludo_rmg?retryWrites=true&w=majority&appName=LudoDev';

async function deleteTargetUser() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully.');

  const targetPhoneSuffix = '7389927777';

  // Find users ending with 7389927777
  const users = await User.find({ phone: new RegExp(targetPhoneSuffix + '$') });
  
  if (users.length === 0) {
    console.log('No user found with phone number ending in ' + targetPhoneSuffix);
  } else {
    for (const user of users) {
      console.log(`Found user: ${user.username} (Phone: ${user.phone}, ID: ${user._id})`);
      
      // Delete user's transactions
      const deletedTxns = await Transaction.deleteMany({ userId: user._id });
      console.log(`Deleted ${deletedTxns.deletedCount} transactions for user ${user._id}.`);
      
      // Delete user
      await User.deleteOne({ _id: user._id });
      console.log(`Deleted user ${user._id} successfully.`);
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

deleteTargetUser().catch(console.error);
