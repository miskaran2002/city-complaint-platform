// src/routes/admin.routes.ts
import { Router } from 'express';
import { getAllUsers, updateUserRole } from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { updateRoleSchema } from '../validations/admin.validation.js';
import { Role } from '@prisma/client';

const router = Router();

// Apply authentication and authorization middleware to all routes in this file
router.use(authenticate, authorize(Role.CITY_ADMIN));

// Get all users (Supports query params: ?page=1&limit=10&role=CITIZEN&search=rahim)
router.get('/users', getAllUsers);

// Update specific user role
router.patch('/users/:id/role', validate(updateRoleSchema), updateUserRole);

export default router;