const prisma = require('../config/db');
const { generateSlotsForDate, toDateOnlyUTC } = require('../utils/slotUtils');
const llm = require('../services/llmService');
const email = require('../services/emailService');
const calendar = require('../services/calendarService');

const HOLD_MINUTES = Number(process.env.SLOT_HOLD_MINUTES || 5);

/**
 * GET /api/appointments/available-slots?doctorId=&date=YYYY-MM-DD
 * Returns bookable slots for a day: generated from working hours, minus
 * anything already CONFIRMED/HELD-and-not-expired, minus leave days.
 */
async function getAvailableSlots(req, res, next) {
  try {
    const { doctorId, date } = req.query;
    const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const day = toDateOnlyUTC(new Date(date));

    const onLeave = await prisma.doctorLeave.findUnique({
      where: { doctorId_date: { doctorId, date: day } },
    });
    if (onLeave) return res.json({ slots: [], reason: 'Doctor is on leave this day' });

    const allSlots = generateSlotsForDate(doctor.workingHours, doctor.slotDurationMin, new Date(date));

    const taken = await prisma.appointment.findMany({
      where: {
        doctorId,
        slotStart: { gte: day, lt: new Date(day.getTime() + 86400000) },
        OR: [{ status: 'CONFIRMED' }, { status: 'HELD', holdExpiresAt: { gt: new Date() } }],
      },
      select: { slotStart: true },
    });
    const takenTimes = new Set(taken.map((t) => t.slotStart.getTime()));

    const free = allSlots.filter((s) => !takenTimes.has(s.getTime()));
    res.json({ slots: free });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/appointments/hold  { doctorId, slotStart }
 * Step 1 of booking: briefly reserve the slot while the patient fills the
 * symptom form, so two people can't both land on the same slot at once.
 * This is the primary defense against the race condition; the DB unique
 * constraint on (doctorId, slotStart) is the last-resort backstop.
 */
async function holdSlot(req, res, next) {
  try {
    const patientId = req.user.id;
    const { doctorId, slotStart } = req.body;
    const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const start = new Date(slotStart);
    const end = new Date(start.getTime() + doctor.slotDurationMin * 60000);
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60000);

    // A transaction with the unique (doctorId, slotStart) index means that
    // if two requests race here, the database itself rejects the second
    // insert - we never rely on a check-then-write gap.
    const appointment = await prisma.$transaction(async (tx) => {
      // Clear out any of this doctor's holds that have already expired for this slot
      await tx.appointment.deleteMany({
        where: { doctorId, slotStart: start, status: 'HELD', holdExpiresAt: { lt: new Date() } },
      });

      return tx.appointment.create({
        data: {
          patientId,
          doctorId,
          slotStart: start,
          slotEnd: end,
          status: 'HELD',
          holdExpiresAt,
        },
      });
    });

    res.status(201).json({ appointment });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This slot was just taken. Please choose another.' });
    }
    next(err);
  }
}

/**
 * POST /api/appointments/:id/confirm  { symptomsText }
 * Step 2: patient submits symptoms, we generate the pre-visit LLM summary,
 * flip status to CONFIRMED, and fire off email + calendar events for both sides.
 */
async function confirmAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { symptomsText } = req.body;

    const held = await prisma.appointment.findUnique({
      where: { id },
      include: { doctor: { include: { user: true } }, patient: true },
    });

    if (!held || held.patientId !== req.user.id) return res.status(404).json({ error: 'Hold not found' });
    if (held.status !== 'HELD') return res.status(409).json({ error: 'This hold is no longer active' });
    if (held.holdExpiresAt < new Date()) {
      await prisma.appointment.delete({ where: { id } });
      return res.status(410).json({ error: 'Your slot hold expired. Please pick a slot again.' });
    }

    const summary = await llm.generatePreVisitSummary(symptomsText);

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        holdExpiresAt: null,
        symptomsText,
        preVisitSummary: summary.data,
        urgency: summary.data.urgency?.toUpperCase() || 'MEDIUM',
      },
    });

    // Best-effort side effects - none of these should fail the booking itself.
    const doctorName = held.doctor.user.fullName;
    const patientName = held.patient.fullName;

    email
      .sendNotification({
        userId: held.patientId,
        to: held.patient.email,
        type: 'BOOKING_CONFIRMATION',
        data: { name: patientName, doctorName, slotStart: held.slotStart.toString() },
      })
      .catch((e) => console.error('confirm email (patient) failed', e));

    email
      .sendNotification({
        userId: held.doctor.user.id,
        to: held.doctor.user.email,
        type: 'BOOKING_CONFIRMATION',
        data: { name: doctorName, doctorName, slotStart: held.slotStart.toString() },
      })
      .catch((e) => console.error('confirm email (doctor) failed', e));

    calendar
      .createEvent(held.patientId, {
        summary: `Appointment with Dr. ${doctorName}`,
        description: 'BeHealthy clinic appointment',
        start: held.slotStart,
        end: held.slotEnd,
      })
      .then((eventId) => eventId && prisma.appointment.update({ where: { id }, data: { googleEventIdPatient: eventId } }))
      .catch((e) => console.error('calendar event (patient) failed', e));

    calendar
      .createEvent(held.doctor.user.id, {
        summary: `Appointment with ${patientName}`,
        description: 'BeHealthy clinic appointment',
        start: held.slotStart,
        end: held.slotEnd,
      })
      .then((eventId) => eventId && prisma.appointment.update({ where: { id }, data: { googleEventIdDoctor: eventId } }))
      .catch((e) => console.error('calendar event (doctor) failed', e));

    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

/** POST /api/appointments/:id/cancel */
async function cancelAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const appt = await prisma.appointment.findUnique({
      where: { id },
      include: { doctor: { include: { user: true } }, patient: true },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const isOwner = req.user.id === appt.patientId || req.user.id === appt.doctor.userId;
    if (!isOwner && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not your appointment' });

    await prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });

    if (appt.googleEventIdPatient) calendar.deleteEvent(appt.patientId, appt.googleEventIdPatient).catch(() => {});
    if (appt.googleEventIdDoctor) calendar.deleteEvent(appt.doctor.userId, appt.googleEventIdDoctor).catch(() => {});

    email
      .sendNotification({
        userId: appt.patientId,
        to: appt.patient.email,
        type: 'CANCELLATION',
        data: { name: appt.patient.fullName, doctorName: appt.doctor.user.fullName, slotStart: appt.slotStart.toString(), reason },
      })
      .catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/appointments/:id/post-visit  (doctor only) { clinicalNotes, prescription } */
async function submitPostVisit(req, res, next) {
  try {
    const { id } = req.params;
    const { clinicalNotes, prescription } = req.body;

    const appt = await prisma.appointment.findUnique({ where: { id }, include: { patient: true, doctor: true } });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (appt.doctor.userId !== req.user.id) return res.status(403).json({ error: 'Not your appointment' });

    const summary = await llm.generatePostVisitSummary(clinicalNotes, prescription);

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'COMPLETED', clinicalNotes, prescription, postVisitSummary: summary.data },
    });

    // Schedule medication reminders based on prescription frequency
    const now = new Date();
    for (const drug of prescription || []) {
      const perDay = drug.frequencyPerDay || 1;
      const intervalHours = 24 / perDay;
      const days = drug.durationDays || 1;

      for (let d = 0; d < days; d++) {
        for (let dose = 0; dose < perDay; dose++) {
          const scheduledFor = new Date(now.getTime() + (d * 24 + dose * intervalHours) * 3600000);
          await prisma.medicationReminder.create({
            data: { appointmentId: id, drugName: drug.drug, scheduledFor },
          });
        }
      }
    }

    res.json({ appointment: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAvailableSlots, holdSlot, confirmAppointment, cancelAppointment, submitPostVisit };
