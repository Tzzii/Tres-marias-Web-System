import Box from '@mui/material/Box';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { tokens } from '../theme/tokens.js';
import { Pill } from './Pill.jsx';

// One line of the list: the count column and the name share it, so a two-line name keeps its count on top
const LINE = '20px';

/**
 * A booking's package items as a tidy list, for the reservation pages of both portals. Each item has its own
 * row, with the count in its own column ("600 | Porcelain Plates"). An item without a count gets a check
 * ("✓ | Buffet Table"). An item whose count the quotation still has to set gets a dash, with a "To confirm"
 * tag under its name. The list reads top to bottom: 1 column on a phone, 2 on a tablet, 3 on a wider screen.
 * `items` come from bookingItems() (domain/packageItems.js). The quotation and contract printouts keep
 * their own one-line list.
 */
export function PackageItemList({ items }) {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', columns: { xs: 1, sm: 2, md: 3 }, columnGap: 3 }}>
      {items.map((item, i) => (
        <Box
          component="li"
          key={`${i}-${item.name}`}
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, py: 0.75, breakInside: 'avoid', borderBottom: `1px dashed ${tokens.cardLightBorder}` }}
        >
          <Box
            component="span"
            sx={{ minWidth: 44, height: LINE, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 13.5, fontWeight: 800, color: tokens.goldDark, fontVariantNumeric: 'tabular-nums' }}
          >
            {item.toConfirm ? '—' : item.qty ? item.qty.toLocaleString('en-PH') : <CheckRoundedIcon sx={{ fontSize: 17 }} />}
          </Box>
          {/* The "To confirm" tag sits under the name, so every tagged item looks the same however long its name is */}
          <Box component="span" sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25, fontSize: 13.5, lineHeight: LINE, fontWeight: 600, color: tokens.textPrimary }}>
            {item.name}
            {item.toConfirm && <Pill label="To confirm" dot={false} size="sm" bg="rgba(245, 158, 11, 0.14)" fg="#b45309" />}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
