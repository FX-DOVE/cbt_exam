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
const PASSAGE_SHEET_NAME = 'passages';
const PASSAGE_COLS = ['title', 'subject', 'body'];

function rowKeyMap(firstRow) {
  const keyMap = new Map();
  for (const key of Object.keys(firstRow || {})) {
    keyMap.set(normalizeHeaderKey(key), key);
  }
  return keyMap;
}

function questionDocFromRow(row, keyMap, subject, passageTitleMap) {
  const subj = String(subject || '').trim();
  if (!subj) return null;
  const qt = String(row[keyMap.get('questiontext')] ?? '').trim();
  if (!qt) return null;
  const correct = String(row[keyMap.get('correctanswer')] ?? '').trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(correct)) return null;

  const doc = {
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

  // Optional columns
  if (keyMap.has('answerexplanation')) {
    const exp = String(row[keyMap.get('answerexplanation')] ?? '').trim();
    if (exp) doc.answerExplanation = exp;
  }
  if (keyMap.has('wrongstatementsexplanation')) {
    const wse = String(row[keyMap.get('wrongstatementsexplanation')] ?? '').trim();
    if (wse) doc.wrongStatementsExplanation = wse;
  }
  if (keyMap.has('passagetitle') && passageTitleMap) {
    const pt = String(row[keyMap.get('passagetitle')] ?? '').trim().toLowerCase();
    if (pt && passageTitleMap.has(pt)) {
      doc._passageTitleKey = pt; // resolved to ObjectId later in the controller
    }
  }

  return doc;
}

function sheetHasQuestionColumns(keyMap) {
  return QUESTION_COLS.every((c) => keyMap.has(normalizeHeaderKey(c)));
}

const SKIP_SHEETS = new Set(['instructions', 'readme', 'read me']);

/**
 * Parse passages from a dedicated sheet named "Passages".
 * Columns: title, subject, body.
 */
export function parsePassageSheet(workbook) {
  const passages = [];
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === PASSAGE_SHEET_NAME
  );
  if (!sheetName) return passages;

  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) return passages;

  const keyMap = rowKeyMap(rows[0]);
  const hasCols = PASSAGE_COLS.every((c) => keyMap.has(normalizeHeaderKey(c)));
  if (!hasCols) return passages;

  for (const row of rows) {
    const title = String(row[keyMap.get('title')] ?? '').trim();
    const subject = String(row[keyMap.get('subject')] ?? '').trim();
    const body = String(row[keyMap.get('body')] ?? '').trim();
    if (!title || !subject || !body) continue;
    passages.push({ title, subject, body });
  }
  return passages;
}

/**
 * Parse a block-layout passage sheet (e.g., "English passages").
 * Layout is row-based blocks:
 * "title" | [Passage Title]
 * "passage" | [Passage Body]
 * "question number" | "questions" | "optionA" ...
 * [row]   | [question text] | [A text] ...
 */
function parseBlockPassagesSheet(sheetName, sheet) {
  let subjectStr = sheetName.toLowerCase().replace('passages', '').trim();
  subjectStr = subjectStr ? subjectStr.charAt(0).toUpperCase() + subjectStr.slice(1) : 'English';
  
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  const passages = [];
  const questions = [];
  
  let currentPassage = null;
  let headers = null;
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    
    // 1. Look for 'title' marker
    let foundTitle = false;
    for (let c = 0; c < row.length - 1; c++) {
      const cellVal = String(row[c]).trim().toLowerCase();
      if (cellVal.endsWith('title') || cellVal === 'title') {
        const titleText = String(row[c+1] || '').trim();
        if (titleText) {
          currentPassage = { title: titleText, subject: subjectStr, body: '' };
          passages.push(currentPassage);
          foundTitle = true;
          headers = null; // reset headers for a new block
          break;
        }
      }
    }
    if (foundTitle) continue;
    
    // 2. Look for 'passage' / 'body' marker
    let foundPassage = false;
    for (let c = 0; c < row.length - 1; c++) {
      const cellVal = String(row[c]).trim().toLowerCase();
      if (cellVal === 'passage' || cellVal === 'body') {
         const bodyText = String(row[c+1] || '').trim();
         if (bodyText && currentPassage) {
            currentPassage.body = currentPassage.body ? currentPassage.body + '\n\n' + bodyText : bodyText;
            foundPassage = true;
            break;
         }
      }
    }
    if (foundPassage) continue;
    
    // 3. Look for table headers row (must contain optionA)
    const normalizedRow = row.map(v => normalizeHeaderKey(String(v)));
    if (normalizedRow.includes('optiona')) {
      // Map "questions" to "questiontext" so questionDocFromRow recognizes it
      headers = normalizedRow.map(h => h === 'questions' ? 'questiontext' : h);
      continue;
    }
    
    // 4. Parse question row if we have active headers and an active passage
    if (headers && currentPassage) {
       const rowObj = {};
       for (let c = 0; c < headers.length; c++) {
          if (headers[c]) rowObj[headers[c]] = row[c];
       }
       
       const keyMap = new Map();
       for (const h of headers) if(h) keyMap.set(h, h);
       
       const doc = questionDocFromRow(rowObj, keyMap, subjectStr, null);
       if (doc) {
          doc._passageTitleKey = currentPassage.title.toLowerCase();
          questions.push(doc);
       }
    }
  }
  
  return { passages, questions };
}

/**
 * Multi-sheet: each tab name = subject; columns questionText, optionA–D, correctAnswer.
 * Legacy: any sheet with a `subject` column uses per-row subject (same columns + subject).
 * Optional: a flat tab named "Passages" (title, subject, body columns)
 * Optional: block tabs named "English passages" (title row, passage body row, then sub-questions)
 */
export function parseQuestionWorkbook(fileBuffer) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  if (!workbook.SheetNames?.length) throw httpError(400, 'Excel file has no worksheet');

  const docs = [];
  const passageDocsMap = new Map(); // using map to avoid duplicates
  
  let legacySheets = 0;
  let subjectSheets = 0;

  // Pass 1: Extract all passages (from flat 'passages' sheet OR block '... passages' sheets)
  // Also extract block questions right away.
  for (const sheetName of workbook.SheetNames) {
    const trimmedName = sheetName.trim();
    if (!trimmedName || SKIP_SHEETS.has(trimmedName.toLowerCase())) continue;
    
    if (trimmedName.toLowerCase() === PASSAGE_SHEET_NAME) {
       const pDocs = parsePassageSheet(workbook);
       pDocs.forEach(p => passageDocsMap.set(p.title.toLowerCase(), p));
    } else if (trimmedName.toLowerCase().endsWith(' passages')) {
       // e.g. "English passages" - block layout
       subjectSheets += 1;
       const sheet = workbook.Sheets[sheetName];
       const blockData = parseBlockPassagesSheet(trimmedName, sheet);
       blockData.passages.forEach(p => passageDocsMap.set(p.title.toLowerCase(), p));
       docs.push(...blockData.questions);
    }
  }

  // Create final passage array and lookup map
  const passageDocs = Array.from(passageDocsMap.values());
  const passageTitleMap = new Map(passageDocs.map((p, i) => [p.title.toLowerCase(), i]));

  // Pass 2: Extract questions from standard question sheets
  for (const sheetName of workbook.SheetNames) {
    const trimmedName = sheetName.trim();
    if (!trimmedName || SKIP_SHEETS.has(trimmedName.toLowerCase())) continue;
    if (trimmedName.toLowerCase() === PASSAGE_SHEET_NAME) continue;
    if (trimmedName.toLowerCase().endsWith(' passages')) continue; // already processed

    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) continue;

    const keyMap = rowKeyMap(rows[0]);
    if (!sheetHasQuestionColumns(keyMap)) continue;

    if (keyMap.has('subject')) {
      legacySheets += 1;
      for (const row of rows) {
        const subject = String(row[keyMap.get('subject')] ?? '').trim();
        const doc = questionDocFromRow(row, keyMap, subject, passageTitleMap);
        if (doc) docs.push(doc);
      }
    } else {
      subjectSheets += 1;
      const subject = trimmedName;
      for (const row of rows) {
        const doc = questionDocFromRow(row, keyMap, subject, passageTitleMap);
        if (doc) docs.push(doc);
      }
    }
  }

  if (docs.length === 0) {
    throw httpError(
      400,
      'No valid questions found. Ensure you are using proper sheet names and columns.'
    );
  }

  return { docs, passageDocs, passageTitleMap, legacySheets, subjectSheets, totalSheets: workbook.SheetNames.length };
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

