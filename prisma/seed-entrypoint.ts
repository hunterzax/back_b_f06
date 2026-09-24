import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

type SeedStep = {
  jsonKey: string;
  delegate: string;
};

const logger = new Logger('SeedEntrypoint');
const prisma = new PrismaClient();

const DEFAULT_IGNORED_TABLES = new Set([
  'account',
  'account_manage',
  'account_role',
  'role',
  'role_default',
  'group',
  'division',
  'menus_config',
  't_and_c',
  'zone',
]);

const SEED_STEPS: SeedStep[] = [
  { jsonKey: 'type_account', delegate: 'type_account' },
  { jsonKey: 'mode_account', delegate: 'mode_account' },
  { jsonKey: 'user_type', delegate: 'user_type' },
  { jsonKey: 'bank_master', delegate: 'bank_master' },
  { jsonKey: 'column_table', delegate: 'column_table' },
  { jsonKey: 'column_field', delegate: 'column_field' },
  { jsonKey: 'column_table_config_tso_group', delegate: 'column_table_config' },
  { jsonKey: 'column_table_config_shipper_group', delegate: 'column_table_config' },
  { jsonKey: 'column_table_config_other_group', delegate: 'column_table_config' },
  { jsonKey: 'column_table_config_division', delegate: 'column_table_config' },
  { jsonKey: 'column_table_config_system_login', delegate: 'column_table_config' },
  { jsonKey: 'column_table_config_users', delegate: 'column_table_config' },
  { jsonKey: 'menus', delegate: 'menus' },
  { jsonKey: 'entry_exit', delegate: 'entry_exit' },
  { jsonKey: 'sub_system_parameter', delegate: 'sub_system_parameter' },
  { jsonKey: 'sub_email_notification_management', delegate: 'sub_email_notification_management' },
  { jsonKey: 'term_type', delegate: 'term_type' },
  { jsonKey: 'process_type', delegate: 'process_type' },
  { jsonKey: 'status_capacity_request_management', delegate: 'status_capacity_request_management' },
  { jsonKey: 'status_capacity_request_management_process', delegate: 'status_capacity_request_management_process' },
  { jsonKey: 'release_capacity_status', delegate: 'release_capacity_status' },
  { jsonKey: 'release_type', delegate: 'release_type' },
  { jsonKey: 'type_concept_point', delegate: 'type_concept_point' },
  { jsonKey: 'query_shipper_nomination_type', delegate: 'query_shipper_nomination_type' },
  { jsonKey: 'query_shipper_nomination_status', delegate: 'query_shipper_nomination_status' },
  { jsonKey: 'query_shipper_nomination_file_renom', delegate: 'query_shipper_nomination_file_renom' },
  { jsonKey: 'query_shipper_nomination_type_comment', delegate: 'query_shipper_nomination_type_comment' },
  { jsonKey: 'daily_adjustment_status', delegate: 'daily_adjustment_status' },
  { jsonKey: 'allocation_mode_type', delegate: 'allocation_mode_type' },
  { jsonKey: 'allocation_status', delegate: 'allocation_status' },
  { jsonKey: 'curtailments_allocation_type', delegate: 'curtailments_allocation_type' },
  { jsonKey: 'hv_type', delegate: 'hv_type' },
  { jsonKey: 'event_status', delegate: 'event_status' },
  { jsonKey: 'event_doc_status', delegate: 'event_doc_status' },
  { jsonKey: 'event_doc_master', delegate: 'event_doc_master' },
  { jsonKey: 'event_doc_emer_type', delegate: 'event_doc_emer_type' },
  { jsonKey: 'event_doc_emer_gas_tranmiss', delegate: 'event_doc_emer_gas_tranmiss' },
  { jsonKey: 'event_doc_emer_order', delegate: 'event_doc_emer_order' },
  { jsonKey: 'event_doc_ofo_type', delegate: 'event_doc_ofo_type' },
  { jsonKey: 'event_doc_ofo_gas_tranmiss', delegate: 'event_doc_ofo_gas_tranmiss' },
  { jsonKey: 'event_doc_ofo_order', delegate: 'event_doc_ofo_order' },
  { jsonKey: 'event_doc_ofo_refer', delegate: 'event_doc_ofo_refer' },
  { jsonKey: 'tariff_type_charge', delegate: 'tariff_type_charge' },
  { jsonKey: 'tariff_type', delegate: 'tariff_type' },
  { jsonKey: 'tariff_invoice_sent', delegate: 'tariff_invoice_sent' },
  { jsonKey: 'tariff_type_ab', delegate: 'tariff_type_ab' },
  { jsonKey: 'tariff_credit_debit_note_type', delegate: 'tariff_credit_debit_note_type' },
  { jsonKey: 'meter_concept_type', delegate: 'meter_concept_type' },
];

function resolveIgnoredTables(): Set<string> {
  const ignoredTables = new Set(DEFAULT_IGNORED_TABLES);
  const envValue = process.env.SEED_IGNORE_TABLES ?? '';

  for (const tableName of envValue.split(',')) {
    const normalized = tableName.trim();
    if (normalized.length > 0) {
      ignoredTables.add(normalized);
    }
  }

  return ignoredTables;
}

function readTempsTable(): Record<string, unknown> | null {
  const tempsTablePath = path.join(process.cwd(), 'public', 'temps-table.json');

  if (!fs.existsSync(tempsTablePath)) {
    logger.log(`[INFO][seedEntrypoint]: temps-table.json missing, skip seeding. path=${tempsTablePath}`);
    return null;
  }

  const fileContent = fs.readFileSync(tempsTablePath, 'utf8');
  return JSON.parse(fileContent) as Record<string, unknown>;
}

async function seedStep(
  tempsTable: Record<string, unknown>,
  ignoredTables: Set<string>,
  step: SeedStep,
): Promise<{ status: 'seeded' | 'skipped'; insertedCount: number }> {
  if (ignoredTables.has(step.jsonKey)) {
    logger.log(`[INFO][seedEntrypoint]: skip ignored table. key=${step.jsonKey} delegate=${step.delegate}`);
    return { status: 'skipped', insertedCount: 0 };
  }

  const rawData = tempsTable[step.jsonKey];
  if (!Array.isArray(rawData) || rawData.length === 0) {
    logger.log(`[INFO][seedEntrypoint]: skip empty or missing data. key=${step.jsonKey} delegate=${step.delegate}`);
    return { status: 'skipped', insertedCount: 0 };
  }

  const delegate = (prisma as unknown as Record<string, { createMany?: (args: { data: unknown[]; skipDuplicates: boolean }) => Promise<{ count: number }> }>)[step.delegate];
  if (!delegate?.createMany) {
    logger.log(`[INFO][seedEntrypoint]: skip unmapped delegate. key=${step.jsonKey} delegate=${step.delegate}`);
    return { status: 'skipped', insertedCount: 0 };
  }

  logger.log(`[INFO][seedEntrypoint]: seeding start. key=${step.jsonKey} delegate=${step.delegate} rows=${rawData.length}`);
  const result = await delegate.createMany({
    data: rawData,
    skipDuplicates: true,
  });
  logger.log(`[INFO][seedEntrypoint]: seeding done. key=${step.jsonKey} delegate=${step.delegate} inserted=${result.count}`);

  return { status: 'seeded', insertedCount: result.count };
}

async function main() {
  dotenv.config();

  const tempsTable = readTempsTable();
  if (!tempsTable) {
    return;
  }

  const ignoredTables = resolveIgnoredTables();
  logger.log(`[INFO][seedEntrypoint]: start temp seeding. ignored=${Array.from(ignoredTables).sort().join(',')}`);

  let seededSteps = 0;
  let skippedSteps = 0;
  let insertedRows = 0;

  for (const step of SEED_STEPS) {
    const result = await seedStep(tempsTable, ignoredTables, step);
    insertedRows += result.insertedCount;

    if (result.status === 'seeded') {
      seededSteps += 1;
    } else {
      skippedSteps += 1;
    }
  }

  logger.log(`[INFO][seedEntrypoint]: temp seeding completed. seeded_steps=${seededSteps} skipped_steps=${skippedSteps} inserted_rows=${insertedRows}`);
}

main()
  .catch((error) => {
    logger.error(`[ERROR][seedEntrypoint]: temp seeding failed. message=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
