import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectDb } from '../startup/connectDb.js';
import { User } from '../models/User.js';
import { Question } from '../models/Question.js';

/** Matches questions created by this seed (re-run replaces these only). */
const SEED_PREFIX = '[SEED]';

const DEMO_PASSWORD = 'Student123!';

const SEED_STUDENTS = [
  {
    email: 'ada.obi@student.local',
    firstName: 'Ada',
    surname: 'Obi',
    middleName: 'Chinelo',
    phoneNumber: '08011112222',
    gender: 'female',
    subjects: ['Math', 'English'],
  },
  {
    email: 'chidi.nwosu@student.local',
    firstName: 'Chidi',
    surname: 'Nwosu',
    middleName: '',
    phoneNumber: '08033334444',
    gender: 'male',
    subjects: ['Math', 'Biology'],
  },
  {
    email: 'grace.eze@student.local',
    firstName: 'Grace',
    surname: 'Eze',
    middleName: 'N.',
    phoneNumber: '08055556666',
    gender: 'female',
    subjects: ['English', 'Biology'],
  },
  {
    email: 'student.demo@cbt.local',
    firstName: 'Demo',
    surname: 'Student',
    middleName: 'Test',
    phoneNumber: '08000000000',
    gender: 'male',
    subjects: ['Math', 'English', 'Biology'],
  },
];

const SEED_QUESTIONS = [
  // Math
  {
    subject: 'Math',
    questionText: `${SEED_PREFIX} What is 15 − 8?`,
    options: { A: '5', B: '6', C: '7', D: '8' },
    correctAnswer: 'C',
  },
  {
    subject: 'Math',
    questionText: `${SEED_PREFIX} What is 12 ÷ 3?`,
    options: { A: '2', B: '3', C: '4', D: '6' },
    correctAnswer: 'C',
  },
  {
    subject: 'Math',
    questionText: `${SEED_PREFIX} What is the square of 5?`,
    options: { A: '10', B: '15', C: '20', D: '25' },
    correctAnswer: 'D',
  },
  {
    subject: 'Math',
    questionText: `${SEED_PREFIX} Express 0.25 as a fraction in lowest terms.`,
    options: { A: '1/5', B: '1/4', C: '2/5', D: '3/10' },
    correctAnswer: 'B',
  },
  // English
  {
    subject: 'English',
    questionText: `${SEED_PREFIX} Which is a noun?`,
    options: { A: 'quickly', B: 'happiness', C: 'and', D: 'under' },
    correctAnswer: 'B',
  },
  {
    subject: 'English',
    questionText: `${SEED_PREFIX} Choose the correct past tense: "She ___ to school yesterday."`,
    options: { A: 'go', B: 'goes', C: 'went', D: 'going' },
    correctAnswer: 'C',
  },
  {
    subject: 'English',
    questionText: `${SEED_PREFIX} The opposite of "ancient" is:`,
    options: { A: 'old', B: 'modern', C: 'weak', D: 'slow' },
    correctAnswer: 'B',
  },
  {
    subject: 'English',
    questionText: `${SEED_PREFIX} Which sentence uses correct punctuation?`,
    options: {
      A: 'Its a sunny day.',
      B: "It's a sunny day.",
      C: 'Its’ a sunny day.',
      D: 'Its, a sunny day.',
    },
    correctAnswer: 'B',
  },
  // Biology
  {
    subject: 'Biology',
    questionText: `${SEED_PREFIX} The basic unit of life is the:`,
    options: { A: 'tissue', B: 'organ', C: 'cell', D: 'atom' },
    correctAnswer: 'C',
  },
  {
    subject: 'Biology',
    questionText: `${SEED_PREFIX} Which gas do plants take in for photosynthesis?`,
    options: { A: 'oxygen', B: 'nitrogen', C: 'carbon dioxide', D: 'hydrogen' },
    correctAnswer: 'C',
  },
  {
    subject: 'Biology',
    questionText: `${SEED_PREFIX} Human red blood cells are produced mainly in:`,
    options: { A: 'liver', B: 'bone marrow', C: 'kidneys', D: 'pancreas' },
    correctAnswer: 'B',
  },
  {
    subject: 'Biology',
    questionText: `${SEED_PREFIX} DNA stands for:`,
    options: {
      A: 'Deoxyribonucleic acid',
      B: 'Dynamic nuclear acid',
      C: 'Dual nitrogen arrangement',
      D: 'Digestive nucleic agent',
    },
    correctAnswer: 'A',
  },
];

await connectDb();

await Question.deleteMany({
  questionText: { $regex: '^\\[(DEMO|SEED)\\]' },
});
await Question.insertMany(SEED_QUESTIONS);

const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

for (const s of SEED_STUDENTS) {
  const email = s.email.toLowerCase().trim();
  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        role: 'student',
        firstName: s.firstName,
        surname: s.surname,
        middleName: s.middleName || '',
        email,
        passwordHash,
        phoneNumber: s.phoneNumber || '',
        gender: s.gender,
        subjects: s.subjects,
        mustChangePassword: false,
      },
    },
    { upsert: true, new: true }
  );
}

// eslint-disable-next-line no-console
console.log('Seed OK.');
// eslint-disable-next-line no-console
console.log(`Questions inserted: ${SEED_QUESTIONS.length} (subjects: ${[...new Set(SEED_QUESTIONS.map((q) => q.subject))].join(', ')})`);
// eslint-disable-next-line no-console
console.log(`Students upserted: ${SEED_STUDENTS.length} — password for all: ${DEMO_PASSWORD}`);
for (const s of SEED_STUDENTS) {
  // eslint-disable-next-line no-console
  console.log(`  • ${s.email} (${s.gender}) — ${s.subjects.join(', ')}`);
}

await mongoose.disconnect();
process.exit(0);
