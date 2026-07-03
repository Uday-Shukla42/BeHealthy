const cron = require('node-cron');
const prisma = require('../config/db');
const email = require('./emailService');

const MAX_ATTEMPTS = 5;

async function sendDueMedicationReminders() {
  const due = await prisma.medicationReminder.findMany({
    where: { sent: false, scheduledFor: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
    include: { appointment: { include: { patient: true } } },
  });

  for (const reminder of due) {
    const ok = await email.sendNotification({
      userId: reminder.appointment.patientId,
      to: reminder.appointment.patient.email,
      type: 'MEDICATION_REMINDER',
      data: { name: reminder.appointment.patient.fullName, drugName: reminder.drugName },
    });

    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: ok
        ? { sent: true }
        : { attempts: { increment: 1 }, lastError: 'Email send failed - will retry' },
    });
  }

  return due.length;
}

function start() {
  // Every 5 minutes: send anything due, and retry anything that previously failed.
  cron.schedule('*/5 * * * *', async () => {
    try {
      const remindersSent = await sendDueMedicationReminders();
      const retried = await email.retryFailedNotifications(MAX_ATTEMPTS);
      if (remindersSent || retried) {
        console.log(`[reminderJob] sent ${remindersSent} medication reminders, retried ${retried} failed notifications`);
      }
    } catch (err) {
      console.error('[reminderJob] run failed:', err);
    }
  });

  console.log('[reminderJob] scheduled to run every 5 minutes');
}

module.exports = { start, sendDueMedicationReminders };
