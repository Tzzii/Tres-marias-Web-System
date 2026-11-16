export function presenceLabel(presence) {
  if (!presence) return 'Status unavailable';
  if (presence.online) return 'Active now';
  if (presence.offlineSince == null) return 'Offline';
  const minutes = Math.max(0, Math.floor((presence.serverTime - presence.offlineSince) / 60000));
  if (minutes < 1) return 'Active just now';
  if (minutes < 60) return `Active ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  return `Active ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

export function shouldSendAwayReply(presence, lastReplyAt) {
  return (
    !presence.online && (lastReplyAt == null || (presence.offlineSince != null && lastReplyAt < presence.offlineSince))
  );
}
