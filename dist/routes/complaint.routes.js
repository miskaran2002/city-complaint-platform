import { Router } from 'express';
import { assignStaff, createComplaint, deleteComplaint, getAllComplaints, getSingleComplaint, submitFeedback, updateComplaint, updateComplaintStatus } from '../controllers/complaint.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { assignStaffSchema, createComplaintSchema, updateComplaintSchema } from '../validations/complaint.validation.js';
import { upload } from '../middlewares/upload.js';
import { complaintLimiter } from '../middlewares/rateLimiter.js';
const router = Router();
// Apply authentication middleware to all routes in this file
router.use(authenticate);
// 1. Only a CITIZEN can create a complaint
router.post('/', authorize('CITIZEN'), complaintLimiter, validate(createComplaintSchema), createComplaint);
// 2. 🔴 Update: CITY_ADMIN, DEPARTMENT_MANAGER, or DEPARTMENT_STAFF can assign staff 🔴
router.post('/:id/assign', authorize('CITY_ADMIN', 'DEPARTMENT_MANAGER', 'DEPARTMENT_STAFF'), validate(assignStaffSchema), assignStaff);
// 3. View routes (Authenticated users can view, controller handles role-based logic)
router.get('/', getAllComplaints);
router.get('/:id', getSingleComplaint);
// 4. Update complaint (Citizen can update their own PENDING complaint)
router.patch('/:id', validate(updateComplaintSchema), updateComplaint);
// 5. Delete complaint (Only CITY_ADMIN or the respective CITIZEN can delete)
router.delete('/:id', authorize('CITY_ADMIN', 'CITIZEN'), deleteComplaint);
// 6. Update complaint status (Only TECHNICIAN or CITY_ADMIN can update status)
router.patch('/:id/status', authorize('TECHNICIAN', 'CITY_ADMIN'), updateComplaintStatus);
// 7. Submit Citizen Feedback (Only CITIZEN can submit)
router.post('/:id/feedback', authorize('CITIZEN'), submitFeedback);
//8. Only a CITIZEN can create a complaint
router.post('/', authorize('CITIZEN'), upload.single('image'), // 🔴 image  🔴
validate(createComplaintSchema), createComplaint);
export default router;
