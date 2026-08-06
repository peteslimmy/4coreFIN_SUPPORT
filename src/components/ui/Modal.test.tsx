import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('does not render when open is false', () => {
    render(<Modal open={false} onClose={() => {}} title="Test"><p>Content</p></Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with role="dialog" and aria-modal="true"', () => {
    render(<Modal open={true} onClose={() => {}} title="Test"><p>Content</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders title linked via aria-labelledby', () => {
    render(<Modal open={true} onClose={() => {}} title="My Modal"><p>Content</p></Modal>);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const title = document.getElementById(labelledBy!);
    expect(title).toHaveTextContent('My Modal');
  });

  it('renders close button with aria-label', () => {
    render(<Modal open={true} onClose={() => {}} title="Test"><p>Content</p></Modal>);
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="Test"><p>Content</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="Test"><p>Content</p></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders footer when provided', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test" footer={<button>OK</button>}>
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Modal open={true} onClose={() => {}} title="Test"><p>Modal body text</p></Modal>);
    expect(screen.getByText('Modal body text')).toBeInTheDocument();
  });

  it('does not have aria-labelledby when no title', () => {
    render(<Modal open={true} onClose={() => {}}><p>Content</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeNull();
  });
});
