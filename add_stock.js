import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

import Product from './models/Product.js';

async function addStock() {
  try {
    await mongoose.connect(MONGO_URI);
    
    // Get all products for the chatbot
    const products = await Product.find({ 
      chatbotId: new mongoose.Types.ObjectId('6a14db26ca917cce7f5bd5ed')
    });
    
    console.log(`\n📦 Adding stock to ${products.length} products...\n`);
    
    // Define stock based on product type
    const stockMap = {
      'Recarga': 500,
      'Agua Purificada 1L': 1000,
      'Agua Purificada 5L': 500,
      'Agua Purificada 20L': 300,
      'Agua Purificada Mineral 1L': 800,
      'Agua Purificada Sin Cloro 500ml': 2000,
      'Pack Agua 12 x 500ml': 400,
      'Agua Purificada Alcalina 1L': 600
    };
    
    for (const product of products) {
      const stock = stockMap[product.name] || 500;
      product.stock = stock;
      await product.save();
      console.log(`  ✅ ${product.name}: ${stock} unidades`);
    }
    
    console.log('\n✅ Stock agregado exitosamente!');
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

addStock();
