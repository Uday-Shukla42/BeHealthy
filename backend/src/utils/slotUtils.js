const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Builds the list of bookable slot start times for a doctor on a given date,
 * based on their working hours and slot duration. Does not yet account for
 * existing bookings or leave - callers filter those out separately.
 */
function generateSlotsForDate(workingHours, slotDurationMin, date) {
  const dayKey = WEEKDAYS[date.getDay()];
  const window = workingHours[dayKey];
  if (!window) return []; // doctor doesn't work this day

  const [startStr, endStr] = window;
  const slots = [];

  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);

  const cursor = new Date(date);
  cursor.setHours(startH, startM, 0, 0);

  const end = new Date(date);
  end.setHours(endH, endM, 0, 0);

  while (cursor.getTime() + slotDurationMin * 60000 <= end.getTime()) {
    slots.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + slotDurationMin);
  }

  return slots;
}

function isSameCalendarDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateOnlyUTC(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

module.exports = { generateSlotsForDate, isSameCalendarDate, toDateOnlyUTC, WEEKDAYS };
