declare module "helmet" {
  import type { RequestHandler } from "express";
  interface HelmetOptions {
    crossOriginResourcePolicy?: boolean | { policy?: string };
    crossOriginEmbedderPolicy?: boolean;
    contentSecurityPolicy?: boolean | { directives?: Record<string, string[]> };
    [key: string]: unknown;
  }
  function helmet(options?: HelmetOptions): RequestHandler;
  export default helmet;
}

declare module "express-rate-limit" {
  import type { RequestHandler } from "express";
  interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    message?: unknown;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
    [key: string]: unknown;
  }
  function rateLimit(options?: RateLimitOptions): RequestHandler;
  export default rateLimit;
  export { rateLimit };
}

declare module "groq-sdk" {
  interface ClientOptions {
    apiKey?: string;
    baseURL?: string;
  }

  interface ChatCompletionMessage {
    role: "system" | "user" | "assistant";
    content: string;
  }

  interface ChatCompletionParams {
    model: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  }

  interface ChatCompletionChoice {
    index: number;
    message: { role: string; content: string };
    finish_reason: string | null;
  }

  interface ChatCompletionResponse {
    id: string;
    choices: ChatCompletionChoice[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }

  interface Completions {
    create(params: ChatCompletionParams): Promise<ChatCompletionResponse>;
  }

  interface Chat {
    completions: Completions;
  }

  class Groq {
    constructor(options?: ClientOptions);
    chat: Chat;
  }

  export default Groq;
  export { Groq };
}
