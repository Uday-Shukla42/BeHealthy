const prisma = require('../config/db');

/** GET /api/patients/me/appointments */
async function myAppointments(req, res, next) {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.user.id },
      include: { doctor: { include: { user: { select: { fullName: true } } } } },
      orderBy: { slotStart: 'desc' },
    });
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
}

module.exports = { myAppointments };
