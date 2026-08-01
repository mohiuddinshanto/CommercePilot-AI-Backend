import { Db, ObjectId, Filter, ClientSession } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import {
  SocialConnectionDocument,
  InboxConversationDocument,
  InboxMessageDocument,
} from "./inbox.types.js";

export class InboxRepository {
  constructor(private db: Db) {}

  // ── connections ──

  async createConnection(data: Omit<SocialConnectionDocument, "_id">, session?: ClientSession): Promise<SocialConnectionDocument> {
    const result = await this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .insertOne(data as SocialConnectionDocument, { session });
    return { ...data, _id: result.insertedId } as SocialConnectionDocument;
  }

  async findConnectionsByStoreId(storeId: string): Promise<SocialConnectionDocument[]> {
    return this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .find({ storeId, isDeleted: false })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findConnectionById(connectionId: string, storeId: string): Promise<SocialConnectionDocument | null> {
    return this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .findOne({ _id: new ObjectId(connectionId), storeId, isDeleted: false });
  }

  async findConnectionByPageId(storeId: string, pageId: string): Promise<SocialConnectionDocument | null> {
    return this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .findOne({ storeId, pageId, isDeleted: false });
  }

  async findConnectionByPageIdAnyStore(pageId: string): Promise<SocialConnectionDocument | null> {
    return this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .findOne({ pageId, isDeleted: false, active: true });
  }

  async updateConnection(
    connectionId: string,
    storeId: string,
    update: Partial<Omit<SocialConnectionDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<SocialConnectionDocument | null> {
    await this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .updateOne(
        { _id: new ObjectId(connectionId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    return this.findConnectionById(connectionId, storeId);
  }

  async softDeleteConnection(connectionId: string, storeId: string, deletedBy: string): Promise<void> {
    await this.db
      .collection<SocialConnectionDocument>(COLLECTIONS.SOCIAL_CONNECTIONS)
      .updateOne(
        { _id: new ObjectId(connectionId), storeId, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy, updatedAt: new Date().toISOString() } }
      );
  }

  // ── conversations ──

  async findConversationByParticipant(storeId: string, connectionId: ObjectId, participantId: string): Promise<InboxConversationDocument | null> {
    return this.db
      .collection<InboxConversationDocument>(COLLECTIONS.INBOX_CONVERSATIONS)
      .findOne({ storeId, connectionId, participantId, isDeleted: false });
  }

  async createConversation(data: Omit<InboxConversationDocument, "_id">): Promise<InboxConversationDocument> {
    const result = await this.db
      .collection<InboxConversationDocument>(COLLECTIONS.INBOX_CONVERSATIONS)
      .insertOne(data as InboxConversationDocument);
    return { ...data, _id: result.insertedId } as InboxConversationDocument;
  }

  async updateConversation(
    conversationId: ObjectId,
    storeId: string,
    update: Record<string, unknown>
  ): Promise<InboxConversationDocument | null> {
    await this.db
      .collection<InboxConversationDocument>(COLLECTIONS.INBOX_CONVERSATIONS)
      .updateOne(
        { _id: conversationId, storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    return this.db
      .collection<InboxConversationDocument>(COLLECTIONS.INBOX_CONVERSATIONS)
      .findOne({ _id: conversationId, storeId, isDeleted: false });
  }

  async findConversationsByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      connectionId?: string;
      status?: string;
      search?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: InboxConversationDocument[]; total: number }> {
    const filter: Filter<InboxConversationDocument> = { storeId, isDeleted: false };

    if (options?.connectionId) filter.connectionId = new ObjectId(options.connectionId);
    if (options?.status) filter.status = options.status;
    if (options?.search) {
      filter.$or = [
        { participantName: { $regex: options.search, $options: "i" } },
        { participantId: { $regex: options.search, $options: "i" } },
      ];
    }

    const collection = this.db.collection<InboxConversationDocument>(COLLECTIONS.INBOX_CONVERSATIONS);
    const total = await collection.countDocuments(filter);

    let cursor = collection.find(filter);
    cursor = cursor.sort(options?.sort || { lastMessageAt: -1 });

    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);

    const items = await cursor.toArray();
    return { items, total };
  }

  async findConversationById(conversationId: string, storeId: string): Promise<InboxConversationDocument | null> {
    return this.db
      .collection<InboxConversationDocument>(COLLECTIONS.INBOX_CONVERSATIONS)
      .findOne({ _id: new ObjectId(conversationId), storeId, isDeleted: false });
  }

  // ── messages ──

  async createMessage(data: Omit<InboxMessageDocument, "_id">): Promise<InboxMessageDocument> {
    const result = await this.db
      .collection<InboxMessageDocument>(COLLECTIONS.INBOX_MESSAGES)
      .insertOne(data as InboxMessageDocument);
    return { ...data, _id: result.insertedId } as InboxMessageDocument;
  }

  async findMessagesByConversation(
    storeId: string,
    conversationId: ObjectId,
    options?: { skip?: number; limit?: number }
  ): Promise<{ items: InboxMessageDocument[]; total: number }> {
    const filter: Filter<InboxMessageDocument> = { storeId, conversationId };
    const collection = this.db.collection<InboxMessageDocument>(COLLECTIONS.INBOX_MESSAGES);
    const total = await collection.countDocuments(filter);

    let cursor = collection.find(filter).sort({ createdAt: 1 });
    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);

    const items = await cursor.toArray();
    return { items, total };
  }

  async findRecentMessagesByConversation(
    storeId: string,
    conversationId: ObjectId,
    limit: number
  ): Promise<InboxMessageDocument[]> {
    const items = await this.db
      .collection<InboxMessageDocument>(COLLECTIONS.INBOX_MESSAGES)
      .find({ storeId, conversationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return items.reverse();
  }

  async findReplyActivity(
    storeId: string,
    options?: { skip?: number; limit?: number; connectionId?: string }
  ): Promise<{ items: InboxMessageDocument[]; total: number }> {
    const filter: Record<string, unknown> = {
      storeId,
      direction: "outbound",
      repliedBy: { $exists: true, $ne: null },
    };
    if (options?.connectionId) filter.connectionId = new ObjectId(options.connectionId);

    const collection = this.db.collection<InboxMessageDocument>(COLLECTIONS.INBOX_MESSAGES);
    const total = await collection.countDocuments(filter);

    let cursor = collection.find(filter).sort({ createdAt: -1 });
    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);

    const items = await cursor.toArray();
    return { items, total };
  }
}

let instance: InboxRepository | null = null;

export function getInboxRepository(): InboxRepository {
  if (!instance) {
    instance = new InboxRepository(getDatabase());
  }
  return instance;
}
