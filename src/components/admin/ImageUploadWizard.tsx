import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Check, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

interface ImageUploadWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadState {
  file: File | null;
  preview: string | null;
  title: string;
  description: string;
  alt_text: string;
  seo_title: string;
  seo_description: string;
  status: 'draft' | 'published';
  validating: boolean;
  uploadProgress: number;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  } | null;
}

export default function ImageUploadWizard({ onClose, onSuccess }: ImageUploadWizardProps) {
  const [state, setState] = useState<UploadState>({
    file: null,
    preview: null,
    title: '',
    description: '',
    alt_text: 'Enterprise Operations & Compliance Platform',
    seo_title: '',
    seo_description: '',
    status: 'draft',
    validating: false,
    uploadProgress: 0,
    metadata: null,
  });
  const { showToast } = useToast();

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Invalid file type. Only JPEG, PNG, WebP, and SVG are allowed.', 'error');
      return;
    }

    // Create preview
    const preview = URL.createObjectURL(file);

    setState(prev => ({
      ...prev,
      file,
      preview,
      validating: true,
      title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
    }));

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/landing-page/images/validate', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (data.valid) {
        setState(prev => ({
          ...prev,
          validating: false,
          metadata: data.metadata,
        }));
      } else {
        showToast(data.error || 'Invalid image file', 'error');
        setState(prev => ({
          ...prev,
          file: null,
          preview: null,
          validating: false,
        }));
      }
    } catch (error) {
      showToast('Failed to validate image', 'error');
      setState(prev => ({
        ...prev,
        file: null,
        preview: null,
        validating: false,
      }));
    }
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(event);
    }
  }, [handleFileSelect]);

  const handleSubmit = async () => {
    if (!state.file) {
      showToast('Please select an image', 'error');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', state.file);
      formData.append('title', state.title);
      formData.append('description', state.description);
      formData.append('alt_text', state.alt_text);
      formData.append('seo_title', state.seo_title);
      formData.append('seo_description', state.seo_description);
      formData.append('status', state.status);

      const response = await fetch('/api/landing-page/images', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      onSuccess();
    } catch (error) {
      showToast(error.message || 'Failed to upload image', 'error');
    }
  };

  const reset = () => {
    setState({
      file: null,
      preview: null,
      title: '',
      description: '',
      alt_text: 'Enterprise Operations & Compliance Platform',
      seo_title: '',
      seo_description: '',
      status: 'draft',
      validating: false,
      uploadProgress: 0,
      metadata: null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-card border border-border-subtle rounded-xl shadow-3 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <h2 className="text-2xl font-bold text-text-primary">Upload Hero Image</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Upload Area */}
          {!state.file ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-border-subtle rounded-xl p-12 text-center hover:border-accent transition-colors cursor-pointer"
            >
              <input
                type="file"
                id="image-upload"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleFileSelect}
                className="hidden"
              />
              <label htmlFor="image-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-text-primary font-medium mb-2">
                  Drop your image here or click to browse
                </p>
                <p className="text-sm text-text-secondary">
                  Supports JPEG, PNG, WebP, SVG (max 10MB)
                </p>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="relative aspect-video bg-surface-hover rounded-lg overflow-hidden">
                <img
                  src={state.preview || ''}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={reset}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-lg backdrop-blur-sm transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Metadata */}
              {state.metadata && (
                <div className="bg-surface-hover rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Dimensions:</span>
                    <span className="font-medium">{state.metadata.width} × {state.metadata.height}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Format:</span>
                    <span className="font-medium uppercase">{state.metadata.format}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">File Size:</span>
                    <span className="font-medium">{(state.metadata.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Title <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={state.title}
                  onChange={(e) => setState(prev => ({ ...prev, title: e.target.value }))}
                  className="input w-full"
                  placeholder="Enter image title"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Description
                </label>
                <textarea
                  value={state.description}
                  onChange={(e) => setState(prev => ({ ...prev, description: e.target.value }))}
                  className="input w-full h-24 resize-none"
                  placeholder="Enter image description"
                />
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Alt Text <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={state.alt_text}
                  onChange={(e) => setState(prev => ({ ...prev, alt_text: e.target.value }))}
                  className="input w-full"
                  placeholder="Enter alt text for accessibility"
                  required
                />
              </div>

              {/* SEO Title */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  SEO Title
                </label>
                <input
                  type="text"
                  value={state.seo_title}
                  onChange={(e) => setState(prev => ({ ...prev, seo_title: e.target.value }))}
                  className="input w-full"
                  placeholder="Enter SEO title"
                />
              </div>

              {/* SEO Description */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  SEO Description
                </label>
                <textarea
                  value={state.seo_description}
                  onChange={(e) => setState(prev => ({ ...prev, seo_description: e.target.value }))}
                  className="input w-full h-24 resize-none"
                  placeholder="Enter SEO description"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Status
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="draft"
                      checked={state.status === 'draft'}
                      onChange={(e) => setState(prev => ({ ...prev, status: e.target.value as 'draft' | 'published' }))}
                      className="w-4 h-4 text-accent"
                    />
                    <span className="text-sm">Draft</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="published"
                      checked={state.status === 'published'}
                      onChange={(e) => setState(prev => ({ ...prev, status: e.target.value as 'draft' | 'published' }))}
                      className="w-4 h-4 text-accent"
                    />
                    <span className="text-sm">Published</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border-subtle">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          {state.file && (
            <button
              onClick={handleSubmit}
              disabled={!state.title}
              className="btn btn-primary flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Upload Image
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}