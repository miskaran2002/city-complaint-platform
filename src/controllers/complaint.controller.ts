import { Response } from 'express';
import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';
import { AuthRequest } from '../middlewares/auth.js';
import { uploadToCloudinary } from '../utils/uploadToCloudinary.js';

/// 1. Create a new Complaint
export const createComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const citizenId = req.user.id;
  const { title, description, categoryId, address, latitude, longitude, priority } = req.body;

  // Check if the category exists and get its departmentId
  const category = await prisma.category.findUnique({
    where: { id: categoryId }
  });

  if (!category) {
    throw new ApiError(404, 'Category not found');
  }

  // Handle image upload
  let imageUrl = req.body.imageUrl;
  if (req.file) {
    imageUrl = await uploadToCloudinary(req.file.buffer, 'city-complaints');
  }

  const isEmergency = priority === 'EMERGENCY';

  // Create complaint record
  // EMERGENCY -> PENDING_PAYMENT (hidden from staff/admin until payment is completed)
  // Others    -> PENDING (submitted immediately)
  const complaint = await prisma.complaint.create({
    data: {
      title,
      description,
      categoryId,
      departmentId: category.departmentId,
      citizenId,
      address,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      imageUrl,
      priority: priority || 'LOW',
      isPaid: false,
      status: isEmergency ? 'PENDING_PAYMENT' : 'PENDING'
    }
  });

  return sendSuccess(
    res,
    201,
    isEmergency
      ? 'Complaint saved. Complete payment to submit it.'
      : 'Complaint submitted successfully',
    { ...complaint, requiresPayment: isEmergency }
  );
});

// 2. Get All Complaints (With Pagination, Filter, Search, and Role-based access)
export const getAllComplaints = catchAsync(async (req: AuthRequest, res: Response) => {
  const { role, id: userId, departmentId } = req.user;
  
  // 1. URL query parameters for filtering
  const { status, priority } = req.query; 

  // 2. Initialize the where condition for Prisma query
  let whereCondition: any = { deletedAt: null }; 

  // 3. Role-based Access & Payment Visibility Logic
  if (role === 'CITIZEN') {
    // Citizen can see all their own complaints
    whereCondition.citizenId = userId; 
  } 
  else if (role === 'TECHNICIAN') {
    // 🔴 FIXED (Issue 2 & 3): Technician ONLY sees complaints assigned to them
    whereCondition.assignments = {
      some: { technicianId: userId }
    };
  } 
  else {
    // Admin, Manager, Staff (Hide unpaid emergency complaints)
    whereCondition.OR = [
      { isPaid: true },
      { priority: { not: 'EMERGENCY' } }
    ];

    // Staff & Manager only see their own department's complaints
    if (role === 'DEPARTMENT_MANAGER' || role === 'DEPARTMENT_STAFF') {
      whereCondition.departmentId = departmentId;
    }
    // CITY_ADMIN gets no department restriction
  }

  // 4. Search / Filter logic
  if (status) {
    whereCondition.status = status;
  }
  if (priority) {
    whereCondition.priority = priority;
  }

  // 5. Execute Prisma query
  const complaints = await prisma.complaint.findMany({
    where: whereCondition,
    orderBy: { createdAt: 'desc' },
    include: {
      citizen: {
        select: {
          name: true,
          email: true
        }
      },
      category: {
        select: {
          name: true
        }
      },
      department: {
        select: {
          name: true
        }
      },
      payment: true // Payment status details
    }
  });

  return res.status(200).json({
    success: true,
    message: 'Complaints retrieved successfully',
    meta: {
      total: complaints.length,
    },
    data: complaints
  });
});
// 3. Get Single Complaint
export const getSingleComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      payment: true
    }
  });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Permission Rule: Citizen can only view their own complaint
  if (req.user.role === 'CITIZEN' && complaint.citizenId !== req.user.id) {
    throw new ApiError(403, 'You do not have permission to view this complaint');
  }

  // Unpaid emergency drafts are invisible to everyone except the owner citizen
  if (req.user.role !== 'CITIZEN' && complaint.status === 'PENDING_PAYMENT') {
    throw new ApiError(404, 'Complaint not found');
  }

  return sendSuccess(res, 200, 'Complaint retrieved successfully', complaint);
});

// 4. Update Complaint (Citizen only)
export const updateComplaint = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

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

  // Whitelist fields so nobody can change isPaid / priority / status via the request body
  const { title, description, address, latitude, longitude, imageUrl } = req.body;
  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (address !== undefined) updateData.address = address;
  if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(latitude) : null;
  if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(longitude) : null;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

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
    data: { deletedAt: new Date() }
  });

  return sendSuccess(res, 200, 'Complaint deleted successfully', null);
});

// 6. Assign Staff to a Complaint (Admin, Manager, Staff)
export const assignStaff = catchAsync(async (req: AuthRequest, res: Response) => {
  const complaintId = req.params.id as string;
  const { technicianId, notes } = req.body;

  const assignerId = req.user.id;
  const assignerRole = req.user.role;

  // Extract departmentId from the assigner user object
  const assigner = await prisma.user.findUnique({
    where: { id: assignerId },
    select: { departmentId: true }
  });

  if (!assigner) {
    throw new ApiError(404, 'Assigning user not found in database');
  }

  const assignerDeptId = assigner.departmentId;

  // 1. Verify if the complaint exists
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId }
  });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // Unpaid emergency complaints cannot be assigned
  if (complaint.status === 'PENDING_PAYMENT') {
    throw new ApiError(400, 'Cannot assign: payment for this complaint is not completed');
  }

  // Security Check - Manager/Staff can only assign to their own department's complaints
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
    throw new ApiError(400, "Technician does not belong to the complaint's department");
  }

  // 3. Perform Transaction (Create Assignment, Update Status, Create Log)
  const [assignment, updatedComplaint] = await prisma.$transaction([
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

  if (complaint.status === 'PENDING_PAYMENT') {
    throw new ApiError(400, 'Payment for this complaint is not completed');
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
  const [updatedComplaint] = await prisma.$transaction([
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

// 8. Submit Feedback (Citizen Only)
export const submitFeedback = catchAsync(async (req: AuthRequest, res: Response) => {
  const complaintId = req.params.id as string;
  const citizenId = req.user.id;
  const { rating, comment } = req.body;

  // 1. Validate rating input
  if (rating < 1 || rating > 5) {
    throw new ApiError(400, 'Rating must be a number between 1 and 5');
  }

  // 2. Validate complaint
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId }
  });

  if (!complaint || complaint.deletedAt !== null) {
    throw new ApiError(404, 'Complaint not found');
  }

  // 3. Security Check: Is this the citizen's own complaint?
  if (complaint.citizenId !== citizenId) {
    throw new ApiError(403, 'You can only submit feedback for your own complaints');
  }

  // 4. Logic Check: Can feedback be submitted for this complaint?
  if (complaint.status !== 'RESOLVED' && complaint.status !== 'CLOSED') {
    throw new ApiError(400, 'Feedback can only be submitted for RESOLVED complaints');
  }

  // 5. Double Feedback Check: Has feedback already been submitted?
  const existingFeedback = await prisma.feedback.findUnique({
    where: { complaintId }
  });

  if (existingFeedback) {
    throw new ApiError(400, 'Feedback has already been submitted for this complaint');
  }

  // 6. Submit Feedback
  const feedback = await prisma.feedback.create({
    data: {
      complaintId,
      citizenId,
      rating,
      comment
    }
  });

  return sendSuccess(res, 201, 'Feedback submitted successfully', feedback);
});