const prisma = require('../config/db');

/** GET /api/doctors?specialization=Cardiology - patient-facing search */
async function searchDoctors(req, res, next) {
  try {
    const { specialization } = req.query;
    const doctors = await prisma.doctorProfile.findMany({
      where: specialization ? { specialization: { contains: specialization, mode: 'insensitive' } } : undefined,
      include: { user: { select: { fullName: true, email: true } } },
    });
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
}

/** GET /api/doctors/me/appointments - upcoming confirmed appointments for the logged-in doctor */
async function myAppointments(req, res, next) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
    if (!doctorProfile) return res.status(404).json({ error: 'Doctor profile not found' });

    const appointments = await prisma.appointment.findMany({
      where: { doctorId: doctorProfile.id, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      include: { patient: { select: { fullName: true, email: true, phone: true } } },
      orderBy: { slotStart: 'asc' },
    });

    res.json({ appointments });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchDoctors, myAppointments };
