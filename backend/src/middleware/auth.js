import { verifyAccessToken } from '../utils/jwt.js';
import { httpError } from '../utils/httpError.js';
import { User } from '../models/User.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw httpError(401, 'Unauthorized');
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
    next();
  } catch {
    throw httpError(401, 'Invalid token');
  }
}

export function requireRole(role) {
  return async (req, res, next) => {
    if (!req.auth?.sub) throw httpError(401, 'Unauthorized');
    const user = await User.findById(req.auth.sub);
    if (!user) throw httpError(401, 'User not found');
    if (user.role !== role) throw httpError(403, 'Forbidden');
    req.currentUser = user;
    next();
  };
}

