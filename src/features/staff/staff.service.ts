import crypto from "crypto";
import { getStaffRepository } from "./staff.repository";
import { StaffMemberDocument, InviteStaffInput, UpdateStaffInput, StaffQueryParams } from "./staff.types";
import { getAuthRepository } from "../auth/auth.repository";
import { NotFoundError, BusinessRuleError, ValidationError } from "../../utils/error-handler";
import { parsePaginationParams } from "../../utils/pagination";
import { ACTIVITY_ACTION } from "../../constants";
import { PLAN_LIMITS } from "../../constants";
import { getSubscriptionService } from "../subscriptions/subscription.service";
import { EMAIL_REGEX } from "../../utils/helpers";

export class StaffService {
  private staffRepo = getStaffRepository();
  private authRepository = getAuthRepository();
  private subscriptionService = getSubscriptionService();

  async inviteStaff(
    storeId: string,
    userId: string,
    input: InviteStaffInput
  ): Promise<StaffMemberDocument> {
    const email = input.email.toLowerCase().trim();
    const name = input.name.trim();

    if (!name) {
      throw new ValidationError("Validation failed.", [
        { field: "name", message: "Name is required." },
      ]);
    }

    if (!email) {
      throw new ValidationError("Validation failed.", [
        { field: "email", message: "Email is required." },
      ]);
    }

    const emailRegex = EMAIL_REGEX;
    if (!emailRegex.test(email)) {
      throw new ValidationError("Validation failed.", [
        { field: "email", message: "Invalid email address." },
      ]);
    }

    if (!input.permissions || !Array.isArray(input.permissions) || input.permissions.length === 0) {
      throw new ValidationError("Validation failed.", [
        { field: "permissions", message: "At least one permission is required." },
      ]);
    }

    const existing = await this.staffRepo.findByEmailAndStoreId(email, storeId);
    if (existing) {
      throw new BusinessRuleError("A staff member with this email already exists in your store.");
    }

    const store = await this.authRepository.getStore(storeId);
    if (!store) {
      throw new NotFoundError("Store");
    }

    const plan = store.plan || "starter";
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    if (limits && limits.maxStaff !== -1) {
      const currentCount = await this.staffRepo.countByStoreId(storeId);
      if (currentCount >= limits.maxStaff) {
        throw new BusinessRuleError(
          `You have reached the maximum staff limit (${limits.maxStaff}) for your ${plan} plan.`
        );
      }
    }

    await this.subscriptionService.checkPlanLimit(storeId, "maxStaff");

    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const now = new Date().toISOString();
    const staff = await this.staffRepo.create({
      storeId,
      userId: "",
      name,
      email,
      role: input.role || "cashier",
      permissions: input.permissions,
      status: "pending",
      invitationToken,
      invitationExpiresAt,
      invitedBy: userId,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.INVITE_STAFF,
      module: "staff",
      description: `Staff invitation sent to ${email}.`,
      createdAt: now,
    });

    await this.subscriptionService.incrementUsage(storeId, "staff").catch(() => {});

    return staff;
  }

  async acceptInvitation(
    token: string,
    userId: string,
    userEmail: string
  ): Promise<StaffMemberDocument> {
    const staff = await this.staffRepo.findByInvitationToken(token);
    if (!staff) {
      throw new NotFoundError("Invitation");
    }

    if (new Date(staff.invitationExpiresAt) < new Date()) {
      throw new BusinessRuleError("This invitation has expired.");
    }

    const now = new Date().toISOString();
    const updated = await this.staffRepo.update(staff._id.toString(), staff.storeId, {
      userId,
      status: "active",
      updatedAt: now,
    });

    if (!updated) {
      throw new NotFoundError("Staff member");
    }

    await this.authRepository.createActivityLog({
      storeId: staff.storeId,
      userId,
      action: ACTIVITY_ACTION.ACCEPT_INVITATION,
      module: "staff",
      description: `${userEmail} accepted staff invitation.`,
      createdAt: now,
    });

    return updated;
  }

  async getStaffList(storeId: string, queryParams: StaffQueryParams) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const allowedSortFields = ["createdAt", "name", "email", "role", "status"];
    const sortBy = allowedSortFields.includes(queryParams.sortBy || "") ? queryParams.sortBy! : "createdAt";
    const order = queryParams.order === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: order as 1 | -1 };

    const { items, total } = await this.staffRepo.findByStoreId(storeId, {
      skip,
      limit,
      search: queryParams.search,
      status: queryParams.status,
      role: queryParams.role,
      sort,
    });

    return {
      items,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStaffById(storeId: string, id: string): Promise<StaffMemberDocument> {
    const staff = await this.staffRepo.findByIdAndStoreId(id, storeId);
    if (!staff) {
      throw new NotFoundError("Staff member");
    }
    return staff;
  }

  async updateStaff(
    storeId: string,
    userId: string,
    id: string,
    input: UpdateStaffInput
  ): Promise<StaffMemberDocument> {
    const existing = await this.staffRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Staff member");
    }

    if (existing.status === "pending") {
      throw new BusinessRuleError("Cannot update a pending staff member.");
    }

    const updateData: Record<string, unknown> = {};

    if (input.role !== undefined) {
      updateData.role = input.role;
    }

    if (input.permissions !== undefined) {
      if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
        throw new ValidationError("Validation failed.", [
          { field: "permissions", message: "At least one permission is required." },
        ]);
      }
      updateData.permissions = input.permissions;
    }

    const now = new Date().toISOString();
    updateData.updatedAt = now;

    const updated = await this.staffRepo.update(id, storeId, updateData);
    if (!updated) {
      throw new NotFoundError("Staff member");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_STAFF,
      module: "staff",
      description: `Staff member ${existing.name} updated.`,
      createdAt: now,
    });

    return updated;
  }

  async suspendStaff(
    storeId: string,
    userId: string,
    id: string
  ): Promise<StaffMemberDocument> {
    const existing = await this.staffRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Staff member");
    }

    if (existing.status !== "active") {
      throw new BusinessRuleError("Only active staff members can be suspended.");
    }

    const now = new Date().toISOString();
    const updated = await this.staffRepo.update(id, storeId, {
      status: "suspended",
      suspendedAt: now,
      suspendedBy: userId,
      updatedAt: now,
    });

    if (!updated) {
      throw new NotFoundError("Staff member");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.SUSPEND_STAFF,
      module: "staff",
      description: `Staff member ${existing.name} suspended.`,
      createdAt: now,
    });

    return updated;
  }

  async activateStaff(
    storeId: string,
    userId: string,
    id: string
  ): Promise<StaffMemberDocument> {
    const existing = await this.staffRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Staff member");
    }

    if (existing.status !== "suspended") {
      throw new BusinessRuleError("Only suspended staff members can be activated.");
    }

    const now = new Date().toISOString();
    const updated = await this.staffRepo.update(id, storeId, {
      status: "active",
      suspendedAt: undefined,
      suspendedBy: undefined,
      updatedAt: now,
    });

    if (!updated) {
      throw new NotFoundError("Staff member");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.ACTIVATE_STAFF,
      module: "staff",
      description: `Staff member ${existing.name} activated.`,
      createdAt: now,
    });

    return updated;
  }

  async deleteStaff(
    storeId: string,
    userId: string,
    id: string
  ): Promise<void> {
    const existing = await this.staffRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Staff member");
    }

    await this.staffRepo.delete(id, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.REMOVE_STAFF,
      module: "staff",
      description: `Staff member ${existing.name} removed.`,
      createdAt: new Date().toISOString(),
    });
  }
}

let instance: StaffService | null = null;

export function getStaffService(): StaffService {
  if (!instance) {
    instance = new StaffService();
  }
  return instance;
}
