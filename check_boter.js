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
  
  console.log('✅ Chatbot boter encontrado');
  console.log('\n📅 CONFIGURACIÓN DE HORARIOS:');
  const cal = boter.integrations?.calendar || {};
  console.log('- Inicio:', cal.businessHoursStart || '(no configurado - por defecto 09:00)');
  console.log('- Fin:', cal.businessHoursEnd || '(no configurado - por defecto 18:00)');
  console.log('- Días de trabajo:', cal.workingDays ? cal.workingDays.map(d => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab'][d]).join(', ') : '(no configurado - por defecto Lun-Vie: [1,2,3,4,5])');
  console.log('- Timezone:', cal.timezone || '(no configurado - por defecto America/Santiago)');
  console.log('- Buffer minutos:', cal.bufferMinutes || 0);
  console.log('- Días máximos en avance:', cal.maxDaysInAdvance || 30);
  console.log('- Google conectado:', !!cal.accessToken);
  
  // Mostrar workspaceId para pruebas
  console.log('\n🔑 Para pruebas:');
  console.log('- Chatbot ID:', boter._id);
  console.log('- Workspace ID:', boter.workspaceId);
  
  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
