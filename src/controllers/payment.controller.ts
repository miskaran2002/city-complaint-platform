// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../config/db.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getBkashToken } from '../services/bkash.service.js';
import { AuthRequest } from '../middlewares/auth.js'; // Import the AuthRequest interface
import { stripe } from '../services/stripe.service.js';

export const initiateBkashPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { complaintId } = req.body;
  const citizenId = req.user.id;

  // 1. check if the complaint exists and belongs to the authenticated citizen
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId, citizenId }
  });

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  // 2. Generate payment amount and unique invoice number
  const amount = 100; // For testing purposes, fixed at 100 BDT
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
        'Authorization': token, // The token is passed here
        'X-APP-Key': process.env.BKASH_APP_KEY
      }
    }
  );

  // If bKash returns an error
  if (data && data.statusCode !== '0000') {
    throw new ApiError(400, `bKash Error: ${data.statusMessage}`);
  }

  // 5. Save payment entry in the database (Using upsert to prevent Unique constraint error)
  await prisma.payment.upsert({
    where: { complaintId }, // Check if a payment entry already exists for this complaint
    update: {
      amount,
      transactionId: data.paymentID, // Update with the new bKash session ID
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

  // 6. Send the bKash payment page link in the response
  return sendSuccess(res, 200, 'Payment initiated successfully', {
    paymentUrl: data.bkashURL // The frontend will redirect the user to this link
  });
});


export const bkashCallback = catchAsync(async (req: Request, res: Response) => {
  const { paymentID, status } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (status === 'cancel' || status === 'failure') {
    await prisma.payment.update({
      where: { transactionId: paymentID as string },
      data: { status: 'FAILED' }
    });
    return res.redirect(`${frontendUrl}/citizen/payment/bkash-result?status=failed`);
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

        return res.redirect(`${frontendUrl}/citizen/payment/bkash-result?status=success&complaintId=${payment.complaintId}`);
      } else {
        return res.redirect(`${frontendUrl}/citizen/payment/bkash-result?status=failed`);
      }
    } catch (error) {
      return res.redirect(`${frontendUrl}/citizen/payment/bkash-result?status=failed`);
    }
  }

  return res.redirect(`${frontendUrl}/citizen/payment/bkash-result?status=failed`);
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

  // ✅ নতুন লজিক: পেমেন্ট অলরেডি PAID হয়ে থাকলে ব্লক করবে
  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  if (existingPayment && existingPayment.status === 'PAID') {
    throw new ApiError(400, 'Payment for this complaint is already completed.');
  }

  // 2. Stripe Payment Setup
  const amount = 5; // Stripe টেস্টের জন্য 5 USD সেট করা হলো (500 সেন্টস)
  
  // ফলব্যাক URL, যদি .env তে FRONTEND_URL না থাকে তবে লোকালহোস্ট কাজ করবে
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  // 3. Create Stripe Checkout Session
  // @ts-ignore
  const session = await (stripe.checkout.sessions.create as any)({
    
    line_items: [
      {
        price_data: {
          currency: 'usd', // 👈 'bdt' এর বদলে 'usd' ব্যবহার করা নিরাপদ 
          product_data: {
            name: `Emergency Service #${complaintId.slice(0, 8)}`,
            description: complaint.title,
          },
          unit_amount: amount * 100, // Stripe expects amount in cents (5 * 100 = 500)
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${frontendUrl}/citizen/payment?session_id={CHECKOUT_SESSION_ID}&complaintId=${complaintId}`,
    cancel_url: `${frontendUrl}/citizen/dashboard`,
    client_reference_id: complaintId,
  });

  if (!session || !session.url) {
    throw new ApiError(500, 'Failed to create Stripe payment session');
  }

  // 4. Save payment entry in the database
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

  // 5. Return the Stripe checkout URL to redirect the frontend
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

  // ✅ Idempotency check: payment আগে থেকেই PAID থাকলে আবার error না দিয়ে success রিটার্ন করো
  const existingPayment = await prisma.payment.findUnique({
    where: { complaintId }
  });

  if (existingPayment && existingPayment.status === 'PAID') {
    return sendSuccess(res, 200, 'Payment already verified', null);
  }

  // Retrieve the session from Stripe to ensure it was actually paid
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status === 'paid') {
    // Transaction: Update payment status + complaint priority
    await prisma.$transaction(async (prismaClient) => {
      await prismaClient.payment.update({
        where: { complaintId }, // ✅ sessionId এর বদলে complaintId দিয়ে খোঁজা (stable, কখনো বদলায় না)
        data: { 
          status: 'PAID',
          transactionId: session.payment_intent as string || sessionId
        }
      });

      // Update complaint priority to EMERGENCY
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