import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['admin', 'student'],
      required: true,
    },
    firstName: { type: String, required: true, trim: true },
    surname: { type: String, required: true, trim: true },
    middleName: { type: String, default: '', trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phoneNumber: { type: String, default: '', trim: true },
    gender: { type: String, enum: ['male', 'female'], required: false },
    subjects: [{ type: String, trim: true }],
    mustChangePassword: { type: Boolean, default: false },
    examResetCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

export const User = mongoose.model('User', userSchema);

