import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

interface ImageSEOEditorProps {
  image: {
    id: string;
    title: string;
    alt_text: string;
    seo_title: string;
    seo_description: string;
  };
  onClose: () => void;
  onSave: () => void;
}

export default function ImageSEOEditor({ image, onClose, onSave }: ImageSEOEditorProps) {
  const [formData, setFormData] = useState({
    alt_text: image.alt_text || '',
    seo_title: image.seo_title || '',
    seo_description: image.seo_description || '',
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setSaving(true);
      const response = await fetch(`/api/landing-page/images/${image.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to update SEO metadata');

      showToast('SEO metadata updated successfully', 'success');
      onSave();
      onClose();
    } catch {
      showToast('Failed to update SEO metadata', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-card border border-border-subtle rounded-xl shadow-3 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border-subtle">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Edit SEO & Accessibility</h2>
              <p className="text-sm text-text-secondary mt-1">{image.title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Alt Text */}
            <div>
              <label htmlFor="seo-alt-text" className="block text-sm font-medium text-text-primary mb-2">
                Alt Text <span className="text-error">*</span>
              </label>
              <textarea
                id="seo-alt-text"
                value={formData.alt_text}
                onChange={(e) => setFormData(prev => ({ ...prev, alt_text: e.target.value }))}
                className="input w-full h-24 resize-none"
                placeholder="Describe the image for accessibility and SEO"
                required
              />
              <p className="text-xs text-text-muted mt-1">
                Used by screen readers and search engines
              </p>
            </div>

            {/* SEO Title */}
            <div>
              <label htmlFor="seo-title" className="block text-sm font-medium text-text-primary mb-2">
                SEO Title
              </label>
              <input
                id="seo-title"
                type="text"
                value={formData.seo_title}
                onChange={(e) => setFormData(prev => ({ ...prev, seo_title: e.target.value }))}
                className="input w-full"
                placeholder="Enter SEO title (max 60 characters)"
                maxLength={60}
              />
              <p className="text-xs text-text-muted mt-1">
                {formData.seo_title.length}/60 characters
              </p>
            </div>

            {/* SEO Description */}
            <div>
              <label htmlFor="seo-description" className="block text-sm font-medium text-text-primary mb-2">
                SEO Description
              </label>
              <textarea
                id="seo-description"
                value={formData.seo_description}
                onChange={(e) => setFormData(prev => ({ ...prev, seo_description: e.target.value }))}
                className="input w-full h-24 resize-none"
                placeholder="Enter SEO description (max 160 characters)"
                maxLength={160}
              />
              <p className="text-xs text-text-muted mt-1">
                {formData.seo_description.length}/160 characters
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.alt_text}
              className="btn btn-primary flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#fff]/20 border-t-[#fff] rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}