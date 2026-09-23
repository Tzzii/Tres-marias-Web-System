import { useEffect, useMemo, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import GlobalStyles from '@mui/material/GlobalStyles';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { tokens } from '../theme/tokens.js';
import { formatRelative, initials } from '../utils/format.js';
import { ConfirmDialog } from './AppDialog.jsx';
import { BrandMark } from './Brand.jsx';
import { ThemeModeToggle } from './ThemeModeToggle.jsx';

// Shared animation timing for the sidebar and nav items
const EASE = `all 0.25s ${tokens.easeStandard}`;
// Height of the phone bottom tab bar, not counting the iPhone home-bar area under it
const BOTTOM_NAV_HEIGHT = 56;

// Load a saved list of IDs from localStorage as a Set (used for read notifications)
const readSet = (key) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key)) || []);
  } catch (e) {
    return new Set();
  }
};

/**
 * The signed-in portal frame (top bar, sidebar, menus) shared by both apps (design system: PortalShell).
 *
 * - Desktop: fixed top bar + collapsible 264px sidebar.
 * - Tablet / phone: hamburger opens the navigation drawer, and a magnifier opens the search bar
 *   over the top bar. When `bottomNav` is given, a five-tab bar is pinned to the bottom of the
 *   screen on phones; its height is published on :root as the CSS variable --tm-bottom-nav (0px
 *   when there is no bar), so a fixed bar or window can sit just above it.
 *   A bottom tab with `drawer: true` (e.g. "More") opens the navigation drawer instead of a page,
 *   and lights up on pages that have no tab of their own.
 * - Nav items: { key, label, icon, to, exact?, match?, badge? }. The active item
 *   is worked out from the current URL.
 * - Notifications: [{ id, title, body, at, to, onClick? }]; read state is remembered per portal and user.
 *   `onClick` runs instead of navigating to `to` (e.g. opening the admin chat window).
 * - onNotificationsOpen: runs when the bell opens the list (the admin uses it to close the chat window).
 * - headerActions: extra top-bar buttons shown just after the notification bell.
 */
export default function PortalShell({
  portalKey,
  navItems,
  secondaryNavItems = [],
  bottomNav,
  user,
  profileItems = [],
  search,
  notifications = [],
  onNotificationsOpen,
  headerActions,
  onLogout,
  children
}) {
  const navigate = useNavigate();
  const location = useLocation();
  // Storage keys are per portal and per user, so settings don't mix between accounts
  // (each layout passes a portalKey that includes the user id, e.g. 'admin.adm-001')
  const collapseKey = `tm.${portalKey}.sidebar`;
  const readKey = `tm.${portalKey}.notifications.read`;

  // Sidebar collapsed state, remembered between visits
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(collapseKey) === '1';
    } catch (e) {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false); // phone/tablet menu
  const [profileAnchor, setProfileAnchor] = useState(null); // profile menu (null = closed)
  const [notifAnchor, setNotifAnchor] = useState(null); // notifications menu (null = closed)
  const [readIds, setReadIds] = useState(() => readSet(readKey)); // notifications already read
  const [query, setQuery] = useState(''); // top search box text
  const [searchOpen, setSearchOpen] = useState(false); // phone / tablet search bar open over the top bar
  const [logoutOpen, setLogoutOpen] = useState(false); // logout confirmation

  // Close the phone menu and the phone search bar after navigating to another page
  useEffect(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  // Pressing Enter (or the keyboard's Search key) passes the search text to the portal, which opens
  // its results page. The phone search bar closes so the results are not hidden behind it.
  const submitSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    search.onSubmit(query.trim());
    setSearchOpen(false);
  };

  // Items match their path and everything under it, unless marked `exact`
  const isActive = (item) => (item.match || [item.to]).some((pattern) => matchPath({ path: pattern, end: Boolean(item.exact) }, location.pathname));

  const unread = notifications.filter((n) => !readIds.has(n.id));

  // Mark notifications as read and save them (only the latest 300 IDs are kept)
  const markRead = (ids) => {
    const next = new Set([...readIds, ...ids]);
    setReadIds(next);
    try {
      localStorage.setItem(readKey, JSON.stringify([...next].slice(-300)));
    } catch (e) {
      /* ignore */
    }
  };

  // Collapse or expand the desktop sidebar and remember the choice
  const toggleSidebar = () => {
    setCollapsed((was) => {
      try {
        localStorage.setItem(collapseKey, was ? '0' : '1');
      } catch (e) {
        /* ignore */
      }
      return !was;
    });
  };

  const width = collapsed ? tokens.sidebarCollapsedWidth : tokens.sidebarWidth;

  /**
   * Draw one sidebar link. When the sidebar is collapsed ("narrow") only the icon shows,
   * the badge becomes a red dot, and the label appears as a tooltip.
   * `forceExpanded` is used by the phone drawer, which always shows labels.
   */
  const renderNavItem = (item, forceExpanded = false) => {
    const active = isActive(item);
    const narrow = collapsed && !forceExpanded;
    const button = (
      <ButtonBase
        key={item.key}
        onClick={() => navigate(item.to)}
        aria-current={active ? 'page' : undefined}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: narrow ? 'center' : 'flex-start',
          gap: 1.4,
          px: narrow ? 1 : 1.75,
          py: 1.15,
          borderRadius: 1.25,
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: active ? 700 : 500,
          color: active ? tokens.sidebarActiveText : tokens.sidebarText,
          backgroundColor: active ? tokens.sidebarActiveBg : 'transparent',
          borderLeft: `3px solid ${active ? tokens.gold : 'transparent'}`,
          transition: EASE,
          '&:hover': { backgroundColor: active ? tokens.sidebarActiveHover : tokens.sidebarHover, color: tokens.sidebarActiveText }
        }}
      >
        <Badge color="error" variant={narrow ? 'dot' : 'standard'} badgeContent={narrow ? (item.badge ? 1 : 0) : 0} invisible={!narrow || !item.badge}>
          <item.icon sx={{ fontSize: 19 }} />
        </Badge>
        {!narrow && (
          <>
            {/* minWidth 0 lets a long label shrink (with …) instead of pushing the badge out of line */}
            <Box component="span" sx={{ flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.label}
            </Box>
            {/* Count bubble; flexShrink 0 keeps every badge the same size at the right edge */}
            {item.badge ? (
              <Box component="span" sx={{ flexShrink: 0, minWidth: 20, height: 20, px: 0.75, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff', backgroundColor: tokens.red }}>
                {item.badge > 99 ? '99+' : item.badge}
              </Box>
            ) : null}
          </>
        )}
      </ButtonBase>
    );
    return narrow ? (
      <Tooltip key={item.key} title={item.label} placement="right">
        {button}
      </Tooltip>
    ) : (
      button
    );
  };

  // Main links, secondary links (e.g. My account) and the Log out button, reused in the sidebar and drawer
  const navList = (forceExpanded) => (
    <Box component="nav" aria-label="Main" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {navItems.map((item) => renderNavItem(item, forceExpanded))}
    </Box>
  );

  const secondaryList = (forceExpanded) =>
    secondaryNavItems.length > 0 && (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>{secondaryNavItems.map((item) => renderNavItem(item, forceExpanded))}</Box>
    );

  // Log out is always red (light red text and a soft red fill on the dark sidebar) so it stands apart
  // from the nav links; hover deepens the fill
  const logoutButton = (forceExpanded) => {
    const narrow = collapsed && !forceExpanded;
    const button = (
      <ButtonBase
        onClick={() => setLogoutOpen(true)}
        sx={{ width: '100%', display: 'flex', justifyContent: narrow ? 'center' : 'flex-start', gap: 1.4, px: narrow ? 1 : 1.75, py: 1.15, borderRadius: 1.25, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: tokens.sidebarDanger, backgroundColor: tokens.sidebarDangerBg, borderLeft: '3px solid transparent', '&:hover': { backgroundColor: tokens.sidebarDangerHover } }}
      >
        <LogoutRoundedIcon sx={{ fontSize: 19 }} />
        {!narrow && 'Log out'}
      </ButtonBase>
    );
    return narrow ? <Tooltip title="Log out" placement="right">{button}</Tooltip> : button;
  };

  const hasBottomNav = Boolean(bottomNav && bottomNav.length);
  // Which bottom tab matches the current page. A page with no tab of its own lights up the
  // drawer ("More") tab, if there is one.
  const bottomActive = useMemo(() => {
    if (!hasBottomNav) return null;
    return bottomNav.find((item) => !item.drawer && isActive(item)) || bottomNav.find((item) => item.drawer) || null;
  }, [location.pathname, bottomNav]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: tokens.bgBase, backgroundImage: tokens.gradientPage, backgroundAttachment: 'fixed' }}>
      {/* --tm-bottom-nav: height of the phone tab bar (56px plus the iPhone home-bar area), 0px where there
          is none. Set on :root so fixed bars and windows outside this frame (e.g. the admin chat window) see it too. */}
      <GlobalStyles
        styles={(theme) => ({
          ':root': {
            '--tm-bottom-nav': hasBottomNav ? `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` : '0px',
            [theme.breakpoints.up('md')]: { '--tm-bottom-nav': '0px' }
          }
        })}
      />
      {/* Hidden "Skip to content" link; appears when keyboard users press Tab */}
      <Box component="a" href="#main" sx={{ position: 'absolute', left: -9999, '&:focus': { left: 12, top: 12, zIndex: 2000, px: 2, py: 1, borderRadius: 1, backgroundColor: tokens.gold, color: tokens.onGold, fontWeight: 700 } }}>
        Skip to content
      </Box>

      {/* ==================== TOP BAR ==================== */}
      <AppBar className="tm-no-print" position="fixed" elevation={0} sx={{ height: tokens.headerHeight, justifyContent: 'center', backgroundColor: tokens.headerBg, color: tokens.textLight, borderBottom: `1px solid ${tokens.divider}`, zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: { xs: 1, md: 2 }, px: { xs: 1.5, md: 3 } }}>
          <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open navigation" sx={{ display: { xs: 'inline-flex', lg: 'none' }, color: tokens.textOnDarkSoft }}>
            <MenuRoundedIcon />
          </IconButton>
          <BrandMark subtitle={null} hideTextOnXs onClick={() => navigate(navItems[0].to)} />

          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            {/* Desktop search box in the middle of the top bar */}
            {search && (
              <Box
                component="form"
                role="search"
                onSubmit={submitSearch}
                sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, width: '100%', maxWidth: 440, px: 1.75, py: 0.75, borderRadius: 999, backgroundColor: tokens.shellInset, border: `1px solid ${tokens.shellBorder}`, transition: EASE, '&:focus-within': { borderColor: tokens.gold, backgroundColor: tokens.shellHover } }}
              >
                <SearchRoundedIcon sx={{ fontSize: 18, color: tokens.textOnDarkMuted }} />
                <InputBase value={query} onChange={(e) => setQuery(e.target.value)} placeholder={search.placeholder} inputProps={{ 'aria-label': search.placeholder, autoComplete: 'off' }} sx={{ flex: 1, fontSize: 13.5, color: tokens.textLight }} />
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.25, sm: 0.75 }, flexShrink: 0 }}>
            {/* Phone / tablet: the magnifier opens the search bar over the top bar */}
            {search && (
              <IconButton onClick={() => setSearchOpen(true)} aria-label="Search" sx={{ display: { xs: 'inline-flex', md: 'none' }, color: tokens.textOnDarkSoft, '&:hover': { color: tokens.gold } }}>
                <SearchRoundedIcon sx={{ fontSize: 22 }} />
              </IconButton>
            )}
            <Tooltip title="Notifications">
              <IconButton
                onClick={(e) => {
                  setNotifAnchor(e.currentTarget);
                  if (onNotificationsOpen) onNotificationsOpen();
                }}
                aria-label={`Notifications, ${unread.length} unread`} sx={{ color: tokens.textOnDarkSoft, '&:hover': { color: tokens.gold } }}>
                <Badge badgeContent={unread.length} color="error" max={9}>
                  <NotificationsNoneRoundedIcon sx={{ fontSize: 21 }} />
                </Badge>
              </IconButton>
            </Tooltip>
            <ThemeModeToggle />
            {headerActions}

            <Button
              onClick={(e) => setProfileAnchor(e.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={Boolean(profileAnchor)}
              endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 14, display: { xs: 'none', sm: 'block' } }} />}
              sx={{ gap: 1, minWidth: 0, pl: 0.5, pr: { xs: 0.5, sm: 1.25 }, py: 0.5, borderRadius: 999, color: tokens.textLight, border: `1px solid ${tokens.shellBorder}`, '&:hover': { backgroundColor: tokens.shellInset, borderColor: tokens.gold } }}
            >
              <Avatar sx={{ width: 32, height: 32, fontSize: 13, fontWeight: 700, color: tokens.onGold, backgroundColor: tokens.gold }}>{initials(user?.name)}</Avatar>
              <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15, maxWidth: 160 }}>
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700, maxWidth: 160 }}>{user?.name}</Typography>
                <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', color: tokens.goldText, textTransform: 'uppercase' }}>{user?.role}</Typography>
              </Box>
            </Button>
          </Box>

          {/* Phone / tablet search bar: covers the top bar while open. The back arrow or Esc closes it.
              16px text keeps iPhones from zooming in when the box is tapped. */}
          {search && searchOpen && (
            <Box
              component="form"
              role="search"
              onSubmit={submitSearch}
              onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
              sx={{ position: 'absolute', inset: 0, zIndex: 1, display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1, px: 1.5, backgroundColor: tokens.headerBg }}
            >
              <IconButton onClick={() => setSearchOpen(false)} aria-label="Close search" sx={{ color: tokens.textOnDarkSoft }}>
                <ArrowBackRoundedIcon />
              </IconButton>
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 0.75, borderRadius: 999, backgroundColor: tokens.shellHover, border: `1px solid ${tokens.gold}` }}>
                <SearchRoundedIcon sx={{ fontSize: 18, color: tokens.textOnDarkMuted }} />
                <InputBase autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={search.placeholder} inputProps={{ 'aria-label': search.placeholder, autoComplete: 'off', enterKeyHint: 'search' }} sx={{ flex: 1, fontSize: 16, color: tokens.textLight }} />
              </Box>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Notifications. The page behind stays clickable (no blocking backdrop), so one click on another
          top-bar button (e.g. the admin Messages icon) both closes this list and does its own action.
          variant="menu" and disableAutoFocusItem stop the menu from handing focus props (autoFocus,
          tabIndex) to its first child, the ClickAwayListener, which cannot take them; the list itself
          still gets focus when it opens. */}
      <Menu
        anchorEl={notifAnchor}
        open={Boolean(notifAnchor)}
        onClose={() => setNotifAnchor(null)}
        variant="menu"
        disableAutoFocusItem
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        hideBackdrop
        disableScrollLock
        disableEnforceFocus
        sx={{ pointerEvents: 'none' }}
        slotProps={{ paper: { sx: { mt: 1, width: 360, maxWidth: 'calc(100vw - 24px)', borderRadius: 1.5, pointerEvents: 'auto' } } }}
        MenuListProps={{ sx: { py: 0 } }}
      >
        {/* Clicking anywhere outside the list closes it (clicking the bell again also closes it) */}
        <ClickAwayListener onClickAway={() => setNotifAnchor(null)}>
        <Box>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.textLight }}>Notifications</Typography>
          <Button size="small" disabled={!unread.length} onClick={() => markRead(notifications.map((n) => n.id))} sx={{ fontSize: 12, minWidth: 0, p: 0 }}>
            Mark all as read
          </Button>
        </Box>
        <Divider sx={{ borderColor: tokens.dividerFaint }} />
        {notifications.length === 0 ? (
          <Box sx={{ px: 3, py: 4, textAlign: 'center', color: tokens.textOnDarkMuted }}>
            <NotificationsNoneRoundedIcon sx={{ fontSize: 32, opacity: 0.55 }} />
            <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 600, color: tokens.textOnDarkSoft }}>You're all caught up</Typography>
            <Typography sx={{ mt: 0.5, fontSize: 12 }}>Updates about reservations and payments appear here.</Typography>
          </Box>
        ) : (
          <Box className="tm-scroll" sx={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.map((n) => {
              const isUnread = !readIds.has(n.id);
              return (
                <MenuItem
                  key={n.id}
                  // Clicking a notification marks it read, closes the menu and runs its onClick or opens its page
                  onClick={() => {
                    markRead([n.id]);
                    setNotifAnchor(null);
                    if (n.onClick) n.onClick();
                    else if (n.to) navigate(n.to);
                  }}
                  sx={{ alignItems: 'flex-start', gap: 1.25, py: 1.25, whiteSpace: 'normal', borderBottom: `1px solid ${tokens.dividerFaint}` }}
                >
                  <Box sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: isUnread ? tokens.gold : 'transparent' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: isUnread ? 700 : 600, color: tokens.textLight }}>{n.title}</Typography>
                    <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: tokens.textOnDarkSoft }}>{n.body}</Typography>
                    {n.at && <Typography sx={{ mt: 0.25, fontSize: 11, color: tokens.textOnDarkMuted }}>{formatRelative(n.at)}</Typography>}
                  </Box>
                </MenuItem>
              );
            })}
          </Box>
        )}
        </Box>
        </ClickAwayListener>
      </Menu>

      {/* Profile */}
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, width: 240, borderRadius: 1.5 } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textLight }}>{user?.name}</Typography>
          <Typography noWrap sx={{ fontSize: 12, color: tokens.textOnDarkMuted }}>{user?.email}</Typography>
        </Box>
        <Divider sx={{ borderColor: tokens.dividerFaint }} />
        {profileItems.map((item) => (
          <MenuItem
            key={item.key}
            onClick={() => {
              setProfileAnchor(null);
              navigate(item.to);
            }}
            sx={{ color: tokens.textOnDarkSoft }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
              <item.icon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13.5 }}>{item.label}</ListItemText>
          </MenuItem>
        ))}
        {profileItems.length > 0 && <Divider sx={{ borderColor: tokens.dividerFaint }} />}
        <MenuItem
          onClick={() => {
            setProfileAnchor(null);
            setLogoutOpen(true);
          }}
          sx={{ color: tokens.dangerSoft }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
            <LogoutRoundedIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13.5 }}>Log out</ListItemText>
        </MenuItem>
      </Menu>

      {/* Mobile / tablet navigation drawer. It opens over the top bar (the top bar sits above ordinary
          drawers), so its own logo row and close button are not hidden behind the top bar. */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
        // Same dark colour as the desktop sidebar
        PaperProps={{ sx: { width: 280, backgroundColor: tokens.sidebarBg, backgroundImage: 'none', borderRight: `1px solid ${tokens.sidebarBorder}` } }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark subtitle={null} textColor={tokens.onInk} />
          <IconButton onClick={() => setDrawerOpen(false)} aria-label="Close navigation" sx={{ color: tokens.sidebarText, '&:hover': { color: tokens.gold } }}>
            <MenuOpenRoundedIcon />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: tokens.sidebarBorder }} />
        <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, gap: 2 }}>
          {navList(true)}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {secondaryList(true)}
            {logoutButton(true)}
          </Box>
        </Box>
      </Drawer>

      {/* ==================== SIDEBAR + CONTENT ==================== */}
      <Box sx={{ display: 'flex', pt: `${tokens.headerHeight}px`, minHeight: '100vh' }}>
        <Box
          component="aside"
          className="tm-no-print"
          sx={{
            width,
            position: 'fixed',
            top: `${tokens.headerHeight}px`,
            bottom: 0,
            left: 0,
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 2,
            py: 2,
            px: 1.25,
            // Darker than the page ("Espresso" in light mode) so the sidebar reads as its own column
            backgroundColor: tokens.sidebarBg,
            borderRight: `1px solid ${tokens.sidebarBorder}`,
            overflowY: 'auto',
            transition: EASE,
            zIndex: 10
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? 0 : 1, pb: 1 }}>
              {!collapsed && <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: tokens.sidebarTextMuted }}>Navigation</Typography>}
              <IconButton onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} size="small" sx={{ color: tokens.sidebarText, '&:hover': { color: tokens.gold } }}>
                {collapsed ? <MenuRoundedIcon sx={{ fontSize: 20 }} /> : <MenuOpenRoundedIcon sx={{ fontSize: 20 }} />}
              </IconButton>
            </Box>
            {navList(false)}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {secondaryList(false)}
            {logoutButton(false)}
          </Box>
        </Box>

        {/* Empty spacer the same width as the fixed sidebar, so page content isn't hidden behind it */}
        <Box className="tm-no-print" sx={{ width, flexShrink: 0, display: { xs: 'none', lg: 'block' }, transition: EASE }} />

        {/* On phones the bottom padding clears the tab bar (its height plus 32px), so the end of the page is never hidden under it */}
        <Box component="main" id="main" tabIndex={-1} sx={{ flex: 1, minWidth: 0, outline: 'none', px: { xs: 1.5, sm: 2.5, md: 3 }, pt: { xs: 2, md: 3 }, pb: { xs: hasBottomNav ? 'calc(var(--tm-bottom-nav) + 32px)' : 4, md: 5 } }}>
          <Box sx={{ maxWidth: 1400, mx: 'auto' }}>{children}</Box>
        </Box>
      </Box>

      {/* Phone bottom navigation: BOTTOM_NAV_HEIGHT tall, plus the iPhone home-bar area under the tabs */}
      {hasBottomNav && (
        <Box component="nav" aria-label="Quick navigation" className="tm-no-print" sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, height: 'var(--tm-bottom-nav)', display: { xs: 'grid', md: 'none' }, gridTemplateColumns: `repeat(${bottomNav.length}, 1fr)`, backgroundColor: tokens.shellScrim, backdropFilter: 'blur(14px)', borderTop: `1px solid ${tokens.divider}`, pb: 'env(safe-area-inset-bottom)' }}>
          {bottomNav.map((item) => {
            const active = bottomActive && bottomActive.key === item.key;
            return (
              // A drawer tab ("More") opens the full navigation; every other tab goes to its page
              <ButtonBase
                key={item.key}
                onClick={() => (item.drawer ? setDrawerOpen(true) : navigate(item.to))}
                aria-current={active && !item.drawer ? 'page' : undefined}
                aria-haspopup={item.drawer ? 'dialog' : undefined}
                sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 700 : 500, color: active ? tokens.goldText : tokens.textOnDarkMuted }}
              >
                <Badge color="error" badgeContent={item.badge || 0} max={9}>
                  <item.icon sx={{ fontSize: 22 }} />
                </Badge>
                {item.label}
              </ButtonBase>
            );
          })}
        </Box>
      )}

      {/* "Log out?" confirmation; confirming calls the portal's onLogout */}
      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={async () => {
          setLogoutOpen(false);
          onLogout();
        }}
        title="Log out?"
        description="You will need to sign in again to continue."
        confirmLabel="Log out"
        tone="danger"
      />
    </Box>
  );
}
