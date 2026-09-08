import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet'; import authRoutes from './routes/auth.routes.js';
import { globalErrorHandler } from './middlewares/error.middleware.js';

const app: Application = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.use(helmet());

// Routes
 app.use('/api/v1/auth', authRoutes);

// Global Error Handler
app.use(globalErrorHandler);

export default app;