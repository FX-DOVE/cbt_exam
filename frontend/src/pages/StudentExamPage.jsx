import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../state/AuthContext.jsx';

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function StudentExamPage() {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadExam() {
    const res = await api.get('/student/exam');
    setData(res.data);
    const first = res.data.subjects?.[0]?.subject || '';
    setSelectedSubject((s) => s || first);
  }

  useEffect(() => {
    loadExam();
  }, []);

  useEffect(() => {
    if (!data?.examSession?.hasStarted || data?.examSession?.isSubmitted) return;
    const id = setInterval(async () => {
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, examSession: { ...prev.examSession } };
        next.examSession.timeLeftMs = Math.max(0, prev.examSession.timeLeftMs - 1000);
        return next;
      });
      if (data.examSession.timeLeftMs <= 1000) {
        await loadExam();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [data?.examSession?.hasStarted, data?.examSession?.isSubmitted, data?.examSession?.timeLeftMs]);

  const answersMap = useMemo(() => {
    const map = new Map();
    for (const a of data?.examSession?.answers || []) map.set(String(a.question), a.selectedOption);
    return map;
  }, [data?.examSession?.answers]);

  const currentSubjectData = data?.subjects?.find((s) => s.subject === selectedSubject);
  const totalQuestions = (data?.subjects || []).reduce((acc, s) => acc + s.questions.length, 0);
  const attempted = data?.examSession?.answers?.length || 0;

  async function handleStart() {
    await api.post('/student/exam/start');
    await loadExam();
  }

  async function handleSelectAnswer(questionId, selectedOption) {
    if (data.examSession.isSubmitted) return;
    setSaving(true);
    try {
      await api.post('/student/exam/answer', { questionId, selectedOption });
      await loadExam();
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    await api.post('/student/exam/submit');
    setMessage('Exam submitted successfully.');
    await loadExam();
  }

  if (!data) return <div className="center">Loading exam...</div>;

  const fullName = [data.student.firstName, data.student.middleName, data.student.surname].filter(Boolean).join(' ');
  const session = data.examSession;

  if (session.isSubmitted) {
    return (
      <div className="container">
        <div className="card">
          <h2>Result</h2>
          <p>Student: {fullName}</p>
          <p>Score: {session.result?.scorePercent}%</p>
          <p>Correct: {session.result?.totalCorrect} / {session.result?.totalQuestions}</p>
          <h3>Subject Breakdown</h3>
          <ul>
            {(session.result?.subjectStats || []).map((s) => (
              <li key={s.subject}>{s.subject}: {s.correct}/{s.total} ({s.scorePercent}%)</li>
            ))}
          </ul>
          <button onClick={logout}>Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-layout">
      <aside className="sidebar">
        <h2>CBT</h2>
        <p>{fullName}</p>
        <div className="timer">{formatTime(session.timeLeftMs)}</div>
        <p>Progress: {attempted} / {totalQuestions}</p>
        <div className="subject-list">
          {data.subjects.map((s) => (
            <button
              key={s.subject}
              className={selectedSubject === s.subject ? 'active' : ''}
              onClick={() => setSelectedSubject(s.subject)}
            >
              {s.subject}
            </button>
          ))}
        </div>
        {!session.hasStarted ? (
          <button onClick={handleStart}>Start Exam</button>
        ) : (
          <button className="danger" onClick={handleSubmit}>Submit Exam</button>
        )}
        {saving ? <small>Auto-saving answer...</small> : null}
        {message ? <small>{message}</small> : null}
      </aside>
      <main className="main-area">
        {!session.hasStarted ? (
          <div className="card">
            <h2>Welcome, {data.student.firstName}</h2>
            {data.student.gender ? (
              <p className="muted">Gender: {data.student.gender === 'male' ? 'Male' : 'Female'}</p>
            ) : null}
            <p>You have 2 hours to complete your exam.</p>
            <button onClick={handleStart}>Start Exam</button>
          </div>
        ) : (
          <div className="questions">
            <h2>{selectedSubject}</h2>
            {(currentSubjectData?.questions || []).map((q, idx) => (
              <div key={q.id} className="card q-card">
                <p><strong>Q{idx + 1}:</strong> {q.questionText}</p>
                {['A', 'B', 'C', 'D'].map((opt) => (
                  <label key={opt} className="option-row">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answersMap.get(String(q.id)) === opt}
                      onChange={() => handleSelectAnswer(q.id, opt)}
                    />
                    <span>{opt}. {q.options[opt]}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

