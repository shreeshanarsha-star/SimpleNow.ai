// IPIP Big-Five Factor Markers — 50-item version (Goldberg, 1992).
// Public domain, no licensing required. Item wording is reproduced EXACTLY as
// published at https://ipip.ori.org/newBigFive5broadKey.htm — do not reword any
// item: paraphrasing invalidates the instrument's published psychometrics.
//
// Items are administered with the standard IPIP stem ("Describe yourself as you
// generally are now, not as you wish to be in the future.") on a 1-5 scale of
// accuracy, which is why each item reads as a sentence fragment.
//
// This is a TRAIT PROFILE, not an evaluative instrument. It is never
// auto-assigned by role level and never scored with hiring bands.

export const BIG_FIVE_DIMENSIONS = [
  { key: 'extraversion', label: 'Extraversion' },
  { key: 'agreeableness', label: 'Agreeableness' },
  { key: 'conscientiousness', label: 'Conscientiousness' },
  { key: 'emotional_stability', label: 'Emotional Stability' },
  { key: 'intellect', label: 'Intellect / Imagination' },
];

export const BIG_FIVE_SCALE = [
  { value: 1, label: 'Very Inaccurate' },
  { value: 2, label: 'Moderately Inaccurate' },
  { value: 3, label: 'Neither Accurate nor Inaccurate' },
  { value: 4, label: 'Moderately Accurate' },
  { value: 5, label: 'Very Accurate' },
];

export const BIG_FIVE_STEM =
  'Describe yourself as you generally are now, not as you wish to be in the future. Describe yourself as you honestly see yourself, in relation to other people you know of the same sex as you are, and roughly your same age.';

export const BIG_FIVE_QUESTIONS = [
  // ---- Factor I (Surgency or Extraversion) ----
  { id: 'bf1', dimension: 'extraversion', text: 'Am the life of the party.', reverse: false },
  { id: 'bf2', dimension: 'extraversion', text: 'Feel comfortable around people.', reverse: false },
  { id: 'bf3', dimension: 'extraversion', text: 'Start conversations.', reverse: false },
  { id: 'bf4', dimension: 'extraversion', text: 'Talk to a lot of different people at parties.', reverse: false },
  { id: 'bf5', dimension: 'extraversion', text: "Don't mind being the center of attention.", reverse: false },
  { id: 'bf6', dimension: 'extraversion', text: "Don't talk a lot.", reverse: true },
  { id: 'bf7', dimension: 'extraversion', text: 'Keep in the background.', reverse: true },
  { id: 'bf8', dimension: 'extraversion', text: 'Have little to say.', reverse: true },
  { id: 'bf9', dimension: 'extraversion', text: "Don't like to draw attention to myself.", reverse: true },
  { id: 'bf10', dimension: 'extraversion', text: 'Am quiet around strangers.', reverse: true },

  // ---- Factor II (Agreeableness) ----
  { id: 'bf11', dimension: 'agreeableness', text: 'Am interested in people.', reverse: false },
  { id: 'bf12', dimension: 'agreeableness', text: "Sympathize with others' feelings.", reverse: false },
  { id: 'bf13', dimension: 'agreeableness', text: 'Have a soft heart.', reverse: false },
  { id: 'bf14', dimension: 'agreeableness', text: 'Take time out for others.', reverse: false },
  { id: 'bf15', dimension: 'agreeableness', text: "Feel others' emotions.", reverse: false },
  { id: 'bf16', dimension: 'agreeableness', text: 'Make people feel at ease.', reverse: false },
  { id: 'bf17', dimension: 'agreeableness', text: 'Am not really interested in others.', reverse: true },
  { id: 'bf18', dimension: 'agreeableness', text: 'Insult people.', reverse: true },
  { id: 'bf19', dimension: 'agreeableness', text: "Am not interested in other people's problems.", reverse: true },
  { id: 'bf20', dimension: 'agreeableness', text: 'Feel little concern for others.', reverse: true },

  // ---- Factor III (Conscientiousness) ----
  { id: 'bf21', dimension: 'conscientiousness', text: 'Am always prepared.', reverse: false },
  { id: 'bf22', dimension: 'conscientiousness', text: 'Pay attention to details.', reverse: false },
  { id: 'bf23', dimension: 'conscientiousness', text: 'Get chores done right away.', reverse: false },
  { id: 'bf24', dimension: 'conscientiousness', text: 'Like order.', reverse: false },
  { id: 'bf25', dimension: 'conscientiousness', text: 'Follow a schedule.', reverse: false },
  { id: 'bf26', dimension: 'conscientiousness', text: 'Am exacting in my work.', reverse: false },
  { id: 'bf27', dimension: 'conscientiousness', text: 'Leave my belongings around.', reverse: true },
  { id: 'bf28', dimension: 'conscientiousness', text: 'Make a mess of things.', reverse: true },
  { id: 'bf29', dimension: 'conscientiousness', text: 'Often forget to put things back in their proper place.', reverse: true },
  { id: 'bf30', dimension: 'conscientiousness', text: 'Shirk my duties.', reverse: true },

  // ---- Factor IV (Emotional Stability) ----
  { id: 'bf31', dimension: 'emotional_stability', text: 'Am relaxed most of the time.', reverse: false },
  { id: 'bf32', dimension: 'emotional_stability', text: 'Seldom feel blue.', reverse: false },
  { id: 'bf33', dimension: 'emotional_stability', text: 'Get stressed out easily.', reverse: true },
  { id: 'bf34', dimension: 'emotional_stability', text: 'Worry about things.', reverse: true },
  { id: 'bf35', dimension: 'emotional_stability', text: 'Am easily disturbed.', reverse: true },
  { id: 'bf36', dimension: 'emotional_stability', text: 'Get upset easily.', reverse: true },
  { id: 'bf37', dimension: 'emotional_stability', text: 'Change my mood a lot.', reverse: true },
  { id: 'bf38', dimension: 'emotional_stability', text: 'Have frequent mood swings.', reverse: true },
  { id: 'bf39', dimension: 'emotional_stability', text: 'Get irritated easily.', reverse: true },
  { id: 'bf40', dimension: 'emotional_stability', text: 'Often feel blue.', reverse: true },

  // ---- Factor V (Intellect or Imagination) ----
  { id: 'bf41', dimension: 'intellect', text: 'Have a rich vocabulary.', reverse: false },
  { id: 'bf42', dimension: 'intellect', text: 'Have a vivid imagination.', reverse: false },
  { id: 'bf43', dimension: 'intellect', text: 'Have excellent ideas.', reverse: false },
  { id: 'bf44', dimension: 'intellect', text: 'Am quick to understand things.', reverse: false },
  { id: 'bf45', dimension: 'intellect', text: 'Use difficult words.', reverse: false },
  { id: 'bf46', dimension: 'intellect', text: 'Spend time reflecting on things.', reverse: false },
  { id: 'bf47', dimension: 'intellect', text: 'Am full of ideas.', reverse: false },
  { id: 'bf48', dimension: 'intellect', text: 'Have difficulty understanding abstract ideas.', reverse: true },
  { id: 'bf49', dimension: 'intellect', text: 'Am not interested in abstract ideas.', reverse: true },
  { id: 'bf50', dimension: 'intellect', text: 'Do not have a good imagination.', reverse: true },
];


export type BigFiveAnswers = Record<string, number>;
export type BigFiveScores = Record<string, number>;

// Reverse-scored items: 6 - raw. Sum per dimension (10 items x 1-5 each ->
// range 10-50), no normalization -- matches the standard IPIP scoring
// convention so scores are comparable to any published norm table.
export function scoreBigFive(answers: BigFiveAnswers): BigFiveScores {
  const totals: Record<string, number> = {};
  for (const dim of BIG_FIVE_DIMENSIONS) totals[dim.key] = 0;
  for (const q of BIG_FIVE_QUESTIONS) {
    const raw = answers[q.id];
    if (typeof raw !== "number" || raw < 1 || raw > 5) continue;
    const value = q.reverse ? 6 - raw : raw;
    totals[q.dimension] = (totals[q.dimension] || 0) + value;
  }
  return totals;
}
