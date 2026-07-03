const express = require('express');
const router = express.Router();
const doctor = require('../controllers/doctorController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', doctor.searchDoctors);
router.get('/me/appointments', requireAuth, requireRole('DOCTOR'), doctor.myAppointments);

module.exports = router;
