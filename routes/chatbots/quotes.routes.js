import express from 'express';
import QuoteController from '../../controllers/quotes/quote.controller.js';

const router = express.Router({ mergeParams: true });
const quoteController = new QuoteController();

router.post('/', quoteController.create);
router.get('/fields/list', quoteController.getFields);
router.get('/', quoteController.list);
router.patch('/:id', quoteController.patch);
router.delete('/:id', quoteController.delete);
router.get('/:id', quoteController.get);

export default router;
