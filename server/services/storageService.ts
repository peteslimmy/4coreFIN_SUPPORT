import { supabase } from '../supabase';
import { randomUUID } from 'crypto';
import { optimizeImage, type OptimizedImageResult, getStoragePaths } from './imageOptimizationService';

const BUCKET = 'branding-assets';

/** Signed-URL lifetime for evidence downloads (24h). */
export const EVIDENCE_SIGNED_URL_TTL_SECONDS = 86400;

/**
 * Extract the object path from an existing Supabase signed URL so a fresh
 * signature can be issued after the old one expires.
 */
function extractSignedPath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/sign/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  const end = url.indexOf('?', start);
  const path = end === -1 ? url.substring(start) : url.substring(start, end);
  return decodeURIComponent(path) || null;
}

/**
 * Issue fresh signed URLs for a batch of stored (possibly expired) signed URLs.
 * Returns one entry per input, in order: a refreshed URL when the path could be
 * recovered, otherwise the original value unchanged.
 */
export async function refreshSignedUrls(
  urls: (string | null | undefined)[],
  bucket: string = BUCKET,
): Promise<string[]> {
  const paths = urls.map(u => (u ? extractSignedPath(u, bucket) : null));
  const results: string[] = urls.map(u => u || '');
  const pending = new Map<number, string>();
  paths.forEach((p, i) => { if (p) pending.set(i, p); });
  if (pending.size === 0) return results;
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(Array.from(pending.values()), EVIDENCE_SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      console.error('Signed URL refresh error:', error?.message);
      return results;
    }
    const byPath = new Map(data.map(d => [d.path, d.signedUrl] as const));
    pending.forEach((path, i) => {
      const fresh = byPath.get(path);
      if (fresh) results[i] = fresh;
    });
  } catch (err) {
    console.error('Signed URL refresh failed:', err);
  }
  return results;
}

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

  const { data: signedUrl } = await supabase.storage.from(bucket).createSignedUrl(filename, EVIDENCE_SIGNED_URL_TTL_SECONDS);
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
