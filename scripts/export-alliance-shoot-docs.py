#!/usr/bin/env python3
"""Export 修繕聯盟現場短影片拍攝腳本／訪綱，以及肖像權授權同意書 PDF。"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "events"
NAVY = HexColor("#0B2D5C")
CYAN = HexColor("#2BA3D6")
ORANGE = HexColor("#ED9121")
INK = HexColor("#1A2332")
MUTED = HexColor("#5A6578")
LINE = HexColor("#D5DCE6")
PALE = HexColor("#F3F7FB")
WARN = HexColor("#FFF6EA")

pdfmetrics.registerFont(TTFont("Hei", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("HeiLight", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))


def styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="CoverKicker", fontName="HeiLight", fontSize=9, textColor=CYAN, leading=14, tracking=80))
    s.add(ParagraphStyle(name="CoverTitle", fontName="Hei", fontSize=20, textColor=NAVY, leading=28, spaceAfter=4))
    s.add(ParagraphStyle(name="CoverSub", fontName="HeiLight", fontSize=11, textColor=INK, leading=18, spaceAfter=8))
    s.add(ParagraphStyle(name="H1", fontName="Hei", fontSize=13, textColor=NAVY, leading=20, spaceBefore=10, spaceAfter=6))
    s.add(ParagraphStyle(name="H2", fontName="Hei", fontSize=11, textColor=NAVY, leading=16, spaceBefore=8, spaceAfter=4))
    s.add(ParagraphStyle(name="Body", fontName="HeiLight", fontSize=9.5, textColor=INK, leading=15.5, alignment=TA_JUSTIFY, wordWrap="CJK"))
    s.add(ParagraphStyle(name="BodyLeft", fontName="HeiLight", fontSize=9.5, textColor=INK, leading=15.5, alignment=TA_LEFT, wordWrap="CJK"))
    s.add(ParagraphStyle(name="Small", fontName="HeiLight", fontSize=8.5, textColor=MUTED, leading=13.5, wordWrap="CJK"))
    s.add(ParagraphStyle(name="Fine", fontName="HeiLight", fontSize=8, textColor=MUTED, leading=12.5, wordWrap="CJK"))
    s.add(ParagraphStyle(name="Quote", fontName="Hei", fontSize=10, textColor=NAVY, leading=16, leftIndent=8, rightIndent=8, wordWrap="CJK"))
    s.add(ParagraphStyle(name="Cell", fontName="HeiLight", fontSize=8.5, textColor=INK, leading=13, wordWrap="CJK"))
    s.add(ParagraphStyle(name="CellHead", fontName="Hei", fontSize=8.5, textColor=white, leading=13, wordWrap="CJK"))
    s.add(ParagraphStyle(name="BulletBody", fontName="HeiLight", fontSize=9.5, textColor=INK, leading=15, wordWrap="CJK"))
    s.add(ParagraphStyle(name="CenterFine", fontName="HeiLight", fontSize=8, textColor=MUTED, leading=12, alignment=TA_CENTER, wordWrap="CJK"))
    s.add(ParagraphStyle(name="LegalTitle", fontName="Hei", fontSize=16, textColor=NAVY, leading=22, alignment=TA_CENTER, spaceAfter=4))
    s.add(ParagraphStyle(name="LegalH", fontName="Hei", fontSize=10, textColor=NAVY, leading=15, spaceBefore=6, spaceAfter=3))
    s.add(ParagraphStyle(name="Legal", fontName="HeiLight", fontSize=9, textColor=INK, leading=14.2, alignment=TA_JUSTIFY, wordWrap="CJK"))
    s.add(ParagraphStyle(name="Sign", fontName="HeiLight", fontSize=9.5, textColor=INK, leading=16, wordWrap="CJK"))
    s.add(ParagraphStyle(name="Footer", fontName="HeiLight", fontSize=7.5, textColor=MUTED, leading=11))
    return s


def p(text: str, style: str, ss) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), ss[style])


def hr():
    return HRFlowable(width="100%", thickness=0.6, color=LINE, spaceBefore=2, spaceAfter=8)


def navy_bar():
    return HRFlowable(width="100%", thickness=4, color=NAVY, spaceBefore=0, spaceAfter=8)


def table(data, col_widths, head=True):
    t = Table(data, colWidths=col_widths, repeatRows=1 if head else 0)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("BACKGROUND", (0, 1), (-1, -1), white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, PALE]),
    ]
    if head:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), NAVY))
        cmds.append(("TEXTCOLOR", (0, 0), (-1, 0), white))
        cmds.append(("FONTNAME", (0, 0), (-1, 0), "Hei"))
    t.setStyle(TableStyle(cmds))
    return t


def callout(text: str, ss, bg=PALE, border=CYAN):
    inner = Paragraph(text, ss["BodyLeft"])
    t = Table([[inner]], colWidths=[170 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 1.2, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def bullets(items: list[str], ss):
    return ListFlowable(
        [ListItem(Paragraph(i, ss["BulletBody"]), leftIndent=8, bulletColor=NAVY) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=12,
        bulletFontName="Hei",
        bulletFontSize=9,
        bulletColor=NAVY,
        spaceBefore=2,
        spaceAfter=4,
    )


def footer(canvas, doc, label: str):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 8 * mm, A4[0], 8 * mm, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont("HeiLight", 8)
    canvas.drawString(16 * mm, A4[1] - 5.4 * mm, "匠管 TaskGo ｜ 修繕聯盟現場拍攝")
    canvas.drawRightString(A4[0] - 16 * mm, A4[1] - 5.4 * mm, label)
    canvas.setFillColor(MUTED)
    canvas.setFont("HeiLight", 7.5)
    canvas.drawString(16 * mm, 10 * mm, "僅供現場執行與簽署使用。授權書內容非法律意見，重大對外投放前請再由公司確認。")
    canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"{doc.page}")
    canvas.setStrokeColor(CYAN)
    canvas.setLineWidth(2)
    canvas.line(16 * mm, 13.5 * mm, A4[0] - 16 * mm, 13.5 * mm)
    canvas.restoreState()


def build_script(ss) -> list:
    story = []
    story.append(navy_bar())
    story.append(p("TASKGO ／ 修繕聯盟現場", "CoverKicker", ss))
    story.append(p("短影片拍攝腳本與訪綱", "CoverTitle", ss))
    story.append(p("第三人稱見證片：讓工班自己講現場怎麼管案子。觀眾先信頭仔，才會信系統。", "CoverSub", ss))
    story.append(
        p(
            "拍攝目的：以一問一答訪談，介紹工班工種、服務範圍與現場痛點，並由第三方人員見證 TaskGo 派工管理系統的優勢。"
            "原則：先問工地，再碰系統。沒用過 TaskGo 的人，痛點一樣能剪成「為什麼需要派工系統」；用過的人，才剪「系統優勢見證」。",
            "Body",
            ss,
        )
    )

    story.append(p("一、拍攝規格（現場能跑）", "H1", ss))
    story.append(hr())
    story.append(
        table(
            [
                [p("項目", "CellHead", ss), p("建議", "CellHead", ss)],
                [p("片長", "Cell", ss), p("每人訪 5–7 分鐘；成片 45–60 秒（IG／FB Reels 直式 9:16）", "Cell", ss)],
                [p("形式", "Cell", ss), p("一問一答。受訪者胸口以上，背景為會場即可。提問者可在鏡頭外或側前方。", "Cell", ss)],
                [p("收音", "Cell", ss), p("手機＋領夾麥優先。會場很吵，寧可畫面普通、聲音清楚。", "Cell", ss)],
                [p("人數", "Cell", ss), p("目標 4–6 位不同工種（水電、泥作、油漆、防水、木作、冷氣等）。", "Cell", ss)],
                [p("必帶", "Cell", ss), p("手機直式、領夾麥、名片、筆記本、授權同意書（先簽再拍）、筆。", "Cell", ss)],
            ],
            [32 * mm, 138 * mm],
        )
    )

    story.append(p("二、現場流程（每人約 8 分鐘）", "H1", ss))
    story.append(hr())
    story.append(
        bullets(
            [
                "先口頭說明 20 秒：會剪成短影音，工班名、工種可能上字幕，用於 TaskGo／匠管介紹。",
                "請工班主簽署《肖像權、聲音及訪談內容使用授權同意書》。未簽名，不開拍。",
                "拍一張已簽名同意書存檔（手機即可），再開始錄影。",
                "照訪綱問完。每人超過 7 分鐘就收。時間緊只問 Q1、Q2、Q4。",
                "記下工班名、工種、服務範圍，事後上字幕。",
            ],
            ss,
        )
    )
    story.append(
        callout(
            "<b>拍前 20 秒口頭說明（照唸）：</b><br/>"
            "「今天想訪問你一兩分鐘，介紹工班、聊聊現場最棘手的事，以及現在怎麼管派工。會剪成短影音，用在 TaskGo／匠管介紹。"
            "工班名稱、工種可能上字幕。請先簽這張授權書，簽完我們再拍。不想露出本名也可以勾選。」",
            ss,
            bg=WARN,
            border=ORANGE,
        )
    )

    story.append(p("三、你的開場（第三人稱定位，約 8 秒）", "H1", ss))
    story.append(hr())
    story.append(
        callout(
            "「今天在修繕聯盟，我不講簡報。<br/>我問現場的頭仔：案子怎麼派、進度怎麼回、錢怎麼對。<br/>系統好不好用，讓做工的人自己講。」",
            ss,
        )
    )
    story.append(p("不要說「我來介紹 TaskGo 有多強」。你的角色是聯盟現場的提問者，不是業務。", "Small", ss))

    story.append(p("四、訪綱（現場照這張問）", "H1", ss))
    story.append(hr())
    story.append(p("每個問題一次只問一句。對方講超過 20 秒，自然打斷、收一句重點再往下。", "Body", ss))

    story.append(
        KeepTogether(
            [
                p("Q1　工班是誰（15–20 秒，片頭用）", "H2", ss),
                p("<b>主問</b>　先請你自我介紹：工班叫什麼、主要工種、平常做哪些工項、服務範圍到哪？", "BodyLeft", ss),
                p("<b>追問（擇一）</b>　幾個人、做了幾年？主要接住宅修繕、社區，還是包租代管／商業？明天如果有人要找你們，最常找哪一項？", "BodyLeft", ss),
                p("字幕：{工班名}　{工種}｜服務 {縣市}", "Small", ss),
            ]
        )
    )

    story.append(p("Q2　最棘手的施工問題（本片情緒高峰）", "H2", ss))
    story.append(p("<b>主問</b>　做這麼多年，碰過最棘手的施工問題是什麼？最後怎麼收尾的？", "BodyLeft", ss))
    story.append(p("<b>追問（一定要問，這段才接得上系統）</b>", "BodyLeft", ss))
    story.append(
        bullets(
            [
                "那時候溝通是電話、LINE 群，還是現場口頭講完就算？",
                "照片、尺寸、業主改來改去，最後紀錄留在哪？",
                "這種案子最怕的是事後說不清楚，還是請款對不到？",
            ],
            ss,
        )
    )
    story.append(
        p(
            "要聽到的金句類型：群組找不到三個月前的照片；業主說有講、師傅說沒講；做完了，請款單已讀不回；一個人同時三個案場，頭仔一直打電話追。"
            "這題不要急著提 TaskGo。讓痛點自己成立。",
            "Small",
            ss,
        )
    )

    story.append(p("Q3　現在怎麼管（對照組）", "H2", ss))
    story.append(p("<b>主問</b>　現在派工、進度、現場照片、請款，你們怎麼管？有在用任何管理資訊系統嗎？還是還在 LINE 加紙本？", "BodyLeft", ss))
    story.append(p("<b>追問</b>　最常卡在哪一段：找不到人、找不到圖，還是對不到錢？師傅會不會用？有沒有人因為要裝 App 就不打了？頭仔每天最花時間的，是在現場，還是在追訊息？", "BodyLeft", ss))
    story.append(
        table(
            [
                [p("對方說", "CellHead", ss), p("你怎麼接", "CellHead", ss)],
                [p("純 LINE／紙本／白板", "Cell", ss), p("所以做到哪、誰去做、圖在哪，還是要靠人追？", "Cell", ss)],
                [p("有別套系統但師傅不用", "Cell", ss), p("後台很完整，但現場還是回到 LINE，對嗎？", "Cell", ss)],
                [p("有表單／雲端硬碟", "Cell", ss), p("那派工當下，師傅手機裡看得到今天任務嗎？", "Cell", ss)],
            ],
            [48 * mm, 122 * mm],
        )
    )

    story.append(p("Q4　TaskGo（本片產品落點，依對方分岔）", "H2", ss))
    story.append(p("<b>所有人都先問這句，不要先解釋產品：</b>有聽過、或實際用過 TaskGo 派工管理系統嗎？", "BodyLeft", ss))
    story.append(p("A. 用過／正在用（見證片，最有價值）", "H2", ss))
    story.append(
        bullets(
            [
                "哪個功能最有感？派工、LINE 打卡、拍照回報、還是請款？",
                "跟以前用群組比，差在哪一件事？",
                "師傅會不會用？要不要另外裝 App？",
                "如果只准留一句給其他工班，你會怎麼講？",
            ],
            ss,
        )
    )
    story.append(p("B. 聽過但沒用", "H2", ss))
    story.append(
        bullets(
            [
                "當時沒導入，卡在哪？覺得麻煩、費用，還是師傅不碰？",
                "如果打卡、任務、拍照回報、請款都在 LINE 裡完成，你最先想解哪一件？",
            ],
            ss,
        )
    )
    story.append(p("C. 沒聽過（不要現場教學產品，改問需求）", "H2", ss))
    story.append(
        bullets(
            [
                "假如有一套不用裝 App、師傅會傳 LINE 就會用的派工，你最想它幫你留什麼紀錄？",
                "派工、進度給業主看、請款，三件裡你先要哪一件？",
            ],
            ss,
        )
    )
    story.append(p("用過才讓對方「見證優勢」；沒用過就讓對方「見證痛點」。兩種都能剪，不要硬逼講 TaskGo 好用。", "Small", ss))

    story.append(p("Q5　希望聯盟幫什麼（收尾）", "H2", ss))
    story.append(p("<b>主問</b>　如果工程聯盟以後要幫工班，你最希望聯盟協助哪一塊？", "BodyLeft", ss))
    story.append(p("對方卡住再提示（不要一次唸完）：案源媒合、缺工找人、標準流程、對帳請款、教育訓練、共同接社區或代管案、保險與合約、進度讓業主看得到。", "BodyLeft", ss))
    story.append(p("<b>追問</b>　這些如果聯盟有一套大家能共用的做法，你願不願意試？最不想要的是什麼？不要再多一個裝不下手的 App，還是不要再多一個沒人理的群組？", "BodyLeft", ss))
    story.append(p("這題把「單一工班的苦」拉成「聯盟該一起解的事」，旁白才能說 TaskGo 是給聯盟用的工具，而不是來賣軟體。", "Small", ss))

    story.append(p("五、口袋卡（時間緊保底三題）", "H1", ss))
    story.append(hr())
    story.append(
        callout(
            "1. 工班、工種、工項、服務範圍？<br/>"
            "2. 最棘手的施工問題？當時紀錄留在哪？<br/>"
            "3. 現在有沒有管理系統？還是 LINE／紙本？最卡哪一段？<br/>"
            "4. 有沒有用過 TaskGo？有：最有感的功能、師傅會不會用、一句話。無：最想先留哪一種紀錄？<br/>"
            "5. 聯盟最該幫工班的是哪一件？<br/><br/>"
            "<b>保底三題：Q1 → Q2 → Q4。</b>",
            ss,
        )
    )

    story.append(p("六、45–60 秒成片腳本（回來剪，不是現場照唸）", "H1", ss))
    story.append(hr())
    story.append(p("版型 A｜用過 TaskGo 的頭仔（見證）", "H2", ss))
    story.append(
        table(
            [
                [p("秒", "CellHead", ss), p("畫面", "CellHead", ss), p("台詞／字幕", "CellHead", ss)],
                [p("0–5", "Cell", ss), p("會場／工班名卡", "Cell", ss), p("旁白：修繕聯盟現場，問頭仔怎麼管案子。", "Cell", ss)],
                [p("5–12", "Cell", ss), p("受訪者", "Cell", ss), p("Q1：我們做{工種}，{縣市}，主要{工項}。", "Cell", ss)],
                [p("12–28", "Cell", ss), p("受訪者", "Cell", ss), p("Q2 金句：最棘手＋當時資訊散在 LINE／電話。", "Cell", ss)],
                [p("28–42", "Cell", ss), p("受訪者", "Cell", ss), p("Q4：用 TaskGo 之後，{派工／回報／請款}不用再翻群組。", "Cell", ss)],
                [p("42–52", "Cell", ss), p("受訪者", "Cell", ss), p("一句見證：師傅不用裝 App，會 LINE 就會用。", "Cell", ss)],
                [p("52–60", "Cell", ss), p("出鏡或字幕卡", "Cell", ss), p("這不是業務講的，是現場的人講的。工地不亂，才有機會賺錢。", "Cell", ss)],
            ],
            [22 * mm, 40 * mm, 108 * mm],
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(p("版型 B｜沒用過系統的頭仔（痛點見證）", "H2", ss))
    story.append(
        table(
            [
                [p("秒", "CellHead", ss), p("畫面", "CellHead", ss), p("台詞／字幕", "CellHead", ss)],
                [p("0–5", "Cell", ss), p("會場", "Cell", ss), p("聯盟現場，先聽工班現在怎麼管。", "Cell", ss)],
                [p("5–12", "Cell", ss), p("受訪者", "Cell", ss), p("工種／範圍。", "Cell", ss)],
                [p("12–32", "Cell", ss), p("受訪者", "Cell", ss), p("最棘手＋圖在群組、人在電話、錢在腦中。", "Cell", ss)],
                [p("32–48", "Cell", ss), p("受訪者", "Cell", ss), p("Q3：還沒有系統，還是 LINE。最想先解的一件事。", "Cell", ss)],
                [p("48–60", "Cell", ss), p("旁白", "Cell", ss), p("現場要的不是再學一套電腦，是派工、回報、請款留得住。這就是 TaskGo 在解的事。", "Cell", ss)],
            ],
            [22 * mm, 40 * mm, 108 * mm],
        )
    )
    story.append(p("同一系列混 A、B 兩種，可信度比全是「好用」高。每支片只打一個落點：派工、現場回報、或請款。", "Small", ss))

    story.append(p("七、現場絕對不要做的事", "H1", ss))
    story.append(hr())
    story.append(
        bullets(
            [
                "不要替對方把話補成「所以 TaskGo 很好」。讓他講完，你點頭即可。",
                "不要一次把訪綱唸成問卷；一次只問一句。",
                "不要問價格、不要承諾聯盟會導入、不要對個案糾紛表態。",
                "不要拍其他廠商名片、合約、案場地址入鏡。",
                "對方若抗拒系統，把那句留下來：「再裝 App 師傅不會用」。這正好是 TaskGo 走 LINE 的理由，當下不要反駁。",
                "未簽授權書，或對方只願意聊天不願上鏡頭，改作筆記，不要偷拍。",
            ],
            ss,
        )
    )

    story.append(p("八、回來怎麼用（第三人稱敘事）", "H1", ss))
    story.append(hr())
    story.append(p("系列標題：<b>《修繕聯盟現場｜頭仔怎麼管案子》</b>", "BodyLeft", ss))
    story.append(p("旁白固定第三人稱：", "BodyLeft", ss))
    story.append(
        bullets(
            [
                "他管的是{工種}，不是軟體。",
                "他沒有要數位轉型，他要的是照片找得到、請款對得上。",
                "敢把進度講清楚的工班，才站得住。",
            ],
            ss,
        )
    )
    story.append(p("聯絡（片尾如需）：Service@inforcraft.com.tw　0972-395-117", "Small", ss))

    story.append(p("九、現場拍攝紀錄（當場填）", "H1", ss))
    story.append(hr())
    story.append(p("先簽授權再開機。未簽名者不列入成片。檔名建議：工種-工班名-日期。", "Small", ss))
    log_header = [
        p("序", "CellHead", ss),
        p("工班名稱", "CellHead", ss),
        p("工種", "CellHead", ss),
        p("授權已簽", "CellHead", ss),
        p("用過 TaskGo", "CellHead", ss),
        p("檔名／備註", "CellHead", ss),
    ]
    log_rows = [log_header]
    for i in range(1, 7):
        log_rows.append(
            [
                p(str(i), "Cell", ss),
                p("　", "Cell", ss),
                p("　", "Cell", ss),
                p("□", "Cell", ss),
                p("有／無／未問", "Cell", ss),
                p("　", "Cell", ss),
            ]
        )
    story.append(table(log_rows, [12 * mm, 38 * mm, 28 * mm, 24 * mm, 28 * mm, 40 * mm]))
    return story


def build_consent(ss) -> list:
    story = []
    story.append(navy_bar())
    story.append(p("肖像權、聲音及訪談內容使用授權同意書", "LegalTitle", ss))
    story.append(p("修繕聯盟會議現場短影片訪談　｜　匠管股份有限公司　TaskGo", "CenterFine", ss))
    story.append(p("本頁請列印 4–6 份，一位受訪者一份。未簽名不開拍。", "CenterFine", ss))
    story.append(Spacer(1, 2 * mm))
    story.append(
        p(
            "拍攝日期：______年____月____日　　拍攝地點：________________________________",
            "Sign",
            ss,
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(
        p(
            "被授權人：匠管股份有限公司（下稱「本公司」，營運品牌含 TaskGo）<br/>"
            "聯絡：Service@inforcraft.com.tw　／　0972-395-117",
            "Legal",
            ss,
        )
    )
    story.append(p("一、授權人資料（請正楷填寫）", "LegalH", ss))
    story.append(
        table(
            [
                [p("真實姓名", "CellHead", ss), p("", "Cell", ss), p("職稱", "CellHead", ss), p("", "Cell", ss)],
                [p("工班／公司名稱", "CellHead", ss), p("", "Cell", ss), p("工種", "CellHead", ss), p("", "Cell", ss)],
                [p("聯絡電話", "CellHead", ss), p("", "Cell", ss), p("服務地區", "CellHead", ss), p("", "Cell", ss)],
                [
                    p("身分證字號", "CellHead", ss),
                    p("", "Cell", ss),
                    p("備註", "CellHead", ss),
                    p("可僅填後四碼；依個資法保管", "Cell", ss),
                ],
            ],
            [32 * mm, 53 * mm, 28 * mm, 57 * mm],
            head=False,
        )
    )
    # restyle header-like first cells as navy labels
    story[-1].setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), NAVY),
                ("BACKGROUND", (2, 0), (2, -1), NAVY),
                ("TEXTCOLOR", (0, 0), (0, -1), white),
                ("TEXTCOLOR", (2, 0), (2, -1), white),
                ("FONTNAME", (0, 0), (0, -1), "Hei"),
                ("FONTNAME", (2, 0), (2, -1), "Hei"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("BACKGROUND", (1, 0), (1, -1), white),
                ("BACKGROUND", (3, 0), (3, -1), white),
            ]
        )
    )

    story.append(p("二、我了解並同意下列事項", "LegalH", ss))
    story.append(
        p(
            "1. 本公司將以訪談方式拍攝本人之影像、聲音、口述內容，並得一併記載工班名稱、工種、可服務工項與服務範圍等本人當場陳述之資訊。"
            "拍攝前已向本人說明用途，本人係出於自願接受拍攝，得隨時表示不想回答特定問題。",
            "Legal",
            ss,
        )
    )
    story.append(
        p(
            "2. 本人同意以<b>非專屬、無償</b>方式，授權本公司得重製、公開播送、公開傳輸、改作（含剪輯、上字幕、加品牌卡、製成短影音與圖文）上述素材，用於："
            "（1）TaskGo／匠管官方網站與官方社群（含 Facebook、Instagram、Threads、YouTube、LINE 官方帳號等）；"
            "（2）產品介紹、聯盟活動、研討會、新聞露出與媒體資料；（3）內部教育訓練與業務簡報。",
            "Legal",
            ss,
        )
    )
    story.append(
        p(
            "3. 本公司<b>不得</b>將本人肖像單獨授權予無關之第三方作為其他商品廣告，亦不得用於與本訪談無關、足使本人名譽或信用受損之用途。"
            "涉及客戶個資、案場地址、金額或未公開合約之內容，拍攝單位應予遮罩或刪除。",
            "Legal",
            ss,
        )
    )
    story.append(
        p(
            "4. 授權期間自簽署日起<b>五年</b>。地區含中華民國及全球網路。期間屆滿後，已公開內容得於原平台留存；"
            "本人得以書面（含電子郵件）請求停止新製投放或下架，本公司應於合理期間處理。此不影響通知前已合法完成之使用。",
            "Legal",
            ss,
        )
    )
    story.append(
        p(
            "5. 本公司得為平台時長與規格進行剪輯，但不得惡意歪曲本人之陳述。本授權不構成僱傭、承攬或產品代言契約，亦不轉讓工班商標或營業秘密。",
            "Legal",
            ss,
        )
    )
    story.append(
        p(
            "6. 本人保證已成年，所陳述之工班資訊為本人有權陳述。本同意書一式兩份（得以拍照存檔代替紙本第二份），雙方各執一份。",
            "Legal",
            ss,
        )
    )

    story.append(p("三、露出方式（請勾選，可複選）", "LegalH", ss))
    story.append(
        p(
            "□　同意露出真實姓名<br/>"
            "□　僅同意露出工班名稱／職稱（不上本名）<br/>"
            "□　同意露出工種、服務範圍及本人口述之專業內容<br/>"
            "□　同意於字幕標示工班名稱",
            "Legal",
            ss,
        )
    )

    story.append(p("四、簽名欄", "LegalH", ss))
    story.append(Spacer(1, 1 * mm))
    sign = Table(
        [
            [
                p("授權人（受訪者）", "CellHead", ss),
                p("被授權人收件（匠管）", "CellHead", ss),
            ],
            [
                p(
                    "簽名：________________________<br/><br/>"
                    "姓名正楷：__________________<br/><br/>"
                    "日期：______年____月____日",
                    "Sign",
                    ss,
                ),
                p(
                    "簽名：________________________<br/><br/>"
                    "姓名正楷：__________________<br/><br/>"
                    "日期：______年____月____日",
                    "Sign",
                    ss,
                ),
            ],
        ],
        colWidths=[85 * mm, 85 * mm],
    )
    sign.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("FONTNAME", (0, 0), (-1, 0), "Hei"),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("VALIGN", (0, 1), (-1, 1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, NAVY),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING", (0, 1), (-1, 1), 10),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 12),
                ("BACKGROUND", (0, 1), (-1, 1), PALE),
            ]
        )
    )
    story.append(sign)
    story.append(Spacer(1, 3 * mm))
    story.append(
        p(
            "簽署前請確認：未簽名不開拍。本人已閱讀並了解本同意書內容。如有疑問可先不簽、改為不上鏡頭之意見交流。"
            "本文件為活動現場使用之授權模板，不構成法律意見。",
            "Fine",
            ss,
        )
    )
    return story


def export_pdf(path: Path, story, label: str):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=label,
        author="匠管股份有限公司",
        subject="修繕聯盟現場拍攝",
    )
    ss = styles()

    def _footer(canvas, doc_):
        footer(canvas, doc_, label)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    print(f"wrote {path}")


def main():
    ss = styles()
    script_path = OUT_DIR / "2026-修繕聯盟-TaskGo短影片拍攝腳本與訪綱.pdf"
    consent_path = OUT_DIR / "2026-修繕聯盟-肖像權及訪談授權同意書.pdf"
    export_pdf(script_path, build_script(ss), "拍攝腳本與訪綱")
    export_pdf(consent_path, build_consent(ss), "肖像權及訪談授權同意書")


if __name__ == "__main__":
    main()
