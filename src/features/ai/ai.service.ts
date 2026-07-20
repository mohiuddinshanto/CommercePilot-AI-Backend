import Groq from "groq-sdk";
import { getAIRepository } from "./ai.repository.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import { ACTIVITY_ACTION, PLAN_LIMITS } from "../../constants/index.js";
import { environment } from "../../config/environment.js";
import {
  AIMessage,
  ChatInput,
  ChatResponse,
  ConversationListItem,
  ConversationDetail,
  StoreAIContext,
  StoreContextData,
  GenerateContentInput,
  GenerateContentResponse,
} from "./ai.types.js";
import { NotFoundError, BusinessRuleError } from "../../utils/error-handler.js";

const SYSTEM_PROMPT = `You are CommercePilot AI — a helpful AI Business Copilot for a multi-tenant e-commerce platform. You analyze store data and provide actionable business insights.

Core rules:
- You are READ-ONLY. NEVER suggest executing database changes (delete, update, create).
- You can suggest actions the user should take manually.
- Always respond in the same language the user writes in.
- Be concise, data-driven, and actionable.
- When referencing numbers, use the provided context data.
- Format responses with markdown for readability (lists, bold, code blocks when helpful).
- If asked about something outside your context, say so honestly.`;

const MAX_HISTORY_MESSAGES = 20;
const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;
const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  data: StoreAIContext;
  expiry: number;
}

const contextCache = new Map<string, CacheEntry>();

function cacheSet(key: string, value: CacheEntry) {
  if (contextCache.size >= MAX_CACHE_SIZE) {
    const firstKey = contextCache.keys().next().value;
    if (firstKey !== undefined) contextCache.delete(firstKey);
  }
  contextCache.set(key, value);
}

export class AIService {
  private repo = getAIRepository();
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: environment.GROQ_API_KEY });
  }

  async chat(
    storeId: string,
    userId: string,
    input: ChatInput,
    userPlan: string
  ): Promise<ChatResponse> {
    await this.checkPlanLimit(storeId, userId, userPlan);

    const context = await this.loadStoreContext(storeId);
    const contextString = this.formatContext(context);

    const userMessage: AIMessage = { role: "user", content: input.message };

    let conversationId = input.conversationId;
    let existingMessages: AIMessage[] = [];
    let title = "";

    if (conversationId) {
      const conversation = await this.repo.getConversationById(conversationId, storeId, userId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found.");
      }
      existingMessages = conversation.messages;
      title = conversation.title;
    }

    const allMessages: AIMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Store Context:\n${contextString}` },
      ...existingMessages.slice(-MAX_HISTORY_MESSAGES),
      userMessage,
    ];

    const model = input.model || "llama-3.1-8b-instant";

    const completion = await this.groq.chat.completions.create({
      messages: allMessages,
      model,
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: DEFAULT_MAX_TOKENS,
    });

    const choice = completion.choices[0];
    const assistantContent = choice?.message?.content || "I couldn't generate a response. Please try again.";
    const assistantMessage: AIMessage = { role: "assistant", content: assistantContent };

    const tokensUsed = completion.usage?.total_tokens || 0;

    if (!conversationId) {
      title = await this.generateTitle(input.message, model);
      const conversation = await this.repo.createConversation(
        storeId, userId, title, model, userMessage, assistantMessage
      );
      conversationId = conversation._id.toString();
    } else {
      await this.repo.addMessage(conversationId, userMessage, assistantMessage, tokensUsed);
    }

    await this.logActivity(storeId, userId, input.message.substring(0, 200));

    return {
      conversationId,
      userMessage,
      assistantMessage,
      model,
      tokensUsed,
      title,
    };
  }

  async getConversations(
    storeId: string,
    userId: string,
    page: number,
    limit: number
  ): Promise<{ items: ConversationListItem[]; total: number }> {
    const { conversations, total } = await this.repo.getConversations(storeId, userId, page, limit);

    const items: ConversationListItem[] = conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      model: c.model,
      messageCount: c.messageCount,
      totalTokens: c.totalTokens,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return { items, total };
  }

  async getConversation(
    conversationId: string,
    storeId: string,
    userId: string
  ): Promise<ConversationDetail> {
    const conversation = await this.repo.getConversationById(conversationId, storeId, userId);
    if (!conversation) {
      throw new NotFoundError("Conversation not found.");
    }

    return {
      id: conversation._id.toString(),
      title: conversation.title,
      model: conversation.model,
      messages: conversation.messages,
      totalTokens: conversation.totalTokens,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  async deleteConversation(
    conversationId: string,
    storeId: string,
    userId: string
  ): Promise<void> {
    const deleted = await this.repo.deleteConversation(conversationId, storeId, userId);
    if (!deleted) {
      throw new NotFoundError("Conversation not found.");
    }
  }

  private async loadStoreContext(storeId: string): Promise<StoreAIContext> {
    const cached = contextCache.get(storeId);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const contextData: StoreContextData = await this.repo.getStoreContext(storeId, {
      today: { start: today, end: todayEnd },
      weekStart,
      monthStart,
    });

    const inv: StoreContextData["inventoryStats"] = contextData.inventoryStats;

    const context: StoreAIContext = {
      store: {
        name: contextData.store?.storeName || "Unknown Store",
        plan: contextData.store?.plan || "starter",
        currency: contextData.store?.currency || "USD",
      },
      products: {
        total: contextData.productStats.totalProducts,
        active: contextData.productStats.activeProducts,
        lowStock: contextData.productStats.lowStockProducts,
        outOfStock: contextData.productStats.outOfStockProducts,
        topProducts: contextData.productStats.topProducts.map(
          (p: { name: string; sku: string; stock: number; sellingPrice: number }) => ({
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            sellingPrice: p.sellingPrice,
          })
        ),
      },
      categories: {
        total: contextData.categoryStats.totalCategories,
        topCategories: contextData.categoryStats.topCategories.map(
          (c: { name: string; productCount?: number }) => ({
            name: c.name,
            productCount: c.productCount || 0,
          })
        ),
      },
      inventory: {
        totalStock: inv.totalStock,
        totalValue: Math.round(inv.totalValue * 100) / 100,
        lowStockItems: inv.lowStock,
        outOfStockItems: inv.outOfStock,
      },
      sales: {
        todayRevenue: contextData.salesStats.todaySales[0]?.revenue ? Math.round(contextData.salesStats.todaySales[0].revenue * 100) / 100 : 0,
        weekRevenue: contextData.salesStats.weekSales[0]?.revenue ? Math.round(contextData.salesStats.weekSales[0].revenue * 100) / 100 : 0,
        monthRevenue: contextData.salesStats.monthSales[0]?.revenue ? Math.round(contextData.salesStats.monthSales[0].revenue * 100) / 100 : 0,
        totalRevenue: contextData.salesStats.totalSalesAgg[0]?.total ? Math.round(contextData.salesStats.totalSalesAgg[0].total * 100) / 100 : 0,
        todayCount: contextData.salesStats.todayCount,
        monthCount: contextData.salesStats.monthCount,
        avgOrderValue: contextData.salesStats.monthCount > 0 ? Math.round((contextData.salesStats.monthSales[0]?.revenue || 0) / contextData.salesStats.monthCount * 100) / 100 : 0,
        topPaymentMethod: contextData.salesStats.paymentMethodAgg[0]?._id || "N/A",
      },
      staff: {
        total: contextData.staffStats.totalStaff,
        active: contextData.staffStats.activeStaff,
      },
    };

    cacheSet(storeId, { data: context, expiry: Date.now() + CONTEXT_CACHE_TTL_MS });

    return context;
  }

  private formatContext(context: StoreAIContext): string {
    return `
Store: ${context.store.name} (Plan: ${context.store.plan}, Currency: ${context.store.currency})

Products:
- Total: ${context.products.total}, Active: ${context.products.active}
- Low Stock: ${context.products.lowStock}, Out of Stock: ${context.products.outOfStock}
- Top products: ${context.products.topProducts.map((p) => `${p.name} (SKU: ${p.sku}, Stock: ${p.stock}, Price: ${p.sellingPrice})`).join("; ") || "None"}

Categories: ${context.categories.total} total

Inventory:
- Total stock units: ${context.inventory.totalStock}
- Total value: ${context.inventory.totalValue}
- Low stock items: ${context.inventory.lowStockItems}
- Out of stock items: ${context.inventory.outOfStockItems}

Sales:
- Today: ${context.sales.todayRevenue} (${context.sales.todayCount} orders)
- This week: ${context.sales.weekRevenue}
- This month: ${context.sales.monthRevenue} (${context.sales.monthCount} orders)
- All time: ${context.sales.totalRevenue}
- Avg order value: ${context.sales.avgOrderValue}
- Top payment method: ${context.sales.topPaymentMethod}

Staff: ${context.staff.total} total, ${context.staff.active} active
`.trim();
  }

  private async generateTitle(message: string, model: string): Promise<string> {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: "Generate a short title (max 50 chars) for this conversation. Reply ONLY with the title, no quotes." },
          { role: "user", content: message },
        ],
        model,
        temperature: 0.3,
        max_tokens: 60,
      });
      return completion.choices[0]?.message?.content?.trim() || message.substring(0, 50);
    } catch {
      return message.substring(0, 50);
    }
  }

  private async checkPlanLimit(
    storeId: string,
    userId: string,
    userPlan: string
  ): Promise<void> {
    const planLimits = PLAN_LIMITS[userPlan as keyof typeof PLAN_LIMITS];
    if (!planLimits) return;

    const maxRequests = planLimits.maxAiRequests;
    if (maxRequests === -1) return;

    const count = await this.repo.countByStoreAndUser(storeId, userId);
    if (count >= maxRequests) {
      throw new BusinessRuleError(
        `AI request limit reached for ${userPlan} plan (${maxRequests} messages). Upgrade your plan for more.`
      );
    }
  }

  private async logActivity(storeId: string, userId: string, description: string): Promise<void> {
    try {
      const authRepo = getAuthRepository();
      await authRepo.createActivityLog({
        storeId,
        userId,
        action: ACTIVITY_ACTION.AI_REQUEST,
        module: "ai",
        description: `AI chat: ${description}`,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Activity logging should not fail the request
    }
  }

  async generateContent(
    storeId: string,
    userId: string,
    input: GenerateContentInput,
    userPlan: string
  ): Promise<GenerateContentResponse> {
    await this.checkPlanLimit(storeId, userId, userPlan);

    const context = await this.loadStoreContext(storeId);

    const lengthGuidelines = {
      short: "Make it brief and concise, around 50-100 words.",
      medium: "Provide a balanced outline, around 150-300 words.",
      long: "Provide a detailed, in-depth layout, around 450-600 words.",
    }[input.length];

    const templates = {
      product_description: `Generate a compelling and persuasive product description for: "${input.titleOrKeywords}".
Tone of Voice: ${input.tone}
Length Guideline: ${lengthGuidelines}
Key Features/Bullet Points to include:
${input.keyFeatures || "Not provided."}

Focus on listing the benefits, creating a hook, and a call-to-action suitable for a high-converting e-commerce product page. Use relevant store context if helpful: Store Currency: ${context.store.currency}, Store Name: ${context.store.name}.`,

      social_post: `Create an engaging social media post (Facebook, Instagram, LinkedIn) to promote: "${input.titleOrKeywords}".
Tone of Voice: ${input.tone}
Length Guideline: ${lengthGuidelines}
Key Highlights to include:
${input.keyFeatures || "Not provided."}

Include attention-grabbing hook lines, emojis appropriate for the tone, and 3-5 relevant hashtags. Create a strong call-to-action directing followers to the store.`,

      blog_outline: `Create a structured, search-engine-optimized blog post outline or content draft for: "${input.titleOrKeywords}".
Tone of Voice: ${input.tone}
Length Guideline: ${lengthGuidelines}
Key Points/Topics to cover:
${input.keyFeatures || "Not provided."}

Provide a clean heading structure (H2, H3) and short descriptions of what each section should discuss.`,

      email_newsletter: `Write a marketing email newsletter for store customers. Subject or theme: "${input.titleOrKeywords}".
Tone of Voice: ${input.tone}
Length Guideline: ${lengthGuidelines}
Key Content / Offers / Features to include:
${input.keyFeatures || "Not provided."}

Include a catchy Subject Line, Preheader text, friendly Greeting, engaging Body, and a clear, clickable Call-To-Action (CTA).`,
    };

    const prompt = templates[input.contentType] || templates.product_description;
    const model = "llama-3.1-8b-instant";

    const completion = await this.groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are CommercePilot Content AI, a specialized copywriter and e-commerce marketing specialist. You generate high-quality, professional marketing copies, product descriptions, blog layouts, and emails.
Always structure your responses beautifully using markdown.
Do NOT include any preamble or meta-commentary (like "Here is your generated description:" or "Sure, I can help with that"). Output ONLY the requested content directly.`,
        },
        { role: "user", content: prompt },
      ],
      model,
      temperature: 0.8,
      max_tokens: DEFAULT_MAX_TOKENS,
    });

    const choice = completion.choices[0];
    const generatedContent = choice?.message?.content || "Could not generate content. Please try again.";
    const tokensUsed = completion.usage?.total_tokens || 0;

    await this.logActivity(storeId, userId, `Generated ${input.contentType}: ${input.titleOrKeywords.substring(0, 100)}`);

    return {
      content: generatedContent,
      tokensUsed,
      model,
    };
  }
}

let instance: AIService | null = null;

export function getAIService(): AIService {
  if (!instance) {
    instance = new AIService();
  }
  return instance;
}
