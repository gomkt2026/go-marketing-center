import {
  budgetBlocks,
  decideOfficePublish,
  factProblem,
  isOfficeQuietHour,
  nameplates,
  officeInstruction,
  parseStandupPayload,
  standupApplies,
} from '../functions/_shared/office-facts.ts';

const signals = [
  { title: '漏水熱搜', summary: '連日降雨後工地在問怎麼報修', url: 'https://example.com/leak' },
  { title: '租金補貼', summary: '房東在問申請資格', url: 'https://example.com/rent' },
  { title: '換季送洗', summary: '羽絨衣送洗詢問變多', url: 'https://example.com/coat' },
];

const plan = parseStandupPayload({
  brands: [
    { slug: 'taskgo', theme: '雨後漏水怎麼報', doMore: ['現場判斷'], doLess: ['保證找到師傅'], signalIndexes: [0] },
    { slug: 'homigo', theme: '租金補貼先講資格', doMore: ['申請步驟'], doLess: ['保證通過'], signalIndexes: [1] },
    { slug: 'washgo', theme: '羽絨衣送洗', doMore: ['洗標'], doLess: ['保證不縮水'], signalIndexes: [2] },
  ],
  podcastTopic: '三個小編這週碰到的一件小事',
  imageBrief: '雨後工地',
  imageSlug: 'taskgo',
  lines: [{ who: '阿豪', text: '我在記漏水這題' }],
}, signals);

if (!plan) throw new Error('晨會 JSON 沒有解析出來');
if (plan.brands.length !== 3) throw new Error('三個品牌沒有到齊');

for (const brand of plan.brands) {
  const line = officeInstruction(plan, brand.slug);
  if (!line.includes(brand.theme)) throw new Error(`${brand.slug} 的下一則稿沒有帶主題`);
  if (decideOfficePublish(true, factProblem('今天收工前先看這則', [], brand.facts)) !== 'scheduled') {
    throw new Error(`${brand.slug} 通過檢查的稿沒有排進去`);
  }
}

if (decideOfficePublish(true, factProblem('我們被媒體報導了', [], [])) !== 'rejected') {
  throw new Error('沒有出處的媒體露出還是會發出');
}
if (factProblem('我們是全台第一', ['不可宣稱全台第一'], []) == null) {
  throw new Error('不可宣稱沒有擋下來');
}
if (!isOfficeQuietHour(new Date('2026-11-01T18:30:00Z'))) throw new Error('台灣凌晨兩點應該只留方向');
if (isOfficeQuietHour(new Date('2026-11-02T00:30:00Z'))) throw new Error('台灣早上八點應該可以發');
if (standupApplies(true, new Date('2026-11-01T18:30:00Z'))) throw new Error('凌晨不該把方向交進產稿');
if (!standupApplies(true, new Date('2026-11-02T00:30:00Z'))) throw new Error('早上八點應該交進產稿');
if (!budgetBlocks(40) || budgetBlocks(39.9)) throw new Error('月預算門檻不對');

const quietPlates = nameplates(plan, { quiet: true, autoPublish: true, videos: [], podcasts: [] });
const publisher = quietPlates.find((plate) => plate.key === 'publisher');
const video = quietPlates.find((plate) => plate.key === 'video');
if (publisher?.task !== '方向先記下，早上八點才發') throw new Error('發文小編凌晨名牌不對');
if (video?.status !== 'blocked' || !video.task.includes('在等素材')) throw new Error('沒有成片時影片小編不該假裝剪完');

const live = nameplates(plan, {
  quiet: false,
  autoPublish: true,
  videos: [{ title: '打卡出勤', status: 'ready' }],
  podcasts: [{ title: '還沒上的一集', status: 'script_draft' }],
});
if (live.find((plate) => plate.key === 'taskgo')?.task.includes('雨後漏水怎麼報') !== true) {
  throw new Error('阿豪名牌沒有寫到這一班的題');
}
if (!live.find((plate) => plate.key === 'video')?.task.includes('打卡出勤')) {
  throw new Error('影片小編沒有指出可推的成片');
}
if (!live.find((plate) => plate.key === 'podcast')?.task.includes('沒上架')) {
  throw new Error('Podcast 小編沒有提醒未上架');
}

console.log(JSON.stringify({
  ok: true,
  themes: plan.brands.map((brand) => ({ slug: brand.slug, theme: brand.theme, line: officeInstruction(plan, brand.slug) })),
  plates: live.map((plate) => ({ key: plate.key, status: plate.status, task: plate.task })),
}, null, 2));
