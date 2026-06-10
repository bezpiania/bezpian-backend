import Chatbot from '../../models/Chatbot.js';
import { syncWoocommerce, testWoocommerceConnection } from '../../services/integrations/woocommerce-sync.service.js';
import { decrypt } from '../../utils/encryption.js';

export const woocommerceController = {

  // GET /api/chatbots/:id/woocommerce — get current config (no secrets)
  getConfig: async (req, res) => {
    try {
      const chatbot = await Chatbot.findOne({ _id: req.params.id, workspaceId: req.params.workspaceId });
      if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });

      const wc = chatbot.woocommerceConfig || {};
      return res.json({
        success: true,
        data: {
          storeUrl:       wc.storeUrl || '',
          hasCredentials: !!(wc.consumerKey && wc.consumerSecret),
          lastSyncAt:     wc.lastSyncAt || null,
          lastSyncCount:  wc.lastSyncCount || 0,
          lastSyncStatus: wc.lastSyncStatus || 'idle',
          lastSyncError:  wc.lastSyncError || null,
          productLoadingMethod: chatbot.productLoadingMethod,
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // PUT /api/chatbots/:id/woocommerce — save credentials
  saveConfig: async (req, res) => {
    try {
      const { storeUrl, consumerKey, consumerSecret } = req.body;
      if (!storeUrl) return res.status(400).json({ success: false, message: 'storeUrl es requerido' });

      const chatbot = await Chatbot.findOne({ _id: req.params.id, workspaceId: req.params.workspaceId });
      if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });

      const update = { 'woocommerceConfig.storeUrl': storeUrl };
      if (consumerKey)    update['woocommerceConfig.consumerKey']    = consumerKey;
      if (consumerSecret) update['woocommerceConfig.consumerSecret'] = consumerSecret;

      await Chatbot.findByIdAndUpdate(req.params.id, { $set: update });
      return res.json({ success: true, message: 'Credenciales guardadas' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // POST /api/chatbots/:id/woocommerce/test — test connection
  testConnection: async (req, res) => {
    try {
      const { storeUrl, consumerKey, consumerSecret } = req.body;

      // If no credentials sent, use stored ones
      let ck = consumerKey, cs = consumerSecret, url = storeUrl;
      if (!ck || !cs) {
        const chatbot = await Chatbot.findOne({ _id: req.params.id, workspaceId: req.params.workspaceId });
        if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });
        const raw = chatbot.toObject({ getters: true });
        ck  = raw.woocommerceConfig?.consumerKey;
        cs  = raw.woocommerceConfig?.consumerSecret;
        url = raw.woocommerceConfig?.storeUrl;
      }

      if (!url || !ck || !cs) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales' });
      }

      const result = await testWoocommerceConnection(url, ck, cs);
      return res.json({ success: true, message: `Conexión exitosa. ${result.total} productos encontrados.`, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // POST /api/chatbots/:id/woocommerce/sync — run full sync
  sync: async (req, res) => {
    try {
      const chatbot = await Chatbot.findOne({ _id: req.params.id, workspaceId: req.params.workspaceId });
      if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });

      // Check not already syncing
      if (chatbot.woocommerceConfig?.lastSyncStatus === 'syncing') {
        return res.status(409).json({ success: false, message: 'Sincronización ya en curso' });
      }

      // Run async — respond immediately, client polls getConfig for status
      syncWoocommerce(req.params.id).catch(err => {
        console.error('Sync error (background):', err.message);
      });

      return res.json({ success: true, message: 'Sincronización iniciada' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },
};
