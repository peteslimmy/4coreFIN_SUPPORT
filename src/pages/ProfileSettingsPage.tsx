import { useState, useEffect, type ChangeEvent } from 'react';
import { User, Lock, Save, Camera, Eye, EyeOff, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { authorizedFetch } from '../lib/api';
import PasswordStrengthMeter from '../components/admin/PasswordStrengthMeter';
import { isPasswordValid } from '../components/admin/passwordStrength';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function ProfileSettingsPage() {
  const { currentUser, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

  // Profile state
  const [profile, setProfile] = useState({
    firstName: currentUser.firstName || '',
    lastName: currentUser.lastName || '',
    email: currentUser.email || '',
    title: '',
    bio: '',
    timezone: 'Africa/Lagos',
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwVerified, setPwVerified] = useState(false);

  // Load profile on mount
  useEffect(() => {
    authorizedFetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        setProfile({
          firstName: data.firstName || data.name?.split(' ')[0] || '',
          lastName: data.lastName || data.name?.split(' ').slice(1).join(' ') || '',
          email: data.email || '',
          title: data.profile?.title || '',
          bio: data.profile?.bio || '',
          timezone: data.profile?.timezone || 'Africa/Lagos',
        });
        setAvatarUrl(data.profile?.avatar_url || null);
      })
      .catch(() => {});
  }, []);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await authorizedFetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    const data = await res.json();
    if (data.url) {
      setAvatarUrl(data.url);
      showToast('Avatar updated', 'success');
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await authorizedFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) showToast('Profile updated', 'success');
      else showToast('Failed to update profile', 'error');
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyPassword = async () => {
    const res = await authorizedFetch('/api/auth/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: currentPassword }),
    });
    const data = await res.json();
    setPwVerified(data.valid);
    if (!data.valid) showToast('Current password is incorrect', 'error');
  };

  const handleChangePassword = async () => {
    if (!isPasswordValid(newPassword)) {
      showToast('New password does not meet strength requirements', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setChangingPw(true);
    try {
      const res = await authorizedFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Password changed successfully', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPwVerified(false);
      } else {
        showToast(data.error || 'Failed to change password', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  const initials = (profile.firstName[0] + profile.lastName[0]).toUpperCase();

  return (
    <PageTransition>
      <PageContainer maxWidth="full">
        <PageHeader title="Profile Settings" subtitle="Manage your account information and security" breadcrumbs={[{ label: 'Home' }, { label: 'Account' }, { label: 'Profile' }]} />

        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <div className="w-full md:w-48 shrink-0">
            <nav className="space-y-1">
              <button onClick={() => setActiveTab('profile')}               className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${activeTab === 'profile' ? 'bg-primary-light text-primary-dark border border-primary' : 'text-text-muted hover:bg-surface-hover'}`}>
                <User className="w-4 h-4" /> Profile
              </button>
              <button onClick={() => setActiveTab('security')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${activeTab === 'security' ? 'bg-primary-light text-primary-dark border border-primary' : 'text-text-muted hover:bg-surface-hover'}`}>
                <Lock className="w-4 h-4" /> Security
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 bg-surface-elevated rounded-xl p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-xl">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-border" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-white text-xl font-bold border-2 border-border">
                        {initials}
                      </div>
                    )}
                     <label className="absolute bottom-0 right-0 w-7 h-7 bg-accent text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-accent-light transition">
                      <Camera className="w-3.5 h-3.5" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{profile.firstName + ' ' + profile.lastName}</p>
                    <p className="text-xs text-text-muted">{profile.email}</p>
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-primary block mb-1.5">First Name</label>
                      <input type="text" value={profile.firstName} onChange={(e) => setProfile(p => ({ ...p, firstName: e.target.value }))} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-primary block mb-1.5">Last Name</label>
                      <input type="text" value={profile.lastName} onChange={(e) => setProfile(p => ({ ...p, lastName: e.target.value }))} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary block mb-1.5">Email</label>
                    <input type="email" value={profile.email} disabled className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-muted cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary block mb-1.5">Title / Role</label>
                    <input type="text" value={profile.title} onChange={(e) => setProfile(p => ({ ...p, title: e.target.value }))} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" placeholder="e.g. Senior Support Engineer" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary block mb-1.5">Bio</label>
                    <textarea value={profile.bio} onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))} rows={3} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring resize-none text-text-primary" placeholder="Tell us about yourself..." />
                  </div>
                </div>

                <button onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-semibold transition disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6 max-w-xl">
                <h3 className="text-sm font-bold text-text-primary">Change Password</h3>

                <div>
                       <label className="text-xs font-medium text-text-secondary block mb-1">Current Password</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                       <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPwVerified(false); }} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 pr-10 focus:ring-1 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring" />
                      <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button onClick={handleVerifyPassword} disabled={!currentPassword} className="px-3 py-2 bg-surface text-text-secondary rounded-lg text-xs font-semibold hover:bg-surface-elevated transition disabled:opacity-50 shrink-0">
                      {pwVerified ? <Check className="w-4 h-4 text-success" /> : 'Verify'}
                    </button>
                  </div>
                </div>

                {pwVerified && (
                  <>
                    <div>
                       <label className="text-xs font-medium text-text-secondary block mb-1">New Password</label>
                      <div className="relative">
                         <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 pr-10 focus:ring-1 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring" />
                         <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                          {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <PasswordStrengthMeter password={newPassword} />
                    </div>
                    <div>
                       <label className="text-xs font-medium text-text-secondary block mb-1">Confirm New Password</label>
                       <input type={showNewPw ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring" />
                      {confirmPassword && newPassword !== confirmPassword && (
                        <p className="text-xs text-error mt-1">Passwords do not match</p>
                      )}
                    </div>
                    <button onClick={handleChangePassword} disabled={changingPw || !isPasswordValid(newPassword) || newPassword !== confirmPassword} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent-light transition disabled:opacity-50">
                      <Lock className="w-4 h-4" /> {changingPw ? 'Changing...' : 'Change Password'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </PageTransition>
  );
}
