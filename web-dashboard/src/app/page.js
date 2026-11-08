import { getPublicAiSettingsFromDb } from '@/lib/aiSettingsStore';
import { listAllLeadsFromRepo } from '@/lib/leadsRepository';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Dashboard() {
  const [{ leads, categories }, initialCloudAiSettings] = await Promise.all([
    listAllLeadsFromRepo(),
    getPublicAiSettingsFromDb(),
  ]);

  return (
    <DashboardClient
      initialLeads={leads}
      categories={categories}
      initialCloudAiSettings={initialCloudAiSettings}
    />
  );
}
