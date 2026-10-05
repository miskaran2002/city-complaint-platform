// src/controllers/admin.controller.ts
import { Response } from 'express';
import { prisma } from '../config/db.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { AuthRequest } from '../middlewares/auth.js';

// ১. Get all users (with pagination, search & department filtering)
export const getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const role = req.query.role as string;
  const search = req.query.search as string;
  const queryDepartmentId = req.query.departmentId as string;

  const whereClause: any = { isDeleted: false };

  if (role) {
    whereClause.role = role;
  }

  // ⚠️ rule: If the logged-in user is DEPARTMENT_STAFF or DEPARTMENT_MANAGER,  // they can only see users from their own department.
  // If the admin wants, they can also filter by departmentId via query parameter.

  if (req.user?.role === 'DEPARTMENT_STAFF' || req.user?.role === 'DEPARTMENT_MANAGER') {
    whereClause.departmentId = req.user.departmentId;
  } else if (queryDepartmentId) {
    // admin can filter by departmentId if provided in the query
    whereClause.departmentId = queryDepartmentId;
  }

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true, // 👈 departmentId selected
        isBanned: true,
        createdAt: true,
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  return sendSuccess(res, 200, 'Users retrieved successfully', {
    users,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ২. Update user role
export const updateUserRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const targetUserId = req.params.id as string;
  const { role } = req.body;
  const currentAdminId = req.user.id;

  if (targetUserId === currentAdminId) {
    throw new ApiError(403, 'Action forbidden: You cannot change your own role.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser || targetUser.isDeleted) {
    throw new ApiError(404, 'User not found or deactivated.');
  }

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return sendSuccess(res, 200, 'User role updated successfully', updatedUser);
});

// ৩. Get Dashboard Statistics
export const getDashboardStats = catchAsync(async (req: AuthRequest, res: Response) => {
  // ==========================================
  // ১. Basic Counts 
  // ==========================================
  const totalUsers = await prisma.user.count({ where: { isDeleted: false } });
  const totalComplaints = await prisma.complaint.count();
  
  const pendingComplaints = await prisma.complaint.count({ where: { status: 'PENDING' } });
  const inProgressComplaints = await prisma.complaint.count({ where: { status: 'IN_PROGRESS' } });
  const resolvedComplaints = await prisma.complaint.count({ where: { status: 'RESOLVED' } });

  const successfulPayments = await prisma.payment.count({ where: { status: 'PAID' } });
  const paymentsSum = await prisma.payment.aggregate({
    where: { status: 'PAID' },
    _sum: { amount: true },
  });

  // ==========================================
  // ২. Users By Role (Pie Chart এর জন্য)
  // ==========================================
  const usersGrouped = await prisma.user.groupBy({
    by: ['role'],
    _count: { role: true },
    where: { isDeleted: false },
  });
  
  
  const roleColors: Record<string, string> = {
    CITIZEN: '#8B5CF6',
    DEPARTMENT_STAFF: '#10B981',
    TECHNICIAN: '#F59E0B',
    DEPARTMENT_MANAGER: '#3B82F6',
    CITY_ADMIN: '#EF4444',
  };

  const byRole = usersGrouped.map((item) => ({
    name: item.role.replace('_', ' '), 
    value: item._count.role,
    color: roleColors[item.role] || '#CBD5E1',
  }));

  // ==========================================
  // ৩. Departments & Category Count (Bar Chart )
  // ==========================================
  const totalDepartments = await prisma.department.count();
  const departmentsData = await prisma.department.findMany({
    include: {
      _count: {
        select: { categories: true }, 
      },
    },
  });

  const categoryCount = departmentsData.map((dept) => ({
    name: dept.code, 
    categories: dept._count.categories,
  }));

  // ==========================================
  // ৪. Monthly Revenue Trend (Area Chart )
  // ==========================================
  
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1); 

  const recentPayments = await prisma.payment.findMany({
    where: { 
      status: 'PAID',
      createdAt: { gte: sixMonthsAgo }
    },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyMap = new Map<string, number>();

  recentPayments.forEach((payment) => {
    const monthStr = monthNames[payment.createdAt.getMonth()];
    const currentAmt = monthlyMap.get(monthStr) || 0;
    monthlyMap.set(monthStr, currentAmt + Number(payment.amount));
  });

  // Map to Array for Chart
  const monthlyTrend = Array.from(monthlyMap, ([month, amount]) => ({ month, amount }));

  // ==========================================
  // ৫. Final Response Return
  // ==========================================
  return sendSuccess(res, 200, 'Dashboard statistics retrieved successfully', {
    users: { 
      total: totalUsers,
      byRole: byRole // 🔴 dynamic
    },
    complaints: {
      total: totalComplaints,
      pending: pendingComplaints,
      inProgress: inProgressComplaints,
      resolved: resolvedComplaints,
    },
    departments: {
      total: totalDepartments,
      categoryCount: categoryCount // 🔴 dynamic department data
    },
    payments: {
      successful: successfulPayments,
      totalRevenue: paymentsSum._sum.amount || 0,
      monthlyTrend: monthlyTrend.length > 0 ? monthlyTrend : [
        // if no payments in the last 6 months, return default data
        { month: 'No Data', amount: 0 } 
      ] 
    },
  });
});

// ৪. Get Audit Logs (Track system changes)
export const getAuditLogs = catchAsync(async (req: AuthRequest, res: Response) => {
  // here we are fetching the latest 5 users and complaints to simulate audit logs
  const recentUsers = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { name: true, role: true, createdAt: true }
  });

  const recentComplaints = await prisma.complaint.findMany({
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: { title: true, status: true, updatedAt: true }
  });

  // dynamically creating logs based on recent activities
  const logs = [
    ...recentUsers.map(user => ({
      action: 'NEW_USER_JOINED',
      details: `${user.name} joined the system as ${user.role}`,
      timestamp: user.createdAt
    })),
    ...recentComplaints.map(comp => ({
      action: 'COMPLAINT_UPDATED',
      details: `Complaint "${comp.title.substring(0, 20)}..." is now ${comp.status}`,
      timestamp: comp.updatedAt
    }))
  ];

  // sorting logs by timestamp to show the latest activities first
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return sendSuccess(res, 200, 'System audit logs retrieved successfully', logs);
});

//5. Toggle User Ban/Unban Status
export const toggleUserStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.params.id;

  const user = await prisma.user.findUnique({ where: { id: userId as string } });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Status ulte dewa (banned thakle unban hobe, active thakle ban hobe)
  const updatedUser = await prisma.user.update({
    where: { id: userId as string },
    data: { isBanned: !user.isBanned }
  });

  return sendSuccess(res, 200, 'User ban status updated successfully', updatedUser);
});