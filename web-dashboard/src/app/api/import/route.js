import { NextResponse } from 'next/server';
import { openDb } from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = body.data || body.leads || [];
    const categoryName = body.categoryName || null;
    const sql = await openDb();

    // 1. Dapatkan atau buat kategori jika diisi manual
    let manualCatId = null;
    if (categoryName) {
      let cat = await sql`SELECT id FROM "Category" WHERE name = ${categoryName}`;

      if (cat.length === 0) {
        const result = await sql`INSERT INTO "Category" (name) VALUES (${categoryName}) RETURNING id`;
        manualCatId = result[0].id;
      } else {
        manualCatId = cat[0].id;
      }
    }

    // 2. Insert or update leads
    let insertedCount = 0;
    let updatedCount = 0;

    for (const lead of data) {
      const finalCategoryName = categoryName || lead.category;
      let finalCatId = manualCatId;

      if (!categoryName && finalCategoryName) {
        let c = await sql`SELECT id FROM "Category" WHERE name = ${finalCategoryName}`;
        if (c.length === 0) {
          const res = await sql`INSERT INTO "Category" (name) VALUES (${finalCategoryName}) RETURNING id`;
          finalCatId = res[0].id;
        } else {
          finalCatId = c[0].id;
        }
      }

      const aiResearchJson = lead.aiResearch
        ? (typeof lead.aiResearch === 'string' ? lead.aiResearch : JSON.stringify(lead.aiResearch))
        : null;

      // Cek apakah data sudah ada (mencegah duplikat berdasarkan nama dan alamat)
      const existing = await sql`
        SELECT id FROM "Lead" 
        WHERE name = ${lead.name} AND address = ${lead.address || ''} 
        LIMIT 1
      `;

      if (existing.length > 0) {
        // Update existing lead dengan data terbaru dari ekstensi
        await sql`
          UPDATE "Lead"
          SET 
            phone = COALESCE(NULLIF(${lead.phone || ''}, ''), phone),
            whatsapp = COALESCE(NULLIF(${lead.whatsapp || ''}, ''), whatsapp),
            website = ${lead.website || ''},
            "socialMedia" = COALESCE(NULLIF(${lead.socialMedia || ''}, ''), "socialMedia"),
            "onlineShop" = COALESCE(NULLIF(${lead.onlineShop || ''}, ''), "onlineShop"),
            "aiResearch" = COALESCE(${aiResearchJson}::jsonb, "aiResearch"),
            rating = COALESCE(NULLIF(${lead.rating || ''}, ''), rating),
            "reviewCount" = COALESCE(NULLIF(${lead.reviewCount || ''}, ''), "reviewCount"),
            "mapsUrl" = COALESCE(NULLIF(${lead.mapsUrl || ''}, ''), "mapsUrl"),
            "scrapedAt" = COALESCE(NULLIF(${lead.scrapedAt || ''}, ''), "scrapedAt")
          WHERE id = ${existing[0].id}
        `;
        updatedCount++;
      } else {
        await sql`
          INSERT INTO "Lead" (
            name, 
            address, 
            phone, 
            whatsapp,
            website, 
            "socialMedia",
            "onlineShop",
            "aiResearch",
            "mapsUrl", 
            "scrapedAt", 
            "categoryId", 
            rating, 
            "reviewCount",
            "chatStatus",
            "contactedAt"
          )
          VALUES (
            ${lead.name}, 
            ${lead.address || ''}, 
            ${lead.phone || ''}, 
            ${lead.whatsapp || ''},
            ${lead.website || ''}, 
            ${lead.socialMedia || ''},
            ${lead.onlineShop || ''},
            ${aiResearchJson}::jsonb,
            ${lead.mapsUrl || ''}, 
            ${lead.scrapedAt || new Date().toISOString()}, 
            ${finalCatId},
            ${lead.rating || ''},
            ${lead.reviewCount || ''},
            ${lead.chatStatus || 'BELUM'},
            ${lead.contactedAt || null}
          )
        `;
        insertedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted: insertedCount,
      updated: updatedCount,
      total: insertedCount + updatedCount
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
