import { ExamSession } from '../models/ExamSession.js';
import { Question } from '../models/Question.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + TWO_HOURS_MS);
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

  let totalCorrect = 0;
  const bySubject = new Map();

  for (const answer of session.answers) {
    const q = qMap.get(String(answer.question));
    if (!q) continue;

    const subject = q.subject;
    if (!bySubject.has(subject)) bySubject.set(subject, { total: 0, correct: 0 });
    const stat = bySubject.get(subject);
    stat.total += 1;

    if (q.correctAnswer === answer.selectedOption) {
      totalCorrect += 1;
      stat.correct += 1;
    }
  }

  const totalQuestions = await Question.countDocuments({ isActive: true });
  const attemptedQuestions = session.answers.length;
  const scorePercent = totalQuestions > 0 ? Number(((totalCorrect / totalQuestions) * 100).toFixed(2)) : 0;
  const subjectStats = Array.from(bySubject.entries()).map(([subject, stat]) => ({
    subject,
    total: stat.total,
    correct: stat.correct,
    scorePercent: stat.total > 0 ? Number(((stat.correct / stat.total) * 100).toFixed(2)) : 0,
  }));

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

