import { supabase } from '../supabase';
import { randomUUID } from 'crypto';
import { optimizeImage, type OptimizedImageResult, getStoragePaths } from './imageOptimizationService';

const BUCKET = 'branding-assets';

export async function ensureBucket(bucket: string): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === bucket)) return;
  const { error } = await supabase.storage.createBucket(bucket, { 
    public: false,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error) console.error('Bucket create error:', error.message);
}

export async function uploadFile(
  file: Buffer,
  originalName: string,
  contentType: string,
  folder: string = 'branding',
  bucket: string = BUCKET
): Promise<string | null> {
  await ensureBucket(bucket);
  const ext = originalName.split('.').pop() || 'png';
  const filename = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, file, { contentType, upsert: false });

  if (error) {
    console.error('Storage upload error:', error.message);
    return null;
  }

  const { data: signedUrl } = await supabase.storage.from(bucket).createSignedUrl(filename, 3600);
  return signedUrl?.signedUrl || null;
}

export async function uploadFileToStorage(
  file: Buffer,
  originalName: string,
  contentType: string,
  folder: string = 'branding',
  bucket: string = BUCKET
): Promise<string | null> {
  await ensureBucket(bucket);
  const ext = originalName.split('.').pop() || 'png';
  const filename = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, file, { contentType, upsert: false });

  if (error) {
    console.error('Storage upload error:', error.message);
    return null;
  }

  return filename;
}

export async function uploadImage(
  file: Buffer,
  originalName: string,
  contentType: string,
  folder: string = 'landing-images'
): Promise<{ paths: Record<string, string>; metadata: { width: number; height: number; mime: string; size: number; format: string } } | null> {
  await ensureBucket(BUCKET);

  const optimized = await optimizeImage(file, originalName);
  const paths = getStoragePaths(originalName, folder);

  const uploadPromises = Object.entries(optimized.variants).map(async ([key, buffer]) => {
    const path = paths[key] || paths.original;
    const ext = path.split('.').pop() || 'webp';
    const fullPath = `${folder}/${randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fullPath, buffer, { contentType: 'image/webp', upsert: false });

    if (error) {
      console.error(`Storage upload error for ${key}:`, error.message);
      return null;
    }

    const { data: signedUrl } = await supabase.storage.from(BUCKET).createSignedUrl(fullPath, 86400);
    return { key, path: fullPath, url: signedUrl?.signedUrl || null };
  });

  const results = await Promise.all(uploadPromises);
  const resultMap: Record<string, string> = {};

  for (const result of results) {
    if (result) {
      resultMap[result.key] = result.url || '';
    }
  }

  return {
    paths: resultMap,
    metadata: optimized.metadata,
  };
}

export async function deleteFile(path: string, bucket: string = BUCKET): Promise<boolean> {
  const bucketIndex = path.indexOf(`${bucket}/`);
  const relativePath = bucketIndex === -1 ? path : path.substring(bucketIndex + bucket.length + 1);
  if (!relativePath) return false;

  const { error } = await supabase.storage.from(bucket).remove([relativePath]);
  if (error) {
    console.error('Storage delete error:', error.message);
    return false;
  }
  return true;
}

export async function deleteImagePaths(paths: Record<string, string>, bucket: string = BUCKET): Promise<boolean> {
  const relativePaths = Object.values(paths)
    .filter(Boolean)
    .map(path => {
      const bucketIndex = path.indexOf(`${bucket}/`);
      if (bucketIndex === -1) return null;
      return path.substring(bucketIndex + bucket.length + 1);
    })
    .filter((p): p is string => p !== null);

  if (relativePaths.length === 0) return true;

  const { error } = await supabase.storage.from(bucket).remove(relativePaths);
  if (error) {
    console.error('Storage delete error:', error.message);
    return false;
  }
  return true;
}
