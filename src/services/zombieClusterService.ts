import type { ZombieUnit } from '../types/combat';

export interface ZombieCluster {
  /** Stable key: the id of the cluster's first (westernmost-scan) member. */
  key: string;
  x: number;
  z: number;
  size: number;
  damageRatio: number; // 0..1 mean health of the cluster
  /** Every living member's unit — the info panel renders a health meter each. */
  members: ZombieUnit[];
}

/**
 * Buckets living zombies into spatial clusters (26 m radius, mean-position
 * merge). Shared by the 3D marker layer (WorldScene) and the HUD info panel
 * so a clicked cluster badge resolves to exactly the same member set.
 */
export function clusterZombies(zombies: ZombieUnit[]): ZombieCluster[] {
  const alive = zombies.filter((z) => z.state !== 'dead' && z.currentHp > 0);
  if (alive.length === 0) return [];

  const CLUSTER_RADIUS = 26;
  const clusters: { key: string; members: ZombieUnit[]; sumX: number; sumZ: number }[] = [];

  for (const z of alive) {
    let target = clusters.find(
      (c) => Math.hypot(c.sumX / c.members.length - z.x, c.sumZ / c.members.length - z.z) <= CLUSTER_RADIUS
    );
    if (!target) {
      target = { key: z.id, members: [], sumX: 0, sumZ: 0 };
      clusters.push(target);
    }
    target.members.push(z);
    target.sumX += z.x;
    target.sumZ += z.z;
  }

  return clusters.map((c) => {
    const totalHp = c.members.reduce((s, z) => s + z.currentHp, 0);
    const totalMaxHp = c.members.reduce((s, z) => s + z.maxHp, 0);
    return {
      key: c.key,
      x: c.sumX / c.members.length,
      z: c.sumZ / c.members.length,
      size: c.members.length,
      damageRatio: totalMaxHp > 0 ? Math.max(0, Math.min(1, totalHp / totalMaxHp)) : 1,
      members: c.members,
    };
  });
}

/** Finds the cluster containing a specific zombie (by unit id), if any. */
export function findClusterContaining(zombies: ZombieUnit[], zombieId: string): ZombieCluster | null {
  return clusterZombies(zombies).find((c) => c.members.some((m) => m.id === zombieId)) || null;
}
