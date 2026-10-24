import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import { EquipmentPhoto, Pill, peso, tokens } from '@tm/shared';
import { StockMeter } from '../../components/OperationsWorkspace.jsx';

export default function InventoryGrid({ items, selected, onToggle, onDetails, onMenu, selectAll }) {
  return (
    <>
      <Box
        component="label"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: 12,
          color: tokens.textSecondary,
          mt: 1,
          mb: 0.75
        }}
      >
        {selectAll}Select all on this page
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.75
        }}
      >
        {items.map((item) => (
          <Box
            key={item.id}
            sx={{
              border: `1px solid ${selected.includes(item.id) ? tokens.gold : tokens.cardLightBorder}`,
              borderRadius: '14px',
              overflow: 'hidden',
              bgcolor: tokens.cardLight
            }}
          >
            <Box sx={{ position: 'relative', p: 1.5, bgcolor: tokens.surfaceSubtle }}>
              <EquipmentPhoto item={item} admin compact height={140} />
              <Checkbox
                size="small"
                checked={selected.includes(item.id)}
                onChange={() => onToggle(item.id)}
                inputProps={{ 'aria-label': `Select ${item.name}` }}
                sx={{ position: 'absolute', top: 8, left: 8, bgcolor: tokens.cardLight, borderRadius: '8px' }}
              />
              <IconButton
                aria-label={`Actions for ${item.name}`}
                onClick={(event) => onMenu({ anchor: event.currentTarget, item })}
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8, bgcolor: tokens.cardLight }}
              >
                <MoreVertRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: tokens.textMuted, mb: 0.5 }}>
                {item.category} · {item.code}
              </Typography>
              <Button
                onClick={() => onDetails(item.id)}
                sx={{
                  p: 0,
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: tokens.textPrimary
                }}
              >
                {item.name}
              </Button>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  mt: 1.5,
                  mb: 1.5
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 10, color: tokens.textMuted, mb: 0.5 }}>Available pieces</Typography>
                  <StockMeter available={item.available} total={item.total} stock={item.archived ? 'ok' : item.stock} />
                </Box>
                <Pill
                  size="sm"
                  label={item.archived ? 'Archived' : item.damaged > 0 ? `${item.damaged} damaged` : 'Good condition'}
                  bg={item.archived ? tokens.surfaceMuted : item.damaged > 0 ? tokens.warningBg : tokens.successBg}
                  fg={item.archived ? tokens.textMuted : item.damaged > 0 ? tokens.warningText : tokens.successText}
                />
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 1,
                  pt: 1.25,
                  borderTop: `1px solid ${tokens.dividerFaint}`
                }}
              >
                <Typography sx={{ fontSize: 11, color: tokens.textSecondary }}>{item.inUse} in use</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 600 }}>
                  {item.rentable ? (
                    <>
                      {peso(item.rentPrice)}
                      <Box component="span" sx={{ color: tokens.textMuted, fontWeight: 400 }}>
                        {' '}
                        / piece
                      </Box>
                    </>
                  ) : (
                    'Internal use only'
                  )}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}
