import { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';

export const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, 200, 'All users retrieved successfully', users);
});

export const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string; 
  const { role } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true }
  });

  return sendSuccess(res, 200, 'User role updated successfully', updatedUser);
});