import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  CardTitle,
  ConfirmDialog,
  DashCard,
  ErrorState,
  FormField,
  ListSkeleton,
  MobileField,
  OtpInput,
  PasswordChecklist,
  PasswordField,
  Pill,
  RULES,
  authApi,
  formatClock,
  formatCountdown,
  formatDate,
  formatDateTime,
  initials,
  maskEmail,
  maskMobile,
  toISODate,
  tokens,
  useCountdown,
  useNotify,
  useResource,
  validateAdminPassword,
  validateEmail,
  validateMobile
} from '@tm/shared';
import { useAuth } from '../auth.js';

const formatWhen = (ms, fallback = 'Not recorded yet') => {
  if (!ms) return fallback;
  const day = toISODate(new Date(ms));
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === toISODate(new Date())) return `Today, ${formatClock(ms)}`;
  if (day === toISODate(yesterday)) return `Yesterday, ${formatClock(ms)}`;
  return formatDateTime(ms);
};

const formatDay = (ms) => (ms ? formatDate(toISODate(new Date(ms))) : '');

export default function AccountPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { user, session, signOut, updateUser } = useAuth();
  const profile = useResource(() => authApi.getAdminProfile(user.id), [user.id]);
  const [dialog, setDialog] = useState(null);
  const [contactField, setContactField] = useState('email');
  const close = () => setDialog(null);
  const openContact = (field) => {
    setContactField(field);
    setDialog('contact');
  };

  const endSession = (reason) => {
    navigate(reason ? `/login?reason=${reason}` : '/login', { replace: true });
    signOut();
  };

  if (profile.error)
    return (
      <DashCard>
        <ErrorState error={profile.error} onRetry={profile.reload} />
      </DashCard>
    );

  const p = profile.data;

  return (
    <>
      {!p ? (
        <DashCard>
          <ListSkeleton rows={4} />
        </DashCard>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2.5,
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gridTemplateAreas: {
              xs: '"profile" "password" "twostep" "activity"',
              lg: '"profile activity" "password twostep"'
            }
          }}
        >
          <ProfileCard
            profile={p}
            onEditName={() => setDialog('name')}
            onChangeEmail={() => openContact('email')}
            onChangeMobile={() => openContact('mobile')}
          />
          <ActivityCard profile={p} session={session} onLogout={() => setDialog('logout')} />
          <PasswordCard profile={p} onChange={() => setDialog('password')} />
          <TwoStepCard profile={p} />
        </Box>
      )}

      {p && (
        <>
          <EditNameDialog
            open={dialog === 'name'}
            onClose={close}
            profile={p}
            onSaved={(saved) => {
              updateUser({ name: saved.name });
              notify('Name updated.');
              close();
            }}
          />
          <ChangePasswordDialog
            open={dialog === 'password'}
            onClose={close}
            adminId={p.id}
            onSaved={() => {
              close();
              endSession('password');
            }}
          />
          <ChangeContactDialog
            open={dialog === 'contact'}
            field={contactField}
            onClose={close}
            profile={p}
            onSaved={(saved) => {
              updateUser({ email: saved.email, mobile: saved.mobile });
              notify(
                contactField === 'mobile'
                  ? 'Mobile number updated.'
                  : `Email updated. Sign in with ${saved.email} from now on; sign-in codes go there too.`
              );
              close();
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={dialog === 'logout'}
        onClose={close}
        onConfirm={async () => {
          close();
          endSession();
        }}
        title="Log Out?"
        description="You will need to sign in again to continue."
        confirmLabel="Log out"
        tone="danger"
      />
    </>
  );
}

function InfoRow({ label, hint, children, action }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '140px 1fr auto' },
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.25,
        py: 1.5,
        borderTop: `1px solid ${tokens.cardLightBorder}`
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
        {hint && <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{hint}</Typography>}
      </Box>
      <Typography
        component="div"
        sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary, overflowWrap: 'anywhere', minWidth: 0 }}
      >
        {children}
      </Typography>
      {action && <Box sx={{ justifySelf: { xs: 'start', sm: 'end' } }}>{action}</Box>}
    </Box>
  );
}

function ProfileCard({ profile, onEditName, onChangeEmail, onChangeMobile }) {
  return (
    <DashCard sx={{ gridArea: 'profile' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Avatar
          sx={{ width: 64, height: 64, fontSize: 22, fontWeight: 700, bgcolor: tokens.gold, color: tokens.onGold }}
        >
          {initials(profile.name)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>
            {profile.name}
          </Typography>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{profile.role}</Typography>
          {profile.createdAt && (
            <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Since {formatDay(profile.createdAt)}</Typography>
          )}
        </Box>
        <Button variant="outlined" size="small" onClick={onEditName}>
          Edit
        </Button>
      </Box>
      <InfoRow label="Full name">{profile.name}</InfoRow>
      <InfoRow
        label="Email"
        hint="Username · receives sign-in codes"
        action={
          <Button size="small" onClick={onChangeEmail}>
            Change
          </Button>
        }
      >
        {profile.email}
      </InfoRow>
      <InfoRow
        label="Mobile"
        hint="Contact number"
        action={
          <Button size="small" onClick={onChangeMobile}>
            Change
          </Button>
        }
      >
        {maskMobile(profile.mobile)}
      </InfoRow>
    </DashCard>
  );
}

function ActivityCard({ profile, session, onLogout }) {
  const mine = session && session.user;
  const signedInAt = (mine && mine.signedInAt) || profile.lastSignInAt;
  const device = (mine && mine.device) || profile.lastSignInDevice || 'This browser';

  return (
    <DashCard sx={{ gridArea: 'activity', display: 'flex', flexDirection: 'column' }}>
      <CardTitle>Sign-In Activity</CardTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>This session</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{device}</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
            Signed in{' '}
            {signedInAt ? formatWhen(signedInAt).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase()) : 'earlier'}
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>Previous sign-in</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
            {formatWhen(profile.previousSignInAt, 'None recorded')}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
            Failed attempts before this sign-in
          </Typography>
          <Typography
            sx={{
              fontSize: 13.5,
              fontWeight: 700,
              color: profile.failedSinceLastSignIn ? tokens.redPress : tokens.textPrimary
            }}
          >
            {profile.failedSinceLastSignIn}
          </Typography>
        </Box>
        {profile.failedAttempts > 0 && (
          <AlertBanner tone="error">
            {profile.failedAttempts} failed sign-in {profile.failedAttempts === 1 ? 'attempt' : 'attempts'} since this
            session started. If this wasn't you, change your password.
          </AlertBanner>
        )}
      </Box>
      <Divider sx={{ my: 2, borderColor: tokens.cardLightBorder }} />
      <Box>
        <Button color="error" variant="outlined" onClick={onLogout}>
          Log out
        </Button>
      </Box>
    </DashCard>
  );
}

function PasswordCard({ profile, onChange }) {
  return (
    <DashCard sx={{ gridArea: 'password', display: 'flex', flexDirection: 'column' }}>
      <CardTitle>Password</CardTitle>
      <Box sx={{ flex: 1 }}>
        <Typography aria-hidden sx={{ fontSize: 18, letterSpacing: '0.2em', color: tokens.textPrimary }}>
          ••••••••••••
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 13, color: tokens.textSecondary }}>
          {profile.passwordChangedAt
            ? `Last changed ${formatDay(profile.passwordChangedAt)}`
            : 'Last change not recorded'}
        </Typography>
      </Box>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={onChange}>
          Change password
        </Button>
      </Box>
    </DashCard>
  );
}

function TwoStepCard({ profile }) {
  return (
    <DashCard sx={{ gridArea: 'twostep' }}>
      <CardTitle action={<Pill label="On" bg="rgba(16, 185, 129, 0.12)" fg="#047857" />}>
        Two-Step Verification
      </CardTitle>
      <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: tokens.textSecondary }}>
        A {RULES.codeLength}-digit code is emailed to <b>{maskEmail(profile.email)}</b> every time you sign in.
      </Typography>
      <Typography sx={{ mt: 1.5, fontSize: 12.5, color: tokens.textMuted }}>Always on for admin accounts.</Typography>
    </DashCard>
  );
}

function EditNameDialog({ open, onClose, profile, onSaved }) {
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(profile.name);
      setError('');
      setBusy(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return setError('Full name is required.');
    if (clean.split(' ').length < 2) return setError('Enter your first and last name.');
    setBusy(true);
    try {
      onSaved(await authApi.updateAdminProfile(profile.id, { name: clean }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title="Edit Profile"
      description="This name appears in messages to customers and in the activity log."
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton
            type="submit"
            form="edit-name-form"
            busy={busy}
            disabled={name.trim().replace(/\s+/g, ' ') === profile.name}
          >
            Save
          </BusyButton>
        </>
      }
    >
      <Box component="form" id="edit-name-form" noValidate onSubmit={save}>
        <FormField
          id="account-name"
          label="Full name"
          required
          autoFocus
          autoComplete="name"
          inputProps={{ maxLength: 80 }}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          error={error}
          disabled={busy}
        />
      </Box>
    </AppDialog>
  );
}

function ChangePasswordDialog({ open, onClose, adminId, onSaved }) {
  const empty = { current: '', next: '', confirm: '' };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(empty);
      setErrors({});
      setFormError('');
      setBusy(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: '' }));
    setFormError('');
  };

  const save = async (e) => {
    e.preventDefault();
    const found = {};
    if (!values.current) found.current = 'Enter your current password.';
    const problem = validateAdminPassword(values.next);
    if (problem) found.next = problem;
    else if (values.next === values.current) found.next = 'Choose a password different from the current one.';
    if (!found.next && values.confirm !== values.next) found.confirm = 'Passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await authApi.changeAdminPassword(adminId, { current: values.current, next: values.next });
      onSaved();
    } catch (err) {
      setBusy(false);
      setValues((v) => ({ ...v, current: '' }));
      if (err.code === 'LOCKED') setFormError(err.message);
      else if (err.meta && err.meta.field) {
        const suffix = err.meta.remaining
          ? ` ${err.meta.remaining} ${err.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`
          : '';
        setErrors({ [err.meta.field]: err.message + suffix });
      } else setFormError(err.message);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      fullScreenOnMobile
      title="Change Password"
      description="You'll be signed out and asked to sign in with the new password."
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton type="submit" form="change-password-form" busy={busy}>
            Save password
          </BusyButton>
        </>
      }
    >
      <Box
        component="form"
        id="change-password-form"
        noValidate
        onSubmit={save}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
        <PasswordField
          id="pw-current"
          label="Current password"
          autoComplete="current-password"
          autoFocus
          value={values.current}
          onChange={set('current')}
          error={errors.current}
          disabled={busy}
        />
        <Box>
          <PasswordField
            id="pw-next"
            label="New password"
            autoComplete="new-password"
            value={values.next}
            onChange={set('next')}
            error={errors.next}
            disabled={busy}
          />
          <PasswordChecklist value={values.next} />
        </Box>
        <PasswordField
          id="pw-confirm"
          label="Confirm new password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          disabled={busy}
        />
      </Box>
    </AppDialog>
  );
}

function ChangeContactDialog({ open, field, onClose, profile, onSaved }) {
  const isEmail = field === 'email';
  const [step, setStep] = useState(1);
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle');
  const resendSeconds = useCountdown(challenge ? challenge.resendAt : null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setValue('');
      setPassword('');
      setErrors({});
      setFormError('');
      setBusy(false);
      setChallenge(null);
      setCode('');
      setCodeState('idle');
    }
  }, [open, field]);

  const label = isEmail ? 'email' : 'mobile number';

  const sendCode = async (e) => {
    e.preventDefault();
    const found = {};
    const problem = isEmail ? validateEmail(value) : validateMobile(value);
    if (problem) found.value = problem;
    if (!password) found.password = 'Enter your current password.';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const result = await authApi.adminStartContactChange(profile.id, { field, value, password });
      setChallenge(result);
      setPassword('');
      setCode('');
      setCodeState('idle');
      setStep(2);
    } catch (err) {
      setPassword('');
      if (err.code === 'LOCKED') setFormError(err.message);
      else if (err.meta && err.meta.field === 'current') {
        const suffix = err.meta.remaining
          ? ` ${err.meta.remaining} ${err.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`
          : '';
        setErrors({ password: err.message + suffix });
      } else if (err.meta && err.meta.field === 'value') setErrors({ value: err.message });
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (entered = code) => {
    if (entered.length !== RULES.codeLength) {
      setFormError(`Enter all ${RULES.codeLength} digits.`);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const saved = await authApi.adminConfirmContactChange({ challengeId: challenge.challengeId, code: entered });
      setCodeState('success');
      onSaved(saved);
    } catch (err) {
      setBusy(false);
      setCode('');
      setCodeState('error');
      if (err.code === 'INVALID_CODE') {
        setFormError(
          `That code is incorrect. ${err.meta.remaining} ${err.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`
        );
      } else if (err.code === 'LOCKED' || err.code === 'CHALLENGE_EXPIRED') {
        setStep(1);
        setChallenge(null);
        setCodeState('idle');
        setFormError(err.message);
      } else setFormError(err.message);
    }
  };

  const resend = async () => {
    setBusy(true);
    setFormError('');
    try {
      const result = await authApi.adminResendContactCode(challenge.challengeId);
      setChallenge((c) => ({ ...c, ...result }));
      setCode('');
      setCodeState('idle');
    } catch (err) {
      setStep(1);
      setChallenge(null);
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      fullScreenOnMobile
      title={step === 1 ? (isEmail ? 'Change Email' : 'Change Mobile Number') : 'Enter the Code'}
      description={
        step === 1
          ? isEmail
            ? 'Your email is also your username for signing in, and where sign-in codes are sent.'
            : 'The number on file for your account. Sign-in codes still go to your email.'
          : null
      }
      actions={
        step === 1 ? (
          <>
            <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
              Cancel
            </Button>
            <BusyButton type="submit" form="contact-form" busy={busy}>
              Send code
            </BusyButton>
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                setStep(1);
                setChallenge(null);
                setFormError('');
              }}
              disabled={busy}
              sx={{ color: tokens.textSecondary }}
            >
              Back
            </Button>
            <BusyButton onClick={() => verify()} busy={busy} disabled={code.length !== RULES.codeLength}>
              Verify & save
            </BusyButton>
          </>
        )
      }
    >
      {formError && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {formError}
        </AlertBanner>
      )}
      {step === 1 ? (
        <Box
          component="form"
          id="contact-form"
          noValidate
          onSubmit={sendCode}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {isEmail ? (
            <FormField
              id="contact-value"
              label="New email"
              required
              autoFocus
              type="email"
              autoComplete="email"
              placeholder="name@gmail.com"
              hint={`Current: ${profile.email}`}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setErrors((er) => ({ ...er, value: '' }));
                setFormError('');
              }}
              error={errors.value}
              disabled={busy}
            />
          ) : (
            <MobileField
              id="contact-value"
              label="New mobile number"
              required
              autoFocus
              hint={`Current: ${maskMobile(profile.mobile)}`}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setErrors((er) => ({ ...er, value: '' }));
                setFormError('');
              }}
              error={errors.value}
              disabled={busy}
            />
          )}
          <PasswordField
            id="contact-password"
            label="Current password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((er) => ({ ...er, password: '' }));
              setFormError('');
            }}
            error={errors.password}
            disabled={busy}
          />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
            <MarkEmailReadOutlinedIcon sx={{ color: tokens.goldDark, mt: '2px' }} />
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
              We emailed a {RULES.codeLength}-digit code to <b>{challenge.sentTo}</b>
              {isEmail ? ', the new address' : ', the address on file'}. It expires in {RULES.codeValidMinutes} minutes.
            </Typography>
          </Box>
          <OtpInput
            length={RULES.codeLength}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (codeState !== 'idle') setCodeState('idle');
              if (formError) setFormError('');
            }}
            onComplete={(v) => verify(v)}
            disabled={busy}
            state={codeState}
          />
          {resendSeconds > 0 ? (
            <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
              Resend code in {formatCountdown(resendSeconds)}
            </Typography>
          ) : (
            <Link
              component="button"
              type="button"
              onClick={resend}
              disabled={busy}
              sx={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 700, color: tokens.goldDark }}
            >
              Resend code
            </Link>
          )}
        </Box>
      )}
    </AppDialog>
  );
}
