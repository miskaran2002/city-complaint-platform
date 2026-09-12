import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createDepartmentSchema } from '../validations/department.validation.js';
import { createDepartment, getAllDepartments } from '../controllers/depatment.controller.js';
const router = Router();
router.get('/', getAllDepartments); // Anyone can view
router.post('/', authenticate, authorize('CITY_ADMIN'), validate(createDepartmentSchema), createDepartment); // Only Admin can create
export default router;
