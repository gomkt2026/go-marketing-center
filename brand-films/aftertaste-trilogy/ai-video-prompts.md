# 後勁三部曲｜AI 影片引擎 Prompt

給 Kling / Runway / Luma / Hailuo / Sora 用。
目標：像家人用舊手機隨手拍到的真事，不要像廣告、不要像 AI。

引擎設定（三支共用）
- 比例：9:16
- 每鏡：5–8 秒（不要一次生 30 秒）
- 模式：image-to-video 比 text-to-video 穩；先鎖角色圖，再跑動作
- 運動：Low / Subtle。Camera movement: locked-off or tiny handheld drift
- 標題卡、字幕、Logo：全部後製燒，不要讓模型生字

---

## 0. 總風格（每鏡都貼在最前面）

### 正向（English，引擎較穩）

```
Handheld observational documentary, shot on a slightly worn iPhone 13 in a Taiwanese home,
vertical 9:16, natural available light only, late-afternoon side light through dusty window,
muted film tones, slight grain, imperfect autofocus, real skin texture, visible pores,
small sweat, unstyled hair, everyday clothes from night market or Uniqlo, no makeup,
people never look at camera, quiet real life, tiny natural movements, breathing, blinking,
documentary stillness, intimate and tender, like a memory someone actually lived.
```

### 正向（中文備註，給會吃中文的引擎）

```
台灣家庭紀實，直式 9:16，舊一點的 iPhone 手持，只有午後窗邊自然光，
灰塵裡的側光，輕微顆粒，對焦偶爾慢半拍。真實皮膚、毛孔、薄汗、頭髮不服貼。
夜市或 UNIQLO 日常衣服，沒化妝。人物從來不看鏡頭。動作很小，像真的住在裡面。
安靜、親密、有後勁，不要廣告，不要電影預告片。
```

### 負向（每鏡都加）

```
AI look, CGI, 3D render, anime, cartoon, illustration, beauty filter, plastic skin,
porcelain skin, airbrushed face, perfect symmetry, glowing skin, HDR, oversaturated,
cinematic teal and orange, dramatic rim light, studio lighting, Hollywood grading,
slow-motion hero shot, music video, commercial, stock footage, smiling at camera,
looking at camera, talking to camera, extra fingers, warped hands, morphing faces,
text, subtitles, captions, logo, watermark, brand name, UI, smartphone screen,
luxury interior, marble, perfect renovation, Western suburban house, fake tears,
exaggerated acting, comedy sound effects, lens flare spam, bokeh overload
```

角色不要「網美小孩／明星師傅」。寧可土一點、疲倦一點、像鄰居。

---

## 1. Homigo｜不是長得像

### 角色鎖定（先生靜幀，三支片子各自重用）

**哥哥 Character lock**
```
Taiwanese boy, about 11, lean, slightly tanned, short slightly messy black hair,
plain faded olive T-shirt, dark shorts, cheap plastic slippers, a small scab on one knee,
serious older-brother face, not cute-idol, not smiling, real child proportions,
shot in a 1990s Taiwanese apartment with terrazzo floor and green iron window grille.
```

**弟弟 Character lock**
```
Taiwanese boy, about 6, rounder cheeks, same family look but not identical twins,
bowl-ish haircut a bit uneven, oversized light gray T-shirt, one sock falling down,
curious, copies the older boy without looking at camera, real kid, not doll-like.
```

**空間鎖定**
```
Old Taipei walk-up apartment living room, terrazzo floor, beige peeling wall,
green iron window, dusty ceiling, a cheap plastic basin, a standing fan,
laundry basket, no luxury, no interior design, lived-in mess that feels loved.
```

### 逐鏡 Prompt

**鏡 2｜漏水（5s）**
```
{總風格} {角色鎖定} {空間鎖定}
Low side angle. A plastic basin on terrazzo floor catching a slow drip from a stained ceiling.
The 11-year-old crouches and nudges the basin one inch so the drip hits the center.
The 6-year-old behind him crouches in the exact same posture, a half-beat late.
Only the drip moves. No dialogue. No one looks at camera.
```

**鏡 3｜嘆氣（5s）**
```
{總風格} Medium shot, two brothers. The older boy wipes sweat with the back of his hand and sighs,
tired, not dramatic. Half a second later the little brother copies the sigh, a bit too big.
A standing fan oscillates once. Handheld micro-shake. Documentary, not comedy.
```

**鏡 4｜便條（6s）**
```
{總風格} Top-down on a low wooden table. Older boy's hand writes clumsy Chinese on a yellow sticky note.
Little brother's crayon hand writes crooked marks on another note and presses it beside the first.
Real paper texture, real child handwriting, slightly dirty table, afternoon window light.
No readable brand text. Hands only plus the notes.
```

**鏡 5｜摺衣（5s）**
```
{總風格} Side-light close-up of hands. Older boy folds a faded T-shirt into an imperfect stack.
Little brother hugs the smallest shirt to his chest, then tries to align the corners, failing a little.
Cotton fabric sound implied by movement. Tender, ordinary, no smiles to camera.
```

**鏡 6｜外套｜後勁（6s）**
```
{總風格} Close on shoulders and hands. Older boy puts his thin windbreaker over the little brother's shoulders
and pats once, clumsy, not cinematic. Little brother freezes, then tugs the sleeve longer over his fingers.
No eye contact with camera. Quiet. This is the emotional turn. Do not make them cry. Do not smile.
```

**鏡 7｜拖鞋（5s）**
```
{總風格} Locked-off shot from the apartment doorway. Little brother places the older boy's slippers
left then right, slightly uneven. Older boy stands in the background, watching, saying nothing.
Two soft placement sounds. Green iron door, shoes piled messily to the side. Real home.
```

**鏡 8｜空鏡（4s）**
```
{總風格} Same doorway, no faces. Two pairs of cheap slippers side by side, one pair much smaller.
Dust in the late light. Almost still. Hold. Fade feeling, not a fancy transition.
```

---

## 2. TaskGo｜手勢會長得像

### 角色鎖定

**老師傅**
```
Taiwanese craftsman about 52, short salt-and-pepper hair, sun-worn skin, deep nasolabial lines,
cheap navy polo faded at the collar, dusty navy work pants, old sneakers whitened by cement,
thick fingers, a pencil habit, calm tired eyes, not handsome actor, not gym body,
a man who has been on sites for 20 years.
```

**學徒**
```
Taiwanese young man about 21, thin, slightly awkward, buzz cut growing out,
gray T-shirt with sweat marks, cheap cargo pants, trying to stand like the older man,
real youth, not K-pop, not influencer.
```

**空間鎖定**
```
Gutted old Taiwanese bathroom under renovation, half-removed tiles, exposed gray wall,
level, tape measure, canvas tool bag, dust in the air, cheap work lamp, no luxury finish,
no marble, no Instagram renovation.
```

### 逐鏡 Prompt

**鏡 2｜量門框（6s）**
```
{總風格} {角色鎖定} {空間鎖定}
Side angle following hands. Master pulls a worn yellow tape measure across a door frame and frowns slightly.
Apprentice behind him frowns the same way, copying. Metal tape click. Dust motes. No talking.
```

**鏡 3｜夾鉛筆（5s）**
```
{總風格} Close on two ears. Both men tuck a short carpenter pencil behind the ear at the same time.
The young man's pencil slips; he almost smiles to himself, then puts it back correctly.
Observational, tiny humor, not a joke video.
```

**鏡 4｜畫線（6s）**
```
{總風格} Close on a dusty wall. Master's thick hand draws a level pencil line.
Apprentice squats beside him, lips moving slightly as he repeats the number, not looking at camera.
Pencil grit sound. Real dust on knuckles.
```

**鏡 5｜畫歪｜後勁前段（5s）**
```
{總風格} Hands only. The apprentice's line goes slightly crooked. Master does not scold.
He quietly rubs the bad line away with his thumb and guides the young hand once.
Patience, not anger. No slapstick. No pointing at camera.
```

**鏡 6｜塞捲尺（6s）**
```
{總風格} Waist-height shot. End of day. Master slides his own worn tape measure into the apprentice's canvas bag
and pats the bag once. The gesture is ordinary, like passing rice. Dusty light. No speech.
```

**鏡 7｜一個人量（5s）**
```
{總風格} Locked wide shot of the empty bathroom. Apprentice alone measures the door frame
with the gifted tape, body already standing like the master. Room echo. Lonely but warm.
```

**鏡 8｜空鏡（4s）**
```
{總風格} Extreme close-up of the tape measure hook resting on a rough wall, then a tiny retract.
Hold. Cut to black feeling. No logo in frame.
```

---

## 3. Washgo｜衣服會記住

### 角色鎖定

**哥哥**
```
Taiwanese boy about 12, lanky, home after going out, slightly sweaty neck,
plain white cotton T-shirt later taken off, dark shorts, real kid, not model.
```

**弟弟**
```
Taiwanese boy about 6, wearing the older brother's just-washed oversized white T-shirt,
sleeves covering part of the hands, hair flattened from play, soft, not posed.
```

**摺衣的人（媽媽或姐姐，只出手）**
```
Adult Taiwanese woman's hands only, no face needed, short unpolished nails,
folding laundry on a bed, everyday, not manicure commercial.
```

**空間鎖定**
```
Small Taiwanese apartment balcony and bedroom, metal drying rack, plastic hangers,
afternoon sun, neighbor's window visible, wrinkled sheets, wooden wardrobe with open grid,
not a showroom.
```

### 逐鏡 Prompt

**鏡 2｜兩件白 T（6s）**
```
{總風格} {空間鎖定}
Balcony, two almost identical white cotton T-shirts hanging, breeze moving them in sync.
Cheap hangers tap once. Real laundry, slightly uneven hems, not catalog clothes.
No people in this shot.
```

**鏡 3｜弟弟套上（5s）**
```
{總風格} Slightly low angle. Little boy pulls the oversized washed white T-shirt on,
sleeves cover his fingers, he turns once toward someone off-camera, not toward lens.
Fabric rustle. Soft pride. Real child movement, a bit clumsy.
```

**鏡 4｜學摺衣（6s）**
```
{總風格} Top-down. Adult hands smooth a collar and fold a shirt into a slightly imperfect rectangle.
Child hands beside them try the same fold and fail, edges crooked. Tender, ordinary.
```

**鏡 5｜皺眉再塞好｜後勁（6s）**
```
{總風格} Over-shoulder. Older boy comes home, sees the little brother in his shirt, first a small frown,
then he steps in and tucks the hem in, careful, no lecture, no smile to camera.
This is the emotional beat. Keep it small. Do not make him hug. The hands are enough.
```

**鏡 6｜床沿（5s）**
```
{總風格} Locked shot, two brothers sit on the bed edge, same white T-shirt collar, one big one small,
late sun. They do not talk. A few blinks. Hold the quiet.
```

**鏡 7｜櫃格（4s）**
```
{總風格} Slow tiny push toward folded clothes in a wooden wardrobe grid, stacked back into one place.
Still life. Lived-in. No faces.
```

**鏡 8｜布料（4s）**
```
{總風格} Extreme close-up of washed cotton, loose thread, real weave, late light.
Almost still. Soft fade.
```

---

## 組裝（後製，不要交給影片模型）

1. 每鏡生 3 條，選動作最小、手不變形、臉不融化的那條
2. 片頭標題卡用後製（思源黑體），不要 AI 生字
3. 字幕燒已寫好的 SRT，不要模型內建字幕
4. 音效用真實現場：滴水、電扇、捲尺、衣架；不要配樂到第 26 秒
5. 最後 1 秒才放極小品牌字
6. 色調：略降飽和、加一點顆粒，三支不要做成三個不同濾鏡

若引擎支援「Reference / Character / Elements」，先上傳角色靜幀再跑，比純文字穩很多。
