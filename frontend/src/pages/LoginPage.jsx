import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'admin' ? '/admin' : '/student');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Cannot reach API. Check VITE_API_BASE_URL (do not use 0.0.0.0) and that the backend is running.'
          : err.message || 'Login failed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>CBT Login</h1>
        <p>Use admin or student credentials.</p>
        <input
          placeholder="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
        />
        <input
          placeholder="Password"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
        />
        {error ? <div className="error">{error}</div> : null}
        <button disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </div>
  );
}

