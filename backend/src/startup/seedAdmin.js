import bcrypt from 'bcrypt';
import { User } from '../models/User.js';

export async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';

  if (!email || !password) return;

  const existing = await User.findOne({ email });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    role: 'admin',
    email,
    passwordHash,
    firstName: 'Admin',
    surname: 'User',
    middleName: '',
    phoneNumber: '',
    subjects: [],
    mustChangePassword: false,
  });
}

