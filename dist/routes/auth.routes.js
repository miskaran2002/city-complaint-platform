import { Router } from 'express';
import { register, login, googleLogin } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { registerSchema, loginSchema } from '../validations/auth.validation.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
const router = Router();
// Register and Login routes with Zod validation
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/sign-in', authLimiter, login);
import { googleLoginSchema } from '../validations/auth.validation.js';
router.post('/google', validate(googleLoginSchema), googleLogin);
export default router;
