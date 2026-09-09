import { Router } from 'express';
import { assignStaff, createComplaint, deleteComplaint, getAllComplaints, getSingleComplaint, updateComplaint } from '../controllers/complaint.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { assignStaffSchema, createComplaintSchema, updateComplaintSchema } from '../validations/complaint.validation.js';

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

// Admin Workflow: Assign Staff
router.post(
  '/:id/assign', 
  authorize('ADMIN'), 
  validate(assignStaffSchema), 
  assignStaff
);

// Any authenticated user can view complaints 
// (The controller handles which data to show based on the user's role)
router.get('/', getAllComplaints);
router.get('/:id', getSingleComplaint);
router.patch('/:id', validate(updateComplaintSchema), updateComplaint);
router.delete('/:id', authorize('ADMIN', 'CITIZEN'), deleteComplaint); // Only an ADMIN or CITIZEN can delete a complaint

export default router;