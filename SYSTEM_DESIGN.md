# System Design Notes

## Double-booking prevention

Booking happens in two steps, not one, because "check if a slot is free" and "write the booking" can never safely be a single client-side decision when multiple patients might click the same slot within milliseconds of each other.

**Step 1 — hold.** `POST /appointments/hold` runs inside a Prisma transaction that first clears any of that doctor's expired holds for the slot, then inserts a new `Appointment` row with `status = HELD`. The insert targets a table with a **unique index on `(doctorId, slotStart)`**. If two requests race, Postgres — not application code — rejects the second insert with a unique-constraint violation, which the API turns into a 409 "slot just taken" response. This is deliberate: any check-then-write pattern in JavaScript has a gap between the read and the write where a second request can slip through, but a database unique constraint is atomic by construction. The constraint is the actual guarantee; the application-level slot-listing logic is just a UX convenience so patients rarely even see a conflict.

**Step 2 — confirm.** The hold gives the patient a few minutes (`SLOT_HOLD_MINUTES`, default 5) to fill in the symptom form. `POST /appointments/:id/confirm` flips the row to `CONFIRMED`. If the hold has expired, the row is deleted and the patient is told to pick again — this frees the slot for someone else rather than letting abandoned holds pile up. A cron-free approach was intentional here: expired holds are cleaned up lazily, at the moment the next person tries to hold that same slot, rather than needing a separate sweep job.

## Doctor leave conflict handling

When an admin calls `POST /admin/doctors/:id/leave`, the handler doesn't just insert the leave record — it queries for every `CONFIRMED` appointment that doctor has on that date and, inside the same request, cancels each one, deletes their Google Calendar events, and queues a `LEAVE_CONFLICT` email to the patient explaining what happened and inviting them to rebook. The leave date itself is enforced going forward too: `getAvailableSlots` checks `DoctorLeave` before generating any slots for that day, so no one can book into a day the doctor has already blocked off. The `(doctorId, date)` unique constraint on `DoctorLeave` also stops an admin from accidentally logging the same leave day twice.

This was deliberately built as "cancel and notify" rather than "auto-reschedule," because silently moving a patient's appointment to a different time without their input is a worse experience than asking them to pick a new slot themselves — especially for a symptom-based booking where the original time may have been chosen around their availability.

## Slot hold mechanism

Slot generation (`generateSlotsForDate`) is stateless — it just expands a doctor's `workingHours` JSON into a list of start times for a given day, then the caller subtracts out anything already `CONFIRMED` or `HELD`-and-not-expired. Because holds are stored in the same `Appointment` table as real bookings (just with a different status and an expiry timestamp), the availability query and the booking-conflict logic share exactly one source of truth — there's no separate cache or lock table that can drift out of sync with the real bookings. The tradeoff is a slightly wider table with a nullable `holdExpiresAt` column, which is a small price for not having two systems that need to agree.

## Notification failure handling

Every outbound email — confirmations, reminders, cancellations, leave conflicts — is written to a `Notification` row before the send is attempted, with `status: PENDING`. If `transporter.sendMail` throws, the row moves to `FAILED` with the error message and an incrementing `attempts` counter, but the request that triggered it (a booking, a completed visit, a leave entry) still succeeds — email delivery is never allowed to block or roll back a core business action. A cron job (`reminderJob`, every 5 minutes) sweeps `FAILED` notifications under `attempts < 5` and retries them, and separately checks for medication reminders whose `scheduledFor` time has passed. This gives eventual delivery without a full message queue: acceptable at clinic scale, though a production system would likely swap the polling loop for a proper queue (SQS/BullMQ) once volume justifies it.

LLM calls follow the same "never block the core action" principle but fail differently: `llmService` catches any API error or malformed JSON response and returns a fallback object instead of throwing — a `Medium`-urgency flag with a note asking the doctor to read the raw symptoms themselves for pre-visit summaries, or the raw clinical notes verbatim for post-visit summaries. The appointment is confirmed, or the visit is marked complete, either way; the LLM is an enhancement layer, not a dependency the booking flow can be brought down by.
