import { Router, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { supabase } from '../supabase';
import { imageProcessingService } from '../services/imageProcessingService';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';

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
     // First, try to get a published hero image from the new system
     const { data: heroData, error: heroError } = await supabase
       .from('landing_page_images')
       .select('*')
       .eq('status', 'published')
       .is('deleted_at', null)
       .order('created_at', { ascending: false })
       .limit(1)
       .single();

     if (!heroError && heroData) {
       const getSignedUrl = async (path: string | null) => {
         if (!path) return null;
         const { data } = await supabase.storage
           .from('landing-page-images')
           .createSignedUrl(path, 3600); // 1 hour expiry
         return data?.signedUrl || null;
       };

       const [thumbnailUrl, mobileUrl, desktopUrl] = await Promise.all([
         getSignedUrl(heroData.thumbnail_path),
         getSignedUrl(heroData.mobile_path),
         getSignedUrl(heroData.desktop_path),
       ]);

       res.json({
         ...heroData,
         thumbnail_url: thumbnailUrl,
         mobile_url: mobileUrl,
         desktop_url: desktopUrl,
       });
       return;
     }

     // Fallback: try to get legacy hero image from branding settings
     const { data: settingData, error: settingError } = await supabase
       .from('system_settings')
       .select('value')
       .eq('key', 'branding.hero_image')
       .single();

     if (!settingError && settingData && settingData.value) {
       const legacyImageUrl = settingData.value as string;
       // Construct a hero image object compatible with the frontend
       res.json({
         id: 'legacy-hero-image',
         title: 'Legacy Hero Image',
         description: 'Fallback hero image from branding settings',
         file_name: 'legacy-hero-image',
         original_name: 'legacy-hero-image',
         mime_type: 'image/jpeg', // Assume JPEG for legacy
         file_size: 0,
         width: 1920, // Default fallback dimensions
         height: 1080,
         storage_path: legacyImageUrl,
         thumbnail_path: legacyImageUrl, // Use same URL for all variants
         mobile_path: legacyImageUrl,
         desktop_path: legacyImageUrl,
         alt_text: 'Enterprise Operations & Compliance Platform',
         seo_title: '',
         seo_description: '',
         status: 'published',
         version: 1,
         uploaded_by: null,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString(),
         thumbnail_url: legacyImageUrl,
         mobile_url: legacyImageUrl,
         desktop_url: legacyImageUrl,
       });
       return;
     }

     // If neither is available, return 404
     return res.status(404).json({ message: 'No hero image found' });
   } catch (error) {
     console.error('Error fetching hero image:', error);
     res.status(500).json({ message: 'Internal server error' });
   }
 });

// GET /api/landing-page/images/:id - Get specific image
router.get('/images/:id', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('landing_page_images')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Helper to get storage path
const getStoragePath = (path: string | null): string | null => path;

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
    const { data: image, error: insertError } = await supabase
      .from('landing_page_images')
      .insert({
        title: req.body.title || 'Hero Image',
        description: req.body.description || '',
        file_name: processedImages.original.path.split('/').pop() || 'hero.webp',
        original_name: file.originalname,
        mime_type: 'image/webp',
        file_size: processedImages.original.buffer.length,
        width: metadata.width,
        height: metadata.height,
        storage_path: processedImages.original.path,
        thumbnail_path: processedImages.thumbnail.path,
        mobile_path: processedImages.mobile.path,
        desktop_path: processedImages.desktop.path,
        alt_text: req.body.alt_text || 'Enterprise Operations & Compliance Platform',
        seo_title: req.body.seo_title || '',
        seo_description: req.body.seo_description || '',
        status: req.body.status || 'draft',
        uploaded_by: user?.id || null,
        published_at: req.body.status === 'published' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting image record:', insertError);
      return res.status(500).json({ message: 'Failed to create image record', error: insertError.message });
    }

    // Log audit
    await supabase.from('landing_page_image_audit').insert({
      image_id: image.id,
      action: 'create',
      details: { title: image.title, status: image.status },
      performed_by: user?.id || null,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.status(201).json(image);
  } catch (error: any) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Internal server error', error: error?.message });
  }
});

// PUT /api/landing-page/images/:id - Update image metadata
router.put('/images/:id', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, alt_text, seo_title, seo_description, status, expires_at } = req.body;

    const updateData: any = {
      title,
      description,
      alt_text,
      seo_title,
      seo_description,
      expires_at,
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
      if (status === 'published') {
        updateData.published_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('landing_page_images')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Log audit
    await supabase.from('landing_page_image_audit').insert({
      image_id: id,
      action: 'update',
      details: { changes: updateData },
      performed_by: req.user?.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(data);
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/landing-page/images/:id - Soft delete
router.delete('/images/:id', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('landing_page_images')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Log audit
    await supabase.from('landing_page_image_audit').insert({
      image_id: id,
      action: 'delete',
      details: { title: data.title },
      performed_by: req.user?.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
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

    const { data, error } = await supabase
      .from('landing_page_images')
      .update({ deleted_at: null })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Log audit
    await supabase.from('landing_page_image_audit').insert({
      image_id: id,
      action: 'restore',
      details: { title: data.title },
      performed_by: req.user?.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(data);
  } catch (error) {
    console.error('Error restoring image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images/:id/publish - Publish image
router.post('/images/:id/publish', requireAuth, requirePermission('admin:landing_page'), async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Unpublish all other images
    await supabase
      .from('landing_page_images')
      .update({ status: 'archived' })
      .neq('id', id)
      .eq('status', 'published');

    // Publish this image
    const { data, error } = await supabase
      .from('landing_page_images')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Log audit
    await supabase.from('landing_page_image_audit').insert({
      image_id: id,
      action: 'publish',
      details: { title: data.title },
      performed_by: req.user?.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(data);
  } catch (error) {
    console.error('Error publishing image:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/landing-page/images/:id/versions - List versions
router.get('/images/:id/versions', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('landing_page_image_versions')
      .select('*')
      .eq('image_id', id)
      .order('version', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch versions' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/landing-page/images/:id/rollback - Rollback to specific version
router.post('/images/:id/rollback', requireAuth, requirePermission('admin:landing_page'), async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!version) {
      return res.status(400).json({ message: 'Version number is required' });
    }

    // Get the version to rollback to
    const { data: versionData, error: versionError } = await supabase
      .from('landing_page_image_versions')
      .select('*')
      .eq('image_id', id)
      .eq('version', version)
      .single();

    if (versionError || !versionData) {
      return res.status(404).json({ message: 'Version not found' });
    }

    // Get current image
    const { data: currentImage, error: currentError } = await supabase
      .from('landing_page_images')
      .select('*')
      .eq('id', id)
      .single();

    if (currentError || !currentImage) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Save current state as new version
    const newVersion = currentImage.version + 1;
    await supabase.from('landing_page_image_versions').insert({
      image_id: id,
      version: newVersion,
      file_name: currentImage.file_name,
      original_name: currentImage.original_name,
      mime_type: currentImage.mime_type,
      file_size: currentImage.file_size,
      width: currentImage.width,
      height: currentImage.height,
      storage_path: currentImage.storage_path,
      thumbnail_path: currentImage.thumbnail_path,
      mobile_path: currentImage.mobile_path,
      desktop_path: currentImage.desktop_path,
      alt_text: currentImage.alt_text,
      seo_title: currentImage.seo_title,
      seo_description: currentImage.seo_description,
      change_summary: `Rollback to version ${version}`,
      created_by: req.user?.id,
    });

    // Rollback to the selected version
    const { data: updatedImage, error: updateError } = await supabase
      .from('landing_page_images')
      .update({
        storage_path: versionData.storage_path,
        thumbnail_path: versionData.thumbnail_path,
        mobile_path: versionData.mobile_path,
        desktop_path: versionData.desktop_path,
        file_name: versionData.file_name,
        original_name: versionData.original_name,
        mime_type: versionData.mime_type,
        file_size: versionData.file_size,
        width: versionData.width,
        height: versionData.height,
        alt_text: versionData.alt_text,
        seo_title: versionData.seo_title,
        seo_description: versionData.seo_description,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedImage) {
      return res.status(500).json({ message: 'Failed to rollback' });
    }

    // Log audit
    await supabase.from('landing_page_image_audit').insert({
      image_id: id,
      action: 'rollback',
      details: { from_version: newVersion, to_version: version },
      performed_by: req.user?.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(updatedImage);
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
    const { status, include_deleted, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('landing_page_images')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (include_deleted !== 'true') {
      query = query.is('deleted_at', null);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch images', error: error.message });
    }

    res.json({
      images: data || [],
      total: count || 0,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil((count || 0) / Number(limit)),
    });
  } catch (error: any) {
    console.error('Error listing images:', error);
    res.status(500).json({ message: 'Internal server error', error: error?.message });
  }
});

// GET /api/landing-page/images/:id/preview - Get preview URL
router.get('/images/:id/preview', requireAuth, requirePermission('admin:landing_page'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('landing_page_images')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const getSignedUrl = async (path: string | null) => {
      if (!path) return null;
      const { data } = await supabase.storage
        .from('landing-page-images')
        .createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    };

    const [thumbnailUrl, mobileUrl, desktopUrl] = await Promise.all([
      getSignedUrl(data.thumbnail_path),
      getSignedUrl(data.mobile_path),
      getSignedUrl(data.desktop_path),
    ]);

    res.json({
      id: data.id,
      title: data.title,
      thumbnail_url: thumbnailUrl,
      mobile_url: mobileUrl,
      desktop_url: desktopUrl,
      alt_text: data.alt_text,
      width: data.width,
      height: data.height,
    });
  } catch (error) {
    console.error('Error getting preview:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export function createLandingPageImagesRouter(): Router {
  return router;
}

export default router;
