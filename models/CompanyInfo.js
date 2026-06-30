import mongoose from 'mongoose';

const companyInfoSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true
    },
    chatbotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chatbot',
      index: true,
      sparse: true,  // Optional — null = workspace-level config (fallback)
    },
    company: {
      name: String,
      address: String,
      city: String,
      country: String,
      phone: String,
      email: String,
      website: String,
      logo: String   // URL del logo (Cloudinary), imagen cuadrada 500x500
    },
    operationHours: [
      {
        day: String,
        open: String,
        close: String,
        isClosed: Boolean
      }
    ],
    operationHoursDisplay: [String],
    dispatches: {
      available: Boolean,
      specialCases: String
    },
    payments: {
      creditCard: Boolean,
      transfer: Boolean,
      paypal: Boolean,
      cash: Boolean,
      webpay: Boolean,
      flow: Boolean,
      mercadopago: Boolean,
      maquinaPos: Boolean
    },
    social: {
      instagram: String,
      whatsapp: String,
      facebook: String,
      tiktok: String,
      linkedin: String,
      youtube: String,
      twitter: String,
      telegram: String,
      wechat: String,
      viber: String,
      line: String,
      messenger: String
    },

    additionalInfo: [
      {
        question: String,
        answer: String
      }
    ],

    embedding: [Number],
    embeddingText: String,
    embeddingModel: {
      type: String,
      default: 'text-embedding-3-small'
    }
  },
  { timestamps: true }
);

// Vector search index for semantic similarity
companyInfoSchema.index(
  { embedding: 'cosmosSearch' },
  {
    cosmosSearchOptions: {
      kind: 'vector-ivf',
      m: 4,
      efConstruction: 400,
      efSearch: 400,
      metric: 'cosine'
    }
  }
);

export default mongoose.model('CompanyInfo', companyInfoSchema);
