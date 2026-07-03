const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const email = require('../services/emailService');
const calendar = require('../services/calendarService');
const { toDateOnlyUTC } = require('../utils/slotUtils');

/** POST /api/admin/doctors  - creates the login + profile for a new doctor in one call */
async function createDoctor(req, res, next) {
  try {
    const { email: doctorEmail, password, fullName, specialization, slotDurationMin, workingHours } = req.body;

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: doctorEmail,
        passwordHash,
        fullName,
        role: 'DOCTOR',
        doctorProfile: {
          create: { specialization, slotDurationMin: slotDurationMin || 20, workingHours },
        },
      },
      include: { doctorProfile: true },
    });

    res.status(201).json({ doctor: user });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/doctors/:id */
async function updateDoctor(req, res, next) {
  try {
    const { id } = req.params;
    const { specialization, slotDurationMin, workingHours } = req.body;

    const doctor = await prisma.doctorProfile.update({
      where: { id },
      data: { specialization, slotDurationMin, workingHours },
    });

    res.json({ doctor });
  } catch (err) {
    next(err);
  }
}

async function listDoctors(req, res, next) {
  try {
    const doctors = await prisma.doctorProfile.findMany({ include: { user: true, leaves: true } });
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/doctors/:id/leave  { date, reason }
 * Marks a doctor unavailable for a date. Any existing CONFIRMED appointments
 * on that day are cancelled and every affected patient is emailed - this is
 * the "leave conflict" handling called out in the assignment.
 */
async function addLeave(req, res, next) {
  try {
    const { id: doctorId } = req.params;
    const { date, reason } = req.body;
    const day = toDateOnlyUTC(new Date(date));

    const leave = await prisma.doctorLeave.create({ data: { doctorId, date: day, reason } });

    const affected = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: 'CONFIRMED',
        slotStart: { gte: day, lt: new Date(day.getTime() + 86400000) },
      },
      include: { patient: true, doctor: { include: { user: true } } },
    });

    for (const appt of affected) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' } });

      if (appt.googleEventIdPatient) calendar.deleteEvent(appt.patientId, appt.googleEventIdPatient).catch(() => {});
      if (appt.googleEventIdDoctor) calendar.deleteEvent(appt.doctor.userId, appt.googleEventIdDoctor).catch(() => {});

      email
        .sendNotification({
          userId: appt.patientId,
          to: appt.patient.email,
          type: 'LEAVE_CONFLICT',
          data: { name: appt.patient.fullName, doctorName: appt.doctor.user.fullName, slotStart: appt.slotStart.toString() },
        })
        .catch((e) => console.error('leave-conflict email failed', e));
    }

    res.status(201).json({ leave, affectedAppointments: affected.length });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDoctor, updateDoctor, listDoctors, addLeave };
