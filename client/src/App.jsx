// client/src/App.jsx
import { useAuth } from './AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import PublicSearchPage from './pages/PublicSearchPage.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import TaDashboard from './pages/TaDashboard.jsx';
// TODO: create these later
// import TaDashboard from './pages/TaDashboard';
// import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const { user, logout } = useAuth();

  const mustChangePassword = user?.firstLogin;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Lab 4 Signup System</h1>
        {user ? (
          <div className="user-info">
            <span>
              {user.username} ({user.role})
            </span>
            <button onClick={logout}>Logout</button>
          </div>
        ) : null}
      </header>

      <main>
        {/* public search is always visible */}
        <PublicSearchPage />

        {/* auth area */}
        {!user && (
          <section>
            <h2>Login</h2>
            <LoginPage />
          </section>
        )}

        {user && mustChangePassword && (
          <section>
            <h2>First Login – Change Password</h2>
            <p>
              You must change your initial password before using the rest of the
              site.
            </p>
            <ChangePasswordPage />
          </section>
        )}

        {user && !mustChangePassword && (
          <section>
            {/* Simple role-based switch for now */}
            {user.role === 'student' && <StudentDashboard />}
            {(user.role === 'ta' || user.role === 'admin') && <TaDashboard />}
          </section>
        )}
      </main>
    </div>
  );
}

