import xlsx from 'xlsx';
import { httpError } from './httpError.js';

function normalizeHeaderKey(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function parseExcelRows(fileBuffer, requiredColumns) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw httpError(400, 'Excel file has no worksheet');

  const sheet = workbook.Sheets[firstSheet];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) throw httpError(400, 'Excel file is empty');

  const first = rows[0];
  const rawKeys = Object.keys(first);
  const keyMap = new Map();
  for (const key of rawKeys) keyMap.set(normalizeHeaderKey(key), key);

  for (const required of requiredColumns) {
    if (!keyMap.has(normalizeHeaderKey(required))) {
      throw httpError(400, `Missing required column: ${required}`);
    }
  }

  return rows.map((row) => {
    const cleaned = {};
    for (const required of requiredColumns) {
      const raw = keyMap.get(normalizeHeaderKey(required));
      cleaned[required] = row[raw];
    }
    return cleaned;
  });
}

export function parseSubjects(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Excel worksheet name: max 31 chars; no \\ / * ? : [ ] */
export function sanitizeSheetTitle(name) {
  let s = String(name || 'Subject');
  for (const ch of ['\\', '/', '*', '?', ':', '[', ']']) {
    s = s.split(ch).join(' ');
  }
  s = s.trim().replace(/\s+/g, ' ');
  if (!s) s = 'Subject';
  if (s.length > 31) s = s.slice(0, 31);
  return s;
}

const QUESTION_COLS = ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer'];

function rowKeyMap(firstRow) {
  const keyMap = new Map();
  for (const key of Object.keys(firstRow || {})) {
    keyMap.set(normalizeHeaderKey(key), key);
  }
  return keyMap;
}

function questionDocFromRow(row, keyMap, subject) {
  const subj = String(subject || '').trim();
  if (!subj) return null;
  const qt = String(row[keyMap.get('questiontext')] ?? '').trim();
  if (!qt) return null;
  const correct = String(row[keyMap.get('correctanswer')] ?? '').trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(correct)) return null;
  return {
    subject: subj,
    questionText: qt,
    options: {
      A: String(row[keyMap.get('optiona')] ?? '').trim(),
      B: String(row[keyMap.get('optionb')] ?? '').trim(),
      C: String(row[keyMap.get('optionc')] ?? '').trim(),
      D: String(row[keyMap.get('optiond')] ?? '').trim(),
    },
    correctAnswer: correct,
  };
}

function sheetHasQuestionColumns(keyMap) {
  return QUESTION_COLS.every((c) => keyMap.has(normalizeHeaderKey(c)));
}

const SKIP_SHEETS = new Set(['instructions', 'readme', 'read me']);

/**
 * Multi-sheet: each tab name = subject; columns questionText, optionA–D, correctAnswer.
 * Legacy: any sheet with a `subject` column uses per-row subject (same columns + subject).
 */
export function parseQuestionWorkbook(fileBuffer) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  if (!workbook.SheetNames?.length) throw httpError(400, 'Excel file has no worksheet');

  const docs = [];
  let legacySheets = 0;
  let subjectSheets = 0;

  for (const sheetName of workbook.SheetNames) {
    const trimmedName = sheetName.trim();
    if (!trimmedName) continue;
    if (SKIP_SHEETS.has(trimmedName.toLowerCase())) continue;

    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) continue;

    const keyMap = rowKeyMap(rows[0]);
    if (!sheetHasQuestionColumns(keyMap)) continue;

    if (keyMap.has('subject')) {
      legacySheets += 1;
      for (const row of rows) {
        const subject = String(row[keyMap.get('subject')] ?? '').trim();
        const doc = questionDocFromRow(row, keyMap, subject);
        if (doc) docs.push(doc);
      }
    } else {
      subjectSheets += 1;
      const subject = trimmedName;
      for (const row of rows) {
        const doc = questionDocFromRow(row, keyMap, subject);
        if (doc) docs.push(doc);
      }
    }
  }

  if (docs.length === 0) {
    throw httpError(
      400,
      'No valid questions found. Use one tab per subject with columns: questionText, optionA, optionB, optionC, optionD, correctAnswer — or include a subject column on a single sheet.'
    );
  }

  return { docs, legacySheets, subjectSheets, totalSheets: workbook.SheetNames.length };
}

const STUDENT_REQUIRED = ['firstName', 'surname', 'middleName', 'email', 'password', 'phoneNumber', 'subjects'];

/** Student sheet: required columns + optional gender (male/female). */
export function parseStudentExcelRows(fileBuffer) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw httpError(400, 'Excel file has no worksheet');

  const sheet = workbook.Sheets[firstSheet];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) throw httpError(400, 'Excel file is empty');

  const keyMap = rowKeyMap(rows[0]);
  for (const col of STUDENT_REQUIRED) {
    if (!keyMap.has(normalizeHeaderKey(col))) {
      throw httpError(400, `Missing required column: ${col}`);
    }
  }
  const hasGender = keyMap.has('gender');

  const cleanedRows = rows.map((row) => {
    const cleaned = {};
    for (const col of STUDENT_REQUIRED) {
      const raw = keyMap.get(normalizeHeaderKey(col));
      cleaned[col] = row[raw];
    }
    if (hasGender) cleaned.gender = row[keyMap.get('gender')];
    return cleaned;
  });

  return { rows: cleanedRows, hasGenderColumn: hasGender };
}

export function normalizeGenderInput(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'm' || s === 'male') return 'male';
  if (s === 'f' || s === 'female') return 'female';
  return null;
}

