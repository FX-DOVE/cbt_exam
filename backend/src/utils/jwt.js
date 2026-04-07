import jwt from 'jsonwebtoken';

export function signAccessToken(user) {
  const payload = {
    sub: String(user._id),
    role: user.role,
    email: user.email,
    examResetCount: user.examResetCount || 0,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

