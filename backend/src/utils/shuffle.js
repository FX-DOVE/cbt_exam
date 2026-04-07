import crypto from 'crypto';

/**
 * Same student + reset + subject + question set → same order (refresh-safe).
 * Different students → different order (for the same subject pool).
 */
export function shuffleQuestionsForStudent(studentId, resetCount, subject, questionDocs) {
  if (!questionDocs?.length) return [];
  const ids = questionDocs.map((q) => String(q._id)).sort();
  const base = `${studentId}|${resetCount}|${subject}|${ids.join(',')}`;
  const arr = [...questionDocs];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const h = crypto.createHash('sha256').update(`${base}:${i}`).digest();
    const j = h.readUInt32BE(0) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
