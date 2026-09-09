import { Router } from 'express';
import { 
  assignStaff, 
  createComplaint, 
  deleteComplaint, 
  getAllComplaints, 
  getSingleComplaint, 
  updateComplaint 
} from '../controllers/complaint.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { 
  assignStaffSchema, 
  createComplaintSchema, 
  updateComplaintSchema 
} from '../validations/complaint.validation.js';

const router = Router();

// Apply authentication middleware to all routes in this file
router.use(authenticate);

// 1. Only a CITIZEN can create a complaint
router.post(
  '/', 
  authorize('CITIZEN'), 
  validate(createComplaintSchema), 
  createComplaint
);

// 2. CITY_ADMIN or DEPARTMENT_MANAGER can assign staff
router.post(
  '/:id/assign', 
  authorize('CITY_ADMIN', 'DEPARTMENT_MANAGER'), 
  validate(assignStaffSchema), 
  assignStaff
);

// 3. View routes (Authenticated users can view, controller handles role-based logic)
router.get('/', getAllComplaints);
router.get('/:id', getSingleComplaint);

// 4. Update complaint (Citizen can update their own PENDING complaint)
router.patch('/:id', validate(updateComplaintSchema), updateComplaint);

// 5. Delete complaint (Only CITY_ADMIN or the respective CITIZEN can delete)
router.delete('/:id', authorize('CITY_ADMIN', 'CITIZEN'), deleteComplaint);

export default router;