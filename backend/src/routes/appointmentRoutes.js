const express = require('express');
const router = express.Router();
const appt = require('../controllers/appointmentController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/available-slots', appt.getAvailableSlots);
router.post('/hold', requireAuth, requireRole('PATIENT'), appt.holdSlot);
router.post('/:id/confirm', requireAuth, requireRole('PATIENT'), appt.confirmAppointment);
router.post('/:id/cancel', requireAuth, appt.cancelAppointment);
router.post('/:id/post-visit', requireAuth, requireRole('DOCTOR'), appt.submitPostVisit);

module.exports = router;
