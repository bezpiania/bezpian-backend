import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function checkProducts() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    
    const chatbot = await db.collection('chatbots').findOne({ name: 'boter' });
    console.log('Chatbot ID:', chatbot._id);
    
    const products = await db.collection('products').find({ chatbotId: chatbot._id }).toArray();
    console.log(`Total productos: ${products.length}\n`);
    products.forEach(p => {
      console.log(`- ${p.name} (${p.sku}): $${p.price}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkProducts();
