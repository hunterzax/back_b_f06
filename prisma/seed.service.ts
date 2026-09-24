import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) { }

  async run() {
    this.logger.log('Start seeding...');
    const tempsTable = this.readTempsTable();

    if (process.env.NODE_ENV != 'dr') {
      await this.seedMenus(tempsTable);
      await this.seedMenusConfigFastRewrite();
    }

    this.logger.log('Seed completed.');
  }

  private readTempsTable() {
    const tempsTablePath = path.join(
      process.cwd(),
      'public',
      'temps-table.json',
    );

    if (!fs.existsSync(tempsTablePath)) {
      throw new Error(`temps-table.json not found at: ${tempsTablePath}`);
    }

    return JSON.parse(fs.readFileSync(tempsTablePath, 'utf8'));
  }

  private async seedMenus(tempsTable: any) {
    try {
      const menusFromFile = tempsTable?.menus ?? [];
      const menuExists = await this.prisma.menus.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const existingIds = new Set(menuExists.map((e: any) => e.id));
      const menuToCreate = menusFromFile.filter(
        (menu: any) => !existingIds.has(menu.id),
      );
      const menuToUpdate = menusFromFile.filter((menu: any) =>
        existingIds.has(menu.id),
      );

      this.logger.log(`Menus to create: ${menuToCreate.length}`);
      this.logger.log(`Menus to update: ${menuToUpdate.length}`);

      const updatePromises = menuToUpdate.map((menu: any) => {
        const { id, ...data } = menu;

        return this.prisma.menus.update({
          where: { id },
          data: {
            default_f_view: data?.default_f_view,
            default_f_create: data?.default_f_create,
            default_f_edit: data?.default_f_edit,
            default_f_import: data?.default_f_import,
            default_f_export: data?.default_f_export,
            default_f_approved: data?.default_f_approved,
            default_f_noti_email: data?.default_f_noti_email,
            default_f_noti_inapp: data?.default_f_noti_inapp,
            default_b_manage: data?.default_b_manage,

            tso_default_f_view: data?.tso_default_f_view,
            tso_default_f_create: data?.tso_default_f_create,
            tso_default_f_edit: data?.tso_default_f_edit,
            tso_default_f_import: data?.tso_default_f_import,
            tso_default_f_export: data?.tso_default_f_export,
            tso_default_f_approved: data?.tso_default_f_approved,
            tso_default_f_noti_email: data?.tso_default_f_noti_email,
            tso_default_f_noti_inapp: data?.tso_default_f_noti_inapp,
            tso_default_b_manage: data?.tso_default_b_manage,

            shipper_default_f_view: data?.shipper_default_f_view,
            shipper_default_f_create: data?.shipper_default_f_create,
            shipper_default_f_edit: data?.shipper_default_f_edit,
            shipper_default_f_import: data?.shipper_default_f_import,
            shipper_default_f_export: data?.shipper_default_f_export,
            shipper_default_f_approved: data?.shipper_default_f_approved,
            shipper_default_f_noti_email: data?.shipper_default_f_noti_email,
            shipper_default_f_noti_inapp: data?.shipper_default_f_noti_inapp,
            shipper_default_b_manage: data?.shipper_default_b_manage,

            other_default_f_view: data?.other_default_f_view,
            other_default_f_create: data?.other_default_f_create,
            other_default_f_edit: data?.other_default_f_edit,
            other_default_f_import: data?.other_default_f_import,
            other_default_f_export: data?.other_default_f_export,
            other_default_f_approved: data?.other_default_f_approved,
            other_default_f_noti_email: data?.other_default_f_noti_email,
            other_default_f_noti_inapp: data?.other_default_f_noti_inapp,
            other_default_b_manage: data?.other_default_b_manage,


          },
        });
      });

      await this.prisma.$transaction([
        ...updatePromises,
        ...(menuToCreate.length > 0
          ? [
            this.prisma.menus.createMany({
              data: menuToCreate,
              skipDuplicates: true,
            }),
          ]
          : []),
      ]);

      this.logger.log('Menus seeded.');
    } catch (error) {
      this.logger.log('Menus failed.');
    }
  }

  private async seedMenusConfigFastRewrite() {
    const menus = await this.prisma.menus.findMany({
      orderBy: { id: 'asc' },
    });

    const roles = await this.prisma.role.findMany({
      select: { id: true, user_type_id: true },
    });

    const menuConfigs = await this.prisma.menus_config.findMany({
      select: {
        role_id: true,
        menus_id: true,
        seq: true,
        parent: true,
        f_view: true,
        f_create: true,
        f_edit: true,
        f_import: true,
        f_export: true,
        f_approved: true,

        f_noti_email: true,
        f_noti_inapp: true,

        b_manage: true,
      },
    });

    const keepOldIfOne = (oldValue: any, newValue: any) => {
      if (newValue === 2) return 2;
      return oldValue === 1 ? 1 : newValue;
    };

    const getTypePrefix = (userTypeId: number | null) => {
      if (userTypeId === 2) return 'tso_';
      if (userTypeId === 3) return 'shipper_';
      if (userTypeId === 4) return 'other_';
      return '';
    };

    const configByRole = new Map<number, Map<number, any>>();
    for (const cfg of menuConfigs) {
      if (!configByRole.has(cfg.role_id)) {
        configByRole.set(cfg.role_id, new Map());
      }
      configByRole.get(cfg.role_id)!.set(cfg.menus_id, cfg);
    }

    for (const role of roles) {
      const typePrefix = getTypePrefix(role.user_type_id);
      const oldMap = configByRole.get(role.id) ?? new Map<number, any>();

      const finalRows = menus.map((menu: any) => {
        const old = oldMap.get(menu.id);

        return {
          role_id: role.id,
          menus_id: menu.id,
          seq: menu?.seq ?? null,
          parent: menu?.parent ?? null,

          f_view:
            role.id === 1
              ? 1
              : old
                ? keepOldIfOne(
                  old?.f_view,
                  menu?.[`${typePrefix}default_f_view`],
                )
                : menu?.[`${typePrefix}default_f_view`],

          f_create:
            role.id === 1
              ? 1
              : old
                ? keepOldIfOne(
                  old?.f_create,
                  menu?.[`${typePrefix}default_f_create`],
                )
                : menu?.[`${typePrefix}default_f_create`],

          f_edit:
            role.id === 1
              ? 1
              : old
                ? keepOldIfOne(
                  old?.f_edit,
                  menu?.[`${typePrefix}default_f_edit`],
                )
                : menu?.[`${typePrefix}default_f_edit`],

          f_import:
            menu?.default_f_import === 2
              ? 2
              : role.id === 1
                ? 1
                : old
                  ? keepOldIfOne(
                    old?.f_import,
                    menu?.[`${typePrefix}default_f_import`],
                  )
                  : menu?.[`${typePrefix}default_f_import`],

          f_export:
            menu?.default_f_export === 2
              ? 2
              : role.id === 1
                ? 1
                : old
                  ? keepOldIfOne(
                    old?.f_export,
                    menu?.[`${typePrefix}default_f_export`],
                  )
                  : menu?.[`${typePrefix}default_f_export`],

          f_approved:
            menu?.default_f_approved === 2
              ? 2
              : role.id === 1
                ? 1
                : old
                  ? keepOldIfOne(
                    old?.f_approved,
                    menu?.[`${typePrefix}default_f_approved`],
                  )
                  : menu?.[`${typePrefix}default_f_approved`],

          f_noti_email:
            menu?.default_f_noti_email === 2
              ? 2
              : role.id === 1
                ? 1
                : old
                  ? keepOldIfOne(
                    old?.f_approved,
                    menu?.[`${typePrefix}default_f_noti_email`],
                  )
                  : menu?.[`${typePrefix}default_f_noti_email`],

          f_noti_inapp:
            menu?.default_f_noti_inapp === 2
              ? 2
              : role.id === 1
                ? 1
                : old
                  ? keepOldIfOne(
                    old?.f_approved,
                    menu?.[`${typePrefix}default_f_noti_inapp`],
                  )
                  : menu?.[`${typePrefix}default_f_noti_inapp`],

          b_manage:
            role.id === 1
              ? true
              : old
                ? !!old?.b_manage
                : !!menu?.[`${typePrefix}default_b_manage`],
        };
      });

      await this.prisma.$transaction([
        this.prisma.menus_config.deleteMany({
          where: { role_id: role.id },
        }),
        this.prisma.menus_config.createMany({
          data: finalRows,
        }),
      ]);

      this.logger.log(`Role ${role.id} rewritten. total=${finalRows.length}`);
    }
  }
}
