import { neon } from '@neondatabase/serverless';

export function hasValidDatabaseUrl(rawUrl = process.env.DATABASE_URL) {
  const clean = String(rawUrl || '').trim();
  return (
    /^postgres(?:ql)?:\/\/.+/i.test(clean) &&
    !clean.includes('ep-fake.us-east-2.aws.neon.tech')
  );
}

// Ambil URL database dari Environment Variables
const url = hasValidDatabaseUrl()
  ? String(process.env.DATABASE_URL).trim()
  : 'postgres://user:pass@ep-fake.us-east-2.aws.neon.tech/dbname';
const sql = neon(url);

export async function openDb() {
  return sql;
}
