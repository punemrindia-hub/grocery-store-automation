import { z } from 'zod';

export const userRoleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'STAFF']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ status: z.string(), timestamp: z.string() }),
  error: z.null(),
  meta: z.record(z.unknown()),
});

export const apiErrorSchema = z.object({
  success: z.literal(false),
  data: z.null(),
  error: z.object({ code: z.string(), message: z.string() }),
  meta: z.record(z.unknown()).optional(),
});
