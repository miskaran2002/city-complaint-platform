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

  // 1. Validate the query parameters
  if (status === 'cancel' || status === 'failure') {
    await prisma.payment.update({
      where: { transactionId: paymentID as string },
      data: { status: 'FAILED' }
    });
    // frontend will redirect to failed page
    return sendSuccess(res, 400, `Payment ${status}`, null); 
  }

  if (status === 'success') {
    try {
      // 2. Get the payment status from bKash's server
      const token = await getBkashToken();

      // 3. Execute the payment to confirm it
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

      // 4. If the payment is successful, update the database (using Transaction)
      if (data && data.statusCode === '0000' && data.transactionStatus === 'Completed') {
        
        // Transaction: Update payment status + complaint priority
        await prisma.$transaction(async (prismaClient) => {
          const updatedPayment = await prismaClient.payment.update({
            where: { transactionId: paymentID as string },
            data: { 
              status: 'PAID', 
              transactionId: data.trxID 
            }
          });

          // complaint priority update to EMERGENCY if payment is successful
          await prismaClient.complaint.update({
            where: { id: updatedPayment.complaintId },
            data: { priority: 'EMERGENCY' }
          });
        });

        // frontend will redirect to success page
        return sendSuccess(res, 200, 'Payment executed successfully', { trxId: data.trxID });
      } else {
        throw new ApiError(400, `Payment Execution Failed: ${data.statusMessage}`);
      }
    } catch (error) {
      throw new ApiError(500, 'Error while executing bKash payment');
    }
  }

  throw new ApiError(400, 'Invalid payment request');
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

  // Retrieve the session from Stripe to ensure it was actually paid
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status === 'paid') {
    // Transaction: Update payment status + complaint priority
    await prisma.$transaction(async (prismaClient) => {
      await prismaClient.payment.update({
        where: { transactionId: sessionId },
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