import mongoose from 'mongoose';

const appConfigSchema = new mongoose.Schema({
  examDurationMinutes: { type: Number, default: 120 },
  isExamOpen: { type: Boolean, default: false }
}, { timestamps: true });

export const AppConfig = mongoose.model('AppConfig', appConfigSchema);
