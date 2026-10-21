import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DashCard, CardTitle } from './DashCard.jsx';
import { matchesSearch } from '../domain/experience.js';
import { formatDateTime } from '../utils/format.js';
import { tokens } from '../theme/tokens.js';

export function ActivityTimeline({ entries = [], title = 'Activity', id }) {
  const [query, setQuery] = useState('');
  const shown = entries
    .slice()
    .reverse()
    .filter((entry) => matchesSearch([entry.text, entry.actor, formatDateTime(entry.at)], query));
  return (
    <DashCard id={id}>
      <CardTitle subtitle="A searchable history of this reservation">{title}</CardTitle>
      <TextField
        size="small"
        fullWidth
        label="Search activity or person"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2 }}
      />
      <Typography role="status" sx={{ fontSize: 11.5, color: tokens.textMuted, mb: 1.5 }}>
        {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
      </Typography>
      {!shown.length ? (
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
          {query
            ? 'No matching activity. Try a different word or name.'
            : 'Updates will appear here as your booking progresses.'}
        </Typography>
      ) : (
        <Box
          component="ol"
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, maxHeight: 380, overflowY: 'auto' }}
        >
          {shown.map((entry, index) => (
            <Box component="li" key={`${entry.at}-${index}`} sx={{ display: 'flex', gap: 1.5 }}>
              <Box
                aria-hidden="true"
                sx={{
                  mt: 0.6,
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: index === 0 ? tokens.gold : tokens.cardLightBorder
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{entry.text}</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 11.5, color: tokens.textMuted }}>
                  {entry.actor} · {formatDateTime(entry.at)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </DashCard>
  );
}
