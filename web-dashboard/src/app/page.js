import { openDb } from '@/lib/db';
import { getPublicAiSettingsFromDb } from '@/lib/aiSettingsStore';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Dashboard() {
  const sql = await openDb();

  const [leads, categories, initialCloudAiSettings] = await Promise.all([
    sql`
      SELECT 
        l.id, 
        l.name, 
        l.address, 
        l.phone, 
        l.whatsapp,
        l.website, 
        l."socialMedia",
        l."onlineShop",
        l."aiResearch",
        l."mapsUrl", 
        l."scrapedAt", 
        l.rating,
        l."reviewCount",
        COALESCE(l."chatStatus", 'BELUM') as "chatStatus",
        l."contactedAt",
        c.name as "categoryName"
      FROM "Lead" l
      LEFT JOIN "Category" c ON l."categoryId" = c.id
      ORDER BY l."scrapedAt" DESC, l.id DESC
    `,
    sql`SELECT * FROM "Category" ORDER BY name`,
    getPublicAiSettingsFromDb({ sqlImpl: sql }),
  ]);

  return (
    <DashboardClient
      initialLeads={leads}
      categories={categories}
      initialCloudAiSettings={initialCloudAiSettings}
    />
  );
}
