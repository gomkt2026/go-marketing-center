const HEX_CHARS = '0123456789abcdef';

export function generateToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) {
    out += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0x0f];
  }
  return out;
}

const TW_MOBILE_RE = /^09\d{8}$/;

export function normalizePhone(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export function isValidTaiwanMobile(phone: string): boolean {
  return TW_MOBILE_RE.test(normalizePhone(phone));
}
