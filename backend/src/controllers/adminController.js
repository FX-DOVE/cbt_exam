import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import multer from 'multer';
import { User } from '../models/User.js';
import { Question } from '../models/Question.js';
import { ExamSession } from '../models/ExamSession.js';
import { ReadingPassage } from '../models/ReadingPassage.js';
import { AppConfig } from '../models/AppConfig.js';
import { getOrCreateSession, finalizeSubmission, getExamDurationMs } from '../services/examService.js';
import {
  parseSubjects,
  parseQuestionWorkbook,
  parseStudentExcelRows,
  sanitizeSheetTitle,
  normalizeGenderInput,
} from '../utils/excel.js';
import { workbookToBuffer } from '../utils/excelExport.js';
import { httpError } from '../utils/httpError.js';
import xlsx from 'xlsx';

const upload = multer({ storage: multer.memoryStorage() });
export const uploadSingleExcel = upload.single('file');

export async function uploadStudents(req, res) {
  if (!req.file?.buffer) throw httpError(400, 'No file uploaded');
  const { rows, hasGenderColumn } = parseStudentExcelRows(req.file.buffer);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email) continue;

    const plainPassword = String(row.password || '').trim();
    const existing = await User.findOne({ email });

    let passwordHash;
    if (existing && !plainPassword) {
      passwordHash = existing.passwordHash;
    } else {
      passwordHash = await bcrypt.hash(plainPassword || 'Password123!', 12);
    }

    const payload = {
      role: 'student',
      firstName: String(row.firstName || '').trim(),
      surname: String(row.surname || '').trim(),
      middleName: String(row.middleName || '').trim(),
      email,
      passwordHash,
      phoneNumber: String(row.phoneNumber || '').trim(),
      subjects: parseSubjects(row.subjects),
      mustChangePassword: false,
    };

    if (hasGenderColumn) {
      const raw = String(row.gender ?? '').trim();
      if (raw !== '') {
        const g = normalizeGenderInput(row.gender);
        if (!g) throw httpError(400, `Invalid gender for ${email}: use male or female`);
        payload.gender = g;
      }
    }

    if (!existing) {
      await User.create(payload);
      created += 1;
    } else {
      existing.set(payload);
      await existing.save();
      updated += 1;
    }
  }

  res.json({ message: 'Students uploaded', created, updated, totalRows: rows.length });
}

export async function uploadQuestions(req, res) {
  if (!req.file?.buffer) throw httpError(400, 'No file uploaded');
  const { docs, passageDocs, passageTitleMap, legacySheets, subjectSheets } = parseQuestionWorkbook(req.file.buffer);

  // Upsert passages (match by title + subject)
  const passageIdMap = new Map(); // normalized title → ObjectId
  for (const p of passageDocs) {
    const existing = await ReadingPassage.findOneAndUpdate(
      { title: p.title, subject: p.subject },
      { $set: { body: p.body, isActive: true } },
      { upsert: true, new: true }
    );
    passageIdMap.set(p.title.toLowerCase(), existing._id);
  }

  // Resolve _passageTitleKey → actual ObjectId before insert
  const resolvedDocs = docs.map((d) => {
    const doc = { ...d };
    if (doc._passageTitleKey && passageIdMap.has(doc._passageTitleKey)) {
      doc.passageRef = passageIdMap.get(doc._passageTitleKey);
    }
    delete doc._passageTitleKey;
    return doc;
  });

  await Question.insertMany(resolvedDocs);

  res.json({
    message: 'Questions uploaded',
    created: resolvedDocs.length,
    passagesUpserted: passageDocs.length,
    totalRows: resolvedDocs.length,
    sheetsSubjectBased: subjectSheets,
    sheetsLegacyWithSubjectColumn: legacySheets,
  });
}

export async function dashboard(req, res) {
  const [studentCount, questionCount, submittedCount, sessionCount] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Question.countDocuments({ isActive: true }),
    ExamSession.countDocuments({ isSubmitted: true }),
    ExamSession.countDocuments({}),
  ]);

  const submissions = await ExamSession.find({ isSubmitted: true })
    .sort({ submittedAt: -1 })
    .limit(20)
    .populate('student', 'firstName surname email subjects');

  const students = await User.find({ role: 'student' })
    .sort({ createdAt: -1 })
    .select('firstName surname middleName email phoneNumber gender subjects examResetCount');

  res.json({
    stats: { studentCount, questionCount, submittedCount, sessionCount },
    students,
    recentSubmissions: submissions.map((s) => ({
      id: s._id,
      studentId: s.student?._id,
      name: `${s.student?.firstName || ''} ${s.student?.surname || ''}`.trim(),
      email: s.student?.email || '',
      scorePercent: s.scorePercent,
      totalCorrect: s.totalCorrect,
      attemptedQuestions: s.attemptedQuestions,
      totalQuestions: s.totalQuestions,
      submittedAt: s.submittedAt,
      autoSubmitted: s.autoSubmitted,
      subjectStats: s.subjectStats,
    })),
  });
}

export async function listResults(req, res) {
  const sessions = await ExamSession.find({ isSubmitted: true })
    .sort({ submittedAt: -1 })
    .populate('student', 'firstName surname middleName email');

  res.json({
    results: sessions.map((s) => ({
      id: s._id,
      student: s.student,
      scorePercent: s.scorePercent,
      totalCorrect: s.totalCorrect,
      attemptedQuestions: s.attemptedQuestions,
      totalQuestions: s.totalQuestions,
      submittedAt: s.submittedAt,
      autoSubmitted: s.autoSubmitted,
      subjectStats: s.subjectStats,
    })),
  });
}

export async function exportResultsExcel(req, res) {
  const sessions = await ExamSession.find({ isSubmitted: true })
    .sort({ submittedAt: -1 })
    .populate('student', 'firstName surname middleName email subjects gender').lean();

  const rows = sessions.map((s) => ({
    FirstName: s.student?.firstName || '',
    Surname: s.student?.surname || '',
    MiddleName: s.student?.middleName || '',
    Email: s.student?.email || '',
    Gender: s.student?.gender || '',
    Subjects: (s.student?.subjects || []).join(', '),
    ScorePercent: s.scorePercent != null ? `${s.scorePercent}%` : '',
    TotalCorrect: s.totalCorrect || 0,
    TotalQuestions: s.totalQuestions || 0,
    AttemptedQuestions: s.attemptedQuestions || 0,
    StartedAt: s.startedAt ? new Date(s.startedAt).toLocaleString() : '',
    SubmittedAt: s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '',
    AutoSubmitted: s.autoSubmitted ? 'Yes' : 'No'
  }));

  const wb = xlsx.utils.book_new();
  const wsResults = xlsx.utils.json_to_sheet(rows);
  
  // Format column widths for readability
  wsResults['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 40 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }
  ];

  xlsx.utils.book_append_sheet(wb, wsResults, 'Detailed Results');

  const buffer = workbookToBuffer(wb);
  const filename = `exam_results_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function generateBlockLayoutRows(passageGroup) {
  const rows = [];
  // For each passage in this subject
  for (const group of passageGroup) {
    const { passage, questions } = group;
    rows.push(['title', passage.title]);
    rows.push(['passage', passage.body]);
    rows.push([]); // spacer row
    // Headers row
    rows.push([
      'question number',
      'questions',
      'optionA',
      'optionB',
      'optionC',
      'optionD',
      'correctAnswer',
      'answerExplanation',
    ]);
    // questions
    questions.forEach((q, idx) => {
      rows.push([
        idx + 1,
        q.questionText,
        q.options?.A ?? '',
        q.options?.B ?? '',
        q.options?.C ?? '',
        q.options?.D ?? '',
        q.correctAnswer,
        q.answerExplanation ?? '',
      ]);
    });
    rows.push([]); // Block spacer
    rows.push([]);
  }
  return rows;
}

export async function exportQuestionsExcel(req, res) {
  const questions = await Question.find({ isActive: true })
    .sort({ subject: 1, createdAt: 1 })
    .populate('passageRef', 'title body')
    .lean();

  const wb = xlsx.utils.book_new();
  const subjects = [...new Set(questions.map((q) => q.subject || 'General'))];

  for (const subject of subjects) {
    const subjectQuestions = questions.filter((q) => q.subject === subject);
    
    // 1. Handle Questions WITH passages (Block Layout)
    const passageMap = new Map(); // passageId -> { passage, questions: [] }
    const standaloneQuestions = [];

    for (const q of subjectQuestions) {
      if (q.passageRef) {
        const pid = String(q.passageRef._id);
        if (!passageMap.has(pid)) {
          passageMap.set(pid, { passage: q.passageRef, questions: [] });
        }
        passageMap.get(pid).questions.push(q);
      } else {
        standaloneQuestions.push(q);
      }
    }

    if (passageMap.size > 0) {
      const passageGroupName = sanitizeSheetTitle(`${subject} passages`);
      const blockRows = generateBlockLayoutRows(Array.from(passageMap.values()));
      const wsPassages = xlsx.utils.aoa_to_sheet(blockRows);
      xlsx.utils.book_append_sheet(wb, wsPassages, passageGroupName);
    }

    // 2. Handle Questions WITHOUT passages (Standard Layout)
    if (standaloneQuestions.length > 0) {
      const sheetName = sanitizeSheetTitle(subject);
      const rows = standaloneQuestions.map((q) => ({
        questionText: q.questionText,
        optionA: q.options?.A ?? '',
        optionB: q.options?.B ?? '',
        optionC: q.options?.C ?? '',
        optionD: q.options?.D ?? '',
        correctAnswer: q.correctAnswer,
        answerExplanation: q.answerExplanation ?? '',
        wrongStatementsExplanation: q.wrongStatementsExplanation ?? '',
      }));
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  const info = [
    ['Questions export'],
    ['One worksheet per subject. The tab name is the subject name used in the app.'],
    ['Subject passages tabs contain reading passages and their linked questions in block format.'],
    ['Columns per sheet: questionText, optionA, optionB, optionC, optionD, correctAnswer.'],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(info), sanitizeSheetTitle('Instructions'));

  const buffer = workbookToBuffer(wb);
  const filename = `questions_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export async function exportStudentsExcel(req, res) {
  const students = await User.find({ role: 'student' }).sort({ surname: 1, firstName: 1 }).lean();
  const rows = students.map((s) => ({
    firstName: s.firstName,
    surname: s.surname,
    middleName: s.middleName || '',
    email: s.email,
    password: '',
    phoneNumber: s.phoneNumber || '',
    gender: s.gender || '',
    subjects: (s.subjects || []).join(', '),
  }));

  const wb = xlsx.utils.book_new();
  const wsStudents = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, wsStudents, 'Students');

  const instructions = [
    ['Note'],
    ['Passwords are not exported (they are stored hashed).'],
    ['To change a password, enter a new value in the password column before re-importing.'],
    ['To keep existing passwords, leave password empty for those rows when re-importing.'],
    ['gender: male or female (optional column).'],
  ];
  const wsInfo = xlsx.utils.aoa_to_sheet(instructions);
  xlsx.utils.book_append_sheet(wb, wsInfo, 'Instructions');

  const buffer = workbookToBuffer(wb);
  const filename = `students_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export async function resetStudent(req, res) {
  const { studentId } = req.params;
  const student = await User.findOne({ _id: studentId, role: 'student' });
  if (!student) throw httpError(404, 'Student not found');

  student.examResetCount = (student.examResetCount || 0) + 1;
  await student.save();
  await ExamSession.deleteOne({ student: student._id });

  res.json({ message: 'Student exam reset', examResetCount: student.examResetCount });
}

/** Clear every exam session and bump all students' reset count (new shuffle + retake allowed). */
export async function resetAllExams(req, res) {
  const sessionResult = await ExamSession.deleteMany({});
  const userResult = await User.updateMany({ role: 'student' }, { $inc: { examResetCount: 1 } });
  res.json({
    message: 'All student exams reset',
    sessionsRemoved: sessionResult.deletedCount,
    studentsUpdated: userResult.modifiedCount,
  });
}

const MAX_BULK = 200;

function parseStudentIds(body) {
  const raw = body.studentIds;
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, 'studentIds must be a non-empty array');
  if (raw.length > MAX_BULK) throw httpError(400, `At most ${MAX_BULK} students per request`);
  const ids = raw.map((id) => String(id).trim()).filter(Boolean);
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) throw httpError(400, `Invalid student id: ${id}`);
  }
  return ids;
}

function buildStudentPatch(body) {
  const patch = {};
  if (body.firstName !== undefined && body.firstName !== null) {
    patch.firstName = String(body.firstName).trim();
    if (!patch.firstName) throw httpError(400, 'firstName cannot be empty');
  }
  if (body.surname !== undefined && body.surname !== null) {
    patch.surname = String(body.surname).trim();
    if (!patch.surname) throw httpError(400, 'surname cannot be empty');
  }
  if (body.middleName !== undefined && body.middleName !== null) {
    patch.middleName = String(body.middleName).trim();
  }
  if (body.phoneNumber !== undefined && body.phoneNumber !== null) {
    patch.phoneNumber = String(body.phoneNumber).trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'subjects')) {
    patch.subjects = parseSubjects(body.subjects);
  }
  if (body.gender !== undefined && body.gender !== null) {
    const raw = String(body.gender).trim();
    if (raw === '') {
      patch._unsetGender = true;
    } else {
      const g = raw.toLowerCase();
      if (g !== 'male' && g !== 'female') throw httpError(400, 'gender must be male or female');
      patch.gender = g;
    }
  }
  return patch;
}

function splitStudentPatch(patch) {
  const unsetGender = patch._unsetGender === true;
  const clean = { ...patch };
  delete clean._unsetGender;
  return { set: clean, unsetGender };
}

export async function deleteStudent(req, res) {
  const { studentId } = req.params;
  if (!mongoose.isValidObjectId(studentId)) throw httpError(400, 'Invalid student id');
  const student = await User.findOneAndDelete({ _id: studentId, role: 'student' });
  if (!student) throw httpError(404, 'Student not found');
  await ExamSession.deleteMany({ student: student._id });
  res.json({ message: 'Student deleted' });
}

export async function bulkDeleteStudents(req, res) {
  const ids = parseStudentIds(req.body);
  await ExamSession.deleteMany({ student: { $in: ids } });
  const result = await User.deleteMany({ _id: { $in: ids }, role: 'student' });
  res.json({ message: 'Students deleted', deletedCount: result.deletedCount });
}

export async function updateStudent(req, res) {
  const { studentId } = req.params;
  if (!mongoose.isValidObjectId(studentId)) throw httpError(400, 'Invalid student id');

  const patch = buildStudentPatch(req.body);
  const pw = req.body.password;
  if (pw !== undefined && pw !== null && String(pw).trim() !== '') {
    const p = String(pw).trim();
    if (p.length < 6) throw httpError(400, 'Password must be at least 6 characters');
    patch.passwordHash = await bcrypt.hash(p, 12);
  }

  const { set, unsetGender } = splitStudentPatch(patch);
  const updateOps = {};
  if (Object.keys(set).length) updateOps.$set = set;
  if (unsetGender) updateOps.$unset = { gender: 1 };
  if (Object.keys(updateOps).length === 0) throw httpError(400, 'No fields to update');

  const student = await User.findOneAndUpdate({ _id: studentId, role: 'student' }, updateOps, {
    new: true,
    runValidators: true,
  });
  if (!student) throw httpError(404, 'Student not found');

  res.json({
    message: 'Student updated',
    student: {
      _id: student._id,
      firstName: student.firstName,
      surname: student.surname,
      middleName: student.middleName,
      email: student.email,
      phoneNumber: student.phoneNumber,
      gender: student.gender,
      subjects: student.subjects,
    },
  });
}

export async function bulkUpdateStudents(req, res) {
  const ids = parseStudentIds(req.body);
  const patch = buildStudentPatch(req.body);
  const { set, unsetGender } = splitStudentPatch(patch);
  const updateOps = {};
  if (Object.keys(set).length) updateOps.$set = set;
  if (unsetGender) updateOps.$unset = { gender: 1 };
  if (Object.keys(updateOps).length === 0) throw httpError(400, 'No fields to update');

  const result = await User.updateMany({ _id: { $in: ids }, role: 'student' }, updateOps);
  res.json({ message: 'Students updated', matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
}

/* ───────── Reading Passages CRUD ───────── */

export async function listPassages(req, res) {
  const passages = await ReadingPassage.find({ isActive: true }).sort({ subject: 1, title: 1 }).lean();
  // Count how many questions are linked to each passage
  const counts = await Question.aggregate([
    { $match: { passageRef: { $in: passages.map((p) => p._id) } } },
    { $group: { _id: '$passageRef', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    passages: passages.map((p) => ({
      _id: p._id,
      title: p.title,
      subject: p.subject,
      body: p.body,
      questionCount: countMap.get(String(p._id)) || 0,
      createdAt: p.createdAt,
    })),
  });
}

export async function createPassage(req, res) {
  const { title, subject, body } = req.body;
  if (!title?.trim()) throw httpError(400, 'title is required');
  if (!subject?.trim()) throw httpError(400, 'subject is required');
  if (!body?.trim()) throw httpError(400, 'body is required');
  const passage = await ReadingPassage.create({ title: title.trim(), subject: subject.trim(), body: body.trim() });
  res.status(201).json({ message: 'Passage created', passage });
}

export async function updatePassage(req, res) {
  const { passageId } = req.params;
  if (!mongoose.isValidObjectId(passageId)) throw httpError(400, 'Invalid passage id');
  const { title, subject, body } = req.body;
  const update = {};
  if (title !== undefined) update.title = String(title).trim();
  if (subject !== undefined) update.subject = String(subject).trim();
  if (body !== undefined) update.body = String(body).trim();
  if (Object.keys(update).length === 0) throw httpError(400, 'No fields to update');
  const passage = await ReadingPassage.findByIdAndUpdate(passageId, { $set: update }, { new: true, runValidators: true });
  if (!passage) throw httpError(404, 'Passage not found');
  res.json({ message: 'Passage updated', passage });
}

export async function deletePassage(req, res) {
  const { passageId } = req.params;
  if (!mongoose.isValidObjectId(passageId)) throw httpError(400, 'Invalid passage id');
  const passage = await ReadingPassage.findByIdAndDelete(passageId);
  if (!passage) throw httpError(404, 'Passage not found');
  // Unlink from any questions
  await Question.updateMany({ passageRef: passage._id }, { $set: { passageRef: null } });
  res.json({ message: 'Passage deleted' });
}

export async function exportPassagesExcel(req, res) {
  const passages = await ReadingPassage.find({ isActive: true }).sort({ subject: 1, title: 1 }).lean();
  const rows = passages.map((p) => ({ title: p.title, subject: p.subject, body: p.body }));
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, 'Passages');
  const info = [
    ['Passages export'],
    ['Columns: title, subject, body'],
    ['To link a question to a passage, add a passageTitle column to the questions sheet with the exact title.'],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(info), 'Instructions');
  const buffer = workbookToBuffer(wb);
  const filename = `passages_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/* ───────── Config & Global Controls ───────── */

export async function getConfig(req, res) {
  let config = await AppConfig.findOne();
  if (!config) config = await AppConfig.create({});
  res.json({ 
    examDurationMinutes: config.examDurationMinutes,
    isExamOpen: config.isExamOpen 
  });
}

export async function updateConfig(req, res) {
  const { examDurationMinutes } = req.body;
  if (!examDurationMinutes || typeof examDurationMinutes !== 'number') {
    throw httpError(400, 'Invalid examDurationMinutes');
  }
  let config = await AppConfig.findOne();
  if (!config) config = await AppConfig.create({});
  config.examDurationMinutes = examDurationMinutes;
  await config.save();
  res.json({ message: 'Configuration updated', config });
}

export async function startAllExams(req, res) {
  let config = await AppConfig.findOne();
  if (!config) config = await AppConfig.create({});
  config.isExamOpen = true;
  await config.save();
  res.json({ message: `Global Exam Access is now OPEN. Students can proceed.` });
}

export async function endAllExams(req, res) {
  let config = await AppConfig.findOne();
  if (!config) config = await AppConfig.create({});
  config.isExamOpen = false;
  await config.save();

  const sessions = await ExamSession.find({ isSubmitted: false });
  let count = 0;
  for (const session of sessions) {
    if (session.hasStarted) {
      await finalizeSubmission(session);
      count++;
    }
  }
  res.json({ message: `Access closed. Ended and submitted ${count} active sessions.` });
}

export async function endStudentExam(req, res) {
  const { studentId } = req.params;
  let session = await ExamSession.findOne({ student: studentId });
  if (!session) throw httpError(404, 'No exam session found for this student');
  if (session.isSubmitted) throw httpError(400, 'Exam is already submitted');
  await finalizeSubmission(session);
  res.json({ message: 'Student exam ended and submitted.' });
}
