import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../supabase';
import { imageProcessingService } from '../services/imageProcessingService';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { 
  logImageAudit, 
  rollbackImage,
  fetchHeroImage,
  getImage,
  createImageRecord,
  updateImageMetadata,
  softDeleteImage,
  restoreImage,
  publishImage,
  listImages,
  getImageVersions,
  getPreviewUrls
} from '../services/landingPageImagesService';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and SVG are allowed.'));
    }
  },
});

// GET /api/landing-page/images/hero - Get current active hero image
router.get('/images/hero', async (req, res) => {
  try {
    const result = await fetchHeroImage();
    
    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error fetching hero image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/landing-page/images/:id - Get specific image
router.get('/images/:id', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getImage(id);
    
    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images - Upload new image
router.post('/images', requireAuth, requirePermission('admin:landing_page'), upload.single('image'), async (req: AuthedRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Validate image
    const validation = await imageProcessingService.validateImage(file.buffer, file.mimetype);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    // Extract metadata
    const metadata = await imageProcessingService.extractMetadata(file.buffer);

    // Process image into responsive variants
    const processedImages = await imageProcessingService.processImage(
      file.buffer,
      file.originalname,
      'landing-page'
    );

    // Upload all variants to Supabase Storage
    const uploadPromises = [
      supabase.storage.from('landing-page-images').upload(processedImages.original.path, processedImages.original.buffer, {
        contentType: 'image/webp',
        upsert: true,
      }),
      supabase.storage.from('landing-page-images').upload(processedImages.thumbnail.path, processedImages.thumbnail.buffer, {
        contentType: 'image/webp',
        upsert: true,
      }),
      supabase.storage.from('landing-page-images').upload(processedImages.mobile.path, processedImages.mobile.buffer, {
        contentType: 'image/webp',
        upsert: true,
      }),
      supabase.storage.from('landing-page-images').upload(processedImages.desktop.path, processedImages.desktop.buffer, {
        contentType: 'image/webp',
        upsert: true,
      }),
    ];

    const uploadResults = await Promise.allSettled(uploadPromises);
    const failedUploads = uploadResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
    
    if (failedUploads.length > 0) {
      console.error('Some image variants failed to upload:', failedUploads);
      return res.status(500).json({ 
        message: 'Failed to upload one or more image variants to storage',
        errors: failedUploads.map(f => f.status === 'fulfilled' ? f.value.error : f.reason)
      });
    }

    // Get current user
    const user = req.user;

    // Create image record
    const createResult = await createImageRecord({
      title: req.body.title,
      description: req.body.description,
      fileName: processedImages.original.path.split('/').pop() || 'hero.webp',
      originalName: file.originalname,
      mimeType: 'image/webp',
      fileSize: processedImages.original.buffer.length,
      width: metadata.width,
      height: metadata.height,
      storagePath: processedImages.original.path,
      thumbnailPath: processedImages.thumbnail.path,
      mobilePath: processedImages.mobile.path,
      desktopPath: processedImages.desktop.path,
      altText: req.body.alt_text,
      seoTitle: req.body.seo_title,
      seoDescription: req.body.seo_description,
      status: req.body.status,
      uploadedBy: user?.id,
    });

    if (!createResult.success) {
      console.error('Error creating image record:', createResult.error);
      return res.status(500).json({ message: 'Failed to create image record', error: createResult.error });
    }

    const image = createResult.data!;

    // Log audit
    await logImageAudit({
      imageId: image.id as string,
      action: 'create',
      details: { title: image.title, status: image.status },
      performedBy: user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json(image);
  } catch (error: any) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Internal server error', error: error?.message });
  }
});

// PUT /api/landing-page/images/:id - Update image metadata
router.put('/images/:id', requireAuth, requirePermission('admin:landing_page'), validateBody(z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  alt_text: z.string().optional(),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  expires_at: z.string().nullable().optional(),
})), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, alt_text, seo_title, seo_description, status, expires_at } = req.body;

    const result = await updateImageMetadata(id, {
      title,
      description,
      alt_text,
      seo_title,
      seo_description,
      status,
      expires_at,
    });

    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    // Log audit
    await logImageAudit({
      imageId: id,
      action: 'update',
      details: { changes: req.body },
      performedBy: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(result.data);
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/landing-page/images/:id - Soft delete
router.delete('/images/:id', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await softDeleteImage(id);
    
    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    // Log audit
    await logImageAudit({
      imageId: id,
      action: 'delete',
      details: { title: result.data?.title },
      performedBy: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images/:id/restore - Restore deleted image
router.post('/images/:id/restore', requireAuth, requirePermission('admin:landing_page'), async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await restoreImage(id);
    
    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    // Log audit
    await logImageAudit({
      imageId: id,
      action: 'restore',
      details: { title: result.data?.title },
      performedBy: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(result.data);
  } catch (error) {
    console.error('Error restoring image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images/:id/publish - Publish image
router.post('/images/:id/publish', requireAuth, requirePermission('admin:landing_page'), async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await publishImage(id);
    
    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    // Log audit
    await logImageAudit({
      imageId: id,
      action: 'publish',
      details: { title: result.data?.title },
      performedBy: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(result.data);
  } catch (error) {
    console.error('Error publishing image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/landing-page/images/:id/versions - List versions
router.get('/images/:id/versions', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getImageVersions(id);
    
    if (!result.success) {
      return res.status(500).json({ message: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images/:id/rollback - Rollback to specific version
router.post('/images/:id/rollback', requireAuth, requirePermission('admin:landing_page'), validateBody(z.object({
  version: z.number().int().positive(),
})), async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    const result = await rollbackImage({
      imageId: id,
      targetVersion: version,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!result.success) {
      const status = result.error === 'Version not found' || result.error === 'Image not found' ? 404 : 500;
      return res.status(status).json({ message: result.error });
    }

    // Re-fetch the updated image to return fresh data
    const reFetchResult = await getImage(id);
    
    if (!reFetchResult.success) {
      return res.status(404).json({ message: 'Image not found after rollback' });
    }

    res.json(reFetchResult.data);
  } catch (error) {
    console.error('Error rolling back image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images/validate - Validate upload
router.post('/images/validate', requireAuth, requirePermission('admin:landing_page'), upload.single('image'), async (req: AuthedRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ message: 'No image file provided', valid: false });
    }

    const validation = await imageProcessingService.validateImage(file.buffer, file.mimetype);

    if (validation.valid) {
      const metadata = await imageProcessingService.extractMetadata(file.buffer);
      res.json({
        valid: true,
        metadata,
      });
    } else {
      res.status(400).json({
        valid: false,
        error: validation.error,
      });
    }
  } catch (error: any) {
    console.error('Error validating image:', error);
    res.status(500).json({ message: 'Internal server error', valid: false, error: error?.message });
  }
});

// GET /api/landing-page/images - List all images (admin)
router.get('/images', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { status, include_deleted, page, limit } = req.query;

    const result = await listImages({
      status: status as string,
      include_deleted: include_deleted === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    if (!result.success) {
      return res.status(500).json({ message: result.error });
    }

    res.json(result.data);
  } catch (error: any) {
    console.error('Error listing images:', error);
    res.status(500).json({ message: 'Internal server error', error: error?.message });
  }
});

// GET /api/landing-page/images/:id/preview - Get preview URL
router.get('/images/:id/preview', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getPreviewUrls(id);
    
    if (!result.success) {
      return res.status(404).json({ message: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error getting preview:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export function createLandingPageImagesRouter(): Router {
  return router;
}

export default router;
