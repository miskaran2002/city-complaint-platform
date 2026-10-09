import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import { globalErrorHandler } from './middlewares/error.middleware.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import categoryRoutes from './routes/category.routes.js';
import departmentRoutes from './routes/department.routes.js';
import complaintRoutes from './routes/complaint.routes.js';
import paymentRoutes from './routes/payment.routes.js';

const app: Application = express();

// Allowed origins setup (Local + Environment Variable + Vercel Domain)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// CORS Config
app.use(
  cors({
    origin: (origin, callback) => {
      // Postman, cURL ba server-to-server request-er jonno origin undefined thakle allow hobe
      if (!origin) return callback(null, true);

      // Allowed origins ba sorasori Vercel deployment URL (.vercel.app) matching
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }

      return callback(new Error('CORS Policy: Request origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middlewares
app.use(express.json());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Image/media cross-origin loading-e jeno problem na hoy
  })
);

// Health check route (root)
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'City Complaint & Service Platform API is running 🚀',
  });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/payments', paymentRoutes);

// Global Error Handler
app.use(globalErrorHandler);

export default app;