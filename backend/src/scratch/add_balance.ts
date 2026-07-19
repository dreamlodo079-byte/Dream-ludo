import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sexus_rmg';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const phone = '9405107842';
  const user = await User.findOne({ phone });

  if (!user) {
    console.error(`User with phone number ${phone} not found!`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found user: ${user.username} (ID: ${user._id})`);
  console.log(`Current Balances -> Deposit: ₹${user.depositBalance}, Winnings: ₹${user.winningsBalance}`);

  // Add ₹5000 deposit and ₹5000 winnings
  user.depositBalance += 5000;
  user.winningsBalance += 5000;

  await user.save();

  console.log(`Updated Balances -> Deposit: ₹${user.depositBalance}, Winnings: ₹${user.winningsBalance}`);
  console.log('Balance added successfully!');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error running script:', err);
  mongoose.disconnect();
});
