import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is missing in .env');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  // apiVersion 
});