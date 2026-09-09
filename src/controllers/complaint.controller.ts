import { Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';
import { AuthRequest } from '../middlewares/auth.js';

// 1. Create a new Complaint
export const createComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const citizenId = req.user.id; // logged in -citizen ID
  const { title, description, categoryId, address, latitude, longitude, imageUrl, priority } = req.body;

  // check if the category exists and get its departmentId
  const category = await prisma.category.findUnique({
    where: { id: categoryId }
  });

  if (!category) {
    throw new ApiError(404, 'Category not found');
  }

  // create the complaint (department ID will be automatically added from the category)
  const complaint = await prisma.complaint.create({
    data: {
      title,
      description,
      categoryId,
      departmentId: category.departmentId, 
      citizenId,
      address,
      latitude,
      longitude,
      imageUrl,
      priority: priority || 'LOW'
    }
  });

  return sendSuccess(res, 201, 'Complaint submitted successfully', complaint);
});

// 2. Get All Complaints (With Pagination, Filter, Search, and Role-based access)
export const getAllComplaints = catchAsync(async (req: AuthRequest, res: Response) => {
  // Pagination setup
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Query parameters for filter & search
  const { status, categoryId, searchTerm, sortBy, sortOrder } = req.query;

  // Where condition setup
  const where: any = {
    deletedAt: null // Only fetch complaints that are not soft-deleted
  };

  // 🔴 Role-based logic: If the user is a citizen, only show their complaints
  if (req.user.role === 'CITIZEN') {
    where.citizenId = req.user.id;
  }

  // Filters
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;

  // search functionality: search in title and description (case-insensitive)
  if (searchTerm) {
    where.OR = [
      { title: { contains: searchTerm as string, mode: 'insensitive' } },
      { description: { contains: searchTerm as string, mode: 'insensitive' } }
    ];
  }

  // Sorting setup
  const orderBy: any = {};
  if (sortBy) {
    orderBy[sortBy as string] = sortOrder === 'asc' ? 'asc' : 'desc';
  } else {
    orderBy.createdAt = 'desc'; // Default sorting by creation date (newest first)
  }

  // fetch data and total count from the database
  const [complaints, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { // include related category and department names for better context
        category: { select: { name: true } },
        department: { select: { name: true } }
      }
    }),
    prisma.complaint.count({ where })
  ]);

  // return the response with pagination meta
  return res.status(200).json({
    success: true,
    message: 'Complaints retrieved successfully',
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    data: complaints
  });
});

// Add this below your existing functions (createComplaint & getAllComplaints)

// 3. Get Single Complaint
export const getSingleComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } }
    }
  });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Permission Rule: Citizen can only view their own complaint
  if (req.user.role === 'CITIZEN' && complaint.citizenId !== req.user.id) {
    throw new ApiError(403, 'You do not have permission to view this complaint');
  }

  return sendSuccess(res, 200, 'Complaint retrieved successfully', complaint);
});

// 4. Update Complaint (Citizen only)
export const updateComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const updateData = req.body;

  const complaint = await prisma.complaint.findUnique({ where: { id } });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Permission Rule: Citizen can only update their own complaint
  if (req.user.role === 'CITIZEN' && complaint.citizenId !== req.user.id) {
    throw new ApiError(403, 'You do not have permission to update this complaint');
  }

  // Business Logic: Only allow update if status is still PENDING
  if (complaint.status !== 'PENDING') {
    throw new ApiError(400, 'You can only update complaints that are in PENDING status');
  }

  const updatedComplaint = await prisma.complaint.update({
    where: { id },
    data: updateData
  });

  return sendSuccess(res, 200, 'Complaint updated successfully', updatedComplaint);
});

// 5. Soft Delete Complaint
export const deleteComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const complaint = await prisma.complaint.findUnique({ where: { id } });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Permission Rule: Citizen can only delete their own complaint
  if (req.user.role === 'CITIZEN' && complaint.citizenId !== req.user.id) {
    throw new ApiError(403, 'You do not have permission to delete this complaint');
  }

  // Soft Delete: Just set the deletedAt timestamp instead of actual deletion
  await prisma.complaint.update({
    where: { id },
    data: { deletedAt: new Date() } // Record the time of deletion
  });

  return sendSuccess(res, 200, 'Complaint deleted successfully', null);
});