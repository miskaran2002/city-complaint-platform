import { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';

export const createDepartment = catchAsync(async (req: Request, res: Response) => {
  // 🔴 image url field is optional
  const { name, code, description, imageUrl } = req.body;

  // Check if a department with the same code already exists
  const existingDept = await prisma.department.findUnique({ where: { code } });
  if (existingDept) {
    throw new ApiError(400, 'Department with this code already exists');
  }

  const department = await prisma.department.create({
    data: { name, code, description, imageUrl }, // 🔴 for database save
  });

  return sendSuccess(res, 201, 'Department created successfully', department);
});

export const getAllDepartments = catchAsync(async (req: Request, res: Response) => {
  const departments = await prisma.department.findMany({
    include: { categories: true }, // Include related categories
  });

  return sendSuccess(res, 200, 'Departments retrieved successfully', departments);
});

// 🔴 for single department
export const getSingleDepartment = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const department = await prisma.department.findUnique({
    where: { id: id as string },
    include: { 
      categories: true, 
      users: {
        select: { id: true, name: true, email: true, role: true } 
      }, 
      complaints: true 
    },
  });

  if (!department) {
    throw new ApiError(404, 'Department not found');
  }

  return sendSuccess(res, 200, 'Department retrieved successfully', department);
});