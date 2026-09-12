import { z } from 'zod';
import { Role } from '@prisma/client';
export const updateRoleSchema = z.object({
    body: z.object({
        role: z.nativeEnum(Role, {
            message: 'Invalid role. Please provide a valid role.',
        }),
    }),
});
