import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { prisma } from '../config/db.js';

export const register = catchAsync(async (req: Request, res: Response) => {
  // 1.req.boby with destructuring
  const { name, email, password, role, departmentId } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ApiError(400, 'Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // 2. Create the user in the database
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || 'CITIZEN', // if there is no role
      departmentId: departmentId || null, // department if null
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true, // for resposnse
      createdAt: true,
    },
  });

  return sendSuccess(res, 201, 'User registered successfully', user);
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.isDeleted) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    throw new ApiError(401, 'Invalid email or password');
  }

  // 3.access token for 
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role, 
      departmentId: user.departmentId 
    },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '1d') as any }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
  );

  return sendSuccess(res, 200, 'Login successful', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId, // login response
    },
    accessToken,
    refreshToken,
  });
});