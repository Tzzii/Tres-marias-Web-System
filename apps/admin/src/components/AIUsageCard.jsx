import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { AlertBanner, CardTitle, DashCard, ListSkeleton, aiUsageApi, tokens } from '@tm/shared';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd = (cents) => (Number.isFinite(cents) ? `${dollars.format(cents / 100)} USD` : 'Unavailable');

function SpendingMeter({ label, spending }) {
  const used = spending?.usedCents;
  const limit = spending?.limitCents;
  const percent = Number.isFinite(used) && limit > 0 ? (used / limit) * 100 : null;
  const color = percent >= 100 ? tokens.dangerText : percent >= 80 ? tokens.warningText : tokens.goldDark;
  return (
    <Box sx={{ p: 1.75, border: `1px solid ${tokens.cardLightBorder}`, borderRadius: 1.5, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>{usd(used)}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>of {usd(limit)} limit</Typography>
      {percent !== null ? (
        <>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, percent))}
            aria-label={`${label} AI spending`}
            aria-valuetext={`${usd(used)} of ${usd(limit)}`}
            sx={{ mt: 1, height: 5, borderRadius: 1, '& .MuiLinearProgress-bar': { backgroundColor: color } }}
          />
          <Typography sx={{ mt: 0.5, fontSize: 11.5, color }}>{Math.round(percent)}% used</Typography>
        </>
      ) : (
        <Typography sx={{ mt: 1, fontSize: 11.5, color: tokens.textMuted }}>
          {limit === 0 ? 'Live spending is blocked by this limit.' : 'Spending limit unavailable.'}
        </Typography>
      )}
    </Box>
  );
}

export default function AIUsageCard() {
  const [state, setState] = useState({ data: null, error: false, refreshing: true, updatedAt: null });
  const refreshRef = useRef(() => {});

  useEffect(() => {
    let mounted = true;
    let pending = false;
    async function refresh() {
      if (!mounted || pending) return;
      pending = true;
      setState((current) => ({ ...current, refreshing: true }));
      try {
        const data = await aiUsageApi.getUsage();
        if (mounted) setState({ data, error: false, refreshing: false, updatedAt: new Date() });
      } catch {
        if (mounted) setState((current) => ({ ...current, error: true, refreshing: false }));
      } finally {
        pending = false;
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const { data, error, refreshing, updatedAt } = state;
  const paused = data?.alerts?.some((alert) => alert.code?.endsWith('budget-cap') || alert.code === 'provider-circuit');
  const available = data?.available && !paused;
  const access = data && (!data.enabled ? 'Live AI disabled' : available ? 'Live AI available' : 'Live AI paused');

  return (
    <DashCard aria-label="AI usage and alerts">
      <CardTitle
        subtitle="Live AI spending and service health"
        action={
          <Button
            size="small"
            startIcon={<RefreshOutlinedIcon />}
            onClick={() => void refreshRef.current()}
            disabled={refreshing}
          >
            {refreshing ? 'Checking…' : 'Refresh'}
          </Button>
        }
      >
        AI usage & alerts
      </CardTitle>

      {error && (
        <AlertBanner tone="warning" sx={{ mb: data ? 2 : 0 }}>
          {data
            ? 'Could not refresh AI usage. Showing the last successful check.'
            : 'AI usage could not be loaded. Try refreshing.'}
        </AlertBanner>
      )}
      {!data && !error && <ListSkeleton rows={2} height={46} />}
      {data && (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <Chip
              size="small"
              label={access}
              sx={{
                fontWeight: 700,
                backgroundColor: !data.enabled ? tokens.surfaceMuted : available ? tokens.successBg : tokens.warningBg,
                color: !data.enabled ? tokens.textSecondary : available ? tokens.successText : tokens.warningText
              }}
            />
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
              Model: {data.model || 'Not configured'}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
            <SpendingMeter label="Daily estimate" spending={data.spending?.daily} />
            <SpendingMeter label="Monthly estimate" spending={data.spending?.monthly} />
          </Box>
          <Typography sx={{ mt: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
            Recent requests: {data.recent?.requests ?? 'Unavailable'} · Unknown failures:{' '}
            {data.recent?.unknownFailures ?? 'Unavailable'}
          </Typography>
          {data.limits && (
            <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.textMuted }}>
              Limits: {data.limits.globalConcurrent} concurrent globally · {data.limits.accountPerMinute}/min per
              account · {data.limits.ipPerMinute}/min per IP
            </Typography>
          )}
          <Box sx={{ display: 'grid', gap: 1, mt: 1.5 }}>
            {(data.alerts || []).map((alert) => (
              <AlertBanner key={alert.code} tone={alert.severity === 'error' ? 'error' : 'warning'}>
                {alert.message}
              </AlertBanner>
            ))}
            {!data.alerts?.length && (
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>No active usage alerts.</Typography>
            )}
          </Box>
        </>
      )}
      <Typography sx={{ mt: 1.5, fontSize: 11.5, color: tokens.textMuted }}>
        Known usage estimates, not a provider invoice. Unknown failures may have unreported costs.
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: 11.5, color: tokens.textMuted }}>
        {updatedAt ? `Last checked ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ` : ''}
        Refreshes every 60 seconds. Checking usage does not call AI.
      </Typography>
    </DashCard>
  );
}
