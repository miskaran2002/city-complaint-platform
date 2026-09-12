import { prisma } from '../config/db.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { catchAsync } from '../utils/catchAsync.js';
import bcrypt from 'bcrypt';
// Get current user profile
export const getMe = catchAsync(async (req, res) => {
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
// update user profile
export const updateMe = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { name, password } = req.body;
    const updateData = {};
    if (name)
        updateData.name = name;
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }
    // Check if there is any data to update
    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, message: 'No data provided to update' });
    }
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
        },
    });
    return sendSuccess(res, 200, 'Profile updated successfully', updatedUser);
});
