import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { EventRecord } from '@/types';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ));
}

export function EventStandQr({ event }: { event: EventRecord }) {
  const origin = window.location.origin;
  const staffUrl = `${origin}/checkin/${event.id}?token=${encodeURIComponent(event.staffToken)}`;
  const guestUrl = `${origin}/e/${event.slug}/desk`;
  const [staffQr, setStaffQr] = useState('');
  const [guestQr, setGuestQr] = useState('');

  useEffect(() => {
    void QRCode.toDataURL(staffUrl, { width: 640, margin: 1 }).then(setStaffQr);
    void QRCode.toDataURL(guestUrl, { width: 640, margin: 1 }).then(setGuestQr);
  }, [staffUrl, guestUrl]);

  function printStands() {
    if (!staffQr || !guestQr) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    const title = escapeHtml(event.title);
    const when = event.eventDate
      ? escapeHtml(new Date(event.eventDate).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))
      : '';
    popup.document.write(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <title>${title} 立牌</title>
  <style>
    @page { size: A5 portrait; margin: 14mm; }
    body { margin: 0; font-family: "PingFang TC", "Noto Sans TC", sans-serif; color: #1B2B47; }
    .sheet { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
    .kicker { letter-spacing: 0.18em; font-size: 14px; font-weight: 700; }
    h1 { font-size: 36px; margin: 8px 0 4px; }
    p { margin: 0 0 16px; font-size: 16px; }
    img { width: 78mm; height: 78mm; }
    .hint { margin-top: 16px; font-size: 18px; font-weight: 800; }
    .meta { margin-top: 18px; font-size: 13px; color: #5C6570; }
  </style>
</head>
<body>
  <section class="sheet">
    <div class="kicker">FIXERCOWORK</div>
    <h1>工作人員</h1>
    <p>掃碼後打開相機，掃描報名者的 QR</p>
    <img src="${staffQr}" alt="工作人員報到 QR" />
    <div class="hint">請工作人員掃描</div>
    <div class="meta">${title}${when ? `<br>${when}` : ''}</div>
  </section>
  <section class="sheet">
    <div class="kicker">FIXERCOWORK</div>
    <h1>來賓報到</h1>
    <p>掃碼後輸入手機，確認姓名就完成報到</p>
    <img src="${guestQr}" alt="來賓報到 QR" />
    <div class="hint">請報到人員掃描</div>
    <div class="meta">${title}${when ? `<br>${when}` : ''}</div>
  </section>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <strong>桌上立牌 QR</strong>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            這一場的兩組 QR 固定不變，印一次放在桌上即可。下一場活動要另外印。
          </div>
        </div>
        <Button variant="primary" disabled={!staffQr || !guestQr} onClick={printStands}>列印立牌</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 12 }}>
        <StandPreview label="工作人員" caption="掃了直接進掃碼報到" src={staffQr} />
        <StandPreview label="報到人員" caption="掃了輸入手機就能報到" src={guestQr} />
      </div>
    </Card>
  );
}

function StandPreview({ label, caption, src }: { label: string; caption: string; src: string }) {
  return (
    <div style={{ textAlign: 'center', background: '#F7F8FA', borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 8px' }}>{caption}</div>
      {src ? <img src={src} alt="" style={{ width: 160, height: 160 }} /> : <div style={{ height: 160 }} />}
    </div>
  );
}
