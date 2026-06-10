import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const chatbotSchema = new mongoose.Schema({
  workspaceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name:         { type: String, required: true },
  embedKey:     { type: String, required: true, unique: true },
  status:       { type: String, enum: ['draft', 'active', 'paused'], default: 'draft' },
  businessType: { type: String, enum: ['restaurant', 'store', 'clinic', 'generic'], default: 'generic' },

  personality: {
    tone: String,
    customPrompt: String,
    welcomeMessage: String,
    fallbackMessage: String,
    emoji: { type: String, default: '🤖' },
    color: { type: String, default: 'voltage' }
  },

  widget: {
    color: String,
    position: String,
    avatar: String,
    proactiveMessage: String,
    proactiveDelaySeconds: Number,
    pattern: { type: String, default: 'dots' },
    patternOpacity: { type: Number, default: 0.45 },
    suggestions: [{ icon: String, text: String }],
  },

  features: {
    chat:         { type: Boolean, default: true },
    quotes:       { type: Boolean, default: false },
    appointments: { type: Boolean, default: false },
    sales:        { type: Boolean, default: false },
    leadCapture:  { type: Boolean, default: false }
  },

  integrations: {
    productsApi: {
      url: String,
      headers: Object,
      lastSyncAt: Date
    },
    calendar: {
      enabled: { type: Boolean, default: false },
      provider: String,
      googleClientId: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      googleClientSecret: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      accessToken: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      refreshToken: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      calendarId: String,
      connectedAt: Date,
      timezone: String,
      bookingHoursStart: String,
      bookingHoursEnd: String,
      bufferMinutes: Number,
      maxDaysInAdvance: Number,
      bookingDays: [Number]
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      provider: String, // 'twilio' o 'meta'
      phoneNumber: String,
      accountSid: String,
      authToken: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      businessAccountId: String,
      accessToken: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      connectedAt: Date
    },
    instagram: {
      enabled: { type: Boolean, default: false },
      instagramBusinessAccountId: String,
      accessToken: { type: String, set: function(value) { return value ? encrypt(value) : null; }, get: function(value) { return value ? decrypt(value) : null; } },
      connectedAt: Date
    }
  },

  stats: {
    totalConversations: { type: Number, default: 0 },
    totalLeads: { type: Number, default: 0 },
    totalAppointments: { type: Number, default: 0 },
    totalQuotes: { type: Number, default: 0 }
  },

  openaiApiKey: {
    type: String,
    required: false,
    set: function(value) {
      return value ? encrypt(value) : null;
    },
    get: function(value) {
      return value ? decrypt(value) : null;
    }
  },

  openaiError: {
    code: { type: String, default: null },   // 'QUOTA_EXCEEDED' | 'INVALID_KEY' | null
    detectedAt: { type: Date, default: null },
  },

  openaiModel: {
    type: String,
    default: 'gpt-3.5-turbo',
    enum: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini']
  },

  openaiSettings: {
    temperature:         { type: Number, default: 0.7, min: 0,   max: 2    },
    maxTokens:           { type: Number, default: 500, min: 50,  max: 4000 },
    topP:                { type: Number, default: 1,   min: 0,   max: 1    },
    // RAG tuning — overrides global defaults
    maxContextTokens:    { type: Number, default: null },  // null = use global default (2000)
    maxChunks:           { type: Number, default: null },  // null = use global default (5)
    similarityThreshold: { type: Number, default: null },  // null = use global default (0.5)
  },

  productLoadingMethod: {
    type: String,
    enum: ['manual', 'shopify', 'jumpseller', 'woocommerce', 'custom_api'],
    default: 'manual'
  },

  // WooCommerce sync config
  woocommerceConfig: {
    storeUrl:       { type: String, default: null },   // e.g. https://imfluid.cl
    consumerKey:    {
      type: String, default: null,
      set: v => v ? encrypt(v) : null,
      get: v => v ? decrypt(v) : null,
    },
    consumerSecret: {
      type: String, default: null,
      set: v => v ? encrypt(v) : null,
      get: v => v ? decrypt(v) : null,
    },
    lastSyncAt:     { type: Date, default: null },
    lastSyncCount:  { type: Number, default: 0 },
    lastSyncStatus: { type: String, enum: ['idle','syncing','success','error'], default: 'idle' },
    lastSyncError:  { type: String, default: null },
  },

  activeIntegrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Integration',
    default: null
  },

  quoteFields: [{
    _id: false,
    fieldId: { type: String, required: true },
    label: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'email', 'phone', 'number', 'date', 'textarea', 'select'], default: 'text' },
    required: { type: Boolean, default: false },
    placeholder: String,
    options: [String],
    order: { type: Number, default: 0 },
    helpText: String
  }],

  appointmentFields: [{
    _id: false,
    fieldId: { type: String, required: true },
    label: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'email', 'phone', 'number', 'textarea', 'select'], default: 'text' },
    required: { type: Boolean, default: false },
    placeholder: String,
    options: [String],
    order: { type: Number, default: 0 },
    helpText: String,
  }],

  // Store: quote configuration
  quoteConfig: {
    enabled:           { type: Boolean, default: false },
    autoQuoteMinQty:   { type: Number, default: 10 },   // trigger quote offer if qty >= this
    taxRate:           { type: Number, default: 0 },    // % IVA
    taxIncluded:       { type: Boolean, default: false },
    validityDays:      { type: Number, default: 30 },
    paymentTerms:      { type: String, default: '' },   // "Contado / 30 días / 50% adelanto"
    termsAndConditions:{ type: String, default: '' },
    volumeDiscounts: [{
      _id: false,
      minQty:      { type: Number, required: true },
      discountPct: { type: Number, required: true },    // percentage 0-100
    }],
  },

  deliveryConfig: {
    enabled:            { type: Boolean, default: false },
    allowDelivery:      { type: Boolean, default: true },
    allowPickup:        { type: Boolean, default: true },
    zones:              [{ type: String }],
    deliveryCost:       { type: Number, default: 0 },
    estimatedMinutes:   { type: Number, default: 45 },
    minimumOrder:       { type: Number, default: 0 },
    // Delivery hours (optional, if different from local hours)
    hasCustomDeliveryHours: { type: Boolean, default: false },
    deliveryHoursStart: { type: String, default: '' },
    deliveryHoursEnd:   { type: String, default: '' },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

chatbotSchema.index({ workspaceId: 1 });
chatbotSchema.index({ embedKey: 1 }, { unique: true });

export default mongoose.model('Chatbot', chatbotSchema);
