import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Image,
  XCircle,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import ImageCard from './ImageCard';
import ImageUploadWizard from './ImageUploadWizard';
import ImagePreviewModal from './ImagePreviewModal';
import VersionHistoryTimeline from './VersionHistoryTimeline';
import DeleteConfirmationModal from '../DeleteConfirmationModal';
import LoadingSpinner from '../ui/LoadingSpinner';

interface LandingPageImage {
  id: string;
  title: string;
  description: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  storage_path: string;
  thumbnail_path: string;
  mobile_path: string;
  desktop_path: string;
  alt_text: string;
  seo_title: string;
  seo_description: string;
  status: string;
  version: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  published_at?: string;
  expires_at?: string;
  thumbnail_url?: string;
  mobile_url?: string;
  desktop_url?: string;
}

export default function LandingPageManager() {
  const [images, setImages] = useState<LandingPageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [selectedImage, setSelectedImage] = useState<LandingPageImage | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<LandingPageImage | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const { showToast } = useToast();

   const fetchImages = useCallback(async () => {
     try {
       setLoading(true);
       const params = new URLSearchParams();
       if (filter !== 'all') params.append('status', filter);

       const response = await fetch(`/api/landing-page/images?${params.toString()}`, {
         credentials: 'include',
       });

       if (!response.ok) throw new Error('Failed to fetch images');

       const data = await response.json();
       setImages(data.images || []);
} catch {
        showToast('Failed to load images', 'error');
      } finally {
        setLoading(false);
      }
    }, [filter, showToast]);

   useEffect(() => {
     const timer = setTimeout(() => {
       fetchImages();
     }, 0);
     return () => clearTimeout(timer);
   }, [fetchImages]);

  const handleUploadComplete = () => {
    setShowUploadWizard(false);
    fetchImages();
    showToast('Image uploaded successfully', 'success');
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const response = await fetch(`/api/landing-page/images/${deleteConfirm.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete image');

      setImages(images.filter(img => img.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      showToast('Image deleted successfully', 'success');
    } catch { /* ignore */ } {
      showToast('Failed to delete image', 'error');
    }
  };

  const handleRestore = async (image: LandingPageImage) => {
    try {
      const response = await fetch(`/api/landing-page/images/${image.id}/restore`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to restore image');

      setImages(images.map(img =>
        img.id === image.id ? { ...img, deleted_at: null } : img
      ));
      showToast('Image restored successfully', 'success');
    } catch { /* ignore */ } {
      showToast('Failed to restore image', 'error');
    }
  };

  const handlePublish = async (image: LandingPageImage) => {
    try {
      const response = await fetch(`/api/landing-page/images/${image.id}/publish`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to publish image');

      setImages(images.map(img =>
        img.id === image.id ? { ...img, status: 'published', published_at: new Date().toISOString() } : img
      ));
      showToast('Image published successfully', 'success');
    } catch { /* ignore */ } {
      showToast('Failed to publish image', 'error');
    }
  };

  const handlePreview = (image: LandingPageImage) => {
    setSelectedImage(image);
    setShowPreview(true);
  };

  const handleViewVersions = (image: LandingPageImage) => {
    setSelectedImage(image);
    setShowVersions(true);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: { icon: AlertCircle, color: 'bg-warning-light text-text-primary border-warning', label: 'Draft' },
      published: { icon: CheckCircle, color: 'bg-success-light text-text-primary border-success', label: 'Published' },
      archived: { icon: XCircle, color: 'bg-surface-card text-text-primary border-border', label: 'Archived' },
    };
    const badge = badges[status as keyof typeof badges] || badges.draft;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Landing Page Manager</h1>
          <p className="text-text-secondary mt-1">Manage hero images and visual content for your landing page</p>
        </div>
        <button
          onClick={() => setShowUploadWizard(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          Upload Image
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-accent text-[#fff]'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          All Images
        </button>
        <button
          onClick={() => setFilter('draft')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'draft'
              ? 'bg-accent text-[#fff]'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          Drafts
        </button>
        <button
          onClick={() => setFilter('published')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'published'
              ? 'bg-accent text-[#fff]'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          Published
        </button>
        <button
          onClick={() => setFilter('archived')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'archived'
              ? 'bg-accent text-[#fff]'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          Archived
        </button>
      </div>

      {/* Image Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border-subtle rounded-xl">
          <Image className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No images found</h3>
          <p className="text-text-secondary mb-4">Get started by uploading your first hero image</p>
          <button
            onClick={() => setShowUploadWizard(true)}
            className="btn btn-primary"
          >
            Upload Image
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {images.map((image) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <ImageCard
                  image={image}
                  onPreview={() => handlePreview(image)}
                  onPublish={() => handlePublish(image)}
                  onDelete={() => setDeleteConfirm(image)}
                  onRestore={() => handleRestore(image)}
                  onViewVersions={() => handleViewVersions(image)}
                  getStatusBadge={getStatusBadge}
                  formatFileSize={formatFileSize}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Upload Wizard Modal */}
      <AnimatePresence>
        {showUploadWizard && (
          <ImageUploadWizard
            onClose={() => setShowUploadWizard(false)}
            onSuccess={handleUploadComplete}
          />
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && selectedImage && (
          <ImagePreviewModal
            image={selectedImage}
            onClose={() => {
              setShowPreview(false);
              setSelectedImage(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Version History Modal */}
      <AnimatePresence>
        {showVersions && selectedImage && (
          <VersionHistoryTimeline
            imageId={selectedImage.id}
            currentVersion={selectedImage.version}
            onClose={() => {
              setShowVersions(false);
              setSelectedImage(null);
            }}
            onRollback={() => {
              fetchImages();
              setShowVersions(false);
              setSelectedImage(null);
            }}
          />
        )}
      </AnimatePresence>

{/* Delete Confirmation Modal */}
<AnimatePresence>
{deleteConfirm && (
<DeleteConfirmationModal
  isOpen={!!deleteConfirm}
  title="Delete Image"
  message={`Are you sure you want to delete "${deleteConfirm.title}"? This action can be undone.`}
  onConfirm={handleDelete}
  onClose={() => setDeleteConfirm(null)}
/>
)}
</AnimatePresence>
    </div>
  );
}