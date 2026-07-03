const { PrismaClient } = require('@prisma/client');

// Reuse a single client across the app instead of opening a new pool per request.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
