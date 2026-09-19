import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import {
  CardTitle,
  DashCard,
  DocumentDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  StatusChip,
  documentsFor,
  formatDate,
  reservationApi,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

// Icon for each document type
const ICONS = { quotation: RequestQuoteOutlinedIcon, contract: GavelOutlinedIcon, receipt: ReceiptLongOutlinedIcon };

/** Documents: quotations, contracts and receipts for every reservation. */
export default function DocumentsPage() {
  useDocumentTitle('Documents');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(null); // document open in the preview dialog
  // Load the customer's reservations, keep those that can have documents (any with a quotation,
  // cancelled ones included so their contract and receipts stay available, plus active requests),
  // then load the full details of each (needed to build the documents)
  const { data, loading, error, reload } = useResource(async () => {
    const list = await reservationApi.listReservations({ customerId: user.id });
    const relevant = list.filter((r) => r.quotation || ['confirmed', 'completed', 'approved', 'downpayment_paid', 'pending'].includes(r.status));
    return Promise.all(relevant.map((r) => reservationApi.getReservation(r.ref, { customerId: user.id })));
  }, [user.id]);

  return (
    <>
      <PageHeader title="Documents" subtitle="Quotations, contracts and official receipts. Open any document to print or save it as a PDF." />
      {error ? (
        <DashCard>
          <ErrorState error={error} onRetry={reload} />
        </DashCard>
      ) : loading ? (
        <DashCard>
          <ListSkeleton rows={5} height={56} />
        </DashCard>
      ) : !data.length ? (
        <DashCard>
          <EmptyState icon={DescriptionOutlinedIcon} title="No documents yet" description="Your quotation appears here once our team reviews your first reservation." action={<Button variant="contained" onClick={() => navigate('/portal/book')}>New reservation</Button>} />
        </DashCard>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
          {/* One card per reservation, latest event date first. slice() copies the array so sort doesn't change the original. */}
          {data
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((r) => (
              <DashCard key={r.ref}>
                <CardTitle subtitle={`${r.ref} · ${formatDate(r.date)}`} action={<StatusChip status={r.status} size="sm" />}>
                  {r.eventName}
                </CardTitle>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* Quotation, contract and receipts; ones not ready yet show "Pending" */}
                  {documentsFor(r).map((d) => {
                    const Icon = ICONS[d.kind];
                    return (
                      <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, opacity: d.available ? 1 : 0.7 }}>
                        <Icon sx={{ color: d.available ? tokens.goldDark : tokens.placeholder }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{d.name}</Typography>
                          <Typography noWrap sx={{ fontSize: 12, color: tokens.textMuted }}>{d.note}</Typography>
                        </Box>
                        {d.available ? (
                          <Button size="small" variant="outlined" onClick={() => setOpen({ detail: r, doc: d })}>
                            Open
                          </Button>
                        ) : (
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>Pending</Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </DashCard>
            ))}
        </Box>
      )}
      {open && <DocumentDialog open onClose={() => setOpen(null)} detail={open.detail} doc={open.doc} />}
    </>
  );
}
