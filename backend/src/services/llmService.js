// Wraps calls to the Anthropic Messages API. Every function here is designed
// to fail soft: if the LLM call errors out or returns something we can't
// parse, we return a fallback object instead of throwing, so a flaky model
// response never blocks a booking or a doctor closing out a visit.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

async function callClaude(prompt, { maxTokens = 500 } = {}) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const textBlock = data.content.find((c) => c.type === 'text');
  return textBlock ? textBlock.text : '';
}

function safeParseJson(raw) {
  // Models sometimes wrap JSON in prose or code fences despite instructions -
  // strip fences and grab the first {...} block before parsing.
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

/**
 * Turns the patient's free-text symptom description into a structured
 * pre-visit summary the doctor sees before the appointment.
 */
async function generatePreVisitSummary(symptomsText) {
  const prompt = `Analyse these symptoms and return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{"urgency": "Low" | "Medium" | "High", "chiefComplaint": string, "suggestedQuestions": [string, string, string]}

Symptoms: ${symptomsText}`;

  try {
    const raw = await callClaude(prompt, { maxTokens: 400 });
    const parsed = safeParseJson(raw);

    if (!parsed.urgency || !parsed.chiefComplaint || !Array.isArray(parsed.suggestedQuestions)) {
      throw new Error('Malformed LLM response shape');
    }

    return { ok: true, data: parsed };
  } catch (err) {
    console.error('generatePreVisitSummary failed:', err.message);
    // Fallback: flag for manual doctor review rather than blocking the booking.
    return {
      ok: false,
      data: {
        urgency: 'Medium',
        chiefComplaint: symptomsText.slice(0, 200),
        suggestedQuestions: [],
        note: 'Automatic summary unavailable - doctor should review raw symptoms below.',
      },
    };
  }
}

/**
 * Converts the doctor's clinical shorthand notes into a plain-language
 * summary with a medication schedule, for the patient to read after the visit.
 */
async function generatePostVisitSummary(clinicalNotes, prescription) {
  const prescriptionText = (prescription || [])
    .map((p) => `${p.drug} ${p.dose}, ${p.frequencyPerDay}x/day for ${p.durationDays} days`)
    .join('; ');

  const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps. Write in plain language a non-medical person can understand. Keep it under 200 words.

Clinical notes: ${clinicalNotes}
Prescription: ${prescriptionText || 'none'}`;

  try {
    const summary = await callClaude(prompt, { maxTokens: 500 });
    return { ok: true, data: summary.trim() };
  } catch (err) {
    console.error('generatePostVisitSummary failed:', err.message);
    return {
      ok: false,
      data: `Your doctor's notes: ${clinicalNotes}\n\nMedications: ${prescriptionText || 'None prescribed.'}\n\n(We couldn't generate a simplified version right now - please contact the clinic if anything above is unclear.)`,
    };
  }
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
