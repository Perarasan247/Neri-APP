/**
 * Client-generated ids for things created while offline. They are sent as `client_id`, which the
 * server uses as the row's id and treats as an idempotency key (sending it twice creates one row).
 * Pattern the server accepts: [A-Za-z0-9_-]{8,36}.
 */
export function newClientId(random: () => number = Math.random): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  // RFC 4122 v4 layout: 8-4-4-4-12, version nibble 4, variant 8-b
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
