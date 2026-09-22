# Kling 專用｜後勁三部曲操作本

Kling 最穩的做法不是一次生 30 秒，而是：

1. 先出角色靜幀（鎖臉）
2. 每鏡先出「第一幀」
3. 用 **Image to Video** 讓那一幀動起來（5–6 秒）
4. 後製接在一起，再燒字幕

Prompt 格式照 Kling 吃得最順的結構：
**人物 + 動作 + 環境 + 鏡頭 + 光線 + 動作幅度 + 運鏡**

---

## 每次開 Kling，先設這組

| 欄位 | 設定 | 為什麼 |
|---|---|---|
| 模式 | Image to Video（主）／Text to Video 只用來出第一幀 | 臉比較不會漂 |
| 模型 | Kling 3.0 / Omni，Pro 1080p | 手、皮膚比較像人 |
| 比例 | **9:16** | Threads / Reels |
| 時長 | **5 秒或 6 秒** | 愈長愈 AI、愈容易手變形 |
| 創意／自由度 | 低 | 不要讓它自己加劇情 |
| 運動幅度 | **低 / Low** | 這三支要「幾乎沒在動」 |
| 運鏡 | 固定或極輕微手持 | 不要推軌、不要環繞 |
| 音訊 | **關** | Kling 音效常變配樂，後勁會死 |
| 字幕 | 關 | 用我們的 `.srt` 後製燒 |

負向提示（每鏡貼在 Prompt 最後）：

```
no AI look, no beauty filter, no plastic skin, no perfect face, no HDR, no cinematic teal orange, no studio lighting, no looking at camera, no talking, no smile to camera, no extra fingers, no morphing hands, no text, no subtitle, no logo, no luxury interior, no slow motion, no music video
```

---

## 第一步：先建 Elements / 角色庫

到 Kling 的 **Elements / 角色參考 / Character Lock**，各建一組。之後 Prompt 裡用 `@名稱` 呼叫。

### Homigo

**@H_GEGE** 靜幀 Prompt（Text to Image，9:16，生 4 張：正、側、全身、手）
```
Subject: Taiwanese boy about 11, lean, slightly tanned, messy short black hair, faded olive T-shirt, dark shorts, cheap plastic slippers, small scab on one knee, serious older-brother face, not cute idol.
Environment: 1990s Taipei walk-up apartment, terrazzo floor, green iron window, lived-in mess.
Lens: 35mm iPhone look, f/2.8, slight grain.
Lighting: late afternoon side light through dusty window, no studio light.
Motion: still photo.
Camera: documentary portrait, not looking at camera.
no beauty filter, no plastic skin, no luxury interior
```

**@H_DIDI**
```
Subject: Taiwanese boy about 6, rounder cheeks, uneven bowl haircut, oversized light gray T-shirt, one sock falling down, real kid proportions, not doll-like.
Environment: same Taipei apartment as the older brother.
Lens: 35mm iPhone look, slight grain.
Lighting: same late afternoon window light.
Motion: still photo.
Camera: candid, looking at the older brother, never at camera.
no beauty filter, no porcelain skin, no posed smile
```

### TaskGo

**@T_SHIFU**
```
Subject: Taiwanese craftsman about 52, salt-and-pepper hair, sun-worn skin, deep lines, faded navy polo, dusty work pants, cement-whitened sneakers, thick working fingers, tired calm eyes, not handsome actor.
Environment: gutted old bathroom renovation, half-removed tiles, dust.
Lens: 35mm documentary.
Lighting: cheap work lamp plus window dust light.
Motion: still photo.
Camera: not looking at camera.
no gym body, no beauty filter, no marble bathroom
```

**@T_TUDI**
```
Subject: Taiwanese young man about 21, thin, awkward, grown-out buzz cut, gray T-shirt with sweat marks, cheap cargo pants, trying to stand like a master.
Environment: same renovation bathroom.
Lens: 35mm documentary.
Lighting: dusty work light.
Motion: still photo.
Camera: looking at the wall, not camera.
no influencer, no K-pop, no clean fashion
```

### Washgo

重用 @H_GEGE / @H_DIDI 即可（同一對兄弟，換衣服）。再加一組手：

**@W_HANDS**
```
Subject: adult Taiwanese woman's hands only, short unpolished nails, folding a white cotton T-shirt.
Environment: wrinkled bed sheet in a small Taipei bedroom.
Lens: 50mm top-down.
Lighting: afternoon window.
Motion: still photo.
Camera: hands only, no face.
no manicure ad, no jewelry commercial
```

每組選 1 張最像「鄰居」的當主參考。每生 6–8 鏡，把最好的畫面再丟回 Elements，避免臉漂掉。

---

## 第二步：每鏡先出第一幀，再 Image to Video

Image to Video 的 Prompt **只寫動作與運鏡**，不要重寫整個人設。Kling 會跟第一幀走。

下面每格可直接複製。

---

# 01 Homigo

### H2 漏水｜5 秒｜Image to Video

```
Subject: @H_GEGE and @H_DIDI
Action: older boy crouches and nudges a cheap plastic basin one inch so a ceiling drip hits the center; little brother behind him copies the exact squat a half-beat late
Environment: Taipei apartment terrazzo floor, stained ceiling, standing fan
Lens: 35mm iPhone, low side angle
Lighting: dusty afternoon window, available light only
Motion: tiny, real, only the drip and one hand move
Camera: locked-off with tiny handheld drift, no push-in
Duration 5s. People never look at camera.
no AI look, no beauty filter, no plastic skin, no extra fingers, no text, no logo
```

### H3 嘆氣｜5 秒

```
Subject: @H_GEGE and @H_DIDI
Action: older boy wipes sweat with the back of his hand and sighs; half a second later the little brother copies the sigh a bit too big
Environment: same living room, oscillating fan
Lens: 35mm medium shot
Lighting: side window light
Motion: very small facial movement, blink, breathe
Camera: locked, tiny handheld
Duration 5s. documentary, not comedy.
no looking at camera, no exaggerated acting, no beauty filter
```

### H4 便條｜6 秒

```
Subject: hands of @H_GEGE and @H_DIDI only
Action: older hand writes clumsy Chinese on a yellow sticky note; child crayon hand writes crooked marks and presses the note beside it
Environment: low wooden table, dirty edge, afternoon light
Lens: 50mm top-down
Lighting: window side light
Motion: only fingers and pencil
Camera: locked top-down
Duration 6s. no readable brand text.
no extra fingers, no morphing hands, no subtitle
```

### H5 摺衣｜5 秒

```
Subject: hands of @H_GEGE and @H_DIDI
Action: older boy folds a faded T-shirt into an imperfect stack; little brother hugs the smallest shirt then tries to align corners and fails a little
Environment: sofa edge in old apartment
Lens: 50mm side close-up
Lighting: late side light
Motion: slow fabric fold only
Camera: locked
Duration 5s.
no looking at camera, no beauty hands, no extra fingers
```

### H6 外套｜後勁｜6 秒

```
Subject: @H_GEGE and @H_DIDI
Action: older boy puts his thin windbreaker over the little brother's shoulders and pats once, clumsy; little brother freezes then tugs the sleeve over his fingers
Environment: living room, fan wind dying down
Lens: 50mm close on shoulders and hands
Lighting: quieter, slightly dimmer afternoon
Motion: one put-on, one pat, one sleeve tug. Do not hug. Do not cry. Do not smile.
Camera: locked close-up
Duration 6s. this is the emotional turn, keep it small.
no looking at camera, no fake tears, no cinematic hug, no beauty filter
```

### H7 拖鞋｜5 秒

```
Subject: @H_DIDI in foreground, @H_GEGE standing far behind
Action: little boy places older brother's slippers left then right, slightly uneven; older boy watches and says nothing
Environment: apartment doorway, green iron door, messy shoes
Lens: 35mm locked from doorway
Lighting: leftover window light
Motion: two placement moves only
Camera: locked-off
Duration 5s.
no looking at camera, no smile, no text
```

### H8 空鏡｜5 秒

```
Subject: no faces
Action: almost still, dust in the light
Environment: same doorway, two pairs of cheap slippers side by side, one pair much smaller
Lens: 35mm
Lighting: late light
Motion: none except dust
Camera: locked hold
Duration 5s.
no people faces, no logo, no text
```

---

# 02 TaskGo

### T2 量門框｜6 秒

```
Subject: @T_SHIFU and @T_TUDI
Action: master pulls a worn yellow tape measure across a door frame and frowns slightly; apprentice behind him frowns the same way
Environment: gutted Taiwanese bathroom, half-removed tiles, dust
Lens: 35mm side angle on hands
Lighting: cheap work lamp, dusty air
Motion: tape pull, small frown
Camera: locked with tiny handheld
Duration 6s.
no looking at camera, no marble, no extra fingers
```

### T3 夾鉛筆｜5 秒

```
Subject: @T_SHIFU and @T_TUDI
Action: both tuck a carpenter pencil behind the ear; the young man's pencil slips, he almost smiles to himself, then puts it back
Environment: renovation bathroom
Lens: 50mm close on two ears
Lighting: dusty work light
Motion: tiny, observational humor, not a joke video
Camera: locked
Duration 5s.
no looking at camera, no beauty filter
```

### T4 畫線｜6 秒

```
Subject: @T_SHIFU hands, @T_TUDI squatting beside
Action: master draws a level pencil line; apprentice lips move slightly repeating the number
Environment: dusty gray wall
Lens: 50mm close on wall and knuckles
Lighting: work lamp
Motion: pencil grit only
Camera: locked
Duration 6s.
no extra fingers, no text overlay
```

### T5 畫歪｜5 秒

```
Subject: hands of @T_SHIFU and @T_TUDI
Action: apprentice line goes slightly crooked; master does not scold, rubs it away with his thumb and guides the young hand once
Environment: dusty wall
Lens: 50mm hands only
Lighting: work lamp
Motion: erase, then one guided stroke. Patience, not anger.
Camera: locked
Duration 5s.
no slapstick, no pointing at camera, no extra fingers
```

### T6 塞捲尺｜後勁｜6 秒

```
Subject: @T_SHIFU and @T_TUDI
Action: master slides his own worn tape measure into the apprentice canvas bag and pats the bag once, ordinary like passing rice
Environment: end-of-day dusty bathroom
Lens: 35mm waist height
Lighting: dimmer work light
Motion: one slide, one pat. No speech.
Camera: locked
Duration 6s.
no looking at camera, no handshake hero shot, no logo
```

### T7 一個人量｜5 秒

```
Subject: @T_TUDI alone
Action: he measures the door frame with the gifted tape, body already standing like the master
Environment: empty gutted bathroom, room echo feeling
Lens: 24mm locked wide
Lighting: leftover dusty light
Motion: one measure
Camera: locked wide
Duration 5s.
no looking at camera, no smile
```

### T8 空鏡｜4–5 秒

```
Subject: tape measure only
Action: hook rests on rough wall, tiny retract at the end
Environment: unfinished wall
Lens: 50mm extreme close-up
Lighting: work lamp
Motion: almost still
Camera: locked
Duration 5s.
no logo, no text, no people
```

---

# 03 Washgo

### W2 兩件白 T｜6 秒

```
Subject: no people
Action: two almost identical white cotton T-shirts hang and sway together in a small breeze, hangers tap once
Environment: small Taipei balcony, metal rack, neighbor window
Lens: 35mm
Lighting: afternoon sun
Motion: only wind and fabric
Camera: locked
Duration 6s.
no catalog clothes, no luxury balcony, no text
```

### W3 弟弟套上｜5 秒

```
Subject: @H_DIDI wearing @H_GEGE 's washed oversized white T-shirt
Action: he pulls the shirt on, sleeves cover his fingers, turns once toward someone off-camera, never toward lens
Environment: bedroom
Lens: 35mm slightly low
Lighting: afternoon
Motion: clumsy real child
Camera: locked
Duration 5s.
no looking at camera, no posed smile, no beauty filter
```

### W4 學摺衣｜6 秒

```
Subject: @W_HANDS and @H_DIDI hands
Action: adult hands smooth a collar and fold; child hands try the same fold and fail, edges crooked
Environment: wrinkled bed
Lens: 50mm top-down
Lighting: afternoon window
Motion: fold only
Camera: locked top-down
Duration 6s.
no manicure ad, no extra fingers
```

### W5 皺眉再塞好｜後勁｜6 秒

```
Subject: @H_GEGE and @H_DIDI
Action: older boy sees little brother in his shirt, first a small frown, then tucks the hem in carefully, no lecture
Environment: bedroom doorway to bed
Lens: 35mm over-shoulder
Lighting: late sun
Motion: frown, two steps, tuck hem. Do not hug. Do not smile at camera.
Camera: locked
Duration 6s. this is the emotional beat, keep it small.
no fake tears, no cinematic hug, no looking at camera
```

### W6 床沿｜5 秒

```
Subject: @H_GEGE and @H_DIDI sitting on bed edge
Action: almost no action, same white T-shirt collar one big one small, a few blinks
Environment: small bedroom, late sun
Lens: 35mm locked
Lighting: sunset side light, muted
Motion: breathing only
Camera: locked hold
Duration 5s.
no talking, no looking at camera, no beauty filter
```

### W7 櫃格｜5 秒

```
Subject: folded clothes only
Action: almost still
Environment: wooden wardrobe grid, clothes stacked back into one place
Lens: 50mm tiny slow push 10cm only
Lighting: indoor afternoon
Motion: minimal
Camera: very slow push, then hold
Duration 5s.
no faces, no logo
```

### W8 布料｜5 秒

```
Subject: washed white cotton only
Action: almost still, one loose thread
Environment: close fabric weave
Lens: 85mm extreme close-up
Lighting: late light
Motion: none
Camera: locked
Duration 5s.
no text, no logo
```

---

## 選片與後製（Kling 最容易翻車的地方）

每鏡生 3 條，留下同時符合這三點的：

1. 手指數正常、手不融化  
2. 兩個人從頭到尾還是同一張臉  
3. 動作比你預想的**更小**

丟掉：對鏡頭笑、擁抱、慢動作、皮膚像磨皮、浴室突然變成大理石。

後製順序：
1. 直切，不要溶解  
2. 關 Kling 音軌  
3. 加現場聲：滴水、電扇、捲尺、衣架  
4. 燒對應 `.srt`  
5. 片頭標題卡自己做（不要讓 Kling 生字）  
6. 最後 1 秒才放極小品牌名  

建議開工順序：先只做 **Homigo H6（外套）**。這鏡過了，整支片子的味道就對了，再回頭補前面的笑點鏡。
