import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders message', () => {
    render(<EmptyState title="No items" message="Add your first item" />);
    expect(screen.getByText('Add your first item')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="No items"
        action={{ label: 'Add Item', onClick: vi.fn() }}
      />
    );
    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const Icon = () => <svg data-testid="custom-icon" />;
    render(<EmptyState title="No items" icon={<Icon />} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('has status role for accessibility', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-live polite for screen readers', () => {
    render(<EmptyState title="No items" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
