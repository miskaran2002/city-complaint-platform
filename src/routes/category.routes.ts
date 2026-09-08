import { Router } from 'express';
import { createCategory, getAllCategories } from '../controllers/category.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createCategorySchema } from '../validations/category.validation.js';

const router = Router();

router.get('/', getAllCategories); // Anyone can view
router.post('/', authenticate, authorize('ADMIN'), validate(createCategorySchema), createCategory); // Only Admin can create

export default router;