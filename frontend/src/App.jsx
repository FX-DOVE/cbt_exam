import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthContext.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { StudentExamPage } from './pages/StudentExamPage.jsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.jsx';

function RequireAuth({ children, role }) {
  const { ready, user } = useAuth();
  if (!ready) return <div className="center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/student"
        element={
          <RequireAuth role="student">
            <StudentExamPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminDashboardPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to={user?.role === 'admin' ? '/admin' : user?.role === 'student' ? '/student' : '/login'} replace />} />
    </Routes>
  );
}

