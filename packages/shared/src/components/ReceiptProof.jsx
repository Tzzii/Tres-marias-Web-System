import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';

/** Supporting bank upload, included in both receipt viewers and their printed/exported copies. */
export function ReceiptProof({ payment, proof }) {
  return (
    <Box
      data-pdf-keep
      sx={{
        mt: 2,
        pt: 1.5,
        borderTop: `1px solid ${tokens.cardLightBorder}`,
        '@media print': { breakInside: 'avoid' }
      }}
    >
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 800, color: tokens.goldDark }}>
        Bank Transfer Proof
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: 11.5, color: tokens.textSecondary }}>Uploaded by Customer</Typography>
      <Typography sx={{ mt: 0.25, mb: 1, fontSize: 11, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
        Receipt {payment.receiptNo}
        {payment.referenceNo ? ` · Reference no. ${payment.referenceNo}` : ''}
      </Typography>
      {proof.status === 'loading' && (
        <Typography role="status" sx={{ fontSize: 13 }}>
          Loading bank transfer proof…
        </Typography>
      )}
      {proof.url && proof.status !== 'error' && (
        <Box
          component="img"
          src={proof.url}
          alt={`Bank transfer proof for receipt ${payment.receiptNo}`}
          onLoad={proof.onLoad}
          onError={proof.onError}
          sx={{
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '85mm',
            mx: 'auto',
            objectFit: 'contain',
            visibility: proof.status === 'ready' ? 'visible' : 'hidden'
          }}
        />
      )}
      {proof.status === 'missing' && (
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
          No bank transfer proof is available for this payment.
        </Typography>
      )}
      {proof.status === 'error' && (
        <Box className="tm-no-print">
          <Typography role="alert" sx={{ fontSize: 13, color: tokens.red }}>
            The bank transfer proof could not be loaded. Try again before printing or saving this receipt.
          </Typography>
          <Button size="small" onClick={proof.retry} sx={{ mt: 1 }}>
            Retry loading proof
          </Button>
        </Box>
      )}
    </Box>
  );
}
