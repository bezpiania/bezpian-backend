import axios from 'axios';

const API_URL = 'http://localhost:5001/api/embed';
const CHATBOT_ID = '6a14db26ca917cce7f5bd5ed';
const EMBED_KEY = '13da3f49665676308735e2fec4a49e5a';

async function startConversation() {
  try {
    const response = await axios.post(`${API_URL}/conversations`, {
      embedKey: EMBED_KEY
    });
    return response.data.data.conversationId;
  } catch (error) {
    console.error('Error starting conversation:', error.response?.data || error.message);
    throw error;
  }
}

async function sendMessage(conversationId, content) {
  try {
    console.log(`\n📨 Enviando: "${content}"`);
    
    const response = await axios.post(
      `${API_URL}/messages`,
      {
        botId: CHATBOT_ID,
        conversationId: conversationId,
        content: content
      },
      { timeout: 30000 }
    );

    if (response.data?.success) {
      const reply = response.data.data?.reply || '';
      console.log(`✅ Respuesta:\n   ${reply.substring(0, 300)}`);
    } else {
      console.log(`❌ Error: ${response.data?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.response?.data?.message || error.message}`);
  }
}

async function runTests() {
  console.log('🧪 Iniciando pruebas de chat con Full-Text Search\n');
  console.log('='.repeat(70));

  try {
    // Iniciar conversación
    console.log('🔗 Iniciando conversación...');
    const conversationId = await startConversation();
    console.log(`✅ Conversación creada: ${conversationId}`);

    // Test 1: Pregunta sin caracteres especiales
    await sendMessage(conversationId, '¿Tienes Agua Purificada?');

    // Test 2: Pregunta con caracteres especiales
    await sendMessage(conversationId, '¿Tienes Agua Purificada Alcalina 1L?');

    // Test 3: Pregunta parcial
    await sendMessage(conversationId, '¿Qué agua alcalina tienes?');

    // Test 4: Pregunta con variaciones
    await sendMessage(conversationId, 'Dame agua sin cloro');

    console.log('\n' + '='.repeat(70));
    console.log('✅ Pruebas completadas');
  } catch (error) {
    console.error('Error fatal:', error.message);
  }
  
  process.exit(0);
}

runTests();
