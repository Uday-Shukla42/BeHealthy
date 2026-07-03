const { google } = require('googleapis');
const prisma = require('../config/db');

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(userId) {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: userId, // so the callback knows which user just authorized
  });
}

async function handleOAuthCallback(code, userId) {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleRefreshToken: tokens.refresh_token,
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });
}

async function getClientForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken) return null; // user never connected their calendar

  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: user.googleRefreshToken });
  return client;
}

/** Creates a calendar event for a user if they've connected Google Calendar; no-op otherwise. */
async function createEvent(userId, { summary, description, start, end }) {
  const client = await getClientForUser(userId);
  if (!client) return null;

  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return res.data.id;
}

async function updateEvent(userId, eventId, { summary, description, start, end }) {
  const client = await getClientForUser(userId);
  if (!client || !eventId) return;

  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
}

async function deleteEvent(userId, eventId) {
  const client = await getClientForUser(userId);
  if (!client || !eventId) return;

  const calendar = google.calendar({ version: 'v3', auth: client });
  // Ignore "already deleted" errors - the end state we want is "event gone".
  await calendar.events.delete({ calendarId: 'primary', eventId }).catch((err) => {
    if (err.code !== 410 && err.code !== 404) throw err;
  });
}

module.exports = { getAuthUrl, handleOAuthCallback, createEvent, updateEvent, deleteEvent };
