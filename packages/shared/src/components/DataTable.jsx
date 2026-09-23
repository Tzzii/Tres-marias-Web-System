import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { tokens } from '../theme/tokens.js';
import { ListSkeleton } from './Feedback.jsx';

// Column keys whose cells hold buttons; on a phone card they form the bottom row
const ACTION_KEYS = ['action', 'actions', 'act'];

/**
 * Where a column goes on a phone card: the column's own `card` choice, or a guess from its key and label.
 *   select  the tick box, left of the title          title   the card's heading
 *   aside   top right (a status chip or ⋮ menu)       footer  bottom row of buttons
 *   field   a small label with the value under it     wide    a field as wide as the card (long text, e.g. an email)
 *   hide    left out of the card
 */
function cardRole(col) {
  if (col.card) return col.card;
  if (col.key === 'select') return 'select';
  if (col.key === 'status') return 'aside';
  // Action columns, and columns without a text heading, hold buttons
  if (ACTION_KEYS.includes(col.key) || typeof col.label !== 'string' || !col.label) return 'footer';
  return 'field';
}

// A cell's content: the column's render function, or just the matching field
const cellContent = (col, row) => (col.render ? col.render(row) : row[col.key]);

// Clicking a button, link or checkbox inside a row or card should not also open the row
const rowClickHandler = (onRowClick, row) =>
  onRowClick
    ? (e) => {
        if (e.target.closest('button, a, input, label')) return;
        onRowClick(row);
      }
    : undefined;

/**
 * Table for light cards. From 900px wide it is a normal table that scrolls sideways inside its own
 * container when it is too wide. Below 900px (phones and portrait tablets) every row becomes a card
 * instead, so nothing has to be scrolled sideways.
 * `columns`: [{ key, label, render(row), align, width, card }]. `card` places the column on the phone
 * card (see cardRole above); without it the first plain column becomes the card's title.
 * `cards={false}` keeps the table on every screen size.
 */
export function DataTable({ columns, rows, rowKey, onRowClick, loading, empty, minWidth = 720, dense = false, cards = true }) {
  const asCards = useMediaQuery('(max-width:899px)') && cards;
  // Placeholder rows while loading; the `empty` message when there's nothing to show
  if (loading) return <ListSkeleton rows={4} height={dense ? 40 : 52} />;
  if (!rows.length) return empty || null;
  if (asCards) return <CardList columns={columns} rows={rows} rowKey={rowKey} onRowClick={onRowClick} />;

  return (
    <TableContainer className="tm-scroll" sx={{ overflowX: 'auto', mx: { xs: -2, sm: 0 }, width: { xs: 'calc(100% + 32px)', sm: '100%' } }}>
      <Table size={dense ? 'small' : 'medium'} sx={{ minWidth }}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell key={col.key} align={col.align} sx={{ width: col.width, py: 1.25 }}>
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              hover={Boolean(onRowClick)}
              onClick={rowClickHandler(onRowClick, row)}
              sx={{ cursor: onRowClick ? 'pointer' : 'default', '&:last-child td': { borderBottom: 0 } }}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align} sx={{ py: dense ? 1 : 1.5, color: tokens.textPrimary }}>
                  {cellContent(col, row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Small uppercase label above a value on a phone card, like the table's column headings
const cardLabelSx = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: tokens.textMuted };

/**
 * The phone layout of DataTable: one card per row. The tick box and the title sit at the top with
 * the status or ⋮ menu on the right, the other columns follow as label / value pairs (two per line,
 * three on tablets), and the action buttons close the card. When the table has a tick-box column,
 * its "select all" box sits above the cards with a "Select all" label.
 */
function CardList({ columns, rows, rowKey, onRowClick }) {
  const selectCol = columns.find((col) => cardRole(col) === 'select');
  // The title is the column marked 'title', or else the first plain column
  const titleCol = columns.find((col) => col.card === 'title') || columns.find((col) => cardRole(col) === 'field');
  const asides = columns.filter((col) => cardRole(col) === 'aside');
  const fields = columns.filter((col) => col !== titleCol && ['field', 'wide'].includes(cardRole(col)));
  const footers = columns.filter((col) => cardRole(col) === 'footer');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* The column's "select all" box; the label makes the words clickable too */}
      {selectCol && (
        <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', gap: 0.25, ml: -0.75, cursor: 'pointer' }}>
          {selectCol.label}
          <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.textSecondary }}>
            Select all
          </Typography>
        </Box>
      )}

      {rows.map((row) => (
        <Box
          key={rowKey(row)}
          onClick={rowClickHandler(onRowClick, row)}
          sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, backgroundColor: tokens.cardLight, color: tokens.textPrimary, cursor: onRowClick ? 'pointer' : 'default', ...(onRowClick && { '&:hover': { borderColor: tokens.placeholder } }) }}
        >
          {/* Top: tick box, title, and the status / ⋮ menu on the right */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            {selectCol && <Box sx={{ ml: -1, mt: -0.75, flexShrink: 0 }}>{cellContent(selectCol, row)}</Box>}
            <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5, overflowWrap: 'anywhere' }}>{titleCol && cellContent(titleCol, row)}</Box>
            {asides.map((col) => (
              <Box key={col.key} sx={{ flexShrink: 0, mt: -0.25 }}>
                {cellContent(col, row)}
              </Box>
            ))}
          </Box>

          {/* Middle: the other columns as label / value pairs; an empty value shows a dash, a 'wide' one takes the whole line */}
          {fields.length > 0 && (
            <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, columnGap: 2, rowGap: 1.25 }}>
              {fields.map((col) => {
                const value = cellContent(col, row);
                return (
                  <Box key={col.key} sx={{ minWidth: 0, ...(cardRole(col) === 'wide' && { gridColumn: '1 / -1' }) }}>
                    <Typography sx={cardLabelSx}>{col.label}</Typography>
                    <Box sx={{ mt: 0.25, fontSize: 13.5, overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? '—' : value}</Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Bottom: the row's buttons, right-aligned and wrapping when there are many */}
          {footers.length > 0 && (
            <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px solid ${tokens.cardLightBorder}`, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 0.75 }}>
              {footers.map((col) => (
                <Box key={col.key} sx={{ maxWidth: '100%' }}>
                  {cellContent(col, row)}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Client-side pagination footer: "Showing 1–10 of 23 · Prev 1 2 3 Next".
 * `noun` names what is being counted, e.g. noun="feedbacks" -> "Showing 1–5 of 7 feedbacks".
 */
export function Pager({ page, pageSize, total, onPage, noun = '' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize)); // number of pages (at least 1)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1; // first row number on this page
  const to = Math.min(total, page * pageSize); // last row number on this page
  return (
    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
        Showing {from}–{to} of {total}
        {noun && ` ${noun}`}
      </Typography>
      {pages > 1 && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button size="small" variant="outlined" disabled={page === 1} onClick={() => onPage(page - 1)}>
            Prev
          </Button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Button key={n} size="small" variant={n === page ? 'contained' : 'text'} onClick={() => onPage(n)} sx={{ minWidth: 34 }} aria-current={n === page ? 'page' : undefined}>
              {n}
            </Button>
          ))}
          <Button size="small" variant="outlined" disabled={page === pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
}
