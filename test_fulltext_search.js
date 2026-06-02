import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function testSearch() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    const chatbotId = new mongoose.Types.ObjectId('6a14db26ca917cce7f5bd5ed');

    // Test 1: Buscar sin caracteres especiales
    console.log('🔎 Test 1: Búsqueda "Agua Purificada"');
    const result1 = await Product.find(
      { chatbotId, $text: { $search: 'Agua Purificada' } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(3).lean();
    console.log(`✅ Encontrados: ${result1.length} productos`);
    result1.forEach(p => console.log(`   - ${p.name} (stock: ${p.stock})`));

    // Test 2: Búsqueda con caracteres especiales (mismo producto)
    console.log('\n🔎 Test 2: Búsqueda "Agua Purificada Alcalina 1L"');
    const result2 = await Product.find(
      { chatbotId, $text: { $search: 'Agua Purificada Alcalina 1L' } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(3).lean();
    console.log(`✅ Encontrados: ${result2.length} productos`);
    result2.forEach(p => console.log(`   - ${p.name} (stock: ${p.stock})`));

    // Test 3: Búsqueda parcial
    console.log('\n🔎 Test 3: Búsqueda "alcalina"');
    const result3 = await Product.find(
      { chatbotId, $text: { $search: 'alcalina' } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(3).lean();
    console.log(`✅ Encontrados: ${result3.length} productos`);
    result3.forEach(p => console.log(`   - ${p.name} (stock: ${p.stock})`));

    // Test 4: Ver todos los productos
    console.log('\n🔎 Test 4: Todos los productos del chatbot');
    const allProducts = await Product.find({ chatbotId }).limit(10).lean();
    console.log(`✅ Total de productos: ${allProducts.length}`);
    allProducts.forEach(p => console.log(`   - ${p.name} (SKU: ${p.sku}, stock: ${p.stock})`));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testSearch();
