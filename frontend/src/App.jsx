import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { useTheme } from './context/ThemeContext.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import PatientDashboard from './pages/PatientDashboard.jsx';
import BookAppointment from './pages/BookAppointment.jsx';
import DoctorDashboard from './pages/DoctorDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <nav className="nav">
      <Link to="/" className="brand">BeHealthy</Link>
      <div className="nav-links">
        {!user && <><Link to="/login">Log in</Link><Link to="/register">Sign up</Link></>}
        {user?.role === 'PATIENT' && <Link to="/book">Book Appointment</Link>}
        {user && <button onClick={logout} className="link-btn">Log out</button>}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </nav>
  );
}

function Home() {
  const { user } = useAuth();
  if (!user) {
    return (
      <div className="hero">
        <h1>BeHealthy</h1>
        <p>Book appointments, get symptom summaries ready for your doctor, and never miss a dose.</p>
      </div>
    );
  }
  if (user.role === 'PATIENT') return <Navigate to="/patient" replace />;
  if (user.role === 'DOCTOR') return <Navigate to="/doctor" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/patient" element={<Protected role="PATIENT"><PatientDashboard /></Protected>} />
          <Route path="/book" element={<Protected role="PATIENT"><BookAppointment /></Protected>} />
          <Route path="/doctor" element={<Protected role="DOCTOR"><DoctorDashboard /></Protected>} />
          <Route path="/admin" element={<Protected role="ADMIN"><AdminDashboard /></Protected>} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
