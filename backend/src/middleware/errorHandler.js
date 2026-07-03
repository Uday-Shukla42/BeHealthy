// Keeps error responses consistent and stops raw stack traces leaking to clients.
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}]`, err);

  if (err.code === 'P2002') {
    // Prisma unique constraint violation - most commonly a slot that just got taken
    return res.status(409).json({ error: 'That slot was just booked by someone else. Please pick another.' });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong on our end.' : err.message;
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
