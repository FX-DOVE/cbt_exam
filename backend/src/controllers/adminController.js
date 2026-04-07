import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import multer from 'multer';
import { User } from '../models/User.js';
import { Question } from '../models/Question.js';
import { ExamSession } from '../models/ExamSession.js';
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
  const { docs, legacySheets, subjectSheets } = parseQuestionWorkbook(req.file.buffer);

  await Question.insertMany(docs);

  res.json({
    message: 'Questions uploaded',
    created: docs.length,
    totalRows: docs.length,
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

export async function exportQuestionsExcel(req, res) {
  const questions = await Question.find({ isActive: true }).sort({ subject: 1, createdAt: 1 }).lean();
  const bySubject = new Map();
  for (const q of questions) {
    const key = q.subject || 'General';
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(q);
  }

  const wb = xlsx.utils.book_new();
  const usedTitles = new Set();

  for (const [subject, list] of bySubject) {
    let title = sanitizeSheetTitle(subject);
    let base = title;
    let n = 2;
    while (usedTitles.has(title.toLowerCase())) {
      title = sanitizeSheetTitle(`${base.slice(0, 22)}_${n}`);
      n += 1;
    }
    usedTitles.add(title.toLowerCase());

    const rows = list.map((q) => ({
      questionText: q.questionText,
      optionA: q.options?.A ?? '',
      optionB: q.options?.B ?? '',
      optionC: q.options?.C ?? '',
      optionD: q.options?.D ?? '',
      correctAnswer: q.correctAnswer,
    }));
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, title);
  }

  const info = [
    ['Questions export'],
    ['One worksheet per subject. The tab name is the subject name used in the app.'],
    ['Columns per sheet: questionText, optionA, optionB, optionC, optionD, correctAnswer.'],
    ['Student subject lists must match these tab names (spelling).'],
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

