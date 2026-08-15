import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressWizard from './ProgressWizard';
import { TicketStatus } from '../../types/app';
import { getTicketStatusStep, TICKET_STATUS_ORDER, TICKET_STATUS_LABELS } from '../../lib/utils';

const LABELS = TICKET_STATUS_ORDER.map(s => TICKET_STATUS_LABELS[s]);

const renderBar = (status: TicketStatus | string) =>
  render(<ProgressWizard steps={LABELS.map(label => ({ label }))} currentStep={getTicketStatusStep(status)} />);

describe('ProgressWizard ticket status mapping', () => {
  it('places a CLOSED ticket on the terminal Closed step', () => {
    renderBar(TicketStatus.CLOSED);
    // The last step ("Closed") is the current/terminal step -> circle has aria-current="step".
    const closedLabel = screen.getByText('Closed');
    const step = closedLabel.closest('[role="listitem"]')!;
    const circle = step.querySelector('[aria-current="step"]');
    expect(circle).not.toBeNull();
    expect(circle?.getAttribute('aria-label') || '').toContain('Closed');
  });

  it('marks Resolved as completed (not active) for a CLOSED ticket', () => {
    renderBar(TicketStatus.CLOSED);
    const resolvedLabel = screen.getByText('Resolved');
    const step = resolvedLabel.closest('[role="listitem"]')!;
    // A completed step's circle does NOT carry aria-current="step".
    expect(step.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('marks the Closed step as pending (grey) when the ticket is only Resolved', () => {
    renderBar(TicketStatus.RESOLVED);
    const closedLabel = screen.getByText('Closed');
    const step = closedLabel.closest('[role="listitem"]')!;
    expect(step.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('getTicketStatusStep returns the Closed index (4) for CLOSED', () => {
    expect(getTicketStatusStep(TicketStatus.CLOSED)).toBe(4);
    expect(getTicketStatusStep(TicketStatus.RESOLVED)).toBe(3);
  });
});
