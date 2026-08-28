import { Info } from 'lucide-react';
import { getAllTransitionBlockers } from '../../lib/ticketStateMachine';

export default function TransitionBlockers({ ticket, currentRole }: { ticket: { id?: string; status: string }; currentRole: string }) {
  const blockers = getAllTransitionBlockers(
    ticket as Parameters<typeof getAllTransitionBlockers>[0],
    currentRole as Parameters<typeof getAllTransitionBlockers>[1],
  );
  if (blockers.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-warning">
      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Before this ticket can move forward: <strong className="font-semibold">{blockers.join(', ')}</strong></span>
    </div>
  );
}
