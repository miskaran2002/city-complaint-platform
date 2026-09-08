import { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';

export const createCategory = catchAsync(async (req: Request, res: Response) => {
  const { name, description, departmentId } = req.body;

  // Check if the department exists
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    throw new ApiError(404, 'Department not found');
  }

  const category = await prisma.category.create({
    data: { name, description, departmentId },
  });

  return sendSuccess(res, 201, 'Category created successfully', category);
});

export const getAllCategories = catchAsync(async (req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { department: true }, // Include the related department
  });

  return sendSuccess(res, 200, 'Categories retrieved successfully', categories);
});