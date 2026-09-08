import { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { registerSchema, loginSchema } from '../validations/auth.validation.js';

const router = Router();

// Register and Login routes with Zod validation
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);

export default router;