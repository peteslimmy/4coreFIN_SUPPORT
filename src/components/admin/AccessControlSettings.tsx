import { useState, type ReactNode } from 'react';
import { Plus, Shield, Save, Lock, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { PERMISSION_GROUPS, ALL_PERMISSIONS, isSuperAdminRole } from '../../lib/rbac';
import type { RoleDefinition, Permission } from '../../types/rbac';
import { syncConfig } from '../../lib/sync';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

export default function AccessControlSettings() {
  const { roles, setRoles, showToast, logAuditAction } = useApp();
  const [edits, setEdits] = useState<Record<string, Permission[]>>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const permsFor = (role: RoleDefinition): Permission[] =>
    edits[role.id] ?? (role.permissions === '*' ? [...ALL_PERMISSIONS] : [...role.permissions]);

  const togglePerm = (role: RoleDefinition, permission: Permission) => {
    if (isSuperAdminRole(role)) return;
    setEdits(prev => {
      const current = prev[role.id] ?? (role.permissions === '*' ? [...ALL_PERMISSIONS] : [...role.permissions]);
      const next = current.includes(permission)
        ? current.filter(p => p !== permission)
        : [...current, permission];
      return { ...prev, [role.id]: next };
    });
  };

  const saveRoles = () => {
    const updated = roles.map(role => {
      if (isSuperAdminRole(role)) return role;
      if (!(role.id in edits)) return role;
      return { ...role, permissions: edits[role.id] };
    });
    setRoles(updated);
    syncConfig('roles', updated);
    logAuditAction(null, 'ADMIN_ACCESS_CONTROL_UPDATED', `Updated permissions for ${Object.keys(edits).length} role(s).`);
    setEdits({});
    showToast('Access control permissions saved.', 'success');
  };

  const createRole = () => {
    const name = newRoleName.trim();
    if (!name) { showToast('Role name is required.', 'error'); return; }
    const id = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if (roles.some(r => r.id === id)) { showToast(`Role "${id}" already exists.`, 'error'); return; }
    const role: RoleDefinition = {
      id,
      name,
      description: newRoleDesc.trim() || `${name} custom role`,
      isSystem: false,
      buScoped: true,
      permissions: [],
    };
    setRoles([...roles, role]);
    syncConfig('roles', [...roles, role]);
    logAuditAction(null, 'ADMIN_ROLE_CREATED', `Created custom role ${id}.`);
    setNewRoleName('');
    setNewRoleDesc('');
    showToast(`Custom role "${id}" created.`, 'success');
  };

  const deleteRole = (role: RoleDefinition) => {
    if (role.isSystem) return;
    const updated = roles.filter(r => r.id !== role.id);
    setRoles(updated);
    syncConfig('roles', updated);
    logAuditAction(null, 'ADMIN_ROLE_DELETED', `Deleted custom role ${role.id}.`);
    showToast(`Role "${role.id}" deleted.`, 'success');
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary flex items-center gap-2"><Shield className="w-5 h-5 text-accent-light" /> Role & Permission Matrix</h3>
        <p className="text-body-sm text-text-muted mt-0.5">Control what each role can do. The Super Admin role is fixed and always retains full access.</p>
      </div>

      <Section title="Create Custom Role">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input label="Role name" placeholder="e.g. Compliance Officer" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
          <div className="flex-1">
            <Input label="Description" placeholder="What this role is for" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outlined" size="sm" icon={<Plus className="w-4 h-4" />} onClick={createRole}>Add Role</Button>
          </div>
        </div>
      </Section>

      <div className="space-y-4">
        {roles.map(role => {
          const superAdmin = isSuperAdminRole(role);
          const perms = permsFor(role);
          return (
            <div key={role.id} className={`border rounded-xl p-4 ${superAdmin ? 'border-accent-light/40 bg-accent-light/5' : 'border-border bg-surface-card'}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">{role.name}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-hover text-text-muted">{role.id}</span>
                  {superAdmin && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-accent/15 text-accent-light">
                      <Lock className="w-3 h-3" /> Fixed / Full Access
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!superAdmin && (
                    <button type="button" onClick={() => deleteRole(role)} className="p-1.5 rounded text-text-muted hover:text-error cursor-pointer" aria-label={`Delete ${role.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {edits[role.id] && !superAdmin && (
                    <span className="text-[10px] font-bold text-accent-light uppercase">Unsaved changes</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-text-muted mb-3">{role.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.group}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1 mt-2">{group.group}</p>
                    {group.permissions.map(p => {
                      const checked = superAdmin || perms.includes(p.id);
                      return (
                        <label key={p.id} className={`flex items-center gap-2 py-0.5 text-xs cursor-pointer ${superAdmin ? 'opacity-70' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={superAdmin}
                            onChange={() => togglePerm(role, p.id)}
                            className="w-3.5 h-3.5 accent-primary cursor-pointer"
                          />
                          <span className={checked ? 'text-text-primary font-medium' : 'text-text-muted'}>{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3 text-[11px] text-text-muted">
                <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> {superAdmin ? 'All permissions (wildcard)' : `${perms.length} / ${ALL_PERMISSIONS.length} permissions granted`}</span>
                <span className={`font-semibold ${role.buScoped ? 'text-text-secondary' : 'text-accent-light'}`}>{role.buScoped ? 'Business-unit scoped' : 'Global scope'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="primary" size="sm" icon={<Save className="w-4 h-4" />} onClick={saveRoles} disabled={Object.keys(edits).length === 0}>
          Save All Permission Changes
        </Button>
      </div>
    </div>
  );
}
