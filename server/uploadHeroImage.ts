import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { supabase } from './supabase';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AMP_ENTITY = '\x26amp;';

/**
 * Upload placeholder hero image to storage and publish it
 */
async function uploadAndPublishHeroImage() {
  try {
    console.log('Reading placeholder hero image...');
    const placeholderPath = path.join(__dirname, '..', 'assets', 'landing-page', 'hero-placeholder.svg');
    let svgContent = readFileSync(placeholderPath, 'utf-8');
    console.log('\u2713 Placeholder image loaded:', svgContent.length, 'bytes');

    // Fix XML entity escaping for Sharp/Librsvg compatibility
    svgContent = svgContent.replace(/\x26(?![a-zA-Z#])/g, AMP_ENTITY);
    
    // Save the fixed SVG back to disk
    writeFileSync(placeholderPath, svgContent, 'utf-8');
    console.log('\u2713 Fixed XML entity escaping in SVG file');
    
    const svgBuffer = Buffer.from(svgContent, 'utf-8');
    
    // Process the SVG into WebP variants using sharp
    const image = sharp(svgBuffer, { density: 300 });
    const metadata = await image.metadata();
    console.log('\u2713 Image metadata:', metadata.width, 'x', metadata.height);

    // Generate responsive variants
    const [thumbnail, mobile, desktop, original] = await Promise.all([
      sharp(svgBuffer, { density: 150 }).resize(200, 200, { fit: 'inside' }).webp({ quality: 80 }).toBuffer(),
      sharp(svgBuffer, { density: 150 }).resize(768, 768, { fit: 'inside' }).webp({ quality: 85 }).toBuffer(),
      sharp(svgBuffer, { density: 300 }).resize(1920, 1920, { fit: 'inside' }).webp({ quality: 90 }).toBuffer(),
      sharp(svgBuffer, { density: 300 }).webp({ quality: 90 }).toBuffer(),
    ]);

    const originalMeta = await sharp(original).metadata();
    console.log('\u2713 Processed variants:', { thumbnail: thumbnail.length, mobile: mobile.length, desktop: desktop.length, original: original.length });

    // Create storage bucket if it doesn't exist
    console.log('Checking storage bucket...');
    const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
    if (bucketListError) {
      console.warn('\u26a0\uFE0F  Warning listing buckets:', bucketListError.message);
    }
    
    const bucketExists = buckets?.some(b => b.name === 'landing-page-images');
    if (!bucketExists) {
      console.log('Creating landing-page-images bucket...');
      const { data: newBucket, error: createBucketError } = await supabase.storage.createBucket('landing-page-images', {
        public: true,
      });
      if (createBucketError) {
        throw new Error(`Failed to create bucket: ${createBucketError.message}`);
      }
      console.log('\u2713 Bucket created:', newBucket?.name || 'landing-page-images');
    } else {
      console.log('\u2713 Bucket already exists');
    }

    // Upload all variants to Supabase Storage
    const basePath = 'landing-page';
    const fileName = 'hero-placeholder.webp';
    
    const [thumbUpload, mobileUpload, desktopUpload, originalUpload] = await Promise.all([
      supabase.storage.from('landing-page-images').upload(`${basePath}/thumbnails/${fileName}`, thumbnail, {
        contentType: 'image/webp',
        upsert: true,
      }),
      supabase.storage.from('landing-page-images').upload(`${basePath}/mobile/${fileName}`, mobile, {
        contentType: 'image/webp',
        upsert: true,
      }),
      supabase.storage.from('landing-page-images').upload(`${basePath}/desktop/${fileName}`, desktop, {
        contentType: 'image/webp',
        upsert: true,
      }),
      supabase.storage.from('landing-page-images').upload(`${basePath}/${fileName}`, original, {
        contentType: 'image/webp',
        upsert: true,
      }),
    ]);

    if (thumbUpload.error) throw new Error(`Thumbnail upload failed: ${thumbUpload.error.message}`);
    if (mobileUpload.error) throw new Error(`Mobile upload failed: ${mobileUpload.error.message}`);
    if (desktopUpload.error) throw new Error(`Desktop upload failed: ${desktopUpload.error.message}`);
    if (originalUpload.error) throw new Error(`Original upload failed: ${originalUpload.error.message}`);

    console.log('\u2713 All image variants uploaded to storage');

    // Upload audit
    const { error: auditError } = await supabase.from('landing_page_image_audit').insert({
      image_id: null,
      action: 'upload',
      details: { title: 'Placeholder Hero Image', note: 'Uploaded placeholder SVG converted to WebP' },
      performed_by: null,
      ip_address: 'system',
      user_agent: 'seed-script',
    });

    if (auditError) console.warn('\u26a0\uFE0FF Audit log warning:', auditError.message);

    // Find the draft record we created earlier or create one
    const { data: existing, error: findError } = await supabase
      .from('landing_page_images')
      .select('id')
      .ilike('file_name', '%hero%')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    let imageId;

    if (findError || !existing || existing.length === 0) {
      // Create new record
      const { data: image, error: insertError } = await supabase
        .from('landing_page_images')
        .insert({
          title: 'Default Hero Image',
          description: 'Default enterprise operations hero illustration - replace with your branded image',
          file_name: fileName,
          original_name: 'hero-placeholder.svg',
          mime_type: 'image/webp',
          file_size: original.length,
          width: originalMeta.width || 1920,
          height: originalMeta.height || 1080,
          storage_path: `${basePath}/${fileName}`,
          thumbnail_path: `${basePath}/thumbnails/${fileName}`,
          mobile_path: `${basePath}/mobile/${fileName}`,
          desktop_path: `${basePath}/desktop/${fileName}`,
          alt_text: 'Enterprise Operations & Compliance Platform',
          seo_title: 'Enterprise Operations & Compliance Hub',
          seo_description: 'Modern enterprise platform for business operations, compliance, and workflow automation.',
          status: 'published',
          version: 1,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw new Error(`Failed to create image record: ${insertError.message}`);
      imageId = image.id;
      console.log('\u2713 Created and published hero image record:', imageId);
    } else {
      imageId = existing[0].id;
      // Update existing record
      const { error: updateError } = await supabase
        .from('landing_page_images')
        .update({
          file_name: fileName,
          original_name: 'hero-placeholder.svg',
          mime_type: 'image/webp',
          file_size: original.length,
          width: originalMeta.width || 1920,
          height: originalMeta.height || 1080,
          storage_path: `${basePath}/${fileName}`,
          thumbnail_path: `${basePath}/thumbnails/${fileName}`,
          mobile_path: `${basePath}/mobile/${fileName}`,
          desktop_path: `${basePath}/desktop/${fileName}`,
          alt_text: 'Enterprise Operations & Compliance Platform',
          seo_title: 'Enterprise Operations & Compliance Hub',
          seo_description: 'Modern enterprise platform for business operations, compliance, and workflow automation.',
          status: 'published',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', imageId);

      if (updateError) throw new Error(`Failed to update image record: ${updateError.message}`);
      console.log('\u2713 Updated and published hero image record:', imageId);
    }

    // Verify by fetching the published image
    const { data: hero, error: verifyError } = await supabase
      .from('landing_page_images')
      .select('*')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (verifyError) {
      console.error('Verification failed:', verifyError.message);
    } else {
      console.log('\u2713 Verified published hero image:', hero.id, hero.title);
      
      // Generate signed URLs for verification
      const [thumbUrl, mobileUrl, desktopUrl] = await Promise.all([
        supabase.storage.from('landing-page-images').createSignedUrl(hero.thumbnail_path, 3600),
        supabase.storage.from('landing-page-images').createSignedUrl(hero.mobile_path, 3600),
        supabase.storage.from('landing-page-images').createSignedUrl(hero.desktop_path, 3600),
      ]);
      
      console.log('\u2713 Signed URLs:');
      console.log('  Thumbnail:', thumbUrl.data?.signedUrl);
      console.log('  Mobile:', mobileUrl.data?.signedUrl);
      console.log('  Desktop:', desktopUrl.data?.signedUrl);
    }

    console.log('\n\u2705 Hero image uploaded and published successfully!');
  } catch (error: any) {
    console.error('Error:', error?.message || error);
    process.exit(1);
  }
}

uploadAndPublishHeroImage();
