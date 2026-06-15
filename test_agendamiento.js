import fetch from 'node-fetch';

const BASE = 'http://localhost:5001/api/embed';
const EMBED_KEY = 'larufina-q5pnaw3w';

async function newConv() {
  const r = await fetch(`${BASE}/conversations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedKey: EMBED_KEY, visitorId: 'test-appt-' + Date.now() })
  });
  const d = await r.json();
  return { convId: d.data?.conversationId, botId: d.data?.botId };
}

async function chat(convId, botId, msg) {
  const r = await fetch(`${BASE}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: convId, content: msg, botId, visitorContext: {} })
  });
  const d = await r.json();
  return d.data?.botMessage?.content || '(sin respuesta)';
}

function show(label, msg) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`👤 ${label}`);
  console.log(`🤖 ${msg.substring(0, 300).replace(/\n/g, '\n   ')}`);
}

async function run() {
  console.log('🧪 PRUEBAS DE AGENDAMIENTO — La Rufina\n');

  // TEST A: Solo consulta disponibilidad — NO debe confirmar nada
  console.log('\n═══ TEST A: Consulta de disponibilidad (sin datos) ═══');
  let { convId, botId } = await newConv();
  show('¿Tienen mesas disponibles el viernes a las 8pm?',
    await chat(convId, botId, '¿Tienen mesas disponibles el viernes a las 8pm?'));

  // TEST B: Flujo completo correcto
  console.log('\n\n═══ TEST B: Flujo completo correcto ═══');
  ({ convId, botId } = await newConv());
  show('Quiero reservar para mañana a las 8pm',
    await chat(convId, botId, 'Quiero reservar una mesa para mañana a las 8pm'));
  show('Somos 2 personas',
    await chat(convId, botId, 'Somos 2 personas'));
  show('Mi nombre es Carlos Pérez',
    await chat(convId, botId, 'Mi nombre es Carlos Pérez'));
  show('Mi teléfono es +56912345678',
    await chat(convId, botId, 'Mi teléfono es +56912345678'));
  show('Confirmo',
    await chat(convId, botId, 'Sí, confirmo'));

  // TEST C: Bot pide datos faltantes
  console.log('\n\n═══ TEST C: Intento de reservar sin dar nombre ni teléfono ═══');
  ({ convId, botId } = await newConv());
  show('Reservar mañana a las 7pm para 3 personas',
    await chat(convId, botId, 'Quiero reservar mañana a las 7pm para 3 personas'));

  // TEST D: Consulta con "¿hay?" — no debe confirmar
  console.log('\n\n═══ TEST D: "¿Hay disponibilidad?" — solo informar ═══');
  ({ convId, botId } = await newConv());
  show('¿Hay disponibilidad para el sábado a las 9pm?',
    await chat(convId, botId, '¿Hay disponibilidad para el sábado a las 9pm?'));

  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
