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
  const { role, id: userId, departmentId } = req.user;
  
  // 1. url into query parameters for filtering
  const { status, priority } = req.query; 

  //2. Initialize the where condition for Prisma query
  let whereCondition: any = { deletedAt: null }; 

  // 2. Role-based Access Logic
  if (role === 'CITIZEN') {
    whereCondition.citizenId = userId; 
  } else if (role === 'DEPARTMENT_MANAGER' || role === 'DEPARTMENT_STAFF' || role === 'TECHNICIAN') {
    whereCondition.departmentId = departmentId;
  }
  //for CITY_ADMIN, no additional filtering is needed; they can see all complaints

  // 3. 🔴 search/filter logic 🔴
  if (status) {
    whereCondition.status = status;
  }
  if (priority) {
    whereCondition.priority = priority;
  }

  // 4. do the actual query to get complaints based on the constructed where condition
  const complaints = await prisma.complaint.findMany({
    where: whereCondition,
    // include related data for better context
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({
    success: true,
    message: 'Complaints retrieved successfully',
    meta: {
      total: complaints.length,
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


// 6. Assign Staff to a Complaint (Admin, Manager, Staff)
export const assignStaff = catchAsync(async (req: AuthRequest, res: Response) => {
  const complaintId = req.params.id as string;
  const { technicianId, notes } = req.body;
  
  // 🔴 Update: Extract role and departmentId from req.user 🔴
  const assignerId = req.user.id;
  const assignerRole = req.user.role;
  const assignerDeptId = req.user.departmentId;

  // 1. Verify if the complaint exists
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId }
  });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // 🔴 Update: Security Check - Manager/Staff can only assign to their own department's complaints 🔴
  if (assignerRole !== 'CITY_ADMIN') {
    if (assignerDeptId !== complaint.departmentId) {
      throw new ApiError(403, 'You can only assign staff to complaints within your own department');
    }
  }

  // 2. Verify if the technician exists and is actually a TECHNICIAN
  const technician = await prisma.user.findUnique({
    where: { id: technicianId }
  });

  if (!technician || technician.role !== 'TECHNICIAN') {
    throw new ApiError(400, 'Invalid technician ID or user is not a TECHNICIAN');
  }

  // Business Logic: Technician must belong to the same department as the complaint
  if (technician.departmentId !== complaint.departmentId) {
    throw new ApiError(400, 'Technician does not belong to the complaint\'s department');
  }

  // 3. Perform Transaction (Create Assignment, Update Status, Create Log)
  const [assignment, updatedComplaint, log] = await prisma.$transaction([
    // A. Create the assignment record
    prisma.assignment.create({
      data: {
        complaintId,
        technicianId,
        assignedById: assignerId,
        notes
      }
    }),
    // B. Auto-update complaint status to ASSIGNED
    prisma.complaint.update({
      where: { id: complaintId },
      data: { status: 'ASSIGNED' }
    }),
    // C. Keep a record in StatusLog
    prisma.statusLog.create({
      data: {
        complaintId,
        changedById: assignerId,
        oldStatus: complaint.status,
        newStatus: 'ASSIGNED',
        note: notes || 'Assigned to a technician'
      }
    })
  ]);

  return sendSuccess(res, 201, 'Staff assigned successfully', {
    assignment,
    complaint: updatedComplaint
  });
});
// 7. Update Complaint Status by Technician (IN_PROGRESS or RESOLVED)
export const updateComplaintStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const complaintId = req.params.id as string;
  const { status, note } = req.body;
  const technicianId = req.user.id;

  // 1. Validate the status input
  if (!['IN_PROGRESS', 'RESOLVED'].includes(status)) {
    throw new ApiError(400, 'Invalid status update. Only IN_PROGRESS or RESOLVED are allowed.');
  }

  // 2. Check the complaint

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId }
  });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // 3. Security Check: Is this complaint actually assigned to this technician?
  const assignment = await prisma.assignment.findFirst({
    where: {
      complaintId,
      technicianId
    }
  });

  if (!assignment && req.user.role !== 'CITY_ADMIN') {
    throw new ApiError(403, 'You are not assigned to this complaint');
  }

  const oldStatus = complaint.status;

  // 4. Update status and create log within a transaction
  const [updatedComplaint, statusLog] = await prisma.$transaction([
    prisma.complaint.update({
      where: { id: complaintId },
      data: { status }
    }),
    prisma.statusLog.create({
      data: {
        complaintId,
        changedById: technicianId,
        oldStatus,
        newStatus: status,
        note: note || `Status updated to ${status} by technician`
      }
    })
  ]);

  return sendSuccess(res, 200, `Complaint status updated to ${status} successfully`, {
    complaint: updatedComplaint
  });
});