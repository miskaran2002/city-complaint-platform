import { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';

export const createDepartment = catchAsync(async (req: Request, res: Response) => {
  const { name, code, description } = req.body;

  // Check if a department with the same code already exists
  const existingDept = await prisma.department.findUnique({ where: { code } });
  if (existingDept) {
    throw new ApiError(400, 'Department with this code already exists');
  }

  const department = await prisma.department.create({
    data: { name, code, description },
  });

  return sendSuccess(res, 201, 'Department created successfully', department);
});

export const getAllDepartments = catchAsync(async (req: Request, res: Response) => {
  const departments = await prisma.department.findMany({
    include: { categories: true }, // Include related categories
  });

  return sendSuccess(res, 200, 'Departments retrieved successfully', departments);
});