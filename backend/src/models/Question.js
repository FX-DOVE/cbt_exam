import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    questionText: { type: String, required: true, trim: true },
    options: {
      A: { type: String, required: true, trim: true },
      B: { type: String, required: true, trim: true },
      C: { type: String, required: true, trim: true },
      D: { type: String, required: true, trim: true },
    },
    correctAnswer: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

questionSchema.index({ subject: 1, isActive: 1 });

export const Question = mongoose.model('Question', questionSchema);

