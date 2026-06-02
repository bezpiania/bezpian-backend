import AppointmentService from './services/appointments/appointment.service.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const chatbotId = '6a14daf6ca917cce7f5bd5e5';
  const now = new Date();
  
  console.log('🤖 TESTEO DE VALIDACIÓN DE HORARIOS - Chatbot "boter"');
  console.log('='.repeat(60));
  console.log('\n📅 Configuración: 09:00-18:00, Lun-Vie');
  console.log('\n');
  
  // Test 1: Fuera de horarios (7:00 AM - demasiado temprano)
  console.log('TEST 1: Agendar a las 07:00 (demasiado temprano)');
  const earlyDate = new Date(now);
  earlyDate.setHours(7, 0, 0, 0);
  if (earlyDate < now) earlyDate.setDate(earlyDate.getDate() + 1);
  const early = await AppointmentService.isSlotAvailable(chatbotId, earlyDate, 30);
  console.log('Resultado:', early.available ? '✅ Disponible' : `❌ ${early.reason}`);
  console.log('');
  
  // Test 2: Fuera de horarios (19:00 - demasiado tarde)
  console.log('TEST 2: Agendar a las 19:00 (demasiado tarde)');
  const lateDate = new Date(now);
  lateDate.setHours(19, 0, 0, 0);
  if (lateDate < now) lateDate.setDate(lateDate.getDate() + 1);
  const late = await AppointmentService.isSlotAvailable(chatbotId, lateDate, 30);
  console.log('Resultado:', late.available ? '✅ Disponible' : `❌ ${late.reason}`);
  console.log('');
  
  // Test 3: Fin de semana (Sábado)
  console.log('TEST 3: Agendar el Sábado a las 14:00');
  const satDate = new Date(now);
  // Encontrar próximo sábado
  while (satDate.getDay() !== 6) {
    satDate.setDate(satDate.getDate() + 1);
  }
  satDate.setHours(14, 0, 0, 0);
  const sat = await AppointmentService.isSlotAvailable(chatbotId, satDate, 30);
  console.log('Resultado:', sat.available ? '✅ Disponible' : `❌ ${sat.reason}`);
  console.log('');
  
  // Test 4: Dentro de horarios (miércoles 14:00)
  console.log('TEST 4: Agendar un miércoles a las 14:00 (VÁLIDO)');
  const validDate = new Date(now);
  // Encontrar próximo miércoles
  while (validDate.getDay() !== 3) {
    validDate.setDate(validDate.getDate() + 1);
  }
  validDate.setHours(14, 0, 0, 0);
  if (validDate < now) validDate.setDate(validDate.getDate() + 7);
  const valid = await AppointmentService.isSlotAvailable(chatbotId, validDate, 30);
  console.log('Resultado:', valid.available ? '✅ Disponible' : `❌ ${valid.reason}`);
  console.log('');
  
  // Test 5: Más allá de 30 días
  console.log('TEST 5: Agendar 40 días en el futuro (fuera de límite)');
  const tooFarDate = new Date(now);
  tooFarDate.setDate(tooFarDate.getDate() + 40);
  tooFarDate.setHours(14, 0, 0, 0);
  const tooFar = await AppointmentService.isSlotAvailable(chatbotId, tooFarDate, 30);
  console.log('Resultado:', tooFar.available ? '✅ Disponible' : `❌ ${tooFar.reason}`);
  console.log('');
  
  console.log('='.repeat(60));
  console.log('🎯 CONCLUSIÓN: La IA rechazaría agendamientos fuera de:');
  console.log('   - Horarios (09:00-18:00)');
  console.log('   - Días (Lun-Vie)');
  console.log('   - Límite de días (máximo 30)');
  
  process.exit(0);
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
