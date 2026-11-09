import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUTOPILOT_STATE,
  readAutopilotStateFromStore,
  saveAutopilotStateToStore,
  readAutopilotOutboxFromStore,
  saveAutopilotOutboxToStore,
} from './autopilotStore.js';

test('autopilotStore reads defaults and updates state in memory SQL store', async () => {
  const fakeTable = new Map();

  const mockSql = async (strings, ...values) => {
    const query = strings.join(' ').trim();
    if (query.startsWith('CREATE TABLE')) {
      return [];
    }
    if (query.startsWith('SELECT value')) {
      const key = values[0];
      if (!fakeTable.has(key)) return [];
      return [fakeTable.get(key)];
    }
    if (query.startsWith('INSERT INTO "AppSetting"')) {
      const key = values[0];
      const valJson = values[1];
      const row = {
        value: JSON.parse(valJson),
        updatedAt: '2026-11-09T03:30:00.000Z',
      };
      fakeTable.set(key, row);
      return [{ updatedAt: row.updatedAt }];
    }
    return [];
  };

  const initial = await readAutopilotStateFromStore({ sqlImpl: mockSql });
  assert.equal(initial.enabled, false);
  assert.equal(initial.startHourWib, 7);
  assert.equal(initial.endHourWib, 13);

  await saveAutopilotStateToStore(
    {
      enabled: true,
      sentTodayCount: 5,
      targetQuery: 'Sablon Kaos Depok',
    },
    { sqlImpl: mockSql }
  );

  const updated = await readAutopilotStateFromStore({ sqlImpl: mockSql });
  assert.equal(updated.enabled, true);
  assert.equal(updated.sentTodayCount, 5);
  assert.equal(updated.targetQuery, 'Sablon Kaos Depok');
});

test('autopilotStore reads and saves outbox queue in memory SQL store', async () => {
  const fakeTable = new Map();

  const mockSql = async (strings, ...values) => {
    const query = strings.join(' ').trim();
    if (query.startsWith('CREATE TABLE')) {
      return [];
    }
    if (query.startsWith('SELECT value')) {
      const key = values[0];
      if (!fakeTable.has(key)) return [];
      return [fakeTable.get(key)];
    }
    if (query.startsWith('INSERT INTO "AppSetting"')) {
      const key = values[0];
      const valJson = values[1];
      const row = {
        value: JSON.parse(valJson),
        updatedAt: '2026-11-09T03:30:00.000Z',
      };
      fakeTable.set(key, row);
      return [{ updatedAt: row.updatedAt }];
    }
    return [];
  };

  const initialOutbox = await readAutopilotOutboxFromStore({ sqlImpl: mockSql });
  assert.deepEqual(initialOutbox, { queue: [] });

  const payload = {
    latest: { jobId: 'job_123', leadId: '101' },
    queue: [{ jobId: 'job_123', leadId: '101' }],
  };
  await saveAutopilotOutboxToStore(payload, { sqlImpl: mockSql });

  const updatedOutbox = await readAutopilotOutboxFromStore({ sqlImpl: mockSql });
  assert.equal(updatedOutbox.latest.jobId, 'job_123');
  assert.equal(updatedOutbox.queue.length, 1);
});

