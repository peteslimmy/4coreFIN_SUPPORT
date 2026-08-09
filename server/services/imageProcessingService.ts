import sharp from 'sharp';
import { randomUUID } from 'crypto';

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill';
}

export interface ProcessedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface ResponsiveImageSet {
  thumbnail: { buffer: Buffer; width: number; height: number; path: string };
  mobile: { buffer: Buffer; width: number; height: number; path: string };
  desktop: { buffer: Buffer; width: number; height: number; path: string };
  original: { buffer: Buffer; width: number; height: number; path: string };
}

export class ImageProcessingService {
  private static instance: ImageProcessingService;

  static getInstance(): ImageProcessingService {
    if (!ImageProcessingService.instance) {
      ImageProcessingService.instance = new ImageProcessingService();
    }
    return ImageProcessingService.instance;
  }

  /**
   * Process an uploaded image into responsive variants
   */
  async processImage(
    buffer: Buffer,
    originalName: string,
    basePath: string
  ): Promise<ResponsiveImageSet> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image: missing dimensions');
    }

    const id = randomUUID();
    const ext = 'webp';
    const baseName = originalName.replace(/\.[^/.]+$/, '');

    // Generate responsive sizes
    const [thumbnail, mobile, desktop] = await Promise.all([
      this.resizeImage(image.clone(), 200, metadata.width, metadata.height, { format: 'webp', quality: 80 }),
      this.resizeImage(image.clone(), 768, metadata.width, metadata.height, { format: 'webp', quality: 85 }),
      this.resizeImage(image.clone(), 1920, metadata.width, metadata.height, { format: 'webp', quality: 90 }),
    ]);

    // Original optimized
    const original = await this.optimizeImage(image.clone(), {
      format: 'webp',
      quality: 90,
      maxWidth: 2560,
      maxHeight: 2560,
    });

    return {
      thumbnail: {
        buffer: thumbnail.buffer,
        width: thumbnail.width,
        height: thumbnail.height,
        path: `${basePath}/thumbnails/${baseName}-${id}.${ext}`,
      },
      mobile: {
        buffer: mobile.buffer,
        width: mobile.width,
        height: mobile.height,
        path: `${basePath}/mobile/${baseName}-${id}.${ext}`,
      },
      desktop: {
        buffer: desktop.buffer,
        width: desktop.width,
        height: desktop.height,
        path: `${basePath}/desktop/${baseName}-${id}.${ext}`,
      },
      original: {
        buffer: original.buffer,
        width: original.width,
        height: original.height,
        path: `${basePath}/${baseName}-${id}.${ext}`,
      },
    };
  }

  /**
   * Resize image to fit within max dimension while maintaining aspect ratio
   */
  private async resizeImage(
    image: ReturnType<typeof sharp>,
    maxDimension: number,
    originalWidth: number,
    originalHeight: number,
    options: ImageProcessingOptions
  ): Promise<ProcessedImageResult> {
    const { quality = 85, format = 'webp' } = options;

    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (originalWidth > originalHeight && originalWidth > maxDimension) {
      newWidth = maxDimension;
      newHeight = Math.round((originalHeight * maxDimension) / originalWidth);
    } else if (originalHeight > maxDimension) {
      newHeight = maxDimension;
      newWidth = Math.round((originalWidth * maxDimension) / originalHeight);
    }

    const formatMethod = format === 'webp' ? 'webp' : format === 'jpeg' ? 'jpeg' : 'png';
    const buffer = await image.resize(newWidth, newHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })[formatMethod]({
      quality,
    }).toBuffer();

    return {
      buffer,
      width: newWidth,
      height: newHeight,
      format: `image/${format === 'webp' ? 'webp' : format === 'jpeg' ? 'jpeg' : 'png'}`,
      size: buffer.length,
    };
  }

  /**
   * Optimize image with general settings
   */
  private async optimizeImage(
    image: ReturnType<typeof sharp>,
    options: ImageProcessingOptions
  ): Promise<ProcessedImageResult> {
    const { quality = 90, maxWidth = 2560, maxHeight = 2560 } = options;

    const buffer = await image.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    }).webp({
      quality,
      effort: 6,
    }).toBuffer();

    const metadata = await sharp(buffer).metadata();

    return {
      buffer,
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: 'image/webp',
      size: buffer.length,
    };
  }

  /**
   * Extract image metadata
   */
  async extractMetadata(buffer: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
    mimeType: string;
    aspectRatio: number;
  }> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image: missing dimensions');
    }

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format || 'unknown',
      size: buffer.length,
      mimeType: `image/${metadata.format || 'unknown'}`,
      aspectRatio: metadata.width / metadata.height,
    };
  }

  /**
   * Validate image file
   */
  async validateImage(buffer: Buffer, mimeType: string, maxSizeMB: number = 10): Promise<{
    valid: boolean;
    error?: string;
  }> {
    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (buffer.length > maxSizeBytes) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${maxSizeMB}MB`,
      };
    }

    // Check MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
      };
    }

    // Check magic numbers for common image formats
    const validMagicNumbers: { [key: string]: number[] } = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      'image/webp': [0x52, 0x49, 0x46, 0x46],
      'image/svg+xml': [0x3C, 0x3F, 0x78, 0x6D, 0x6C], // <?xml or <svg
    };

    const magic = validMagicNumbers[mimeType];
    if (magic && !this.checkMagicNumber(buffer, magic)) {
      return {
        valid: false,
        error: 'File does not match declared MIME type',
      };
    }

    // Verify it's actually an image
    try {
      await sharp(buffer).metadata();
    } catch {
      return {
        valid: false,
        error: 'File is not a valid image',
      };
    }

    return { valid: true };
  }

  /**
   * Check if buffer starts with expected magic numbers
   */
  private checkMagicNumber(buffer: Buffer, magic: number[]): boolean {
    if (buffer.length < magic.length) return false;
    return magic.every((byte, index) => buffer[index] === byte);
  }

  /**
   * Generate responsive srcset string
   */
  generateSrcset(
    thumbnailPath: string,
    mobilePath: string,
    desktopPath: string
  ): string {
    return `${thumbnailPath} 200w, ${mobilePath} 768w, ${desktopPath} 1920w`;
  }

  /**
   * Get optimal image path based on device
   */
  getOptimalImagePath(
    mobilePath: string,
    desktopPath: string,
    userAgent?: string
  ): string {
    if (!userAgent) return desktopPath;

    const mobilePatterns = [/Mobile/i, /Android/i, /iPhone/i, /iPad/i, /Tablet/i];
    const isMobile = mobilePatterns.some(pattern => pattern.test(userAgent));

    return isMobile ? mobilePath : desktopPath;
  }

  /**
   * Clean up old/orphaned images (to be called periodically)
   */
  async cleanupOrphanedImages(imageIds: string[]): Promise<number> {
    // This would be implemented to remove files not referenced by any image record
    // Implementation depends on storage service
    return 0;
  }
}

export const imageProcessingService = ImageProcessingService.getInstance();