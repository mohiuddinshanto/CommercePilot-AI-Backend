import { ObjectId } from "mongodb";

export interface SocialConnectionDocument {
  _id: ObjectId;
  storeId: string;
  platform: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  active: boolean;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export interface CreateConnectionInput {
  platform: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}

export interface UpdateConnectionInput {
  pageName?: string;
  pageAccessToken?: string;
  active?: boolean;
}

export interface InboxConversationDocument {
  _id: ObjectId;
  storeId: string;
  connectionId: ObjectId;
  platform: string;
  participantId: string;
  participantName: string;
  participantProfilePic?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageDirection: string;
  unreadCount: number;
  status: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
}

export interface UpdateConversationInput {
  status?: string;
  assignedTo?: string | null;
}

export interface InboxMessageDocument {
  _id: ObjectId;
  storeId: string;
  connectionId: ObjectId;
  conversationId: ObjectId;
  platform: string;
  direction: string;
  text: string;
  attachmentUrl?: string;
  attachmentType?: string;
  metaMessageId?: string;
  repliedBy?: string;
  repliedByName?: string;
  createdAt: string;
}

export interface SendMessageInput {
  text: string;
}

export interface ConversationSummary {
  _id: ObjectId;
  participantName: string;
  participantProfilePic?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageDirection: string;
  unreadCount: number;
  status: string;
  assignedToName?: string;
}

export interface ReplyActivity {
  _id: ObjectId;
  participantName: string;
  text: string;
  repliedByName: string;
  createdAt: string;
}
