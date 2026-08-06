import { supabase } from '../supabase';
import { randomUUID } from 'crypto';

const BUCKET = 'branding-assets';

export async function ensureBucket(bucket: string): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === bucket)) return;
  const { error } = await supabase.storage.createBucket(bucket, { 
    public: false,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'],
    fileSizeLimit: 5 * 1024 * 1024,
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

export async function deleteFile(path: string, bucket: string = BUCKET): Promise<boolean> {
  // Extract relative path from URL
  const bucketIndex = path.indexOf(`${bucket}/`);
  if (bucketIndex === -1) return false;
  const relativePath = path.substring(bucketIndex + bucket.length + 1);

  const { error } = await supabase.storage.from(bucket).remove([relativePath]);
  if (error) {
    console.error('Storage delete error:', error.message);
    return false;
  }
  return true;
}
