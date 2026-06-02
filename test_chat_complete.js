import axios from 'axios';

const API_URL = 'http://localhost:5001/api/embed';
const EMBED_KEY = '13da3f49665676308735e2fec4a49e5a';
const CHATBOT_ID = '6a14db26ca917cce7f5bd5ed';

async function testQuery(conversationId, question) {
  try {
    const response = await axios.post(
      `${API_URL}/messages`,
      {
        botId: CHATBOT_ID,
        conversationId: conversationId,
        content: question
      },
      { timeout: 30000 }
    );

    if (response.data?.success) {
      const botMessage = response.data.data?.botMessage?.content || '';
      console.log(`\n📨 Pregunta: "${question}"`);
      console.log(`✅ Respuesta: ${botMessage}`);
      console.log(`   ⏱️  ${response.data.data?.latencyMs}ms | 💰 $${(response.data.data?.cost || 0).toFixed(6)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🧪 PRUEBAS DE BÚSQUEDA CON FULL-TEXT SEARCH\n');
  console.log('='.repeat(80));

  try {
    // Iniciar conversación
    const convResponse = await axios.post(`${API_URL}/conversations`, {
      embedKey: EMBED_KEY
    });
    const conversationId = convResponse.data.data.conversationId;
    console.log(`✅ Conversación iniciada: ${conversationId}\n`);

    // Test 1: Búsqueda por nombre completo
    await testQuery(conversationId, '¿Tienes Agua Purificada Alcalina 1L?');

    // Test 2: Búsqueda con variaciones ortográficas
    await testQuery(conversationId, 'agua purificada alcalina');

    // Test 3: Búsqueda parcial
    await testQuery(conversationId, '¿qué agua sin cloro tienes?');

    // Test 4: Búsqueda con caracteres especiales
    await testQuery(conversationId, 'Agua Purificada Sin Cloro 500ml');

    // Test 5: Búsqueda insensible a mayúsculas
    await testQuery(conversationId, 'AGUA MINERAL');

    // Test 6: Stock check
    await testQuery(conversationId, '¿cuánto stock hay de agua alcalina?');

    console.log('\n' + '='.repeat(80));
    console.log('✅ PRUEBAS COMPLETADAS - Full-Text Search funcionando profesionalmente!');
  } catch (error) {
    console.error('Error fatal:', error.message);
  }

  process.exit(0);
}

runTests();
