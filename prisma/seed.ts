import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';

const tempsTable = require('../public/temps-table.json');

const prisma = new PrismaClient();
const logger = new Logger('Seed');

async function main() {
  dotenv.config();
  // logger.log('Seeding... t_and_c');
  // await prisma.t_and_c.createMany({
  //   data: tempsTable?.t_and_c,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... type_account');
  // await prisma.type_account.createMany({
  //   data: tempsTable?.type_account,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... mode_account');
  // await prisma.mode_account.createMany({
  //   data: tempsTable?.mode_account,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... user_type');
  // await prisma.user_type.createMany({
  //   data: tempsTable?.user_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... bank master');
  // await prisma.bank_master.createMany({
  //   data: tempsTable?.bank_master,
  //   skipDuplicates: true, 
  // });
  //   logger.log('Seeding... account');
  // await prisma.account.createMany({
  //   data: tempsTable?.account,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... column_table');
  // await prisma.column_table.createMany({
  //   data: tempsTable?.column_table,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... column_field');
  // await prisma.column_field.createMany({
  //   data: tempsTable?.column_field,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... tso group');
  // await prisma.column_table_config.createMany({
  //   data: tempsTable?.column_table_config_tso_group,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... shipper group');
  // await prisma.column_table_config.createMany({
  //   data: tempsTable?.column_table_config_shipper_group,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... other group');
  // await prisma.column_table_config.createMany({
  //   data: tempsTable?.column_table_config_other_group,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... division');
  // await prisma.column_table_config.createMany({
  //   data: tempsTable?.column_table_config_division,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... system login');
  // await prisma.column_table_config.createMany({
  //   data: tempsTable?.column_table_config_system_login,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... users');
  // await prisma.column_table_config.createMany({
  //   data: tempsTable?.column_table_config_users,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... role');
  // await prisma.role.createMany({
  //   data: tempsTable?.role,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... group');
  // await prisma.group.createMany({
  //   data: tempsTable?.group,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... role_default');
  // await prisma.role_default.createMany({
  //   data: tempsTable?.role_default,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... division');
  // await prisma.division.createMany({
  //   data: tempsTable?.division,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... account_manage');
  // await prisma.account_manage.createMany({
  //   data: tempsTable?.account_manage,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... account_role');
  // await prisma.account_role.createMany({
  //   data: tempsTable?.account_role,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... entry_exit');
  // await prisma.entry_exit.createMany({
  //   data: tempsTable?.entry_exit,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... zone');
  // await prisma.zone.createMany({
  //   data: tempsTable?.zone,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... sub_system_parameter');
  // await prisma.sub_system_parameter.createMany({
  //   data: tempsTable?.sub_system_parameter,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... sub_email_notification_management');
  // await prisma.sub_email_notification_management.createMany({
  //   data: tempsTable?.sub_email_notification_management,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... term_type');
  // await prisma.term_type.createMany({
  //   data: tempsTable?.term_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... process_type');
  // await prisma.process_type.createMany({
  //   data: tempsTable?.process_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... status_capacity_request_management');
  // await prisma.status_capacity_request_management.createMany({
  //   data: tempsTable?.status_capacity_request_management,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... status_capacity_request_management_process');
  // await prisma.status_capacity_request_management_process.createMany({
  //   data: tempsTable?.status_capacity_request_management_process,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... release_capacity_status');
  // await prisma.release_capacity_status.createMany({
  //   data: tempsTable?.release_capacity_status,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... release_type');
  // await prisma.release_type.createMany({
  //   data: tempsTable?.release_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... type_concept_point');
  // await prisma.type_concept_point.createMany({
  //   data: tempsTable?.type_concept_point,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... query_shipper_nomination_type');
  // await prisma.query_shipper_nomination_type.createMany({
  //   data: tempsTable?.query_shipper_nomination_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... query_shipper_nomination_status');
  // await prisma.query_shipper_nomination_status.createMany({
  //   data: tempsTable?.query_shipper_nomination_status,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... query_shipper_nomination_file_renom');
  // await prisma.query_shipper_nomination_file_renom.createMany({
  //   data: tempsTable?.query_shipper_nomination_file_renom,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... query_shipper_nomination_type_comment');
  // await prisma.query_shipper_nomination_type_comment.createMany({
  //   data: tempsTable?.query_shipper_nomination_type_comment,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... daily_adjustment_status');
  // await prisma.daily_adjustment_status.createMany({
  //   data: tempsTable?.daily_adjustment_status,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... allocation_mode_type');
  // await prisma.allocation_mode_type.createMany({
  //   data: tempsTable?.allocation_mode_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... allocation_status');
  // await prisma.allocation_status.createMany({
  //   data: tempsTable?.allocation_status,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... curtailments_allocation_type');
  // await prisma.curtailments_allocation_type.createMany({
  //   data: tempsTable?.curtailments_allocation_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... hv_type');
  // await prisma.hv_type.createMany({
  //   data: tempsTable?.hv_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_status');
  // await prisma.event_status.createMany({
  //   data: tempsTable?.event_status,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_status');
  // await prisma.event_doc_status.createMany({
  //   data: tempsTable?.event_doc_status,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_master');
  // await prisma.event_doc_master.createMany({
  //   data: tempsTable?.event_doc_master,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_emer_type');
  // await prisma.event_doc_emer_type.createMany({
  //   data: tempsTable?.event_doc_emer_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_emer_gas_tranmiss');
  // await prisma.event_doc_emer_gas_tranmiss.createMany({
  //   data: tempsTable?.event_doc_emer_gas_tranmiss,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_emer_order');
  // await prisma.event_doc_emer_order.createMany({
  //   data: tempsTable?.event_doc_emer_order,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_ofo_type');
  // await prisma.event_doc_ofo_type.createMany({
  //   data: tempsTable?.event_doc_ofo_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_ofo_gas_tranmiss');
  // await prisma.event_doc_ofo_gas_tranmiss.createMany({
  //   data: tempsTable?.event_doc_ofo_gas_tranmiss,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_ofo_order');
  // await prisma.event_doc_ofo_order.createMany({
  //   data: tempsTable?.event_doc_ofo_order,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... event_doc_ofo_refer');
  // await prisma.event_doc_ofo_refer.createMany({
  //   data: tempsTable?.event_doc_ofo_refer,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... tariff_type_charge');
  // await prisma.tariff_type_charge.createMany({
  //   data: tempsTable?.tariff_type_charge,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... tariff_type');
  // await prisma.tariff_type.createMany({
  //   data: tempsTable?.tariff_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... tariff_invoice_sent');
  // await prisma.tariff_invoice_sent.createMany({
  //   data: tempsTable?.tariff_invoice_sent,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... tariff_type_ab');
  // await prisma.tariff_type_ab.createMany({
  //   data: tempsTable?.tariff_type_ab,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... tariff_credit_debit_note_type');
  // await prisma.tariff_credit_debit_note_type.createMany({
  //   data: tempsTable?.tariff_credit_debit_note_type,
  //   skipDuplicates: true, 
  // });
  // logger.log('Seeding... meter_concept_type');
  // await prisma.meter_concept_type.createMany({
  //   data: tempsTable?.meter_concept_type,
  //   skipDuplicates: true, 
  // });

}

main()
  .catch((e) => logger.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
