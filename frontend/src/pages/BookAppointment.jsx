import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client.js';

const STEPS = { PICK_DOCTOR: 0, PICK_SLOT: 1, SYMPTOMS: 2, DONE: 3 };

export default function BookAppointment() {
  const [step, setStep] = useState(STEPS.PICK_DOCTOR);
  const [specialization, setSpecialization] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]);
  const [held, setHeld] = useState(null); // { appointment }
  const [symptoms, setSymptoms] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function searchDoctors(e) {
    e?.preventDefault();
    const { data } = await client.get('/doctors', { params: { specialization } });
    setDoctors(data.doctors);
  }

  useEffect(() => { searchDoctors(); }, []);

  async function pickDoctor(doctor) {
    setSelectedDoctor(doctor);
    setStep(STEPS.PICK_SLOT);
    loadSlots(doctor.id, date);
  }

  async function loadSlots(doctorId, forDate) {
    const { data } = await client.get('/appointments/available-slots', { params: { doctorId, date: forDate } });
    setSlots(data.slots || []);
  }

  async function pickSlot(slot) {
    setError('');
    try {
      const { data } = await client.post('/appointments/hold', { doctorId: selectedDoctor.id, slotStart: slot });
      setHeld(data.appointment);
      setStep(STEPS.SYMPTOMS);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not hold that slot');
      loadSlots(selectedDoctor.id, date); // refresh in case it's now taken
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post(`/appointments/${held.id}/confirm`, { symptomsText: symptoms });
      setStep(STEPS.DONE);
      setTimeout(() => navigate('/patient'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm booking. Your hold may have expired.');
    }
  }

  return (
    <div>
      <h2>Book an appointment</h2>

      {step === STEPS.PICK_DOCTOR && (
        <>
          <form onSubmit={searchDoctors} className="inline-form">
            <input placeholder="Search by specialization (e.g. Cardiology)" value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
            <button type="submit">Search</button>
          </form>
          {doctors.map((d) => (
            <div className="card" key={d.id}>
              <strong>Dr. {d.user.fullName}</strong>
              <p>{d.specialization} · {d.slotDurationMin} min appointments</p>
              <button className="btn" onClick={() => pickDoctor(d)}>Select</button>
            </div>
          ))}
        </>
      )}

      {step === STEPS.PICK_SLOT && (
        <>
          <p>Dr. {selectedDoctor.user.fullName} — {selectedDoctor.specialization}</p>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); loadSlots(selectedDoctor.id, e.target.value); }} />
          {error && <p className="error">{error}</p>}
          <div className="slot-grid">
            {slots.length === 0 && <p>No slots available this day.</p>}
            {slots.map((s) => (
              <button key={s} className="slot-btn" onClick={() => pickSlot(s)}>
                {new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </>
      )}

      {step === STEPS.SYMPTOMS && (
        <form onSubmit={confirm} className="card">
          <p>Your slot is held for a few minutes. Tell us what's going on so your doctor can prepare.</p>
          <textarea rows={5} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Describe your symptoms..." required />
          {error && <p className="error">{error}</p>}
          <button type="submit">Confirm appointment</button>
        </form>
      )}

      {step === STEPS.DONE && <p>Appointment confirmed! Redirecting to your dashboard...</p>}
    </div>
  );
}
