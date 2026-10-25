import { FloatingChat as FloatingChatWindow } from '@tm/shared';
import CustomerConversation from './CustomerConversation.jsx';

export default function FloatingChat({ user, unread = 0 }) {
  return (
    <FloatingChatWindow
      id="customer-floating-chat"
      title="Chat with us"
      subtitle="Tres Marias Catering"
      fullChatPath="/portal/messages"
      launcherTitle="Chat with Tres Marias"
      unread={unread}
    >
      {({ active }) => <CustomerConversation user={user} embedded active={active} />}
    </FloatingChatWindow>
  );
}
