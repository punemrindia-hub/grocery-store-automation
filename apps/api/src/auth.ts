import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

export type AuthContext = { userId: string; shopId: string; role: string };

export async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);
  }

  const user = request.user as { sub?: unknown; shopId?: unknown; role?: unknown };
  if (typeof user.sub !== 'string' || typeof user.shopId !== 'string' || typeof user.role !== 'string') {
    throw new AppError('INVALID_SESSION', 'The authentication token is invalid', 401);
  }

  return { userId: user.sub, shopId: user.shopId, role: user.role };
}
