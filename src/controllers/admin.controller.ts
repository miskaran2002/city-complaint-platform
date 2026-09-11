// src/controllers/admin.controller.ts
import { Response } from 'express';
import { prisma } from '../config/db.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { AuthRequest } from '../middlewares/auth.js';

// Get all users
export const getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const role = req.query.role as string;
  const search = req.query.search as string;

  // dynamically build the where clause based on query parameters
  const whereClause: any = { isDeleted: false };

  if (role) {
    whereClause.role = role;
  }

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  // fetch data and total count together
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  return sendSuccess(res, 200, 'Users retrieved successfully', {
    users,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Update user role
export const updateUserRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const targetUserId = req.params.id as string;
  const { role } = req.body;
  const currentAdminId = req.user.id;

  // Security check: Admin should not be able to change their own role
  if (targetUserId === currentAdminId) {
    throw new ApiError(403, 'Action forbidden: You cannot change your own role.');
  }

  // Check if the target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser || targetUser.isDeleted) {
    throw new ApiError(404, 'User not found or deactivated.');
  }

  // Update the user's role
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return sendSuccess(res, 200, 'User role updated successfully', updatedUser);
});