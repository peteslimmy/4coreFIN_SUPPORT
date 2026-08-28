import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import type { LandingPageImage } from './types';

interface ImagePreviewModalProps {
  image: LandingPageImage;
  onClose: () => void;
}

export default function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps) {
  const zoomLevels = [50, 75, 100, 125, 150];
  const [zoom, setZoom] = useState(100);

  return (
    <div className="fixed inset-0 bg-surface/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-card border border-border-subtle rounded-xl shadow-3 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{image.title}</h2>
            <p className="text-sm text-text-secondary mt-1">
              {image.width} × {image.height} • {(image.file_size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(Math.max(...zoomLevels.filter(z => z < zoom)))}
              aria-label="Zoom out"
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
              disabled={zoom <= zoomLevels[0]}
            >
              <ZoomOut className="w-5 h-5 text-text-secondary" />
            </button>
            <span className="text-sm text-text-secondary w-16 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(...zoomLevels.filter(z => z > zoom)))}
              aria-label="Zoom in"
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
              disabled={zoom >= zoomLevels[zoomLevels.length - 1]}
            >
              <ZoomIn className="w-5 h-5 text-text-secondary" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-surface p-8">
          <img
            src={image.desktop_url || image.mobile_url || image.thumbnail_url}
            alt={image.alt_text}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom / 100})` }}
          />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-text-secondary">
            <span>Status: <span className="font-medium text-text-primary capitalize">{image.status}</span></span>
            <span>Version: <span className="font-medium text-text-primary">v{image.version}</span></span>
            <span>Format: <span className="font-medium text-text-primary uppercase">{image.mime_type.split('/')[1]}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}