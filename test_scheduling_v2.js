import AppointmentService from './services/appointments/appointment.service.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const chatbotId = '6a14daf6ca917cce7f5bd5e5';
  
  console.log('🤖 TESTEO DE VALIDACIÓN DE HORARIOS - Chatbot "boter"');
  console.log('='.repeat(60));
  console.log('\n📅 Configuración: 09:00-18:00, Lun-Vie (lunes=1 a viernes=5)');
  console.log('\n');
  
  // Test helper: encuentra próximo día específico
  const findNextDay = (dayOfWeek) => {
    const now = new Date();
    const currentDay = now.getDay();
    const daysAhead = dayOfWeek - currentDay;
    const date = new Date(now);
    date.setDate(date.getDate() + (daysAhead >= 0 ? daysAhead : 7 + daysAhead));
    date.setHours(14, 0, 0, 0); // 14:00 (dentro de horarios)
    return date;
  };
  
  // Test 1: Fuera de horarios - HORA temprana
  console.log('TEST 1: Agendar a las 07:00 (demasiado temprano)');
  const earlyDate = findNextDay(3); // próximo miércoles
  earlyDate.setHours(7, 0, 0, 0);
  console.log(`  Fecha: ${earlyDate.toString()}`);
  const early = await AppointmentService.isSlotAvailable(chatbotId, earlyDate, 30);
  console.log(`  Resultado: ${early.available ? '✅ Disponible' : `❌ ${early.reason}`}`);
  console.log('');
  
  // Test 2: Fuera de horarios - HORA tardía
  console.log('TEST 2: Agendar a las 19:00 (demasiado tarde)');
  const lateDate = findNextDay(3); // próximo miércoles
  lateDate.setHours(19, 0, 0, 0);
  console.log(`  Fecha: ${lateDate.toString()}`);
  const late = await AppointmentService.isSlotAvailable(chatbotId, lateDate, 30);
  console.log(`  Resultado: ${late.available ? '✅ Disponible' : `❌ ${late.reason}`}`);
  console.log('');
  
  // Test 3: FIN DE SEMANA
  console.log('TEST 3: Agendar el Sábado a las 14:00 (fin de semana)');
  const satDate = findNextDay(6); // próximo sábado
  satDate.setHours(14, 0, 0, 0);
  console.log(`  Fecha: ${satDate.toString()}`);
  const sat = await AppointmentService.isSlotAvailable(chatbotId, satDate, 30);
  console.log(`  Resultado: ${sat.available ? '✅ Disponible' : `❌ ${sat.reason}`}`);
  console.log('');
  
  // Test 4: DENTRO DE HORARIOS - VÁLIDO
  console.log('TEST 4: Agendar un miércoles a las 14:00 (VÁLIDO)');
  const validDate = findNextDay(3); // próximo miércoles
  validDate.setHours(14, 0, 0, 0);
  console.log(`  Fecha: ${validDate.toString()}`);
  const valid = await AppointmentService.isSlotAvailable(chatbotId, validDate, 30);
  console.log(`  Resultado: ${valid.available ? '✅ Disponible' : `❌ ${valid.reason}`}`);
  console.log('');
  
  // Test 5: MÁS ALLÁ DE LÍMITE DE DÍAS
  console.log('TEST 5: Agendar 40 días en el futuro (fuera de límite)');
  const tooFarDate = new Date();
  tooFarDate.setDate(tooFarDate.getDate() + 40);
  tooFarDate.setHours(14, 0, 0, 0);
  console.log(`  Fecha: ${tooFarDate.toString()}`);
  const tooFar = await AppointmentService.isSlotAvailable(chatbotId, tooFarDate, 30);
  console.log(`  Resultado: ${tooFar.available ? '✅ Disponible' : `❌ ${tooFar.reason}`}`);
  console.log('');
  
  console.log('='.repeat(60));
  console.log('\n✅ RESPUESTAS DE LA IA SI NO HAY HORARIOS DISPONIBLES:');
  console.log('');
  console.log('1. Si intenta agendar fuera de horarios (7:00 AM):');
  console.log('   ❌ "Nuestros horarios son 09:00-18:00"');
  console.log('');
  console.log('2. Si intenta agendar fuera de horarios (7:00 PM):');
  console.log('   ❌ "Nuestros horarios son 09:00-18:00"');
  console.log('');
  console.log('3. Si intenta agendar en fin de semana:');
  console.log('   ❌ "No atendemos los sábados"');
  console.log('');
  console.log('4. Si intenta agendar 40 días adelante:');
  console.log('   ❌ "No se pueden agendar citas más de 30 días en avance"');
  console.log('');
  console.log('COMPORTAMIENTO DE LA IA:');
  console.log('- Si el usuario dice "Quiero agendar para mañana a las 7am"');
  console.log('  IA responde: "Disculpa, nuestros horarios son 09:00-18:00"');
  console.log('');
  console.log('- Si el usuario dice "¿Horarios disponibles?"');
  console.log('  IA responde: "Atendemos de 09:00 a 18:00, de lunes a viernes"');
  console.log('');
  
  process.exit(0);
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
