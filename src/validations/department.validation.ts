import { z } from 'zod';

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Department name must be at least 2 characters'),
    code: z.string().min(2, 'Department code must be at least 2 characters'),
    description: z.string().optional(),
  }),
});