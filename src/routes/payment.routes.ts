import { Router } from 'express';
import { 
  initiateBkashPayment, 
  bkashCallback,
  initiateStripePayment,
  verifyStripePayment,
  getMyPayments
} from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js'; 

const router = Router();

// ============ bKash Routes ============
router.post('/bkash/create', authenticate, authorize('CITIZEN'), initiateBkashPayment);
router.get('/bkash/callback', bkashCallback);

// ============ Stripe Routes ============
// Route to create Stripe session
router.post('/stripe/create', authenticate, authorize('CITIZEN'), initiateStripePayment);

// Route to verify Stripe payment from frontend success page
router.post('/stripe/verify', authenticate, authorize('CITIZEN'), verifyStripePayment);


router.get('/', authenticate, authorize('CITIZEN'), getMyPayments);

export default router;