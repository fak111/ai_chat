import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';

export interface StorageService {
  upload(key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  cdnUrl: string;
  socksProxy?: string;
}

export class R2StorageService implements StorageService {
  private client: S3Client;
  private bucket: string;
  private cdnUrl: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.cdnUrl = config.cdnUrl.replace(/\/$/, '');

    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.cdnUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

export class LocalStorageService implements StorageService {
  private basePath: string;

  constructor(basePath = 'storage/uploads') {
    this.basePath = path.resolve(basePath);
  }

  async upload(key: string, body: Buffer, _contentType: string): Promise<string> {
    const filePath = path.join(this.basePath, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return `/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    await unlink(filePath);
  }
}

export function createStorageService(): StorageService {
  if (process.env.R2_ACCESS_KEY_ID) {
    return new R2StorageService({
      endpoint: process.env.R2_ENDPOINT || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucket: process.env.R2_BUCKET_NAME || 'abao-storage',
      cdnUrl: process.env.R2_CDN_URL || 'https://cdn.swjip.asia',
      socksProxy: process.env.SOCKS_PROXY,
    });
  }
  return new LocalStorageService();
}

export const storageService = createStorageService();
