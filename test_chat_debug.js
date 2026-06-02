import axios from 'axios';

const API_URL = 'http://localhost:5001/api/embed';
const EMBED_KEY = '13da3f49665676308735e2fec4a49e5a';
const CHATBOT_ID = '6a14db26ca917cce7f5bd5ed';

async function runTest() {
  try {
    // Iniciar conversación
    console.log('🔗 Iniciando conversación...');
    const convResponse = await axios.post(`${API_URL}/conversations`, {
      embedKey: EMBED_KEY
    });
    const conversationId = convResponse.data.data.conversationId;
    console.log(`✅ Conversación: ${conversationId}\n`);

    // Enviar mensaje
    console.log('📨 Enviando mensaje...');
    const msgResponse = await axios.post(
      `${API_URL}/messages`,
      {
        botId: CHATBOT_ID,
        conversationId: conversationId,
        content: '¿Tienes Agua Purificada Sin Cloro?'
      },
      { timeout: 30000 }
    );

    console.log('\n📦 Response Data:', JSON.stringify(msgResponse.data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
  process.exit(0);
}

runTest();
