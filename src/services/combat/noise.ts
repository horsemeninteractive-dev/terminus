import { CombatVisualFx, NoiseEvent } from '../../types/combat';

// ==========================================
// 5. Sound & Acoustic Proximity System (§5, §6.1)
// ==========================================

export function emitNoiseEvent(
  type: NoiseEvent['type'],
  x: number,
  z: number,
  label?: string
): { event: NoiseEvent; visualFx: CombatVisualFx } {
  let radius = 40; // Default meters

  switch (type) {
    case 'gunfire':
      radius = 95;
      break;
    case 'brute_slam':
      radius = 65;
      break;
    case 'breach':
      radius = 50;
      break;
    case 'construction':
    case 'repair':
      radius = 42;
      break;
    case 'combat':
      radius = 35;
      break;
    case 'engine':
      radius = 55;
      break;
  }

  const id = `noise-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();

  const event: NoiseEvent = {
    id,
    type,
    x,
    z,
    radius,
    label: label || type.toUpperCase(),
    createdAt: now,
    durationMs: 2500,
  };

  const visualFx: CombatVisualFx = {
    id: `ring-${id}`,
    type: 'noise_ring',
    startX: x,
    startY: 0.3,
    startZ: z,
    radius,
    color: type === 'gunfire' ? '#ef4444' : type === 'brute_slam' ? '#a855f7' : '#38bdf8',
    createdAt: now,
    durationMs: 2000,
  };

  return { event, visualFx };
}

