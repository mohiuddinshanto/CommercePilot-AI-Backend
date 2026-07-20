import { getDatabase } from "../../config/database.js";
import { getAuth } from "../../config/auth.js";
import { AuthRepository } from "./auth.repository.js";
import {
  CreateStoreInput,
  UserProfile,
} from "./auth.types.js";
import { ConflictError, NotFoundError, BusinessRuleError } from "../../utils/error-handler.js";
import { ACTIVITY_ACTION } from "../../constants/index.js";

export class AuthService {
  private repository: AuthRepository;

  constructor() {
    this.repository = new AuthRepository(getDatabase());
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new NotFoundError("User");
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      image: user.image,
      role: user.role,
      storeId: user.storeId,
      accountStatus: user.accountStatus,
      plan: user.plan,
    };
  }

  async createStore(userId: string, input: CreateStoreInput): Promise<{ storeId: string }> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.storeId) {
      throw new BusinessRuleError("User already has a store.");
    }

    const isSlugTaken = await this.repository.isStoreSlugTaken(input.storeSlug);

    if (isSlugTaken) {
      throw new ConflictError("Store slug already exists.");
    }

    const now = new Date().toISOString();

    const store = await this.repository.createStore({
      ownerId: userId,
      storeName: input.storeName,
      storeSlug: input.storeSlug.toLowerCase(),
      phone: input.phone,
      email: input.email,
      address: input.address,
      currency: input.currency,
      timezone: input.timezone,
      plan: "starter",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const storeId = store._id.toString();

    await this.repository.updateUserStoreId(userId, storeId);

    await this.repository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CREATE_STORE,
      module: "auth",
      description: "Store created. Awaiting approval.",
      createdAt: now,
    });

    return { storeId };
  }

  async getSession(headers: Record<string, string>): Promise<any> {
    const auth = getAuth();
    return auth.api.getSession({ headers });
  }

  async updateAccountStatus(
    userId: string,
    status: string
  ): Promise<void> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new NotFoundError("User");
    }

    await this.repository.updateUserAccountStatus(userId, status);

    if (user.storeId) {
      await this.repository.updateStoreAccountStatus(user.storeId, status);

      const action = status === "approved"
        ? ACTIVITY_ACTION.STORE_APPROVED
        : ACTIVITY_ACTION.STORE_REJECTED;

      await this.repository.createActivityLog({
        storeId: user.storeId,
        userId,
        action,
        module: "auth",
        description: `Account status changed to ${status}.`,
        createdAt: new Date().toISOString(),
      });
    }
  }

}

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
