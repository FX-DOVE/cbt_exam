import { z } from 'zod';
import { Question } from '../models/Question.js';
import { ExamSession } from '../models/ExamSession.js';
import { getOrCreateSession, startExamIfNeeded, autoSubmitIfExpired, finalizeSubmission } from '../services/examService.js';
import { httpError } from '../utils/httpError.js';
import { shuffleQuestionsForStudent } from '../utils/shuffle.js';

function toQuestionDTO(q) {
  return {
    id: q._id,
    subject: q.subject,
    questionText: q.questionText,
    options: q.options,
  };
}

function sessionState(session) {
  const now = Date.now();
  const end = session.expiresAt ? new Date(session.expiresAt).getTime() : null;
  const timeLeftMs = end ? Math.max(0, end - now) : 2 * 60 * 60 * 1000;

  return {
    id: session._id,
    hasStarted: session.hasStarted,
    isSubmitted: session.isSubmitted,
    autoSubmitted: session.autoSubmitted,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    submittedAt: session.submittedAt,
    timeLeftMs,
    answers: session.answers,
    result: session.isSubmitted
      ? {
          totalQuestions: session.totalQuestions,
          attemptedQuestions: session.attemptedQuestions,
          totalCorrect: session.totalCorrect,
          scorePercent: session.scorePercent,
          subjectStats: session.subjectStats,
        }
      : null,
  };
}

export async function getExamData(req, res) {
  const student = req.currentUser;
  let session = await getOrCreateSession(student._id, student.examResetCount || 0);
  session = await autoSubmitIfExpired(session);

  const subjects = student.subjects || [];
  const questions = await Question.find({ isActive: true, subject: { $in: subjects } })
    .sort({ subject: 1, createdAt: 1 });

  const resetCount = student.examResetCount || 0;
  const studentId = String(student._id);
  const grouped = subjects.map((subject) => {
    const list = questions.filter((q) => q.subject === subject);
    const shuffled = shuffleQuestionsForStudent(studentId, resetCount, subject, list);
    return {
      subject,
      questions: shuffled.map(toQuestionDTO),
    };
  });

  res.json({
    student: {
      id: student._id,
      firstName: student.firstName,
      surname: student.surname,
      middleName: student.middleName,
      subjects: student.subjects,
      email: student.email,
      gender: student.gender,
    },
    examSession: sessionState(session),
    subjects: grouped,
  });
}

export async function startExam(req, res) {
  const student = req.currentUser;
  let session = await getOrCreateSession(student._id, student.examResetCount || 0);
  if (session.isSubmitted) throw httpError(403, 'Exam already submitted. Contact admin for reset.');

  session = await startExamIfNeeded(session, student.examResetCount || 0);
  res.json({ examSession: sessionState(session) });
}

const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOption: z.enum(['A', 'B', 'C', 'D']),
});

export async function saveAnswer(req, res) {
  const student = req.currentUser;
  const parsed = saveAnswerSchema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'Invalid answer payload');

  let session = await getOrCreateSession(student._id, student.examResetCount || 0);
  if (session.isSubmitted) throw httpError(403, 'Exam already submitted');
  session = await startExamIfNeeded(session, student.examResetCount || 0);
  session = await autoSubmitIfExpired(session);
  if (session.isSubmitted) throw httpError(403, 'Time elapsed. Exam auto-submitted.');

  const question = await Question.findById(parsed.data.questionId);
  if (!question || !question.isActive) throw httpError(404, 'Question not found');
  if (!student.subjects.includes(question.subject)) throw httpError(403, 'Question not assigned to student');

  const idx = session.answers.findIndex((a) => String(a.question) === parsed.data.questionId);
  const answerDoc = {
    question: question._id,
    selectedOption: parsed.data.selectedOption,
    subject: question.subject,
  };
  if (idx === -1) session.answers.push(answerDoc);
  else session.answers[idx] = answerDoc;

  await session.save();
  res.json({ message: 'Answer saved', examSession: sessionState(session) });
}

export async function submitExam(req, res) {
  const student = req.currentUser;
  let session = await getOrCreateSession(student._id, student.examResetCount || 0);
  if (session.isSubmitted) return res.json({ message: 'Already submitted', examSession: sessionState(session) });

  session = await startExamIfNeeded(session, student.examResetCount || 0);
  session = await finalizeSubmission(session);
  res.json({ message: 'Submitted', examSession: sessionState(session) });
}

export async function getResult(req, res) {
  const student = req.currentUser;
  let session = await getOrCreateSession(student._id, student.examResetCount || 0);
  session = await autoSubmitIfExpired(session);
  if (!session.isSubmitted) throw httpError(400, 'Exam not submitted yet');
  res.json({ examSession: sessionState(session) });
}

