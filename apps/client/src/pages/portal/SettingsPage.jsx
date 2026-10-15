import { SettingsPanel, useDocumentTitle } from '@tm/shared';
import ProfilePage from './ProfilePage.jsx';

export default function SettingsPage() {
  useDocumentTitle('Settings');

  return (
    <SettingsPanel accountLabel="My Profile">
      <ProfilePage />
    </SettingsPanel>
  );
}
