import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  
  const boter = await db.collection('chatbots').findOne({ name: 'boter' });
  
  if (!boter) {
    console.log('❌ Chatbot "boter" no encontrado');
    process.exit(1);
  }
  
  console.log('✅ Chatbot boter encontrado\n');
  console.log('📅 HORARIOS COMPLETOS:\n');
  console.log(JSON.stringify(boter.integrations?.calendar || { message: 'Sin configuración de horarios' }, null, 2));
  console.log('\n');
  
  const cal = boter.integrations?.calendar || {};
  console.log('📊 RESUMEN:');
  console.log(`- Horarios: ${cal.businessHoursStart || '09:00'} a ${cal.businessHoursEnd || '18:00'}`);
  console.log(`- Días configurados (array):`, cal.workingDays || [1,2,3,4,5]);
  console.log(`- Días configurados (nombres):`);
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  (cal.workingDays || [1,2,3,4,5]).forEach(d => console.log(`    - ${dayNames[d]}`));
  
  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
