import type { Database } from '../db/connection';

export abstract class BaseRepository {
  constructor(protected readonly db: Database) {}
}
