import { Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthRequest } from '../middlewares/auth.js';

export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user.id; // came from authenticate middleware

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return sendSuccess(res, 200, 'Profile retrieved successfully', user);
});