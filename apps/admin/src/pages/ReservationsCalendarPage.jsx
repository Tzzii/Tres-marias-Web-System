import { useSearchParams } from 'react-router-dom';
import { PageHeader, useDocumentTitle } from '@tm/shared';
import { SectionTabs } from '../components/SectionTabs.jsx';
import AllReservationsSection from './reservations/AllReservationsSection.jsx';
import CalendarSection from './reservations/CalendarSection.jsx';
import RequestsSection from './reservations/RequestsSection.jsx';

const TABS = [
  ['requests', 'Reservation Requests'],
  ['all', 'All Reservations'],
  ['calendar', 'Calendar and Blocked Dates']
];

export default function ReservationsCalendarPage() {
  useDocumentTitle('Reservation & Calendar', 'Tres Marias Admin');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some(([key]) => key === requested) ? requested : params.get('q') ? 'all' : 'requests';

  return (
    <>
      <PageHeader title="Reservation & Calendar" />
      <SectionTabs
        ariaLabel="Reservation & Calendar sections"
        value={tab}
        onChange={(next) => setParams({ tab: next })}
        options={TABS.map(([value, label]) => ({ value, label }))}
      />
      {tab === 'requests' && <RequestsSection />}
      {tab === 'all' && <AllReservationsSection />}
      {tab === 'calendar' && <CalendarSection />}
    </>
  );
}
