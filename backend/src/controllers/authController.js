import bcrypt from 'bcrypt';
import { z } from 'zod';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/jwt.js';
import { httpError } from '../utils/httpError.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'Invalid login payload');

  const email = parsed.data.email.toLowerCase().trim();
  const user = await User.findOne({ email });
  if (!user) throw httpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) throw httpError(401, 'Invalid credentials');

  const token = signAccessToken(user);

  res.json({
    token,
    user: {
      id: user._id,
      role: user.role,
      firstName: user.firstName,
      surname: user.surname,
      middleName: user.middleName,
      email: user.email,
      gender: user.gender,
      subjects: user.subjects,
      examResetCount: user.examResetCount,
    },
  });
}

export async function me(req, res) {
  const user = await User.findById(req.auth.sub);
  if (!user) throw httpError(401, 'User not found');

  res.json({
    user: {
      id: user._id,
      role: user.role,
      firstName: user.firstName,
      surname: user.surname,
      middleName: user.middleName,
      email: user.email,
      gender: user.gender,
      subjects: user.subjects,
      examResetCount: user.examResetCount,
    },
  });
}

