import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function checkEmbeddings() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    
    // Get products for the chatbot
    const products = await db.collection('products')
      .find({ chatbotId: new mongoose.Types.ObjectId('6a14db26ca917cce7f5bd5ed') })
      .toArray();
    
    console.log(`\n📦 Total productos: ${products.length}`);
    console.log('\nEmbed Status:');
    products.forEach(p => {
      const hasEmbed = p.embedding ? '✅' : '❌';
      console.log(`  ${hasEmbed} ${p.name} (${p.sku})`);
    });
    
    const withEmbeds = products.filter(p => p.embedding).length;
    const withoutEmbeds = products.length - withEmbeds;
    console.log(`\n${withEmbeds} con embeddings, ${withoutEmbeds} sin embeddings`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkEmbeddings();
