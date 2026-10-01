import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
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
import { EmailCodeDialog } from '../../components/EmailCode.jsx';
import PasswordResetDialog from '../../components/PasswordResetDialog.jsx';

/**
 * My profile: contact details and password. Changing the password takes the current one and a code
 * emailed to the account (Phase 12); "Forgot your current password?" resets it with an emailed code
 * instead. Either way this device stays signed in (the server renews its token) and every other one
 * is signed out.
 */
export default function ProfilePage() {
  useDocumentTitle('My profile');
  const notify = useNotify();
  const navigate = useNavigate();
  const { user, updateUser, signOut } = useAuth();

  // Profile form
  const [profile, setProfile] = useState({ name: user.name, mobile: formatMobile(user.mobile), company: user.company || '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password form, its emailed-code step (open while `challenge` is set) and the forgot-password dialog
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);

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

  // Validate the three password fields, then ask the server to check the current password and email a code
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
      setChallenge(await authApi.startPasswordChange({ current: pw.current, next: pw.next }));
    } catch (err) {
      // A wrong current password says how many tries are left before a 5-minute pause
      const left = err.code === 'INVALID_CREDENTIALS' && err.meta.remaining ? ` ${err.meta.remaining} ${err.meta.remaining === 1 ? 'attempt' : 'attempts'} left.` : '';
      if (err.meta && err.meta.field) setPwErrors({ [err.meta.field]: err.message + left });
      else notify(err.message, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  // The emailed code was right: the new password is saved and this device stays signed in
  const confirmCode = async (code) => {
    await authApi.confirmPasswordChange({ challengeId: challenge.challengeId, code });
    setChallenge(null);
    setPw({ current: '', next: '', confirm: '' });
    notify('Password changed. Other devices were signed out.');
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
              <Box>
                <PasswordField id="pw-current" label="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => { setPw((p) => ({ ...p, current: e.target.value })); setPwErrors({}); }} error={pwErrors.current} />
                <Link component="button" type="button" onClick={() => setResetOpen(true)} sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.goldDark }}>
                  Forgot your current password?
                </Link>
              </Box>
              <PasswordField id="pw-next" label="New password" autoComplete="new-password" value={pw.next} onChange={(e) => { setPw((p) => ({ ...p, next: e.target.value })); setPwErrors({}); }} error={pwErrors.next} />
              <PasswordField id="pw-confirm" label="Confirm new password" autoComplete="new-password" value={pw.confirm} onChange={(e) => { setPw((p) => ({ ...p, confirm: e.target.value })); setPwErrors({}); }} error={pwErrors.confirm} />
              <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>We email you a code to confirm the change before the new password is saved.</Typography>
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

      {/* Step 2 of the password change: the code emailed to the account */}
      <EmailCodeDialog
        challenge={challenge}
        title="Confirm your new password"
        actionLabel="Change password"
        onVerify={confirmCode}
        onResend={() => authApi.resendPasswordChangeCode(challenge.challengeId)}
        onRestart={(message) => {
          setChallenge(null);
          notify(message, 'error');
        }}
        onClose={() => setChallenge(null)}
      />

      {/* Forgot the current password: a reset by emailed code, without signing out */}
      <PasswordResetDialog
        open={resetOpen}
        accountEmail={user.email}
        onClose={() => setResetOpen(false)}
        onDone={() => {
          setResetOpen(false);
          setPw({ current: '', next: '', confirm: '' });
          setPwErrors({});
          notify('Password changed. Other devices were signed out.');
        }}
      />
    </>
  );
}
