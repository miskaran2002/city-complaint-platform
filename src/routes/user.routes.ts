import { Router } from 'express';
import { getAllUsers, getMe, updateMe } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { updateProfileSchema } from '../validations/user.validation.js';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, validate(updateProfileSchema), updateMe); 
router.get('/', authenticate, getAllUsers); 

export default router;