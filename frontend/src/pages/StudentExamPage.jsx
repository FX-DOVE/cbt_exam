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

const WarningIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: '8px', marginTop: '2px' }}>
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

const FlagIcon = ({ active, onClick }) => (
  <svg onClick={onClick} width="24" height="24" viewBox="0 0 24 24" fill={active ? "#ef4444" : "none"} stroke={active ? "#ef4444" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
    <line x1="4" y1="22" x2="4" y2="15"></line>
  </svg>
);

const ChevronIcon = ({ up }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
);

const ArrowRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
);

export function StudentExamPage() {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // UI Navigation State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [viewMode, setViewMode] = useState('exam'); 
  const [visitedQuestions, setVisitedQuestions] = useState(new Set());
  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);

  async function loadExam() {
    try {
      const res = await api.get('/student/exam');
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
      } else {
        console.error('Failed to load exam:', err);
      }
    }
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

  useEffect(() => {
    setVisitedQuestions(prev => {
      const next = new Set(prev);
      next.add(currentQuestionIndex);
      return next;
    });
  }, [currentQuestionIndex]);

  const allQuestions = useMemo(() => {
    if (!data?.subjects) return [];
    return data.subjects.flatMap(s => s.questions.map(q => ({ ...q, subject: s.subject })));
  }, [data?.subjects]);

  const answersMap = useMemo(() => {
    const map = new Map();
    for (const a of data?.examSession?.answers || []) map.set(String(a.question), a.selectedOption);
    return map;
  }, [data?.examSession?.answers]);

  async function handleStart() {
    try {
      await api.post('/student/exam/start');
      await loadExam();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSelectAnswer(questionId, selectedOption) {
    if (data.examSession.isSubmitted) return;
    setSaving(true);
    try {
      await api.post('/student/exam/answer', { questionId, selectedOption });
      await loadExam();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetQuestion() {
    if (data.examSession.isSubmitted) return;
    const q = allQuestions[currentQuestionIndex];
    if (!q || !answersMap.has(q.id)) return;
    setSaving(true);
    try {
      await api.post('/student/exam/answer', { questionId: q.id }); // Missing selectedOption resets it
      await loadExam();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    try {
      await api.post('/student/exam/submit');
      setMessage('Exam submitted successfully.');
      await loadExam();
    } catch (err) {
      console.error(err);
    }
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

  if (!session.hasStarted) {
    const totalQuestions = (data?.subjects || []).reduce((acc, s) => acc + s.questions.length, 0);
    const durationMins = Math.round(session.timeLeftMs / 60000) || 30;
    const subjectsList = data.subjects.map((s) => s.subject).join(', ');

    return (
      <div className="instructions-page">
        <div className="instructions-card">
          <h2 className="instructions-title">Test Instructions</h2>
          <div className="instructions-info-grid">
            <div className="info-col">
              <div className="info-row">
                <span className="info-label">Welcome</span>
                <span className="info-value highlight-name">{fullName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Subject:</span>
                <span className="info-value">{subjectsList || 'General'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Test Title:</span>
                <span className="info-value">{data.examSession.testTitle || 'IGBO-ETIT TECH HUB CBT EXAM'}</span>
              </div>
            </div>
            
            <div className="info-col">
              <div className="info-row">
                <span className="info-label">Total Mark:</span>
                <span className="info-value">{totalQuestions} Marks</span>
              </div>
              <div className="info-row">
                <span className="info-label">Duration:</span>
                <span className="info-value">{durationMins} Mins</span>
              </div>
              <div className="info-row" style={{ alignItems: 'flex-start' }}>
                <span className="info-label">Questions:</span>
                <div className="info-value">
                  {totalQuestions}
                  <div style={{ color: '#0f172a', fontSize: '13px', marginTop: '2px' }}>Questions</div>
                </div>
              </div>
            </div>
          </div>
          <div className="instructions-warnings">
            <div><WarningIcon /> Attempt all questions.</div>
            <div><WarningIcon /> You can't leave once you start</div>
            <div><WarningIcon /> If you close this window, we assume you're done<br />with your test.</div>
          </div>
          <div className="instructions-actions">
            <button className="btn-outline-primary" onClick={() => window.history.back()}>Go back</button>
            <button className="btn-primary" onClick={handleStart}>Proceed</button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = allQuestions[currentQuestionIndex];

  return (
    <div className="exam-active-layout">
      <div className="card exam-header-card">
        <div className="header-info">
          <p><strong>Students Name:</strong> <span className="highlight-name">{fullName}</span></p>
          <p><strong>Subject:</strong> <span className="highlight-magenta">{currentQuestion?.subject || 'Biology'}</span></p>
          <p><strong>Test Title:</strong> <span>{data.examSession.testTitle || 'IGBO-ETIT TECH HUB CBT EXAM'}</span></p>
        </div>
        <div className="header-timer">
          {formatTime(session.timeLeftMs)}
        </div>
      </div>

      <div className="card instructions-accordion">
        <div className="accordion-header" onClick={() => setInstructionsExpanded(!instructionsExpanded)}>
          <span className="accordion-title">Test Instructions</span>
          <ChevronIcon up={instructionsExpanded} />
        </div>
        {instructionsExpanded && (
          <div className="accordion-body">
            ATTEMPT ALL QUESTIONS!!!
          </div>
        )}
      </div>

      <div className="exam-main-grid">
        <div className="left-panel">
          {viewMode === 'exam' && currentQuestion ? (
            <div className="card q-card-pane">
              <div className="q-card-header">
                <h3>Question {currentQuestionIndex + 1}</h3>
                <FlagIcon
                  active={flaggedQuestions.has(currentQuestion.id)}
                  onClick={() => {
                    setFlaggedQuestions(prev => {
                      const next = new Set(prev);
                      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
                      else next.add(currentQuestion.id);
                      return next;
                    });
                  }}
                />
              </div>
              <p className="q-text">{currentQuestion.questionText}</p>
              <div className="q-options">
                {['A', 'B', 'C', 'D'].map((opt) => (
                  <label key={opt} className={`option-row ${answersMap.get(currentQuestion.id) === opt ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name={currentQuestion.id}
                      checked={answersMap.get(String(currentQuestion.id)) === opt}
                      onChange={() => handleSelectAnswer(currentQuestion.id, opt)}
                    />
                    <span>{opt}. {currentQuestion.options[opt]}</span>
                  </label>
                ))}
              </div>
              <div className="q-actions">
                <button
                  className="btn-pill-ghost"
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                >
                  <ArrowLeftIcon />
                  Previous
                </button>
                {currentQuestionIndex < allQuestions.length - 1 ? (
                  <button
                    className="btn-pill-primary"
                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                  >
                    Next
                    <ArrowRightIcon />
                  </button>
                ) : (
                  <button className="btn-pill-primary" onClick={() => setViewMode('preview')}>
                    Review All
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card preview-list">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>Preview Summary</h2>
                <button className="btn-pill-ghost" onClick={() => setViewMode('exam')}>Back to Exam</button>
              </div>
              <div className="preview-items">
                {allQuestions.map((q, i) => {
                  const isAnswered = answersMap.has(String(q.id));
                  return (
                    <div key={q.id} className="preview-item">
                      <div className="preview-item-header">
                        <h4>Question {i + 1}</h4>
                        <button className="btn-go-to" onClick={() => {
                          setCurrentQuestionIndex(i);
                          setViewMode('exam');
                        }}>Go to question</button>
                      </div>
                      <p className="preview-q-text">{q.questionText}</p>
                      <div className="preview-status-line">
                        <span className={`status-badge ${isAnswered ? 'answered' : 'unanswered'}`}>
                          {isAnswered ? `Answered: ${answersMap.get(String(q.id))}` : 'Unanswered'}
                        </span>
                        {flaggedQuestions.has(q.id) && <span style={{ color: '#ef4444', fontWeight: '500' }}><FlagIcon active={true} /> Flagged</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '32px', textAlign: 'center' }}>
                <button className="btn-pill-primary" style={{ padding: '14px 40px', fontSize: '16px' }} onClick={handleSubmit}>Submit Exam</button>
              </div>
            </div>
          )}
        </div>

        <div className="right-panel card">
          <h3 className="nav-title">Question Navigation</h3>
          <div className="nav-grid">
            {allQuestions.map((q, i) => {
              const isCurrent = i === currentQuestionIndex && viewMode === 'exam';
              const isAnswered = answersMap.has(String(q.id));
              const isVisited = visitedQuestions.has(i);
              
              let className = 'nav-btn';
              if (isCurrent) className += ' active';
              else if (isAnswered) className += ' answered';
              else if (isVisited) className += ' visited';

              return (
                <button
                  key={q.id}
                  className={className}
                  onClick={() => {
                    setCurrentQuestionIndex(i);
                    if (viewMode === 'preview') setViewMode('exam');
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="nav-actions">
             <button className="btn-outline-pill nav-btn-action" onClick={handleResetQuestion}>
               Reset<br/>question
             </button>
             <button className="btn-primary-pill nav-btn-action" onClick={() => setViewMode('preview')}>
               Review<br/>answer
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
