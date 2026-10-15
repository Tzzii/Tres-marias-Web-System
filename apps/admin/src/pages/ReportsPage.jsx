import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CurrencyExchangeOutlinedIcon from '@mui/icons-material/CurrencyExchangeOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
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
  peso,
  reportApi,
  saveElementAsPdf,
  todayISO,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { usePdfDocument } from '../components/PdfDocument.jsx';
import ReportSheet from './reports/ReportSheet.jsx';

const RANGES = [
  ['this_year', 'This year'],
  ['last_12', 'Last 12 months'],
  ['last_year', 'Last year'],
  ['all', 'All time']
];

const SAVED = [
  ['monthly_sales', 'Monthly Sales Summary', 'Verified payments per month, split by method, less refunds'],
  ['outstanding', 'Outstanding Balances', 'Every approved booking with money still due']
];

const shortPeso = (v) =>
  v < 0
    ? `−${shortPeso(-v)}`
    : v >= 1000000
      ? `₱${(v / 1000000).toFixed(1)}M`
      : v >= 1000
        ? `₱${Math.round(v / 1000)}k`
        : peso(v);

export default function ReportsPage() {
  useDocumentTitle('Reports', 'Tres Marias Admin');
  const notify = useNotify();
  const { savePdfDocument, savingPdfDocument, pdfDocument } = usePdfDocument();
  const [range, setRange] = useState('this_year');
  const { data, loading, error, reload } = useResource(() => reportApi.getReport(range), [range]);
  const [saved, setSaved] = useState(null);
  const [running, setRunning] = useState(null);
  const rangeLabel = RANGES.find(([k]) => k === range)[1];
  const sheetRef = useRef(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [stampedAt, setStampedAt] = useState(() => Date.now());

  useEffect(() => {
    const stamp = () => flushSync(() => setStampedAt(Date.now()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  const savePdf = async () => {
    flushSync(() => setStampedAt(Date.now()));
    setSavingPdf(true);
    try {
      const saved = await saveElementAsPdf(sheetRef.current, `tres-marias-report-${range}-${todayISO()}.pdf`, {
        title: `${BUSINESS.name} report, ${rangeLabel}`,
        footer: `${BUSINESS.name} · Business report · ${rangeLabel}`
      });
      if (saved) notify('Report saved as PDF.');
    } catch (e) {
      notify("Couldn't create the PDF. Use Print and choose Save as PDF instead.", 'error');
    } finally {
      setSavingPdf(false);
    }
  };

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

  const byYear = Boolean(data && data.revenueBy === 'year');

  const saveSavedPdf = () => {
    if (!saved?.rows.length) return;
    return savePdfDocument({
      title: saved.title,
      subtitle: `Range: ${rangeLabel}`,
      fileName: `${saved.title.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.pdf`,
      rows: saved.rows,
      money: saved.money,
      orientation: 'landscape'
    });
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${rangeLabel} · updates automatically as bookings are completed and payments verified`}
        actions={
          <Box className="tm-no-print" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              select
              size="small"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              inputProps={{ 'aria-label': 'Report range' }}
              sx={{
                minWidth: 160,
                '& .MuiOutlinedInput-root': { backgroundColor: '#fff', color: tokens.textPrimary },
                '& .MuiSvgIcon-root': { color: tokens.textMuted }
              }}
            >
              {RANGES.map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              startIcon={<PrintOutlinedIcon />}
              onClick={() => window.print()}
              disabled={!data || loading}
              sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}
            >
              Print
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfOutlinedIcon />}
              onClick={savePdf}
              disabled={!data || loading || savingPdf}
              sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}
            >
              {savingPdf ? 'Saving…' : 'Save PDF'}
            </Button>
          </Box>
        }
      />
      {data && (
        <ReportSheet
          data={data}
          rangeLabel={RANGES.find(([k]) => k === data.range)?.[1] || rangeLabel}
          generatedAt={stampedAt}
          format={shortPeso}
          sheetRef={sheetRef}
        />
      )}

      {error && (
        <DashCard>
          <ErrorState error={error} onRetry={reload} />
        </DashCard>
      )}

      {!error && (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
              gap: { xs: 1.5, sm: 2.5 },
              mb: 2.5
            }}
          >
            <StatCard
              icon={EventAvailableOutlinedIcon}
              tone="gold"
              label="Events Served"
              value={data ? data.eventsServed : 0}
              loading={loading}
            />
            <StatCard
              icon={PaymentsOutlinedIcon}
              tone="green"
              label="Revenue"
              value={data ? peso(data.revenue) : '₱0'}
              meta="Verified payments less refunds"
              loading={loading}
            />
            <StatCard
              icon={CurrencyExchangeOutlinedIcon}
              tone="violet"
              label="Refunds"
              value={data ? peso(data.refunds) : '₱0'}
              meta="Returned to customers"
              loading={loading}
            />
            <StatCard
              icon={AssessmentOutlinedIcon}
              tone="blue"
              label="Average per Event"
              value={data ? peso(data.averagePerEvent) : '₱0'}
              loading={loading}
            />
            <StatCard
              icon={PercentRoundedIcon}
              tone="red"
              label="Decline Rate"
              value={data ? `${data.declineRate}%` : '0%'}
              loading={loading}
            />
          </Box>

          <Box
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.7fr 1fr' }, gap: 2.5, alignItems: 'start' }}
          >
            <DashCard>
              <CardTitle subtitle="Verified payments less refunds sent. Updates automatically when payments are verified or refunds recorded.">
                {byYear ? 'Revenue by Year' : 'Revenue by Month'}
              </CardTitle>
              {loading ? (
                <ListSkeleton rows={1} height={240} />
              ) : data.revenue === 0 && !data.refunds ? (
                <EmptyState
                  compact
                  title="No revenue in this range"
                  description="Verified payments will appear here."
                />
              ) : (
                <BarChart
                  data={data.revenueChart}
                  height={240}
                  format={shortPeso}
                  ariaLabel={byYear ? 'Revenue by year' : 'Revenue by month'}
                />
              )}
            </DashCard>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <DashCard>
                <CardTitle subtitle="Reservations excluding declined and cancelled">Most Booked Packages</CardTitle>
                {loading ? (
                  <ListSkeleton rows={4} height={30} />
                ) : (
                  <RankBars items={data.packageCounts.map((p) => ({ label: p.name, value: p.count }))} />
                )}
              </DashCard>

              <DashCard className="tm-no-print">
                <CardTitle subtitle={`Runs for: ${rangeLabel}`}>Saved Reports</CardTitle>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {SAVED.map(([kind, name, description]) => (
                    <Box
                      key={kind}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        p: 1.25,
                        borderRadius: 1.5,
                        border: `1px solid ${tokens.cardLightBorder}`
                      }}
                    >
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
            <Button
              variant="contained"
              startIcon={<PictureAsPdfOutlinedIcon />}
              disabled={!saved || !saved.rows.length || savingPdfDocument}
              onClick={saveSavedPdf}
            >
              {savingPdfDocument ? 'Saving…' : 'Save PDF'}
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
            columns={
              saved.rows.length
                ? Object.keys(saved.rows[0]).map((key) => ({
                    key,
                    label: key,
                    align: saved.money.includes(key) || typeof saved.rows[0][key] === 'number' ? 'right' : undefined,
                    render: (row) => (saved.money.includes(key) ? peso(row[key]) : row[key])
                  }))
                : []
            }
            empty={<EmptyState compact title="No rows" description="Nothing to report for this range." />}
          />
        )}
      </AppDialog>
      {pdfDocument}
    </>
  );
}
