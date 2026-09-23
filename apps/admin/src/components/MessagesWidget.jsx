import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import { ChatPanel, DocumentDialog, ErrorState, FilterTabs, Spinner, messageApi, reservationApi, tokens, useNotify, useResource } from '@tm/shared';
import { useAuth } from '../auth.js';

const MessengerContext = createContext({ openMessages: () => {} });

/**
 * Lets any admin page open the chat window, e.g. openMessages(threadId) from a reservation.
 * `mode` is 'mini' (small window, the default) or 'full' (fills the screen).
 */
export const useMessenger = () => useContext(MessengerContext);

/**
 * Holds the chat window state for the admin portal and renders the window itself.
 * `mode` is 'closed', 'mini' (dropdown window under the top-bar chat icon) or 'full' (fills the
 * screen under the top bar, like a video player's fullscreen button).
 */
export function MessengerProvider({ children }) {
  const [mode, setMode] = useState('closed');
  const [activeId, setActiveId] = useState(null); // open conversation (null = thread list)
  const anchorRef = useRef(null); // the top-bar chat icon; the small window lines up under it

  const value = useMemo(
    () => ({
      mode,
      anchorRef,
      // Open the window, optionally on a specific conversation
      openMessages: (threadId = null, nextMode = 'mini') => {
        if (threadId) setActiveId(threadId);
        setMode((was) => (was === 'full' ? 'full' : nextMode));
      },
      // The header icon opens the window, or closes it when it is already open
      toggleMessages: () => setMode((was) => (was === 'closed' ? 'mini' : 'closed')),
      // Close the window, e.g. when the notification list opens so the two don't overlap
      closeMessages: () => setMode('closed')
    }),
    [mode]
  );

  return (
    <MessengerContext.Provider value={value}>
      {children}
      {mode !== 'closed' && <MessagesWindow mode={mode} setMode={setMode} activeId={activeId} setActiveId={setActiveId} anchorRef={anchorRef} />}
    </MessengerContext.Provider>
  );
}

/** Chat icon for the top bar, next to the notification bell. `unread` is the red badge count. */
export function MessagesButton({ unread }) {
  const { mode, anchorRef, toggleMessages } = useMessenger();
  return (
    <Tooltip title="Messages">
      <IconButton ref={anchorRef} onClick={toggleMessages} aria-label={`Messages, ${unread} unread`} aria-expanded={mode !== 'closed'} sx={{ color: mode !== 'closed' ? tokens.gold : tokens.textOnDarkSoft, '&:hover': { color: tokens.gold } }}>
        <Badge badgeContent={unread} color="error" max={9}>
          <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 20 }} />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}

const MINI_WIDTH = 400;

/**
 * The admin inbox window: one conversation per customer, the same one they see in their Chat page.
 * The small window drops down under `anchorRef` (the top-bar chat icon), kept inside the screen.
 */
function MessagesWindow({ mode, setMode, activeId, setActiveId, anchorRef }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const full = mode === 'full';
  // Distance from the right edge of the screen so the small window's right side lines up with the icon
  const [right, setRight] = useState(8);

  // Re-measure the icon position when the window opens and whenever the screen is resized
  useLayoutEffect(() => {
    const place = () => {
      const icon = anchorRef.current;
      if (!icon) return;
      const fromRight = window.innerWidth - icon.getBoundingClientRect().right;
      setRight(Math.max(8, Math.min(fromRight, window.innerWidth - MINI_WIDTH - 8)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorRef]);
  // 'all' or 'unread' tab (fullscreen only)
  const [filter, setFilter] = useState('all');
  // List of every customer conversation
  const threads = useResource(() => messageApi.listThreads({ side: 'admin' }), []);
  // Messages of the selected conversation; reloads whenever activeId changes
  const thread = useResource(() => (activeId ? messageApi.getThread(activeId, { side: 'admin' }) : Promise.resolve(null)), [activeId]);
  // Attachment (contract/receipt) currently shown in the document preview dialog
  const [doc, setDoc] = useState(null);

  // Fullscreen on a wide screen shows both panes, so open the most recent thread
  const isDesktop = useMediaQuery('(min-width:900px)');
  useEffect(() => {
    if (full && isDesktop && !activeId && threads.data && threads.data.length) setActiveId(threads.data[0].id);
  }, [full, isDesktop, activeId, threads.data, setActiveId]);

  // Opening a conversation marks its messages as read for the admin
  useEffect(() => {
    if (thread.data && thread.data.unread > 0) messageApi.markThreadRead(thread.data.id, 'admin');
  }, [thread.data]);

  // If the selected thread no longer exists, warn the admin and go back to the list
  useEffect(() => {
    if (thread.error) {
      notify('That conversation could not be found.', 'warning');
      setActiveId(null);
    }
  }, [thread.error, notify, setActiveId]);

  // Esc leaves fullscreen first, then closes the window
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !doc) setMode((was) => (was === 'full' ? 'mini' : 'closed'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, setMode]);

  // Threads shown in the list. The Unread tab keeps the open thread visible even after it's been read.
  const list = useMemo(() => {
    const all = threads.data || [];
    return full && filter === 'unread' ? all.filter((t) => t.unread > 0 || t.id === activeId) : all;
  }, [threads.data, filter, activeId, full]);

  // Only use the loaded thread if it matches the selected one (avoids flashing the previous chat)
  const t = thread.data && thread.data.id === activeId ? thread.data : null;
  // Number of conversations with unread messages, shown on the Unread tab
  const unreadTotal = (threads.data || []).filter((x) => x.unread > 0).length;

  // Go to a related page; fullscreen shrinks to the small window so the page is visible
  const goTo = (to) => {
    if (full) setMode('mini');
    navigate(to);
  };

  const iconSx = { color: tokens.textOnDarkSoft, '&:hover': { color: tokens.gold } };

  return (
    <>
      <Box
        role="dialog"
        aria-label="Messages"
        className="tm-no-print"
        sx={{
          position: 'fixed',
          zIndex: 1150, // above the sidebar, below the top bar and dialogs
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: tokens.headerBg,
          ...(full
            ? { top: `${tokens.headerHeight}px`, left: 0, right: 0, bottom: 0 }
            : {
                // Dropdown just under the top bar, right-aligned with the chat icon. On phones it also
                // stops above the bottom tab bar (--tm-bottom-nav is 0px on larger screens).
                top: `${tokens.headerHeight + 8}px`,
                right: { xs: 8, sm: right },
                width: { xs: 'calc(100vw - 16px)', sm: MINI_WIDTH },
                height: `min(600px, calc(100dvh - ${tokens.headerHeight + 24}px - var(--tm-bottom-nav, 0px)))`,
                borderRadius: 2,
                border: `1px solid ${tokens.divider}`,
                boxShadow: tokens.shadowPanel
              })
        }}
      >
        {/* Window title bar: fullscreen toggle and close */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, pr: 1, py: 0.75, borderBottom: `1px solid ${tokens.divider}` }}>
          <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 18, color: tokens.gold }} />
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: tokens.textLight }}>Messages</Typography>
          {full && (
            <Box sx={{ backgroundColor: '#fff', borderRadius: 999, p: 0.25, mr: 1 }}>
              <FilterTabs value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unreadTotal }]} />
            </Box>
          )}
          <Tooltip title={full ? 'Exit full screen' : 'Full screen'}>
            <IconButton size="small" onClick={() => setMode(full ? 'mini' : 'full')} aria-label={full ? 'Exit full screen' : 'Full screen'} sx={iconSx}>
              {full ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" onClick={() => setMode('closed')} aria-label="Close messages" sx={iconSx}>
              <CloseRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, p: full ? { xs: 1, md: 2 } : 0 }}>
          {threads.error ? (
            <Box sx={{ height: '100%', backgroundColor: '#fff' }}>
              <ErrorState error={threads.error} onRetry={threads.reload} />
            </Box>
          ) : threads.loading ? (
            <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
              <Spinner />
            </Box>
          ) : (
            <ChatPanel
              side="admin"
              embedded
              compact={!full}
              threads={list}
              activeId={activeId}
              onSelect={setActiveId}
              onBack={() => setActiveId(null)}
              thread={t}
              loadingThread={thread.loading}
              threadTitle={t ? t.customerName : ''}
              threadSubtitle={t ? t.customerEmail : ''}
              headerAction={t && <Button size="small" variant="outlined" onClick={() => goTo(`/customers?open=${t.customerId}`)}>Customer</Button>}
              // Send a reply as the admin; the customer sees it in their Chat page
              onSend={(body) => messageApi.sendMessage(activeId, { side: 'admin', senderName: user.name, body })}
              // Clicking an attachment loads its reservation, then opens the document preview
              onOpenAttachment={async (attachment) => {
                try {
                  const detail = await reservationApi.getReservation(attachment.ref);
                  setDoc({ detail, doc: { kind: attachment.kind, name: attachment.name, paymentId: attachment.paymentId, available: true } });
                } catch (e) {
                  notify(e.message, 'error');
                }
              }}
              emptyText={full && filter === 'unread' ? 'No unread conversations.' : 'No conversations yet.'}
            />
          )}
        </Box>
      </Box>
      {doc && <DocumentDialog open onClose={() => setDoc(null)} detail={doc.detail} doc={doc.doc} />}
    </>
  );
}
