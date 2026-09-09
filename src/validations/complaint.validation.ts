import { z } from 'zod';

export const createComplaintSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Title must be at least 5 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    categoryId: z.string().min(1, 'Category ID is required'), // This line has been fixed
    address: z.string().min(3, 'Address is required'),
    
    // Optional fields
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    imageUrl: z.string().url('Invalid image URL').optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
  }),
  
});



export const updateComplaintSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Title must be at least 5 characters').optional(),
    description: z.string().min(10, 'Description must be at least 10 characters').optional(),
    address: z.string().min(3, 'Address is required').optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
    imageUrl: z.string().url('Invalid image URL').optional(),
  }),
});