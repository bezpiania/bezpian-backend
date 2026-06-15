import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/cesarbarahona/Desktop/Pielo/zapien-backend/.env' });

// First, get a valid JWT token by logging in
const instance = axios.create({
  baseURL: 'http://localhost:5001',
  headers: {
    'Content-Type': 'application/json'
  }
});

async function test() {
  try {
    // Login to get token
    const loginRes = await instance.post('/api/auth/login', {
      email: 'test1779512260@example.com',
      password: 'Password123'
    });

    const token = loginRes.data.data.token;
    instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Get the OpenAI config
    const botId = '6a14bc19b9b34ac019fc8563';
    const wsId = '6a11ef44397e905f49156779';

    const configRes = await instance.get(`/api/workspaces/${wsId}/chatbots/${botId}/openai-config`);

    console.log('\n📊 Backend Response:');
    console.log(JSON.stringify(configRes.data, null, 2));

  } catch (error) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

test();
