/**
 * Render-lag position smoothing for everything that moves on the map.
 *
 * Game state (squads, zombies, workers, vehicles, hostile humans) advances on a
 * fixed ~100ms simulation tick, and the old code snapped each 3D mesh straight
 * to the latest state position — so at 4x game speed a unit visibly teleported
 * between waypoints every tick. This helper stores the previous state position
 * and the newest one, then the per-frame render loop interpolates between them
 * over the tick interval. The mesh always renders exactly one tick behind the
 * simulation, which reads as perfectly fluid motion with no snapping.
 */

const DEFAULT_TICK_MS = 100;

/** Shortest signed angular difference between two angles (radians). */
function shortestAngle(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export class PositionSmoother {
  private hasState = false;
  private prevX = 0;
  private prevZ = 0;
  private targetX = 0;
  private targetZ = 0;
  private prevRot = 0;
  private targetRot = 0;
  private hasRotation = false;
  private updatedAt = 0;

  /**
   * Interpolation window in ms. Entities that tick slower than the default
   * 100ms (e.g. workers at 500ms) need a wider window so their meshes glide
   * continuously across the full interval instead of snapping-and-holding.
   */
  private tickWindowMs = DEFAULT_TICK_MS;
  // Keep a short render buffer behind the most recent simulation sample. This
  // avoids reaching the target early and then visibly holding until the next
  // tick when browser scheduling jitters by a few milliseconds.
  private renderDelayMs = 8;

  /** Set the interpolation window length in milliseconds. */
  setTickWindow(ms: number) {
    this.tickWindowMs = Math.max(1, ms);
  }

  /**
   * Record a new simulation position. The previous target becomes the new
   * interpolation origin, so the rendered position glides from where the
   * entity was heading toward where it is now.
   */
  setTarget(x: number, z: number, now = performance.now(), rotation?: number) {
    if (this.hasState) {
      this.prevX = this.targetX;
      this.prevZ = this.targetZ;
      if (this.hasRotation && rotation !== undefined) {
        this.prevRot = this.targetRot;
      }
    } else {
      this.prevX = x;
      this.prevZ = z;
      this.hasState = true;
      this.hasRotation = rotation !== undefined;
      if (rotation !== undefined) this.prevRot = rotation;
    }
    this.targetX = x;
    this.targetZ = z;
    if (rotation !== undefined) {
      this.targetRot = rotation;
      this.hasRotation = true;
    }
    this.updatedAt = now;
  }

  /** Teleport directly (first appearance or spawn). */
  snap(x: number, z: number, rotation?: number) {
    this.hasState = true;
    this.prevX = this.targetX = x;
    this.prevZ = this.targetZ = z;
    this.updatedAt = performance.now();
    if (rotation !== undefined) {
      this.prevRot = this.targetRot = rotation;
      this.hasRotation = true;
    }
  }

  /**
   * Freeze instantly at the latest simulation position (no interpolation tail).
   * Called the frame pause takes effect so a unit ordered to move can't keep
   * sliding toward its destination while the game is paused. On unpause, normal
   * setTarget() calls resume smooth interpolation naturally.
   */
  freezeAtTarget() {
    if (!this.hasState) return;
    this.prevX = this.targetX;
    this.prevZ = this.targetZ;
    this.updatedAt = performance.now();
  }

  /** Latest simulation position (used to park meshes exactly on pause). */
  targetPosition(): { x: number; z: number } {
    return { x: this.targetX, z: this.targetZ };
  }

  /** Latest simulation rotation, or null when unused. */
  targetRotation(): number | null {
    return this.hasRotation ? this.targetRot : null;
  }

  /**
   * Sample the interpolated world position for this frame.
   * `rot` is null when the entity has no meaningful rotation (or hasn't turned).
   */
  sample(now = performance.now()): {
    x: number;
    z: number;
    t: number;
    rot: number | null;
  } {
    const elapsed = now - this.updatedAt + this.renderDelayMs;
    const t = Math.min(1, Math.max(0, elapsed / this.tickWindowMs));
    return {
      x: this.prevX + (this.targetX - this.prevX) * t,
      z: this.prevZ + (this.targetZ - this.prevZ) * t,
      t,
      rot:
        this.hasRotation && this.targetRot !== this.prevRot
          ? this.prevRot + shortestAngle(this.prevRot, this.targetRot) * t
          : this.hasRotation
          ? this.targetRot
          : null,
    };
  }
}
