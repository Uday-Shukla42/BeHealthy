import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client.js';

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/patients/me/appointments').then(({ data }) => {
      setAppointments(data.appointments);
      setLoading(false);
    });
  }, []);

  async function cancel(id) {
    if (!confirm('Cancel this appointment?')) return;
    await client.post(`/appointments/${id}/cancel`, {});
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'CANCELLED' } : a)));
  }

  if (loading) return <p>Loading your appointments...</p>;

  return (
    <div>
      <div className="row-between">
        <h2>Your appointments</h2>
        <Link to="/book" className="btn">Book new appointment</Link>
      </div>

      {appointments.length === 0 && <p>No appointments yet.</p>}

      {appointments.map((a) => (
        <div className="card" key={a.id}>
          <div className="row-between">
            <strong>Dr. {a.doctor.user.fullName}</strong>
            <span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
          </div>
          <p>{new Date(a.slotStart).toLocaleString()}</p>

          {a.postVisitSummary && (
            <div className="summary-box">
              <h4>Visit summary</h4>
              <p>{a.postVisitSummary}</p>
            </div>
          )}

          {a.status === 'CONFIRMED' && (
            <button className="btn-outline" onClick={() => cancel(a.id)}>Cancel</button>
          )}
        </div>
      ))}
    </div>
  );
}
