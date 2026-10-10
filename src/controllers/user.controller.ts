import { Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthRequest } from '../middlewares/auth.js';
import { ApiError } from '../utils/ApiError.js'; // 👈 ApiError import kora hoyeche
import bcrypt from 'bcrypt';

// 1. Get current user profile
export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user.id; // came from authenticate middleware

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      department: { // 👈 Department details add kora hoyeche
        select: { name: true }
      },
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return sendSuccess(res, 200, 'Profile retrieved successfully', user);
});

// 2. Update user profile
export const updateMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user.id;
  const { name, password } = req.body;

  const updateData: any = {};
  
  if (name) updateData.name = name;
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  // Check if there is any data to update
  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, 'No data provided to update'); // 👈 ApiError use kora hoyeche consistency er jonno
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      department: { select: { name: true } },
      createdAt: true,
    },
  });

  return sendSuccess(res, 200, 'Profile updated successfully', updatedUser);
});

// 3. Get All Users (With Role & Department Filtering for the Assignment Modal)
export const getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { role: queryRole } = req.query; // e.g., ?role=TECHNICIAN
  const userRole = req.user.role;
  const userDeptId = req.user.departmentId;

  let whereCondition: any = {};

  // Jodi frontend theke specific role er user chay (jemon Technician assignment modal)
  if (queryRole) {
    whereCondition.role = queryRole;
  }

  // 🎯 SECURITY & FILTERING LOGIC:
  if (userRole === 'DEPARTMENT_MANAGER' || userRole === 'DEPARTMENT_STAFF') {
    // Manager ba Staff shudhu tader nijer department er user/technician dekhbe
    whereCondition.departmentId = userDeptId;
  } else if (userRole === 'TECHNICIAN' || userRole === 'CITIZEN') {
    // Technician ba Citizen onno kono user der list dekhte parbe na
    throw new ApiError(403, 'You do not have permission to view users');
  }
  // CITY_ADMIN er jonno kono restriction nei, tara shobai ke dekhbe

  const users = await prisma.user.findMany({
    where: whereCondition,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      department: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, 200, 'Users retrieved successfully', users);
});