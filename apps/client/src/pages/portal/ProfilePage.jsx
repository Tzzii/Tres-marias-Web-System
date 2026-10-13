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
  PageHeader,
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
  useDocumentTitle,
  useNotify,
  validateEmail,
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
  useDocumentTitle('My Profile');
  const notify = useNotify();
  const navigate = useNavigate();
  const { user, updateUser, signOut } = useAuth();

  // Profile form. The mobile number is kept as stored ("09171234567"); MobileField shows it after "+63".
  const [profile, setProfile] = useState({ name: user.name, mobile: user.mobile, company: user.company || '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Email changes are separate from the ordinary profile save: the current password is checked,
  // then ownership of the new address is confirmed with a code sent there.
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [emailErrors, setEmailErrors] = useState({});
  const [emailFormError, setEmailFormError] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailChallenge, setEmailChallenge] = useState(null);

  // Change password form, its emailed-code step (open while `challenge` is set) and the forgot-password dialog
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);

  // Pick up the latest details (in case they changed elsewhere)
  useEffect(() => {
    authApi
      .getCustomerProfile(user.id)
      .then((fresh) => {
        setProfile({ name: fresh.name, mobile: fresh.mobile, company: fresh.company || '' });
      })
      .catch(() => {});
  }, [user.id]);

  // True when the form differs from the saved profile (the mobile number is compared by its digits after +63,
  // so "09171234567" and "+639171234567" count as the same number)
  const dirty =
    profile.name.trim() !== user.name ||
    nationalMobile(profile.mobile) !== nationalMobile(user.mobile) ||
    (profile.company || '') !== (user.company || '');

  // Validate name and mobile, save, and update the signed-in user so the new name shows everywhere
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
    setEmailForm({ email: '', password: '' });
    setEmailErrors({});
    setEmailFormError('');
    setEmailOpen(true);
  };

  // First step of an email change: validate locally, then have the server check the current password
  // and send a code to the new address. The login email is not changed yet.
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

  const confirmEmailChange = async (code) => {
    const saved = await authApi.confirmCustomerEmailChange({ challengeId: emailChallenge.challengeId, code });
    updateUser(saved);
    setEmailChallenge(null);
    notify(`Email updated. Sign in with ${saved.email} from now on.`);
  };

  // Validate the three password fields, then ask the server to check the current password and email a code
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
      // A wrong current password says how many tries are left before a 5-minute pause
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

  // The emailed code was right: the new password is saved and this device stays signed in
  const confirmCode = async (code) => {
    await authApi.confirmPasswordChange({ challengeId: challenge.challengeId, code });
    setChallenge(null);
    setPw({ current: '', next: '', confirm: '' });
    notify('Password changed. Other devices were signed out.');
  };

  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle="Keep your contact details current so our team can reach you about your events."
      />
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
          <DashCard component="form" noValidate onSubmit={savePassword}>
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
                {/* What the new password still needs, ticked live */}
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
          </DashCard>

          <DashCard>
            <CardTitle>Session</CardTitle>
            <AlertBanner tone="info">For your security you are signed out after 15 minutes of inactivity.</AlertBanner>
            {/* Log out: go to the home page, then end the session */}
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

      {/* Step 2 of the email change: prove ownership of the new address */}
      <EmailCodeDialog
        challenge={emailChallenge}
        title="Confirm Your New Email"
        description="Enter the code sent to your new address. Your login email changes only after it is verified."
        actionLabel="Verify & save"
        onVerify={confirmEmailChange}
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

      {/* Step 2 of the password change: the code emailed to the account */}
      <EmailCodeDialog
        challenge={challenge}
        title="Confirm Your New Password"
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
