import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from './models/Conversation.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function testConversations() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Get all conversations
    const conversations = await Conversation.find().limit(5).lean();
    console.log(`📊 Total de conversaciones: ${await Conversation.countDocuments()}`);
    console.log(`✅ Primeras 5 conversaciones:\n`);

    conversations.forEach((conv, i) => {
      console.log(`${i + 1}. ID: ${conv._id}`);
      console.log(`   Visitante: ${conv.visitorInfo?.name || 'Unknown'}`);
      console.log(`   Estado: ${conv.status}`);
      console.log(`   Mensajes: ${conv.messageCount || 0}`);
      console.log();
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testConversations();
