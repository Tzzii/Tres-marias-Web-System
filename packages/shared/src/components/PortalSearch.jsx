import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { usePortalSearch } from '../hooks/usePortalSearch.js';
import { searchPortalRecords } from '../domain/portalSearch.js';
import { EmptyState, ErrorState, ListSkeleton } from './Feedback.jsx';
import { tokens } from '../theme/tokens.js';

const SearchResults = memo(function SearchResults({ data, query, onClose }) {
  const { total, groups } = useMemo(() => searchPortalRecords(data || [], query), [data, query]);
  if (!total)
    return <EmptyState title="No matching records" description="Try a shorter name or a different reference number." />;
  return (
    <>
      <Typography role="status" sx={{ fontSize: 12, color: tokens.textMuted }}>
        {total} matching {total === 1 ? 'record' : 'records'}
      </Typography>
      {groups.map((group) => (
        <Box key={group.name} sx={{ mt: 2 }}>
          <Typography component="h3" sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.goldText }}>
            {group.name}
          </Typography>
          <List dense>
            {group.items.map((r) => (
              <ListItemButton component={RouterLink} to={r.to} key={r.key} onClick={onClose} sx={{ borderRadius: 1.5 }}>
                <ListItemText
                  primary={r.title}
                  secondary={r.subtitle}
                  primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}
                  secondaryTypographyProps={{ fontSize: 11.5 }}
                />
              </ListItemButton>
            ))}
          </List>
          {group.total > group.items.length && (
            <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>
              Showing the first 12. Refine your search to find a specific record.
            </Typography>
          )}
        </Box>
      ))}
    </>
  );
});

function SearchDialog({ query, admin, resource, onClose }) {
  const [text, setText] = useState(query);
  const inputRef = useRef(null);
  const deferredText = useDeferredValue(text.trim());
  const hasQuery = Boolean(text.trim());
  const { load } = resource;
  useEffect(() => {
    if (hasQuery) load();
  }, [hasQuery, load]);
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="portal-search-title"
      // Avoid repainting a full-screen blur over the live dashboard on each frame.
      slotProps={{ backdrop: { sx: { backdropFilter: 'none', WebkitBackdropFilter: 'none' } } }}
      transitionDuration={120}
      TransitionProps={{ onEntered: () => inputRef.current?.focus({ preventScroll: true }) }}
      PaperProps={{ sx: { borderRadius: '20px', bgcolor: tokens.cardLight, color: tokens.textPrimary } }}
    >
      <DialogTitle
        id="portal-search-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 18 }}
      >
        Search your workspace
        <IconButton onClick={onClose} aria-label="Close search">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          inputRef={inputRef}
          fullWidth
          label={admin ? 'Search events, customers, payments or equipment' : 'Search your events, payments or packages'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          size="small"
          sx={{ mt: 1, mb: 2 }}
        />
        {!hasQuery ? (
          <EmptyState
            title="What are you looking for?"
            description="Try an event name, reservation reference or payment receipt number."
          />
        ) : resource.loading ? (
          <ListSkeleton rows={4} />
        ) : resource.error ? (
          <ErrorState error={resource.error} onRetry={load} />
        ) : (
          <Box aria-busy={text.trim() !== deferredText}>
            <SearchResults data={resource.data} query={deferredText} onClose={onClose} />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Keep this session mounted in the layout so reopening can reuse its index.
// Only the dialog mounts/unmounts, resetting input and restoring focus when closed.
export function PortalSearch({ query = null, admin = false, customerId, onClose }) {
  const resource = usePortalSearch({ admin, customerId });
  return query === null ? null : <SearchDialog query={query} admin={admin} resource={resource} onClose={onClose} />;
}
