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
  const [selectedSubject, setSelectedSubject] = useState('');
  const [subjectIndices, setSubjectIndices] = useState({});
  const currentQuestionIndex = subjectIndices[selectedSubject] || 0;
  const setCurrentQuestionIndex = (val) => {
    setSubjectIndices(prev => {
      const currentVal = prev[selectedSubject] || 0;
      const nextVal = typeof val === 'function' ? val(currentVal) : val;
      return { ...prev, [selectedSubject]: nextVal };
    });
  };

  const [viewMode, setViewMode] = useState('exam');
  const [visitedSet, setVisitedSet] = useState(new Set());
  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [passagePanelOpen, setPassagePanelOpen] = useState(true);

  // Post Submission Navigation
  const [postSubmitView, setPostSubmitView] = useState('summary');
  const [dashboardTab, setDashboardTab] = useState('analysis');
  const [dashboardSubject, setDashboardSubject] = useState('All');

  async function loadExam() {
    try {
      const res = await api.get('/student/exam');
      setData(res.data);
      setSelectedSubject(s => s || res.data.subjects?.[0]?.subject || '');
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

  // Periodic poll to check if admin forced submission
  useEffect(() => {
    if (!data?.examSession?.hasStarted || data?.examSession?.isSubmitted) return;
    const pollId = setInterval(() => {
      api.get('/student/exam')
        .then(res => {
          if (res.data.examSession.isSubmitted) {
             setData(res.data);
          }
        })
        .catch(console.error);
    }, 15000); // 15 seconds poll
    return () => clearInterval(pollId);
  }, [data?.examSession?.hasStarted, data?.examSession?.isSubmitted]);

  // Periodic poll to check if admin opened the exam
  useEffect(() => {
    if (!data) return;
    if (data.isExamOpen || data?.examSession?.hasStarted) return;
    
    const openPollId = setInterval(() => {
      loadExam();
    }, 5000); // Check every 5 seconds if admin started the exam
    
    return () => clearInterval(openPollId);
  }, [data?.isExamOpen, data?.examSession?.hasStarted]);

  useEffect(() => {
    if (selectedSubject) {
      setVisitedSet(prev => {
        const next = new Set(prev);
        next.add(`${selectedSubject}-${currentQuestionIndex}`);
        return next;
      });
    }
  }, [currentQuestionIndex, selectedSubject]);

  const currentSubjectQuestions = useMemo(() => {
    if (!data?.subjects || !selectedSubject) return [];
    const subj = data.subjects.find(s => s.subject === selectedSubject);
    return subj ? subj.questions.map(q => ({ ...q, subject: subj.subject })) : [];
  }, [data?.subjects, selectedSubject]);

  // Build navigation groups: each group is either one standalone question OR all questions sharing a passage
  const navGroups = useMemo(() => {
    const groups = [];
    const passageMap = new Map(); // passageId -> group index
    currentSubjectQuestions.forEach((q, flatIdx) => {
      if (q.passageRef) {
        const pid = String(q.passageRef.id);
        if (passageMap.has(pid)) {
          const g = groups[passageMap.get(pid)];
          g.questions.push(q);
          g.flatIndices.push(flatIdx);
        } else {
          const gIdx = groups.length;
          passageMap.set(pid, gIdx);
          groups.push({ type: 'passage', passage: q.passageRef, questions: [q], flatIndices: [flatIdx] });
        }
      } else {
        groups.push({ type: 'single', questions: [q], flatIndices: [flatIdx] });
      }
    });
    return groups;
  }, [currentSubjectQuestions]);

  // Which group is currently active?
  const currentGroupIndex = useMemo(() => {
    const idx = navGroups.findIndex(g => g.flatIndices.includes(currentQuestionIndex));
    return idx === -1 ? 0 : idx;
  }, [navGroups, currentQuestionIndex]);

  const currentGroup = navGroups[currentGroupIndex] ?? null;

  // Build a flat-index → group-index lookup for the nav grid
  const flatToGroupIndex = useMemo(() => {
    const map = new Map();
    navGroups.forEach((g, gi) => g.flatIndices.forEach(fi => map.set(fi, gi)));
    return map;
  }, [navGroups]);

  // Rome numeral helper
  const toRoman = (n) => ['I','II','III','IV','V','VI','VII','VIII','IX','X'][n] ?? String(n + 1);

  const answersMap = useMemo(() => {
    const map = new Map();
    for (const a of data?.examSession?.answers || []) map.set(String(a.question), a.selectedOption);
    return map;
  }, [data?.examSession?.answers]);

  useEffect(() => {
    if (!data?.examSession?.hasStarted || data?.examSession?.isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden && !showExitWarning) {
        api.post('/student/exam/submit').then(() => loadExam()).catch(console.error);
      }
    };

    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if (!isFullscreen) {
        api.post('/student/exam/submit').then(() => loadExam()).catch(console.error);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowExitWarning(true);
      }
      
      // Proactively block all standard refresh keyboard shortcuts
      if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r') || (e.metaKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
      }
    };

    const handleMouseMove = (e) => {
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if (isFullscreen && e.clientY <= 15 && !showExitWarning) {
        setShowExitWarning(true);
      }
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // Trigger native browser warning for attempted refresh
      return '';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [data?.examSession?.hasStarted, data?.examSession?.isSubmitted, showExitWarning]);

  async function handleStart() {
    try {
      await api.post('/student/exam/start');
      await loadExam();
    } catch (err) {
      console.error(err);
    }
  }

  async function confirmProceed() {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
        await elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) { /* Firefox */
        await elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) { /* IE/Edge */
        await elem.msRequestFullscreen();
      }

      // Attempt to physically lock the ESC key to prevent exit before warning occurs
      if (navigator.keyboard && navigator.keyboard.lock) {
        try { await navigator.keyboard.lock(['Escape']); } catch (e) { console.warn('Keyboard lock failed', e); }
      }
    } catch (err) {
      console.warn('Fullscreen request blocked or not supported', err);
    }
    setShowFullscreenWarning(false);
    await handleStart();
  }

  async function handleSelectAnswer(questionId, selectedOption) {
    if (data.examSession.isSubmitted) return;
    setSaving(true);
    try {
      await api.post('/student/exam/answer', { questionId, selectedOption });
      await loadExam();
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403) {
        await loadExam(); // Reload to capture the submission state if admin ended it
      }
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
    if (postSubmitView === 'summary') {
      return (
        <div className="summary-overlay">
          <div className="summary-card">
            <h3>Your answers were submitted</h3>
            <div className="summary-score-box">
              <span className="summary-score-label">Your Score</span>
              <span className="summary-score-value">{session.result?.totalCorrect}/{session.result?.totalQuestions}</span>
            </div>
            
            <div className="summary-stats-grid">
              <div className="summary-stat-box">
                <span className="summary-stat-title">Attempted Questions</span>
                <span className="summary-stat-val">{session.result?.attemptedQuestions}</span>
              </div>
              <div className="summary-stat-box">
                <span className="summary-stat-title">Unattempted Questions</span>
                <span className="summary-stat-val">{(session.result?.totalQuestions || 0) - (session.result?.attemptedQuestions || 0)}</span>
              </div>
              <div className="summary-stat-box">
                <span className="summary-stat-title">Incorrect Answers</span>
                <span className="summary-stat-val">{(session.result?.attemptedQuestions || 0) - (session.result?.totalCorrect || 0)}</span>
              </div>
              <div className="summary-stat-box">
                <span className="summary-stat-title">Correct Answers</span>
                <span className="summary-stat-val">{session.result?.totalCorrect}</span>
              </div>
            </div>

            <div className="summary-actions">
              <button className="btn-primary" style={{ background: '#ef4444' }} onClick={() => setPostSubmitView('dashboard')}>Click to view Detailed Analysis</button>
              <button className="btn-primary" onClick={logout}>Return to Main Windows</button>
            </div>
          </div>
        </div>
      );
    }

    const subjectQuestions = dashboardSubject === 'All' 
       ? data.subjects.flatMap(s => s.questions)
       : data.subjects.find(s => s.subject === dashboardSubject)?.questions || [];
       
    const total = Math.max(1, subjectQuestions.length);
    let attempted = 0;
    let correct = 0;
    
    subjectQuestions.forEach(q => {
      const ans = session.answers.find(a => String(a.question) === String(q.id));
      if (ans) {
        attempted++;
        if (ans.selectedOption === q.correctAnswer) correct++;
      }
    });

    const unattempted = total - attempted;
    const incorrect = attempted - correct;
    const computedScorePercent = ((correct / total) * 100).toFixed(2);

    const timeElapsedMs = (new Date(session.submittedAt).getTime()) - (new Date(session.startedAt).getTime());
    const timeElapsedMins = (timeElapsedMs / 60000).toFixed(2);

    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
           <button className="btn-back" onClick={() => setPostSubmitView('summary')}>← Back</button>
           <h2>Test Analysis</h2>
           
           <div className="subject-tabs" style={{ marginTop: '24px', marginBottom: '0' }}>
             <button
               className={`subject-tab ${dashboardSubject === 'All' ? 'active' : ''}`}
               onClick={() => setDashboardSubject('All')}
             >
               Overall Summary
             </button>
             {data.subjects.map(s => (
               <button
                 key={s.subject}
                 className={`subject-tab ${dashboardSubject === s.subject ? 'active' : ''}`}
                 onClick={() => setDashboardSubject(s.subject)}
               >
                 {s.subject}
               </button>
             ))}
           </div>
           <div className="dash-tabs-container">
             <div className="dash-tabs">
               <button className={`dash-tab ${dashboardTab === 'analysis' ? 'active' : ''}`} onClick={() => setDashboardTab('analysis')}>Analysis</button>
               <button className={`dash-tab ${dashboardTab === 'qa' ? 'active' : ''}`} onClick={() => setDashboardTab('qa')}>Questions and Answers</button>
             </div>
             <button className="btn-primary export-btn" onClick={() => window.print()}>Export</button>
           </div>
        </div>

        {dashboardTab === 'analysis' && (
          <div className="analysis-view">
             <div className="card test-details-card">
               <h4>Test Details</h4>
               <div className="details-grid">
                 <div><strong>Subject:</strong> {dashboardSubject === 'All' ? data.subjects.map(s => s.subject).join(', ') : dashboardSubject}</div>
                 <div><strong>Total Mark:</strong> {total}</div>
                 <div><strong>Percentage Mark:</strong> {computedScorePercent}%</div>
                 <div><strong>Test Title:</strong> {data.examSession?.testTitle || 'CBT EXAM'}</div>
                 <div><strong>Duration:</strong> {Math.round(session.timeLeftMs / 60000) || 30} mins</div>
                 <div><strong>Mark per Question:</strong> 1</div>
                 <div><strong>Date Attempted:</strong> {new Date(session.submittedAt).toLocaleString()}</div>
                 <div><strong>Result Status:</strong> <span className="status-pub">● Published</span></div>
               </div>
             </div>

             <div className="charts-grid">
               <div className="card chart-card">
                 <h4>Question Chart (Performance)</h4>
                 <div className="pie-container">
                    <div className="pie-chart" style={{
                      background: `conic-gradient(#10b981 0% ${(correct/total)*100}%, #ef4444 ${(correct/total)*100}% ${((correct+incorrect)/total)*100}%, #f59e0b ${((correct+incorrect)/total)*100}% 100%)`
                    }}></div>
                    <div className="pie-legend">
                       <div><span className="dot dot-correct"></span> Correct ({((correct/total)*100).toFixed(1)}%)</div>
                       <div><span className="dot dot-incorrect"></span> InCorrect ({((incorrect/total)*100).toFixed(1)}%)</div>
                       <div><span className="dot dot-unattempted"></span> UnAttempted ({((unattempted/total)*100).toFixed(1)}%)</div>
                    </div>
                 </div>
               </div>
               
               <div className="card overview-card">
                 <h4>Test Overview</h4>
                 <div className="overview-list">
                    <div className="ov-row"><span>Total Questions:</span> <span>{total}</span></div>
                    <div className="ov-row"><span>Total Multiple Choice Questions:</span> <span>{total}</span></div>
                    <div className="ov-row"><span>Total Sub-questions:</span> <span>0</span></div>
                    <div className="ov-row"><span>Total Time Elapsed (Min):</span> <span>{dashboardSubject === 'All' ? timeElapsedMins : '--'}</span></div>
                    <div className="ov-row"><span>Total Questions Attempted:</span> <span>{attempted}</span></div>
                    <div className="ov-row"><span>Total Questions Unanswered:</span> <span>{unattempted}</span></div>
                    <div className="ov-row"><span>Total Correct Answers:</span> <span>{correct}</span></div>
                    <div className="ov-row"><span>Total Incorrect Answers:</span> <span>{incorrect}</span></div>
                 </div>
               </div>
             </div>
          </div>
        )}

        {dashboardTab === 'qa' && (
          <div className="qa-view">
            <div className="qa-badges">
              <span className="badge-correct">● Correct</span>
              <span className="badge-incorrect">● Incorrect</span>
              <span className="badge-unanswered">● Unanswered</span>
            </div>
            
            <div className="qa-list">
              {subjectQuestions.map((q, idx) => {
                 const studentAns = session.answers.find(a => String(a.question) === String(q.id));
                 const isAnswered = !!studentAns;
                 const isCorrect = isAnswered && studentAns.selectedOption === q.correctAnswer;
                 const statusClass = isCorrect ? 'correct' : (isAnswered ? 'incorrect' : 'unanswered');
                 
                 return (
                   <div key={q.id} className={`qa-card status-${statusClass}`}>
                     <div className="qa-card-header">
                       <h4>{idx + 1}.</h4>
                       <span className={`qa-badge ${statusClass}`}>● {statusClass.charAt(0).toUpperCase() + statusClass.slice(1)}</span>
                     </div>
                     <div className="qa-card-body">
                       <p><strong>Subject:</strong> <span style={{ color: '#ef4444' }}>{q.subject}</span></p>
                       <p className="qa-question-text">{q.questionText}</p>
                       
                       <div className="qa-answer-grid">
                         <div className="qa-row">
                           <span className="qa-label">Your Answer:</span>
                           <span className="qa-val">{isAnswered ? q.options[studentAns.selectedOption] : '--'}</span>
                         </div>
                         <div className="qa-row">
                           <span className="qa-label">Correct Answer:</span>
                           <span className="qa-val">{q.correctAnswer ? q.options[q.correctAnswer] : 'Hidden'}</span>
                         </div>
                         <div className="qa-row">
                           <span className="qa-label">Mark Obtained:</span>
                           <span className={`qa-mark ${statusClass}`}>{isCorrect ? 1 : 0}</span>
                         </div>
                         
                         {q.answerExplanation && (
                           <div className="qa-row">
                             <span className="qa-label" style={{ color: '#ef4444' }}>Answer<br/>Explanation:</span>
                             <div className="qa-val" style={{ lineHeight: '1.6' }}>
                               <p>{q.answerExplanation}</p>
                               {q.wrongStatementsExplanation && (
                                 <div style={{ marginTop: '16px' }}>
                                   <strong style={{ display: 'block', marginBottom: '8px' }}>Why the other statements are wrong:</strong>
                                   <p style={{ color: '#475569' }}>{q.wrongStatementsExplanation}</p>
                                 </div>
                               )}
                             </div>
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!session.hasStarted) {
    if (!data.isExamOpen) {
      return (
        <div className="instructions-page">
          <div className="instructions-card" style={{ textAlign: 'center', padding: '40px' }}>
            <h2 className="instructions-title" style={{ color: '#ef4444' }}>Test Access is Closed</h2>
            <p style={{ marginTop: '16px', color: '#64748b' }}>Please wait for the administrator to open the exam session.</p>
            <button className="btn-primary" style={{ marginTop: '24px' }} onClick={loadExam}>Refresh Status</button>
          </div>
        </div>
      );
    }

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
            <button className="btn-primary" onClick={() => setShowFullscreenWarning(true)}>Proceed</button>
          </div>
        </div>

        {showFullscreenWarning && (
          <div className="modal-backdrop">
            <div className="modal" style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#dc2626', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WarningIcon /> Security Warning
              </h3>
              <p style={{ color: '#334155', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
                The system will enter full-screen mode. Minimizing the window, exiting full-screen mode, or leaving this page will trigger automatic exam submission. Please do not exit until you have completed your test.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button className="btn-outline-primary" onClick={() => setShowFullscreenWarning(false)}>Go back</button>
                <button className="btn-primary" onClick={confirmProceed}>Okay, I understand</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentQuestion = currentSubjectQuestions[currentQuestionIndex];

  return (
    <div className="exam-active-layout">
      <div className="card exam-header-card">
        <div className="header-info">
          <p><strong>Students Name:</strong> <span className="highlight-name">{fullName}</span></p>
          <p><strong>Subject:</strong> <span className="highlight-magenta">{selectedSubject || 'Current'}</span></p>
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

      <div className="subject-tabs">
        {data.subjects.map(s => (
          <button
            key={s.subject}
            className={`subject-tab ${selectedSubject === s.subject ? 'active' : ''}`}
            onClick={() => {
              setSelectedSubject(s.subject);
              setViewMode('exam');
            }}
          >
            {s.subject}
          </button>
        ))}
      </div>

      <div className="exam-main-grid">
        <div className="left-panel">
          {viewMode === 'exam' && currentGroup ? (
            <>
              {/* ── PASSAGE GROUP: passage + all sub-questions stacked ── */}
              {currentGroup.type === 'passage' ? (
                <>
                  {/* Passage panel */}
                  <div className="passage-panel">
                    <div className="passage-title" onClick={() => setPassagePanelOpen(p => !p)}>
                      <span>📖 {currentGroup.passage.title}</span>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>{passagePanelOpen ? 'Hide Passage ▲' : 'Show Passage ▼'}</span>
                    </div>
                    {passagePanelOpen && (
                      <div className="passage-body">
                        <p className="passage-instruction">Read the passage carefully and answer the questions that follow.</p>
                        {currentGroup.passage.body}
                      </div>
                    )}
                  </div>

                  {/* All sub-questions for this passage */}
                  <div className="card q-card-pane passage-group-card">
                    {currentGroup.questions.map((q, subIdx) => {
                      const flatIdx = currentGroup.flatIndices[subIdx];
                      const globalNum = flatIdx + 1;
                      const selectedOpt = answersMap.get(String(q.id));
                      return (
                        <div key={q.id} className="sub-question-block">
                          <div className="q-card-header">
                            <h3>Question {globalNum}{toRoman(subIdx)}</h3>
                            <FlagIcon
                              active={flaggedQuestions.has(q.id)}
                              onClick={() => setFlaggedQuestions(prev => {
                                const next = new Set(prev);
                                if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                                return next;
                              })}
                            />
                          </div>
                          <p className="q-text">{q.questionText}</p>
                          <div className="q-options">
                            {['A', 'B', 'C', 'D'].map(opt => (
                              <label key={opt} className={`option-row ${selectedOpt === opt ? 'selected' : ''}`}>
                                <input
                                  type="radio"
                                  name={String(q.id)}
                                  checked={selectedOpt === opt}
                                  onChange={() => handleSelectAnswer(q.id, opt)}
                                />
                                <span>{opt}. {q.options[opt]}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Navigation buttons at the bottom of the group */}
                    <div className="q-actions" style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                      <button
                        className="btn-pill-ghost"
                        disabled={currentGroupIndex === 0}
                        onClick={() => {
                          const prevGroup = navGroups[currentGroupIndex - 1];
                          setCurrentQuestionIndex(prevGroup.flatIndices[0]);
                        }}
                      >
                        <ArrowLeftIcon /> Previous
                      </button>
                      {currentGroupIndex < navGroups.length - 1 ? (
                        <button
                          className="btn-pill-primary"
                          onClick={() => {
                            const nextGroup = navGroups[currentGroupIndex + 1];
                            setCurrentQuestionIndex(nextGroup.flatIndices[0]);
                          }}
                        >
                          Next <ArrowRightIcon />
                        </button>
                      ) : (
                        <button className="btn-pill-primary" onClick={() => setViewMode('preview')}>
                          Review Subject
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* ── SINGLE QUESTION (unchanged behaviour) ── */
                <div className="card q-card-pane">
                  <div className="q-card-header">
                    <h3>Question {currentGroup.flatIndices[0] + 1}</h3>
                    <FlagIcon
                      active={flaggedQuestions.has(currentGroup.questions[0].id)}
                      onClick={() => {
                        setFlaggedQuestions(prev => {
                          const next = new Set(prev);
                          const id = currentGroup.questions[0].id;
                          if (next.has(id)) next.delete(id); else next.add(id);
                          return next;
                        });
                      }}
                    />
                  </div>
                  <p className="q-text">{currentGroup.questions[0].questionText}</p>
                  <div className="q-options">
                    {['A', 'B', 'C', 'D'].map((opt) => (
                      <label key={opt} className={`option-row ${answersMap.get(currentGroup.questions[0].id) === opt ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name={currentGroup.questions[0].id}
                          checked={answersMap.get(String(currentGroup.questions[0].id)) === opt}
                          onChange={() => handleSelectAnswer(currentGroup.questions[0].id, opt)}
                        />
                        <span>{opt}. {currentGroup.questions[0].options[opt]}</span>
                      </label>
                    ))}
                  </div>
                  <div className="q-actions">
                    <button
                      className="btn-pill-ghost"
                      disabled={currentGroupIndex === 0}
                      onClick={() => {
                        const prevGroup = navGroups[currentGroupIndex - 1];
                        setCurrentQuestionIndex(prevGroup.flatIndices[0]);
                      }}
                    >
                      <ArrowLeftIcon /> Previous
                    </button>
                    {currentGroupIndex < navGroups.length - 1 ? (
                      <button
                        className="btn-pill-primary"
                        onClick={() => {
                          const nextGroup = navGroups[currentGroupIndex + 1];
                          setCurrentQuestionIndex(nextGroup.flatIndices[0]);
                        }}
                      >
                        Next <ArrowRightIcon />
                      </button>
                    ) : (
                      <button className="btn-pill-primary" onClick={() => setViewMode('preview')}>
                        Review Subject
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>


          ) : (
            <div className="card preview-list">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>Preview Summary ({selectedSubject})</h2>
                <button className="btn-pill-ghost" onClick={() => setViewMode('exam')}>Back to Exam</button>
              </div>
              <div className="preview-items">
                {currentSubjectQuestions.map((q, i) => {
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
            </div>
          )}
        </div>

        <div className="right-panel card">
          <h3 className="nav-title">Question Navigation</h3>
          <div className="nav-grid">
            {currentSubjectQuestions.map((q, i) => {
              const groupIdx = flatToGroupIndex.get(i) ?? i;
              const isCurrent = groupIdx === currentGroupIndex && viewMode === 'exam';
              const isAnswered = answersMap.has(String(q.id));
              const isVisited = visitedSet.has(`${selectedSubject}-${i}`);

              let className = 'nav-btn';
              if (isCurrent) className += ' active';
              else if (isAnswered) className += ' answered';
              else if (isVisited) className += ' visited';

              return (
                <button
                  key={q.id}
                  className={className}
                  onClick={() => {
                    // Navigate to the first flat index of this question's group
                    const g = navGroups[groupIdx];
                    setCurrentQuestionIndex(g ? g.flatIndices[0] : i);
                    if (viewMode === 'preview') setViewMode('exam');
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="nav-actions" style={{ flexDirection: 'column', gap: '8px' }}>
            <button className="btn-primary-pill nav-btn-action" onClick={() => setViewMode('preview')}>
              Review subject
            </button>
            <button className="btn-primary-pill nav-btn-action" style={{ background: '#ef4444', marginTop: '16px' }} onClick={handleSubmit}>
              SUBMIT EXAM
            </button>
          </div>
        </div>
      </div>

      {showExitWarning && (
        <div className="modal-backdrop">
          <div className="modal" style={{ textAlign: 'center', zIndex: 10001 }}>
            <h3 style={{ color: '#dc2626', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <WarningIcon /> Warning: Security Violation
            </h3>
            <div style={{ color: '#334155', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
              You have attempted to access hidden system controls or exited full-screen mode. Maintaining strict full-screen visibility without interacting with external browser software is required during an active assessment.
              <br /><br />
              <strong>Closing this full screen will lead to automatic submission. Do you really want to close and submit?</strong>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn-outline-primary"
                onClick={async () => {
                  try {
                    const elem = document.documentElement;
                    if (elem.requestFullscreen) await elem.requestFullscreen();
                    else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
                    else if (elem.mozRequestFullScreen) await elem.mozRequestFullScreen();
                    else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();
                  } catch (err) {
                    console.warn('Return error', err);
                  }
                  setShowExitWarning(false);
                }}
              >
                Go back to exam
              </button>
              <button
                className="btn-primary"
                style={{ background: '#ef4444' }}
                onClick={() => {
                  setShowExitWarning(false);
                  if (document.exitFullscreen) document.exitFullscreen().catch(e => console.log(e));
                  handleSubmit();
                }}
              >
                Yes, close & submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
