import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dream_ludo_rmg';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB!');

  const phoneInput = '7389927777';
  const normalizedPhone = phoneInput.trim().slice(-10);

  // Search for user matching phone number
  const user = await User.findOne({
    $or: [{ phone: phoneInput }, { phone: normalizedPhone }, { phone: `+91${normalizedPhone}` }]
  });

  if (!user) {
    console.error(`User with phone number ${phoneInput} not found!`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found User: ${user.username} | Phone: ${user.phone} | ID: ${user._id}`);
  console.log(`Initial Balances -> Deposit: ₹${user.depositBalance || 0}, Winnings: ₹${user.winningsBalance || 0}, Bonus: ₹${user.bonusBalance || 0}`);

  // Credit ₹1000 Winnings Balance
  user.winningsBalance = (user.winningsBalance || 0) + 1000;

  await user.save();

  console.log(`Updated Balances -> Deposit: ₹${user.depositBalance || 0}, Winnings: ₹${user.winningsBalance || 0}, Bonus: ₹${user.bonusBalance || 0}`);
  console.log(`SUCCESSFULLY ADDED ₹1000 WINNINGS BALANCE TO ${user.username} (${user.phone})!`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error executing script:', err);
  mongoose.disconnect();
});
