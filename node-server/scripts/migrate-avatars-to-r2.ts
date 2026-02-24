/**
 * 迁移本地头像到 R2 存储
 *
 * 使用方式：
 *   R2_ACCESS_KEY_ID=xxx R2_SECRET_ACCESS_KEY=xxx npx tsx scripts/migrate-avatars-to-r2.ts
 *
 * 前提：
 *   - R2 bucket 已创建且 CDN 域名已配置
 *   - 数据库可访问（通过环境变量 DATABASE_* 配置）
 */
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';

const { Pool } = pg;

const R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://1c2133fce297f20f4ede90e3543468dd.r2.cloudflarestorage.com';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'abao-storage';
const R2_CDN_URL = (process.env.R2_CDN_URL || 'https://cdn.swjip.asia').replace(/\/$/, '');
const STORAGE_BASE = path.resolve(process.env.STORAGE_BASE || 'storage/uploads');

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'abao',
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
});

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function main() {
  console.log('Querying users with local avatar URLs...');

  const result = await pool.query(
    "SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/uploads/avatars/%'",
  );

  console.log(`Found ${result.rows.length} users to migrate.`);

  let success = 0;
  let failed = 0;

  for (const row of result.rows) {
    const relativePath = row.avatar_url; // e.g. /uploads/avatars/uuid.png
    const filename = path.basename(relativePath);
    const localPath = path.join(STORAGE_BASE, 'avatars', filename);

    if (!fs.existsSync(localPath)) {
      console.warn(`  SKIP: ${row.id} — file not found: ${localPath}`);
      failed++;
      continue;
    }

    const ext = path.extname(filename);
    const key = `avatars/${filename}`;

    try {
      const body = fs.readFileSync(localPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: getMimeType(ext),
        }),
      );

      const cdnUrl = `${R2_CDN_URL}/${key}`;
      await pool.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [
        cdnUrl,
        row.id,
      ]);

      console.log(`  OK: ${row.id} → ${cdnUrl}`);
      success++;
    } catch (err: any) {
      console.error(`  FAIL: ${row.id} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
