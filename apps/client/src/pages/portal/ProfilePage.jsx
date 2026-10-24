import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  CardTitle,
  DashCard,
  FormField,
  MobileField,
  PasswordChecklist,
  PasswordField,
  authApi,
  collectErrors,
  formatDateLong,
  initials,
  nationalMobile,
  required,
  toISODate,
  tokens,
  useNotify,
  validateEmail,
  validateMobile,
  validatePassword
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { EmailCodeDialog } from '../../components/EmailCode.jsx';
import PasswordResetDialog from '../../components/PasswordResetDialog.jsx';

export default function ProfilePage() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { user, updateUser, signOut } = useAuth();

  const [profile, setProfile] = useState({ name: user.name, mobile: user.mobile, company: user.company || '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [emailErrors, setEmailErrors] = useState({});
  const [emailFormError, setEmailFormError] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailChallenge, setEmailChallenge] = useState(null);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState(user.hasPassword !== false);

  useEffect(() => {
    authApi
      .getCustomerProfile(user.id)
      .then((fresh) => {
        setProfile({ name: fresh.name, mobile: fresh.mobile, company: fresh.company || '' });
        setHasPassword(fresh.hasPassword !== false);
      })
      .catch(() => {});
  }, [user.id]);

  const dirty =
    profile.name.trim() !== user.name ||
    nationalMobile(profile.mobile) !== nationalMobile(user.mobile) ||
    (profile.company || '') !== (user.company || '');

  const saveProfile = async (e) => {
    e.preventDefault();
    const found = collectErrors(profile, {
      name: (v) =>
        required(v, 'Full name') || (v.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : ''),
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

  const openEmailChange = () => {
    if (!hasPassword) {
      notify('Set a password first to confirm changes to your login email.');
      setResetOpen(true);
      return;
    }
    setEmailForm({ email: '', password: '' });
    setEmailErrors({});
    setEmailFormError('');
    setEmailOpen(true);
  };

  const startEmailChange = async (e) => {
    e.preventDefault();
    const found = {};
    const emailProblem = validateEmail(emailForm.email);
    if (emailProblem) found.email = emailProblem;
    if (!emailForm.password) found.password = 'Enter your current password.';
    setEmailErrors(found);
    setEmailFormError('');
    if (Object.keys(found).length) return;

    setSavingEmail(true);
    try {
      const request = await authApi.startCustomerEmailChange(emailForm);
      setEmailChallenge(request);
      setEmailOpen(false);
      setEmailForm((current) => ({ ...current, password: '' }));
    } catch (err) {
      setEmailForm((current) => ({ ...current, password: '' }));
      if (err.meta && err.meta.field === 'email') setEmailErrors({ email: err.message });
      else if (err.meta && err.meta.field === 'current') {
        const left = err.meta.remaining
          ? ` ${err.meta.remaining} ${err.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`
          : '';
        setEmailErrors({ password: err.message + left });
      } else setEmailFormError(err.message);
    } finally {
      setSavingEmail(false);
    }
  };

  const finishEmailChange = (saved) => {
    updateUser(saved);
    setEmailChallenge(null);
    notify(`Email updated. Sign in with ${saved.email} from now on.`);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    const found = collectErrors(pw, {
      current: (v) => (v ? '' : 'Enter your current password.'),
      next: (v, all) =>
        validatePassword(v) || (v === all.current ? 'Choose a password different from the current one.' : ''),
      confirm: (v, all) => (v === all.next ? '' : 'Passwords do not match.')
    });
    setPwErrors(found);
    if (Object.keys(found).length) return;
    setSavingPw(true);
    try {
      setChallenge(await authApi.startPasswordChange({ current: pw.current, next: pw.next }));
    } catch (err) {
      const left =
        err.code === 'INVALID_CREDENTIALS' && err.meta.remaining
          ? ` ${err.meta.remaining} ${err.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`
          : '';
      if (err.meta && err.meta.field) setPwErrors({ [err.meta.field]: err.message + left });
      else notify(err.message, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const finishPasswordChange = () => {
    setChallenge(null);
    setPw({ current: '', next: '', confirm: '' });
    notify('Password changed. Other devices were signed out.');
  };

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
        <DashCard component="form" noValidate onSubmit={saveProfile}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
            <Avatar
              sx={{ width: 64, height: 64, fontSize: 22, fontWeight: 700, bgcolor: tokens.gold, color: tokens.onGold }}
            >
              {initials(user.name)}
            </Avatar>
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{user.name}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{user.email}</Typography>
              {user.createdAt && (
                <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                  Member since {formatDateLong(toISODate(new Date(user.createdAt)))}
                </Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormField
              id="profile-name"
              label="Full name"
              required
              value={profile.name}
              onChange={(e) => {
                setProfile((p) => ({ ...p, name: e.target.value }));
                setProfileErrors({});
              }}
              error={profileErrors.name}
            />
            <FormField
              id="profile-email"
              label="Email"
              value={user.email}
              inputProps={{ readOnly: true }}
              hint="Your login email and the address where account codes are sent."
              InputProps={{
                endAdornment: (
                  <Button
                    type="button"
                    size="small"
                    onClick={openEmailChange}
                    sx={{ flexShrink: 0, fontWeight: 700, color: tokens.goldDark }}
                  >
                    Change
                  </Button>
                )
              }}
            />
            <MobileField
              id="profile-mobile"
              label="Mobile"
              required
              value={profile.mobile}
              onChange={(e) => {
                setProfile((p) => ({ ...p, mobile: e.target.value }));
                setProfileErrors({});
              }}
              error={profileErrors.mobile}
            />
            <FormField
              id="profile-company"
              label="Company"
              optional
              value={profile.company}
              onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))}
              hint="For official receipts under a company name."
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <BusyButton type="submit" busy={savingProfile} disabled={!dirty}>
                Save changes
              </BusyButton>
            </Box>
          </Box>
        </DashCard>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {hasPassword ? <DashCard component="form" noValidate onSubmit={savePassword}>
            <CardTitle subtitle="8 characters or more, with a lowercase and an uppercase letter, a number and a special character">
              Change Password
            </CardTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <PasswordField
                  id="pw-current"
                  label="Current password"
                  autoComplete="current-password"
                  value={pw.current}
                  onChange={(e) => {
                    setPw((p) => ({ ...p, current: e.target.value }));
                    setPwErrors({});
                  }}
                  error={pwErrors.current}
                />
                <Link
                  component="button"
                  type="button"
                  onClick={() => setResetOpen(true)}
                  sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.goldDark }}
                >
                  Forgot your current password?
                </Link>
              </Box>
              <Box>
                <PasswordField
                  id="pw-next"
                  label="New password"
                  autoComplete="new-password"
                  value={pw.next}
                  onChange={(e) => {
                    setPw((p) => ({ ...p, next: e.target.value }));
                    setPwErrors({});
                  }}
                  error={pwErrors.next}
                />
                <PasswordChecklist value={pw.next} />
              </Box>
              <PasswordField
                id="pw-confirm"
                label="Confirm new password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => {
                  setPw((p) => ({ ...p, confirm: e.target.value }));
                  setPwErrors({});
                }}
                error={pwErrors.confirm}
              />
              <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
                We email you a code to confirm the change before the new password is saved.
              </Typography>
              <Box>
                <BusyButton type="submit" busy={savingPw}>
                  Update password
                </BusyButton>
              </Box>
            </Box>
          </DashCard> : <DashCard>
            <CardTitle subtitle="You currently sign in with Google.">Set a Password</CardTitle>
            <Typography sx={{ mb: 2, fontSize: 13.5, color: tokens.textSecondary }}>
              You can also sign in with email and password. We will email you a code to set your first password.
            </Typography>
            <Button type="button" variant="outlined" onClick={() => setResetOpen(true)}>Set a password</Button>
          </DashCard>}

          <DashCard>
            <CardTitle>Session</CardTitle>
            <AlertBanner tone="info">For your security you are signed out after 15 minutes of inactivity.</AlertBanner>
            <Button
              color="error"
              variant="outlined"
              sx={{ mt: 2 }}
              onClick={() => {
                navigate('/', { replace: true });
                signOut();
              }}
            >
              Log out of this device
            </Button>
          </DashCard>
        </Box>
      </Box>

      <EmailCodeDialog
        challenge={emailChallenge}
        title="Confirm Your New Email"
        description="Enter the code sent to your new address. Your login email changes only after it is verified."
        actionLabel="Verify & save"
        onVerify={(code) => authApi.confirmCustomerEmailChange({ challengeId: emailChallenge.challengeId, code })}
        onVerified={finishEmailChange}
        onResend={() => authApi.resendCustomerEmailChangeCode(emailChallenge.challengeId)}
        onRestart={(message) => {
          setEmailChallenge(null);
          notify(message, 'error');
        }}
        onClose={() => setEmailChallenge(null)}
      />

      <AppDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        busy={savingEmail}
        maxWidth="xs"
        fullScreenOnMobile
        title="Change Email"
        description="Your email is also your username. We’ll send a code to the new address before changing it."
        actions={
          <>
            <Button onClick={() => setEmailOpen(false)} disabled={savingEmail} sx={{ color: tokens.textSecondary }}>
              Cancel
            </Button>
            <BusyButton type="submit" form="customer-email-form" busy={savingEmail}>
              Send code
            </BusyButton>
          </>
        }
      >
        <Box
          component="form"
          id="customer-email-form"
          noValidate
          onSubmit={startEmailChange}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {emailFormError && <AlertBanner tone="error">{emailFormError}</AlertBanner>}
          <FormField
            id="new-email"
            label="New email"
            required
            type="email"
            autoComplete="email"
            placeholder="name@gmail.com"
            autoFocus
            value={emailForm.email}
            onChange={(e) => {
              setEmailForm((current) => ({ ...current, email: e.target.value }));
              setEmailErrors((current) => ({ ...current, email: '' }));
              setEmailFormError('');
            }}
            error={emailErrors.email}
            hint={`Current: ${user.email}`}
            disabled={savingEmail}
          />
          <PasswordField
            id="email-current-password"
            label="Current password"
            required
            autoComplete="current-password"
            value={emailForm.password}
            onChange={(e) => {
              setEmailForm((current) => ({ ...current, password: e.target.value }));
              setEmailErrors((current) => ({ ...current, password: '' }));
              setEmailFormError('');
            }}
            error={emailErrors.password}
            disabled={savingEmail}
          />
        </Box>
      </AppDialog>

      <EmailCodeDialog
        challenge={challenge}
        title="Confirm Your New Password"
        actionLabel="Change password"
        onVerify={(code) => authApi.confirmPasswordChange({ challengeId: challenge.challengeId, code })}
        onVerified={finishPasswordChange}
        onResend={() => authApi.resendPasswordChangeCode(challenge.challengeId)}
        onRestart={(message) => {
          setChallenge(null);
          notify(message, 'error');
        }}
        onClose={() => setChallenge(null)}
      />

      <PasswordResetDialog
        open={resetOpen}
        accountEmail={user.email}
        onClose={() => setResetOpen(false)}
        onDone={() => {
          setResetOpen(false);
          setHasPassword(true);
          updateUser({ hasPassword: true });
          setPw({ current: '', next: '', confirm: '' });
          setPwErrors({});
          notify('Password changed. Other devices were signed out.');
        }}
      />
    </>
  );
}
