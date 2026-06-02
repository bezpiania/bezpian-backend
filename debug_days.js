import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  console.log('🔍 DEBUG: Qué día es cada fecha según getDay()\n');
  
  const now = new Date();
  console.log(`HOY: ${now.toDateString()}`);
  console.log(`  - getDay() = ${now.getDay()} (${dayNames[now.getDay()]})\n`);
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    date.setHours(14, 0, 0, 0);
    const day = date.getDay();
    console.log(`+${i}: ${date.toDateString()}`);
    console.log(`    getDay() = ${day} (${dayNames[day]})`);
    console.log(`    ¿En workingDays [1,2,3,4,5]? ${[1,2,3,4,5].includes(day) ? '✅ Sí' : '❌ No'}`);
  }
  
  process.exit(0);
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
