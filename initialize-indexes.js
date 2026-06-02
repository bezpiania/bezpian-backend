import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function initializeIndexes() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    // Ensure full-text index exists on Product collection
    console.log('🔍 Inicializando índices de búsqueda...');

    await Product.collection.createIndex({
      name: 'text',
      description: 'text',
      category: 'text',
      tags: 'text'
    }, {
      weights: {
        name: 10,
        tags: 8,
        category: 4,
        description: 1
      },
      name: 'product_text_search'
    });

    console.log('✅ Índice de búsqueda de texto creado en Products');

    // Verify index was created
    const indexes = await Product.collection.getIndexes();
    console.log('📊 Índices en Products:');
    Object.keys(indexes).forEach(indexName => {
      console.log(`   - ${indexName}`);
    });

    console.log('\n✅ Inicialización completada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

initializeIndexes();
