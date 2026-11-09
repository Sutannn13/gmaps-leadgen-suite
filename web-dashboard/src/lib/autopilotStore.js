import fs from 'node:fs/promises';
import path from 'node:path';
import { openDb } from './db.js';

export const DEFAULT_AUTOPILOT_STATE = {
  enabled: false,
  startHourWib: 7,
  endHourWib: 13,
  maxDailyQuota: 20,
  sentTodayCount: 0,
  sentDateKey: '',
  targetQuery: 'Sablon Kaos Depok, Konveksi Kabupaten Bogor, Bengkel Mobil Cibinong',
  waBridgeStatus: 'READY',
  currentAction: 'Menunggu tombol "Otomatisasikan Calon Client" diaktifkan.',
  lastTriggeredAt: null,
  updatedAt: null,
  activityLogs: [],
};

const STATE_ROW_KEY = 'autopilot_state';
const OUTBOX_ROW_KEY = 'autopilot_outbox';
let tableEnsured = false;

async function ensureAppSettingTable(sql) {
  if (tableEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  tableEnsured = true;
}

function getStorePaths() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const agentsDir = path.join(repoRoot, '.agents');
  return {
    agentsDir,
    statePath: path.join(agentsDir, 'autopilot-state.json'),
    outboxPath: path.join(agentsDir, 'autopilot-outbox.json'),
    tmpStatePath: path.join('/tmp', 'autopilot-state.json'),
    tmpOutboxPath: path.join('/tmp', 'autopilot-outbox.json'),
  };
}

async function safeWriteJsonFile(targetPath, fallbackTmpPath, data) {
  const content = JSON.stringify(data, null, 2);
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    return;
  } catch (err) {
    if (fallbackTmpPath && (err.code === 'EROFS' || err.code === 'EACCES')) {
      try {
        await fs.mkdir(path.dirname(fallbackTmpPath), { recursive: true });
        await fs.writeFile(fallbackTmpPath, content, 'utf8');
      } catch {
        // Silently catch tmp write error when durable database takes precedence
      }
    }
  }
}

async function safeReadJsonFile(targetPath, fallbackTmpPath) {
  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    if (fallbackTmpPath) {
      try {
        const tmpRaw = await fs.readFile(fallbackTmpPath, 'utf8');
        return JSON.parse(tmpRaw);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function readAutopilotStateFromStore({ sqlImpl } = {}) {
  if (sqlImpl || process.env.DATABASE_URL) {
    try {
      const sql = sqlImpl || (await openDb());
      await ensureAppSettingTable(sql);
      const rows = await sql`
        SELECT value, "updatedAt"
        FROM "AppSetting"
        WHERE key = ${STATE_ROW_KEY}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const raw = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        return {
          ...DEFAULT_AUTOPILOT_STATE,
          ...(raw && typeof raw === 'object' ? raw : {}),
          activityLogs: Array.isArray(raw?.activityLogs) ? raw.activityLogs.slice(0, 30) : [],
        };
      }
    } catch (err) {
      console.warn('Neon DB unreachable for autopilot state, falling back to file store:', err?.message);
    }
  }

  const { statePath, tmpStatePath } = getStorePaths();
  const fileData = await safeReadJsonFile(statePath, tmpStatePath);
  return {
    ...DEFAULT_AUTOPILOT_STATE,
    ...(fileData && typeof fileData === 'object' ? fileData : {}),
    activityLogs: Array.isArray(fileData?.activityLogs) ? fileData.activityLogs.slice(0, 30) : [],
  };
}

export async function saveAutopilotStateToStore(nextState, { sqlImpl } = {}) {
  const sanitized = {
    ...DEFAULT_AUTOPILOT_STATE,
    ...(nextState && typeof nextState === 'object' ? nextState : {}),
    updatedAt: new Date().toISOString(),
  };

  if (sqlImpl || process.env.DATABASE_URL) {
    try {
      const sql = sqlImpl || (await openDb());
      await ensureAppSettingTable(sql);
      const payloadJson = JSON.stringify(sanitized);
      await sql`
        INSERT INTO "AppSetting" (key, value, "updatedAt")
        VALUES (${STATE_ROW_KEY}, ${payloadJson}::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            "updatedAt" = CURRENT_TIMESTAMP
      `;
    } catch (err) {
      console.warn('Neon DB failed to persist autopilot state:', err?.message);
    }
  }

  const { statePath, tmpStatePath } = getStorePaths();
  await safeWriteJsonFile(statePath, tmpStatePath, sanitized);
  return sanitized;
}

export async function readAutopilotOutboxFromStore({ sqlImpl } = {}) {
  if (sqlImpl || process.env.DATABASE_URL) {
    try {
      const sql = sqlImpl || (await openDb());
      await ensureAppSettingTable(sql);
      const rows = await sql`
        SELECT value
        FROM "AppSetting"
        WHERE key = ${OUTBOX_ROW_KEY}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const raw = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        return raw && typeof raw === 'object' ? raw : { queue: [] };
      }
    } catch (err) {
      console.warn('Neon DB unreachable for autopilot outbox:', err?.message);
    }
  }

  const { outboxPath, tmpOutboxPath } = getStorePaths();
  const fileData = await safeReadJsonFile(outboxPath, tmpOutboxPath);
  return fileData && typeof fileData === 'object' ? fileData : { queue: [] };
}

export async function saveAutopilotOutboxToStore(nextOutbox, { sqlImpl } = {}) {
  const sanitized = nextOutbox && typeof nextOutbox === 'object' ? nextOutbox : { queue: [] };

  if (sqlImpl || process.env.DATABASE_URL) {
    try {
      const sql = sqlImpl || (await openDb());
      await ensureAppSettingTable(sql);
      const payloadJson = JSON.stringify(sanitized);
      await sql`
        INSERT INTO "AppSetting" (key, value, "updatedAt")
        VALUES (${OUTBOX_ROW_KEY}, ${payloadJson}::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            "updatedAt" = CURRENT_TIMESTAMP
      `;
    } catch (err) {
      console.warn('Neon DB failed to persist autopilot outbox:', err?.message);
    }
  }

  const { outboxPath, tmpOutboxPath } = getStorePaths();
  await safeWriteJsonFile(outboxPath, tmpOutboxPath, sanitized);
  return sanitized;
}

