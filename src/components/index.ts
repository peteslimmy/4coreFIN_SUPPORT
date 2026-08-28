/**
 * Component barrel — single import point for all design-system components.
 *
 * Usage:
 *   import { Button, Card, Badge } from '@/components';
 *
 * Legacy deep imports still work; this file is additive.
 */

// ── UI primitives ──────────────────────────────────────────────────────
export {
  Button,
  Badge,
  Input,
  Textarea,
  Label,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Switch,
  SwitchComponent,
  Checkbox,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSeparator,
  Slider,
  ToastContainer,
  useToast,
  Modal,
  Skeleton,
  EmptyState,
} from './ui';

// ── Layout ─────────────────────────────────────────────────────────────
export { default as AppShell } from './layout/AppShell';
export { default as PageContainer } from './layout/PageContainer';
export { default as PageHeader } from './layout/PageHeader';
export { default as PageTransition } from './layout/PageTransition';

// ── Ticket primitives ──────────────────────────────────────────────────
export {
  TicketCard,
  PriorityBadge,
  TransitionBlockers,
  SlaBreachBanner,
  SectionHeader,
  TicketMetadata,
  RcaReadout,
  DetailTabs,
  EvidenceTab,
} from './ticket';

// ── Feature-level (keep tree-shakeable via lazy import) ────────────────
export { default as BrandLogo } from './BrandLogo';
export { default as Sidebar } from './Sidebar';
export { default as ThemeToggle } from './ThemeToggle';
export { default as CommandPalette } from './CommandPalette';
