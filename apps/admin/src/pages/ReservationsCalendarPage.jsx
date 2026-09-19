import { useSearchParams } from 'react-router-dom';
import { PageHeader, useDocumentTitle } from '@tm/shared';
import { SectionTabs } from '../components/SectionTabs.jsx';
import AllReservationsSection from './reservations/AllReservationsSection.jsx';
import CalendarSection from './reservations/CalendarSection.jsx';
import RequestsSection from './reservations/RequestsSection.jsx';

// Tabs of this page as [key, label]
const TABS = [
  ['requests', 'Reservation requests'],
  ['all', 'All reservations'],
  ['calendar', 'Calendar and blocked dates']
];

/**
 * Reservation & Calendar: one page for reservation requests, all reservations and the calendar.
 * The open tab lives in the URL (?tab=requests|all|calendar) so links and the back button work.
 * With no tab, a search (?q=) opens All reservations; otherwise Reservation requests opens.
 */
export default function ReservationsCalendarPage() {
  useDocumentTitle('Reservation & Calendar', 'Tres Marias Admin');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some(([key]) => key === requested) ? requested : params.get('q') ? 'all' : 'requests';

  return (
    <>
      <PageHeader title="Reservation & Calendar" />
      {/* Switching tabs clears the other tab's URL options, e.g. ?q= */}
      <SectionTabs ariaLabel="Reservation & Calendar sections" value={tab} onChange={(next) => setParams({ tab: next })} options={TABS.map(([value, label]) => ({ value, label }))} />
      {tab === 'requests' && <RequestsSection />}
      {tab === 'all' && <AllReservationsSection />}
      {tab === 'calendar' && <CalendarSection />}
    </>
  );
}
