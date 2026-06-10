import mongoose from 'mongoose';

// Variant option (e.g. Size: M, Color: Red)
const variantSchema = new mongoose.Schema({
  name:    { type: String, required: true },  // e.g. "Talla M / Rojo"
  options: [String],                           // e.g. ["XS","S","M","L","XL"]
  sku:     { type: String },
  price:   { type: Number },
  stock:   { type: Number, default: 0 },
}, { _id: false });

const productSchema = new mongoose.Schema({
  chatbotId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot',   required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },

  // ── Item type — distingue plato / producto físico / servicio ─────────────
  itemType: {
    type: String,
    enum: ['dish', 'product', 'service'],
    default: 'product',
  },

  // ── Base fields (all business types) ─────────────────────────────────────
  sku:         { type: String },   // optional — required for store; no default so sparse index works
  name:        { type: String, required: true },
  description: { type: String },
  price:       { type: Number, default: 0 },      // 0 = "Consultar"
  currency:    { type: String, default: 'CLP' },
  category:    { type: String },
  subcategory: { type: String },  // e.g. "Cámaras IP" within "CCTV"
  tags:        [String],
  imageUrl:    { type: String },
  imagePath:   { type: String },
  available:   { type: Boolean, default: true },

  // ── RESTAURANT fields ─────────────────────────────────────────────────────
  ingredients:   [String],                        // lista de ingredientes
  allergens:     [String],                        // Gluten, Lactosa, etc.
  dietaryTags:   [String],                        // Vegetariano, Vegano, Sin gluten, Picante
  portionSize:   { type: String },                // Individual / Para compartir / Familiar
  prepTime:      { type: Number },                // minutos de preparación
  availableFor:  [String],                        // Almuerzo / Cena / Todo el día
  calories:      { type: Number },

  // ── STORE fields ──────────────────────────────────────────────────────────
  brand:         { type: String },
  barcode:       { type: String },
  stock:         { type: Number, default: 0 },
  salePrice:     { type: Number },                // precio oferta
  weight:        { type: Number },                // kg
  variants:      [variantSchema],                 // tallas, colores, modelos

  // ── CLINIC fields ─────────────────────────────────────────────────────────
  duration:          { type: Number },            // minutos de la sesión
  specialty:         { type: String },            // especialidad médica
  requiresPrep:      { type: Boolean, default: false },
  prepInstructions:  { type: String },            // ayuno, ropa cómoda, etc.
  insuranceCoverage: { type: String },            // qué seguros lo cubren
  sessionCount:      { type: Number, default: 1 },// nº de sesiones del tratamiento

  // ── COMBO fields (restaurant) ─────────────────────────────────────────────
  isCombo:     { type: Boolean, default: false },
  comboItems:  [{
    _id: false,
    name:     { type: String },   // descripción del ítem incluido
    quantity: { type: Number, default: 1 },
  }],
  comboSavings: { type: Number }, // cuánto ahorra vs comprar por separado

  // ── Source / sync metadata ────────────────────────────────────────────────
  source: {
    type: String,
    enum: ['manual', 'csv', 'shopify', 'jumpseller', 'woocommerce', 'api'],
    default: 'manual',
  },
  sourceMetadata: {
    externalId:   String,
    externalUrl:  String,
    externalSku:  String,
    lastSyncedAt: Date,
    syncStatus:   { type: String, enum: ['synced', 'pending', 'failed'], default: 'pending' },
    syncError:    String,
  },
  manuallyUploaded: { type: Boolean, default: false },

  // ── Embeddings ────────────────────────────────────────────────────────────
  embedding:     [Number],
  embeddingText: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ chatbotId: 1 });
productSchema.index(
  { chatbotId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } }
);
productSchema.index({ embedding: 'cosmosSearch' }, { cosmosSearchOptions: { kind: 'vector-ivf', m: 4, efConstruction: 400, efSearch: 400, metric: 'cosine' } });
productSchema.index(
  { name: 'text', description: 'text', category: 'text', tags: 'text' },
  { weights: { name: 10, tags: 8, category: 4, description: 1 } }
);

export default mongoose.model('Product', productSchema);
