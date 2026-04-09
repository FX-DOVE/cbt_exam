import mongoose from 'mongoose';

const readingPassageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

readingPassageSchema.index({ subject: 1, isActive: 1 });

export const ReadingPassage = mongoose.model('ReadingPassage', readingPassageSchema);
