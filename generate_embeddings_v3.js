import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

// Import the real Chatbot and Product models
import Chatbot from './models/Chatbot.js';
import Product from './models/Product.js';

async function generateEmbeddings() {
  try {
    await mongoose.connect(MONGO_URI);
    
    // Get the chatbot using Mongoose (applies decryption via getters)
    const chatbot = await Chatbot.findById('6a14db26ca917cce7f5bd5ed');
    
    if (!chatbot || !chatbot.openaiApiKey) {
      console.error('❌ Chatbot no tiene API key de OpenAI');
      process.exit(1);
    }
    
    console.log(`✅ Chatbot: ${chatbot.name}`);
    console.log(`✅ API Key presente: ${chatbot.openaiApiKey.substring(0, 10)}...`);
    
    const client = new OpenAI({ apiKey: chatbot.openaiApiKey });
    
    // Get products without embeddings
    const products = await Product.find({ 
      chatbotId: chatbot._id,
      embedding: { $exists: false }
    });
    
    console.log(`\n🔄 Generating embeddings for ${products.length} products...`);
    
    // Generate embeddings
    for (const product of products) {
      const text = `${product.name}. ${product.description || ''}. Precio: $${product.price} CLP. Categoría: ${product.category || 'General'}`;
      
      try {
        const response = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: text
        });
        
        const embedding = response.data[0].embedding;
        
        product.embedding = embedding;
        await product.save();
        
        console.log(`  ✅ ${product.name}`);
      } catch (error) {
        console.error(`  ❌ ${product.name}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Embeddings generated successfully!');
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

generateEmbeddings();
