import { Router } from 'express';
import { createComplaint, getAllComplaints } from '../controllers/complaint.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createComplaintSchema } from '../validations/complaint.validation.js';

const router = Router();

// Apply authentication middleware to all routes in this file
router.use(authenticate);

// Only a CITIZEN can create a complaint
router.post(
  '/',
  authorize('CITIZEN'),
  validate(createComplaintSchema),
  createComplaint
);

// Any authenticated user can view complaints 
// (The controller handles which data to show based on the user's role)
router.get('/', getAllComplaints);

export default router;