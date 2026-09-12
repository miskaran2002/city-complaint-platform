import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    // Updated with the 5 new roles from Prisma schema
    role: z.enum([
      'CITIZEN', 
      'DEPARTMENT_STAFF', 
      'TECHNICIAN', 
      'DEPARTMENT_MANAGER', 
      'CITY_ADMIN'
    ]).optional(),
    departmentId: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});


// google login schema
export const googleLoginSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Google ID token is required'),
  }),
});