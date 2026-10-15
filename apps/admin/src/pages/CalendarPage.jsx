import { PageHeader, useDocumentTitle } from '@tm/shared';
import CalendarSection from './reservations/CalendarSection.jsx';

export default function CalendarPage() {
  useDocumentTitle('Calendar', 'Tres Marias Admin');

  return (
    <>
      <PageHeader title="Calendar" />
      <CalendarSection />
    </>
  );
}
