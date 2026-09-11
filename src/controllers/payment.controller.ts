// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../config/db.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getBkashToken } from '../services/bkash.service.js';
import { AuthRequest } from '../middlewares/auth.js'; // Import the AuthRequest interface

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