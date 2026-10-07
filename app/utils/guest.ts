// إشارة «الضيف حاول تنفيذ عملية» — يلتقطها GuestGate في _layout
type L = () => void;
let listener: L | null = null;
export function onGuestBlocked(l: L) { listener = l; return () => { if (listener === l) listener = null; }; }
export function guestBlocked() { listener?.(); }
