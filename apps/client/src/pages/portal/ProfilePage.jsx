import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  BusyButton,
  CardTitle,
  DashCard,
  FormField,
  PageHeader,
  PasswordField,
  authApi,
  collectErrors,
  formatDateLong,
  formatMobile,
  initials,
  required,
  toISODate,
  tokens,
  useDocumentTitle,
  useNotify,
  validateMobile,
  validatePassword
} from '@tm/shared';
import { useAuth } from '../../auth.js';

/** My profile: contact details and password. */
export default function ProfilePage() {
  useDocumentTitle('My profile');
  const notify = useNotify();
  const navigate = useNavigate();
  const { user, updateUser, signOut } = useAuth();

  // Profile form
  const [profile, setProfile] = useState({ name: user.name, mobile: formatMobile(user.mobile), company: user.company || '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password form
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  // Pick up the latest details (in case they changed elsewhere)
  useEffect(() => {
    authApi.getCustomerProfile(user.id).then((fresh) => {
      setProfile({ name: fresh.name, mobile: formatMobile(fresh.mobile), company: fresh.company || '' });
    }).catch(() => {});
  }, [user.id]);

  // True when the form differs from the saved profile (spaces in the mobile number are ignored)
  const dirty = profile.name.trim() !== user.name || profile.mobile.replace(/\s/g, '') !== user.mobile || (profile.company || '') !== (user.company || '');

  // Validate name and mobile, save, and update the signed-in user so the new name shows everywhere
  const saveProfile = async (e) => {
    e.preventDefault();
    const found = collectErrors(profile, {
      name: (v) => required(v, 'Full name') || (v.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : ''),
      mobile: validateMobile
    });
    setProfileErrors(found);
    if (Object.keys(found).length) return;
    setSavingProfile(true);
    try {
      const saved = await authApi.updateCustomerProfile(user.id, profile);
      updateUser(saved);
      notify('Profile updated.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Validate the three password fields, change the password, and clear the form
  const savePassword = async (e) => {
    e.preventDefault();
    const found = collectErrors(pw, {
      current: (v) => (v ? '' : 'Enter your current password.'),
      next: (v, all) => validatePassword(v) || (v === all.current ? 'Choose a password different from the current one.' : ''),
      confirm: (v, all) => (v === all.next ? '' : 'Passwords do not match.')
    });
    setPwErrors(found);
    if (Object.keys(found).length) return;
    setSavingPw(true);
    try {
      await authApi.changeCustomerPassword(user.id, pw);
      setPw({ current: '', next: '', confirm: '' });
      notify('Password changed.');
    } catch (err) {
      if (err.meta && err.meta.field) setPwErrors({ [err.meta.field]: err.message });
      else notify(err.message, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Keep your contact details current so our team can reach you about your events." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
        <DashCard component="form" noValidate onSubmit={saveProfile}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
            <Avatar sx={{ width: 64, height: 64, fontSize: 22, fontWeight: 700, bgcolor: tokens.gold, color: tokens.onGold }}>{initials(user.name)}</Avatar>
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{user.name}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{user.email}</Typography>
              {user.createdAt && <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Member since {formatDateLong(toISODate(new Date(user.createdAt)))}</Typography>}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormField id="profile-name" label="Full name" required value={profile.name} onChange={(e) => { setProfile((p) => ({ ...p, name: e.target.value })); setProfileErrors({}); }} error={profileErrors.name} />
            <FormField id="profile-email" label="Email" value={user.email} disabled hint="To change your login email, message our team." />
            <FormField id="profile-mobile" label="Mobile" required type="tel" value={profile.mobile} onChange={(e) => { setProfile((p) => ({ ...p, mobile: e.target.value })); setProfileErrors({}); }} error={profileErrors.mobile} />
            <FormField id="profile-company" label="Company" optional value={profile.company} onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))} hint="For official receipts under a company name." />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <BusyButton type="submit" busy={savingProfile} disabled={!dirty}>
                Save changes
              </BusyButton>
            </Box>
          </Box>
        </DashCard>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <DashCard component="form" noValidate onSubmit={savePassword}>
            <CardTitle subtitle="8 characters or more, with a number">Change password</CardTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <PasswordField id="pw-current" label="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => { setPw((p) => ({ ...p, current: e.target.value })); setPwErrors({}); }} error={pwErrors.current} />
              <PasswordField id="pw-next" label="New password" autoComplete="new-password" value={pw.next} onChange={(e) => { setPw((p) => ({ ...p, next: e.target.value })); setPwErrors({}); }} error={pwErrors.next} />
              <PasswordField id="pw-confirm" label="Confirm new password" autoComplete="new-password" value={pw.confirm} onChange={(e) => { setPw((p) => ({ ...p, confirm: e.target.value })); setPwErrors({}); }} error={pwErrors.confirm} />
              <Box>
                <BusyButton type="submit" busy={savingPw}>
                  Update password
                </BusyButton>
              </Box>
            </Box>
          </DashCard>

          <DashCard>
            <CardTitle>Session</CardTitle>
            <AlertBanner tone="info">For your security you are signed out after 15 minutes of inactivity.</AlertBanner>
            {/* Log out: go to the home page, then end the session */}
            <Button color="error" variant="outlined" sx={{ mt: 2 }} onClick={() => {
              navigate('/', { replace: true });
              signOut();
            }}>
              Log out of this device
            </Button>
          </DashCard>
        </Box>
      </Box>
    </>
  );
}
