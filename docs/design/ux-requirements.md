# AdxLens — UX Requirements & Screen Inventory (Bước 1)

| | |
|---|---|
| **Phiên bản** | 0.1 — chờ PM review (Gate 1) |
| **Ngày** | 22/10/2026 |
| **Nguồn** | PRD v0.4; L1 v0.2; L2 v0.2; L3 v0.3 |
| **Dùng cho** | Bước 2 (sitemap, user flow) → Bước 4 (wireframe) → Claude Code |

---

## 1. Nguyên tắc UX rút ra từ PRD

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| U1 | **Số liệu dày, rõ, ít khoảng trống** (yêu cầu của PM) | Mật độ "compact" làm mặc định; bảng là thành phần chính; số căn phải, dùng chữ số đều độ rộng (tabular figures); header bảng dính; không dùng thẻ (card) to chỉ chứa một con số |
| U2 | **Mọi con số phải có nguồn và thời điểm** | Mỗi vùng số liệu có dòng "Khớp Meta · cập nhật [giờ] · cửa sổ attribution · tiền tệ · múi giờ" |
| U3 | **Trạng thái đối chiếu luôn hiện** | Huy hiệu đối chiếu (OK / Lệch / Đang đồng bộ) ở mọi nơi có số của một tài khoản |
| U4 | **Phát hiện = bằng chứng + ước tính trung thực** | Mỗi phát hiện hiện số liệu so sánh, khoảng thời gian, cách tính tác động; chữ "ước tính" luôn đi kèm số tiền tác động |
| U5 | **Báo cáo là sản phẩm** | Đường từ bất kỳ màn nào tới "tạo / gửi báo cáo" tối đa 2 click |
| U6 | **Không giám sát cá nhân** | Không có màn hay cột nào xếp hạng, so sánh media buyer |
| U7 | **An toàn khi hành động (P2)** | Mọi hành động ghi hiển thị trước/sau, cần xác nhận rõ ràng, có hoàn tác, có nhật ký; nút nguy hiểm tách khỏi nút thường |
| U8 | **Tính năng theo cờ** | Khi cờ tắt: không hiện menu, không có "nút khóa" gây tò mò; khi gói chưa đủ: hiện nhắc nâng gói |
| U9 | **Song ngữ vi/en, đa tiền tệ, múi giờ theo tài khoản** | Bố cục chịu được chuỗi tiếng Việt dài hơn ~20–30%; định dạng số theo locale (1.234.567 ₫ / $1,234.56) |
| U10 | **Khách của agency xem trên điện thoại** | Trang báo cáo công khai ưu tiên mobile; dashboard agency ưu tiên desktop (≥ 1280px), dùng được ở tablet |

---

## 2. Actors

| Mã | Actor | Mô tả | Quyền chính |
|---|---|---|---|
| AC1 | **Owner** (chủ agency) | Người mua; S2 "Người chứng minh" | Mọi thứ trong workspace, billing, mời thành viên |
| AC2 | **Manager** (account manager) | Tạo và gửi báo cáo; S2 | Client được giao: kết nối, gán, báo cáo, lịch gửi |
| AC3 | **Buyer** (media buyer) | Người dùng hằng ngày; S1 "Người chữa cháy" | Client được giao: xem phát hiện, Action List (P1), duyệt hành động (P2, nếu được cấp) |
| AC4 | **Client viewer** (khách của agency) | Không có tài khoản | Chỉ xem link báo cáo công khai |
| AC5 | **Staff / PM** (đội AdxLens) | Vận hành, phát hành | Admin: cờ tính năng, sự cố, kill switch |
| AC6 | **Visitor** | Người chưa đăng ký | Landing, giá, đăng ký |
| SYS | **Hệ thống** | Job nền, playbook | Đồng bộ, đối chiếu, audit, gửi email, thực thi theo rule (P2b) |

---

## 3. Use cases theo giai đoạn

### P0 — Báo cáo có bằng chứng
| Mã | Use case | Actor |
|---|---|---|
| UC01 | Đăng ký, xác minh email, tạo workspace | AC6 → AC1 |
| UC02 | Xem demo trên tài khoản mẫu | AC1, AC2 |
| UC03 | Kết nối Meta (chỉ đọc), chọn tài khoản quảng cáo | AC1, AC2 |
| UC04 | Gán tài khoản vào Client và xác nhận | AC1, AC2 |
| UC05 | Theo dõi đồng bộ và đối chiếu | AC1, AC2 |
| UC06 | Xem tổng quan agency (mọi Client) | AC1, AC2 |
| UC07 | Xem phát hiện, lọc, xem chi tiết, mở Ads Manager | AC1–AC3 |
| UC08 | Đánh dấu phát hiện (đã xem / đã làm / bỏ qua / sai) | AC1–AC3 |
| UC09 | Tạo báo cáo (audit / định kỳ / pitch), xem trước web + PDF | AC1, AC2 |
| UC10 | Chia sẻ link, đặt hạn, thu hồi | AC1, AC2 |
| UC11 | Đặt lịch gửi báo cáo cho Client | AC1, AC2 |
| UC12 | Khách mở báo cáo trên điện thoại | AC4 |
| UC13 | Nhận digest hằng tuần | AC1–AC3 |
| UC14 | Cấu hình thương hiệu, ngôn ngữ, múi giờ | AC1 |
| UC15 | Mời thành viên, gán vai trò và Client | AC1 |

### P1 — Gợi ý
| Mã | Use case | Actor |
|---|---|---|
| UC20 | Xem Weekly Action List, gán, đổi trạng thái | AC2, AC3 |
| UC21 | Xem creative library, so sánh, phân loại | AC2, AC3 |
| UC22 | Xem kết quả trước/sau của việc đã làm | AC2, AC3 |
| UC23 | Chọn gói, thanh toán, đổi gói, hủy, xem hóa đơn | AC1 |

### P2a / P2b — Hành động
| Mã | Use case | Actor |
|---|---|---|
| UC30 | Nâng quyền ghi Meta (opt-in) | AC1 |
| UC31 | Duyệt 1 click một gợi ý | AC2, AC3 (được cấp) |
| UC32 | Xem nhật ký hành động, hoàn tác | AC1–AC3 |
| UC33 | Bật kill switch của workspace | AC1 |
| UC34 | Cấu hình guardrails | AC1 |
| UC35 | Tạo rule từ mẫu, backtest, chạy shadow, chuyển live | AC1, AC2 |

### Vận hành (staff)
| Mã | Use case | Actor |
|---|---|---|
| UC40 | Bật/tắt cờ cho workspace, xem checklist, ghi lý do | AC5 |
| UC41 | Xem sự cố và playbook đã chạy | AC5 |
| UC42 | Kill switch toàn cục | AC5 |

---

## 4. Business rules ảnh hưởng tới giao diện

| Mã | Quy tắc | Màn hình liên quan |
|---|---|---|
| BR01 | Không chia sẻ / gửi báo cáo khi có tài khoản chưa xác nhận Client hoặc đối chiếu đang lệch > 1% | Báo cáo, Chia sẻ, Lịch gửi |
| BR02 | Mỗi ad account thuộc đúng một Client; gán phải được xác nhận | Gán Client |
| BR03 | Tác động ước tính luôn ghi "ước tính" + cách tính | Phát hiện, Báo cáo |
| BR04 | Health score hiển thị thành phần cấu thành | Tổng quan, Tài khoản |
| BR05 | Buyer chỉ thấy Client được giao; không có thống kê cá nhân | Mọi màn trong app |
| BR06 | Gói Free: 1 tài khoản active, có nhãn "Powered by" | Billing, Báo cáo, Trang công khai |
| BR07 | Tài khoản active = có chi tiêu trong 30 ngày | Billing |
| BR08 | Tính năng P1/P2 hiện khi **cả** cờ bật **và** gói cho phép | Điều hướng, mọi màn P1/P2 |
| BR09 | Hành động ghi phải qua guardrails; vi phạm thì bị chặn kèm lý do | Duyệt, Rule |
| BR10 | Rule chỉ chuyển live khi shadow ≥ 14 ngày và cờ `p2b_auto` bật | Rule builder |
| BR11 | Chỉ staff có quyền PM bật cờ; mọi staff tắt được; bật phải có lý do | Admin |
| BR12 | Số tiền theo tiền tệ ad account; ngày theo múi giờ ad account | Mọi màn có số |
| BR13 | Báo cáo theo ngôn ngữ chọn khi tạo (vi/en), độc lập với ngôn ngữ giao diện | Tạo báo cáo |

---

## 5. Edge cases phải có thiết kế

| Mã | Tình huống | Cách xử lý trên UI |
|---|---|---|
| EC01 | Chưa kết nối Meta | Trạng thái trống có CTA "Kết nối Meta" + "Xem demo" |
| EC02 | Đang backfill (có kết quả một phần) | Thanh tiến độ theo ngày; hiển thị số liệu đã có kèm nhãn "chưa đủ 90 ngày" |
| EC03 | Đối chiếu lệch > 1% | Huy hiệu đỏ; báo cáo bị khóa chia sẻ, giải thích lý do và "đang chạy lại sau 24h" |
| EC04 | Token Meta sắp hết hạn / đã hết hạn | Banner trên toàn app + nút kết nối lại |
| EC05 | Người kết nối mất quyền trên tài khoản quảng cáo | Tài khoản hiện "mất quyền truy cập", hướng dẫn kiểm tra Business Manager |
| EC06 | Tài khoản không đủ dữ liệu cho quy tắc | Nhóm quy tắc hiện "chưa đủ dữ liệu" thay vì "không có vấn đề" |
| EC07 | Không có phát hiện nào | "Không phát hiện vấn đề" + danh sách quy tắc đã kiểm |
| EC08 | Đa tiền tệ trong một Client | Không cộng gộp khác tiền tệ; tổng theo từng tiền tệ |
| EC09 | Link báo cáo hết hạn / đã thu hồi | Trang công khai báo hết hạn, không lộ tên agency/khách |
| EC10 | Vượt hạn mức gói | Banner nhắc nâng gói; dữ liệu vẫn đồng bộ trong thời gian ân hạn |
| EC11 | Thanh toán thất bại | Banner `past_due` + nút cập nhật thanh toán |
| EC12 | Hành động ghi thất bại / verify không khớp | Thông báo lỗi tại chỗ + trong nhật ký; tài khoản bị circuit breaker hiện trạng thái "tạm dừng thực thi" |
| EC13 | Kill switch đang bật | Mọi nút duyệt bị vô hiệu, banner giải thích |
| EC14 | Guardrails chặn | Hộp thoại nêu giới hạn bị vượt, giá trị hiện tại, giới hạn |
| EC15 | Cờ tắt khi người dùng đang ở màn P1/P2 | Chuyển về màn tương ứng của P0, thông báo ngắn. Trang "tính năng chưa bật" (A11 trong Penpot) chỉ dùng khi mở thẳng URL của màn P1/P2 lúc cờ tắt (PM chốt 22/10/2026) |
| EC18 | **[v0.5]** Báo cáo theo lịch gặp đối chiếu lệch hoặc gán chưa xác nhận | Hoãn gửi, báo account manager kèm lý do (P0-24) |
| EC19 | **[v0.5]** Lời mời hết hạn | A06 báo hết hạn, nút xin mời lại; không lộ tên workspace |
| EC16 | Chuỗi tiếng Việt dài | Bảng cho phép xuống dòng có giới hạn, có tooltip |
| EC17 | Agency có rất nhiều tài khoản (50+) | Bảng có tìm kiếm, lọc, phân trang hoặc cuộn ảo |

---

## 6. Screen Inventory

**Ký hiệu trạng thái:** D = mặc định có dữ liệu · E = trống · L = đang tải · P = một phần · X = lỗi · F = cờ tắt / gói chưa đủ · R = không có quyền

### 6.1 Công khai & xác thực

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| M01 | Landing | P0 | AC6 | D |
| M02 | Bảng giá | P0 | AC6, AC1 | D |
| M03 | Chính sách quyền riêng tư | P0 | Mọi người | D |
| M04 | Điều khoản dịch vụ | P0 | Mọi người | D |
| M05 | Hướng dẫn xóa dữ liệu | P0 | Mọi người | D |
| M06 | **[v0.5]** Trang công thức hoà vốn (P1-06) | P1 | AC6, AC1 | D |
| A01 | Đăng ký | P0 | AC6 | D, X |
| A02 | Kiểm tra email xác minh | P0 | AC6 | D |
| A03 | Đăng nhập | P0 | AC1–AC3 | D, X |
| A04 | Quên mật khẩu | P0 | AC1–AC3 | D, gửi xong |
| A05 | Đặt lại mật khẩu | P0 | AC1–AC3 | D, X (link hết hạn) |
| A06 | Chấp nhận lời mời | P0 | AC2, AC3 | D, X |
| A07 | Tạo workspace (onboarding) | P0 | AC1 | D |
| A08 | **[v0.5]** Onboarding theo vai trò cho Buyer (P1-11) | P1 | AC3 | D |

### 6.2 Thiết lập & kết nối

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| S01 | Demo tài khoản mẫu (banner "dữ liệu mẫu") | P0 | AC1, AC2 | D |
| S02 | Kết nối (danh sách kết nối Meta) | P0 | AC1, AC2 | D, E, X (token hết hạn) |
| S03 | Giải thích quyền trước OAuth ("chỉ đọc") | P0 | AC1, AC2 | D |
| S04 | Chọn tài khoản quảng cáo | P0 | AC1, AC2 | D, E, L |
| S05 | Gán tài khoản vào Client (hàng loạt, xác nhận) | P0 | AC1, AC2 | D |
| S06 | Tiến độ đồng bộ | P0 | AC1, AC2 | L, P, X |
| S07 | **[v0.5]** Ngắt kết nối & xóa dữ liệu (hộp thoại + trạng thái xóa) (P0-22) | P0 | AC1 | D, đang xóa, đã xóa |

### 6.3 Vận hành hằng ngày

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| O01 | Tổng quan agency (bảng mọi Client) | P0 | AC1–AC3 | D, E, L, P |
| C01 | Danh sách Client (quản lý) | P0 | AC1, AC2 | D, E |
| C02 | Chi tiết Client (KPI, tài khoản, phát hiện, báo cáo) | P0 | AC1–AC3 | D, P, X (đối chiếu lệch) |
| D01 | Tổng quan tài khoản quảng cáo (KPI, xu hướng, health) | P0 | AC1–AC3 | D, P, X |
| D02 | Danh sách phát hiện (lọc) | P0 | AC1–AC3 | D, E, L |
| D03 | Chi tiết phát hiện (drawer bên phải) | P0 | AC1–AC3 | D |
| D04 | Đối chiếu số liệu (theo ngày) | P0 | AC1, AC2 | D, X |

### 6.4 Báo cáo

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| R01 | Danh sách báo cáo | P0 | AC1, AC2 | D, E |
| R02 | Tạo báo cáo (chọn Client, kỳ, loại, ngôn ngữ) | P0 | AC1, AC2 | D |
| R03 | Xem trước & chỉnh báo cáo | P0 | AC1, AC2 | D, L (đang dựng), X (bị khóa chia sẻ) |
| R04 | Hộp thoại chia sẻ (link, hạn, PDF) | P0 | AC1, AC2 | D, X (bị chặn BR01) |
| R05 | Lịch gửi báo cáo | P0 | AC1, AC2 | D, E |
| R06 | **Trang báo cáo công khai (mobile-first)** | P0 | AC4 | D, X (hết hạn/thu hồi) |
| R07 | Bố cục PDF (A4) | P0 | AC4 | D |

### 6.5 P1 — Gợi ý

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| P101 | Weekly Action List | P1 | AC2, AC3 | D, E, F |
| P102 | Chi tiết gợi ý (drawer) | P1 | AC2, AC3 | D |
| P103 | Creative library (bảng + lưới) | P1 | AC2, AC3 | D, E, F |
| P104 | So sánh creative | P1 | AC2, AC3 | D |
| P105 | **[v0.5]** Kết quả trước/sau của việc đã làm (UC22, P1-08) | P1 | AC2, AC3 | D, E (chưa đủ N ngày) |

### 6.6 P2 — Hành động

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| P201 | Nâng quyền ghi Meta (giải thích + OAuth) | P2a | AC1 | D |
| P202 | Hộp thoại duyệt hành động (trước/sau) | P2a | AC2, AC3 | D, X (guardrails), X (kill switch) |
| P203 | Nhật ký hành động | P2a | AC1–AC3 | D, E, F |
| P204 | Chi tiết hành động + hoàn tác | P2a | AC1–AC3 | D, X (thất bại) |
| P205 | Guardrails & kill switch của workspace | P2a | AC1 | D |
| P211 | Danh sách rule tự động | P2b | AC1, AC2 | D, E, F |
| P212 | Rule builder (từ mẫu) | P2b | AC1, AC2 | D |
| P213 | Kết quả backtest | P2b | AC1, AC2 | D, E |
| P214 | Kết quả shadow mode | P2b | AC1, AC2 | D, P |
| P215 | **[v0.5]** Hiệu quả tự động hóa (P2-14) | P2b | AC1 | D, E |

### 6.7 Cài đặt

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| ST01 | Workspace (tên, thương hiệu, ngôn ngữ, múi giờ) | P0 | AC1 | D |
| ST02 | Thành viên & vai trò | P0 | AC1 | D, E |
| ST03 | Gói & thanh toán (gói, tài khoản active, hóa đơn) | P1 | AC1 | D, X (past_due), vượt hạn mức |
| ST04 | Kết quả checkout (thành công / hủy) | P1 | AC1 | D, X |
| ST05 | Thông báo (email nhận gì) | P0 | AC1–AC3 | D |
| ST06 | **[v0.5]** Hồ sơ cá nhân (tên, mật khẩu, ngôn ngữ giao diện) | P0 | AC1–AC3 | D |
| X07 | **[v0.6]** Menu tài khoản (avatar ở thanh trên: Hồ sơ cá nhân, Thông báo, Ngôn ngữ, Đăng xuất) | P0 | AC1–AC3 | D |

**Điều hướng Cài đặt (v0.6):** một thanh tab dùng chung cho ST01, ST02, ST03, ST05, ST06 theo thứ tự Workspace · Thành viên · Gói & thanh toán · Thông báo · Hồ sơ cá nhân. Tab "Guardrails" (P205) chỉ hiện khi tính năng P2 đã bật cho workspace; khi tắt thì tab ẩn hẳn, không hiện mã giai đoạn hay tên cờ. Tiêu đề trang luôn là "Cài đặt", breadcrumb dạng "Cài đặt › <tab>", sidebar luôn sáng "Cài đặt". Kết nối (S02) và Hỗ trợ (X06) không nằm trong tab. "Đăng xuất" nằm ở menu avatar (X07), không đặt trong form ST06.

### 6.8 Admin (staff)

| ID | Màn hình | Giai đoạn | Actor | Trạng thái |
|---|---|---|---|---|
| AD01 | Ma trận workspace × cờ | Mọi | AC5 | D |
| AD02 | Hộp thoại bật cờ (checklist, lý do, vượt qua) | Mọi | AC5 | D, X (checklist chưa đạt) |
| AD03 | Sự cố & playbook | Mọi | AC5 | D, E |
| AD04 | Kill switch toàn cục | P2 | AC5 | D |

### 6.9 Hệ thống & email

| ID | Màn hình | Ghi chú |
|---|---|---|
| X01 | 404 | Không lộ thông tin |
| X02 | 403 / không có quyền | Gợi ý liên hệ owner |
| X03 | Lỗi chung | Có mã lỗi để báo hỗ trợ |
| X04 | Banner hệ thống | Token hết hạn, past_due, vượt hạn mức, kill switch, dữ liệu mẫu |
| X05 | **[v0.5]** Trung tâm thông báo (panel từ thanh trên) | P0-25, P2-09 |
| X06 | **[v0.5]** Hỗ trợ: chat + "Báo số liệu lệch" (panel) | P0-20, P0-23, luồng F12 |
| E01–E07 | Email: xác minh, mời, digest tuần, báo cáo theo lịch, thanh toán thất bại, token sắp hết hạn, hành động thất bại | Thiết kế ở Bước 5, mức ưu tiên thấp hơn |

**Tổng:** 66 màn hình (v0.6 thêm X07 Menu tài khoản) + banner + 7 email. Bản trước ghi 58 nhưng đếm lại là 57; v0.5 thêm 8 màn (M06, A08, S07, P105, P215, ST06, X05, X06). Theo giai đoạn: P0 37 · P1 9 · P2 10 · Admin 4 · Hệ thống 5 (X01–X03, X05, X06; banner X04 tính riêng).

---

## 7. Yêu cầu về hiển thị số liệu (đầu vào cho Bước 3)

| Hạng mục | Yêu cầu |
|---|---|
| Bảng | 3 mật độ (compact mặc định ~32px/hàng, regular ~40px, comfortable ~48px); header dính; cột đầu dính khi cuộn ngang; sắp xếp, lọc, ẩn/hiện cột; tổng ở cuối bảng |
| Số | Tabular figures; căn phải; đơn vị trong header (không lặp ở từng ô); số âm/giảm có cả màu và ký hiệu (▲▼), không chỉ dựa vào màu |
| So sánh | Mỗi KPI kèm giá trị kỳ trước và % thay đổi; màu tốt/xấu tùy chiều của chỉ số (CPA tăng là xấu, ROAS tăng là tốt) |
| Biểu đồ | Sparkline trong bảng; biểu đồ đường cho xu hướng; cột cho so sánh; không dùng biểu đồ tròn cho > 4 phần |
| Trạng thái | Huy hiệu nhỏ: đối chiếu (OK/Lệch/Đồng bộ), mức độ (Cao/Vừa/Thấp), creative (Winner/Theo dõi/Mệt/Thua), hành động (Chờ/Đang chạy/Thành công/Thất bại/Đã hoàn tác) |
| Chi tiết | Mở trong drawer bên phải để giữ ngữ cảnh bảng, thay vì chuyển trang |
| Nguồn số | Dòng chú thích nguồn dưới mỗi khối số liệu (U2) |

---

## 8. Quyết định ở Gate 1 (PM duyệt 22/10/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Media buyer có được duyệt hành động P2a? | Có, **khi owner cấp quyền** theo từng Client (mặc định tắt) |
| 2 | Kỳ thời gian chọn toàn app hay theo màn? | **Bộ chọn kỳ toàn cục** trên thanh trên; màn nào cần có thể ghi đè tạm thời |
| 3 | Khách có phản hồi trên báo cáo công khai? | **Chỉ xem** ở bản đầu |
| 4 | Dark mode? | **Token sẵn cả sáng và tối**, bản đầu chỉ phát hành giao diện sáng |
| 5 | Giao diện mobile cho agency? | Không; chỉ trang báo cáo công khai là mobile-first |

---

## 9. Đồng bộ mã màn với Penpot (cập nhật 22/10/2026)

Quy tắc: tên khung trong Penpot (trang Wireframes) bắt đầu bằng đúng mã trong danh mục mục 3. Khung ghép nhiều màn dùng dấu gạch nối (ví dụ "R02-R03"). Biến thể trạng thái đặt sau dấu "·" cùng mã (ví dụ "R04 Chia sẻ báo cáo · chặn BR01"). Thêm hoặc đổi mã trong danh mục thì đổi tên khung trong cùng lượt.

**Đợt 1 đã vẽ (16 khung cho 15 màn + banner):**

| Mã | Khung Penpot | Trạng thái đã vẽ | Ghi chú lệch so với danh mục |
|---|---|---|---|
| A01 | A01 Đăng ký | D | Chưa vẽ trạng thái lỗi (X) |
| A03 | A03 Đăng nhập | D | Chưa vẽ lỗi sai mật khẩu |
| A07 | A07 Tạo workspace | D | — |
| S03 | S03 Giải thích quyền chỉ đọc | D | — |
| S04 | S04 Chọn tài khoản QC | D | Chưa vẽ E (không có tài khoản), L |
| S05 | S05 Gán Client | D | Chưa vẽ gán hàng loạt |
| S07 | S07 Ngắt kết nối & xóa dữ liệu | D | Dạng trang (PM chốt 22/10/2026). Chưa vẽ "đang xóa", "đã xóa" |
| D04 | D04 Đối chiếu số liệu | D, X (lệch) | — |
| R01 | R01 Danh sách báo cáo | D | Chưa vẽ E |
| R04 | R04 Chia sẻ báo cáo; R04 Chia sẻ báo cáo · chặn BR01 | D, X | Dạng trang (PM chốt 22/10/2026) |
| C01 | C01 Danh sách Client | D | Có cả dòng token hết hạn và chờ xác nhận gán. Chưa vẽ E |
| X01–X03 | X01 404; X02 403; X03 Lỗi chung | D | — |
| X04 | X04 Banner hệ thống | 5 biến thể: token hết hạn, past_due, vượt hạn mức, kill switch, dữ liệu mẫu | — |
| X06 | X06 Hỗ trợ | D | Dạng trang (PM chốt 22/10/2026) |

Trạng thái còn thiếu của Đợt 1 sẽ vẽ gộp ở lượt bổ sung trạng thái (E, L, X) sau khi vẽ xong Đợt 2.

**Đợt 2 đã vẽ (20 màn, 20 khung, tên khung = mã):**

| Nhóm | Mã → khung Penpot | Ghi chú |
|---|---|---|
| Công khai | M01 Landing; M02 Bảng giá; M03 Quyền riêng tư; M04 Điều khoản; M05 Hướng dẫn xóa dữ liệu | M02: giá ghi "chốt sau thử nghiệm giá" (PRD 13.3). M03–M05: nội dung giữ chỗ, cần pháp lý duyệt |
| Xác thực | A02 Xác minh email; A04 Quên mật khẩu; A05 Đặt lại mật khẩu; A06 Chấp nhận lời mời | Chỉ vẽ trạng thái mặc định |
| Vận hành | S01 Demo dữ liệu mẫu; D01 Tổng quan tài khoản; D02 Danh sách phát hiện; D03 Chi tiết phát hiện | D03 có dòng "số không do mô hình ngôn ngữ tạo" (CLAUDE.md điều 5) |
| Báo cáo | R05 Lịch gửi báo cáo; R07 PDF A4 | R07 là khung 595×842, mới vẽ trang 1 |
| Cài đặt, hệ thống | ST01 Workspace; ST02 Thành viên & vai trò; ST05 Thông báo; ST06 Hồ sơ cá nhân; X05 Trung tâm thông báo | — |

Giá trị giữ chỗ trong bản vẽ, cần PM chốt: số ngày ân hạn (đang ghi 7), thời hạn xóa dữ liệu ("trong thời hạn cam kết"). Bảng giá và tên gói đã thay bằng đề xuất ở mục 9.1.

**Đợt 3–7 đã vẽ (cập nhật 22/10/2026):**

| Đợt | Mã → khung Penpot |
|---|---|
| 3 Admin | AD01 Ma trận cờ; AD02 Hộp thoại bật cờ (checklist chưa đạt, có nhánh vượt qua kèm lý do); AD03 Sự cố & playbook; AD04 Kill switch toàn cục |
| 4 P1 | P103 Creative library (lưới); P104 So sánh creative; P105 Kết quả trước / sau; ST04 Kết quả checkout (+ "· hủy"); M06 Hoà vốn; A08 Onboarding Buyer |
| 5 P2a | P201 Nâng quyền ghi Meta; P204 Chi tiết hành động (+ "· thất bại"); P205 Guardrails & kill switch |
| 6 P2b | P212 Rule builder; P213 Kết quả backtest; P214 Shadow mode; P215 Hiệu quả tự động hóa |
| 7 Email | E01 Xác minh email; E02 Lời mời; E03 Digest tuần; E04 Báo cáo theo lịch; E05 Thanh toán thất bại; E06 Token sắp hết hạn; E07 Hành động thất bại (khung 700px, thân 600px) |

Ghi chú nội dung giữ chỗ cần PM chốt: P205 chưa có giá trị mặc định của guardrails (PRD 11.2 chỉ nêu loại giới hạn) nên bản vẽ ghi "PM chốt" và "Khóa bằng test" (CLAUDE.md điều 6); P212–P215 dùng số liệu mẫu.

**Biến thể trạng thái đã vẽ** (tên khung = mã + tên + " · " + trạng thái; xếp ở vùng y ≥ 44000 của trang Wireframes):
- Trống (E): O01, C01, S02, S04, D02, R01, R05, ST02, AD03, P101-P102, P103, P105, P202-P203, P211, P213, P215.
- Đang tải (L): O01, S04, D02.
- Lỗi và hết hạn (X): A01 (email đã dùng), A03 (sai mật khẩu), A05 (link hết hạn), A06 (lời mời hết hạn, EC19), S06 (đồng bộ lỗi), ST03 (past_due), R06 (liên kết hết hạn hoặc thu hồi).
- Trạng thái F (cờ tắt) của P101, P103, P203, P211: theo EC15, chuyển về màn P0 kèm thông báo ngắn; khung "F-state Tính năng chưa bật" chỉ dùng khi mở thẳng URL.

**Chưa vẽ biến thể** (cố ý, ít rủi ro thiết kế): L của các bảng còn lại (dùng cùng khung skeleton như D02); P (một phần dữ liệu) của O01, C02, D01, S06; X của C02, D01, R03, ST04 ngoài các biến thể trên; S07 "đang xóa", "đã xóa"; P102 (drawer) và P202 (hộp thoại duyệt) nằm trong khung ghép P101-P102 và P202-P203.

### 9.1 Bảng giá đề xuất (22/10/2026, chờ PM xác nhận sau thử nghiệm giá E3)

Cơ sở: đối thủ tính theo số client/tài khoản/nguồn dữ liệu, giá công bố (USD/tháng, thanh toán tháng): AgencyAnalytics Freelancer 79 (5 client), Agency 239 (10), Agency Pro 479 (15), thêm client 20; Swydo từ 69 (10 nguồn); DashThis Individual 54, Professional 164, Business 324; Databox Analyst 80, Pro 199, Growth 499, white-label +200; Madgicx tính theo mức chi tiêu quảng cáo, gói thấp nhất công bố 29 và add-on Tracking Pro 49/tài khoản. Nguồn: bài so sánh của Swydo (bên có lợi ích cạnh tranh, cần kiểm chứng lại trên trang giá từng hãng) và trang tổng hợp giá Madgicx.

| Gói | Giá/tháng | Tài khoản QC hoạt động | Nội dung chính |
|---|---|---|---|
| Free | 0 ₫ | 1 | Báo cáo, link công khai, PDF; có nhãn "Powered by AdxLens" |
| Starter | 590.000 ₫ | 5 | + gợi ý hằng tuần, Creative library, đối chiếu chi tiết |
| Growth | 1.490.000 ₫ | 15 | + hành động có duyệt, rule tự động (khi PM bật cho workspace) |
| Scale | 3.490.000 ₫ | 40 | + white-label đầy đủ (gỡ nhãn), hỗ trợ ưu tiên |

Thêm tài khoản 79.000 ₫/tháng; trả theo năm giảm 20%; giá chưa gồm VAT. Định vị: tính theo tài khoản QC hoạt động (không theo % ngân sách), khoảng 15–40% giá của các công cụ báo cáo phương Tây ở mức tương đương số client, vì sức mua và thang giá thị trường Việt Nam/SEA. Quy đổi tham khảo 25.500 ₫/USD: Starter ≈ 23 USD, Growth ≈ 58 USD, Scale ≈ 137 USD. Điểm cần kiểm chứng ở E3: mức sẵn lòng trả của agency 5–15 tài khoản, và có nên gắn white-label vào gói Scale (PRD 13.3 nói "gói cao").

Dữ liệu minh họa trong bản vẽ: workspace "Agency Sao Mai" dùng gói Growth, 12/15 tài khoản hoạt động (ST03, ST04, X04, X05, E05, AD01). Màn onboarding S04 vẫn ghi "gói Starter theo dõi tối đa 5 tài khoản", ngầm giả định workspace mới có dùng thử Starter; PRD 13.3 ghi Free 1 tài khoản, cần PM chốt.

### 9.2 Rà soát Cài đặt và 8 mục sidebar (22/10/2026)

Đã sửa trong Penpot: thanh tab Cài đặt dùng chung; breadcrumb thống nhất dấu "›" toàn bộ app; sidebar sáng đúng mục ở P205; bỏ badge phạm vi (Owner, Cá nhân, Workspace); ST01 thêm ghi chú nhãn "Powered by", cảnh báo xác minh SPF/DKIM, thẻ "Xóa workspace" nối tới S07; ST02 bỏ mã "P2a", dòng mời dùng email nội bộ; ST05 ô bắt buộc làm mờ và ghi chú lưu tự động; ST06 đổi "Đổi mật khẩu" thành nút, bỏ nút Đăng xuất khỏi form; thêm avatar ở thanh trên mọi màn app và màn X07; ST03 thêm nút "Thông tin hóa đơn"; M02 thành bảng 4 gói; O01 và R02-R03 sửa màu mũi tên KPI (tăng tốt màu xanh, tăng xấu màu đỏ); D02 sửa số "5 phát hiện" và nút bị cắt; P202 bỏ mã "P1" và giá trị ±30% tự đặt, chip lọc có giá trị; P204 bỏ thuật ngữ "Execution Gateway"; P211 chip kill switch đúng trạng thái và nối tới P205; P212 sửa hàng điều kiện tràn khung; P214 bỏ "cờ p2b"; P205 thay "Khóa bằng test" bằng "Cố định"; S02 đổi tiêu đề cột "Có chi tiêu 30N".

Còn mở, cần quyết định hoặc bản vẽ tiếp: (1) S07 dùng checkbox cho lựa chọn loại trừ, nên đổi sang radio khi design system có component Radio; (2) mục "Nhật ký hành động" và "Rule tự động" phải ẩn khỏi sidebar khi cờ P2 tắt (CLAUDE.md điều 7), bản vẽ hiện cả hai để minh họa; (3) cột "Duyệt hành động" ở ST02 chỉ hiện khi tính năng bật; (4) Owner không có thao tác chuyển quyền, cần quyết định luồng; (5) ST03 chưa có hủy gói và biểu mẫu thông tin xuất hóa đơn (tên công ty, mã số thuế, địa chỉ); (6) giá trị mặc định guardrails ở P205 vẫn là "PM chốt"; (7) thanh tab ở C02 có độ rộng các tab chưa đều.

**Prototype (Penpot, chế độ xem):** 14 điểm bắt đầu được đặt tên theo luồng F1–F12 trong sơ đồ luồng, thêm "Đăng nhập" và "Quên mật khẩu". Liên kết đã nối giữa các nút chính và thanh điều hướng trái ở mọi màn app. Prototype chỉ thể hiện luồng điều hướng, không mô phỏng dữ liệu hay trạng thái lỗi.
