import mongoose from 'mongoose';

const documentChunkSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  chunkIndex: Number,
  text: { type: String, required: true },
  tokenCount: Number,
  embedding: [Number],

  metadata: {
    sourceFile: String,
    pageNumber: Number
  },

  createdAt: { type: Date, default: Date.now }
});

documentChunkSchema.index({ documentId: 1 });
documentChunkSchema.index({ chatbotId: 1 });
documentChunkSchema.index({ text: 'text' });

// Vector search index for semantic similarity
documentChunkSchema.index(
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

export default mongoose.model('DocumentChunk', documentChunkSchema);
