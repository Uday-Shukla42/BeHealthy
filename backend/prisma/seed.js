// Creates a starter admin account so you have somewhere to log in and
// start adding doctors from. Run with: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@behealthy.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin already exists, skipping seed.');
    return;
  }

  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  await prisma.user.create({
    data: { email, passwordHash, fullName: 'Clinic Admin', role: 'ADMIN' },
  });

  console.log(`Admin created: ${email} / ChangeMe123! (change this immediately)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
