import { useEffect, useRef, useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { tokens } from '../theme/tokens.js';
import { LightSurface } from './Surface.jsx';
import { formatClock, formatDate, formatRelative, initials, parseISODate, toISODate, todayISO } from '../utils/format.js';

/**
 * Messaging UI shared by the customer Chat page (1l) and the admin inbox. The admin gets two
 * panes (one conversation per customer, then the messages); on phones it shows the list, then
 * the conversation with a back button.
 *
 * `side` is 'customer' or 'admin': own messages sit on the right.
 * Customers only ever talk to the Tres Marias admin, so on their side every reply is labelled "Admin".
 * A message about a reservation shows the event's name as a small tag above it.
 * `single` shows only the open conversation (the customer has just one), with no list or back button.
 * `composeTag` ({ label }) shows what the next message is about above the text box; `onClearComposeTag` removes it.
 * `embedded` fills its parent (e.g. the admin chat window) instead of sizing itself to the page.
 * `compact` always uses the one-pane phone layout, for narrow windows on any screen size.
 */
export function ChatPanel({ side, threads, activeId, onSelect, onBack, thread, loadingThread, onSend, onOpenAttachment, threadTitle, threadSubtitle, headerAction, emptyText, composeTag, onClearComposeTag, embedded = false, compact = false, single = false }) {
  const [text, setText] = useState(''); // message being typed
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef(null); // the scrolling messages area

  // Scroll to the newest message when a thread opens or a message arrives
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread?.messages?.length, activeId]);

  // Clear the text box when switching conversations
  useEffect(() => {
    setText('');
    setError('');
  }, [activeId]);

  // Send the typed message (ignored if empty or already sending)
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await onSend(text);
      setText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  // Date divider text: "Today", "Yesterday", or the date
  const dayLabel = (at) => {
    const iso = toISODate(new Date(at));
    if (iso === todayISO()) return 'Today';
    const y = parseISODate(todayISO());
    y.setDate(y.getDate() - 1);
    if (iso === toISODate(y)) return 'Yesterday';
    return formatDate(iso);
  };

  // Page mode sizes itself to the viewport as a card; embedded mode just fills its parent
  const sizeSx = embedded
    ? { height: '100%', minHeight: 0, borderRadius: compact ? 0 : 2 }
    : { height: { xs: 'calc(100dvh - 190px)', md: 'calc(100vh - 190px)' }, minHeight: 460, borderRadius: 2, border: `1px solid ${tokens.cardLightBorder}`, boxShadow: tokens.shadowDash };

  // minmax(0, 1fr) keeps columns from stretching to fit long one-line text, so previews end in "..."
  const fill = 'minmax(0, 1fr)';

  return (
    <LightSurface>
    <Box sx={{ display: 'grid', gridTemplateColumns: compact || single ? fill : { xs: fill, md: `320px ${fill}` }, overflow: 'hidden', backgroundColor: '#fff', ...sizeSx }}>
      {/* Threads */}
      <Box sx={{ display: single ? 'none' : compact ? (activeId ? 'none' : 'flex') : { xs: activeId ? 'none' : 'flex', md: 'flex' }, flexDirection: 'column', borderRight: compact ? 'none' : { md: `1px solid ${tokens.cardLightBorder}` }, minHeight: 0, minWidth: 0 }}>
        <Typography sx={{ px: 2, py: 1.75, fontSize: 15, fontWeight: 700, color: tokens.textPrimary, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>Threads</Typography>
        <Box className="tm-scroll" sx={{ overflowY: 'auto', flex: 1 }}>
          {threads.length === 0 && <Typography sx={{ p: 2, fontSize: 13.5, color: tokens.textSecondary }}>{emptyText}</Typography>}
          {threads.map((t) => {
            const on = t.id === activeId;
            return (
              <ButtonBase key={t.id} onClick={() => onSelect(t.id)} sx={{ width: '100%', display: 'flex', gap: 1.25, alignItems: 'flex-start', px: 2, py: 1.5, textAlign: 'left', fontFamily: 'inherit', borderBottom: `1px solid ${tokens.cardLightBorder}`, backgroundColor: on ? tokens.surfaceMuted : '#fff', borderLeft: `3px solid ${on ? tokens.gold : 'transparent'}` }}>
                <Avatar sx={{ width: 38, height: 38, fontSize: 13, fontWeight: 700, bgcolor: 'rgba(197,160,89,0.18)', color: tokens.goldDark }}>
                  {/* The admin sees the customer's initials; customers see TM (Tres Marias) */}
                  {side === 'admin' ? initials(t.customerName) : 'TM'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography noWrap sx={{ minWidth: 0, fontSize: 13.5, fontWeight: t.unread ? 800 : 700, color: tokens.textPrimary }}>
                      {side === 'admin' ? t.customerName : 'Admin'}
                    </Typography>
                    {t.updatedAt > 0 && <Typography sx={{ flexShrink: 0, fontSize: 11, color: tokens.textMuted }}>{formatRelative(t.updatedAt)}</Typography>}
                  </Box>
                  <Typography noWrap sx={{ fontSize: 12, color: tokens.goldDark, fontWeight: 600 }}>
                    {side === 'admin' ? t.customerEmail : 'Tres Marias Catering'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.unread ? tokens.textPrimary : tokens.textMuted }}>{t.lastMessage ? t.lastMessage.body : 'No messages yet'}</Typography>
                    {t.unread > 0 && <Box sx={{ minWidth: 18, height: 18, px: 0.5, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff', backgroundColor: tokens.red }}>{t.unread}</Box>}
                  </Box>
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      {/* Conversation */}
      <Box sx={{ display: single ? 'flex' : compact ? (activeId ? 'flex' : 'none') : { xs: activeId ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        {!activeId ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 14, color: tokens.textSecondary }}>Select a conversation to read it.</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
              <IconButton onClick={onBack} aria-label="Back to threads" sx={{ display: single ? 'none' : compact ? 'inline-flex' : { md: 'none' } }}>
                <ArrowBackRoundedIcon />
              </IconButton>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>{threadTitle}</Typography>
                <Typography noWrap sx={{ fontSize: 12, color: tokens.textMuted }}>{threadSubtitle}</Typography>
              </Box>
              {headerAction}
            </Box>

            <Box ref={scroller} className="tm-scroll" role="log" aria-live="polite" sx={{ flex: 1, overflowY: 'auto', px: { xs: 1.5, sm: 2.5 }, py: 2, backgroundColor: tokens.surfaceSubtle }}>
              {loadingThread || !thread ? (
                <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                  <CircularProgress size={26} />
                </Box>
              ) : thread.messages.length === 0 ? (
                <Typography sx={{ textAlign: 'center', mt: 4, fontSize: 13.5, color: tokens.textSecondary }}>No messages yet. Say hello!</Typography>
              ) : (
                thread.messages.map((m, i) => {
                  const mine = m.from === side; // my messages go on the right in dark bubbles
                  // Show a date divider before the first message of each day
                  const newDay = i === 0 || dayLabel(thread.messages[i - 1].at) !== dayLabel(m.at);
                  return (
                    <Box key={m.id}>
                      {newDay && (
                        <Typography sx={{ textAlign: 'center', my: 1.5, fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>{dayLabel(m.at)}</Typography>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', mb: 1.25 }}>
                        <Box sx={{ maxWidth: { xs: '85%', sm: '72%' } }}>
                          {/* Sender above the other side's bubbles: "Admin" for customers, the customer's name for the admin */}
                          {!mine && <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: tokens.textMuted, mb: 0.25, ml: 0.5 }}>{side === 'customer' ? 'Admin' : m.senderName}</Typography>}
                          {/* The event this message is about */}
                          {m.eventName && (
                            <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', mb: 0.4 }}>
                              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', px: 1, py: 0.25, borderRadius: 999, fontSize: 11, fontWeight: 600, color: tokens.goldDark, backgroundColor: 'rgba(197,160,89,0.14)' }}>
                                <EventOutlinedIcon sx={{ fontSize: 13 }} />
                                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.eventName}</Box>
                              </Box>
                            </Box>
                          )}
                          <Box sx={{ px: 1.75, py: 1.1, borderRadius: 2, borderTopRightRadius: mine ? 4 : 16, borderTopLeftRadius: mine ? 16 : 4, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: mine ? tokens.onInk : tokens.textPrimary, backgroundColor: mine ? tokens.ink : tokens.cardLight, border: mine ? 'none' : `1px solid ${tokens.cardLightBorder}` }}>
                            {m.body}
                            {m.attachment && (
                              <ButtonBase onClick={() => onOpenAttachment && onOpenAttachment(m.attachment)} sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, width: '100%', px: 1.25, py: 1, borderRadius: 1.5, fontFamily: 'inherit', textAlign: 'left', backgroundColor: mine ? 'rgba(255,255,255,0.12)' : tokens.surfaceMuted }}>
                                <AttachFileRoundedIcon sx={{ fontSize: 18 }} />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700 }}>{m.attachment.name}</Typography>
                                  <Typography sx={{ fontSize: 11, opacity: 0.75 }}>Attachment · tap to open</Typography>
                                </Box>
                              </ButtonBase>
                            )}
                          </Box>
                          <Typography sx={{ mt: 0.25, fontSize: 11, color: tokens.textMuted, textAlign: mine ? 'right' : 'left', mx: 0.5 }}>
                            {formatClock(m.at)}
                            {/* "read" appears under my message once the other side has seen it */}
                            {mine && (side === 'customer' ? m.readByAdmin : m.readByCustomer) ? ' · read' : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>

            {/* What the next message is about, e.g. after "Message us" on a reservation */}
            {composeTag && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, pt: 1, borderTop: `1px solid ${tokens.cardLightBorder}` }}>
                <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>About</Typography>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, pl: 1, pr: 0.25, py: 0.1, borderRadius: 999, fontSize: 12, fontWeight: 600, color: tokens.goldDark, backgroundColor: 'rgba(197,160,89,0.14)' }}>
                  <EventOutlinedIcon sx={{ fontSize: 14 }} />
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{composeTag.label}</Box>
                  {onClearComposeTag && (
                    <IconButton size="small" onClick={onClearComposeTag} aria-label="Remove topic" sx={{ p: 0.25, color: 'inherit' }}>
                      <CloseRoundedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              </Box>
            )}
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, p: 1.25, borderTop: composeTag ? 'none' : `1px solid ${tokens.cardLightBorder}` }}
            >
              <InputBase
                value={text}
                onChange={(e) => setText(e.target.value)}
                // Enter sends; Shift+Enter adds a new line
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Write a message"
                multiline
                maxRows={5}
                inputProps={{ 'aria-label': 'Write a message', maxLength: 2000 }}
                sx={{ flex: 1, px: 1.5, py: 1, fontSize: 14, color: tokens.textPrimary, borderRadius: 1.5, border: `1px solid ${tokens.borderInput}`, '&.Mui-focused': { borderColor: tokens.borderFocus } }}
              />
              <IconButton type="submit" disabled={!text.trim() || sending} aria-label="Send" sx={{ width: 44, height: 44, color: tokens.onInk, backgroundColor: tokens.ink, '&:hover': { backgroundColor: tokens.inkHover }, '&.Mui-disabled': { color: tokens.onInk, backgroundColor: tokens.placeholder } }}>
                {sending ? <CircularProgress size={18} sx={{ color: tokens.onInk }} /> : <SendRoundedIcon sx={{ fontSize: 20 }} />}
              </IconButton>
            </Box>
            {error && <Typography sx={{ px: 2, pb: 1, fontSize: 12.5, color: tokens.redPress }}>{error}</Typography>}
          </>
        )}
      </Box>
    </Box>
    </LightSurface>
  );
}
