import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await client.post('/auth/register', form);
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  }

  return (
    <div className="card auth-card">
      <h2>Create a patient account</h2>
      <form onSubmit={handleSubmit}>
        <label>Full name
          <input value={form.fullName} onChange={update('fullName')} required />
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>Phone
          <input value={form.phone} onChange={update('phone')} />
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign up</button>
      </form>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
