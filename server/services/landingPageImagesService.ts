import { supabase } from '../supabase';

/**
 * Create a signed URL for a storage path. Returns null for null/empty paths.
 */
export async function getSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from('landing-page-images')
    .createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

/**
 * Resolve signed URLs for all three responsive variants of an image.
 */
export async function getImageSignedUrls(image: {
  thumbnail_path: string | null;
  mobile_path: string | null;
  desktop_path: string | null;
}): Promise<{ thumbnailUrl: string | null; mobileUrl: string | null; desktopUrl: string | null }> {
  const [thumbnailUrl, mobileUrl, desktopUrl] = await Promise.all([
    getSignedUrl(image.thumbnail_path),
    getSignedUrl(image.mobile_path),
    getSignedUrl(image.desktop_path),
  ]);
  return { thumbnailUrl, mobileUrl, desktopUrl };
}

/**
 * Insert an audit log entry for a landing page image action.
 */
export async function logImageAudit(opts: {
  imageId: string;
  action: string;
  details: Record<string, unknown>;
  performedBy?: string | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await supabase.from('landing_page_image_audit').insert({
    image_id: opts.imageId,
    action: opts.action,
    details: opts.details,
    performed_by: opts.performedBy ?? null,
    ip_address: opts.ipAddress,
    user_agent: opts.userAgent,
  });
}

/** Shared image fields copied between versions during rollback. */
const IMAGE_VERSION_FIELDS = [
  'storage_path', 'thumbnail_path', 'mobile_path', 'desktop_path',
  'file_name', 'original_name', 'mime_type', 'file_size',
  'width', 'height', 'alt_text', 'seo_title', 'seo_description',
] as const;

/**
 * Rollback a landing page image to a previous version.
 * Saves the current state as a new version entry, then applies the target
 * version's fields to the image record.
 */
export async function rollbackImage(opts: {
  imageId: string;
  targetVersion: number;
  userId?: string | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch the target version
  const { data: versionData, error: versionError } = await supabase
    .from('landing_page_image_versions')
    .select('*')
    .eq('image_id', opts.imageId)
    .eq('version', opts.targetVersion)
    .single();

  if (versionError || !versionData) {
    return { success: false, error: 'Version not found' };
  }

  // 2. Fetch current image state
  const { data: currentImage, error: currentError } = await supabase
    .from('landing_page_images')
    .select('*')
    .eq('id', opts.imageId)
    .single();

  if (currentError || !currentImage) {
    return { success: false, error: 'Image not found' };
  }

  // 3. Save current state as a new version
  const newVersion = (currentImage.version as number) + 1;
  const versionInsert: Record<string, unknown> = {
    image_id: opts.imageId,
    version: newVersion,
    change_summary: `Rollback to version ${opts.targetVersion}`,
    created_by: opts.userId,
  };
  for (const field of IMAGE_VERSION_FIELDS) {
    versionInsert[field] = currentImage[field];
  }
  await supabase.from('landing_page_image_versions').insert(versionInsert);

  // 4. Apply the target version's fields to the image
  const updateData: Record<string, unknown> = {
    version: newVersion,
    updated_at: new Date().toISOString(),
  };
  for (const field of IMAGE_VERSION_FIELDS) {
    updateData[field] = versionData[field];
  }
  const { data: updatedImage, error: updateError } = await supabase
    .from('landing_page_images')
    .update(updateData)
    .eq('id', opts.imageId)
    .select()
    .single();

  if (updateError || !updatedImage) {
    return { success: false, error: 'Failed to rollback' };
  }

  // 5. Audit
  await logImageAudit({
    imageId: opts.imageId,
    action: 'rollback',
    details: { from_version: newVersion, to_version: opts.targetVersion },
    performedBy: opts.userId,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  });

  return { success: true };
}

/**
 * Fetch the current active hero image (published) or fallback to legacy branding setting.
 */
export async function fetchHeroImage(): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
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
    const { thumbnailUrl, mobileUrl, desktopUrl } = await getImageSignedUrls(heroData);

    return {
      success: true,
      data: {
        ...heroData,
        thumbnail_url: thumbnailUrl,
        mobile_url: mobileUrl,
        desktop_url: desktopUrl,
      },
    };
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
    return {
      success: true,
      data: {
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
      },
    };
  }

  // If neither is available
  return { success: false, error: 'No hero image found' };
}

/**
 * Fetch a specific image by ID.
 */
export async function getImage(id: string): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const { data, error } = await supabase
    .from('landing_page_images')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return { success: false, error: 'Image not found' };
  }

  return { success: true, data };
}

/**
 * Create a new landing page image record after storage upload.
 */
export async function createImageRecord(opts: {
  title?: string;
  description?: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  storagePath: string;
  thumbnailPath: string;
  mobilePath: string;
  desktopPath: string;
  altText?: string;
  seoTitle?: string;
  seoDescription?: string;
  status?: string;
  uploadedBy?: string | null;
}): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const { data: image, error: insertError } = await supabase
    .from('landing_page_images')
    .insert({
      title: opts.title || 'Hero Image',
      description: opts.description || '',
      file_name: opts.fileName,
      original_name: opts.originalName,
      mime_type: opts.mimeType,
      file_size: opts.fileSize,
      width: opts.width,
      height: opts.height,
      storage_path: opts.storagePath,
      thumbnail_path: opts.thumbnailPath,
      mobile_path: opts.mobilePath,
      desktop_path: opts.desktopPath,
      alt_text: opts.altText || 'Enterprise Operations & Compliance Platform',
      seo_title: opts.seoTitle || '',
      seo_description: opts.seoDescription || '',
      status: opts.status || 'draft',
      uploaded_by: opts.uploadedBy || null,
      published_at: opts.status === 'published' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (insertError) {
    return { success: false, error: `Failed to create image record: ${insertError.message}` };
  }

  return { success: true, data: image };
}

/**
 * Update image metadata and status.
 */
export async function updateImageMetadata(id: string, updates: {
  title?: string;
  description?: string;
  alt_text?: string;
  seo_title?: string;
  seo_description?: string;
  status?: string;
  expires_at?: string | null;
}): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.status) {
    if (updates.status === 'published') {
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
    return { success: false, error: 'Image not found' };
  }

  return { success: true, data };
}

/**
 * Soft delete an image by setting deleted_at timestamp.
 */
export async function softDeleteImage(id: string): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const { data, error } = await supabase
    .from('landing_page_images')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: 'Image not found' };
  }

  return { success: true, data };
}

/**
 * Restore a soft-deleted image by clearing deleted_at.
 */
export async function restoreImage(id: string): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const { data, error } = await supabase
    .from('landing_page_images')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: 'Image not found' };
  }

  return { success: true, data };
}

/**
 * Publish an image by unpublishing all others and setting this one as published.
 */
export async function publishImage(id: string): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
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
    return { success: false, error: 'Image not found' };
  }

  return { success: true, data };
}

/**
 * List images with optional filtering and pagination.
 */
export async function listImages(opts: {
  status?: string;
  include_deleted?: boolean;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  data?: {
    images: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
}> {
  const page = opts.page || 1;
  const limit = opts.limit || 20;

  let query = supabase
    .from('landing_page_images')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (!opts.include_deleted) {
    query = query.is('deleted_at', null);
  }

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return { success: false, error: `Failed to fetch images: ${error.message}` };
  }

  return {
    success: true,
    data: {
      images: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
}

/**
 * Get version history for an image.
 */
export async function getImageVersions(imageId: string): Promise<{
  success: boolean;
  data?: Record<string, unknown>[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from('landing_page_image_versions')
    .select('*')
    .eq('image_id', imageId)
    .order('version', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to fetch versions' };
  }

  return { success: true, data: data || [] };
}

/**
 * Get preview URLs for an image.
 */
export async function getPreviewUrls(id: string): Promise<{
  success: boolean;
  data?: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    mobile_url: string | null;
    desktop_url: string | null;
    alt_text: string;
    width: number;
    height: number;
  };
  error?: string;
}> {
  const { data, error } = await supabase
    .from('landing_page_images')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return { success: false, error: 'Image not found' };
  }

  const { thumbnailUrl, mobileUrl, desktopUrl } = await getImageSignedUrls(data);

  return {
    success: true,
    data: {
      id: data.id as string,
      title: data.title as string,
      thumbnail_url: thumbnailUrl,
      mobile_url: mobileUrl,
      desktop_url: desktopUrl,
      alt_text: data.alt_text as string,
      width: data.width as number,
      height: data.height as number,
    },
  };
}
