import mongoose from 'mongoose';
import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

const productSchema = new mongoose.Schema({
  chatbotId: mongoose.Schema.Types.ObjectId,
  workspaceId: mongoose.Schema.Types.ObjectId,
  sku: String,
  name: String,
  description: String,
  price: Number,
  currency: String,
  category: String,
  tags: [String],
  imageUrl: String,
  source: { type: String, default: 'manual' },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

async function loadProducts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    const db = mongoose.connection.db;
    
    // Get the target chatbot
    const targetChatbotId = new mongoose.Types.ObjectId('6a14db26ca917cce7f5bd5ed');
    const chatbot = await db.collection('chatbots').findOne({ _id: targetChatbotId });
    
    if (!chatbot) {
      console.error('❌ Chatbot no encontrado');
      process.exit(1);
    }

    console.log(`✅ Chatbot encontrado: ${chatbot.name} (${chatbot._id})`);

    const products = [];
    
    fs.createReadStream('/tmp/agua_purificada.csv')
      .pipe(csv())
      .on('data', (row) => {
        products.push({
          chatbotId: chatbot._id,
          workspaceId: chatbot.workspaceId,
          sku: row.sku,
          name: row.nombre,
          description: row.descripcion,
          price: parseFloat(row.precio),
          currency: 'CLP',
          category: row.categoria,
          tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
          source: 'manual'
        });
      })
      .on('end', async () => {
        try {
          // Delete existing products with same SKUs
          const skus = products.map(p => p.sku);
          await Product.deleteMany({ chatbotId: chatbot._id, sku: { $in: skus } });
          
          // Insert new products
          const result = await Product.insertMany(products);
          console.log(`\n✅ ${result.length} productos cargados exitosamente:\n`);
          products.forEach(p => console.log(`   🥤 ${p.name} (${p.sku}): $${p.price.toLocaleString('es-CL')} CLP`));
          
          await mongoose.connection.close();
          process.exit(0);
        } catch (error) {
          console.error('❌ Error al insertar productos:', error.message);
          process.exit(1);
        }
      });
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    process.exit(1);
  }
}

loadProducts();
