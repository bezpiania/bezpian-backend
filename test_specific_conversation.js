import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from './models/Conversation.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function test() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Test specific ID
    const testId = '6a1cd867e65665c08d8c8533';
    console.log(`🔍 Buscando conversación: ${testId}`);
    const conv = await Conversation.findById(testId).lean();

    if (conv) {
      console.log('\n✅ Conversación encontrada:');
      console.log(JSON.stringify(conv, null, 2).substring(0, 500));
    } else {
      console.log('\n❌ Conversación NO encontrada');
      console.log('\n✅ Conversaciones disponibles:');
      const allConvs = await Conversation.find().limit(3).lean();
      allConvs.forEach((c, i) => {
        console.log(`${i + 1}. ${c._id.toString()} - Visitante: ${c.visitorInfo?.name || 'Unknown'}`);
      });
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();
