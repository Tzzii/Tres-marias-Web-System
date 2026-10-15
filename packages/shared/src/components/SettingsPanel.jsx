import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useColorMode } from '../theme/colorMode.jsx';
import { tokens } from '../theme/tokens.js';
import { CardTitle, DashCard } from './DashCard.jsx';
import { PageHeader } from './PageHeader.jsx';
import { ThemeModeToggle } from './ThemeModeToggle.jsx';

/** Account and appearance settings shared by the signed-in portals. */
export function SettingsPanel({ accountLabel, children, paymentDetails, appearanceSettings }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = requested === 'appearance' || (requested === 'payments' && paymentDetails) ? requested : 'account';
  const id = useId();
  const { isLight } = useColorMode();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          paymentDetails
            ? 'Manage your account, appearance and payment details.'
            : 'Manage your account and appearance.'
        }
      />
      <Tabs
        value={tab}
        onChange={(_, next) => {
          const updated = new URLSearchParams(params);
          updated.set('tab', next);
          setParams(updated);
        }}
        aria-label="Settings sections"
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2.5,
          boxShadow: `inset 0 -1px 0 ${tokens.shellBorder}`,
          '& .MuiTabs-indicator': { backgroundColor: tokens.gold },
          '& .MuiTab-root': { color: tokens.textOnDarkSoft, textTransform: 'none' },
          '& .MuiTab-root.Mui-selected': { color: tokens.goldText, fontWeight: 700 }
        }}
      >
        <Tab value="account" label={accountLabel} id={`${id}-account-tab`} aria-controls={`${id}-account-panel`} />
        <Tab
          value="appearance"
          label="Appearance"
          id={`${id}-appearance-tab`}
          aria-controls={`${id}-appearance-panel`}
        />
        {paymentDetails && (
          <Tab
            value="payments"
            label="Payment Details"
            id={`${id}-payments-tab`}
            aria-controls={`${id}-payments-panel`}
          />
        )}
      </Tabs>
      <Box role="tabpanel" id={`${id}-account-panel`} aria-labelledby={`${id}-account-tab`} hidden={tab !== 'account'}>
        {tab === 'account' && children}
      </Box>
      {paymentDetails && (
        <Box
          role="tabpanel"
          id={`${id}-payments-panel`}
          aria-labelledby={`${id}-payments-tab`}
          hidden={tab !== 'payments'}
        >
          {tab === 'payments' && paymentDetails}
        </Box>
      )}
      <Box
        role="tabpanel"
        id={`${id}-appearance-panel`}
        aria-labelledby={`${id}-appearance-tab`}
        hidden={tab !== 'appearance'}
      >
        {tab === 'appearance' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <DashCard sx={{ maxWidth: 640 }}>
              <CardTitle subtitle="Choose how the portal looks on this browser.">Appearance</CardTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
                    {isLight ? 'Light mode' : 'Dark mode'}
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 13, color: tokens.textSecondary }}>
                    Switch to {isLight ? 'dark' : 'light'} mode. Your choice is saved automatically.
                  </Typography>
                </Box>
                <ThemeModeToggle
                  sx={{
                    color: tokens.textPrimary,
                    backgroundColor: tokens.surfaceMuted,
                    border: `1px solid ${tokens.cardLightBorder}`,
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    '&:hover': { color: tokens.goldDark, backgroundColor: tokens.surfaceMuted }
                  }}
                />
              </Box>
            </DashCard>
            {appearanceSettings}
          </Box>
        )}
      </Box>
    </>
  );
}
