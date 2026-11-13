import pg from 'pg';
import type { Logger } from '../lib/logger.js';

const { Pool } = pg;

export interface Ticket {
  readonly id: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly ownerId: string;
  readonly claimedBy: string | null;
  readonly status: 'open' | 'claimed' | 'closed';
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
}

export class Database {
  private readonly pool: pg.Pool;
  private readonly log: Logger;

  constructor(connectionString: string, log: Logger) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.log = log;

    this.pool.on('error', (err) => {
      this.log.error('database-pool-error', { error: err });
    });
  }

  /** Run initial schema migrations idempotently. */
  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          claimed_by TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          close_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          closed_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_tickets_guild_status 
          ON tickets (guild_id, status);

        CREATE INDEX IF NOT EXISTS idx_tickets_channel 
          ON tickets (channel_id);
      `);
      this.log.info('database-initialized');
    } finally {
      client.release();
    }
  }

  async createTicket(ticket: {
    id: string;
    guildId: string;
    channelId: string;
    ownerId: string;
  }): Promise<Ticket> {
    const res = await this.pool.query(
      `INSERT INTO tickets (id, guild_id, channel_id, owner_id, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *;`,
      [ticket.id, ticket.guildId, ticket.channelId, ticket.ownerId],
    );
    return this.mapRow(res.rows[0]);
  }

  async claimTicket(id: string, claimedBy: string): Promise<Ticket | null> {
    const res = await this.pool.query(
      `UPDATE tickets
       SET status = 'claimed', claimed_by = $2
       WHERE id = $1 AND status = 'open'
       RETURNING *;`,
      [id, claimedBy],
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async closeTicket(id: string, reason: string): Promise<Ticket | null> {
    const res = await this.pool.query(
      `UPDATE tickets
       SET status = 'closed', close_reason = $2, closed_at = NOW()
       WHERE id = $1 AND status != 'closed'
       RETURNING *;`,
      [id, reason],
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const res = await this.pool.query(
      `SELECT * FROM tickets WHERE id = $1 LIMIT 1;`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.log.info('database-pool-closed');
  }

  private mapRow(row: any): Ticket {
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      ownerId: row.owner_id,
      claimedBy: row.claimed_by,
      status: row.status,
      closeReason: row.close_reason,
      createdAt: new Date(row.created_at),
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
    };
  }
}
