# PRD: AdxLens — Báo cáo & Ads Intelligence cho Agency (Meta Ads)

| | |
|---|---|
| **Tên sản phẩm** | AdxLens (tạm, chưa kiểm tra thương hiệu/tên miền) |
| **Phiên bản** | 0.5 |
| **Ngày** | 22/10/2026 |
| **Chủ sở hữu** | PM |
| **Trạng thái** | Draft để review |
| **Tài liệu liên quan** | Phân tích sản phẩm AdxLens theo khung Du Quân (22/10/2026); Kiến trúc L1, L2, L3; `CLAUDE.md`; UX requirements; Sitemap & 12 user flow (Penpot, trang "Sitemap & Flows") |
| **Thay đổi v0.5** | Bổ sung yêu cầu phát hiện khi rà sitemap và luồng: P0-21 → P0-25, ân hạn gói, quyết định Gate 1, quyết định cho PM vượt checklist có ghi lý do |

---

## 1. Tóm tắt

AdxLens giúp agency **gửi khách báo cáo quảng cáo Meta có bằng chứng trong vài phút**: số liệu khớp Ads Manager, chỉ ra tiền đang rò ở đâu, mang thương hiệu của agency. Sau đó sản phẩm leo dần theo thang tin cậy: **đọc → gợi ý → hành động có duyệt → tự chạy có phanh**.

- **Khách hàng đầu tiên:** agency tại Việt Nam/SEA; sản phẩm thiết kế sẵn cho thị trường toàn cầu.
- **Người mua:** chủ agency và account manager. **Người dùng hằng ngày:** media buyer.
- **Đội ngũ:** 2 người (PM + marketing) và **Claude Code viết toàn bộ code**. Thuê dev part-time sau khi có khách trả phí để bảo trì và phát triển tiếp.
- **Cách xây và phát hành:** xây toàn bộ tính năng P0 → P2b trong một lượt, mỗi giai đoạn nằm sau **cờ tính năng (feature flag)**. **PM chủ động quyết định bật** cho từng workspace dựa trên exit criteria và checklist phát hành (mục 6.1).
- **Song song:** 3 tuần kiểm chứng (V0) chạy cùng lúc với việc xây. Kết quả V0 quyết định có bật P0 cho khách hay không và cần sửa gì.

---

## 2. Bối cảnh & cơ hội

### 2.1 Thị trường

| Hướng | Đại diện | Điểm mạnh | Khoảng trống |
|---|---|---|---|
| AI-first, gộp automation + creative + analytics | Madgicx | Một gói, AI gợi ý việc cần làm | Chủ yếu Meta; giá không công khai; review phàn nàn về hỗ trợ và độ tin cậy khi AI thực thi |
| Rule-based automation | Bïrch (ex-Revealbot) | Minh bạch, kiểm soát, đa kênh | Phải tự viết rule; không có AI creative |
| Enterprise | Smartly | Đa kênh, creative theo template | Báo giá theo yêu cầu, nặng cho đội nhỏ |
| Attribution | Triple Whale | Dữ liệu doanh thu/LTV | Không điều hành campaign; chủ yếu Shopify |
| Creative theo feed | Hunch | DPA/catalog động | Hẹp kênh, giá cao |

### 2.2 Cơ hội
Agency nhỏ quản lý nhiều tài khoản cho nhiều khách. Nỗi đau trả tiền được nhất nằm ở **mối quan hệ agency–khách**:
1. Phải chứng minh cho khách tiền ads đi đâu, đang tốt hay xấu, agency đã làm gì.
2. Làm báo cáo tốn giờ và chất lượng không đồng đều giữa các media buyer.
3. Sợ bỏ sót vấn đề trước khi khách phát hiện.

### 2.3 Luận điểm sản phẩm
> Agency trả tiền cho công cụ giúp họ trông giỏi và đáng tin trước khách. Họ chỉ cho công cụ làm thay khi nó đã chứng minh là đúng.

- **Báo cáo là sản phẩm; audit là nội dung của báo cáo.**
- **Độ chính xác số liệu là điều kiện sống còn:** một báo cáo sai trước khách thiệt hại hơn nhiều so với vài giờ tiết kiệm được.

---

## 3. Mục tiêu & phạm vi

### 3.1 Mục tiêu
1. Agency gửi được báo cáo có bằng chứng cho khách thật trong **≤ 10 phút** sau khi kết nối.
2. Số liệu báo cáo **lệch ≤ 1%** so với Ads Manager.
3. AdxLens trở thành một phần của **chu kỳ báo cáo định kỳ** của agency.
4. Xây niềm tin để người dùng cho phép **hành động có duyệt**, rồi mới tự động hóa có giới hạn.
5. Giá **công khai, theo tài khoản đang hoạt động**, không tính % ad spend.

### 3.2 Không làm
- Tự xây attribution/tracking (chỉ tích hợp hoặc đối tác).
- Phục vụ enterprise (SSO, duyệt đa tầng, brand governance).
- Thay thế Meta Ads Manager.
- Tạo creative hàng loạt làm sản phẩm mở đường.
- Đa kênh trước P3 (kể cả TikTok).
- Xếp hạng hay giám sát hiệu suất cá nhân media buyer.
- Dùng dữ liệu của khách ngoài mục đích phục vụ chính agency đó khi chưa có cơ sở đồng ý.

---

## 4. Người dùng

| Mã | Phân khúc | Vai trò | Hiệu số giá trị ở P0 (ước lượng) |
|---|---|---|---|
| **S2** | **Người chứng minh** — chủ agency, account manager | **Persona chính:** mua, tạo và gửi báo cáo | +5 |
| **S1** | **Người chữa cháy** — media buyer | Người dùng hằng ngày; kéo vào từ P1 | −3 ở P0, khoảng 0 sau P1 |
| — | Khách của agency (brand, shop) | Xem báo cáo qua link; chủ sở hữu dữ liệu | — |
| **S3** | **Người tự chạy** — chủ shop | Hoãn tới P3 | Chưa chấm |

### 4.1 S2 — Người chứng minh (persona chính)
- **Ngữ cảnh:** cuối tháng gửi báo cáo; khách hỏi "sao CPA tăng?"; trước họp khách; pitch khách mới; lo chất lượng không đồng đều giữa các media buyer.
- **Động lực:** giữ khách, thắng pitch, trông chuyên nghiệp, nhận thêm khách mà không cần tuyển thêm senior.
- **Thiên kiến:** sợ mất mát — một báo cáo sai trước khách là thiệt hại lớn.
- **Cần:** báo cáo có thương hiệu, có bằng chứng, khớp số liệu; tổng quan các khách; chuẩn kiểm tra chung.

### 4.2 S1 — Người chữa cháy
- **Ngữ cảnh:** sáng thứ Hai với nhiều tài khoản; khi creative mệt; khi có sự cố.
- **Động lực:** tiết kiệm giờ, không bị khách trách. Không muốn bị giám sát.
- **Thiên kiến:** quen tay với Ads Manager, tin kinh nghiệm riêng hơn công cụ.
- **Định khung:** "giúp bạn không bỏ sót và trông giỏi trước khách".

### 4.3 Khách của agency
- Mở báo cáo qua link, không cần tài khoản.
- Không ký hợp đồng với AdxLens nhưng là chủ dữ liệu.
- Là kênh lan truyền qua nhãn "Powered by AdxLens".

### 4.4 Design partners
- 3–5 agency tại Việt Nam/SEA, đã có nhu cầu.
- Bài học từ nhóm này cần được kiểm tra lại trước khi áp dụng cho thị trường khác.

---

## 5. Nguyên tắc sản phẩm

1. **Số liệu lệch ≤ 1% so với Ads Manager, hoặc giải thích được chênh lệch.**
2. **Chỉ đọc trước, ghi sau.** Quyền ghi chỉ từ P2 và chỉ khi người dùng chọn.
3. **Mọi phát hiện có bằng chứng** (số liệu, khoảng thời gian, quy tắc đã kích hoạt) và nút mở đúng đối tượng trong Ads Manager.
4. **Ước lượng trung thực.** "Tiền lãng phí ước tính" luôn ghi rõ là ước tính và cách tính.
5. **Báo cáo là sản phẩm, audit là nội dung.**
6. **Không giám sát cá nhân.** Tổng quan chỉ ở mức khách và tài khoản.
7. **Dữ liệu thuộc về khách của agency.**
8. **Agency-native:** multi-client, thương hiệu riêng, phân quyền theo khách ngay từ đầu.
9. **Giá công khai.**
10. **Hỗ trợ là một phần sản phẩm**, ưu tiên cao nhất cho sự cố số liệu.

---

## 6. Roadmap

Roadmap tách thành hai trục: **xây** (Claude Code làm một lượt cho P0 → P2b) và **phát hành** (PM bật cờ tính năng cho từng workspace khi đủ điều kiện).

| Giai đoạn | Tên | Xây | Phát hành cho khách (dự kiến) | Câu hỏi cần trả lời khi phát hành | Quyền Meta |
|---|---|---|---|---|---|
| **V0** | Kiểm chứng | Spike E4 trong tuần 0–3 | Không phát hành; chạy với design partner | Dữ liệu đủ, số liệu khớp, agency gửi báo cáo cho khách thật và sẵn sàng trả tiền? | Đọc (chế độ phát triển) |
| **P0** | Báo cáo có bằng chứng | Lượt xây chính | Sau exit V0 (khoảng tuần 3–11) | Agency dùng AdxLens trong chu kỳ báo cáo thật? | Đọc |
| **P1** | Creative insight + Weekly Action List | Lượt xây chính | Sau exit P0 (khoảng tháng 3–5) | Media buyer làm theo gợi ý hằng tuần? Agency trả phí? | Đọc |
| **P2a** | Hành động có duyệt (duyệt 1 click) | Lượt xây chính; chạy thật trên staging với tài khoản Meta test | Sau exit P1 và khi Meta đã duyệt quyền ghi | Người dùng tin giao cho hệ thống thực thi khi có duyệt? | Đọc + Ghi |
| **P2b** | Tự chạy có phanh | Lượt xây chính; chạy shadow mode trên staging | Sau exit P2a | Người dùng tin để hệ thống tự chạy trong giới hạn? | Đọc + Ghi |
| **P3** | Mở rộng | Không nằm trong lượt xây | Sau P2 | Mở rộng hướng nào trước? | Tùy |

```
XÂY (một lượt, Claude Code)       PHÁT HÀNH (PM bật cờ theo workspace)
V0  Spike Meta API ──────────────► chạy với design partner
P0  Báo cáo + đối chiếu ─────────► sau exit V0
P1  Creative + Action List ──────► sau exit P0
P2a Duyệt 1 click ───────────────► sau exit P1 + Meta duyệt quyền ghi
P2b Rule + guardrails + shadow ──► sau exit P2a
P3  (không xây trong lượt này)
```

**Quy tắc phát hành:** cờ của một giai đoạn chỉ bật khi giai đoạn trước đạt exit criteria, dù code đã sẵn sàng. Mốc thời gian phát hành là kế hoạch tham vọng và cần buffer cho Meta App Review.

### 6.1 Checklist phát hành (PM quyết định bật cờ)

Mỗi cờ có checklist riêng. PM là người quyết định và ghi lại quyết định (ngày, workspace, lý do) trong nhật ký phát hành.

| Cờ | Điều kiện kỹ thuật (hệ thống kiểm tra được) | Điều kiện sản phẩm (PM xác nhận) |
|---|---|---|
| `p0_reports` | CI xanh; test đối chiếu đạt; số liệu lệch ≤ 1% trên tài khoản design partner; runbook số liệu lệch sẵn sàng | Exit V0 đạt (mục 8.4) |
| `p1_recommendations` | CI xanh; test rule và xếp hạng đạt; thanh toán chạy trên staging | Exit P0 đạt (mục 9.7) |
| `p2a_approve` | Meta đã duyệt `ads_management`; mọi `action_type` đã chạy thành công trên staging với tài khoản test; test idempotency, undo, kill switch, circuit breaker đạt | Exit P1 đạt (mục 10.6); bắt đầu với 1–2 agency thân thiết, trần ngân sách thấp |
| `p2b_auto` | Shadow mode chạy ≥ 14 ngày trên tài khoản của workspace đó, không có hành động "sẽ làm" nào bị đánh giá sai | Exit P2a đạt (mục 11.7) |

**Vượt checklist (PM chốt 22/10/2026):** PM được bật cờ khi checklist kỹ thuật chưa đạt, với điều kiện nhập lý do; quyết định ghi vào nhật ký phát hành (luồng F7).

**Khuyến nghị (không bắt buộc):** trước khi bật `p2a_approve` cho khách đầu tiên, nhờ một người kỹ thuật bên ngoài review Execution Gateway (thuê theo giờ), vì toàn bộ code do AI viết và review.

---

## 7. Yêu cầu nền tảng

### 7.1 Kiến trúc & dữ liệu
- **Nguồn:** Meta Marketing API (insights, campaign, ad set, ad, creative).
- **Mô hình:** Workspace (agency) → Client → Ad Account → Campaign → Ad Set → Ad → Creative; Insights lưu snapshot theo ngày.
- **Pipeline:** backfill 90 ngày khi kết nối (hiển thị kết quả một phần sớm), đồng bộ định kỳ.
- **Insight engine:** tách *phát hiện* → *giải thích* → *đề xuất* để P2 tái dùng.
- **LLM:** chỉ để diễn giải bằng ngôn ngữ tự nhiên; số liệu luôn đến từ truy vấn dữ liệu.

### 7.2 Đối chiếu số liệu
- Dùng cùng định nghĩa chỉ số, cửa sổ attribution và múi giờ với Ads Manager của từng tài khoản.
- Mỗi báo cáo hiển thị: cửa sổ attribution, múi giờ, tiền tệ, thời điểm đồng bộ cuối.
- Kiểm tra tự động spend và kết quả theo ngày; **cảnh báo nội bộ khi lệch > 1%**.

### 7.3 Multi-tenancy
- Workspace nhiều thành viên; phân quyền theo Client.
- Mỗi ad account thuộc một Client. **Mọi gán Client phải được người dùng xác nhận trước khi báo cáo được chia sẻ.**

### 7.4 Bảo mật & quyền dữ liệu
- Mã hóa token khi lưu; không ghi log token.
- Chỉ xin quyền tối thiểu theo giai đoạn.
- Xóa token và dữ liệu khi ngắt kết nối, trong thời hạn cam kết.
- Điều khoản và DPA mẫu: AdxLens xử lý dữ liệu thay mặt agency, không dùng cho mục đích khác khi chưa có đồng ý rõ ràng.
- Link báo cáo: token khó đoán, thu hồi được, hạn dùng tùy chọn.
- Cần tư vấn pháp lý về quy định bảo vệ dữ liệu cá nhân của Việt Nam và các thị trường SEA trước khi ra mắt, và về GDPR/CCPA trước khi mở rộng sang Mỹ/châu Âu.

### 7.5 Bản địa hóa
- **Giao diện và báo cáo hỗ trợ tiếng Việt và tiếng Anh ngay từ P0**; chuỗi tách khỏi code để thêm ngôn ngữ khác.
- Đa tiền tệ (gồm VND) và múi giờ theo từng ad account.
- Định dạng số và ngày theo locale của người xem báo cáo.

### 7.6 Hiệu năng & độ tin cậy
- Xử lý rate limit bằng hàng đợi và retry có backoff; hiển thị "đang đồng bộ" thay vì báo lỗi.
- Báo cáo đầu tiên trong ≤ 10 phút — đây là ngưỡng đủ, không tối ưu thêm khi đã đạt.

### 7.7 Instrumentation
Ghi sự kiện: kết nối tài khoản, xác nhận gán Client, tạo/chia sẻ/gửi báo cáo, báo cáo được khách mở, gỡ nhãn "Powered by", mở Ads Manager từ phát hiện, đánh dấu phát hiện/gợi ý, đăng ký từ link báo cáo, bật/tắt cờ tính năng.

### 7.8 Cờ tính năng & phát hành
- Mỗi giai đoạn sau P0 nằm sau một cờ (`p1_recommendations`, `p2a_approve`, `p2b_auto`); P0 cũng có cờ `p0_reports` để chỉ bật cho design partner trong V0.
- Cờ bật **theo workspace**; mặc định tắt. Chỉ PM có quyền bật/tắt, qua trang quản trị nội bộ; mọi thay đổi ghi nhật ký (ai, khi nào, workspace, lý do).
- Tắt cờ phải an toàn: dữ liệu và cấu hình của tính năng được giữ nguyên, chỉ ẩn khỏi người dùng và dừng job liên quan.
- Tắt `p2a_approve` hoặc `p2b_auto` tương đương kill switch cho workspace đó.

### 7.9 Vận hành tự động
Vì không có người trực kỹ thuật toàn thời gian, hệ thống phải tự xử lý các lỗi thường gặp:
- **Tự phát hiện:** cảnh báo lỗi, uptime, backlog job, số liệu lệch, token sắp hết hạn, chi phí vượt ngưỡng.
- **Tự khắc phục theo kịch bản cố định:** retry, chạy lại đối chiếu, giảm tốc khi Meta rate limit, làm mới token, restart worker treo, rollback deploy lỗi, tự tắt rule hoặc tài khoản khi thực thi lỗi liên tiếp.
- **Agent chẩn đoán:** lỗi code mới được Claude Code phân tích và đề xuất bản sửa dưới dạng PR; PM duyệt trước khi merge. Agent không có quyền truy cập dữ liệu hay bí mật ở production.

---

## 8. V0 — Kiểm chứng (tuần 0–3)

### 8.1 Mục tiêu
Kiểm chứng bốn giả định then chốt (G1–G4, mục 15) song song với lượt xây. Nếu V0 thất bại, code đã xây vẫn tắt cờ và được sửa theo kết quả trước khi phát hành.

### 8.2 Thí nghiệm

| Mã | Thí nghiệm | Người làm | Giả định | Thành công | Thất bại |
|---|---|---|---|---|---|
| E4 | Spike Meta API: app ở chế độ phát triển, 3 tài khoản thật; kiểm 9 nhóm quy tắc có dữ liệu không; đối chiếu số liệu; đọc điều kiện App Review chính thức | PM | G4 | ≥ 6/9 nhóm quy tắc có dữ liệu; lệch ≤ 1% | < 4/9 nhóm có dữ liệu, hoặc lệch > 1% không giải thích được |
| E3 | Phỏng vấn 10 chủ agency: số giờ kiểm tra và báo cáo, công thức hoà vốn, mức giá theo tài khoản | Marketing | G1, G8 | ≥ 6/10 chọn mức ≥ ngưỡng hoà vốn; ≥ 3 sẵn sàng đặt cọc | < 3/10 chấp nhận mức giá nào |
| E1 | Audit concierge cho 5 agency trên tài khoản thật (có đồng ý của agency và khách); đội AdxLens kiểm tay rồi gửi; hỏi về nhãn "Powered by" | PM + Marketing | G2, G3 | ≥ 3/5 agency gửi báo cáo cho khách thật; ≥ 70% phát hiện được đánh giá hợp lý | < 2/5 gửi cho khách, hoặc > 30% phát hiện bị đánh giá sai |
| E2 | Trang đích với báo cáo mẫu và đăng ký chờ, gửi 30–50 agency | Marketing | G1 | ≥ 15% để lại email; ≥ 5 đặt lịch trao đổi | < 5% để lại email |
| E5 | 3 agency dùng audit trong 3 buổi pitch khách mới (khách tiềm năng đồng ý cấp quyền đọc) | Marketing | Tầng Bất ngờ | ≥ 2/3 nói audit cải thiện pitch; ≥ 1 tiến tới hợp đồng | Không agency nào dùng lại |

**Thứ tự:** E4 và E3 chạy song song ngay → E1 khi E4 cho thấy dữ liệu đủ → E2 và E5 khi đã có báo cáo mẫu thật. E5 có thể kéo sang P0.

### 8.3 Việc song song
- Khởi động Meta App Review và Business Verification ngay tuần đầu.
- Soạn bản nháp trang bảo mật, điều khoản và DPA.

### 8.4 Exit criteria
- **Đạt:** E4 đạt; ít nhất 3 agency gửi báo cáo cho khách thật (E1); có tín hiệu trả tiền và mức giá ứng viên (E3).
- **E4 thất bại:** thu hẹp bộ quy tắc về các nhóm có dữ liệu, hoặc dừng để xem lại hướng sản phẩm.
- **E1 hoặc E3 thất bại:** không xây P0; quay lại phỏng vấn tìm nỗi đau khác.

---

## 9. P0 — Báo cáo có bằng chứng

### 9.1 Mục tiêu
S2 gửi được báo cáo có bằng chứng, khớp số liệu, mang thương hiệu agency cho khách thật trong vài phút sau khi kết nối.

### 9.2 User stories
- Là chủ agency, tôi xem demo trên tài khoản mẫu trước khi kết nối dữ liệu của khách.
- Là account manager, tôi kết nối nhiều tài khoản một lần, xác nhận gán từng tài khoản vào đúng khách, và có báo cáo đầu tiên trong vài phút.
- Là account manager, tôi gửi khách báo cáo có logo agency giải thích tiền đi đâu, có vấn đề gì, đã và sẽ làm gì — với số liệu khớp Ads Manager.
- Là chủ agency, tôi xem sức khỏe tất cả khách và tài khoản trong một màn hình.
- Là media buyer, tôi thấy vấn đề xếp theo tác động, mỗi vấn đề có bằng chứng và nút mở đúng chỗ trong Ads Manager.
- Là khách của agency, tôi mở link báo cáo mà không cần đăng ký.

### 9.3 Yêu cầu chức năng

**Thiết lập**

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P0-01 | Đăng ký/đăng nhập, tạo Workspace, mời thành viên | must |
| P0-02 | Demo trên tài khoản mẫu trước khi kết nối (ghi rõ là dữ liệu mẫu) | must |
| P0-03 | Kết nối ad account qua Meta OAuth; chọn nhiều tài khoản. **Đổi theo ADR-0016 (24/10/2026):** xin bộ quyền rộng một lần (chỉ `ads_read` bắt buộc); màn xin quyền nói rõ từng nhóm quyền dùng để làm gì và "AdxLens không tự thay đổi quảng cáo — ghi cần bật quyền ghi và duyệt" | must |
| P0-04 | Gợi ý gán tài khoản vào Client; người dùng xác nhận từng gán; tạo/sửa/xóa Client | must |
| P0-05 | Backfill 90 ngày, đồng bộ hằng ngày; hiển thị trạng thái và thời điểm cập nhật cuối | must |

**Audit**

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P0-06 | Audit engine theo bộ quy tắc ở 9.4 (chỉ các nhóm E4 xác nhận có dữ liệu). Mỗi phát hiện gồm loại, đối tượng, bằng chứng, mức độ, tác động ước tính, cách tính | must |
| P0-07 | Health score đơn giản, hiển thị các thành phần cấu thành | must |
| P0-08 | Danh sách phát hiện theo tài khoản, xếp theo tác động; lọc theo mức độ, loại, campaign | must |
| P0-09 | Chi tiết phát hiện: xu hướng, bằng chứng, vì sao là vấn đề, có thể làm gì, nút mở đúng đối tượng trong Ads Manager | must |
| P0-10 | Đánh dấu phát hiện: Mới / Đã xem / Đã làm / Bỏ qua (kèm lý do, có lựa chọn "sai") | must |
| P0-11 | Tổng quan agency ở mức Client và tài khoản: health score, số vấn đề mức cao, chi tiêu 7/30 ngày. Không thống kê theo media buyer | must |

**Báo cáo**

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P0-12 | Mẫu báo cáo mặc định dùng được ngay; thương hiệu cơ bản (logo, màu, tên agency); tiếng Việt và tiếng Anh | must |
| P0-13 | Đối chiếu số liệu trên báo cáo: "khớp Meta tính đến [thời điểm]", cửa sổ attribution, múi giờ, tiền tệ | must |
| P0-14 | Chia sẻ qua link công khai (token, thu hồi được, hạn dùng tùy chọn) và xuất PDF. Không chia sẻ được khi gán Client chưa xác nhận | must |
| P0-15 | Nhãn "Powered by AdxLens" nhỏ ở cuối báo cáo và trang chia sẻ, có link; gỡ được ở gói trả phí cao | must |
| P0-16 | Tóm tắt bằng LLM ở đầu báo cáo; mọi con số khớp dữ liệu | should |
| P0-17 | Lịch gửi báo cáo cho khách theo tuần/tháng (link hoặc PDF qua email) | should |
| P0-18 | Chế độ "báo cáo pitch" cho tài khoản của khách tiềm năng, kèm ghi chú về đồng ý cấp quyền — chỉ làm nếu E5 đạt | could |

**Giữ chân & hỗ trợ**

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P0-19 | Digest hằng tuần qua email: thay đổi sức khỏe tài khoản, vấn đề mới, nhắc lịch báo cáo khách | must |
| P0-20 | Chat hỗ trợ trong app và kênh liên hệ trực tiếp cho design partner | must |
| P0-21 | Theo dõi token Meta: tự làm mới khi sắp hết hạn; khi hết hạn hiện banner toàn app, email và nút kết nối lại; tài khoản mất quyền hiện trạng thái "mất quyền truy cập" kèm hướng dẫn; kết nối lại thì đồng bộ bù phần thiếu | must |
| P0-22 | Ngắt kết nối: thu hồi token, khóa link báo cáo liên quan, xóa dữ liệu trong thời hạn cam kết và gửi xác nhận; hỗ trợ yêu cầu xóa dữ liệu từ Meta (data deletion callback) và trang hướng dẫn xóa dữ liệu | must |
| P0-23 | Nút "Báo số liệu lệch" ở mọi khối số: gửi kèm tài khoản, ngày, chỉ số, giá trị hai bên; chạy lại đối chiếu ngay; nếu lệch > 1% thì khóa chia sẻ báo cáo liên quan và mở ticket ưu tiên cao | must |
| P0-24 | Báo cáo theo lịch (P0-17) bị hoãn tự động khi đối chiếu lệch > 1% hoặc có gán Client chưa xác nhận; báo account manager kèm lý do | must |
| P0-25 | Trung tâm thông báo trong app (đồng bộ xong, token, báo cáo đã gửi/đã xem, lỗi); cùng nội dung với email | should |

### 9.4 Bộ quy tắc audit v1

| Nhóm | Phát hiện | Tín hiệu |
|---|---|---|
| Creative fatigue | Ad bị mệt | Tần suất tăng, CTR/ROAS giảm trong cửa sổ so sánh |
| Phân bổ ngân sách | Chi tiêu dồn vào nơi hiệu quả thấp | Chi tiêu cao, CPA/ROAS kém đáng kể so với trung vị tài khoản |
| Ad thắng bị bỏ đói | Hiệu quả tốt nhưng ngân sách thấp | ROAS/CPA tốt, chi tiêu thấp, đủ dữ liệu |
| Phân mảnh | Quá nhiều ad set nhỏ | Nhiều ad set ngân sách thấp ở trạng thái học hạn chế |
| Learning limited | Không đủ sự kiện tối ưu | Trạng thái học từ API, số sự kiện thấp |
| Chi tiêu không chuyển đổi | Tiêu tiền không có kết quả | Chi tiêu vượt ngưỡng mà không có kết quả mục tiêu |
| Trùng lặp đối tượng | Đối tượng chồng lấn | Chỉ khi API có dữ liệu |
| Vệ sinh tài khoản | Đặt tên, trạng thái bất thường | Phân tích tên và trạng thái |
| Theo dõi chuyển đổi | Sự kiện bất thường | Sự kiện sụt giảm đột ngột (nếu đọc được) |

Mỗi quy tắc có ngưỡng cấu hình nội bộ, điều kiện đủ dữ liệu và cách ước tính tác động được ghi rõ. **Thà ít quy tắc chắc còn hơn nhiều quy tắc báo sai.**

### 9.5 Yêu cầu phi chức năng
- Chỉ quyền đọc.
- Số liệu lệch ≤ 1% so với Ads Manager.
- Trang báo cáo chia sẻ tải nhanh trên di động.

### 9.6 Metrics

| Chỉ số | Định nghĩa | Mục tiêu |
|---|---|---|
| Time-to-first-report | Từ kết nối đến báo cáo đầu tiên sẵn sàng gửi | ≤ 10 phút (trung vị) |
| Activation | % workspace kết nối và tạo báo cáo trong 24 giờ | ≥ 60% |
| Báo cáo gửi khách | Số báo cáo gửi người ngoài workspace, mỗi tài khoản mỗi tháng | ≥ 1 |
| Client view rate | % link báo cáo được người ngoài workspace mở | ≥ 50% |
| Độ khớp số liệu | % báo cáo không có cảnh báo lệch > 1% | ≥ 99% |
| Ticket "số liệu lệch" | Số ticket trên 100 báo cáo | Đặt mục tiêu sau V0 |
| Độ chính xác cảm nhận | % phát hiện bị đánh dấu "sai" | ≤ 20% |
| Đăng ký từ link báo cáo | Workspace mới đến từ nhãn "Powered by" | Theo dõi |
| Tỷ lệ gỡ nhãn | % workspace trả phí gỡ nhãn | Theo dõi |
| Sẵn sàng trả tiền | Design partner trả hoặc đặt cọc | ≥ 3/5 |

### 9.7 Exit criteria
- ≥ 5 agency dùng trong ít nhất 2 chu kỳ báo cáo khách liên tiếp.
- Độ khớp số liệu đạt mục tiêu; không có sự cố số liệu sai bị khách phát hiện.
- Tỷ lệ phát hiện "sai" ≤ 20%.
- Có thanh toán hoặc cam kết trả phí.

### 9.8 Ngoài phạm vi
Chỉnh sửa quảng cáo, phân tích creative chuyên sâu, kênh khác ngoài Meta, attribution, benchmark, thống kê theo media buyer.

### 9.9 Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Meta App Review kéo dài | Khởi động từ V0; chạy với design partner ở chế độ được phép trong lúc chờ (cần xác minh) |
| Số liệu lệch trước khách | Đối chiếu tự động, cảnh báo nội bộ, hỗ trợ ưu tiên |
| Gán sai Client làm lộ dữ liệu giữa các khách | Bắt buộc xác nhận trước khi chia sẻ |
| Audit chung chung | Chỉ giữ quy tắc đã chứng minh hữu ích ở E1 |

---

## 10. P1 — Creative insight + Weekly Action List

### 10.1 Mục tiêu
Kéo media buyer (S1) vào dùng hằng tuần bằng creative insight và danh sách việc cần làm, vẫn chỉ đọc. Bắt đầu thu phí rộng.

### 10.2 User stories
- Là media buyer, tôi thấy creative nào thắng, thua hay sắp mệt, theo từng mục tiêu.
- Là media buyer, tôi nhận danh sách việc nên làm tuần này, xếp theo tác động, và đánh dấu đã làm.
- Là media buyer, tôi biết chỉ số có cải thiện sau khi làm theo gợi ý không.
- Là account manager, tôi đưa insight creative và việc đã làm vào báo cáo khách.

### 10.3 Yêu cầu chức năng

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P1-01 | Creative library: thumbnail, định dạng, thời gian chạy, chỉ số; gom theo creative gốc | must |
| P1-02 | So sánh creative theo chỉ số, khoảng thời gian, mục tiêu | must |
| P1-03 | Phân loại creative: Winner / Cần theo dõi / Đang mệt / Thua, quy tắc minh bạch | must |
| P1-04 | Weekly Action List: hành động, bằng chứng, tác động ước tính, độ tin cậy, thời gian thực hiện; xếp theo tác động | must |
| P1-05 | Trạng thái từng việc (Đề xuất / Đang làm / Đã làm / Bỏ qua); gán cho thành viên | must |
| P1-06 | Giá và thanh toán công khai (mục 13.3); trang công thức hoà vốn | must |
| P1-07 | Dự báo creative sắp mệt dựa trên đà suy giảm (ghi rõ là dự báo) | should |
| P1-08 | Đo trước/sau khi làm theo gợi ý, ghi rõ giới hạn quy kết nhân quả | should |
| P1-09 | Digest hằng ngày/tuần cho media buyer qua email hoặc Slack | should |
| P1-10 | Báo cáo khách v2: gộp insight creative và việc đã làm; tùy chỉnh mẫu | should |
| P1-11 | Onboarding theo vai trò cho media buyer, không bắt cấu hình | should |

**Xếp hạng gợi ý:** điểm ưu tiên = tác động ước tính × độ tin cậy ÷ công sức. Ghi rõ độ tin cậy và lý do. Loại gợi ý hay bị bỏ qua vì "sai" sẽ giảm xếp hạng và được đưa vào rà soát quy tắc.

### 10.4 Yêu cầu phi chức năng
- Vẫn chỉ đọc; số liệu theo đối chiếu ở 7.2.
- Weekly Action List tạo vào giờ cố định theo múi giờ của agency.

### 10.5 Metrics

| Chỉ số | Mục tiêu |
|---|---|
| % gợi ý được đánh dấu "đã làm" | ≥ 30% |
| % gợi ý bị bỏ qua vì "sai" | ≤ 15% |
| Media buyer hoạt động hằng tuần mỗi workspace | ≥ 2 |
| Retention tuần 8 | ≥ 50% |
| Chuyển đổi trial → trả phí | ≥ 15% |
| Báo cáo gửi khách | ≥ 1 / tài khoản / tháng |

### 10.6 Exit criteria
- ≥ 15–20 agency trả phí hoặc cam kết trả phí.
- Tỷ lệ chấp nhận gợi ý và tỷ lệ "sai" đạt mục tiêu.
- Media buyer thật sự dùng hằng tuần, không chỉ chủ agency.
- Ít nhất vài khách chủ động hỏi về thực thi trực tiếp.

### 10.7 Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Tài khoản nhỏ thiếu dữ liệu | Trạng thái "chưa đủ dữ liệu" |
| Quy kết nhân quả sai | Ghi rõ giới hạn trong mọi so sánh trước/sau |
| Media buyer không dùng dù chủ đã mua | Đo media buyer hoạt động hằng tuần; phỏng vấn riêng nhóm này |

---

## 11. P2 — Hành động có duyệt, rồi tự chạy có phanh

### 11.1 Mục tiêu
Cho phép hệ thống thực thi thay đổi trên Meta an toàn, qua hai cổng:
- **P2a — duyệt 1 click:** cờ `p2a_approve`.
- **P2b — tự chạy trong giới hạn:** cờ `p2b_auto`, chỉ bật khi P2a đạt exit criteria.

Cả hai được xây trong lượt chính và chạy trên staging với tài khoản Meta test. PM quyết định bật cho khách theo checklist ở mục 6.1.

### 11.2 Nguyên tắc an toàn
1. **Bậc tự chủ** chọn theo từng loại hành động và từng tài khoản: Bậc 0 chỉ gợi ý; Bậc 1 duyệt 1 click; Bậc 2 tự chạy trong giới hạn.
2. **Guardrails cho Bậc 2:** giới hạn thay đổi ngân sách mỗi lần và mỗi ngày, ngưỡng dữ liệu tối thiểu, danh sách loại trừ, khung giờ, giới hạn số hành động.
3. **Dry-run** trước khi bật quy tắc.
4. **Hoàn tác** khi kỹ thuật cho phép; cảnh báo trước nếu không hoàn tác được.
5. **Kill switch** theo workspace, tài khoản, quy tắc.
6. **Không bao giờ** tự tăng ngân sách vượt trần người dùng đặt, hay tự bật lại quảng cáo đã tắt thủ công.

### 11.3 User stories
- Là media buyer, tôi duyệt "tạm dừng ad mệt" hoặc "chuyển ngân sách" bằng một click.
- Là chủ agency, tôi thấy mọi thay đổi hệ thống đã làm và tắt được ngay.
- *(P2b)* Là media buyer, tôi đặt quy tắc, xem thử nó sẽ làm gì, rồi để hệ thống chạy trong giới hạn.

### 11.4 Yêu cầu chức năng

**P2a — duyệt 1 click**

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P2-01 | Nâng cấp lên quyền ghi theo lựa chọn của người dùng; thu hồi được bất cứ lúc nào | must |
| P2-02 | Hành động v1: tạm dừng/bật ad hoặc ad set; điều chỉnh ngân sách trong giới hạn; nhân bản ad set nếu API cho phép | must |
| P2-03 | Duyệt 1 click: hiển thị chính xác thay đổi (trước/sau), xác nhận, thực thi, hiển thị kết quả | must |
| P2-04 | Phân quyền: chỉ vai trò được phép mới thực thi; theo Client | must |
| P2-05 | Action Log: ai, khi nào, thay đổi gì, vì sao, kết quả, trạng thái hoàn tác | must |
| P2-06 | Hoàn tác từng hành động hoặc cả lô khi có thể | must |
| P2-07 | Xác minh sau thực thi: đọc lại trạng thái từ Meta | must |
| P2-08 | Kill switch; tự tắt khi lỗi API lặp lại | must |
| P2-09 | Thông báo khi thực thi và khi lỗi | must |

**P2b — tự chạy có phanh**

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| P2-10 | Rule builder có hướng dẫn; mẫu dựng sẵn từ các gợi ý được chấp nhận nhiều ở P1 | must |
| P2-11 | Dry-run/backtest trên dữ liệu lịch sử | must |
| P2-12 | Guardrails theo 11.2 | must |
| P2-13 | Shadow mode N ngày trước khi thực thi thật | must |
| P2-14 | Báo cáo hiệu quả tự động hóa: số hành động, cải thiện ước tính, số lần hoàn tác | should |

### 11.5 Yêu cầu phi chức năng
- Không im lặng thất bại: mọi lỗi thực thi đều được phát hiện và thông báo.
- Idempotency khi retry; hàng đợi hành động có thứ tự.
- Kiểm thử trên tài khoản thử trước khi bật cho khách; rollout theo cờ tính năng, khách thân thiết trước.
- SLA nội bộ cho sự cố thực thi.

### 11.6 Metrics

| Chỉ số | Mục tiêu |
|---|---|
| % workspace trả phí dùng duyệt 1 click | ≥ 30% |
| Tỷ lệ hoàn tác | ≤ 5% |
| Sự cố nghiêm trọng | 0 |
| Lỗi thực thi không được phát hiện | 0 |
| Churn | Không tăng sau khi mở P2 |

### 11.7 Exit criteria
- **P2a → P2b:** 8–12 tuần duyệt 1 click chạy thật không có sự cố nghiêm trọng; tỷ lệ hoàn tác ≤ 5%; khách yêu cầu tự động hóa; shadow mode của workspace đó đạt (mục 6.1).
- **P2 → P3:** P2 ổn định; doanh thu định kỳ và retention chứng minh unit economics cơ bản.

### 11.8 Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Sự cố thực thi làm mất khách | Bắt đầu bằng duyệt 1 click; rollout từng đợt |
| Chính sách Meta về quyền ghi | Xác minh trước khi cam kết tính năng |
| Trách nhiệm pháp lý khi thực thi gây thiệt hại | Điều khoản rõ, giới hạn trách nhiệm, tư vấn pháp lý |

---

## 12. P3 — Mở rộng

### 12.1 Hướng ứng viên

| Hướng | Mô tả | Tín hiệu để chọn | Ưu tiên |
|---|---|---|---|
| Chủ shop tự chạy (S3) | Onboarding ≤ 5 phút, giá thấp, mặc định Bậc 0–1, ngôn ngữ đơn giản | Agency giới thiệu khách; nhu cầu từ shop nhỏ | Cao |
| TikTok | Dùng lại khung phát hiện/giải thích/đề xuất | Tỷ lệ agency chạy đa kênh | Trung bình–cao |
| White-label đầy đủ | Miền riêng, bỏ toàn bộ nhãn | Tỷ lệ gỡ nhãn cao ở P0–P1 | Trung bình |
| Tạo creative bằng AI | Brief và biến thể từ creative insight | Khách hỏi phải làm gì với creative mệt | Trung bình (add-on) |
| API/MCP mở | Agency tích hợp vào công cụ riêng, cùng cơ chế an toàn P2 | Agency kỹ thuật cao yêu cầu | Trung bình |
| Tracking/attribution | Tích hợp hoặc đối tác | Khách phàn nàn số liệu không khớp doanh thu | Thấp–trung bình |

Mỗi hướng cần mini-PRD riêng có giả thuyết, metric và tiêu chí dừng. Không mở rộng khi lõi chưa ổn định.

### 12.2 Backlog có điều kiện

| Tính năng | Lý do chưa làm | Điều kiện để xem lại |
|---|---|---|
| Benchmark ẩn danh | Dữ liệu thuộc về khách của agency, chưa có cơ sở đồng ý | Có tư vấn pháp lý, điều khoản đồng ý, đủ mẫu |
| Gắn thuộc tính creative bằng AI | Tầng "đủ dùng", dễ sai | Media buyer làm theo creative insight ở P1 |
| Chat hỏi dữ liệu | Chưa có bằng chứng nhu cầu | Khách yêu cầu lặp lại |

---

## 13. Go-to-market

### 13.1 Định vị
**"Báo cáo có bằng chứng gửi khách trong vài phút — số liệu khớp Meta, thương hiệu của bạn."**

- Bán cho S2 (chủ agency, account manager).
- Thông điệp cho S1 (media buyer): "không bỏ sót, trông giỏi trước khách".

### 13.2 Theo giai đoạn

| Giai đoạn | Hoạt động chính |
|---|---|
| V0 | Audit concierge với design partner; phỏng vấn giá; trang đích với báo cáo mẫu |
| P0 | Design partner dùng trong chu kỳ báo cáo thật; thu testimonial; nhãn "Powered by" làm kênh lan truyền; thử audit để pitch |
| P1 | Mở trial và công bố giá; nội dung giáo dục cho cộng đồng agency VN/SEA; giới thiệu agency-to-agency |
| P2 | Ra mắt duyệt 1 click cho khách thân thiết trước; nội dung minh bạch về an toàn |
| P3 | Chủ shop qua agency giới thiệu; mở rộng thị trường ngoài SEA |

### 13.3 Giá
- **Công khai, theo tài khoản đang hoạt động** = tài khoản có chi tiêu trong 30 ngày gần nhất.
- **Free:** 1 tài khoản, có nhãn "Powered by".
- **Trả phí:** bậc theo số tài khoản; gói cao gỡ nhãn và có white-label. Quyền ghi (P2) là gói cao hơn hoặc add-on.
- **Không tính % ad spend.**
- **Trang hoà vốn công khai:** giờ tiết kiệm mỗi tài khoản × giá giờ nội bộ so với phí.
- **Mức giá cụ thể (VND và USD) chốt sau E3.**
- **Ân hạn:** khi vượt hạn mức tài khoản hoặc thanh toán thất bại (`past_due`), dữ liệu vẫn đồng bộ trong thời gian ân hạn, kèm banner và email; hết ân hạn thì về Free vào cuối kỳ. Số ngày ân hạn PM chốt cùng mức giá.

### 13.4 Kênh phân phối
1. Design partner và khách quen.
2. Nhãn "Powered by AdxLens" trên báo cáo khách xem.
3. Audit để pitch, nếu E5 đạt.
4. Cộng đồng agency VN/SEA, nội dung giáo dục, mẫu báo cáo miễn phí.
5. Giới thiệu agency-to-agency.

### 13.5 Hỗ trợ
- Kênh trực tiếp cho design partner; ưu tiên cao nhất cho "số liệu lệch".
- Tài liệu và video onboarding ngắn bằng tiếng Việt và tiếng Anh.
- Status page từ P2.

---

## 14. Nguồn lực & rủi ro

### 14.1 Nguồn lực
- **PM:** sản phẩm; điều phối Claude Code; duyệt PR ở các thư mục quan trọng; quyết định bật cờ; trực sự cố; Meta App Review.
- **Claude Code:** viết toàn bộ code, test, tài liệu kỹ thuật; phiên review độc lập cho mỗi PR; chẩn đoán lỗi và đề xuất bản sửa. Làm việc theo quy ước trong `CLAUDE.md`.
- **Marketing:** GTM, phỏng vấn, audit concierge, quan hệ khách, tuyến 1 hỗ trợ.
- **Dev part-time:** thuê sau khi có khách trả phí; bảo trì, review code AI đã viết, phát triển tiếp. Repo phải sẵn sàng bàn giao từ đầu (ADR, runbook, `CLAUDE.md`).
- **Khi thiếu nguồn lực:** cắt `could`, rồi `should`. Không cắt các yêu cầu về đối chiếu số liệu, xác nhận gán Client, log, hoàn tác, kill switch, guardrails.

### 14.2 Rủi ro tổng thể

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Số liệu lệch so với Ads Manager | Cao | E4 từ V0; đối chiếu tự động; ngưỡng 1%; hỗ trợ ưu tiên |
| Phụ thuộc Meta API và chính sách | Cao | Spike E4; App Review sớm; quyền tối thiểu |
| Agency không gửi báo cáo cho khách thật | Cao | Kiểm chứng bằng E1 trước khi phát hành P0 |
| Sự cố thực thi làm mất khách | Cao (P2) | Duyệt 1 click trước; cổng riêng cho tự chạy; chạy thật trên staging trước; khuyến nghị review kỹ thuật bên ngoài trước khi bật |
| Code do AI viết và AI review, lỗi cùng loại lọt qua | Cao | Phiên review độc lập; CI là cổng cứng; PM duyệt thư mục quan trọng; tính năng sau cờ, tắt được ngay |
| PM là người kỹ thuật duy nhất (quá tải, ra quyết định kỹ thuật thiếu chuyên môn) | Cao | Vận hành tự động (mục 7.9); kill switch; thuê dev part-time khi có khách trả phí |
| Xây nhiều tính năng trước khi kiểm chứng nhu cầu | Trung bình | Tất cả sau cờ; kết quả V0 quyết định bật hay sửa; không xây P3 |
| Dev part-time khó tiếp nhận codebase lớn do AI viết | Trung bình | `CLAUDE.md`, ADR, runbook, test coverage cao; ranh giới module rõ |
| Media buyer không dùng dù chủ đã mua | Trung bình–cao | Không giám sát cá nhân; định khung "giúp bạn"; đo hoạt động hằng tuần |
| Meta ra tính năng gốc thay thế | Trung bình–cao | Giá trị nằm ở lớp báo cáo agency–khách |
| Quyền dữ liệu của khách của agency | Trung bình | Điều khoản, DPA; không dùng ngoài mục đích; tư vấn pháp lý |
| Gán sai Client làm lộ dữ liệu | Trung bình | Bắt buộc xác nhận trước khi chia sẻ |
| Bài học VN/SEA không áp dụng được ở thị trường khác | Trung bình | Kiểm tra lại giả định trước khi mở rộng |

---

## 15. Giả định cần kiểm chứng

| Mã | Giả định | Then chốt | Kiểm chứng |
|---|---|---|---|
| G1 | Agency trả tiền cho số giờ tiết kiệm khi kiểm tra và làm báo cáo | **Có** | E2, E3 |
| G2 | Audit chỉ đọc cho insight đủ khác Ads Manager | **Có** | E1 |
| G3 | Agency gửi báo cáo của AdxLens cho khách thật, và khách mở xem | **Có** | E1 |
| G4 | Meta cho đọc đủ dữ liệu và duyệt app trong thời gian chấp nhận được | **Có** | E4 |
| G5 | Agency chịu kết nối tài khoản của khách vào công cụ chưa có thương hiệu | Không | Quan sát ở E1 |
| G6 | PM + Claude Code xây xong P0 → P2b đủ chất lượng để phát hành, mà PM không bị quá tải review và vận hành | Không | Theo dõi tiến độ lượt xây, số giờ review/tuần của PM, tỷ lệ lỗi sau phát hành |
| G7 | Bài học từ agency VN/SEA áp dụng được cho thị trường khác | Không | Phỏng vấn agency ngoài SEA trước P3 |
| G8 | Giá công khai theo tài khoản là điểm khác biệt khách thấy giá trị | Không | E3 |
| G9 | Meta không ra tính năng gốc thay thế phần lớn giá trị | Không | Theo dõi |

**Chưa xác minh:** điều kiện Meta App Review hiện hành; tên "AdxLens"; thông tin đối thủ (tổng hợp từ nguồn công khai, 10/2026); yêu cầu pháp lý về dữ liệu tại VN/SEA và các thị trường khác.

---

## 16. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Design partner | Toàn bộ là agency |
| Thị trường đầu tiên | Việt Nam/SEA; sản phẩm sẵn sàng cho thị trường toàn cầu |
| Ngôn ngữ | Tiếng Việt và tiếng Anh từ P0 |
| Định nghĩa "tài khoản đang hoạt động" | Có chi tiêu trong 30 ngày gần nhất |
| Gói miễn phí | 1 tài khoản, có nhãn "Powered by" |
| Ngưỡng sai số số liệu | ≤ 1% cho spend và kết quả so với Ads Manager |
| TikTok | Giữ ở P3 |
| Nguồn lực kỹ thuật | Claude Code giai đoạn đầu; thuê dev part-time sau khi có khách trả phí |
| Cách xây | Xây toàn bộ P0 → P2b trong một lượt; P3 không xây |
| Cách phát hành | Cờ tính năng theo workspace; PM chủ động bật theo checklist mục 6.1 |
| Thứ tự P2 | Duyệt 1 click (P2a) trước; tự chạy (P2b) có cổng riêng |
| Kỳ thời gian (Gate 1) | Bộ chọn kỳ toàn cục trên thanh trên; màn nào cần có thể ghi đè tạm thời |
| Quyền duyệt P2a của Buyer (Gate 1) | Có, khi Owner cấp theo từng Client; mặc định tắt |
| Khách xem báo cáo (Gate 1) | Chỉ xem, chưa có phản hồi trên báo cáo công khai ở bản đầu |

---

## 17. Checklist

### 17.1 Trước khi bắt đầu lượt xây
- Chốt 3–5 agency design partner.
- Tạo Meta app ở chế độ phát triển; khởi động App Review (`ads_read`) và Business Verification.
- Soạn nháp điều khoản, DPA, trang bảo mật.
- Tạo repo với `CLAUDE.md` và bộ ADR đầu tiên (stack, cách ly workspace, Execution Gateway).

### 17.2 Trước khi bật từng cờ
Xem bảng checklist phát hành ở mục 6.1. Bổ sung:
- **`p0_reports`:** bộ quy tắc thu hẹp theo E4; mẫu báo cáo mặc định đã thử với E1; quy trình hỗ trợ "số liệu lệch".
- **`p1_recommendations`:** chốt giá từ E3; luồng thanh toán (thẻ và phương thức phổ biến ở VN/SEA); onboarding cho media buyer.
- **`p2a_approve`:** Meta đã duyệt `ads_management`; điều khoản trách nhiệm khi thực thi.
- **`p2b_auto`:** shadow mode đạt cho workspace đó.

### 17.3 Trước khi thuê dev part-time
- Runbook đầy đủ; ADR cập nhật; coverage đạt ngưỡng; danh sách nợ kỹ thuật ghi trong `docs/`.

### 17.4 Trước P3
- Đạt exit P2; có dữ liệu nhu cầu cho hướng được chọn; mini-PRD riêng.
