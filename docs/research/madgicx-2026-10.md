# Nghiên cứu đối thủ: Madgicx (24/10/2026)

> Đầu vào để chọn tính năng tương lai cho AdxLens. **Dữ liệu là quan sát, không phải yêu cầu**; quyết định làm gì vẫn
> qua PRD / ADR.
>
> **Nguồn và độ tin cậy:**
> - **[Thấy]**: duyệt trực tiếp trong app qua 2 tài khoản dùng thử (lần 2 còn hạn nên mở được các module trả phí), ad
>   account TRON_GLAMPING, chỉ xem, không lưu / áp dụng / đăng gì.
> - **[Công khai]**: madgicx.com, roadmap.madgicx.com.
> - **[Khóa]**: có trong menu nhưng không xem được.

## 1. Tổng quan

- **Hai "sản phẩm" trong cùng một app**, chuyển qua "Switch product" [Thấy]:
  - **Workspace (mới)**: giao diện mới, lấy AI chat / agent làm trung tâm.
  - **Madgicx App (cổ điển)**: bộ công cụ đầy đủ (Optimization, Analytics, Creatives, Advanced).
- **Kênh:** Meta là chính. Google Ads có ở MCP và báo cáo. Báo cáo kết nối thêm GA4, Shopify, Klaviyo, TikTok
  [Công khai].
- **Mô hình giá** [Thấy + Công khai]:
  - Gói chính "Madgicx Pro Complete": **$45/tháng**, $38/tháng nếu trả theo quý (−15%), **$32/tháng** nếu trả theo năm
    (−30%, $378/năm).
  - Gói theo **chi tiêu quảng cáo hằng tháng**: bậc thấp nhất "tới $1K/tháng", gồm **2 ad account**. Vượt bậc thì
    phụ thu hoặc tự nâng bậc.
  - Các bậc chi tiêu: <$1K, $1–2.5K, $2.5–5K, $5–10K, $10–20K, $20–30K, $30K+.
  - Add-on **Cloud Tracking** $49/tháng mỗi tài khoản (làm hộ). One-Click Report có ưu đãi $29/tháng.
  - Dùng thử 7 ngày ("Limited version"), **tự trừ thẻ** khi hết hạn; bản dùng thử giới hạn "3 optimization tasks".
  - Paywall hiện ngay trong app khi hết dùng thử, thẻ đã lưu sẵn.

## 2. Workspace (giao diện mới) [Thấy]

| Trang | Tính năng chi tiết |
|---|---|
| **Home** | Hai tab **Account / Agency** (Agency bị khóa khi chỉ có 1 tài khoản). **Meta account health** dạng điểm 0–100 ("90 · Excellent"). Ô **Tracking** ("Coming soon"). **Performance overview**: 4 KPI tùy chỉnh (Spend, Purchase value, ROAS, Cost per purchase) với sparkline kỳ này / kỳ trước, % thay đổi, độ phủ dữ liệu ("2 of 7 days"); chọn kỳ; "Customize". Khung **Madgicx Agents** (ô hỏi, gõ `/` để gợi ý) + **Quick actions**: Launch ads, Create campaigns, Build agents, Create workflows. **Needs attention**: cảnh báo của Madgicx + **đề xuất gốc từ Meta** (vd. "thêm ảnh AI để +10% CTR", "scale ad set chi phí thấp") có mức độ và thời điểm. **Gợi ý tạo alert từ dữ liệu**: "CPM 7 ngày dao động ₫27K–₫49K trong 30 ngày → báo khi vượt ₫48K" (1 click). **Programs** (sắp có): Creative Testing Program, Budget Management Program. |
| **Create** (nút) | Dashboard/report (sắp có), Manage my ads, New ad or creative, **Agent** ("set a goal and let it run"), **Workflow** ("automate repeat tasks"), **Alert**. |
| **Alert** | Chỉ số + điều kiện ("goes above"…) + ngưỡng theo ngày; hiện **trung bình 7 ngày** để gợi ý ngưỡng; nhiều chỉ số trong một alert. Quản lý ở Settings → Alerts. |
| **Ads** | Lưới **theo từng quảng cáo**: thumbnail, loại (Image / Dynamic / Text / Carousel / Video), mục tiêu, 4 chỉ số chọn được; lọc; 7/14/30 ngày. |
| **Ads Manager** | Chiều nhóm **kéo-thả** (Campaign › Ad set › Ad › Breakdown); cột chọn được; **sparkline + % so kỳ trước trong từng ô**; bật / tắt; dòng tổng; ẩn đối tượng không chi tiêu; 3 chế độ xem. |
| **Funnels** | Phễu Awareness → Consideration → Conversion với tỷ lệ chuyển; theo Account / Campaign / Ad set / **Landing page**. |
| **Geography** | Bản đồ quốc gia → vùng; bảng vị trí. |
| **Scale** | **"Is my ad getting tired?"**: bong bóng tần suất × CPC, kích thước = chi tiêu, 4 góc hành động (Fresh & cheap → scale; Burning out → refresh; Expensive early → rework; Still holding → monitor). **Format mix** (chi tiêu / ROAS theo định dạng). **Tuổi × giới tính**. **Xu hướng ngày** tách Acquisition / Unattributed. |
| **Agents** (chat) | Chat AI **Claude Sonnet 5** (chọn model), lịch sử, yêu thích, đính kèm. Câu mẫu "Ask about your account" (6) và "Get something done" (3: pause ad kém, tăng ngân sách campaign tốt nhất, launch ad mới). Thanh hỏi nổi "Why did my cost…" trên **mọi trang**. Ghi chú "AI can make mistakes. Check important numbers in Ads Manager". |

**Năng lực chat AI theo chính nó tự mô tả** [Thấy]:
- **Phân tích:** chỉ số mọi cấp / mọi kỳ, xu hướng, breakdown, xếp hạng, phân loại prospecting / retargeting.
- **Chẩn đoán:** điểm sức khỏe + đề xuất; **Event Match Quality**; **nhật ký thay đổi**.
- **Hành động (ghi lên Meta, không thấy lớp duyệt):** tạo campaign / ad set / ad, bật / tắt, đổi ngân sách, nhân bản,
  đổi tên hàng loạt, custom audience, vùng địa lý.
- **Kiến thức:** câu hỏi best practice.
- **Hạn chế quan sát được:** "build an agent" thì AI **từ chối**, nên Agent / Program còn chưa chín.

## 3. Madgicx App (cổ điển) [Thấy, trừ chỗ ghi khác]

### 3.1 Optimization
- **AI Marketer:**
  - Thẻ đề xuất **Open / Completed / Dismissed**, có nhãn loại (Onboarding, Automation Tactic).
  - Chỉ số "Save work for N people", "% hành động tự động so với trung bình Madgicx", "Machine optimized / Total
    actions".
  - **Chi tiết đề xuất mở ngay trong trang**: giải thích (emoji + 3 câu), **"You could have saved ₫7,7M in the last 30
    days"**, tham số rule với **giá trị lấy từ dữ liệu tài khoản kèm "Why this value?"**, link "Discover which ads burned
    your budget on each of the last 30 days", nút **Create Automation**.
  - Ví dụ đã thấy:
    - **Stop-loss ad acquisition không click:** tạm dừng trong ngày nếu chi > ₫36.218, 0 outbound click, ad > 120
      giờ, ad set còn ≥ 2 ad; bật lại lúc nửa đêm.
    - **Scale ad set ACQ thắng +20%:** ROAS 7 ngày > 1,2 ("cao hơn 10% trung bình acquisition"), ROAS hôm nay +
      hôm qua > 1,3, ad set > 72 giờ, tối đa 1 lần / 2 ngày.
    - **Sửa tracking** → bán Cloud Tracking làm hộ.
  - Nút "Ask AI Marketer to Do More" giờ chuyển thẳng sang chat (roadmap 01/2026).
- **Ads Manager 2.0:**
  - Tab Campaigns / Ad sets / Ads / All assets; bộ lọc + **preset lọc lưu được**; tìm kiếm.
  - Cột **Latest actions** (thay đổi gần nhất) và **Performance overtime**; ngân sách sửa trực tiếp; cột chỉ số tùy chỉnh.
  - "Active optimization", "Manage assets", "Analyze creatives".
- **Cloud Tracking:** dựa trên Meta **Conversions API Gateway** / **Signals Gateway** (không cần code); quy trình mua →
  điền form quyền → đội Madgicx cài trong 1–2 ngày làm việc.

### 3.2 Automation
- **Automation Overview:**
  - Đếm hành động đã kích hoạt 7 ngày theo loại (Start / Pause / Increase budget / Decrease budget) + biểu đồ ngày.
  - Bảng tactic: trạng thái, tác giả, tài sản tự động, tần suất hành động 48h / 7d, lần kích hoạt cuối.
- **Tactic dựng sẵn:**
  - **SURF** (ad set / campaign): tăng ngân sách vượt giới hạn khi đà tốt, tự trả về lúc giờ chọn.
  - **STOP LOSS** (ad set / ad): dừng khi đà xấu, bật lại lúc giờ chọn.
  - **SUNSETTING** (ad set): giảm dần nhiều bước.
  - **REVIVE** (ad set / ad): bật lại khi có dấu hiệu sinh lời trở lại.
- **Strategies** (lọc theo E-commerce…):
  - Scale winning campaigns / ad sets; Downscale losing campaigns / ad sets;
  - Stop loss cho ad đắt không click; Pause losing ads for today (bật lại 00:00 hoặc sớm hơn nếu kết quả cải thiện do
    attribution trễ); Pause losing ads permanently.
- **Custom automation:**
  - Cấp Campaign / Ad set / Ad; **300+ chỉ số**.
  - Tác vụ: đổi trạng thái, ngân sách, tên ad set, bid test, nhân bản…
  - Điều kiện AND theo phạm vi thời gian (Today…), so sánh (Equals / Greater than…), chỉ số cấp cha (số ad đang chạy
    trong ad set), "Hours since creation".
  - Lịch: chạy liên tục / khoảng ngày; **theo ngày / giờ trong tuần**; múi giờ tài khoản.
  - Chạy "real-time" (họ so với 15–30 phút của đối thủ). Trang chủ có "Dynamic rules" theo trường động.

### 3.3 Analytics
- **Business Dashboard:**
  - Blended summary (Spend, Revenue, ROAS, Purchases, CTR, CPC + % thay đổi).
  - Các ô **Net Ad Profit / LTV / MER / AOV / CAC / LTV:CAC** cần **kết nối Shopify**.
  - Khối theo từng ad account; Share.
- **360° Meta Audit:** 6 tab, bộ lọc, Smart Filter, **preset lọc lưu được**, **Export PDF**, **Automated Reporting**.
  - **Meta Dashboard:** bảng **theo giai đoạn phễu tự phân loại**: Acquisition Prospecting / Acquisition
    Re-Engagement / Retargeting / Retention; Strategy Status Overview (biểu đồ ROAS × chi tiêu từng giai đoạn); Strategy
    Status Drilldown; Total Revenue theo giai đoạn.
  - **Targeting Insights:** Top landing pages, Interest & Lookalike expansion, Audience size & potential reach, **WiFi**
    (loại kết nối), Lookalike & recency, targeting toàn phễu.
  - **Auction Insights** (chưa tải được nội dung).
  - **Geo & Demo:**
    - **Wasted spend**: chi ở quốc gia chưa có ROAS / quốc gia kém vs tốt, "potential uplift for ROAS";
    - Trending countries; bản đồ → vùng;
    - **International scaling theo Tier 1–4**; tuổi & giới tính.
  - **Creative Insights:**
    - Theo định dạng (Image, Short / Medium / Long video, Carousel, DPA): chi tiêu, ROAS, outbound CTR, CVR, % doanh
      thu vs % chi tiêu; cảnh báo **"Missing format"** + gợi ý cảm hứng;
    - **Creative Matrix 4 góc** (Getting started / Overspend / Scalable / Core performers) theo chi tiêu × doanh thu;
    - chọn nhiều → "Open selected in Ads Launcher";
    - xu hướng theo tuần.
  - **Ad Copy Insights:**
    - từng đoạn chữ quảng cáo xếp **ma trận 4 góc** như trên;
    - **độ dài chữ** (ngắn / vừa / dài);
    - **có / không emoji**, top emoji;
    - **có / không link**.
- **Top Audiences / Audience Studio:** xếp hạng audience (interest, lookalike) theo chi tiêu / ROAS / CPA / quy mô;
  **Audience mixer** (giao AND nhiều nhóm, ước tính reach, lưu preset); **144 interest gợi ý** dựa trên audience hiện có
  (kèm quy mô, nhóm, đường dẫn).
- **One-Click Report:** quota báo cáo, nguồn dữ liệu; **template** (E-commerce Meta, Shopify + Meta, Lead gen) + báo cáo
  trống; danh sách báo cáo. Builder kéo-thả, link công khai, PDF, gửi tự động, white-label [Công khai].

### 3.4 Creatives & Advanced
- **AI Ad Hub / AI Ad Generator:**
  - Ad Library (brand theo ngành, follow để có feed); AI Generations (của tôi / cộng đồng); My Creatives; Saved
    Inspirations.
  - **Template**: Single reference image swap, Multi-product swap, Multi-reference style fusion, Product placement,
    Dynamic Instagram product ad, Messaging apps.
  - Prompt box ở mọi trang, chọn kích thước / số output.
- **Ad Launcher:**
  - Chọn ad set có sẵn; nguồn: Ads / New ads / **Creative Clusters** / bài Instagram / bài Facebook;
  - sắp xếp theo ROAS, lọc chi tiêu tối thiểu; chỉ số **Thumb-Stop Ratio**; preset; "Find inspiration".
- **Create New Ad:**
  - Identity (Page / IG), định dạng, **tới 5 biến thể** copy / headline / mô tả, URL / CTA, tracking (pixel, UTM);
  - bảng **"Meta ads Elements Performance"** (hiệu suất từng creative / copy / headline / URL / CTA / UTM đã dùng);
    thư viện ảnh.
- **Audience Launcher:**
  - Đối tượng dựng sẵn theo giai đoạn (Prospecting / Re-engagement / Retargeting / Retention), mỗi cái đếm created /
    live;
  - ví dụ: Video casuals, **Super lookalike**, Broad, **Deep browsers lookalike** (≥ 8 phút trên web), Top-event
    lookalike, All visitors 30 ngày, Medium-length browsers;
  - **nhóm khách theo tần suất × giá trị đơn** (Infrequent / Occasional × Silver / Gold / Platinum, gắn nhãn AI).

### 3.5 AI ngoài app
- **MCP Hub:**
  - Client ID / Secret; MCP Facebook Ads + Google Ads; skill tải về cho Claude (Account Structure Audit, Activity
    Performance Analyzer, Ad Performance Report, Budget Optimizer, Audience Segment Personas).
  - Roadmap 04/2026: **49 công cụ** đọc / phân tích / điều khiển; dùng được với Claude, ChatGPT, n8n, OpenAI Agents,
    LangGraph, CrewAI.
  - **Lý do họ nêu: Meta đang gắn cờ / khóa tài khoản dùng AI điều khiển trình duyệt chạy Ads Manager; MCP qua API là
    cách hợp lệ.**
- **Roadmap chat (01/2026):**
  - **chọn campaign / ad set / ad + khoảng ngày từ bảng làm ngữ cảnh cho chat**; hướng đi là đưa AI vào thẳng từng trang;
  - chat dùng được trên mobile; nút dừng sinh câu trả lời.

### 3.6 Agency
- Tab Agency trong Workspace (khóa khi chỉ 1 tài khoản).
- White-label: tạo campaign theo quy ước đặt tên của agency, PDF logo agency [Công khai].
- **Không thấy:** cổng cho khách, phân quyền theo khách.

## 4. Đối chiếu với AdxLens và cơ hội

**AdxLens đang mạnh hơn hoặc khác biệt** (giữ làm lợi thế):
- **Số khớp Ads Manager ≤ 1% có kiểm chứng.** Madgicx tự ghi "Check important numbers in Ads Manager".
- **AI không tạo số:** mọi số qua bộ kiểm.
- **Thao tác ghi có duyệt + guardrails + kill switch + hoàn tác.** Chat / rule của Madgicx ghi thẳng lên Meta.
- **Quản lý nhiều khách theo vai trò** + link báo cáo công khai có kiểm toàn vẹn. Madgicx không có cổng khách / phân
  quyền theo khách.
- **VND, PayOS, tiếng Việt, không tự trừ thẻ khi hết dùng thử.**

**Cơ hội** (xếp theo giá trị / công sức với agency VN; cần PM chọn và viết PRD / ADR):

| # | Ý tưởng | Lấy cảm hứng từ | Ghi chú cho AdxLens |
|---|---|---|---|
| 1 | **Đề xuất kèm "nếu đã làm thì tiết kiệm được bao nhiêu trong 30 ngày"** + ngưỡng lấy từ dữ liệu, có "Vì sao giá trị này?" | AI Marketer | Ta đã có backtest cho rule P2b → đưa con số này vào Việc tuần này / rule mẫu; số do code tính. |
| 2 | **Alert người dùng tự đặt** + **gợi ý ngưỡng từ dữ liệu 30 ngày**, tạo 1 click | Workspace Alerts | Dựng trên notification + anomaly (A5); công sức thấp. |
| 3 | **Phân loại chi tiêu theo giai đoạn phễu** (Prospecting / Re-engagement / Retargeting / Retention) ở dashboard và báo cáo | 360° Meta Dashboard | Suy từ targeting (custom audience / lookalike / broad); khách agency rất hay hỏi. |
| 4 | **Ma trận 4 góc cho creative và chữ quảng cáo** (Getting started / Overspend / Scalable / Core) + phân tích **emoji / độ dài / link** | Creative & Ad Copy Insights | Nâng creative library P1; số liệu đã có. |
| 5 | **"Wasted spend"** (chi ở vùng / nhóm chưa có kết quả) + "potential uplift" | Geo & Demo | Thêm vào finding nhóm `waste`; breakdown A4 đã có vùng / tuổi / giới tính. |
| 6 | **Biểu đồ "quảng cáo có mệt không"** (tần suất × CPC / CPA, 4 góc) | Scale | Bổ sung finding `creative_fatigue`. |
| 7 | **Sparkline + % trong từng ô**, cột **"Thay đổi gần nhất"** cạnh mỗi đối tượng, **preset bộ lọc lưu được** | Ads Manager mới / 2.0 | Nâng bảng G1; nhật ký hành động đã có. |
| 8 | **Thư viện tactic tự động đầy đủ hơn**: stop-loss không click, pause trong ngày + bật lại 00:00, **Revive**, **Sunsetting** nhiều bước, lịch theo giờ trong tuần | Automation | P2b đã có rule + guardrails; thêm mẫu là nhỏ, giữ nguyên lớp duyệt / kill switch. |
| 9 | **Phễu** theo **landing page** | Funnels, Top landing pages | Cần URL đích từ creative. |
| 10 | **Điểm sức khỏe Meta / Event Match Quality**, cảnh báo tracking | Account health | Chỉ đọc. |
| 11 | **Đề xuất gốc của Meta** hiện cạnh vấn đề của ta | Needs attention | Chỉ đọc, ghi rõ "Từ Meta". |
| 12 | **"Hỏi AdxLens"** + **chọn đối tượng / kỳ trong bảng làm ngữ cảnh** | Agents, roadmap chat | Đề xuất AI "C"; thao tác ghi vẫn qua duyệt. |
| 13 | **MCP server chỉ đọc cho AdxLens**, theo quyền workspace | MCP Hub | Hợp xu hướng và chính sách Meta (không tự điều khiển trình duyệt). |
| 14 | **Nhật ký thay đổi → nối với biến động hiệu suất** ("trong kỳ đã đổi gì") | Activity Performance Analyzer | Hợp "Vì sao CPA tăng?". |
| 15 | **Báo cáo theo template ngành** (E-commerce / Lead gen), builder widget + goal tracker | One-Click Report | Đã có báo cáo + lịch + thương hiệu. |
| 16 | **Business metrics khi nối Shopify / web** (MER, CAC, AOV, LTV) | Business Dashboard | Cần nguồn ngoài Meta → ADR. |
| 17 | **Tạo quảng cáo / AI ad generator / audience launcher / audience mixer** | Creatives, Launchers | Hành động ghi mới → ADR; để sau. |

**Bài học về trải nghiệm:**
- Ô hỏi AI nổi trên mọi trang.
- Đề xuất có **con số tiền tiết kiệm** và **lý do cho từng ngưỡng**.
- Độ phủ dữ liệu ngay trên KPI.
- Preset bộ lọc lưu được.
- **Tránh:** paywall bật lên khi bấm đề xuất; trừ thẻ tự động.

## 5. Kết nối và onboarding (PM cung cấp, 24/10/2026)

### 5.1 Quyền Meta xin ngay lần kết nối đầu (một lần, gộp tất cả)
- **Quảng cáo:** quản lý quảng cáo (ghi) + đọc quảng cáo và số liệu.
- **Doanh nghiệp:** quản lý Business (chọn Business cụ thể); quản lý **danh mục sản phẩm** (catalog).
- **Page** (chọn từng Page):
  - tạo / quản lý nội dung, quản lý bình luận;
  - đọc nội dung Page, đọc nội dung người dùng đăng;
  - tạo / quản lý quảng cáo cho Page;
  - danh sách Page;
  - **đọc lead từ form quảng cáo**.
- **Instagram:** hồ sơ và bài đăng.
- **Sau khi nhập thẻ thanh toán:** bắt chấp nhận **Meta Terms** để chat được thay đổi tài khoản (bật / tắt, ngân sách,
  audience): Meta Business Tools Terms + **Customer List Custom Audiences Terms** (mở trên Facebook).

### 5.2 Onboarding sau khi kết nối
1. **Mục tiêu tối ưu chính** (vd. ROAS). Bên cạnh là **giá trị thực tế của chỉ số đó** (hôm qua / 3 ngày / 7 ngày;
   toàn tài khoản và riêng prospecting) để đặt mục tiêu sát thực tế.
2. **Chỉ số thứ 2 và thứ 3** (vd. Cost per add to cart, Cost per purchase), kèm khoảng giá trị 30 ngày. Dùng cho
   dashboard / widget.
3. **Xác nhận tài sản:** **ngành + ngành con** (vd. Hospitality Services › Hotel Resort Accommodations), Page mặc định,
   Instagram mặc định, Pixel mặc định.

### 5.3 Đối chiếu với AdxLens

| | Madgicx | AdxLens hiện tại | Nhận xét |
|---|---|---|---|
| Quyền lúc kết nối | Xin rộng ngay từ đầu: ghi quảng cáo, Page (nội dung, bình luận, lead), Instagram, catalog | Chỉ `ads_read` + `business_management`; `ads_management` chỉ xin khi nâng cấp quyền ghi (P201) | Giữ cách của ta: màn xin quyền ghi rõ "chỉ đọc" (PRD P0-03), App Review dễ hơn, khách agency yên tâm hơn. Đây là điểm bán hàng nên nói rõ. |
| Điều khoản Meta | Bắt chấp nhận Custom Audiences Terms để chat thao tác | Chưa cần (chưa làm audience) | Chỉ cần khi làm tính năng audience. |
| Mục tiêu KPI | Hỏi ngay ở onboarding, **gợi ý bằng số thực tế** | **Chưa có.** Rule audit / health / gợi ý dùng trung bình tài khoản; báo cáo hiện bộ KPI cố định | **Khoảng trống lớn nhất.** |
| Ngành | Ngành + ngành con | Chưa có | Nền cho so sánh với ngành sau này (cần dữ liệu đủ lớn, ẩn danh). |
| Page / IG / Pixel mặc định | Chọn khi onboarding | Không cần (chưa tạo quảng cáo) | Chỉ cần khi làm tạo quảng cáo / tracking. |

### 5.4 Cơ hội rút ra
- **Mục tiêu KPI theo Client** (ưu tiên cao): khi gán tài khoản cho Client (S05) hoặc trong Cài đặt khách, chọn chỉ số
  chính (CPA / ROAS / CPL / CPM…) + mục tiêu, **gợi ý bằng giá trị thực tế** hôm qua / 7 ngày / 30 ngày (số do code tính).
  Mục tiêu này dùng cho:
  - KPI đầu báo cáo và trang Client, hiện **so với mục tiêu**;
  - ngưỡng của finding / gợi ý / rule mẫu thay cho trung bình tài khoản;
  - "Khách cần chú ý" khi lệch mục tiêu;
  - câu "Vì sao CPA tăng?" khi vượt mục tiêu.
  - Nằm trong core (tenancy / reporting), không đụng quyền Meta.
- **Chỉ số phụ 2–3 theo Client** → bộ cột / KPI mặc định của bảng và báo cáo khách đó.
- **Ngành / ngành con theo Client** → template báo cáo theo ngành (lead gen / e-commerce / dịch vụ); về sau là benchmark
  ẩn danh.
- **Không** học cách xin quyền rộng ngay lần đầu.

## 6. Ảnh chụp

Khoảng 70 ảnh chụp giao diện lưu tạm trong thư mục scratchpad của phiên ngày 24/10/2026 (không commit vì chứa dữ liệu tài
khoản quảng cáo thật). Cần ảnh nào cho PRD thì chụp lại.
