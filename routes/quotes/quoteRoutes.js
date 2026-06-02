import express from 'express';
import QuoteController from '../../controllers/quotes/quote.controller.js';

const router = express.Router({ mergeParams: true });
const quoteController = new QuoteController();

router.get('/public/:shareToken', quoteController.getByShareToken);
router.get('/', quoteController.list);
router.get('/:id', quoteController.get);
router.patch('/:id', quoteController.update);
router.post('/:id/accept', quoteController.accept);
router.post('/:id/resend', quoteController.resend);
router.get('/:id/pdf', quoteController.getPDF);
router.get('/:id/share-link', quoteController.getShareLink);

export default router;
