const nodemailer = require('nodemailer');
const prisma = require('../config/db');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const TEMPLATES = {
  BOOKING_CONFIRMATION: ({ name, doctorName, slotStart }) => ({
    subject: 'Your BeHealthy appointment is confirmed',
    text: `Hi ${name},\n\nYour appointment with Dr. ${doctorName} on ${slotStart} is confirmed.\n\nPlease fill out your symptom form before the visit so your doctor can prepare.\n\n- BeHealthy Clinic`,
  }),
  REMINDER: ({ name, doctorName, slotStart }) => ({
    subject: 'Appointment reminder - BeHealthy',
    text: `Hi ${name},\n\nThis is a reminder for your appointment with Dr. ${doctorName} on ${slotStart}.\n\n- BeHealthy Clinic`,
  }),
  MEDICATION_REMINDER: ({ name, drugName }) => ({
    subject: 'Medication reminder - BeHealthy',
    text: `Hi ${name},\n\nTime to take your medication: ${drugName}.\n\n- BeHealthy Clinic`,
  }),
  CANCELLATION: ({ name, doctorName, slotStart, reason }) => ({
    subject: 'Your BeHealthy appointment was cancelled',
    text: `Hi ${name},\n\nYour appointment with Dr. ${doctorName} on ${slotStart} has been cancelled.${reason ? ` Reason: ${reason}` : ''}\n\nPlease rebook at your convenience.\n\n- BeHealthy Clinic`,
  }),
  LEAVE_CONFLICT: ({ name, doctorName, slotStart }) => ({
    subject: 'Your doctor is unavailable - please rebook',
    text: `Hi ${name},\n\nDr. ${doctorName} has taken leave on the date of your appointment (${slotStart}), so it has been cancelled. We're sorry for the inconvenience - please rebook a new slot.\n\n- BeHealthy Clinic`,
  }),
};

/**
 * Sends an email and logs the attempt to the Notification table so a
 * background job can retry it if the send fails (e.g. SMTP provider hiccup).
 */
async function sendNotification({ userId, to, type, data }) {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown email template: ${type}`);

  const { subject, text } = template(data);

  const record = await prisma.notification.create({
    data: { userId, type, channel: 'EMAIL', status: 'PENDING', payload: { to, subject, text } },
  });

  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
    await prisma.notification.update({ where: { id: record.id }, data: { status: 'SENT' } });
    return true;
  } catch (err) {
    console.error(`Email send failed (${type} -> ${to}):`, err.message);
    await prisma.notification.update({
      where: { id: record.id },
      data: { status: 'FAILED', attempts: { increment: 1 }, lastError: err.message },
    });
    return false;
  }
}

/** Retries any FAILED notifications under a max attempt cap. Called by the cron job. */
async function retryFailedNotifications(maxAttempts = 5) {
  const failed = await prisma.notification.findMany({
    where: { status: 'FAILED', channel: 'EMAIL', attempts: { lt: maxAttempts } },
  });

  for (const n of failed) {
    const { to, subject, text } = n.payload;
    try {
      await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT' } });
    } catch (err) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts: { increment: 1 }, lastError: err.message },
      });
    }
  }

  return failed.length;
}

module.exports = { sendNotification, retryFailedNotifications };
