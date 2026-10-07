// وضع عرض لوحة مقدّم الخدمة:
// all: الشاشة الكاملة القديمة، requests: الطلبات الجديدة والعروض، bookings: المواعيد القادمة فقط
export type PanelMode = 'all' | 'requests' | 'bookings';
export type PanelProps = { mode?: PanelMode; embedded?: boolean };
