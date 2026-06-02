import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';

class ConversationController {
  list = async (req, res) => {
    try {
      const { id: chatbotId } = req.params;
      const { search, status, outcome, page = 1, limit = 10 } = req.query;

      // Build filter
      const filter = {};

      // If chatbotId provided (from chatbot detail), filter by chatbotId
      if (chatbotId) {
        filter.chatbotId = chatbotId;
      }

      // Apply other filters
      if (status) {
        filter.status = status;
      }

      if (outcome) {
        filter.outcome = outcome;
      }

      if (search) {
        filter.$or = [
          { 'visitorMetadata.name': { $regex: search, $options: 'i' } },
          { 'visitorMetadata.email': { $regex: search, $options: 'i' } },
          { visitorId: { $regex: search, $options: 'i' } }
        ];
      }

      // Get total count
      const total = await Conversation.countDocuments(filter);

      // Pagination
      const skip = (page - 1) * limit;
      const conversations = await Conversation.find(filter)
        .populate('chatbotId', 'name personality.emoji personality.color')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      // Enrich conversations with last message preview
      const conversationsWithMessages = await Promise.all(
        conversations.map(async (conv) => {
          const lastMessage = await Message.findOne({
            conversationId: conv._id
          }).sort({ createdAt: -1 }).lean();

          return {
            ...conv.toObject(),
            lastMessagePreview: lastMessage?.content || '(Sin mensajes)',
            lastMessageRole: lastMessage?.role || 'user',
            botName: conv.chatbotId?.name || 'Bot',
            botEmoji: conv.chatbotId?.personality?.emoji || '🤖',
            botColor: conv.chatbotId?.personality?.color || 'voltage'
          };
        })
      );

      res.json({
        success: true,
        data: conversationsWithMessages,
        total: total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    } catch (error) {
      console.error('Error listing conversations:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  get = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      res.json({ success: true, data: conversation });
    } catch (error) {
      console.error('Error getting conversation:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getMessages = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

      res.json({ success: true, data: messages });
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  close = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        { status: 'closed' },
        { new: true }
      );
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      res.json({ success: true, data: conversation });
    } catch (error) {
      console.error('Error closing conversation:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  markSpam = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        { isSpam: true },
        { new: true }
      );
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      res.json({ success: true, data: conversation });
    } catch (error) {
      console.error('Error marking spam:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };
}

export default ConversationController;
