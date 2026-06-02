import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function verify() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    
    // Find all chatbots
    const allBots = await db.collection('chatbots').find({}).toArray();
    console.log(`\n📋 Total chatbots: ${allBots.length}`);
    allBots.forEach(b => {
      console.log(`   ID: ${b._id}, Name: ${b.name}`);
    });
    
    // Find all products
    const products = await db.collection('products').find({}).toArray();
    console.log(`\n📋 Total products: ${products.length}`);
    
    // Group by chatbot
    const byBot = {};
    for (const p of products) {
      const botId = p.chatbotId.toString();
      if (!byBot[botId]) byBot[botId] = [];
      byBot[botId].push(p.name);
    }
    
    for (const botId in byBot) {
      const bot = allBots.find(b => b._id.toString() === botId);
      const botName = bot?.name || 'Unknown';
      console.log(`\n   Chatbot: ${botName} (${botId})`);
      console.log(`   Products (${byBot[botId].length}): ${byBot[botId].join(', ')}`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

verify();
