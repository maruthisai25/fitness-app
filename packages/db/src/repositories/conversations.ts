import type { Conversation, Id, Message, MessageRole, TokenUsage } from '@vigor/core';
import { asc, desc, eq } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { conversations as conversationsTable, messages as messagesTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type ConversationFields = Omit<Conversation, 'id' | 'createdAt'>;

export type MessageFields = Omit<Message, 'id' | 'conversationId' | 'createdAt'>;

/** One turn to append. `content` is the Anthropic content-block array. */
export type MessageDraft = {
  role: MessageRole;
  content: readonly unknown[];
  model?: string | null;
  usage?: TokenUsage | null;
  /** Pass the assistant message id so a retried write stays idempotent. */
  id?: Id;
};

export interface ConversationRepository {
  /** Most recent activity first. */
  list(options?: { includeArchived?: boolean; limit?: number }): Promise<Conversation[]>;
  get(id: Id): Promise<Conversation | null>;
  /** The conversation the floating coach button should reopen. */
  latest(): Promise<Conversation | null>;
  create(draft?: { title?: string }): Promise<Conversation>;
  update(id: Id, patch: Partial<ConversationFields>): Promise<Conversation>;
  rename(id: Id, title: string): Promise<Conversation>;
  setArchived(id: Id, archived: boolean): Promise<Conversation>;
  remove(id: Id): Promise<void>;

  /** Oldest first — chat render order. */
  listMessages(conversationId: Id, options?: { limit?: number }): Promise<Message[]>;
  getMessage(id: Id): Promise<Message | null>;
  /** Writes the turn and bumps the conversation's `lastMessageAt`. */
  appendMessage(conversationId: Id, draft: MessageDraft): Promise<Message>;
  removeMessage(id: Id): Promise<void>;
}

export function createConversationRepository(db: VigorDb): ConversationRepository {
  async function get(id: Id): Promise<Conversation | null> {
    const rows = await db.orm
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<ConversationFields>): Promise<Conversation> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'conversations', id);
    }
    const [row] = await db.orm
      .update(conversationsTable)
      .set(fields)
      .where(eq(conversationsTable.id, id))
      .returning();
    return requireRow(row as Conversation | undefined, 'conversations', id);
  }

  return {
    async list(
      options: { includeArchived?: boolean; limit?: number } = {},
    ): Promise<Conversation[]> {
      const base = db.orm.select().from(conversationsTable);
      const filtered = options.includeArchived
        ? base
        : base.where(eq(conversationsTable.archived, false));
      const query = filtered.orderBy(desc(conversationsTable.lastMessageAt));
      return options.limit !== undefined ? query.limit(options.limit) : query;
    },
    get,
    async latest(): Promise<Conversation | null> {
      const rows = await db.orm
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.archived, false))
        .orderBy(desc(conversationsTable.lastMessageAt))
        .limit(1);
      return firstOrNull(rows);
    },
    async create(draft: { title?: string } = {}): Promise<Conversation> {
      const timestamp = db.now();
      const row: Conversation = {
        id: db.newId(),
        title: draft.title ?? 'New conversation',
        createdAt: timestamp,
        lastMessageAt: timestamp,
        archived: false,
      };
      const [inserted] = await db.orm.insert(conversationsTable).values(row).returning();
      return inserted as Conversation;
    },
    update,
    rename: (id, title) => update(id, { title }),
    setArchived: (id, archived) => update(id, { archived }),
    async remove(id: Id): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.orm.delete(messagesTable).where(eq(messagesTable.conversationId, id));
        await tx.orm.delete(conversationsTable).where(eq(conversationsTable.id, id));
      });
    },

    async listMessages(conversationId: Id, options: { limit?: number } = {}): Promise<Message[]> {
      if (options.limit === undefined) {
        return db.orm
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conversationId))
          .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id));
      }
      // A limit means "the most recent N turns", but the caller still renders
      // oldest-first, so take from the end and flip back.
      const newest = await db.orm
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
        .limit(options.limit);
      return newest.reverse();
    },
    async getMessage(id: Id): Promise<Message | null> {
      const rows = await db.orm
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.id, id))
        .limit(1);
      return firstOrNull(rows);
    },
    async appendMessage(conversationId: Id, draft: MessageDraft): Promise<Message> {
      const createdAt = db.now();
      const row: Message = {
        id: draft.id ?? db.newId(),
        conversationId,
        role: draft.role,
        content: [...draft.content],
        model: draft.model ?? null,
        usage: draft.usage ?? null,
        createdAt,
      };
      return db.transaction(async (tx) => {
        await tx.orm.insert(messagesTable).values(row);
        await tx.orm
          .update(conversationsTable)
          .set({ lastMessageAt: createdAt })
          .where(eq(conversationsTable.id, conversationId));
        return row;
      });
    },
    async removeMessage(id: Id): Promise<void> {
      await db.orm.delete(messagesTable).where(eq(messagesTable.id, id));
    },
  };
}
