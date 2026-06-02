import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function testSearch() {
  try {
    await mongoose.connect(MONGO_URI);
    
    const chatbotId = new mongoose.Types.ObjectId('6a14db26ca917cce7f5bd5ed');
    
    // Test 1: Vector search (requires embeddings)
    console.log('\n🔍 Test 1: Vector Search (con embeddings)');
    const searchRegex = /alcalina|1l/i;
    const keywordResults = await Product.find({
      chatbotId,
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ]
    }).select('name description price stock embedding');
    
    console.log(`Found by keyword: ${keywordResults.length} products`);
    keywordResults.forEach(p => {
      console.log(`  - ${p.name} (stock: ${p.stock}, embedding: ${p.embedding ? '✅' : '❌'})`);
    });
    
    // Test 2: Check all products
    console.log('\n🔍 Test 2: All products');
    const allProducts = await Product.find({ chatbotId }).select('name stock');
    console.log(`Total products: ${allProducts.length}`);
    allProducts.forEach(p => console.log(`  - ${p.name} (stock: ${p.stock})`));
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

testSearch();
