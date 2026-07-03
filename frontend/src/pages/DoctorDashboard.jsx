import { useEffect, useState } from 'react';
import client from '../api/client.js';

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [notes, setNotes] = useState('');
  const [prescription, setPrescription] = useState([{ drug: '', dose: '', frequencyPerDay: 1, durationDays: 5 }]);

  useEffect(() => {
    client.get('/doctors/me/appointments').then(({ data }) => setAppointments(data.appointments));
  }, []);

  function addDrug() {
    setPrescription([...prescription, { drug: '', dose: '', frequencyPerDay: 1, durationDays: 5 }]);
  }

  function updateDrug(i, field, value) {
    const copy = [...prescription];
    copy[i] = { ...copy[i], [field]: value };
    setPrescription(copy);
  }

  async function submitPostVisit(id) {
    await client.post(`/appointments/${id}/post-visit`, { clinicalNotes: notes, prescription });
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'COMPLETED' } : a)));
    setOpenId(null);
    setNotes('');
    setPrescription([{ drug: '', dose: '', frequencyPerDay: 1, durationDays: 5 }]);
  }

  return (
    <div>
      <h2>Today's patients</h2>
      {appointments.map((a) => (
        <div className="card" key={a.id}>
          <div className="row-between">
            <strong>{a.patient.fullName}</strong>
            <span className={`badge urgency-${(a.urgency || 'medium').toLowerCase()}`}>{a.urgency || 'PENDING'}</span>
          </div>
          <p>{new Date(a.slotStart).toLocaleString()}</p>

          {a.preVisitSummary && (
            <div className="summary-box">
              <p><strong>Chief complaint:</strong> {a.preVisitSummary.chiefComplaint}</p>
              {a.preVisitSummary.suggestedQuestions?.length > 0 && (
                <>
                  <strong>Suggested questions:</strong>
                  <ul>{a.preVisitSummary.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </>
              )}
            </div>
          )}

          {a.status === 'CONFIRMED' && openId !== a.id && (
            <button className="btn" onClick={() => setOpenId(a.id)}>Complete visit</button>
          )}

          {openId === a.id && (
            <div className="post-visit-form">
              <textarea rows={4} placeholder="Clinical notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <h4>Prescription</h4>
              {prescription.map((p, i) => (
                <div className="inline-form" key={i}>
                  <input placeholder="Drug" value={p.drug} onChange={(e) => updateDrug(i, 'drug', e.target.value)} />
                  <input placeholder="Dose (e.g. 500mg)" value={p.dose} onChange={(e) => updateDrug(i, 'dose', e.target.value)} />
                  <input type="number" min={1} placeholder="Times/day" value={p.frequencyPerDay} onChange={(e) => updateDrug(i, 'frequencyPerDay', Number(e.target.value))} />
                  <input type="number" min={1} placeholder="Days" value={p.durationDays} onChange={(e) => updateDrug(i, 'durationDays', Number(e.target.value))} />
                </div>
              ))}
              <button type="button" className="btn-outline" onClick={addDrug}>+ Add medication</button>
              <button className="btn" onClick={() => submitPostVisit(a.id)}>Submit & notify patient</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
