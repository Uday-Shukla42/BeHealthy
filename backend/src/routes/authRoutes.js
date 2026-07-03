const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const calendar = require('../services/calendarService');
const { requireAuth } = require('../middleware/auth');

router.post('/register', auth.register);
router.post('/login', auth.login);

// Google Calendar connect flow - user must already be logged in
router.get('/google/connect', requireAuth, (req, res) => {
  res.json({ url: calendar.getAuthUrl(req.user.id) });
});

router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state: userId } = req.query;
    await calendar.handleOAuthCallback(code, userId);
    res.redirect(`${process.env.CLIENT_URL}/settings?calendar=connected`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
