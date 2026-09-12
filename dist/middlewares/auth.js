import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { prisma } from '../config/db.js';
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ApiError(401, 'Unauthorized access. No token provided.');
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, role: true, isDeleted: true },
        });
        if (!user || user.isDeleted) {
            throw new ApiError(401, 'User no longer exists or is deactivated.');
        }
        req.user = user;
        next();
    }
    catch (error) {
        next(error);
    }
};
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. You do not have permission to perform this action.',
                errors: [],
            });
        }
        next();
    };
};
