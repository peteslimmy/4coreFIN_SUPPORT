import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import Modal from '../ui/Modal';
import type { LandingPageImage } from './types';

interface ImagePreviewModalProps {
  image: LandingPageImage;
  onClose: () => void;
}

export default function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps) {
  const zoomLevels = [50, 75, 100, 125, 150];
  const [zoom, setZoom] = useState(100);

  return (
    <AnimatePresence>
      <Modal open={true} onClose={onClose} title={image.title} size="xl">
        <div className="flex flex-col h-[70vh] max-h-[90vh]">
          {/* Header with zoom controls */}
          <div className="flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
            <div>
              <p className="text-sm text-text-secondary">
                {image.width} × {image.height} • {(image.file_size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(Math.max(...zoomLevels.filter(z => z < zoom)))}
                aria-label="Zoom out"
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors focus-ring"
                disabled={zoom <= zoomLevels[0]}
              >
                <ZoomOut className="w-5 h-5 text-text-secondary" />
              </button>
              <span className="text-sm text-text-secondary w-16 text-center">{zoom}%</span>
              <button
                onClick={() => setZoom(Math.min(...zoomLevels.filter(z => z > zoom)))}
                aria-label="Zoom in"
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors focus-ring"
                disabled={zoom >= zoomLevels[zoomLevels.length - 1]}
              >
                <ZoomIn className="w-5 h-5 text-text-secondary" />
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
          <div className="p-4 border-t border-border-subtle flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>Status: <span className="font-medium text-text-primary capitalize">{image.status}</span></span>
              <span>Version: <span className="font-medium text-text-primary">v{image.version}</span></span>
              <span>Format: <span className="font-medium text-text-primary uppercase">{image.mime_type.split('/')[1]}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-all duration-200 focus-ring flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </AnimatePresence>
  );
}