const express = require('express');
const router = express.Router();
const patient = require('../controllers/patientController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/me/appointments', requireAuth, requireRole('PATIENT'), patient.myAppointments);

module.exports = router;
