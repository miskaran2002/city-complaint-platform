// src/routes/payment.routes.ts
import { Router } from 'express';
import { initiateBkashPayment, bkashCallback } from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js'; 

const router = Router();

// Route to initiate bKash payment (only for authenticated citizens)
router.post('/bkash/create', authenticate, authorize('CITIZEN'), initiateBkashPayment);

// bKash callback route to handle payment status (can be accessed by bKash server)
router.get('/bkash/callback', bkashCallback);

export default router;