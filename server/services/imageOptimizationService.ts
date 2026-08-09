import sharp from 'sharp';
import type { Metadata as SharpMetadata } from 'sharp';
import { randomUUID } from 'crypto';

export interface ImageVariant {
  suffix: string;
  width: number;
  quality: number;
  maxSizeBytes: number;
}

export const IMAGE_VARIANTS: ImageVariant[] = [
  { suffix: '', width: 1920, quality: 85, maxSizeBytes: 200 * 1024 },
  { suffix: '.desktop', width: 1920, quality: 80, maxSizeBytes: 150 * 1024 },
  { suffix: '.tablet', width: 768, quality: 75, maxSizeBytes: 80 * 1024 },
  { suffix: '.mobile', width: 375, quality: 70, maxSizeBytes: 50 * 1024 },
  { suffix: '.thumbnail', width: 200, quality: 60, maxSizeBytes: 20 * 1024 },
];

export interface ImageMetadata {
  width: number;
  height: number;
  mime: string;
  size: number;
  format: string;
}

export interface OptimizedImageResult {
  original: Buffer;
  variants: Record<string, Buffer>;
  metadata: ImageMetadata;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 8192;

export function validateImage(buffer: Buffer, fileName: string): { valid: boolean; error?: string } {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const allowedExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg']);

  if (!ext || !allowedExts.has(ext)) {
    return { valid: false, error: `Unsupported file extension: .${ext}` };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  const header = buffer.slice(0, 8);
  const hexHeader = header.toString('hex');

  const signatureMap: Record<string, string[]> = {
    'image/jpeg': ['ffd8ff'],
    'image/png': ['89504e470d0a1a0a'],
    'image/webp': ['52494646'],
    'image/svg+xml': ['3c3f786d6c', '3c737667'],
  };

  const detectedMime = Object.entries(signatureMap).find(([, sigs]) =>
    sigs.some(sig => hexHeader.startsWith(sig))
  );

  if (!detectedMime) {
    return { valid: false, error: 'File does not match a valid image signature' };
  }

  return { valid: true };
}

export async function optimizeImage(buffer: Buffer, fileName: string): Promise<OptimizedImageResult> {
  const validation = validateImage(buffer, fileName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  const isSvg = ext === 'svg';

  let metadata: SharpMetadata;
  let originalBuffer: Buffer;

  if (isSvg) {
    metadata = { width: 0, height: 0, format: 'svg' } as SharpMetadata;
    originalBuffer = buffer;
  } else {
    const image = sharp(buffer);
    metadata = await image.metadata();
    originalBuffer = buffer;
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`Image dimensions too large: ${width}x${height} (max ${MAX_DIMENSION}x${MAX_DIMENSION})`);
  }

  const formatToMime: Record<string, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    gif: 'image/gif',
    tiff: 'image/tiff',
    avif: 'image/avif',
  };

  const mime = metadata.format ? formatToMime[metadata.format] || 'image/png' : 'image/png';

  const result: OptimizedImageResult = {
    original: buffer,
    variants: {},
    metadata: {
      width,
      height,
      mime,
      size: buffer.length,
      format: metadata.format || 'unknown',
    },
  };

  if (isSvg) {
    result.variants[''] = buffer;
    result.variants['.desktop'] = buffer;
    result.variants['.tablet'] = buffer;
    result.variants['.mobile'] = buffer;
    result.variants['.thumbnail'] = buffer;
    return result;
  }

  for (const variant of IMAGE_VARIANTS) {
    try {
      let processed = sharp(buffer);

      if (variant.width > 0 && width > variant.width) {
        processed = processed.resize({ width: variant.width, withoutEnlargement: true });
      }

      const optimized = await processed
        .webp({ quality: variant.quality, effort: 6 })
        .toBuffer();

      let finalBuffer = optimized;
      if (optimized.length > variant.maxSizeBytes) {
        const reducer = sharp(buffer);
        finalBuffer = await reducer
          .resize({ width: variant.width, withoutEnlargement: true })
          .webp({ quality: Math.max(40, variant.quality - 15), effort: 6 })
          .toBuffer();
      }

      const key = variant.suffix || 'original';
      result.variants[key] = finalBuffer;
    } catch (e) {
      console.error(`Error optimizing variant ${variant.suffix || 'original'}:`, e);
    }
  }

  return result;
}

export function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'png';
  return `${randomUUID()}.${ext === 'jpg' ? 'webp' : ext}`;
}

export function getStoragePaths(filename: string, folder: string = 'landing-images'): Record<string, string> {
  const base = `${folder}/${filename}`;
  return {
    original: base,
    desktop: `${folder}/${filename.replace(/\.\w+$/, '')}.desktop.webp`,
    tablet: `${folder}/${filename.replace(/\.\w+$/, '')}.tablet.webp`,
    mobile: `${folder}/${filename.replace(/\.\w+$/, '')}.mobile.webp`,
    thumbnail: `${folder}/${filename.replace(/\.\w+$/, '')}.thumbnail.webp`,
  };
}