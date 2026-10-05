import type { GardenRepository } from '../ports/garden-repository.port';
import type { GardenSnapshot } from '../core/models';
import { sampleSnapshot } from '../core/garden-engine';
import { normalizeSnapshot } from '../core/tag-engine';
const KEY = 'c2c-002-emotion-garden';
export class LocalGardenRepository implements GardenRepository {
  load(): GardenSnapshot { try { const value = localStorage.getItem(KEY); if (value) return normalizeSnapshot(JSON.parse(value)); } catch { /* use seed */ } return sampleSnapshot(); }
  save(snapshot: GardenSnapshot) { localStorage.setItem(KEY, JSON.stringify(snapshot)); }
}
