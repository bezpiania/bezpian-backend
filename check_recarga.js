import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  
  const recarga = await db.collection('products').findOne({ name: 'Recarga' });
  console.log('Producto Recarga:');
  console.log('- chatbotId:', recarga?.chatbotId);
  console.log('- nombre:', recarga?.name);
  
  const boter = await db.collection('chatbots').findOne({ name: 'boter' });
  console.log('\nChatbot boter ID:', boter._id);
  console.log('¿Son iguales?:', recarga?.chatbotId.toString() === boter._id.toString());
  
  process.exit(0);
}

check();
