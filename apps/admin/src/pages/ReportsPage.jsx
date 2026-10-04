import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CurrencyExchangeOutlinedIcon from '@mui/icons-material/CurrencyExchangeOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PercentRoundedIcon from '@mui/icons-material/PercentRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import {
  AppDialog,
  BUSINESS,
  BarChart,
  CardTitle,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  RankBars,
  StatCard,
  formatDate,
  peso,
  reportApi,
  saveElementAsPdf,
  todayISO,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionTabs } from '../components/SectionTabs.jsx';
import { downloadTxt, textTable } from '../lib/txt.js';
import PaymentsSection from './reports/PaymentsSection.jsx';
import ReportSheet from './reports/ReportSheet.jsx';

// Tabs of this page as [key, label]
const TABS = [
  ['overview', 'Overview'],
  ['payments', 'Payments and balances']
];

// Date range options as [key, label]
const RANGES = [
  ['this_year', 'This year'],
  ['last_12', 'Last 12 months'],
  ['last_year', 'Last year'],
  ['all', 'All time']
];

// Saved reports as [key, name, description]
const SAVED = [
  ['monthly_sales', 'Monthly sales summary', 'Verified payments per month, split by method, less refunds'],
  ['outstanding', 'Outstanding balances', 'Every approved booking with money still due']
];

// Short money labels for chart axes: ₱1.2M, ₱350k, or the full amount under ₱1,000; below 0 (more refunds than payments) with a minus sign
const shortPeso = (v) => (v < 0 ? `−${shortPeso(-v)}` : v >= 1000000 ? `₱${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₱${Math.round(v / 1000)}k` : peso(v));

/**
 * 1y · Reports, with two tabs: Overview (figures computed from reservations, verified payments and
 * refunds: revenue is net of the refunds sent in the range, which also show as their own figure) and
 * Payments and balances. The open tab lives in the URL (?tab=overview|payments); a payment
 * link with ?verify= or ?filter= opens the Payments tab even without ?tab=.
 * The Overview's Print and Save PDF both use the same formatted A4 report (ReportSheet), not the
 * dashboard itself: Print prints it, Save PDF downloads it as tres-marias-report-<range>-<date>.pdf.
 */
export default function ReportsPage() {
  useDocumentTitle('Reports', 'Tres Marias Admin');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some(([key]) => key === requested) ? requested : params.get('verify') || params.get('filter') ? 'payments' : 'overview';
  const notify = useNotify();
  const [range, setRange] = useState('this_year'); // selected date range
  // Load the report; it reloads automatically whenever the range changes
  const { data, loading, error, reload } = useResource(() => reportApi.getReport(range), [range]);
  const [saved, setSaved] = useState(null); // result of a saved report, shown in a dialog
  const [running, setRunning] = useState(null); // key of the saved report currently running
  const rangeLabel = RANGES.find(([k]) => k === range)[1];
  const sheetRef = useRef(null); // the formatted report that Print prints and Save PDF draws
  const [savingPdf, setSavingPdf] = useState(false); // true while the PDF is being made
  const [stampedAt, setStampedAt] = useState(() => Date.now()); // the "Generated" time on the report

  // Stamp the report with the moment it is printed, from the Print button or Ctrl+P. flushSync puts
  // the new time on the sheet before the browser lays out the printout.
  useEffect(() => {
    const stamp = () => flushSync(() => setStampedAt(Date.now()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  // Save the formatted report as a PDF, stamped with the time it is saved (the "Save as" window first, where
  // the browser has one; Cancel saves nothing). If the browser can't make one, Print still can ("Save as PDF"
  // in the print window).
  const savePdf = async () => {
    flushSync(() => setStampedAt(Date.now()));
    setSavingPdf(true);
    try {
      const saved = await saveElementAsPdf(sheetRef.current, `tres-marias-report-${range}-${todayISO()}.pdf`, { title: `${BUSINESS.name} report, ${rangeLabel}`, footer: `${BUSINESS.name} · Business report · ${rangeLabel}` });
      if (saved) notify('Report saved as PDF.');
    } catch (e) {
      notify("Couldn't create the PDF. Use Print and choose Save as PDF instead.", 'error');
    } finally {
      setSavingPdf(false);
    }
  };

  // Run one of the saved reports for the current range and open the results dialog
  const run = async (kind) => {
    setRunning(kind);
    try {
      const result = await reportApi.runSavedReport(kind, range);
      setSaved(result);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setRunning(null);
    }
  };

  // Revenue is charted per month, or per year for "All time"
  const byYear = Boolean(data && data.revenueBy === 'year');

  // Export the summary numbers, revenue per month (or year) and package counts as one TXT file,
  // with a heading and a lined-up table for each section. Revenue is net of refunds; the refunds are listed too.
  // Months are written in full with their year ("October 2025"), as the "Last 12 months" range spans two years.
  const exportSummary = async () => {
    if (!data) return;
    const text = [
      'TRES MARIAS - REPORT',
      `Range: ${rangeLabel}`,
      `Generated: ${formatDate(todayISO())}`,
      '',
      'SUMMARY',
      textTable([
        { Figure: 'Events served', Value: String(data.eventsServed) },
        { Figure: 'Revenue (payments less refunds)', Value: peso(data.revenue) },
        { Figure: 'Refunds', Value: peso(data.refunds) },
        { Figure: 'Average per event', Value: peso(data.averagePerEvent) },
        { Figure: 'Decline rate', Value: `${data.declineRate}%` }
      ]),
      '',
      byYear ? 'REVENUE BY YEAR (PAYMENTS LESS REFUNDS)' : 'REVENUE BY MONTH (PAYMENTS LESS REFUNDS)',
      textTable(data.revenueChart.map((m) => ({ [byYear ? 'Year' : 'Month']: m.title || m.label, Revenue: m.value })), ['Revenue']),
      '',
      'BOOKINGS BY PACKAGE',
      textTable(data.packageCounts.map((p) => ({ Package: p.name, Bookings: p.count })))
    ].join('\n');
    if (await downloadTxt(`tres-marias-report-${range}-${todayISO()}.txt`, text)) notify('Report exported.');
  };

  // Export the open saved report (title, range and its table) as a TXT file
  const exportSaved = async () => {
    const text = [saved.title.toUpperCase(), `Range: ${rangeLabel}`, `Generated: ${formatDate(todayISO())}`, '', textTable(saved.rows, saved.money)].join('\n');
    if (await downloadTxt(`${saved.title.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.txt`, text)) notify('Report exported.');
  };

  return (
    <>
      <PageHeader
        title="Reports"
        // The range, export, print and PDF controls belong to the Overview tab only; Print and Save PDF wait for the figures
        subtitle={tab === 'overview' ? `${rangeLabel} · updates automatically as bookings are completed and payments verified` : undefined}
        actions={
          tab === 'overview' && (
            <Box className="tm-no-print" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <TextField select size="small" value={range} onChange={(e) => setRange(e.target.value)} inputProps={{ 'aria-label': 'Report range' }} sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { backgroundColor: '#fff', color: tokens.textPrimary }, '& .MuiSvgIcon-root': { color: tokens.textMuted } }}>
                {RANGES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
              <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportSummary} disabled={!data} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>Export TXT</Button>
              <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()} disabled={!data || loading} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>Print</Button>
              <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={savePdf} disabled={!data || loading || savingPdf} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>
                {savingPdf ? 'Saving…' : 'Save PDF'}
              </Button>
            </Box>
          )
        }
      />
      {/* Switching tabs clears the other tab's URL options, e.g. ?verify= */}
      <Box className="tm-no-print">
        <SectionTabs ariaLabel="Report sections" value={tab} onChange={(next) => setParams({ tab: next })} options={TABS.map(([value, label]) => ({ value, label }))} />
      </Box>

      {tab === 'payments' && <PaymentsSection />}

      {/* The formatted report for Print and Save PDF; it stays off screen */}
      {tab === 'overview' && data && <ReportSheet data={data} rangeLabel={RANGES.find(([k]) => k === data.range)?.[1] || rangeLabel} generatedAt={stampedAt} format={shortPeso} sheetRef={sheetRef} />}

      {tab === 'overview' && error && <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>}

      {tab === 'overview' && !error && (
        <>
          {/* Summary numbers for the selected range, two per row on phones and tablets, five in a row on wide screens */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }, gap: { xs: 1.5, sm: 2.5 }, mb: 2.5 }}>
            <StatCard icon={EventAvailableOutlinedIcon} tone="gold" label="Events served" value={data ? data.eventsServed : 0} loading={loading} />
            <StatCard icon={PaymentsOutlinedIcon} tone="green" label="Revenue" value={data ? peso(data.revenue) : '₱0'} meta="Verified payments less refunds" loading={loading} />
            <StatCard icon={CurrencyExchangeOutlinedIcon} tone="violet" label="Refunds" value={data ? peso(data.refunds) : '₱0'} meta="Returned to customers" loading={loading} />
            <StatCard icon={AssessmentOutlinedIcon} tone="blue" label="Average per event" value={data ? peso(data.averagePerEvent) : '₱0'} loading={loading} />
            <StatCard icon={PercentRoundedIcon} tone="red" label="Decline rate" value={data ? `${data.declineRate}%` : '0%'} loading={loading} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.7fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            <DashCard>
              <CardTitle subtitle="Verified payments less refunds sent. Updates automatically when payments are verified or refunds recorded.">{byYear ? 'Revenue by year' : 'Revenue by month'}</CardTitle>
              {loading ? (
                <ListSkeleton rows={1} height={240} />
              ) : data.revenue === 0 && !data.refunds ? (
                <EmptyState compact title="No revenue in this range" description="Verified payments will appear here." />
              ) : (
                <BarChart data={data.revenueChart} height={240} format={shortPeso} ariaLabel={byYear ? 'Revenue by year' : 'Revenue by month'} />
              )}
            </DashCard>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <DashCard>
                <CardTitle subtitle="Reservations excluding declined and cancelled">Most booked packages</CardTitle>
                {loading ? <ListSkeleton rows={4} height={30} /> : <RankBars items={data.packageCounts.map((p) => ({ label: p.name, value: p.count }))} />}
              </DashCard>

              <DashCard className="tm-no-print">
                <CardTitle subtitle={`Runs for: ${rangeLabel}`}>Saved reports</CardTitle>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {SAVED.map(([kind, name, description]) => (
                    <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{name}</Typography>
                        <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{description}</Typography>
                      </Box>
                      <Button size="small" variant="outlined" disabled={Boolean(running)} onClick={() => run(kind)}>
                        {running === kind ? 'Running…' : 'Run'}
                      </Button>
                    </Box>
                  ))}
                </Box>
              </DashCard>
            </Box>
          </Box>
        </>
      )}

      {/* Saved report results. Columns are built from the keys of the first row. */}
      <AppDialog
        open={Boolean(saved)}
        onClose={() => setSaved(null)}
        maxWidth="lg"
        fullScreenOnMobile
        title={saved ? saved.title : ''}
        description={saved ? `${rangeLabel} · ${saved.rows.length} ${saved.rows.length === 1 ? 'row' : 'rows'}` : ''}
        actions={
          <>
            <Button onClick={() => setSaved(null)}>Close</Button>
            <Button variant="contained" startIcon={<FileDownloadOutlinedIcon />} disabled={!saved || !saved.rows.length} onClick={exportSaved}>
              Export TXT
            </Button>
          </>
        }
      >
        {saved && (
          <DataTable
            dense
            minWidth={700}
            rows={saved.rows}
            rowKey={(row) => JSON.stringify(row)}
            columns={saved.rows.length ? Object.keys(saved.rows[0]).map((key) => ({ key, label: key, align: saved.money.includes(key) || typeof saved.rows[0][key] === 'number' ? 'right' : undefined, render: (row) => (saved.money.includes(key) ? peso(row[key]) : row[key]) })) : []}
            empty={<EmptyState compact title="No rows" description="Nothing to report for this range." />}
          />
        )}
      </AppDialog>
    </>
  );
}
