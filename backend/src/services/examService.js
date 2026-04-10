import { ExamSession } from '../models/ExamSession.js';
import { Question } from '../models/Question.js';
import { User } from '../models/User.js';
import { AppConfig } from '../models/AppConfig.js';

const TOTAL_EXAM_QUESTIONS = Number(process.env.TOTAL_EXAM_QUESTIONS) || 400;

export async function getExamDurationMs() {
  let config = await AppConfig.findOne();
  if (!config) {
    config = await AppConfig.create({});
  }
  return config.examDurationMinutes * 60 * 1000;
}

export async function getOrCreateSession(studentId, resetGeneration = 0) {
  let session = await ExamSession.findOne({ student: studentId });
  if (!session) {
    session = await ExamSession.create({
      student: studentId,
      resetGeneration,
      answers: [],
    });
  }
  return session;
}

export async function startExamIfNeeded(session, resetGeneration) {
  if (!session.hasStarted) {
    const durationMs = await getExamDurationMs();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationMs);
    session.hasStarted = true;
    session.startedAt = startedAt;
    session.expiresAt = expiresAt;
    session.resetGeneration = resetGeneration;
    await session.save();
  }
  return session;
}

export async function autoSubmitIfExpired(session) {
  if (!session.hasStarted || session.isSubmitted) return session;
  if (!session.expiresAt) return session;
  if (Date.now() < new Date(session.expiresAt).getTime()) return session;

  session.autoSubmitted = true;
  await finalizeSubmission(session);
  return session;
}

export async function finalizeSubmission(session) {
  if (session.isSubmitted) return session;

  const questionIds = session.answers.map((a) => a.question);
  const questions = await Question.find({ _id: { $in: questionIds } });
  const qMap = new Map(questions.map((q) => [String(q._id), q]));

  // Look up the student's assigned subjects to calculate the correct total
  const student = await User.findById(session.student);
  const subjects = student?.subjects || [];
  const perSubjectLimit = Math.floor(TOTAL_EXAM_QUESTIONS / Math.max(1, subjects.length));

  // Count the actual number of questions assigned to this student (capped per subject)
  let totalQuestions = 0;
  const subjectTotals = new Map();
  for (const subj of subjects) {
    const available = await Question.countDocuments({ isActive: true, subject: subj });
    const assigned = Math.min(available, perSubjectLimit);
    subjectTotals.set(subj, assigned);
    totalQuestions += assigned;
  }

  let totalCorrect = 0;
  const bySubject = new Map();

  for (const answer of session.answers) {
    const q = qMap.get(String(answer.question));
    if (!q) continue;

    const subject = q.subject;
    if (!bySubject.has(subject)) bySubject.set(subject, { correct: 0 });
    const stat = bySubject.get(subject);

    if (q.correctAnswer === answer.selectedOption) {
      totalCorrect += 1;
      stat.correct += 1;
    }
  }

  const attemptedQuestions = session.answers.length;
  const scorePercent = totalQuestions > 0 ? Number(((totalCorrect / totalQuestions) * 100).toFixed(2)) : 0;

  // Build subject stats using the actual assigned totals (not just attempted)
  const subjectStats = subjects.map((subject) => {
    const total = subjectTotals.get(subject) || 0;
    const correct = bySubject.get(subject)?.correct || 0;
    return {
      subject,
      total,
      correct,
      scorePercent: total > 0 ? Number(((correct / total) * 100).toFixed(2)) : 0,
    };
  });

  session.totalQuestions = totalQuestions;
  session.attemptedQuestions = attemptedQuestions;
  session.totalCorrect = totalCorrect;
  session.scorePercent = scorePercent;
  session.subjectStats = subjectStats;
  session.isSubmitted = true;
  session.submittedAt = new Date();

  await session.save();
  return session;
}
