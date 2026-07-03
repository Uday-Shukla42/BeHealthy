const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('ADMIN'));

router.get('/doctors', admin.listDoctors);
router.post('/doctors', admin.createDoctor);
router.patch('/doctors/:id', admin.updateDoctor);
router.post('/doctors/:id/leave', admin.addLeave);

module.exports = router;
