// src/routes/admin.routes.ts
import { Router } from 'express';
import { getAllUsers, updateUserRole, getDashboardStats, getAuditLogs } from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { updateRoleSchema } from '../validations/admin.validation.js';
import { Role } from '@prisma/client';
const router = Router();
// Apply authentication and authorization middleware to ALL admin routes
router.use(authenticate, authorize(Role.CITY_ADMIN));
// 1. Dashboard Statistics
router.get('/dashboard-stats', getDashboardStats);
// 2. Audit Logs (System Activity)
router.get('/audit-logs', getAuditLogs);
// 3. Get all users (Supports query params: ?page=1&limit=10&role=CITIZEN&search=rahim)
router.get('/users', getAllUsers);
// 4. Update specific user role
router.patch('/users/:id/role', validate(updateRoleSchema), updateUserRole);
export default router;
