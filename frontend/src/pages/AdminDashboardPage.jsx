import { useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadExcel } from '../api/client';
import { useAuth } from '../state/AuthContext.jsx';

async function uploadExcel(url, file) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

const emptyEditForm = () => ({
  firstName: '',
  surname: '',
  middleName: '',
  phoneNumber: '',
  subjects: '',
  password: '',
  genderSelect: 'keep',
});

const emptyApplyFlags = () => ({
  firstName: false,
  surname: false,
  middleName: false,
  phoneNumber: false,
  subjects: false,
  gender: false,
});

export function AdminDashboardPage() {
  const { logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState('single');
  const [editStudentId, setEditStudentId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [applyFlags, setApplyFlags] = useState(emptyApplyFlags);
  const [editSaving, setEditSaving] = useState(false);
  const selectAllRef = useRef(null);

  async function load() {
    const { data } = await api.get('/admin/dashboard');
    setDashboard(data);
  }

  useEffect(() => {
    load();
  }, []);

  const studentIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    dashboard?.students?.length > 0 && selectedIds.length === dashboard.students.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected, allSelected]);

  function toggleSelectAll() {
    if (!dashboard?.students) return;
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(dashboard.students.map((s) => s._id));
  }

  function toggleRow(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openEditSingle(s) {
    setEditMode('single');
    setEditStudentId(s._id);
    setEditForm({
      firstName: s.firstName || '',
      surname: s.surname || '',
      middleName: s.middleName || '',
      phoneNumber: s.phoneNumber || '',
      subjects: (s.subjects || []).join(', '),
      password: '',
      genderSelect: s.gender === 'male' || s.gender === 'female' ? s.gender : 'keep',
    });
    setApplyFlags(emptyApplyFlags());
    setEditOpen(true);
  }

  function openEditBulk() {
    if (selectedIds.length === 0) {
      setStatus('Select at least one student to edit.');
      return;
    }
    setEditMode('bulk');
    setEditStudentId(null);
    setEditForm({ ...emptyEditForm(), genderSelect: 'male' });
    setApplyFlags(emptyApplyFlags());
    setEditOpen(true);
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setStatus('');
    try {
      if (editMode === 'single' && editStudentId) {
        const body = {
          firstName: editForm.firstName.trim(),
          surname: editForm.surname.trim(),
          middleName: editForm.middleName.trim(),
          phoneNumber: editForm.phoneNumber.trim(),
          subjects: editForm.subjects,
        };
        if (editForm.password.trim()) body.password = editForm.password.trim();
        if (editForm.genderSelect === 'male' || editForm.genderSelect === 'female') body.gender = editForm.genderSelect;
        else if (editForm.genderSelect === 'clear') body.gender = '';
        await api.patch(`/admin/students/${editStudentId}`, body);
        setStatus('Student updated.');
      } else {
        const applied =
          applyFlags.firstName ||
          applyFlags.surname ||
          applyFlags.middleName ||
          applyFlags.phoneNumber ||
          applyFlags.subjects ||
          applyFlags.gender;
        if (!applied) {
          setStatus('Bulk edit: tick at least one “Apply” checkbox.');
          setEditSaving(false);
          return;
        }
        if (applyFlags.gender) {
          if (editForm.genderSelect === 'keep') {
            setStatus('Bulk gender: choose Male, Female, or Clear.');
            setEditSaving(false);
            return;
          }
        }
        if (applyFlags.firstName && !editForm.firstName.trim()) {
          setStatus('First name cannot be empty when Apply is checked.');
          setEditSaving(false);
          return;
        }
        if (applyFlags.surname && !editForm.surname.trim()) {
          setStatus('Surname cannot be empty when Apply is checked.');
          setEditSaving(false);
          return;
        }
        const body = { studentIds: selectedIds };
        if (applyFlags.firstName) body.firstName = editForm.firstName.trim();
        if (applyFlags.surname) body.surname = editForm.surname.trim();
        if (applyFlags.middleName) body.middleName = editForm.middleName.trim();
        if (applyFlags.phoneNumber) body.phoneNumber = editForm.phoneNumber.trim();
        if (applyFlags.subjects) body.subjects = editForm.subjects;
        if (applyFlags.gender) {
          if (editForm.genderSelect === 'clear') body.gender = '';
          else body.gender = editForm.genderSelect;
        }
        await api.patch('/admin/students/bulk-update', body);
        setStatus(`Updated ${selectedIds.length} student(s).`);
      }
      setEditOpen(false);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setStatus(err.response?.data?.message || err.message || 'Save failed');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteOne(id) {
    if (!window.confirm('Delete this student? Their exam session will be removed.')) return;
    try {
      await api.delete(`/admin/students/${id}`);
      setStatus('Student deleted.');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      await load();
    } catch (err) {
      setStatus(err.response?.data?.message || err.message || 'Delete failed');
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(`Delete ${selectedIds.length} student(s)? Their exam sessions will be removed.`)
    )
      return;
    try {
      await api.post('/admin/students/bulk-delete', { studentIds: selectedIds });
      setStatus(`Deleted ${selectedIds.length} student(s).`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setStatus(err.response?.data?.message || err.message || 'Delete failed');
    }
  }

  async function onUploadStudents(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadExcel('/admin/upload/students', file);
    setStatus(`${res.message} | Created: ${res.created}, Updated: ${res.updated}`);
    await load();
  }

  async function onUploadQuestions(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadExcel('/admin/upload/questions', file);
    setStatus(`${res.message} | Created: ${res.created}`);
    await load();
  }

  async function resetStudent(studentId) {
    await api.post(`/admin/students/${studentId}/reset`);
    setStatus('Student exam reset.');
    await load();
  }

  async function resetAllExams() {
    if (
      !window.confirm(
        'Reset ALL students’ exams? This removes every exam session, allows retakes, and changes question order (shuffle) for everyone. Continue?'
      )
    )
      return;
    try {
      const { data } = await api.post('/admin/students/reset-all-exams');
      setStatus(
        `All exams reset. Sessions removed: ${data.sessionsRemoved}, students updated: ${data.studentsUpdated}.`
      );
      await load();
    } catch (err) {
      setStatus(err.response?.data?.message || err.message || 'Reset failed');
    }
  }

  async function onDownloadQuestions() {
    setStatus('Downloading questions…');
    try {
      await downloadExcel('/admin/export/questions', 'questions.xlsx');
      setStatus('Questions spreadsheet downloaded.');
    } catch (e) {
      setStatus(e.response?.data?.message || e.message || 'Download failed');
    }
  }

  async function onDownloadStudents() {
    setStatus('Downloading students…');
    try {
      await downloadExcel('/admin/export/students', 'students.xlsx');
      setStatus('Students spreadsheet downloaded.');
    } catch (e) {
      setStatus(e.response?.data?.message || e.message || 'Download failed');
    }
  }

  if (!dashboard) return <div className="center">Loading dashboard...</div>;

  return (
    <div className="container">
      <div className="topbar">
        <h1>Admin Dashboard</h1>
        <button onClick={logout}>Logout</button>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Students</h3>
          <p>{dashboard.stats.studentCount}</p>
        </div>
        <div className="card">
          <h3>Questions</h3>
          <p>{dashboard.stats.questionCount}</p>
        </div>
        <div className="card">
          <h3>Submissions</h3>
          <p>{dashboard.stats.submittedCount}</p>
        </div>
        <div className="card">
          <h3>Sessions</h3>
          <p>{dashboard.stats.sessionCount}</p>
        </div>
      </div>

      <div className="card">
        <h2>Excel — upload &amp; download</h2>
        <p className="muted">
          Questions: one worksheet per subject (tab name = subject). Columns per sheet: questionText,
          optionA–D, correctAnswer. Students: include optional gender (male/female). Passwords are not
          exported (see Instructions sheet).
        </p>
        <div className="upload-row">
          <label className="upload-btn">
            Upload Students
            <input type="file" accept=".xlsx,.xls" onChange={onUploadStudents} />
          </label>
          <label className="upload-btn">
            Upload Questions
            <input type="file" accept=".xlsx,.xls" onChange={onUploadQuestions} />
          </label>
          <button type="button" className="btn-secondary" onClick={onDownloadStudents}>
            Download Students (.xlsx)
          </button>
          <button type="button" className="btn-secondary" onClick={onDownloadQuestions}>
            Download Questions (.xlsx)
          </button>
        </div>
        {status ? <p>{status}</p> : null}
      </div>

      <div className="card">
        <div className="students-toolbar">
          <h2>Students</h2>
          <div className="toolbar-actions">
            <button type="button" className="btn-secondary" disabled={selectedIds.length === 0} onClick={openEditBulk}>
              Edit selected ({selectedIds.length})
            </button>
            <button type="button" className="danger" disabled={selectedIds.length === 0} onClick={deleteSelected}>
              Delete selected ({selectedIds.length})
            </button>
            <button type="button" className="danger-outline" onClick={resetAllExams}>
              Reset all exams
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="th-check">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all students"
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Gender</th>
                <th>Subjects</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.students.map((s) => (
                <tr key={s._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={studentIdSet.has(s._id)}
                      onChange={() => toggleRow(s._id)}
                      aria-label={`Select ${s.email}`}
                    />
                  </td>
                  <td>{[s.firstName, s.middleName, s.surname].filter(Boolean).join(' ')}</td>
                  <td>{s.email}</td>
                  <td>{s.gender ? (s.gender === 'male' ? 'Male' : 'Female') : '—'}</td>
                  <td>{(s.subjects || []).join(', ')}</td>
                  <td className="td-actions">
                    <button type="button" className="btn-small" onClick={() => openEditSingle(s)}>
                      Edit
                    </button>
                    <button type="button" className="btn-small" onClick={() => resetStudent(s._id)}>
                      Reset exam
                    </button>
                    <button type="button" className="btn-small danger" onClick={() => deleteOne(s._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Recent Results</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Score</th>
                <th>Correct</th>
                <th>Submitted At</th>
                <th>Auto</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentSubmissions.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td>{r.scorePercent}%</td>
                  <td>
                    {r.totalCorrect}/{r.totalQuestions}
                  </td>
                  <td>{new Date(r.submittedAt).toLocaleString()}</td>
                  <td>{r.autoSubmitted ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !editSaving && setEditOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{editMode === 'single' ? 'Edit student' : `Edit ${selectedIds.length} students`}</h3>
            {editMode === 'bulk' ? (
              <p className="muted">
                Tick &quot;Apply&quot; for each field you want to change for every selected student. Password cannot be
                set in bulk.
              </p>
            ) : (
              <p className="muted">
                Leave password empty to keep the current password. Gender: use Clear to remove stored
                gender.
              </p>
            )}
            <form className="edit-form" onSubmit={submitEdit}>
              <div className="edit-field">
                {editMode === 'bulk' ? (
                  <label className="apply-inline">
                    <input
                      type="checkbox"
                      checked={applyFlags.firstName}
                      onChange={(e) => setApplyFlags((f) => ({ ...f, firstName: e.target.checked }))}
                    />
                    Apply
                  </label>
                ) : null}
                <label>First name</label>
                <input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                  required={editMode === 'single'}
                />
              </div>

              <div className="edit-field">
                {editMode === 'bulk' ? (
                  <label className="apply-inline">
                    <input
                      type="checkbox"
                      checked={applyFlags.surname}
                      onChange={(e) => setApplyFlags((f) => ({ ...f, surname: e.target.checked }))}
                    />
                    Apply
                  </label>
                ) : null}
                <label>Surname</label>
                <input
                  value={editForm.surname}
                  onChange={(e) => setEditForm((f) => ({ ...f, surname: e.target.value }))}
                  required={editMode === 'single'}
                />
              </div>

              <div className="edit-field">
                {editMode === 'bulk' ? (
                  <label className="apply-inline">
                    <input
                      type="checkbox"
                      checked={applyFlags.middleName}
                      onChange={(e) => setApplyFlags((f) => ({ ...f, middleName: e.target.checked }))}
                    />
                    Apply
                  </label>
                ) : null}
                <label>Middle name</label>
                <input
                  value={editForm.middleName}
                  onChange={(e) => setEditForm((f) => ({ ...f, middleName: e.target.value }))}
                />
              </div>

              <div className="edit-field">
                {editMode === 'bulk' ? (
                  <label className="apply-inline">
                    <input
                      type="checkbox"
                      checked={applyFlags.phoneNumber}
                      onChange={(e) => setApplyFlags((f) => ({ ...f, phoneNumber: e.target.checked }))}
                    />
                    Apply
                  </label>
                ) : null}
                <label>Phone</label>
                <input
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                />
              </div>

              <div className="edit-field">
                {editMode === 'bulk' ? (
                  <label className="apply-inline">
                    <input
                      type="checkbox"
                      checked={applyFlags.gender}
                      onChange={(e) => setApplyFlags((f) => ({ ...f, gender: e.target.checked }))}
                    />
                    Apply
                  </label>
                ) : null}
                <label>Gender</label>
                <select
                  value={editForm.genderSelect}
                  onChange={(e) => setEditForm((f) => ({ ...f, genderSelect: e.target.value }))}
                  className="select-input"
                >
                  {editMode === 'single' ? <option value="keep">No change</option> : null}
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="clear">Clear (remove gender)</option>
                </select>
              </div>

              <div className="edit-field">
                {editMode === 'bulk' ? (
                  <label className="apply-inline">
                    <input
                      type="checkbox"
                      checked={applyFlags.subjects}
                      onChange={(e) => setApplyFlags((f) => ({ ...f, subjects: e.target.checked }))}
                    />
                    Apply
                  </label>
                ) : null}
                <label>Subjects (comma-separated)</label>
                <input
                  value={editForm.subjects}
                  onChange={(e) => setEditForm((f) => ({ ...f, subjects: e.target.value }))}
                  placeholder="Math, English, Biology"
                />
              </div>

              {editMode === 'single' ? (
                <div className="edit-field">
                  <label>New password (optional)</label>
                  <input
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                  />
                </div>
              ) : null}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" disabled={editSaving} onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
