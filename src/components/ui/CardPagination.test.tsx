import { render, screen, fireEvent } from '@testing-library/react';
import Card from './Card';
import Pagination from './Pagination';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders title, subtitle, icon and actions', () => {
    render(
      <Card title="Summary" subtitle="Q3 report" icon={<span>★</span>} actions={<button>Export</button>}>
        body
      </Card>
    );
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Q3 report')).toBeInTheDocument();
    expect(screen.getByText('★')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('applies padding variants', () => {
    const { container } = render(<Card padding="none">x</Card>);
    const inner = container.querySelector('div > div');
    expect(inner?.className).not.toContain('p-');
  });

  it('invokes onClick when clickable', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Clickable</Card>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Pagination', () => {
  it('renders range and total', () => {
    render(<Pagination page={1} pageSize={10} total={42} onChange={() => {}} />);
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText('1–10')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('clamps page beyond last', () => {
    render(<Pagination page={99} pageSize={10} total={25} onChange={() => {}} />);
    // totalPages = 3; page 3 must be the current active one
    const current = screen.getByRole('button', { name: 'Page 3' });
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('calls onChange with next page', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={30} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('disables prev on first page', () => {
    render(<Pagination page={1} pageSize={10} total={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('emits page size change', () => {
    const onPageSizeChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={30} onChange={() => {}} onPageSizeChange={onPageSizeChange} />);
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });
});
