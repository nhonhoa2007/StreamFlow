import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { AdminCreateMediaSchema, AdminUpdateMediaSchema } from "@streamflow/contracts";
import { Roles } from "../auth/roles.decorator.js";
import { AdminService } from "./admin.service.js";

@Roles("ADMIN")
@Controller("v1/admin/media")
export class AdminController {
  constructor(
    @Inject(AdminService)
    private readonly adminService: AdminService,
  ) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const parsed = AdminCreateMediaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    return this.adminService.create(parsed.data);
  }

  @Get()
  async list() {
    return this.adminService.list();
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const parsed = AdminUpdateMediaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    return this.adminService.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.adminService.delete(id);
  }
}
