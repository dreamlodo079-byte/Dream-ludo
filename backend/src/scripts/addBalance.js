const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dream_ludo_rmg';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB Atlas');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');

    const res = await User.updateMany(
      { phone: { $regex: '7389927777' } },
      { 
        $set: { 
          winningsBalance: 10000, 
          depositBalance: 10000, 
          bonusBalance: 500, 
          role: 'SUPER_ADMIN', 
          isAdmin: true 
        } 
      }
    );

    console.log('Update result:', res);
    const users = await User.find({ phone: { $regex: '7389927777' } });
    console.log('Updated User Profile(s):', users.map(u => ({ username: u.username, phone: u.phone, winnings: u.winningsBalance, deposit: u.depositBalance })));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
