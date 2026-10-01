# Translating 匠城出任務 (a mobile 3D browser mini-game)

## The game
A 90-second (to 180-second) arcade game made by INFORCRAFT (匠管), a Taiwanese company. You ride a scooter around a cartoon city as a field technician ("師傅") and complete jobs that arrive via LINE for three real brands:
- **TaskGo** – repair/maintenance work orders (check in, do the work, take photos, close the job)
- **Homigo** – rental property management (deliver keys to new tenants)
- **Washgo** – laundry pickup & delivery (collect bags, bring them to the laundry hub)

Players earn NT$ revenue per shift, coins (匠幣) to unlock scooters/outfits, achievements, map unlocks (Small/Medium/Large + a hidden Taiwan-shaped map with real landmarks). Random weather (sun/rain/wind/snow) and random funny events (stray dogs chase you, police checkpoint, forgot your tools, battery/fuel runs out, garbage truck playing Für Elise with neighbors chasing it, bubble tea speed boost). "Today's funny moments" are auto-captured screenshots with jokey captions players share on social media.

Audience: players in Japan, Vietnam, Indonesia and English speakers — including Vietnamese and Indonesian workers living in Taiwan. Tone: playful, short, punchy, like a casual mobile game. Keep the jokes funny in the target language rather than literal.

## Files
- `keys.json` — every Chinese UI string: `k` (the key = exact Chinese source), `line` (line in /home/claude/game/index.html — read nearby code if the meaning is unclear), `hint` (for templates: what each `{n}` placeholder holds).
- Write your output to `<lang>.json`: ONE flat JSON object `{ "<exact Chinese key>": "<translation>", ... }` covering EVERY key in keys.json, keys copied byte-for-byte.
- Validate with `node validate.js <lang>` (run from this folder) and fix every problem until it prints OK.

## Hard rules
1. Keep every placeholder `{0}`, `{1}`… exactly (you may reorder them to fit grammar).
2. Keep every HTML tag (`<b>`, `</b>`, `<br>`, `<span …>`…) exactly as written and **in the same order**; translate the text around/inside them.
3. Keep emoji, numbers, `NT$`, `×`, `→`, `①②③`, `\n`, URLs and file extensions.
4. Brand names never translated: TaskGo, Homigo, Washgo, LINE, Threads, Facebook, Instagram/IG, GPS, App, INFORCRAFT.
5. **Short.** Most strings sit in small buttons, chips and HUD labels on a phone. Prefer the shortest natural wording; single words for button labels where possible.
6. Strings that are only a sign/label in the 3D world (shop signs, house nameplates, road paint, street names) should also be short — they are painted on small signs.
7. Do not add information that isn't in the source. Real-world facts (service status, prices, "14-day free trial", "no credit card") must keep their exact meaning.
8. en/vi/id output must contain no Chinese characters. Japanese may use kanji naturally.

## Glossary (use consistently)
| 中文 | en | ja | vi | id |
|---|---|---|---|---|
| 匠城出任務 (game title) | Craft City Rush | 匠シティ・ラッシュ | Craft City Rush | Craft City Rush |
| 匠城 (the city) | Craft City | 匠シティ | Craft City | Craft City |
| 匠管 / INFORCRAFT 匠管 | INFORCRAFT | INFORCRAFT | INFORCRAFT | INFORCRAFT |
| 匠幣 (in-game coins) | coins / Craft Coins | 匠コイン | xu / Xu Craft | koin / Koin Craft |
| 師傅 (the player, a field technician) | pro | 職人 | thợ | teknisi |
| 一個班 / 一班 (one play session) | a shift | 1シフト | một ca | satu shift |
| 工單 (job/work order) | job | 依頼 | đơn | order |
| 營收 (revenue) | earnings | 売上 | doanh thu | pendapatan |
| 連單 (combo multiplier) | combo | コンボ | combo | combo |
| 收工 (end of shift) | clock out | 退勤 | tan ca | pulang kerja |
| 上工 (start shift) | start work | 出勤 | vào ca | mulai kerja |
| 車庫 (garage/customization) | Garage | ガレージ | Gara | Garasi |
| 排行榜 | Leaderboard | ランキング | Bảng xếp hạng | Peringkat |
| 小/中/大地圖 | Small / Medium / Large map | 小/中/大マップ | Bản đồ nhỏ/vừa/lớn | Peta kecil/sedang/besar |
| 台灣地圖 (hidden map) | Taiwan Map | 台湾マップ | Bản đồ Đài Loan | Peta Taiwan |
| 今日名場面 | Today's Best Moments | 今日の名場面 | Khoảnh khắc hài hôm nay | Momen Kocak Hari Ini |
| 高鐵 / 高鐵站 | HSR / HSR station | 台湾高鉄 / 高鉄駅 | tàu cao tốc / ga tàu cao tốc | kereta cepat / stasiun kereta cepat |
| 手搖飲 | bubble tea | タピオカドリンク | trà sữa | boba |
| 垃圾車 | garbage truck | ゴミ収集車 | xe rác | truk sampah |
| 土狗 / 野狗 | stray dogs | 野良犬 | chó hoang | anjing liar |
| 臨檢 | checkpoint | 検問 | trạm kiểm tra | razia |
| 換電站 | battery swap station | バッテリー交換所 | trạm đổi pin | stasiun tukar baterai |
| 加油站 | gas station | ガソリンスタンド | cây xăng | pom bensin |
| 工務所 (TaskGo site office) | Site Office | 工務店 | Văn phòng công trình | Kantor Proyek |
| 洗衣中心 | Laundry Hub | ランドリーセンター | Trung tâm giặt | Pusat Laundry |
| 社宅 / 包租代管 (Homigo) | rental homes / property management | 賃貸住宅 / 賃貸管理 | nhà cho thuê / quản lý cho thuê | rumah sewa / manajemen sewa |
| 新房客入住 | new tenant moved in | 新しい入居者 | khách thuê mới vào ở | penyewa baru masuk |
| 報修結案 | repair job closed | 修理完了 | đơn sửa chữa hoàn tất | perbaikan selesai |
| 衣物收送 | laundry pickup & drop-off | 衣類の集配 | nhận & giao đồ giặt | antar-jemput laundry |
| 慢 (road paint) | SLOW | 徐行 | CHẬM | PELAN |
| 待轉 (road paint: two-stage turn box) | WAIT | 二段階 | CHỜ RẼ | TUNGGU |
| 檳榔 (betel-nut stand sign) | Betel Nut | ビンロウ | Trầu cau | Pinang |

Places (use exactly):
| 中文 | en / id | ja | vi |
|---|---|---|---|
| 台北 | Taipei | 台北 | Đài Bắc |
| 台中 | Taichung | 台中 | Đài Trung |
| 高雄 | Kaohsiung | 高雄 | Cao Hùng |
| 台南 | Tainan | 台南 | Đài Nam |
| 嘉義 | Chiayi | 嘉義 | Gia Nghĩa |
| 宜蘭 | Yilan | 宜蘭 | Nghi Lan |
| 花蓮 | Hualien | 花蓮 | Hoa Liên |
| 台東 | Taitung | 台東 | Đài Đông |
| 墾丁 | Kenting | 墾丁 | Khẩn Đinh |
| 全台 | all of Taiwan | 台湾全土 | khắp Đài Loan |
| 台北 101 | Taipei 101 | 台北101 | Taipei 101 |
| 台中歌劇院 | Taichung Opera House (id: Gedung Opera Taichung) | 台中国家歌劇院 | Nhà hát Đài Trung |
| 日月潭 | Sun Moon Lake (id: Danau Sun Moon) | 日月潭 | Hồ Nhật Nguyệt |
| 阿里山 | Alishan | 阿里山 | A Lý Sơn |
| 安平古堡 | Anping Fort (id: Benteng Anping) | 安平古堡 | Pháo đài An Bình |
| 高雄愛河 | Love River (id: Sungai Cinta) | 高雄・愛河 | Sông Ái Hà |
| 愛之船 | Love Boat (id: Kapal Cinta) | 愛の船 | Thuyền tình yêu |
| 太魯閣 | Taroko Gorge (id: Ngarai Taroko) | 太魯閣 | Hẻm núi Taroko |
| 龜山島 | Turtle Island (id: Pulau Guishan) | 亀山島 | Đảo Quy Sơn |
| 鵝鑾鼻燈塔 | Eluanbi Lighthouse (id: Mercusuar Eluanbi) | ガランピ灯台 | Hải đăng Nga Loan Tỵ |

People/house names (林宅, 陳小姐, 林先生, 王媽媽…): use pinyin surnames — en "Lin Home", "Ms. Chen", "Mr. Lin", "Mrs. Wang"; ja keep kanji with さん/宅 ("林さん宅", "陳さん"); vi Sino-Vietnamese surname ("Nhà họ Lâm", "Chị Trần", "Anh Lâm", "Cô Vương"); id pinyin ("Rumah Lin", "Mbak Chen", "Pak Lin", "Bu Wang"). Street names (中華路…): en/id pinyin "Zhonghua Rd.", ja keep, vi "Đường Trung Hoa" style.
