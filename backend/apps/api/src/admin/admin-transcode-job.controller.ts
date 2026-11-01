import { Controller, Get, Inject, Param } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator.js";
import { AdminService } from "./admin.service.js";

@Roles("ADMIN")
@Controller("v1/admin/transcode-jobs")
export class AdminTranscodeJobController {
  constructor(
    @Inject(AdminService)
    private readonly adminService: AdminService,
  ) {}

  @Get(":id")
  async getJob(@Param("id") id: string) {
    return this.adminService.getTranscodeJobById(id);
  }
}
