/**
 * Event Service — encapsulates business logic for contract event listing and retrieval.
 */

import { EventRepository, eventRepository } from '../repositories/event.repository';
import {
  decodeStableCursor,
  encodeStableCursor,
  InvalidCursorError,
  type CursorPage,
} from '../utils/stable-cursor';

export interface EventListFilter {
  contract?: string;
  type?: string;
  topic?: string;
  page?: number;
  limit?: number;
  /** #914 — keyset cursor (event id) for cursor-based pagination. */
  cursor?: string;
  pagination?: 'cursor';
}

export interface EventListResult {
  data: any[];
  total: number;
  page: number;
  limit: number;
  /** #914 — pass back as `cursor` to fetch the next page without OFFSET. */
  nextCursor: string | null;
}

export type StableCursorEvents = CursorPage<any>;

export class EventService {
  constructor(private readonly repo: EventRepository = eventRepository) {}

  buildFilterWhere(query: EventListFilter): Record<string, any> {
    return {
      ...(query.contract && { contractAddress: query.contract }),
      ...(query.type && { eventType: query.type }),
      ...(query.topic && { topicSymbol: query.topic }),
    };
  }

  async listEvents(query: EventListFilter): Promise<EventListResult | StableCursorEvents> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildFilterWhere(query);

    if (query.pagination === 'cursor') {
      const after =
        typeof query.cursor === 'string' ? decodeStableCursor(query.cursor, 'events') : undefined;
      const rows = await this.repo.findManySummary({
        where,
        take: limit + 1,
        after,
      });
      const hasNext = rows.length > limit;
      const data = hasNext ? rows.slice(0, limit) : rows;
      const lastEvent = data[data.length - 1];
      const nextCursor =
        hasNext && lastEvent
          ? encodeStableCursor('events', {
              ledgerSequence: lastEvent.ledgerSequence,
              id: lastEvent.id,
            })
          : null;
      return { data, nextCursor, hasNext };
    }

    if (query.cursor?.startsWith('c1_')) {
      throw new InvalidCursorError();
    }

    // #914 — cursor pagination (keyset on id, via composite index) avoids the
    // OFFSET rescan cost of deep pages. `page`/`limit` remains the compatibility
    // shim for existing callers that haven't migrated to `cursor` yet.
    if (query.cursor) {
      const [events, total] = await Promise.all([
        this.repo.findManySummary({ where, cursorId: query.cursor, take: limit }),
        this.repo.count(where),
      ]);
      const nextCursor = events.length === limit ? events[events.length - 1].id : null;
      return { data: events, total, page, limit, nextCursor };
    }

    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.repo.findManySummary({ where, skip, take: limit }),
      this.repo.count(where),
    ]);
    const nextCursor = events.length === limit ? events[events.length - 1].id : null;

    return { data: events, total, page, limit, nextCursor };
  }

  async getEventById(id: string): Promise<any | null> {
    return this.repo.findById(id);
  }
}

export const eventService = new EventService();
