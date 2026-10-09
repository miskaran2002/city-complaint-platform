// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../config/db.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getBkashToken } from '../services/bkash.service.js';
import { AuthRequest } from '../middlewares/auth.js';
import { stripe } from '../services/stripe.service.js';

/**
 * Helper to ensure FRONTEND_URL is clean (removes trailing slashes to prevent // in routes)
 */
const getSanitizedFrontendUrl = (): string => {
  const url = process.env.FRONTEND_URL || 'http://localhost:3000';
  return url.replace(/\/$/, ''); // Removes trailing slash if present
};

// ================= BKASH INTEGRATION =================

export const initiateBkashPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { complaintId } = req.body;
  const citizenId = req.user.id;

  // 1. Check if the complaint exists and belongs to the authenticated citizen
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId, citizenId }
  });

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Check if payment is already completed
  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  if (existingPayment && existingPayment.status === 'PAID') {
    throw new ApiError(400, 'Payment for this complaint is already completed.');
  }

  // 2. Generate payment amount and unique invoice number
  const amount = 100; // For testing purposes (100 BDT)
  const invoiceNumber = `INV_${complaintId.substring(0, 8)}_${Date.now()}`;

  // 3. Generate bKash Auth Token
  const token = await getBkashToken();

  // 4. Send payment creation request to bKash
  const { data } = await axios.post(
    `${process.env.BKASH_BASE_URL}/tokenized/checkout/create`,
    {
      mode: '0011',
      payerReference: citizenId,
      callbackURL: process.env.BKASH_CALLBACK_URL,
      amount: amount.toString(),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: invoiceNumber
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': token,
        'X-APP-Key': process.env.BKASH_APP_KEY
      }
    }
  );

  if (data && data.statusCode !== '0000') {
    throw new ApiError(400, `bKash Error: ${data.statusMessage}`);
  }

  // 5. Save/Update payment entry in the database
  await prisma.payment.upsert({
    where: { complaintId },
    update: {
      amount,
      transactionId: data.paymentID,
      status: 'PENDING',
      gateway: 'bKash'
    },
    create: {
      complaintId,
      citizenId,
      amount,
      transactionId: data.paymentID,
      gateway: 'bKash',
      status: 'PENDING'
    }
  });

  return sendSuccess(res, 200, 'bKash payment initiated successfully', {
    paymentUrl: data.bkashURL
  });
});

export const bkashCallback = catchAsync(async (req: Request, res: Response) => {
  const { paymentID, status } = req.query;
  const frontendUrl = getSanitizedFrontendUrl();

  if (status === 'cancel' || status === 'failure') {
    await prisma.payment.update({
      where: { transactionId: paymentID as string },
      data: { status: 'FAILED' }
    });
    return res.redirect(`${frontendUrl}/citizen/payments/bkash-result?status=failed`);
  }

  if (status === 'success') {
    try {
      const token = await getBkashToken();
      const { data } = await axios.post(
        `${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`,
        { paymentID },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': token,
            'X-APP-Key': process.env.BKASH_APP_KEY
          }
        }
      );

      if (data && data.statusCode === '0000' && data.transactionStatus === 'Completed') {
        const payment = await prisma.$transaction(async (prismaClient) => {
          const updatedPayment = await prismaClient.payment.update({
            where: { transactionId: paymentID as string },
            data: { status: 'PAID', transactionId: data.trxID }
          });
          
          await prismaClient.complaint.update({
            where: { id: updatedPayment.complaintId },
            data: { priority: 'EMERGENCY' }
          });
          
          return updatedPayment;
        });

        return res.redirect(`${frontendUrl}/citizen/payments/bkash-result?status=success&complaintId=${payment.complaintId}`);
      }
      
      
      
      
      
      
      
      
      
      
      else {
        return res.redirect(`${frontendUrl}/citizen/payments/bkash-result?status=failed`);
      }
    } catch (error) {
      return res.redirect(`${frontendUrl}/citizen/payments/bkash-result?status=failed`);
    }
  }

  return res.redirect(`${frontendUrl}/citizen/payments/bkash-result?status=failed`);
});


// ================= STRIPE INTEGRATION =================

// 1. Initiate Stripe Payment
export const initiateStripePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { complaintId } = req.body;
  const citizenId = req.user.id;

  // 1. Check if the complaint exists
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId, citizenId }
  });

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Block re-payment if already PAID
  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  if (existingPayment && existingPayment.status === 'PAID') {
    throw new ApiError(400, 'Payment for this complaint is already completed.');
  }

  const amount = 5; // 5 USD for testing
  const frontendUrl = getSanitizedFrontendUrl();

  // 2. Create Stripe Checkout Session
  // @ts-ignore
  const session = await (stripe.checkout.sessions.create as any)({
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Emergency Service Upgrade #${complaintId.slice(0, 8)}`,
            description: complaint.title,
          },
          unit_amount: amount * 100, // Stripe expects amount in cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    // Properly formatted success & cancel URLs pointing to correct frontend route
    success_url: `${frontendUrl}/citizen/payments?session_id={CHECKOUT_SESSION_ID}&complaintId=${complaintId}&status=success`,
    cancel_url: `${frontendUrl}/citizen/payments?status=cancelled`,
    client_reference_id: complaintId,
  });

  if (!session || !session.url) {
    throw new ApiError(500, 'Failed to create Stripe payment session');
  }

  // 3. Save payment entry in the database
  await prisma.payment.upsert({
    where: { complaintId },
    update: {
      amount,
      transactionId: session.id,
      status: 'PENDING',
      gateway: 'Stripe'
    },
    create: {
      complaintId,
      citizenId,
      amount,
      transactionId: session.id,
      gateway: 'Stripe',
      status: 'PENDING'
    }
  });

  return sendSuccess(res, 200, 'Stripe payment initiated successfully', {
    paymentUrl: session.url,
    sessionId: session.id
  });
});


// 2. Verify Stripe Payment (Called by frontend on success page)
export const verifyStripePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { sessionId, complaintId } = req.body;

  if (!sessionId || !complaintId) {
    throw new ApiError(400, 'Session ID and Complaint ID are required');
  }

  // Idempotency check: return success if already marked as PAID
  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  if (existingPayment && existingPayment.status === 'PAID') {
    return sendSuccess(res, 200, 'Payment already verified', null);
  }

  // Retrieve session from Stripe
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status === 'paid') {
    await prisma.$transaction(async (prismaClient) => {
      await prismaClient.payment.update({
        where: { complaintId },
        data: { 
          status: 'PAID',
          transactionId: (session.payment_intent as string) || sessionId
        }
      });

      // Elevate complaint priority to EMERGENCY
      await prismaClient.complaint.update({
        where: { id: complaintId },
        data: { priority: 'EMERGENCY' }
      });
    });

    return sendSuccess(res, 200, 'Stripe payment verified and executed successfully', null);
  } else {
    throw new ApiError(400, 'Payment was not successful or is still pending');
  }
});

// 3. Get Payment History for the authenticated citizen
export const getMyPayments = catchAsync(async (req: AuthRequest, res: Response) => {
  const citizenId = req.user.id;

  const payments = await prisma.payment.findMany({
    where: { citizenId },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, 200, 'Payment history retrieved successfully', payments);
});