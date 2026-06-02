import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  currency: { type: String, default: 'CLP' },
  imageUrl: String,
  imagePath: String,
  stock: { type: Number, default: 0 },
  category: String,
  tags: [String],
  source: {
    type: String,
    enum: ['manual', 'csv', 'shopify', 'jumpseller', 'woocommerce', 'api'],
    default: 'manual'
  },
  sourceMetadata: {
    externalId: String,
    externalUrl: String,
    externalSku: String,
    lastSyncedAt: Date,
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending'
    },
    syncError: String
  },
  manuallyUploaded: { type: Boolean, default: false },
  giftOccasion: [{
    _id: false,
    occasion: {
      type: String,
      enum: [
        'mothers_day',
        'fathers_day',
        'birthday',
        'anniversary',
        'christmas',
        'valentines',
        'graduation',
        'newborn',
        'get_well',
        'thank_you'
      ]
    },
    reason: String
  }],
  embedding: [Number],
  embeddingText: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.index({ chatbotId: 1, sku: 1 }, { unique: true });
productSchema.index({ chatbotId: 1 });
productSchema.index({ embedding: 'cosmosSearch' }, { cosmosSearchOptions: { kind: 'vector-ivf', m: 4, efConstruction: 400, efSearch: 400, metric: 'cosine' } });

// Full-text search index for professional keyword search
productSchema.index({
  name: 'text',
  description: 'text',
  category: 'text',
  tags: 'text'
}, {
  weights: {
    name: 10,          // Nombre es 10x más importante
    tags: 8,           // Tags es 8x más importante
    category: 4,       // Categoría es 4x más importante
    description: 1     // Descripción es 1x importante
  }
});

export default mongoose.model('Product', productSchema);
