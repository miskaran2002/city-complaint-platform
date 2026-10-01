// src/routes/admin.routes.ts
import { Router } from 'express';
import { 
  getAllUsers, 
  updateUserRole, 
  getDashboardStats, 
  getAuditLogs, 
  toggleUserStatus
} from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { updateRoleSchema } from '../validations/admin.validation.js';
import { Role } from '@prisma/client';

const router = Router();

// 1. Apply authentication middleware to all admin routes
router.use(authenticate);

// 2. Dashboard Statistics (only City Admin)
router.get('/dashboard-stats', authorize(Role.CITY_ADMIN), getDashboardStats);

// 3. Audit Logs (only City Admin)
router.get('/audit-logs', authorize(Role.CITY_ADMIN), getAuditLogs);

// 4. Get all users (City Admin and Department Staff can access)
router.get('/users', authorize(Role.CITY_ADMIN, Role.DEPARTMENT_STAFF,Role.DEPARTMENT_MANAGER), getAllUsers);

// 5. Update specific user role (only City Admin)
router.patch('/users/:id/role', authorize(Role.CITY_ADMIN), validate(updateRoleSchema), updateUserRole);
router.patch('/users/:id/status', authorize(Role.CITY_ADMIN, Role.DEPARTMENT_MANAGER), toggleUserStatus);

export default router;