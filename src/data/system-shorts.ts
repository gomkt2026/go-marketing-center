/**
 * TaskGo、Washgo 系統短影片。清單由 tools/go-shorts/publish.py 產生（system-shorts.json），
 * 簡報專區播放、品牌素材庫發文都讀這份。
 * 畫面是客戶真實帳號，個資已馬賽克；件數、金額、會員數不可寫成業績。
 */
import type { Locale } from '@/pages/public/copy';
import raw from './system-shorts.json';

export type SystemShortBrand = 'taskgo' | 'washgo';

export interface SystemShortStill {
  id: string;
  file: string;
  tag: string;
  label: string;
  caption: string;
}

export interface SystemShort {
  id: string;
  brand: SystemShortBrand;
  episode: string;
  feature: string;
  title: string;
  tagline: string;
  duration: number;
  durationLabel: string;
  video: string;
  poster: string;
  role: string;
  pain: string[];
  chips: string[];
  summary: string;
  ytTitle: string;
  ig: string;
  threads: string;
  stills: SystemShortStill[];
}

export const SYSTEM_SHORTS = raw as SystemShort[];

export const SYSTEM_SHORT_BRANDS: SystemShortBrand[] = ['taskgo', 'washgo'];

type ShortText = { title: string; summary: string; cue: string };

const EN: Record<string, ShortText> = {
  'taskgo:clock-in': {
    title: 'TaskGo site attendance',
    summary: 'Project lights flag late jobs, the daily report collects tasks, photos and check-ins, and a check-in too far from the site raises a warning. Reports export to Excel and PDF.',
    cue: 'Know who is on site',
  },
  'taskgo:finance-cost': {
    title: 'TaskGo project finance',
    summary: 'Contract totals, money received and still owed, and total cost on one screen. Overdue payments are listed, over-budget projects stand out, and vendor fees go into cost.',
    cue: 'See which job makes money',
  },
  'taskgo:dispatch-calendar': {
    title: 'TaskGo dispatch calendar',
    summary: 'Switch between month, week and day. Add a dispatch with project and time, read status by color, and crews get the job on LINE.',
    cue: 'Schedule crews without group chats',
  },
  'taskgo:field-report-review': {
    title: 'TaskGo work report review',
    summary: 'Photos for every task are packed for review. The crew submits, the WM reviews, the PM confirms, and AI can cross-check the photos.',
    cue: 'Every finished job has photos',
  },
  'taskgo:repair-management': {
    title: 'TaskGo repair requests',
    summary: 'Repairs come in from a public link, a LINE group bot, or a phone call. Each request shows its stage and billing to-dos, from dispatch to invoice.',
    cue: 'No repair call gets lost',
  },
  'taskgo:owner-cockpit': {
    title: 'TaskGo owner cockpit',
    summary: 'Project health, delivery, crew load and quality risk on one page, plus contract value, receivables, actual cost and expected margin.',
    cue: 'The whole company on one page',
  },
  'washgo:intake-quote-sign': {
    title: 'Washgo intake, quote and signature',
    summary: 'Five guided intake steps at the counter. Unpack and check each item, quote it with surcharges, and wash only after the customer signs.',
    cue: 'Agree on the price before washing',
  },
  'washgo:driver-tasks': {
    title: 'Washgo pickup and delivery',
    summary: 'From order to delivery fee to a LINE message for the driver. Pickups, returns and the delivery schedule are kept apart, and the schedule syncs to Google Calendar.',
    cue: 'Drivers know where to go',
  },
  'washgo:order-tracking': {
    title: 'Washgo order status',
    summary: 'Search by name, phone, order number or item. A progress bar and a tracking link the customer can open, with prices and check photos on the same page.',
    cue: 'Answer "is it ready?" in seconds',
  },
  'washgo:qc-rewash': {
    title: 'Washgo quality check and rewash',
    summary: 'Check each item against its intake photo, pass it or send it back to rewash, and tell the customer about stains. A sticker code finds the item fast.',
    cue: 'Every item passes before it leaves',
  },
  'washgo:points-topup': {
    title: 'Washgo prepaid points',
    summary: 'Top-up plans add bonus points by themselves. Customers top up on LINE, the counter can add points by phone, QR or name, and one report shows every payment type.',
    cue: 'Balances nobody argues about',
  },
  'washgo:ops-center-shift': {
    title: 'Washgo operations center',
    summary: 'Open the shop and see every order by status. The home page counts what is waiting, and the operations center flags stuck orders.',
    cue: 'Know what to do when you open',
  },
};

const JA: Record<string, ShortText> = {
  'taskgo:clock-in': {
    title: 'TaskGo 現場の出勤',
    summary: '案件ランプが遅れを知らせ、日報にタスク・写真・打刻がまとまります。現場から遠い打刻は警告。Excel と PDF で出力できます。',
    cue: '誰が現場にいるか分かる',
  },
  'taskgo:finance-cost': {
    title: 'TaskGo 案件の収支',
    summary: '契約額、入金済み・未入金、総コストを一画面で。期限切れの入金と予算超過の案件が分かり、外注費はコストに入ります。',
    cue: 'どの案件が儲かっているか',
  },
  'taskgo:dispatch-calendar': {
    title: 'TaskGo 手配カレンダー',
    summary: '月・週・日を切り替え、案件と時間を指定して手配。状態は色で分かり、職人には LINE で届きます。',
    cue: 'グループチャットなしで手配',
  },
  'taskgo:field-report-review': {
    title: 'TaskGo 施工報告の審査',
    summary: 'タスクごとの写真を審査用にまとめます。職人の提出、WM の審査、PM の確認の三段階で、AI の照合もできます。',
    cue: '完了した仕事に写真が残る',
  },
  'taskgo:repair-management': {
    title: 'TaskGo 修理受付',
    summary: '公開リンク、LINE グループのボット、電話から修理を受け付け。各案件の段階と請求の残りが、手配から請求まで見えます。',
    cue: '修理の電話を取りこぼさない',
  },
  'taskgo:owner-cockpit': {
    title: 'TaskGo 経営コックピット',
    summary: '案件の健全度、納期、人手の負荷、品質リスクを一ページに。契約額、売掛金、実コスト、見込み粗利も見られます。',
    cue: '会社全体を一ページで',
  },
  'washgo:intake-quote-sign': {
    title: 'Washgo 受付・見積・署名',
    summary: 'カウンターの受付を五つの手順で案内。一点ずつ確認して加算込みで見積もり、お客様の署名後に洗います。',
    cue: '洗う前に料金を合意',
  },
  'washgo:driver-tasks': {
    title: 'Washgo 集配の手配',
    summary: '注文から送料、ドライバーへの LINE 通知まで一続き。集荷・返却・配送予定を分けて管理し、Google カレンダーにも同期できます。',
    cue: 'ドライバーが行き先に迷わない',
  },
  'washgo:order-tracking': {
    title: 'Washgo 注文の進み具合',
    summary: '名前、電話、注文番号、品名で検索。進捗バーとお客様用の追跡リンク、金額と確認写真が同じ画面にあります。',
    cue: '「できた？」にすぐ答える',
  },
  'washgo:qc-rewash': {
    title: 'Washgo 検品と再洗い',
    summary: '受付時の写真と見比べて一点ずつ検品し、合格か再洗いかを選び、シミはお客様に伝えます。シールの番号ですぐ探せます。',
    cue: '全品検品してから返す',
  },
  'washgo:points-topup': {
    title: 'Washgo ポイントチャージ',
    summary: 'チャージプランのボーナスは自動計算。お客様は LINE でチャージ、カウンターは電話・QR・名前で追加でき、支払い方法ごとに一枚の報告で確認できます。',
    cue: '残高でもめない',
  },
  'washgo:ops-center-shift': {
    title: 'Washgo 運営センター',
    summary: '開店したら状態別の注文がすぐ見えます。ホームに待ち件数、運営センターが止まった注文を知らせます。',
    cue: '開店してすぐやることが分かる',
  },
};

function durationText(seconds: number, locale: Locale): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (locale === 'en') return m ? `${m} min ${s} s` : `${s} s`;
  if (locale === 'ja') return m ? `${m}分${s}秒` : `${s}秒`;
  return m ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

export function systemShortSlug(short: Pick<SystemShort, 'brand' | 'id'>): string {
  return `${short.brand}-${short.id}`;
}

export function systemShortText(short: SystemShort, locale: Locale): ShortText & { duration: string } {
  const key = `${short.brand}:${short.id}`;
  const local = locale === 'en' ? EN[key] : locale === 'ja' ? JA[key] : undefined;
  return {
    title: local?.title ?? short.title,
    summary: local?.summary ?? short.summary,
    cue: local?.cue ?? short.tagline,
    duration: durationText(short.duration, locale),
  };
}
