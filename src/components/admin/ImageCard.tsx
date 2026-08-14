import { memo, type ReactNode } from 'react';
import { Eye, Trash2, RotateCcw, History, CheckCircle } from 'lucide-react';
import type { LandingPageImage } from './types';

interface ImageCardProps {
  image: LandingPageImage;
  onPreview: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onViewVersions: () => void;
  getStatusBadge: (status: string) => ReactNode;
  formatFileSize: (bytes: number) => string;
}

function ImageCard({
  image,
  onPreview,
  onPublish,
  onDelete,
  onRestore,
  onViewVersions,
  getStatusBadge,
  formatFileSize,
}: ImageCardProps) {
  const isPublished = image.status === 'published';
  const isDeleted = !!image.deleted_at;

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden shadow-card hover:shadow-3 transition-shadow duration-200">
      {/* Image Preview */}
      <div className="relative aspect-video bg-surface-hover group">
        {image.thumbnail_url ? (
          <img
            src={image.thumbnail_url}
            alt={image.alt_text}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs text-text-muted">No preview</p>
            </div>
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          <button
            onClick={onPreview}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur-sm transition-colors"
            title="Preview"
          >
            <Eye className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          {getStatusBadge(image.status)}
        </div>

        {/* Version Badge */}
        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md">
          v{image.version}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-text-primary truncate">{image.title}</h3>
          <p className="text-sm text-text-secondary line-clamp-2 mt-1">{image.description || 'No description'}</p>
        </div>

        {/* Metadata */}
        <div className="space-y-1 text-xs text-text-muted">
          <div className="flex items-center justify-between">
            <span>Dimensions</span>
            <span className="font-medium">{image.width} × {image.height}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>File Size</span>
            <span className="font-medium">{formatFileSize(image.file_size)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Format</span>
            <span className="font-medium uppercase">{image.mime_type.split('/')[1]}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-border-subtle">
          {!isPublished && !isDeleted && (
            <button
              onClick={onPublish}
              className="flex-1 btn btn-sm btn-success flex items-center justify-center gap-1"
              title="Publish"
            >
              <CheckCircle className="w-4 h-4" />
              Publish
            </button>
          )}
          <button
            onClick={onViewVersions}
            className="p-2 btn btn-sm btn-secondary"
            title="Version History"
          >
            <History className="w-4 h-4" />
          </button>
          {isDeleted ? (
            <button
              onClick={onRestore}
              className="p-2 btn btn-sm btn-primary"
              title="Restore"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onDelete}
              className="p-2 btn btn-sm btn-danger"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ImageCard);