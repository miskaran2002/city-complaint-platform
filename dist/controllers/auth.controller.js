import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { prisma } from '../config/db.js';
import { OAuth2Client } from 'google-auth-library';
export const register = catchAsync(async (req, res) => {
    // 1.req.boby with destructuring
    const { name, email, password, role, departmentId } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new ApiError(400, 'Email already registered');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // 2. Create the user in the database
    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role: role || 'CITIZEN', // if there is no role
            departmentId: departmentId || null, // department if null
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            departmentId: true, // for resposnse
            createdAt: true,
        },
    });
    return sendSuccess(res, 201, 'User registered successfully', user);
});
export const login = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isDeleted) {
        throw new ApiError(401, 'Invalid email or password');
    }
    // / 🔴 new check for google login
    if (!user.password) {
        throw new ApiError(400, 'This account uses Google login. Please sign in with Google.');
    }
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (!isPasswordMatched) {
        throw new ApiError(401, 'Invalid email or password');
    }
    // 3.access token for 
    const accessToken = jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId
    }, process.env.JWT_ACCESS_SECRET, { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '1d') });
    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') });
    return sendSuccess(res, 200, 'Login successful', {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            departmentId: user.departmentId, // login response
        },
        accessToken,
        refreshToken,
    });
});
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
export const googleLogin = catchAsync(async (req, res) => {
    //1.from req.body, get the idToken
    const { idToken } = req.body;
    // 2. Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
        throw new ApiError(401, 'Invalid Google token');
    }
    const { email, name, sub: googleId } = payload;
    // 3. Check if the user already exists in the database
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
        // 4.if the user exists, check if the account is deactivated
        if (user.isDeleted) {
            throw new ApiError(401, 'This account has been deactivated');
        }
        // googleId is not set, set it now for future logins
        if (!user.googleId) {
            user = await prisma.user.update({
                where: { email },
                data: { googleId, provider: 'google' },
            });
        }
    }
    else {
        // 4. if the user does not exist, create a new user with the Google info
        user = await prisma.user.create({
            data: {
                name: name || 'Google User',
                email,
                googleId,
                provider: 'google',
                password: null, // no password since it's a social login
                role: 'CITIZEN', // default role for new users
            },
        });
    }
    // 5. Generate access and refresh tokens for the user
    const accessToken = jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
    }, process.env.JWT_ACCESS_SECRET, { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '1d') });
    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') });
    return sendSuccess(res, 200, 'Google login successful', {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            departmentId: user.departmentId,
        },
        accessToken,
        refreshToken,
    });
});
