// Realism guardrail for car-photo edits (platform-independent).
//
// Enforces "only generate what's possible, not unrealistic AI images" by
// (1) offering a menu of real mods and (2) screening free-text for impossible
// asks, then building an image-to-image prompt that preserves the real car.

export const PRESETS = {
  paint: [
    'Gloss black', 'Matte black', 'Pearl white', 'Gunmetal grey',
    'Nardo grey', 'Racing red', 'Deep blue', 'British racing green',
    'Satin/matte finish of current color',
  ],
  wheels: [
    'Black alloy wheels', 'Silver multi-spoke alloys', 'Bronze alloys',
    'Chrome wheels', 'Larger diameter wheels (within realistic fitment)',
  ],
  windows: ['Lightly tinted windows', 'Medium tinted windows', 'Limo (dark) tint'],
  stance: ['Lowered (sport springs)', 'Mild lift (light off-road)', 'Stock ride height'],
  body: [
    'OEM-style front lip', 'Subtle side skirts', 'Factory-style rear spoiler',
    'Roof rails / cross bars', 'Mud flaps', 'Clear headlight restoration',
  ],
};

const UNREAL_TERMS = [
  'flying', 'fly', 'wings', 'jet engine', 'rocket', 'hover', 'hovering',
  'floating', 'transformer', 'robot', 'dragon', 'monster truck wheels on a sedan',
  'glowing', 'neon glow', 'rainbow', 'cartoon', 'anime', 'fantasy', 'sci-fi',
  'spaceship', 'invisible', 'gold plated entire', 'diamond encrusted',
  'giant spoiler', 'huge wing', 'underwater', 'on the moon', 'flames shooting',
];

export function checkRealism(text) {
  const t = (text || '').toLowerCase().trim();
  if (!t) return { ok: true, reason: null };
  const hit = UNREAL_TERMS.find((term) => t.includes(term));
  if (hit) {
    return {
      ok: false,
      reason: `"${hit}" reads as an unrealistic edit. This tool sticks to changes a real shop could actually do (paint, wheels, tint, ride height, real body parts).`,
    };
  }
  return { ok: true, reason: null };
}

export function buildEditPrompt({ vehicle, presets = [], freeText = '' }) {
  const car = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(' ');
  const changes = [...presets];
  if (freeText && freeText.trim()) changes.push(freeText.trim());
  return [
    `Photo edit of the user's actual ${car || 'car'}.`,
    `Keep the exact same car, angle, background, lighting, and license plate.`,
    `Apply ONLY these realistic modifications: ${changes.join('; ') || '(none specified)'}.`,
    `The result must look like a real, unretouched photograph — correct proportions,`,
    `factory-plausible fitment, no fantasy elements. Do not invent a different car.`,
  ].join(' ');
}
