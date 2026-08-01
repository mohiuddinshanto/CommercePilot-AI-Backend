import { createHmac } from "crypto";
import { getInboxRepository } from "./inbox.repository.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import {
  CreateConnectionInput,
  UpdateConnectionInput,
  UpdateConversationInput,
  SendMessageInput,
  SocialConnectionDocument,
  InboxConversationDocument,
  InboxMessageDocument,
} from "./inbox.types.js";
import { NotFoundError, BusinessRuleError, ValidationError } from "../../utils/error-handler.js";
import { parsePaginationParams } from "../../utils/pagination.js";
import { logger } from "../../utils/logger.js";
import {
  ACTIVITY_ACTION,
  SOCIAL_PLATFORM,
  INBOX_CONVERSATION_STATUS,
  MESSAGE_DIRECTION,
} from "../../constants/index.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export class InboxService {
  private inboxRepo = getInboxRepository();
  private authRepository = getAuthRepository();

  // ── Meta Graph API helpers ──

  private async callGraphApi(
    path: string,
    method: string,
    params?: Record<string, string | number | boolean>,
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${GRAPH_API_BASE}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    }

    const response = await fetch(url.toString(), {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data as { error?: unknown }).error) {
      const err = (data as { error?: { message?: string } }).error;
      throw new BusinessRuleError(`Meta API error: ${err?.message || `HTTP ${response.status}`}`);
    }

    return data as Record<string, unknown>;
  }

  private async verifyPageToken(pageId: string, token: string): Promise<{ id: string; name: string }> {
    const appId = process.env.META_APP_ID || "";
    const appSecret = process.env.META_APP_SECRET || "";
    if (!appId || !appSecret) {
      throw new BusinessRuleError("Meta app credentials (META_APP_ID, META_APP_SECRET) are not configured on the server.");
    }

    const appToken = `${appId}|${appSecret}`;
    const data = await this.callGraphApi("/debug_token", "GET", {
      input_token: token,
      access_token: appToken,
    });

    const info = (data.data as Record<string, unknown>) || {};
    if (info.is_valid !== true || info.type !== "PAGE") {
      const expiresAt = Number(info.expires_at || 0);
      const expiryText = expiresAt === 0 ? "never" : new Date(expiresAt * 1000).toISOString();
      throw new BusinessRuleError(
        `The provided token is not a valid Facebook Page Access Token. ` +
        `(debug_token says is_valid=${String(info.is_valid)}, type=${String(info.type)}, ` +
        `expires=${expiryText}, profile_id=${String(info.profile_id || "")})`
      );
    }

    const resolvedPageId = String(info.profile_id || "");
    if (resolvedPageId !== pageId) {
      throw new BusinessRuleError("The token does not belong to the page ID you provided.");
    }

    return { id: resolvedPageId, name: "" };
  }

  private async getUserProfile(pageAccessToken: string, psid: string): Promise<{ name: string; profilePic?: string }> {
    try {
      const data = await this.callGraphApi(`/${psid}`, "GET", {
        fields: "first_name,last_name,profile_pic",
        access_token: pageAccessToken,
      });
      const firstName = String(data.first_name || "");
      const lastName = String(data.last_name || "");
      return {
        name: [firstName, lastName].filter(Boolean).join(" ").trim() || psid,
        profilePic: data.profile_pic ? String(data.profile_pic) : undefined,
      };
    } catch {
      return { name: psid };
    }
  }

  private async sendViaMeta(
    pageAccessToken: string,
    psid: string,
    text: string
  ): Promise<void> {
    await this.callGraphApi("/me/messages", "POST", { access_token: pageAccessToken }, {
      recipient: { id: psid },
      message: { text },
    });
  }

  // ── connections ──

  async connectPage(storeId: string, userId: string, input: CreateConnectionInput): Promise<SocialConnectionDocument> {
    if (!Object.values(SOCIAL_PLATFORM).includes(input.platform as never)) {
      throw new ValidationError("Validation failed.", [
        { field: "platform", message: `Platform must be one of: ${Object.values(SOCIAL_PLATFORM).join(", ")}.` },
      ]);
    }

    const verified = await this.verifyPageToken(input.pageId, input.pageAccessToken);

    const existing = await this.inboxRepo.findConnectionByPageId(storeId, verified.id);
    if (existing) {
      throw new BusinessRuleError("This Facebook page is already connected to your store.");
    }

    const now = new Date().toISOString();
    const connectionData: Omit<SocialConnectionDocument, "_id"> = {
      storeId,
      platform: input.platform,
      pageId: verified.id,
      pageName: input.pageName || verified.id,
      pageAccessToken: input.pageAccessToken,
      active: true,
      connectedBy: userId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const connection = await this.inboxRepo.createConnection(connectionData);

    // Subscribe the page to our webhook so incoming messages are delivered.
    try {
      await this.callGraphApi(`/${verified.id}/subscribed_apps`, "POST", {
        access_token: input.pageAccessToken,
        subscribed_fields: "messages",
      });
    } catch (error) {
      logger.warn("Failed to subscribe page to webhook", error);
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CONNECT_PAGE,
      module: "inbox",
      description: `Facebook page "${connection.pageName}" (${connection.pageId}) connected.`,
      createdAt: now,
    });

    return connection;
  }

  async getConnections(storeId: string): Promise<SocialConnectionDocument[]> {
    return this.inboxRepo.findConnectionsByStoreId(storeId);
  }

  async updateConnection(
    storeId: string,
    userId: string,
    connectionId: string,
    input: UpdateConnectionInput
  ): Promise<SocialConnectionDocument> {
    const existing = await this.inboxRepo.findConnectionById(connectionId, storeId);
    if (!existing) throw new NotFoundError("Connection");

    const updateData: Record<string, unknown> = {};

    if (input.pageAccessToken !== undefined && input.pageAccessToken !== existing.pageAccessToken) {
      const verified = await this.verifyPageToken(existing.pageId, input.pageAccessToken);
      if (verified.id !== existing.pageId) {
        throw new BusinessRuleError("The new token does not belong to the connected page.");
      }
      updateData.pageAccessToken = input.pageAccessToken;
    }
    if (input.pageName !== undefined) updateData.pageName = input.pageName;
    if (input.active !== undefined) updateData.active = input.active;

    if (Object.keys(updateData).length > 0) {
      await this.inboxRepo.updateConnection(connectionId, storeId, updateData);
    }

    const updated = await this.inboxRepo.findConnectionById(connectionId, storeId);
    if (!updated) throw new NotFoundError("Connection");

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_PAGE,
      module: "inbox",
      description: `Connection "${updated.pageName}" updated.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async disconnectPage(storeId: string, userId: string, connectionId: string): Promise<void> {
    const existing = await this.inboxRepo.findConnectionById(connectionId, storeId);
    if (!existing) throw new NotFoundError("Connection");

    await this.inboxRepo.softDeleteConnection(connectionId, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DISCONNECT_PAGE,
      module: "inbox",
      description: `Facebook page "${existing.pageName}" disconnected.`,
      createdAt: new Date().toISOString(),
    });
  }

  // ── conversations ──

  async getConversations(storeId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const { items, total } = await this.inboxRepo.findConversationsByStoreId(storeId, {
      skip,
      limit,
      connectionId: queryParams.connectionId,
      status: queryParams.status,
      search: queryParams.q,
      sort: { lastMessageAt: -1 },
    });

    return {
      items,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMessages(storeId: string, conversationId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const conversation = await this.inboxRepo.findConversationById(conversationId, storeId);
    if (!conversation) throw new NotFoundError("Conversation");

    const { items, total } = await this.inboxRepo.findMessagesByConversation(
      storeId,
      conversation._id,
      { skip, limit }
    );

    return {
      items,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
      conversation: {
        _id: conversation._id,
        participantName: conversation.participantName,
        participantProfilePic: conversation.participantProfilePic,
        status: conversation.status,
        assignedTo: conversation.assignedTo,
        assignedToName: conversation.assignedToName,
        connectionId: conversation.connectionId,
      },
    };
  }

  async sendReply(
    storeId: string,
    userId: string,
    userName: string,
    conversationId: string,
    input: SendMessageInput
  ): Promise<InboxMessageDocument> {
    const conversation = await this.inboxRepo.findConversationById(conversationId, storeId);
    if (!conversation) throw new NotFoundError("Conversation");

    const connection = await this.inboxRepo.findConnectionById(conversation.connectionId.toString(), storeId);
    if (!connection || !connection.active) {
      throw new BusinessRuleError("The connected page is no longer active. Please reconnect it.");
    }

    const text = input.text.trim();
    if (!text) {
      throw new ValidationError("Validation failed.", [{ field: "text", message: "Message text is required." }]);
    }

    await this.sendViaMeta(connection.pageAccessToken, conversation.participantId, text);

    const now = new Date().toISOString();
    const messageData: Omit<InboxMessageDocument, "_id"> = {
      storeId,
      connectionId: conversation.connectionId,
      conversationId: conversation._id,
      platform: conversation.platform,
      direction: MESSAGE_DIRECTION.OUTBOUND,
      text,
      repliedBy: userId,
      repliedByName: userName,
      createdAt: now,
    };

    const message = await this.inboxRepo.createMessage(messageData);

    await this.inboxRepo.updateConversation(conversation._id, storeId, {
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 120),
      lastMessageDirection: MESSAGE_DIRECTION.OUTBOUND,
      unreadCount: 0,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.SEND_MESSAGE,
      module: "inbox",
      description: `${userName} replied to "${conversation.participantName}" via ${conversation.platform}.`,
      createdAt: now,
    });

    return message;
  }

  async updateConversation(
    storeId: string,
    userId: string,
    conversationId: string,
    input: UpdateConversationInput
  ): Promise<InboxConversationDocument> {
    const existing = await this.inboxRepo.findConversationById(conversationId, storeId);
    if (!existing) throw new NotFoundError("Conversation");

    const updateData: Record<string, unknown> = {};

    if (input.status !== undefined) {
      if (!Object.values(INBOX_CONVERSATION_STATUS).includes(input.status as never)) {
        throw new ValidationError("Validation failed.", [
          { field: "status", message: `Status must be one of: ${Object.values(INBOX_CONVERSATION_STATUS).join(", ")}.` },
        ]);
      }
      updateData.status = input.status;
    }

    if (input.assignedTo !== undefined) {
      if (input.assignedTo === null || input.assignedTo === "") {
        updateData.assignedTo = null;
        updateData.assignedToName = null;
      } else {
        const assignedUser = await this.authRepository.findUserById(input.assignedTo);
        if (!assignedUser) {
          throw new ValidationError("Validation failed.", [
            { field: "assignedTo", message: "Assigned user does not exist." },
          ]);
        }
        updateData.assignedTo = input.assignedTo;
        updateData.assignedToName = assignedUser.name;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.inboxRepo.updateConversation(existing._id, storeId, updateData);
    }

    const updated = await this.inboxRepo.findConversationById(conversationId, storeId);
    if (!updated) throw new NotFoundError("Conversation");

    if (input.assignedTo !== undefined) {
      await this.authRepository.createActivityLog({
        storeId,
        userId,
        action: ACTIVITY_ACTION.ASSIGN_CONVERSATION,
        module: "inbox",
        description: input.assignedTo
          ? `Conversation with "${updated.participantName}" assigned.`
          : `Conversation with "${updated.participantName}" unassigned.`,
        createdAt: new Date().toISOString(),
      });
    }

    return updated;
  }

  async markConversationRead(storeId: string, conversationId: string): Promise<void> {
    const existing = await this.inboxRepo.findConversationById(conversationId, storeId);
    if (!existing) return;
    await this.inboxRepo.updateConversation(existing._id, storeId, { unreadCount: 0 });
  }

  async getReplyActivity(storeId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const { items, total } = await this.inboxRepo.findReplyActivity(storeId, {
      skip,
      limit,
      connectionId: queryParams.connectionId,
    });

    const enriched = await Promise.all(
      items.map(async (msg) => {
        const conversation = await this.inboxRepo.findConversationById(msg.conversationId.toString(), storeId);
        return {
          _id: msg._id,
          participantName: conversation?.participantName || "Unknown",
          text: msg.text,
          repliedByName: msg.repliedByName || "Unknown",
          createdAt: msg.createdAt,
        };
      })
    );

    return {
      items: enriched,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── webhook ──

  verifyWebhook(mode: unknown, token: unknown, challenge: unknown): string {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || "";
    if (mode === "subscribe" && token === expected && challenge) {
      return String(challenge);
    }
    throw new BusinessRuleError("Webhook verification failed.");
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const appSecret = process.env.META_APP_SECRET || "";
    if (!appSecret || !signatureHeader) return false;

    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    const received = String(signatureHeader);
    if (expected.length !== received.length) return false;

    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
    }
    return diff === 0;
  }

  async handleWebhookEvent(payload: Record<string, unknown>): Promise<void> {
    const entries = payload.entry as Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: {
          mid?: string;
          text?: string;
          is_echo?: boolean;
          attachments?: Array<{ type?: string; payload?: { url?: string } }>;
        };
      }>;
    }> | undefined;

    if (!entries) return;

    for (const entry of entries) {
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (event.message?.is_echo) continue;
        const senderId = event.sender?.id;
        const recipientId = event.recipient?.id || entry.id;
        const text = event.message?.text || "";

        if (!senderId || !recipientId) continue;

        const connection = await this.inboxRepo.findConnectionByPageIdAnyStore(recipientId);
        if (!connection) continue;

        const attachment = event.message?.attachments?.[0];
        const attachmentUrl = attachment?.payload?.url;
        const attachmentType = attachment?.type;

        let conversation = await this.inboxRepo.findConversationByParticipant(
          connection.storeId,
          connection._id,
          senderId
        );

        const now = new Date().toISOString();

        if (!conversation) {
          const profile = await this.getUserProfile(connection.pageAccessToken, senderId);
          const conversationData: Omit<InboxConversationDocument, "_id"> = {
            storeId: connection.storeId,
            connectionId: connection._id,
            platform: connection.platform,
            participantId: senderId,
            participantName: profile.name,
            participantProfilePic: profile.profilePic,
            lastMessageAt: now,
            lastMessagePreview: text.slice(0, 120) || (attachmentType ? `[${attachmentType}]` : ""),
            lastMessageDirection: MESSAGE_DIRECTION.INBOUND,
            unreadCount: 1,
            status: INBOX_CONVERSATION_STATUS.OPEN,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
          };
          conversation = await this.inboxRepo.createConversation(conversationData);
        } else {
          await this.inboxRepo.updateConversation(conversation._id, connection.storeId, {
            lastMessageAt: now,
            lastMessagePreview: text.slice(0, 120) || (attachmentType ? `[${attachmentType}]` : ""),
            lastMessageDirection: MESSAGE_DIRECTION.INBOUND,
            unreadCount: (conversation.unreadCount || 0) + 1,
          });
        }

        await this.inboxRepo.createMessage({
          storeId: connection.storeId,
          connectionId: connection._id,
          conversationId: conversation._id,
          platform: connection.platform,
          direction: MESSAGE_DIRECTION.INBOUND,
          text,
          attachmentUrl,
          attachmentType,
          metaMessageId: event.message?.mid,
          createdAt: now,
        });
      }
    }
  }
}

let instance: InboxService | null = null;

export function getInboxService(): InboxService {
  if (!instance) {
    instance = new InboxService();
  }
  return instance;
}
