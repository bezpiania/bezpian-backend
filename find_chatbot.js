import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function findChatbots() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const chatbots = await db.collection('chatbots').find({}).toArray();
    
    console.log('Chatbots encontrados:');
    chatbots.forEach(bot => {
      console.log(`  - ID: ${bot._id}, Name: ${bot.name}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findChatbots();
