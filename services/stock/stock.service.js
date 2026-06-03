import Product from '../../models/Product.js';
import logger from '../../utils/logger.js';

export const STOCK_STATUS = {
  AVAILABLE:    'available',
  LOW:          'low',       // <= lowStockThreshold
  OUT_OF_STOCK: 'out_of_stock',
};

const LOW_STOCK_THRESHOLD = 5;

class StockService {

  /**
   * Returns stock status for a product.
   * @returns { status, available, stock }
   */
  getStockStatus = (product) => {
    const stock = product.stock ?? 0;
    if (stock <= 0) return { status: STOCK_STATUS.OUT_OF_STOCK, available: false, stock: 0 };
    if (stock <= LOW_STOCK_THRESHOLD) return { status: STOCK_STATUS.LOW, available: true, stock };
    return { status: STOCK_STATUS.AVAILABLE, available: true, stock };
  };

  /**
   * Check if a product has enough stock for the requested quantity.
   * Products with stock = null or stock = 999 are treated as unlimited (restaurant mode).
   */
  checkStock = async (productId, requestedQty = 1) => {
    try {
      const product = await Product.findById(productId).select('name stock available');
      if (!product) return { success: false, message: 'Producto no encontrado' };

      // Unlimited stock (restaurant / manual override)
      if (product.stock === null || product.stock === undefined || product.stock >= 999) {
        return { success: true, sufficient: true, stock: null, unlimited: true };
      }

      if (!product.available) {
        return { success: true, sufficient: false, stock: product.stock, reason: 'not_available', message: `"${product.name}" no está disponible actualmente` };
      }

      if (product.stock <= 0) {
        return { success: true, sufficient: false, stock: 0, reason: 'out_of_stock', message: `"${product.name}" está agotado` };
      }

      if (product.stock < requestedQty) {
        return { success: true, sufficient: false, stock: product.stock, reason: 'insufficient', message: `Solo quedan ${product.stock} unidades de "${product.name}"` };
      }

      return { success: true, sufficient: true, stock: product.stock, unlimited: false };
    } catch (error) {
      logger.error('StockService.checkStock error', { productId, error: error.message });
      return { success: false, message: error.message };
    }
  };

  /**
   * Check stock for multiple items at once (for order validation).
   * Returns { valid: bool, issues: [{ name, issue, stock }] }
   */
  checkOrderStock = async (items) => {
    const issues = [];
    for (const item of items) {
      if (!item.productId) continue; // Skip items without productId (manual input)
      const result = await this.checkStock(item.productId, item.quantity);
      if (result.success && !result.sufficient) {
        issues.push({ name: item.name, issue: result.reason, stock: result.stock, message: result.message });
      }
    }
    return { valid: issues.length === 0, issues };
  };

  /**
   * Decrement stock for a list of order items.
   * Only decrements products with real stock (not unlimited).
   */
  decrementOrderStock = async (items) => {
    const updates = [];
    for (const item of items) {
      if (!item.productId) continue;
      const product = await Product.findById(item.productId).select('stock');
      if (!product || product.stock === null || product.stock >= 999) continue;
      const newStock = Math.max(0, (product.stock || 0) - item.quantity);
      await Product.updateOne({ _id: item.productId }, { $set: { stock: newStock, available: newStock > 0 } });
      updates.push({ productId: item.productId, oldStock: product.stock, newStock });
    }
    logger.info('Stock decremented', { updates });
    return updates;
  };

  /**
   * Restore stock when an order is cancelled.
   */
  restoreOrderStock = async (items) => {
    for (const item of items) {
      if (!item.productId) continue;
      const product = await Product.findById(item.productId).select('stock');
      if (!product || product.stock === null || product.stock >= 999) continue;
      await Product.updateOne(
        { _id: item.productId },
        { $inc: { stock: item.quantity }, $set: { available: true } }
      );
    }
  };

  /**
   * Get available products for a chatbot (excludes out-of-stock for store).
   */
  getAvailableProducts = async (chatbotId, businessType = 'generic') => {
    const query = { chatbotId, available: true };
    if (businessType === 'store') {
      query.$or = [{ stock: { $gt: 0 } }, { stock: { $gte: 999 } }, { stock: null }];
    }
    return Product.find(query).sort({ category: 1, name: 1 });
  };
}

export default new StockService();
