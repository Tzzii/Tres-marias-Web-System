import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';
import { ListSkeleton } from './Feedback.jsx';

/**
 * Table for light cards. Scrolls horizontally inside its own container on small
 * screens. `columns`: [{ key, label, render(row), align, width, hideBelow }]
 */
export function DataTable({ columns, rows, rowKey, onRowClick, loading, empty, minWidth = 720, dense = false }) {
  // Placeholder rows while loading; the `empty` message when there's nothing to show
  if (loading) return <ListSkeleton rows={4} height={dense ? 40 : 52} />;
  if (!rows.length) return empty || null;

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
              onClick={onRowClick ? (e) => {
                // Clicking a button, link or checkbox inside the row should not also open the row
                if (e.target.closest('button, a, input, label')) return;
                onRowClick(row);
              } : undefined}
              sx={{ cursor: onRowClick ? 'pointer' : 'default', '&:last-child td': { borderBottom: 0 } }}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align} sx={{ py: dense ? 1 : 1.5, color: tokens.textPrimary }}>
                  {/* Use the column's render function, or just show the matching field */}
                  {col.render ? col.render(row) : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
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
