# Nghiên cứu đối thủ: Madgicx (24/10/2026)

> Đầu vào để chọn tính năng tương lai cho AdxLens. **Dữ liệu là quan sát, không phải yêu cầu**; quyết định làm gì vẫn
> qua PRD / ADR.
>
> **Nguồn và độ tin cậy:**
> - **[Thấy]**: duyệt trực tiếp trong app (tài khoản dùng thử của PM, ad account TRON_GLAMPING), chỉ xem, không
>   thay đổi gì.
> - **[Công khai]**: trang công khai madgicx.com (pricing, product pages). Nhiều module trong app bị khóa vì bản
>   dùng thử đã hết ("Your Trial is Over").
> - **[Khóa]**: có trong menu nhưng không xem được nội dung.

## 1. Tổng quan

- **Hai "sản phẩm" trong cùng một app**, chuyển qua "Switch product" [Thấy]:
  - **Workspace (mới)**: giao diện mới, gọn, lấy AI chat / agent làm trung tâm. Phần lớn xem được khi dùng thử.
  - **Madgicx App (cổ điển)**: bộ công cụ đầy đủ (Optimization, Analytics, Creatives, Advanced). Phần lớn bị paywall
    sau khi hết dùng thử.
- **Kênh:** Meta là chính. Google Ads có ở MCP và báo cáo. Báo cáo kết nối thêm GA4, Shopify, Klaviyo, TikTok
  [Công khai].
- **Mô hình giá** [Thấy + Công khai]:
  - Gói chính "Madgicx Pro Complete": **$45/tháng**, $38/tháng nếu trả theo quý (−15%), **$32/tháng** nếu trả theo năm
    (−30%, $378/năm).
  - Gói theo **chi tiêu quảng cáo hằng tháng**: bậc thấp nhất "tới $1K/tháng", gồm **2 ad account**. Vượt bậc thì
    phụ thu hoặc tự nâng bậc.
  - Các bậc chi tiêu: <$1K, $1–2.5K, $2.5–5K, $5–10K, $10–20K, $20–30K, $30K+.
  - Add-on **Tracking Pro** (Cloud Tracking / CAPI): **$49/tháng** mỗi tài khoản.
  - Gói báo cáo riêng (One-Click Report): ưu đãi $29/tháng.
  - Dùng thử 7 ngày, tự trừ thẻ khi hết hạn. Bản dùng thử giới hạn "3 optimization tasks".
  - Paywall hiện ngay trong app: bấm vào đề xuất cũng mở hộp thoại thanh toán, thẻ đã lưu sẵn.

## 2. Workspace (giao diện mới) [Thấy]

| Trang | Tính năng chi tiết |
|---|---|
| **Home** | Hai tab **Account / Agency** (Agency bị khóa với 1 tài khoản). **Meta account health** dạng điểm 0–100 ("90 · Excellent"). Ô **Tracking** ("Coming soon"). **Performance overview**: 4 KPI tùy chỉnh (Spend, Purchase value, ROAS, Cost per purchase) với sparkline kỳ này / kỳ trước, % thay đổi, độ phủ dữ liệu ("2 of 7 days"); chọn kỳ; "Customize". Khung **Madgicx Agents** (ô hỏi, gõ `/` để gợi ý) + **Quick actions**: Launch ads, Create campaigns, Build agents, Create workflows. **Needs attention**: cảnh báo của Madgicx + **đề xuất gốc từ Meta** (vd. "thêm ảnh AI để +10% CTR", "scale ad set chi phí thấp") có mức độ và thời điểm. **Gợi ý tạo alert từ dữ liệu**: "CPM 7 ngày dao động ₫27K–₫49K trong 30 ngày → báo khi vượt ₫48K" (1 click tạo). **Programs** (sắp có): Creative Testing Program, Budget Management Program. |
| **Create** (nút) | Hộp "What will you create?": Dashboard/report (sắp có), Manage my ads, New ad or creative, **Agent** ("set a goal and let it run"), **Workflow** ("automate repeat tasks"), **Alert**. |
| **Alert** | Chọn chỉ số + điều kiện ("goes above"…) + ngưỡng theo ngày; hiện **giá trị trung bình 7 ngày** để gợi ý ngưỡng; nhiều chỉ số trong một alert. Quản lý ở Settings → Alerts. |
| **Ads** | Lưới **theo từng quảng cáo**: thumbnail, loại (Image / Dynamic / Text / Carousel / Video), mục tiêu ("Engagement · Conversations"), 4 chỉ số chọn được; lọc; 7/14/30 ngày. |
| **Ads Manager** | "Group the account's ads by anything, in any order": các chiều nhóm **kéo-thả** (Campaign › Ad set › Ad › Breakdown); cột chỉ số chọn được; **sparkline + % so kỳ trước trong từng ô**; công tắc bật/tắt; dòng tổng; ẩn đối tượng không chi tiêu; 3 chế độ xem (bảng / sơ đồ / đường đi); bật tắt hiển thị tiền tệ. |
| **Funnels** | Phễu Awareness → Consideration → Conversion (Impressions → Page engagement → Leads) với tỷ lệ chuyển giữa các bước; xem theo Account / Campaign / Ad set / **Landing page**; độ rộng thang log. |
| **Geography** | Bản đồ quốc gia theo chi tiêu, bấm vào nước để xem theo vùng; bảng vị trí với chỉ số. |
| **Scale** | **"Is my ad getting tired?"**: biểu đồ bong bóng tần suất × CPC, kích thước = chi tiêu, chia 4 góc (Fresh & cheap → scale; Burning out → refresh; Expensive early → rework; Still holding → monitor); thanh trượt lọc. **Format mix** (tỷ trọng chi tiêu và ROAS theo định dạng). **Tuổi × giới tính** (ô nhiệt, cao / thấp nhất). **Xu hướng theo ngày** tách Acquisition / Unattributed. |
| **Agents** (chat) | Chat AI chạy **Claude Sonnet 5** (có chọn model), lịch sử, mục yêu thích, đính kèm file. Câu mẫu: "Ask about your account" (6) và "Get something done" (3: Pause underperforming ads, Increase budget on best campaign, Launch a new ad). Thanh hỏi nổi "Why did my cost…" ở **mọi trang**. Câu cảnh báo "AI can make mistakes. Check important numbers in Ads Manager". |
| **Settings** | Alerts của tài khoản. |

**Năng lực chat AI theo chính nó tự mô tả** [Thấy]:
- **Phân tích:** chỉ số mọi cấp, mọi khoảng ngày; xu hướng; breakdown tuổi / giới tính / quốc gia / vùng; xếp hạng
  campaign theo doanh thu / ROAS; phân loại prospecting / retargeting.
- **Chẩn đoán:** điểm sức khỏe tài khoản + đề xuất; **Event Match Quality** (pixel thiếu định danh nào);
  **nhật ký thay đổi** tài khoản.
- **Hành động (ghi lên Meta):**
  - tạo campaign / ad set / ad (từ ảnh hoặc bài đăng có sẵn);
  - bật / tắt;
  - đổi ngân sách ngày;
  - nhân bản;
  - đổi tên hàng loạt;
  - target / loại trừ custom audience, đặt vùng địa lý.
- **Kiến thức:** trả lời câu hỏi best practice từ knowledge base.
- **Hạn chế quan sát được:** yêu cầu "build an agent" thì AI **từ chối** và chuyển hướng. Tính năng Agent / Program
  còn chưa chín.

## 3. Madgicx App (cổ điển)

| Nhóm | Module | Chi tiết |
|---|---|---|
| — | **AI Chat** (Beta) [Thấy] | Cùng chat với Workspace. |
| — | **MCP Hub** [Thấy] | Cho Claude / ChatGPT / Gemini / Cursor truy cập dữ liệu Madgicx qua MCP: tạo Client ID / Secret; MCP Facebook Ads + Google Ads; workflow demo. **Skill tải về cho Claude:** Account Structure Audit, Activity Performance Analyzer (nối thay đổi với biến động hiệu suất), Ad Performance Report, Budget Optimizer, Audience Segment Personas. Nguồn dữ liệu: Meta, Google Ads (sẵn), Shopify (sắp), TikTok (dự kiến). |
| — | **AI Ad Generator** [Thấy + Công khai] | AI Ad Hub: **Ad Library** (quảng cáo của các brand theo ngành, follow brand để có feed cá nhân hóa), AI Generations của tôi / của cộng đồng, My Creatives, Recent Edits, Saved Inspirations, **Prompt Templates**. Tạo quảng cáo ảnh từ prompt, ảnh, hoặc một ad trong Meta Ad Library; chọn "vibe"; xuất Story / Feed / Reel; gợi ý copy + CTA theo dữ liệu; đẩy thẳng lên Ads Manager. |
| Optimization | **AI Marketer** [Thấy, chi tiết bị Khóa] | "AI media buyer" audit hằng ngày, thẻ đề xuất **Open / Completed / Dismissed**, nhãn theo loại (Onboarding, Automation Tactic). Ví dụ đề xuất: special ad category, AI ad gen, **stop-loss cho ad acquisition không có click**, **automation tăng ngân sách ad set ACQ đang thắng**, sửa tracking / attribution. Chỉ số "Save work for N people", "% hành động tự động so với trung bình Madgicx", "Machine optimized / total actions". Áp dụng đề xuất bằng 1 click. |
| Optimization | **Ads Manager 2.0** [Khóa / Công khai] | Tăng / giảm ngân sách hàng loạt; sửa targeting không reset learning phase; theo dõi thay đổi gần nhất của ad set. |
| Optimization | **Madgicx Cloud Tracking** [Công khai] | CAPI Gateway + server-side tracking, Facebook Click ID, attribution theo lợi nhuận / LTV, dashboard real-time; tích hợp 1 click Meta + Shopify; add-on $49/tháng. |
| Analytics | **Business Dashboard** [Khóa] | Dashboard kinh doanh nhiều kênh: net profit, blended ROAS, MER, mục tiêu doanh thu. |
| Analytics | **360° Meta Audit** [Thấy cấu trúc] | 6 tab: Meta Dashboard, Targeting Insights, **Auction Insights**, Geo & Demo Insights, Creative Insights, **Ad Copy Insights**. |
| Analytics | **Top Audiences** [Khóa] | Xếp hạng đối tượng hiệu quả nhất. |
| Analytics | **One-Click Report / Custom Reports** [Công khai] | Kéo-thả widget (biểu đồ, bảng, theo dõi mục tiêu), mỗi widget một nguồn và khung thời gian riêng; template sẵn; gộp nhiều ad account / store; link công khai hoặc PDF; **gửi tự động** ngày / tuần / tháng tới khách; **white-label** logo agency. |
| Creatives | **Creative Insights** [Công khai] | **AI nhận diện hình ảnh gắn nhãn yếu tố creative** (cả video); creative nào có dư địa scale / nên giảm; xu hướng chống mệt. |
| Creatives | **Ad Copy Insights** [Khóa] | Phân tích hiệu quả theo nội dung chữ quảng cáo. |
| Creatives | **Create New Ad** [Khóa] | Tạo quảng cáo. |
| Advanced | **Ad Launcher** [Công khai] | Ghép creative + copy tốt nhất thành ad mới hàng loạt; dùng bài đăng FB / IG; thêm theo ad ID / post ID; gộp số liệu một ad dùng ở nhiều ad set; lưu "ad cluster". |
| Advanced | **Audience Launcher** [Công khai] | 100+ đối tượng dựng sẵn theo phễu; 27 đối tượng eRFM; "Super Lookalike" gộp nhiều lookalike (tới 20%); tự loại trừ; hẹn giờ launch. |
| Advanced | **Automation Overview / Tactics** [Khóa / Công khai] | 4 "tactic" dựng sẵn (chỉ nhập tham số), rule chạy real-time (đối thủ 15–30 phút), stop-loss / scale; "AI Bidding". |
| Advanced | **Audience Studio** [Khóa] | Tìm interest / đối tượng. |
| Agency | **White-label** [Công khai] | Tạo campaign dưới tên agency theo quy ước đặt tên; báo cáo PDF logo agency; tab Agency đa tài khoản. **Không thấy:** cổng cho khách, phân quyền theo khách. |

## 4. Đối chiếu với AdxLens và cơ hội

**AdxLens đang mạnh hơn hoặc khác biệt** (nên giữ làm lợi thế):
- **Số khớp Ads Manager ≤ 1% có kiểm chứng.** Madgicx tự ghi "AI can make mistakes. Check important numbers in Ads
  Manager". Ta có đối chiếu, chặn chia sẻ khi lệch, nút "Báo số liệu lệch".
- **AI không tạo số:** mọi số qua bộ kiểm.
- **Thao tác ghi có duyệt + guardrails + kill switch + hoàn tác.** Chat của Madgicx tự pause / đổi ngân sách / tạo ad,
  không thấy lớp guardrail nào.
- **Quản lý nhiều khách theo vai trò:** buyer chỉ thấy Client được giao, quyền duyệt theo Client, link báo cáo công
  khai có kiểm toàn vẹn. Madgicx không có cổng khách hay phân quyền theo khách.
- **Giá bằng VND, PayOS, tiếng Việt.**

**Khoảng trống đáng cân nhắc** (xếp theo giá trị / công sức với agency VN; cần PM chọn và viết PRD / ADR):

| # | Ý tưởng | Lấy cảm hứng từ | Ghi chú cho AdxLens |
|---|---|---|---|
| 1 | **Alert do người dùng tự đặt** + **gợi ý ngưỡng từ dữ liệu 30 ngày** ("CPM dao động X–Y → báo khi vượt Z", tạo 1 click) | Workspace Alerts | Dựng trên notification + anomaly (A5) có sẵn; công sức thấp, giá trị cao. |
| 2 | **Biểu đồ "quảng cáo có mệt không"** (tần suất × CPC / CPA, 4 góc hành động) | Scale | Số đã có (frequency, CPC); bổ sung cho finding `creative_fatigue`. |
| 3 | **Sparkline + % so kỳ trước trong từng ô bảng**; chọn chiều nhóm linh hoạt (Campaign / Ad set / Ad / breakdown) | Ads Manager mới | Nâng cấp bảng G1; chỉ là UI. |
| 4 | **Phễu** Hiển thị → Tương tác → Kết quả, theo **landing page** | Funnels | Cần lấy URL đích từ creative. |
| 5 | **Lưới quảng cáo có thumbnail** + **Format mix** (chi tiêu / ROAS theo định dạng) | Ads, Scale | Creative library P1 đã có thumbnail; thêm nhóm theo định dạng. |
| 6 | **Điểm sức khỏe Meta / Event Match Quality**, cảnh báo tracking | Account health, chat | Đọc EMQ qua API (chỉ đọc); finding nhóm `tracking` đã có. |
| 7 | **Đề xuất gốc của Meta** (Opportunity score / recommendations API) hiện cạnh vấn đề của ta | Needs attention | Chỉ đọc; ghi rõ nguồn "Từ Meta". |
| 8 | **"Hỏi AdxLens"**: chat trên dữ liệu (chỉ đọc) + câu mẫu; mọi số qua bộ kiểm | Agents / AI Chat | Tương ứng đề xuất AI "C"; thao tác ghi vẫn qua duyệt + guardrails. |
| 9 | **MCP server cho AdxLens** (agency dùng Claude / ChatGPT hỏi dữ liệu khách, chỉ đọc, theo quyền workspace) | MCP Hub | Lợi thế phân phối; phải giữ cách ly workspace, không lộ token. |
| 10 | **Gắn nhãn creative bằng AI + insight chữ quảng cáo** | Creative / Ad Copy Insights | Tương ứng đề xuất AI "D". |
| 11 | **Nhật ký thay đổi tài khoản → nối với biến động hiệu suất** ("Activity Performance Analyzer") | MCP skill | Rất hợp "Vì sao CPA tăng?": thêm "trong kỳ đã đổi gì". |
| 12 | **Báo cáo kéo-thả widget + mục tiêu (goal tracker)**, gộp nhiều tài khoản | One-Click Report | Đã có báo cáo + lịch gửi + thương hiệu; thiếu builder và goal. |
| 13 | **Thư viện mẫu tactic tự động** (stop-loss khi không click, scale ad set thắng) | Automation tactics | P2b đã có rule + mẫu; thêm mẫu "stop-loss không click" là nhỏ. |
| 14 | **Tạo quảng cáo / AI ad generator / audience launcher** | AI Ad Generator, Launchers | Ngoài phạm vi hiện tại (hành động ghi mới → ADR); để sau. |

**Bài học về trải nghiệm:**
- Một ô hỏi AI nổi trên mọi trang, kèm câu mẫu theo ngữ cảnh.
- Gợi ý "1 click tạo alert" dựa trên dữ liệu thật.
- Hiện độ phủ dữ liệu ngay trên KPI ("2 of 7 days").
- **Tránh:** paywall bật lên khi bấm vào đề xuất; trừ thẻ tự động khi hết dùng thử. Không hợp thị trường VN và hình
  ảnh "tin cậy" của AdxLens.

## 5. Ảnh chụp

39 ảnh chụp giao diện được lưu tạm trong thư mục scratchpad của phiên làm việc ngày 24/10/2026 (không commit vì chứa dữ
liệu tài khoản quảng cáo thật). Cần ảnh nào cho PRD thì chụp lại từ tài khoản dùng thử.
