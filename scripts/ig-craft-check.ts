/**
 * TaskGo / Washgo 的 IG 觸及檢查。不呼叫模型、不發文、不登入 Instagram。
 * 跑：node --experimental-strip-types scripts/ig-craft-check.ts
 */
import {
  igReachBrief,
  prepareInstagramCopy,
  rankSwipe,
  reviewIgComment,
} from '../functions/_shared/ig-craft.ts';

const TASKGO_QUERIES = ['派工系統', '工班管理', '工程行', '現場回報', '工地打卡'];
const WASHGO_QUERIES = ['洗衣店系統', '送洗履歷', '門市調撥', '洗衣店數位轉型'];
const CTA = '想來信詢問：Service@inforcraft.com.tw，或來電 0972-395-117';

const taskgoGood = `白板排到一半，下午的案子被雨打掉。

LINE 還在翻昨天誰有空。派工還寫在白板上的時候，洞會先出現在現場，不是報表。

${CTA}`;

const taskgoBad = `大家好，在這個快節奏的時代，數位轉型正在賦能工程行。停止滑動，追蹤看更多。

這不是一個工具，而是一種生活態度。歡迎留言才告訴你怎麼做。

#viral #fyp #做工的人`;

const washgoGood = `手寫單對到第三張，衣服洗到哪沒人答得出來。

櫃檯在找的是那一張單。送洗履歷如果還散在紙上，調撥就會對不攏。

${CTA}`;

const washgoBad = `隨著科技的發展，值得注意的是洗衣店正邁向數位化的未來就是現在。告別繁瑣，輕鬆數位化！

歡迎追蹤看更多，標記需要這則的人。你們覺得呢？`;

const fillerTags = ['viral', 'fyp', '爆款', '必看', '分享', '生活', '日常', '做工的人', '派工系統', '工班管理', '工程行', '現場回報'];

function show(label: string, slug: 'taskgo' | 'washgo', body: string, tags: string[], queries: string[]) {
  const prepared = prepareInstagramCopy({ body, hashtags: tags, topic: label, searchQueries: queries, slug });
  console.log(`\n== ${label} ==`);
  console.log(prepared.body);
  console.log('hashtags:', prepared.hashtags.join(' '));
  console.log(`hook ${prepared.receipt.hookScore} ${prepared.receipt.hookLabel} / human ${prepared.receipt.humanScore} ${prepared.receipt.humanVerdict} / caption ${prepared.receipt.captionVerdict}`);
  console.log(prepared.receipt.rewriteReason ? `要改：${prepared.receipt.rewriteReason}` : '不必再改');
  console.log(`留言型：${prepared.receipt.commentTypes.map((item) => item.name).join('、')}`);
  return prepared;
}

const failures: string[] = [];
function expect(cond: boolean, message: string) {
  if (!cond) failures.push(message);
}

const tgGood = show('TaskGo 現場收據', 'taskgo', taskgoGood, ['派工系統', '工班管理', '工程行'], TASKGO_QUERIES);
const tgBad = show('TaskGo 機器腔', 'taskgo', taskgoBad, fillerTags, TASKGO_QUERIES);
const wgGood = show('Washgo 手寫單', 'washgo', washgoGood, ['洗衣店系統', '送洗履歷', '門市調撥'], WASHGO_QUERIES);
const wgBad = show('Washgo 機器腔', 'washgo', washgoBad, fillerTags, WASHGO_QUERIES);

expect(tgGood.receipt.rewriteReason == null, 'TaskGo 好文案不該被打回');
expect(tgGood.receipt.hookLabel !== 'WEAK', 'TaskGo 好文案鉤子不該是 WEAK');
expect(tgGood.receipt.captionVerdict !== 'FIX', 'TaskGo 好文案不該是 FIX');
expect(wgGood.receipt.rewriteReason == null, 'Washgo 好文案不該被打回');
expect(wgGood.receipt.captionVerdict !== 'FIX', 'Washgo 好文案不該是 FIX');
expect(!!tgBad.receipt.rewriteReason, 'TaskGo 機器腔要被打回');
expect(!!wgBad.receipt.rewriteReason, 'Washgo 機器腔要被打回');
expect(tgBad.hashtags.length <= 5 && !tgBad.hashtags.some((tag) => /viral|fyp|爆款|日常/.test(tag)), '空 hashtag 要刪掉，而且最多 5 個');
expect(!tgBad.body.includes('停止滑動') && !tgBad.body.includes('賦能'), '套話要先清掉');
expect(!wgBad.body.includes('值得注意的是'), 'Washgo 套話要先清掉');

const comments = [
  ['TaskGo 收據', '上週兩組人同一天請假，白板直接空白。後來改看誰有回現場。'],
  ['TaskGo 推銷', '好棒！太真實了🔥 私訊我看 TaskGo'],
  ['Washgo 補情況', '這在單店成立。一到三間店互相調衣服，手寫單會先對不攏。'],
  ['Washgo 空泛', '說得太好了，完全同意。'],
];
console.log('\n== 留言（不代發） ==');
for (const [name, text] of comments) {
  const review = reviewIgComment(text);
  console.log(`${review.ok ? '可貼' : '不要貼'} ${name}：${review.reasons.join('；') || review.cleaned}`);
}
expect(reviewIgComment(comments[0][1]).ok, 'TaskGo 收據留言要過');
expect(!reviewIgComment(comments[1][1]).ok, '推銷留言要擋');
expect(reviewIgComment(comments[2][1]).ok, 'Washgo 補情況要過');
expect(!reviewIgComment(comments[3][1]).ok, '空泛留言要擋');

const swipe = rankSwipe([
  { account: '@大帳號', followers: 2_000_000, median: 400_000, views: 400_000, hook: '大家好，今天來聊工班管理' },
  { account: '@小帳號', followers: 4_000, median: 11_000, views: 412_000, hook: '沒人跟你講白板排到一半會被雨打掉' },
  { account: '@沒有中位數', followers: 50_000, views: 90_000, hook: '下午兩點的案子被雨打掉' },
]);
console.log('\n== 倍數排序（示範數字，不是去 IG 抓的） ==');
for (const row of swipe) {
  console.log(`${row.account} ${row.multiple ?? '-'}x ${row.signal} hook ${row.hookScore} ${row.hookLabel}｜${row.hook}`);
}
expect(swipe[0]?.account === '@小帳號' && swipe[0].signal === 'outlier', '小帳號 37 倍要排在大帳號前面');
expect(swipe.find((row) => row.account === '@大帳號')?.signal === 'quiet', '大帳號 1 倍是平常的一天');
expect(swipe.find((row) => row.account === '@沒有中位數')?.signal === 'unknown', '沒有中位數不能當成爆文');

console.log('\n== 這篇會被要求的鉤子 ==');
console.log(igReachBrief({ topic: '白板被雨打掉', searchQueries: TASKGO_QUERIES }).split('\n')[0]);
console.log(igReachBrief({ topic: '手寫單對不攏', searchQueries: WASHGO_QUERIES }).split('\n')[0]);

if (failures.length) {
  console.error('\n沒過：');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('\nTaskGo / Washgo 檢查通過');
