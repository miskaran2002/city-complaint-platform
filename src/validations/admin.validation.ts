import { z } from 'zod';

export const updateRoleSchema = z.object({
  body: z.object({
    role: z.enum(['CITIZEN', 'STAFF', 'ADMIN']),
  }),
});