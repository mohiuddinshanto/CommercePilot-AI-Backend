import { Request, Response, NextFunction } from "express";
import { getStaffService } from "./staff.service";
import { getStoreId } from "../../utils/store";
import { sendSuccess, sendCreated, sendNoContent, sendPaginated } from "../../utils/api-response";

export class StaffController {
  private service = getStaffService();

  async invite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const staff = await this.service.inviteStaff(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Staff invitation sent successfully.", staff);
    } catch (error) {
      next(error);
    }
  }

  async accept(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;
      const staff = await this.service.acceptInvitation(
        token,
        req.user!.id,
        req.user!.email
      );
      sendSuccess(res, "Invitation accepted successfully.", staff);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getStaffList(storeId, req.query as Record<string, string>);
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page * result.pageSize < result.total,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const staff = await this.service.getStaffById(storeId, id);
      sendSuccess(res, "Staff member retrieved successfully.", staff);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const staff = await this.service.updateStaff(
        storeId,
        req.user!.id,
        id,
        req.body
      );
      sendSuccess(res, "Staff member updated successfully.", staff);
    } catch (error) {
      next(error);
    }
  }

  async suspend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const staff = await this.service.suspendStaff(storeId, req.user!.id, id);
      sendSuccess(res, "Staff member suspended successfully.", staff);
    } catch (error) {
      next(error);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const staff = await this.service.activateStaff(storeId, req.user!.id, id);
      sendSuccess(res, "Staff member activated successfully.", staff);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.deleteStaff(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }
}
