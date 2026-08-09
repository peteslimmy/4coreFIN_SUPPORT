# Landing Page Image Management Module

## Overview

Complete enterprise-grade image management system for the 4CoreFinSupport landing page hero section. This module provides a full CRUD interface with versioning, audit logging, and automated image optimization.

## Components

### 1. AI Image Generation Prompt
**File**: `docs/hero-image-ai-prompt.md`

Optimized prompts for generating premium enterprise hero images using DALL-E 3, Midjourney v6, or Stable Diffusion XL. Includes:
- Vector-style and 3D isometric options
- Dark red and white color palette
- 4K resolution specifications
- Post-processing requirements

### 2. Database Schema
**File**: `supabase/migrations/022_landing_page_images.sql`

Three tables with full RLS policies:
- `landing_page_images` - Main image records
- `landing_page_image_versions` - Version history for rollback
- `landing_page_image_audit` - Audit logging

Features:
- Soft delete support
- Automatic updated_at triggers
- Version control
- Audit trail triggers

### 3. Backend API
**File**: `server/routes/landingPageImages.ts`

RESTful endpoints:
- `GET /api/landing-page/images/hero` - Public endpoint for current hero image
- `GET /api/landing-page/images` - List all images (admin)
- `GET /api/landing-page/images/:id` - Get specific image (admin)
- `POST /api/landing-page/images` - Upload new image (admin)
- `PUT /api/landing-page/images/:id` - Update metadata (admin)
- `DELETE /api/landing-page/images/:id` - Soft delete (admin)
- `POST /api/landing-page/images/:id/restore` - Restore deleted (admin)
- `POST /api/landing-page/images/:id/publish` - Publish image (admin)
- `GET /api/landing-page/images/:id/versions` - List versions (admin)
- `POST /api/landing-page/images/:id/rollback` - Rollback to version (admin)
- `POST /api/landing-page/images/validate` - Validate upload (admin)
- `GET /api/landing-page/images/:id/preview` - Get preview URLs (admin)

All admin endpoints require `admin:landing_page` permission.

### 4. Image Processing Service
**File**: `server/services/imageProcessingService.ts`

Features:
- Automatic WebP conversion
- Responsive image generation (thumbnail, mobile, desktop)
- Metadata extraction
- File validation with magic number checking
- MIME type verification
- Automatic compression

### 5. Frontend Components

#### LandingPageManager
**File**: `src/components/admin/LandingPageManager.tsx`

Main admin interface with:
- Image grid display
- Filter by status (all, draft, published, archived)
- Upload wizard integration
- Preview modal
- Version history modal
- Delete confirmation

#### ImageCard
**File**: `src/components/admin/ImageCard.tsx`

Individual image card showing:
- Thumbnail preview
- Status badge
- Version number
- Metadata (dimensions, file size, format)
- Action buttons (publish, delete, restore, view versions)

#### ImageUploadWizard
**File**: `src/components/admin/ImageUploadWizard.tsx`

Drag-and-drop upload interface with:
- File validation
- Image preview
- Metadata display
- Form fields (title, description, alt text, SEO)
- Status selection (draft/published)

#### ImagePreviewModal
**File**: `src/components/admin/ImagePreviewModal.tsx`

Full-screen preview with:
- Zoom controls (50% - 150%)
- Image metadata display
- Download button
- Keyboard navigation

#### VersionHistoryTimeline
**File**: `src/components/admin/VersionHistoryTimeline.tsx`

Version history with:
- Timeline visualization
- Version comparison
- Rollback functionality
- Change summary display

#### ImageSEOEditor
**File**: `src/components/admin/ImageSEOEditor.tsx`

SEO and accessibility editor for:
- Alt text (required)
- SEO title (max 60 chars)
- SEO description (max 160 chars)
- Character counters

#### LandingHero (Updated)
**File**: `src/components/auth/LandingHero.tsx`

Updated to use new API:
- Fetches hero image from `/api/landing-page/images/hero`
- Supports responsive images (desktop, mobile, thumbnail)
- Loading skeleton state
- Fallback to legacy `branding.hero_image` setting
- No layout shift

### 6. Type Definitions
**File**: `src/components/admin/types.ts`

TypeScript interfaces:
- `LandingPageImage` - Main image record
- `ImageVersion` - Version history record

### 7. Seed Script
**File**: `server/seedLandingPage.ts`

Creates initial draft image record for the landing page.

## Security Features

1. **Authentication**: All admin endpoints require valid session
2. **Authorization**: RBAC permission `admin:landing_page` required
3. **File Validation**:
   - MIME type checking
   - Magic number verification
   - File size limits (10MB)
   - Allowed types: JPEG, PNG, WebP, SVG
4. **CSRF Protection**: Double-submit token validation
5. **Rate Limiting**: Upload endpoints rate-limited
6. **Audit Logging**: All actions logged with user, IP, timestamp
7. **Soft Delete**: Images can be restored after deletion
8. **Secure Storage**: Private Supabase Storage bucket with signed URLs

## Performance Features

1. **Responsive Images**: 4 sizes generated (thumbnail, mobile, desktop, original)
2. **WebP Conversion**: All images converted to WebP for optimal compression
3. **Lazy Loading**: Images use `loading="lazy"` except above-fold hero
4. **Cache Headers**: Signed URLs with 1-hour expiry
5. **No Layout Shift**: Aspect ratio boxes prevent CLS
6. **Optimized Quality**: Quality settings balanced for size/quality

## Usage

### Installation

1. Run the database migration:
   ```bash
   supabase migration up
   ```

2. Seed initial data:
   ```bash
   npx tsx server/seedLandingPage.ts
   ```

3. The routes are automatically registered in `server/routes.ts`

### Admin Interface

Navigate to the Landing Page Manager (requires `admin:landing_page` permission):
- Upload new hero images via drag-and-drop
- Preview images in full screen
- View version history
- Rollback to previous versions
- Publish/unpublish images
- Edit SEO metadata
- Delete/restore images

### AI Image Generation

Use the prompt in `docs/hero-image-ai-prompt.md` with your preferred AI image generator:
- DALL-E 3
- Midjourney v6
- Stable Diffusion XL

Follow post-processing requirements to optimize for web use.

## Design System

- **Primary**: Dark Red (#8B1538)
- **Secondary**: White
- **Accent**: Soft Gray
- **Typography**: Modern, clean sans-serif
- **Spacing**: Consistent 4px grid
- **Shadows**: Minimal, subtle
- **Border Radius**: Rounded corners (8-12px)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Testing

Comprehensive test coverage includes:
- Unit tests for image processing
- Integration tests for API endpoints
- UI tests for admin components
- Upload validation tests
- Permission tests
- Performance tests
- Accessibility tests

## Documentation

- Technical API documentation
- Database schema documentation
- Administrator user guide
- This implementation guide

## Notes

- Images are stored in Supabase Storage bucket `landing-page-images`
- All uploaded images are converted to WebP format
- Version history is maintained automatically
- Audit logging tracks all changes
- The hero image endpoint is public (no auth required)
- All admin endpoints require authentication and authorization
- File names are sanitized and made unique with UUIDs
- The module is fully integrated with existing RBAC system

## Future Enhancements

- Image cropping and rotation UI
- Bulk upload support
- Image scheduling (publish/expire dates)
- Advanced search and filtering
- Image analytics (views, clicks)
- A/B testing support for hero images
- CDN integration
- Advanced caching strategies