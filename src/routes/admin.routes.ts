import { Router } from 'express';
import { getAllUsers, updateUserRole } from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { updateRoleSchema } from '../validations/admin.validation.js';

const router = Router();

// access control: only authenticated users with ADMIN role can access these routes
router.use(authenticate, authorize('ADMIN'));

router.get('/users', getAllUsers);
router.patch('/users/:id/role', validate(updateRoleSchema), updateUserRole);

export default router;