import type { Env } from './env';
import { getSql } from './db';
import { ensureProductHelp } from './product-help-migrate';
import { replaceDocumentRoles, withProductHelp } from './product-help';
import { TASKGO_HELP_DOCS, TASKGO_HELP_ORIGINS } from './taskgo-help-docs';

export async function applyTaskgoHelpSeed(env: Env, actorUserId?: string | null): Promise<{
  upserted: string[];
  created: number;
  updated: number;
  origins: string[];
}> {
  await ensureProductHelp(env);

  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const brandRows = await sql`SELECT id FROM brands WHERE slug = 'taskgo' LIMIT 1`;
    const brandId = (brandRows[0] as { id?: string } | undefined)?.id;
    if (!brandId) throw new Error('找不到 TaskGo 品牌');

    const origins: string[] = [];
    for (const origin of TASKGO_HELP_ORIGINS) {
      await sql`
        INSERT INTO product_help_origins (brand_id, origin)
        VALUES (${brandId}::uuid, ${origin})
        ON CONFLICT (brand_id, origin) DO NOTHING
      `;
      origins.push(origin);
    }

    const upserted: string[] = [];
    let created = 0;
    let updated = 0;

    for (const doc of TASKGO_HELP_DOCS) {
      const existing = await sql`
        SELECT id FROM cs_knowledge_documents
        WHERE brand_id = ${brandId}::uuid
          AND (file_name = ${doc.fileName} OR title = ${doc.title})
        ORDER BY CASE WHEN file_name = ${doc.fileName} THEN 0 ELSE 1 END
        LIMIT 1
      `;
      const existingId = (existing[0] as { id?: string } | undefined)?.id;
      const pagePaths = JSON.stringify(doc.pagePaths);

      if (!existingId) {
        const inserted = await sql`
          INSERT INTO cs_knowledge_documents (
            brand_id, title, file_name, mime_type, extracted_text,
            extract_status, publish_status, page_paths,
            uploaded_by, published_by, published_at
          ) VALUES (
            ${brandId}::uuid, ${doc.title}, ${doc.fileName}, 'text/markdown', ${doc.text},
            'ready', 'published', ${pagePaths}::jsonb,
            ${actorUserId ?? null}, ${actorUserId ?? null}, now()
          ) RETURNING id
        `;
        const id = String((inserted[0] as { id: string }).id);
        await replaceDocumentRoles(env, id, doc.roles);
        created += 1;
        upserted.push(doc.title);
        continue;
      }

      await sql`
        UPDATE cs_knowledge_documents SET
          title = ${doc.title},
          file_name = ${doc.fileName},
          mime_type = 'text/markdown',
          extracted_text = ${doc.text},
          extract_status = 'ready',
          publish_status = 'published',
          page_paths = ${pagePaths}::jsonb,
          published_by = COALESCE(published_by, ${actorUserId ?? null}),
          published_at = COALESCE(published_at, now())
        WHERE id = ${existingId}::uuid AND brand_id = ${brandId}::uuid
      `;
      await replaceDocumentRoles(env, existingId, doc.roles);
      updated += 1;
      upserted.push(doc.title);
    }

    return { upserted, created, updated, origins };
  });
}
