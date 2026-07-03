import { useEffect, useState } from 'react';
import client from '../api/client.js';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', specialization: '', slotDurationMin: 20, start: '09:00', end: '17:00' });
  const [leaveForm, setLeaveForm] = useState({ doctorId: '', date: '', reason: '' });
  const [message, setMessage] = useState('');

  function refresh() {
    client.get('/admin/doctors').then(({ data }) => setDoctors(data.doctors));
  }
  useEffect(refresh, []);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function createDoctor(e) {
    e.preventDefault();
    const workingHours = Object.fromEntries(DAYS.map((d) => [d, [form.start, form.end]]));
    await client.post('/admin/doctors', {
      email: form.email,
      password: form.password,
      fullName: form.fullName,
      specialization: form.specialization,
      slotDurationMin: Number(form.slotDurationMin),
      workingHours,
    });
    setMessage(`Doctor account created for ${form.fullName}.`);
    setForm({ ...form, fullName: '', email: '', password: '', specialization: '' });
    refresh();
  }

  async function addLeave(e) {
    e.preventDefault();
    const { data } = await client.post(`/admin/doctors/${leaveForm.doctorId}/leave`, {
      date: leaveForm.date,
      reason: leaveForm.reason,
    });
    setMessage(`Leave added. ${data.affectedAppointments} affected patient(s) were notified.`);
    setLeaveForm({ doctorId: '', date: '', reason: '' });
    refresh();
  }

  return (
    <div>
      <h2>Admin</h2>
      {message && <p className="success">{message}</p>}

      <div className="card">
        <h3>Add a doctor</h3>
        <form onSubmit={createDoctor} className="stack-form">
          <input placeholder="Full name" value={form.fullName} onChange={update('fullName')} required />
          <input type="email" placeholder="Email" value={form.email} onChange={update('email')} required />
          <input type="password" placeholder="Temporary password" value={form.password} onChange={update('password')} required />
          <input placeholder="Specialization" value={form.specialization} onChange={update('specialization')} required />
          <label>Slot length (minutes)
            <input type="number" value={form.slotDurationMin} onChange={update('slotDurationMin')} />
          </label>
          <div className="inline-form">
            <label>Working hours from <input type="time" value={form.start} onChange={update('start')} /></label>
            <label>to <input type="time" value={form.end} onChange={update('end')} /></label>
          </div>
          <button type="submit">Create doctor</button>
        </form>
      </div>

      <div className="card">
        <h3>Mark a doctor on leave</h3>
        <form onSubmit={addLeave} className="stack-form">
          <select value={leaveForm.doctorId} onChange={(e) => setLeaveForm({ ...leaveForm, doctorId: e.target.value })} required>
            <option value="">Select doctor</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.user.fullName} - {d.specialization}</option>)}
          </select>
          <input type="date" value={leaveForm.date} onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })} required />
          <input placeholder="Reason (optional)" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          <button type="submit">Add leave</button>
        </form>
      </div>

      <h3>All doctors</h3>
      {doctors.map((d) => (
        <div className="card" key={d.id}>
          <strong>{d.user.fullName}</strong> — {d.specialization}
          <p>{d.leaves.length} leave day(s) on record</p>
        </div>
      ))}
    </div>
  );
}
