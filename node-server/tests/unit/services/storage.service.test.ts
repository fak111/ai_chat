import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @aws-sdk/client-s3
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'PutObject' })),
    DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'DeleteObject' })),
  };
});

// Mock fs/promises
const mockWriteFile = vi.fn();
const mockUnlink = vi.fn();
const mockMkdir = vi.fn();
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
  mkdir: mockMkdir,
}));

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('R2StorageService', () => {
    let r2Service: any;

    beforeEach(async () => {
      const { R2StorageService } = await import('../../../src/services/storage.service.js');
      r2Service = new R2StorageService({
        endpoint: 'https://account.r2.cloudflarestorage.com',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucket: 'test-bucket',
        cdnUrl: 'https://cdn.swjip.asia',
      });
    });

    it('upload 返回 CDN URL', async () => {
      mockSend.mockResolvedValueOnce({});
      const url = await r2Service.upload('avatars/test.jpg', Buffer.from('img'), 'image/jpeg');
      expect(url).toBe('https://cdn.swjip.asia/avatars/test.jpg');
    });

    it('upload 调用 S3 PutObjectCommand', async () => {
      mockSend.mockResolvedValueOnce({});
      await r2Service.upload('avatars/test.jpg', Buffer.from('img'), 'image/jpeg');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'avatars/test.jpg',
        Body: Buffer.from('img'),
        ContentType: 'image/jpeg',
      });
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('delete 调用 DeleteObjectCommand', async () => {
      mockSend.mockResolvedValueOnce({});
      await r2Service.delete('avatars/test.jpg');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'avatars/test.jpg',
      });
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('upload 失败抛异常', async () => {
      mockSend.mockRejectedValueOnce(new Error('R2 error'));
      await expect(r2Service.upload('avatars/test.jpg', Buffer.from('img'), 'image/jpeg'))
        .rejects.toThrow('R2 error');
    });
  });

  describe('LocalStorageService', () => {
    let localService: any;

    beforeEach(async () => {
      const { LocalStorageService } = await import('../../../src/services/storage.service.js');
      localService = new LocalStorageService();
    });

    it('upload 写文件返回相对路径', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      const url = await localService.upload('avatars/test.jpg', Buffer.from('img'), 'image/jpeg');
      expect(url).toBe('/uploads/avatars/test.jpg');
    });

    it('delete 调用 unlink', async () => {
      mockUnlink.mockResolvedValueOnce(undefined);
      await localService.delete('avatars/test.jpg');
      expect(mockUnlink).toHaveBeenCalledOnce();
    });
  });

  describe('createStorageService', () => {
    it('R2_ACCESS_KEY_ID 存在时返回 R2StorageService', async () => {
      const original = process.env;
      process.env = {
        ...original,
        R2_ACCESS_KEY_ID: 'test-key',
        R2_SECRET_ACCESS_KEY: 'test-secret',
        R2_BUCKET_NAME: 'test-bucket',
        R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        R2_CDN_URL: 'https://cdn.swjip.asia',
      };

      // Re-import to pick up env vars
      vi.resetModules();
      // Re-mock after resetModules
      vi.doMock('@aws-sdk/client-s3', () => ({
        S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
        PutObjectCommand: vi.fn(),
        DeleteObjectCommand: vi.fn(),
      }));
      vi.doMock('fs/promises', () => ({
        writeFile: vi.fn(),
        unlink: vi.fn(),
        mkdir: vi.fn(),
      }));

      const { createStorageService, R2StorageService } = await import('../../../src/services/storage.service.js');
      const service = createStorageService();
      expect(service).toBeInstanceOf(R2StorageService);

      process.env = original;
    });

    it('R2_ACCESS_KEY_ID 不存在时返回 LocalStorageService', async () => {
      const original = process.env;
      process.env = { ...original };
      delete process.env.R2_ACCESS_KEY_ID;

      vi.resetModules();
      vi.doMock('@aws-sdk/client-s3', () => ({
        S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
        PutObjectCommand: vi.fn(),
        DeleteObjectCommand: vi.fn(),
      }));
      vi.doMock('fs/promises', () => ({
        writeFile: vi.fn(),
        unlink: vi.fn(),
        mkdir: vi.fn(),
      }));

      const { createStorageService, LocalStorageService } = await import('../../../src/services/storage.service.js');
      const service = createStorageService();
      expect(service).toBeInstanceOf(LocalStorageService);

      process.env = original;
    });
  });
});
