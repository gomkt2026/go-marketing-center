/** 跟 Podcast 同一套：eleven_v3 對話合成，一句一句接，不走朗讀模型。 */
export const EDITOR_INTROS = {
  taskgo: {
    src: '/brands/intros/taskgo.mp3?v=2',
    color: '#E26A2C',
    name: '阿豪',
    line: '喔來！這個我內行！',
    turns: [
      { emotion: 'excited', text: '喔來！這個我內行！我是 TaskGo 的阿豪。' },
      { emotion: 'happy', text: '工地最亂的不是水泥，是照片、報價、進度各講各的。' },
      { emotion: 'confident', text: '報修、場勘、施工、請款，我拉回同一張工單。你先聽我講完這一陣。' },
    ],
  },
  homigo: {
    src: '/brands/intros/homigo.mp3?v=2',
    color: '#1fae78',
    name: '小咪',
    line: '這件事，實際管理的時候會怎麼發生？',
    turns: [
      { emotion: 'excited', text: '這件事，實際管理的時候會怎麼發生？我是 Homigo 的小咪。' },
      { emotion: 'happy', text: '房東半夜收到報修，房客找不到人，我最怕這種。' },
      { emotion: 'confident', text: '合約、租金、修繕，放回同一個地方。房子不用你自己追。' },
    ],
  },
  washgo: {
    src: '/brands/intros/washgo.mp3?v=2',
    color: '#3a8dde',
    name: '阿樂',
    line: '這件我們洗過，有故事！',
    turns: [
      { emotion: 'excited', text: '這件我們洗過，有故事！我是 Washgo 的阿樂。' },
      { emotion: 'happy', text: '換季棉被堆著，客人一直問洗好沒，我聽過太多次。' },
      { emotion: 'confident', text: '收件、洗護、送回，一條線看完。髒衣服交給我，你只管當個乾淨的人。' },
    ],
  },
  bbbox: {
    src: '/brands/intros/bbbox.mp3?v=2',
    color: '#5B949A',
    name: '小盒',
    line: '先進得去，再住下來。',
    turns: [
      { emotion: 'excited', text: '先進得去，再住下來。我是和居家居的小盒。' },
      { emotion: 'happy', text: '別人先問多少錢，我先問這條路車進不進得去，院子要不要多一間。' },
      { emotion: 'confident', text: '看過再約。臺中北屯環中路，電話 04-2355-0256，LINE @BBBOX。' },
    ],
  },
} as const;

export type EditorIntroSlug = keyof typeof EDITOR_INTROS;

export function editorIntroSlug(value: string | null | undefined): EditorIntroSlug | null {
  if (value === 'taskgo' || value === 'homigo' || value === 'washgo' || value === 'bbbox') return value;
  return null;
}
