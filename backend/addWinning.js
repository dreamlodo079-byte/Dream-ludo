const mongoose = require('mongoose');

const uri = "mongodb+srv://dreamlodo079_db_user:Eqs8oXt6XdpxRwOf@ludodev.kbv7gvv.mongodb.net/ludo_rmg?retryWrites=true&w=majority&appName=LudoDev";

async function addWinnings() {
  await mongoose.connect(uri);
  
  // Define User schema loosely to just update
  const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  // Update all users to have 1000 in wallet.winnings
  const res = await User.updateMany({}, { $inc: { "wallet.winnings": 1000 } });
  
  console.log('Updated users:', res.modifiedCount);
  await mongoose.disconnect();
}

addWinnings().catch(console.error);
