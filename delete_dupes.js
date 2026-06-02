import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zapien:LjH9kDzV7mN2qP@cluster0.mongodb.net/zapien?retryWrites=true&w=majority';

async function deleteDupes() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    
    // IDs to delete (the 3 empty duplicates)
    const toDelete = [
      '6a14dafbca917cce7f5bd5e7',
      '6a14daffca917cce7f5bd5e9',
      '6a14db07ca917cce7f5bd5eb'
    ];
    
    const ids = toDelete.map(id => new mongoose.Types.ObjectId(id));
    
    // Delete from chatbots
    const delResult = await db.collection('chatbots').deleteMany({
      _id: { $in: ids }
    });
    
    console.log(`✅ Deleted ${delResult.deletedCount} duplicate chatbots`);
    
    // Verify remaining boters
    const remaining = await db.collection('chatbots').find({ name: 'boter' }).toArray();
    console.log(`\n📋 Remaining "boter" chatbots: ${remaining.length}`);
    
    for (const b of remaining) {
      const productCount = await db.collection('products').countDocuments({ chatbotId: b._id });
      console.log(`   ID: ${b._id}, Name: ${b.name}, Products: ${productCount}`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

deleteDupes();
