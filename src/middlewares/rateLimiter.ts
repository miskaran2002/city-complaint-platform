// src/middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// 1.Authentication rate limiter (to prevent brute-force attacks)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // maximum 10 requests in 15 minutes
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Complaint Creation Rate Limiter (to prevent spam)
export const complaintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // maximum 5 complaints in 1 hour
  message: {
    success: false,
    message: 'You have submitted too many complaints in a short time. Please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});