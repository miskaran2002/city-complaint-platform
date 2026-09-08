import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import { globalErrorHandler } from './middlewares/error.middleware.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app: Application = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.use(helmet());

// Routes
 app.use('/api/v1/auth', authRoutes);
 app.use('/api/v1/users', userRoutes);
 app.use('/api/v1/admin', adminRoutes);

// Global Error Handler
app.use(globalErrorHandler);

export default app;