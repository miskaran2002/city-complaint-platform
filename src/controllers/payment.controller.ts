// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { Prisma } from '@prisma/client';
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
  return url.replace(/\/$/, '');
};

/**
 * Payment complete hole complaint "submit" hoye jay:
 * PENDING_PAYMENT -> PENDING, isPaid = true
 */
const markComplaintPaid = async (tx: Prisma.TransactionClient, complaintId: string) => {
  await tx.complaint.update({
    where: { id: complaintId },
    data: {
      priority: 'EMERGENCY',
      isPaid: true,
      status: 'PENDING'
    }
  });
};

/**
 * Common checks before starting any payment (bKash or Stripe)
 */
const getPayableComplaint = async (complaintId: string, citizenId: string) => {
  if (!complaintId) {
    throw new ApiError(400, 'Complaint ID is required');
  }

  const complaint = await prisma.complaint.findFirst({
    where: { id: complaintId, citizenId, deletedAt: null }
  });

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  if (complaint.priority !== 'EMERGENCY') {
    throw new ApiError(400, 'Payment is only required for EMERGENCY complaints');
  }

  if (complaint.isPaid) {
    throw new ApiError(400, 'Payment for this complaint is already completed.');
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  if (existingPayment && existingPayment.status === 'PAID') {
    throw new ApiError(400, 'Payment for this complaint is already completed.');
  }

  return complaint;
};

// ================= BKASH INTEGRATION =================

export const initiateBkashPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { complaintId } = req.body;
  const citizenId = req.user.id;

  // 1. Validate complaint (exists, belongs to citizen, emergency, not paid yet)
  await getPayableComplaint(complaintId, citizenId);

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
        Accept: 'application/json',
        Authorization: token,
        'X-APP-Key': process.env.BKASH_APP_KEY
      }
    }
  );

  if (!data || data.statusCode !== '0000') {
    throw new ApiError(400, `bKash Error: ${data?.statusMessage || 'Failed to create payment'}`);
  }

  // 5. Save/Update payment entry (switching Stripe -> bKash replaces the old transactionId,
  //    so an old Stripe session can no longer be verified for this complaint)
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
  const resultUrl = `${frontendUrl}/citizen/payments/bkash-result`;

  if (!paymentID) {
    return res.redirect(`${resultUrl}?status=failed`);
  }

  // Which payment / complaint is this callback for?
  const payment = await prisma.payment.findUnique({
    where: { transactionId: paymentID as string }
  });

  if (!payment) {
    return res.redirect(`${resultUrl}?status=failed`);
  }

  const complaintQuery = `&complaintId=${payment.complaintId}`;

  // Already paid (duplicate callback) -> just show success
  if (payment.status === 'PAID') {
    return res.redirect(`${resultUrl}?status=success${complaintQuery}`);
  }

  // User cancelled or bKash reported failure
  if (status === 'cancel' || status === 'failure') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' }
    });
    return res.redirect(`${resultUrl}?status=failed${complaintQuery}`);
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
            Accept: 'application/json',
            Authorization: token,
            'X-APP-Key': process.env.BKASH_APP_KEY
          }
        }
      );

      if (data && data.statusCode === '0000' && data.transactionStatus === 'Completed') {
        await prisma.$transaction(async (prismaClient) => {
          await prismaClient.payment.update({
            where: { id: payment.id },
            data: { status: 'PAID', transactionId: data.trxID }
          });

          await markComplaintPaid(prismaClient, payment.complaintId);
        });

        return res.redirect(`${resultUrl}?status=success${complaintQuery}`);
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' }
      });
      return res.redirect(`${resultUrl}?status=failed${complaintQuery}`);
    } catch (error) {
      console.error('bKash execute error:', error);
      return res.redirect(`${resultUrl}?status=failed${complaintQuery}`);
    }
  }

  return res.redirect(`${resultUrl}?status=failed${complaintQuery}`);
});

// ================= STRIPE INTEGRATION =================

// 1. Initiate Stripe Payment
export const initiateStripePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { complaintId } = req.body;
  const citizenId = req.user.id;

  // Validate complaint (exists, belongs to citizen, emergency, not paid yet)
  const complaint = await getPayableComplaint(complaintId, citizenId);

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
            description: complaint.title
          },
          unit_amount: amount * 100 // Stripe expects amount in cents
        },
        quantity: 1
      }
    ],
    mode: 'payment',
    success_url: `${frontendUrl}/citizen/payments?session_id={CHECKOUT_SESSION_ID}&complaintId=${complaintId}&status=success`,
    cancel_url: `${frontendUrl}/citizen/payments?status=cancelled&complaintId=${complaintId}`,
    client_reference_id: complaintId
  });

  if (!session || !session.url) {
    throw new ApiError(500, 'Failed to create Stripe payment session');
  }

  // 3. Save payment entry (switching bKash -> Stripe replaces the old transactionId)
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

  // Complaint must belong to the logged-in citizen
  const complaint = await prisma.complaint.findFirst({
    where: { id: complaintId, citizenId: req.user.id, deletedAt: null }
  });

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  // Idempotency: already verified
  if (existingPayment?.status === 'PAID') {
    return sendSuccess(res, 200, 'Payment already verified', null);
  }

  // Session must be the CURRENT payment attempt (blocks old sessions after switching gateway)
  if (!existingPayment || existingPayment.transactionId !== sessionId) {
    throw new ApiError(400, 'This session does not belong to the current payment attempt');
  }

  // Retrieve session from Stripe
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.client_reference_id !== complaintId) {
    throw new ApiError(400, 'Session does not match this complaint');
  }

  if (session.payment_status !== 'paid') {
    throw new ApiError(400, 'Payment was not successful or is still pending');
  }

  await prisma.$transaction(async (prismaClient) => {
    await prismaClient.payment.update({
      where: { complaintId },
      data: {
        status: 'PAID',
        transactionId: (session.payment_intent as string) || sessionId
      }
    });

    await markComplaintPaid(prismaClient, complaintId);
  });

  return sendSuccess(res, 200, 'Stripe payment verified and complaint submitted', null);
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