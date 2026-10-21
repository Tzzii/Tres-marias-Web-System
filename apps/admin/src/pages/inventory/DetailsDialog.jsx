import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { AppDialog, EquipmentPhoto, Field, formatDate, formatDateTime, inventoryApi, peso, tokens } from '@tm/shared';

const NO_EVENT = inventoryApi.NO_EVENT;

export default function DetailsDialog({ item, onClose, onAction }) {
  const navigate = useNavigate();
  if (!item) return <AppDialog open={false} onClose={onClose} title="" />;

  return (
    <AppDialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullScreenOnMobile
      title={item.name}
      description={`${item.code} · ${item.category}${item.archived ? ' · Archived' : ''}`}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            color="error"
            startIcon={<DeleteOutlineRoundedIcon />}
            disabled={item.inUse > 0}
            onClick={() => {
              onClose();
              onAction('delete', item);
            }}
          >
            Delete
          </Button>
          {!item.archived && (
            <>
              <Button
                variant="outlined"
                onClick={() => {
                  onClose();
                  onAction('edit', item);
                }}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                disabled={item.inUse < 1}
                onClick={() => {
                  onClose();
                  onAction('return', item);
                }}
              >
                Return
              </Button>
              <Button
                variant="contained"
                disabled={item.available < 1}
                onClick={() => {
                  onClose();
                  onAction('checkout', item);
                }}
              >
                Check out
              </Button>
            </>
          )}
        </>
      }
    >
      <Box sx={{ mb: 2 }}>
        <EquipmentPhoto item={item} admin />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' },
          gap: 1.5,
          p: 1.5,
          borderRadius: 1.5,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Field label="Total">{String(item.total)}</Field>
        <Field label="Available">{String(item.available)}</Field>
        <Field label="In use">{String(item.inUse)}</Field>
        <Field label="Damaged">{String(item.damaged)}</Field>
        <Field label="Alert at">{String(item.lowStockAt)}</Field>
      </Box>
      <Typography sx={{ mt: 1.25, fontSize: 13, color: tokens.textSecondary }}>
        {item.rentable
          ? `For rent at ${peso(item.rentPrice)} per piece · damage fee ${peso(item.damageFee)}`
          : 'Not for rent: only our team uses this item.'}
      </Typography>

      <Typography sx={{ mt: 2.5, mb: 1, fontSize: 14, fontWeight: 700 }}>Currently Out</Typography>
      {item.out.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>Nothing is checked out.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {item.out.map((o) => (
            <ButtonBase
              key={o.ref}
              disabled={o.ref === NO_EVENT}
              onClick={() => {
                onClose();
                navigate(`/reservations/${o.ref}`);
              }}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 1,
                p: 1.25,
                textAlign: 'left',
                fontFamily: 'inherit',
                borderRadius: 1.5,
                border: `1px solid ${tokens.cardLightBorder}`,
                '&:hover': { borderColor: tokens.placeholder }
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
                  {o.ref === NO_EVENT ? 'No event linked' : o.eventName || o.ref}
                </Typography>
                {o.ref !== NO_EVENT && (
                  <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                    {o.ref} · {formatDate(o.eventDate)}
                  </Typography>
                )}
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap' }}>
                {o.qty} pcs
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      )}

      {item.notes && (
        <>
          <Typography sx={{ mt: 2.5, mb: 0.5, fontSize: 14, fontWeight: 700 }}>Notes</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary, whiteSpace: 'pre-line' }}>
            {item.notes}
          </Typography>
        </>
      )}

      {!item.archived && (item.damaged > 0 || item.available > 0) && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            disabled={item.available < 1}
            onClick={() => {
              onClose();
              onAction('damage', item);
            }}
          >
            Report damage
          </Button>
          <Button
            size="small"
            disabled={item.damaged < 1}
            onClick={() => {
              onClose();
              onAction('repair', item);
            }}
          >
            Mark repaired
          </Button>
          <Button
            size="small"
            color="error"
            disabled={item.damaged < 1}
            onClick={() => {
              onClose();
              onAction('dispose', item);
            }}
          >
            Dispose of damaged
          </Button>
        </Box>
      )}

      <Typography sx={{ mt: 2.5, mb: 1, fontSize: 14, fontWeight: 700 }}>History</Typography>
      <Box
        component="ol"
        className="tm-scroll"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          maxHeight: 260,
          overflowY: 'auto'
        }}
      >
        {item.history
          .slice()
          .reverse()
          .map((h, i) => (
            <Box component="li" key={`${h.at}-${i}`} sx={{ display: 'flex', gap: 1.25 }}>
              <Box
                sx={{
                  mt: 0.75,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: i === 0 ? tokens.gold : tokens.cardLightBorder
                }}
              />
              <Box>
                <Typography sx={{ fontSize: 13 }}>{h.text}</Typography>
                <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                  {h.actor} · {formatDateTime(h.at)}
                </Typography>
              </Box>
            </Box>
          ))}
      </Box>
    </AppDialog>
  );
}
