import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function generateEmbeddings() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    
    // Get the chatbot and its OpenAI API key
    const chatbot = await db.collection('chatbots')
      .findOne({ _id: new mongoose.Types.ObjectId('6a14db26ca917cce7f5bd5ed') });
    
    if (!chatbot || !chatbot.openaiApiKey) {
      console.error('❌ Chatbot no tiene API key de OpenAI configurada');
      process.exit(1);
    }
    
    console.log(`✅ Usando API key del chatbot: ${chatbot.name}`);
    
    const client = new OpenAI({ apiKey: chatbot.openaiApiKey });
    
    // Get products without embeddings
    const products = await db.collection('products')
      .find({ 
        chatbotId: chatbot._id,
        embedding: { $exists: false }
      })
      .toArray();
    
    console.log(`\n🔄 Generating embeddings for ${products.length} products...`);
    
    // Generate embeddings for each product
    for (const product of products) {
      // Create text representation of product
      const text = `${product.name}. ${product.description || ''}. Precio: $${product.price} CLP. Categoría: ${product.category || 'General'}`;
      
      try {
        const response = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: text
        });
        
        const embedding = response.data[0].embedding;
        
        // Update product with embedding
        await db.collection('products').updateOne(
          { _id: product._id },
          { $set: { embedding: embedding } }
        );
        
        console.log(`  ✅ ${product.name}`);
      } catch (error) {
        console.error(`  ❌ ${product.name}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Embeddings generated!');
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

generateEmbeddings();
