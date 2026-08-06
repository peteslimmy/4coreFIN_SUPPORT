import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageContainer from '../layout/PageContainer';

describe('PageContainer', () => {
  it('renders children', () => {
    render(<PageContainer><p>Test content</p></PageContainer>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies compact padding scale', () => {
    const { container } = render(<PageContainer><p>Test</p></PageContainer>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/p-3/);
  });

  it('applies maxWidth when specified', () => {
    const { container } = render(<PageContainer maxWidth="lg"><p>Test</p></PageContainer>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/max-w/);
  });

  it('accepts custom className', () => {
    const { container } = render(<PageContainer className="custom-class"><p>Test</p></PageContainer>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('custom-class');
  });
});
