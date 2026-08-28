import type { Meta, StoryObj } from '@storybook/react';
import IncidentLifecycleControls from './IncidentLifecycleControls';

const meta: Meta<typeof IncidentLifecycleControls> = {
  title: 'MajorIncidents/IncidentLifecycleControls',
  component: IncidentLifecycleControls,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof IncidentLifecycleControls>;

const baseIncident = {
  id: 'MI-2024-001',
  name: 'Parkway API Settlement Delay',
  description: '',
  partner: 'Parkway',
  category: 'Settlement Delay',
  severity: 'CRITICAL',
  active: true,
  ticketCount: 12,
  createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  timeline: [],
  notifications: [],
};

export const Declared: Story = {
  args: {
    incident: { ...baseIncident, status: 'DECLARED' },
    canManage: true,
    onTransition: (id, target) => console.log('Transition', id, target),
    onAcknowledge: () => console.log('Acknowledge'),
  },
};

export const Investigating: Story = {
  args: {
    incident: { ...baseIncident, status: 'INVESTIGATING' },
    canManage: true,
    onTransition: (id, target) => console.log('Transition', id, target),
    onAcknowledge: () => console.log('Acknowledge'),
  },
};

export const Monitoring: Story = {
  args: {
    incident: { ...baseIncident, status: 'MONITORING' },
    canManage: true,
    onTransition: (id, target) => console.log('Transition', id, target),
    onAcknowledge: () => console.log('Acknowledge'),
  },
};

export const Closed: Story = {
  args: {
    incident: { ...baseIncident, status: 'CLOSED', active: false },
    canManage: true,
    onTransition: (id, target) => console.log('Transition', id, target),
    onAcknowledge: () => console.log('Acknowledge'),
  },
};

export const ReadOnly: Story = {
  args: {
    incident: { ...baseIncident, status: 'INVESTIGATING' },
    canManage: false,
    onTransition: (id, target) => console.log('Transition', id, target),
    onAcknowledge: () => console.log('Acknowledge'),
  },
};
