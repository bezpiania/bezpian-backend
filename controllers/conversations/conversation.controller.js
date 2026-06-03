import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';

// Helper: extract workspaceId from req (params or user)
const getWorkspaceId = (req) =>
  req.params.workspaceId || req.params.wsId || req.user?.workspaceId;

class ConversationController {
  list = async (req, res) => {
    try {
      const { id: chatbotId } = req.params;
      const workspaceId = getWorkspaceId(req);
      const { search, status, outcome, page = 1, limit = 10 } = req.query;

      const filter = {};
      if (workspaceId) filter.workspaceId = workspaceId;
      if (chatbotId)   filter.chatbotId   = chatbotId;
      if (status)      filter.status      = status;
      if (outcome)     filter.outcome     = outcome;
      if (search) {
        filter.$or = [
          { 'visitorMetadata.name':  { $regex: search, $options: 'i' } },
          { 'visitorMetadata.email': { $regex: search, $options: 'i' } },
          { visitorId: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await Conversation.countDocuments(filter);
      const skip  = (page - 1) * limit;
      const conversations = await Conversation.find(filter)
        .populate('chatbotId', 'name personality.emoji personality.color')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const conversationsWithMessages = await Promise.all(
        conversations.map(async (conv) => {
          const lastMessage = await Message.findOne({ conversationId: conv._id })
            .sort({ createdAt: -1 }).lean();
          return {
            ...conv.toObject(),
            lastMessagePreview: lastMessage?.content || '(Sin mensajes)',
            lastMessageRole:    lastMessage?.role    || 'user',
            botName:  conv.chatbotId?.name                || 'Bot',
            botEmoji: conv.chatbotId?.personality?.emoji  || '🤖',
            botColor: conv.chatbotId?.personality?.color  || 'voltage'
          };
        })
      );

      res.json({ success: true, data: conversationsWithMessages, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
      console.error('Error listing conversations:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  get = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const workspaceId = getWorkspaceId(req);
      const query = { _id: conversationId };
      if (workspaceId) query.workspaceId = workspaceId;
      const conversation = await Conversation.findOne(query);
      if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
      res.json({ success: true, data: conversation });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getMessages = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const workspaceId = getWorkspaceId(req);
      // Verify conversation belongs to workspace before returning messages
      if (workspaceId) {
        const conv = await Conversation.findOne({ _id: conversationId, workspaceId });
        if (!conv) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
      }
      const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
      res.json({ success: true, data: messages });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  close = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const workspaceId = getWorkspaceId(req);
      const query = { _id: conversationId };
      if (workspaceId) query.workspaceId = workspaceId;
      const conversation = await Conversation.findOneAndUpdate(query, { status: 'closed' }, { new: true });
      if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
      res.json({ success: true, data: conversation });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  markSpam = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const workspaceId = getWorkspaceId(req);
      const query = { _id: conversationId };
      if (workspaceId) query.workspaceId = workspaceId;
      const conversation = await Conversation.findOneAndUpdate(query, { isSpam: true }, { new: true });
      if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
      res.json({ success: true, data: conversation });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}

export default ConversationController;
