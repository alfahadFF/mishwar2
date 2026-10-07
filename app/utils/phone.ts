// قراءة رقم الهاتف: مع المفتاح الدولي أو بدونه، ومع الصفر أو بدونه، والبلد يُعرف من الرقم نفسه
// (نفس قواعد الدالة public._parse_phone في قاعدة البيانات)
export type Country = 'SY' | 'JO' | 'IQ' | 'LB';
export const COUNTRY_NAME: Record<Country, string> = { SY: 'سوريا', JO: 'الأردن', IQ: 'العراق', LB: 'لبنان' };
export const COUNTRY_FLAG: Record<Country, string> = { SY: '🇸🇾', JO: '🇯🇴', IQ: '🇮🇶', LB: '🇱🇧' };

const RULES: { code: string; country: Country; pat: RegExp }[] = [
  { code: '963', country: 'SY', pat: /^9\d{8}$/ },
  { code: '962', country: 'JO', pat: /^7[789]\d{7}$/ },
  { code: '964', country: 'IQ', pat: /^7[3-9]\d{8}$/ },
  { code: '961', country: 'LB', pat: /^(3\d{6}|7[01689]\d{6}|81\d{6})$/ },
];

// تحويل الأرقام العربية والفارسية إلى إنكليزية
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));

export function parsePhone(raw: string): { phone: string; country: Country } | null {
  let d = toLatinDigits(raw || '').replace(/[^\d+]/g, '');
  let intl = false;
  if (d.startsWith('+')) { d = d.slice(1); intl = true; }
  else if (d.startsWith('00')) { d = d.slice(2); intl = true; }
  if (!d || d.includes('+')) return null;
  for (const r of RULES) {
    if (d.startsWith(r.code)) {
      let n = d.slice(3);
      if (n.startsWith('0')) n = n.slice(1);
      if (r.pat.test(n)) return { phone: '+' + r.code + n, country: r.country };
    }
  }
  if (intl) return null;
  const n = d.startsWith('0') ? d.slice(1) : d;
  for (const r of RULES) if (r.pat.test(n)) return { phone: '+' + r.code + n, country: r.country };
  return null;
}

// الحساب الداخلي المرتبط بالرقم (لا يراه المستخدم)
export const phoneToAuthEmail = (e164: string) => e164.replace(/\D/g, '') + '@users.mishwar.app';

// كلمة المرور: 8 خانات على الأقل، أحرف وأرقام ورموز إنكليزية بدون مسافات
export const passwordOk = (p: string) => /^[\x21-\x7E]{8,}$/.test(p);
export const passwordHasNonLatin = (p: string) => /[^\x21-\x7E]/.test(p);
