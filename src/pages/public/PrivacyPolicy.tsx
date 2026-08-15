import { useParams, Link } from 'react-router-dom';

// ============================================================================
// 公開隱私權政策頁(免登入):供 Meta App Review 與一般使用者查閱
//   /privacy          → 通用版(GO 行銷中心)
//   /privacy/:brand   → 品牌版(homigo / taskgo / washgo)
// 同一頁包含「資料刪除說明」章節,可同時作為 Meta 的
// Privacy Policy URL 與 Data Deletion Instructions URL 使用。
// ============================================================================

const CONTACT_EMAIL = 'service@inforcraft.com.tw';

const LAST_UPDATED = '2026-08-09';

interface BrandInfo {
  name: string;
  service: string;
}

const BRANDS: Record<string, BrandInfo> = {
  homigo: { name: 'Homigo', service: '租屋管理與包租代管服務' },
  taskgo: { name: 'TaskGo', service: '裝修工程媒合與工班管理服務' },
  washgo: { name: 'Washgo', service: '衣物清洗與保養服務' },
  fixercowork: { name: 'FIXERCOWORK', service: '房屋修繕與工程整合服務' },
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 800, margin: '28px 0 10px', color: 'var(--color-text)',
};
const paragraph: React.CSSProperties = {
  fontSize: 14, lineHeight: 1.9, color: 'var(--color-text)', marginBottom: 8,
};
const listStyle: React.CSSProperties = {
  fontSize: 14, lineHeight: 1.9, color: 'var(--color-text)', paddingLeft: 22, marginBottom: 8,
};

export function PrivacyPolicy() {
  const { brand: slug } = useParams();
  const brand = slug ? BRANDS[slug] : undefined;
  const owner = brand ? `${brand.name}(由 GO 行銷中心營運)` : 'GO 行銷中心';
  const title = brand ? `${brand.name} 隱私權政策` : 'GO 行銷中心 隱私權政策';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, var(--color-primary-soft) 0%, var(--color-bg-soft) 55%)',
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 760, alignSelf: 'flex-start' }}>
        <div
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            padding: '36px 32px',
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{title}</h1>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            最後更新日期:{LAST_UPDATED}
          </p>
          {brand && (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              適用品牌:{brand.name}({brand.service})
            </p>
          )}

          <h2 style={sectionTitle}>一、前言與適用範圍</h2>
          <p style={paragraph}>
            {owner}(以下稱「我們」)重視您的隱私。本政策說明我們的行銷管理平台
            (以下稱「本服務」)在連接與使用 Meta 平台(Facebook、Instagram、Threads)相關功能時,
            如何收集、使用、儲存及保護相關資料。本服務為品牌內部行銷營運工具,
            使用者為品牌授權的管理人員。
          </p>

          <h2 style={sectionTitle}>二、我們收集的資料</h2>
          <ul style={listStyle}>
            <li>社群帳號基本資料:經品牌管理者授權連接的 Facebook 粉絲專頁、Instagram 商業帳號與 Threads 帳號之識別碼、帳號名稱與存取權杖(access token)。</li>
            <li>內容資料:品牌透過本服務建立、發布的貼文與回覆內容,以及發布紀錄。</li>
            <li>公開貼文資料:為協助品牌了解行業相關討論,本服務會透過 Meta 官方 API(如 Threads Keyword Search)搜尋公開貼文之標題、內文、作者帳號與連結,僅呈現給該品牌之管理者作為互動參考。</li>
            <li>互動與成效數據:貼文的公開互動指標(如按讚、留言數),用於成效分析。</li>
          </ul>

          <h2 style={sectionTitle}>三、資料使用目的</h2>
          <ul style={listStyle}>
            <li>協助品牌管理者集中管理多平台社群內容的建立、審核與發布。</li>
            <li>提供行業相關公開討論之搜尋結果,供品牌管理者<strong>人工審核後</strong>參與互動;本服務不會在未經人工設定或授權的情況下擅自代表使用者行動。</li>
            <li>分析品牌自有貼文成效,協助改善內容品質。</li>
          </ul>
          <p style={paragraph}>
            我們不會將任何資料出售、出租或分享給第三方作行銷用途;
            搜尋取得的公開貼文資料僅作為呈現與互動參考,不另作其他用途。
          </p>

          <h2 style={sectionTitle}>四、資料儲存與安全</h2>
          <ul style={listStyle}>
            <li>社群帳號存取權杖(access token)以 AES-256-GCM 加密後儲存,僅系統後端可解密使用。</li>
            <li>資料儲存於具備業界安全標準的雲端服務(Cloudflare、Neon PostgreSQL),傳輸過程全程使用 TLS 加密。</li>
            <li>僅品牌授權的管理人員可透過帳號密碼登入存取資料。</li>
          </ul>

          <h2 style={sectionTitle}>五、第三方服務</h2>
          <p style={paragraph}>本服務運作時使用以下第三方服務,各服務僅取得完成其功能所必要之資料:</p>
          <ul style={listStyle}>
            <li>Meta Platforms(Facebook / Instagram / Threads API):社群內容之讀取與發布。</li>
            <li>OpenAI:內容草稿與回覆建議之生成(僅傳送生成所需之主題與上下文)。</li>
            <li>Cloudflare(網站與媒體託管)、Neon(資料庫)。</li>
          </ul>

          <h2 style={sectionTitle}>六、資料保存期間</h2>
          <p style={paragraph}>
            社群帳號連接資料於品牌解除連接或要求刪除前持續保存;
            AI 生成之媒體檔案最長保存 31 天後自動刪除;
            公開貼文之搜尋快照僅保存供品牌管理者檢視之必要期間。
          </p>

          <h2 style={sectionTitle}>七、資料刪除方式(Data Deletion Instructions)</h2>
          <p style={paragraph}>您可以透過以下任一方式刪除您的資料或撤銷授權:</p>
          <ul style={listStyle}>
            <li>
              <strong>撤銷 Threads 授權:</strong>於 Threads App 中前往
              「設定 → 帳號 → 網站權限」,移除本應用的存取權限;撤銷後本服務即無法再存取您的帳號資料。
            </li>
            <li>
              <strong>撤銷 Facebook / Instagram 授權:</strong>於 Facebook
              「設定 → 商業整合」中移除本應用。
            </li>
            <li>
              <strong>要求刪除已儲存資料:</strong>來信 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>,
              註明您的帳號名稱與刪除範圍,我們將於 30 天內完成刪除並回覆確認。
            </li>
          </ul>

          <h2 style={sectionTitle}>八、您的權利</h2>
          <p style={paragraph}>
            依個人資料保護相關法令,您有權查詢、閱覽、複製、更正或刪除您的個人資料,
            並得隨時撤回授權。行使上述權利請透過本頁聯絡方式與我們聯繫。
          </p>

          <h2 style={sectionTitle}>九、政策更新</h2>
          <p style={paragraph}>
            本政策如有修訂,將更新本頁面並調整「最後更新日期」。
            重大變更時,我們會於服務內另行通知。
          </p>

          <h2 style={sectionTitle}>十、聯絡方式</h2>
          <p style={paragraph}>
            對本政策或資料處理方式有任何疑問,歡迎來信:
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>

          {!brand && (
            <div style={{ marginTop: 28, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                各品牌專屬版本:
                {Object.entries(BRANDS).map(([key, b]) => (
                  <Link key={key} to={`/privacy/${key}`} style={{ marginLeft: 10 }}>{b.name}</Link>
                ))}
              </p>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 16 }}>
          © {new Date().getFullYear()} GO 行銷中心
        </p>
      </div>
    </div>
  );
}
