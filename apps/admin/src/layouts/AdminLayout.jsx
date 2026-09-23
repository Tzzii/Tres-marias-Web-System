import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import { PortalShell, authApi, feedbackApi, formatDate, messageApi, outsourceApi, paymentApi, peso, reservationApi, useResource } from '@tm/shared';
import { useAuth } from '../auth.js';
import { MessagesButton, MessengerProvider, useMessenger } from '../components/MessagesWidget.jsx';

/**
 * The admin frame (top bar, sidebar on desktop, bottom tabs on phones) around every admin screen
 * (1r–1y), with the chat window on every page.
 */
export default function AdminLayout() {
  return (
    <MessengerProvider>
      <AdminChrome />
    </MessengerProvider>
  );
}

/** Top bar, sidebar and notifications. Messages live in the top bar (next to the bell), not the sidebar. */
function AdminChrome() {
  const navigate = useNavigate();
  const { user, signOut, updateUser } = useAuth();
  const { openMessages, closeMessages } = useMessenger();

  // The session keeps a copy of the admin's details from sign-in. Compare it with the account record
  // (re-checked whenever data changes) so the top bar and pages never show an old name, email or mobile.
  const account = useResource(() => authApi.getAdminProfile(user.id), [user.id]);
  useEffect(() => {
    // The account no longer exists (removed, or the data was reset): end this session
    if (account.error && account.error.code === 'NOT_FOUND') {
      navigate('/login', { replace: true });
      signOut();
      return;
    }
    const fresh = account.data;
    if (fresh && (fresh.name !== user.name || fresh.email !== user.email || fresh.mobile !== user.mobile)) {
      updateUser({ name: fresh.name, email: fresh.email, mobile: fresh.mobile });
    }
  }, [account.data, account.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load reservations, payments, the admin's message threads, the outsourcing contracts and the
  // customer feedback at the same time. They feed the notification bell, the Messages icon badge
  // and the red badge counts in the sidebar.
  const { data } = useResource(async () => {
    const [reservations, payments, threads, contracts, feedbacks] = await Promise.all([
      reservationApi.listReservations(),
      paymentApi.listPayments(),
      messageApi.listThreads({ side: 'admin' }),
      outsourceApi.listContracts(),
      feedbackApi.listFeedbacks()
    ]);
    return { reservations, payments, threads, contracts, feedbacks };
  }, []);

  // Build the notification list and badge counts from the loaded data.
  // useMemo only recalculates this when `data` changes.
  const { notifications, pending, awaiting, unread, awaitingReply, newFeedback } = useMemo(() => {
    // Nothing loaded yet: show no notifications and zero badges
    if (!data) return { notifications: [], pending: 0, awaiting: 0, unread: 0, awaitingReply: 0, newFeedback: 0 };
    const list = [];
    // One notification per reservation request still waiting for approval
    const pendingList = data.reservations.filter((r) => r.status === 'pending');
    pendingList.forEach((r) =>
      list.push({ id: `req:${r.ref}`, title: 'New reservation request', body: `${r.customerName} · ${r.eventName} · ${formatDate(r.date)} · ${r.guests} pax`, at: r.createdAt, to: `/reservations/${r.ref}` })
    );
    // One notification per payment proof that the admin still needs to verify
    const awaitingList = data.payments.filter((p) => p.status === 'awaiting');
    awaitingList.forEach((p) =>
      list.push({ id: `pay:${p.id}`, title: 'Payment to verify', body: `${p.customerName} sent ${peso(p.amount)} via ${p.methodLabel} for ${p.eventName}.`, at: p.submittedAt, to: `/reports?tab=payments&verify=${p.id}` })
    );
    // One notification per review the admin has not read yet
    const unreadFeedback = data.feedbacks.filter((f) => !f.readByAdmin);
    unreadFeedback.forEach((f) =>
      list.push({ id: `fbk:${f.id}`, title: 'New customer feedback', body: `${f.customerName} rated ${f.eventName} ${f.rating} of 5 stars.`, at: f.createdAt, to: '/feedbacks?tab=unread' })
    );
    // Count unread messages and add a notification for each thread with new messages (clicking opens the chat window)
    let unreadCount = 0;
    data.threads.forEach((t) => {
      unreadCount += t.unread;
      if (t.unread && t.lastMessage) list.push({ id: `msg:${t.lastMessage.id}`, title: `Message from ${t.customerName}`, body: t.lastMessage.body, at: t.lastMessage.at, onClick: () => openMessages(t.id) });
    });
    // Newest first, and keep only the latest 25
    list.sort((a, b) => b.at - a.at);
    return {
      notifications: list.slice(0, 25),
      pending: pendingList.length,
      awaiting: awaitingList.length,
      unread: unreadCount,
      // Outsourcing contracts sent but not yet answered by the partner
      awaitingReply: data.contracts.filter((c) => c.status === 'sent').length,
      newFeedback: unreadFeedback.length
    };
  }, [data, openMessages]);

  // Sidebar links, in the order they appear. `badge` shows a count bubble next to the link.
  // Reservation & Calendar holds requests, all reservations and the calendar (badge = pending requests);
  // Outsource sits under Inventory, since it covers what the inventory can't (badge = contracts still
  // waiting for a reply); Reports holds the payments tab (badge = payment proofs to verify);
  // Feedbacks holds the reviews customers wrote (badge = reviews the admin has not read).
  // Messages is not here: it is the chat icon in the top bar.
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon, to: '/dashboard' },
    { key: 'reservations', label: 'Reservation & Calendar', icon: EventNoteOutlinedIcon, to: '/reservations', badge: pending },
    { key: 'packages', label: 'Packages', icon: RestaurantMenuOutlinedIcon, to: '/packages' },
    { key: 'inventory', label: 'Inventory', icon: Inventory2OutlinedIcon, to: '/inventory' },
    { key: 'outsource', label: 'Outsource', icon: HandshakeOutlinedIcon, to: '/outsource', badge: awaitingReply },
    { key: 'customers', label: 'Customers', icon: GroupsOutlinedIcon, to: '/customers' },
    { key: 'reports', label: 'Reports', icon: AssessmentOutlinedIcon, to: '/reports', badge: awaiting },
    { key: 'feedbacks', label: 'Feedbacks', icon: RateReviewOutlinedIcon, to: '/feedbacks', badge: newFeedback }
  ];

  // Phone bottom tabs: the pages used most on the go. Payments opens the Payments tab of Reports
  // (and stays lit on the Overview tab). "More" opens the full menu; its badge adds up the pages
  // it hides that are waiting on the admin (partner replies and new feedback).
  const bottomNav = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon, to: '/dashboard' },
    { key: 'reservations', label: 'Reservations', icon: EventNoteOutlinedIcon, to: '/reservations', badge: pending },
    { key: 'payments', label: 'Payments', icon: PaymentsOutlinedIcon, to: '/reports?tab=payments', match: ['/reports'], badge: awaiting },
    { key: 'inventory', label: 'Inventory', icon: Inventory2OutlinedIcon, to: '/inventory' },
    { key: 'more', label: 'More', icon: MoreHorizRoundedIcon, drawer: true, badge: awaitingReply + newFeedback }
  ];

  return (
    <PortalShell
      portalKey={`admin.${user.id}`}
      navItems={navItems}
      bottomNav={bottomNav}
      secondaryNavItems={[{ key: 'account', label: 'My account', icon: ManageAccountsOutlinedIcon, to: '/account' }]}
      user={user}
      profileItems={[{ key: 'account', label: 'My account', icon: ManageAccountsOutlinedIcon, to: '/account' }]}
      // The top search bar sends the admin to the All reservations tab filtered by what they typed
      search={{ placeholder: 'Search reservations or customers', onSubmit: (q) => navigate(`/reservations?tab=all&q=${encodeURIComponent(q)}`) }}
      notifications={notifications}
      // Opening the notification list closes the messages window so they don't stack on top of each other
      onNotificationsOpen={closeMessages}
      // Chat icon to the right of the bell; opens the messages dropdown window under it
      headerActions={<MessagesButton unread={unread} />}
      // Go to the login page first, then clear the session
      onLogout={() => {
        navigate('/login', { replace: true });
        signOut();
      }}
    >
      {/* The current page (Dashboard, Payments, ...) renders here */}
      <Outlet />
    </PortalShell>
  );
}
