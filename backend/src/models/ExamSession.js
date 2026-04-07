import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    subject: { type: String, required: true },
  },
  { _id: false }
);

const subjectStatSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    total: { type: Number, required: true },
    correct: { type: Number, required: true },
    scorePercent: { type: Number, required: true },
  },
  { _id: false }
);

const examSessionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    resetGeneration: { type: Number, default: 0 },
    hasStarted: { type: Boolean, default: false },
    startedAt: { type: Date },
    expiresAt: { type: Date },
    submittedAt: { type: Date },
    isSubmitted: { type: Boolean, default: false },
    autoSubmitted: { type: Boolean, default: false },
    answers: [answerSchema],
    totalQuestions: { type: Number, default: 0 },
    attemptedQuestions: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    scorePercent: { type: Number, default: 0 },
    subjectStats: [subjectStatSchema],
  },
  { timestamps: true }
);

export const ExamSession = mongoose.model('ExamSession', examSessionSchema);

