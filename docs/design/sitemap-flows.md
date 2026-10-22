# AdxLens — Rà soát sitemap, luồng và danh mục màn (22/10/2026)

Nguồn đối chiếu: PRD v0.4 → đã nâng lên **v0.5**, `adxlens-ux-requirements.md` (đã cập nhật), board FigJam `AdxLens - Sitemap`. Sitemap và luồng đã chép sang Penpot, trang **"Sitemap & Flows"**:
- F1–F7 giữ nguyên bước và nhánh của bản FigJam, chỉ sắp lại bố cục theo lưới cho dễ đọc.
- F2 thêm một nút.
- F8–F12 là luồng mới, gắn nhãn "MỚI, chờ duyệt".

## 1. Sitemap và luồng đã đủ theo PRD chưa?

**Chưa đủ.** 7 luồng cũ phủ tốt các đường chính: đăng ký → báo cáo đầu tiên, chu kỳ báo cáo, P1, P2a, P2b, thanh toán, phát hành cờ. Còn thiếu 5 luồng và 1 nhánh:

| # | Thiếu gì | Yêu cầu PRD | Đã xử lý |
|---|---|---|---|
| 1 | Mời thành viên, chấp nhận lời mời, phân quyền theo Client; Owner cấp quyền duyệt P2a cho Buyer | P0-01, 7.3, P2-04, quyết định Gate 1 | Vẽ **F8** |
| 2 | Media buyer rà phát hiện hằng ngày ở P0: lọc, xem chi tiết, mở Ads Manager, đánh dấu (có "sai") | P0-06 → P0-10, P0-11 | Vẽ **F9**. F3 chỉ có nhánh P1 |
| 3 | Token hết hạn, mất quyền tài khoản, ngắt kết nối và xóa dữ liệu (kể cả yêu cầu xóa từ Meta) | 7.4, 7.9; EC04, EC05 | Vẽ **F10**; thêm P0-21, P0-22 vào PRD |
| 4 | Phanh an toàn: cấu hình guardrails và bậc tự chủ, kill switch workspace và toàn cục, circuit breaker | 11.2, P2-08, P2-12, UC33, UC34 | Vẽ **F11**. F4 chỉ kiểm tra kill switch, không có luồng bật/tắt |
| 5 | Báo số liệu lệch → hỗ trợ ưu tiên | Nguyên tắc 1 và 10, P0-20, 13.5 | Vẽ **F12**; thêm P0-23 |
| 6 | F2: báo cáo theo lịch gặp lúc đối chiếu vẫn lệch thì xử lý sao | BR01, P0-17 | Thêm nút "Hoãn gửi, báo account manager" vào F2; thêm P0-24 |

**Đã cập nhật trong PRD v0.5:**
- P0-21 → P0-25: token, ngắt kết nối/xóa dữ liệu, báo số lệch, hoãn gửi theo lịch, trung tâm thông báo.
- Quy tắc ân hạn khi vượt hạn mức hoặc `past_due` (mục 13.3).
- 3 quyết định Gate 1 (mục 16).

**Cần anh quyết (chưa sửa):**
1. **F7 có nhánh "PM vượt qua checklist, ghi lý do"**, mâu thuẫn với quy tắc phát hành ở PRD 6 ("cờ chỉ bật khi đủ điều kiện"). Em đã ghi thành câu hỏi mở trong PRD 6.1. Anh chọn: cho vượt với một số điều kiện (nhưng không bao giờ bật `p2a_approve` khi Meta chưa duyệt quyền ghi), hay bỏ nhánh này?
2. **Báo cáo pitch (P0-18, could):** chưa có luồng. Đề xuất để sau kết quả E5.
3. **Status page từ P2 (13.5):** nằm ngoài app, không đưa vào sitemap.

## 2. Danh mục màn trong UX requirements đã khớp sitemap và luồng chưa?

**Chưa khớp.** Các luồng dẫn tới 8 màn chưa có trong danh mục. Em đã thêm vào UX requirements (đánh dấu [v0.5]) và vào sitemap Penpot (ô vàng nhạt):

| Mã mới | Màn | Từ đâu |
|---|---|---|
| M06 | Trang công thức hoà vốn | P1-06, 13.3 |
| A08 | Onboarding theo vai trò cho Buyer | P1-11, F8 |
| S07 | Ngắt kết nối & xóa dữ liệu | P0-22, F10 |
| P105 | Kết quả trước/sau của việc đã làm | UC22, P1-08, F3. UC22 có từ trước nhưng chưa có màn |
| P215 | Hiệu quả tự động hóa | P2-14 |
| ST06 | Hồ sơ cá nhân | Mục "Tài khoản" trên thanh trên chưa có màn |
| X05 | Trung tâm thông báo | P0-25, P2-09; icon "Thông báo" trên thanh trên chưa có màn |
| X06 | Hỗ trợ: chat + "Báo số liệu lệch" | P0-20, P0-23, F12 |

**Các điểm lệch khác em phát hiện:**
- **Tổng số màn:** danh mục ghi 58 nhưng đếm lại chỉ có 57. Sau khi thêm 8 màn, tổng là **65** (P0 37 · P1 9 · P2 10 · Admin 4 · Hệ thống 5).
- **EC15 và màn A11 mâu thuẫn:** EC15 nói khi cờ tắt thì chuyển về màn P0 kèm thông báo ngắn, còn A11 là cả một trang "tính năng chưa bật". Đề xuất giữ A11 chỉ cho trường hợp mở thẳng URL; anh xác nhận giúp.
- **Màn A09 (tiến độ đồng bộ) ghi "Đang đồng bộ dữ liệu 30 ngày",** nhưng PRD là backfill 90 ngày. Cần sửa.
- **Màn A08 (Gói & thanh toán) có bảng "Tính năng" hiện tên cờ p0/p1/p2a/p2b cho khách.** Theo PRD 7.8, cờ là nội bộ và chỉ PM bật. Đề xuất đổi thành "tính năng theo gói", không lộ tên cờ (giống badge anh vừa bảo bỏ).
- **Mã khung trong Penpot (A01–A11) trùng mã danh mục** (A01–A08 là màn xác thực). Đề xuất đổi tên khung theo mã danh mục: A01→O01, A02→C02, A03→R03, A04→P101, A05→P203, A06→P211, A07→S02, A08→ST03, A09→S06, A10→R06, A11→F-state.

## 3. Danh sách màn còn thiếu để vẽ vào Penpot

> **Cập nhật 22/10/2026:** các đợt 1–7 dưới đây đã vẽ xong, khung Penpot đã đổi tên theo mã danh mục (đề xuất ở mục 2 đã áp dụng). Trạng thái hiện hành xem `ux-requirements.md` mục 9; phần dưới giữ làm lịch sử.

**Đã có trong Penpot: 13 màn.**
- O01, C02, R02+R03, S02, S06, R06
- P101+P102, P202+P203, P211, ST03
- Một phần P212 và P205 (A06 có trình tạo rule rút gọn và nút kill switch).

**Còn 52 màn**, chia theo đợt:

### Đợt 1 — P0 đường găng (15 màn + banner)
| Màn | Lý do |
|---|---|
| A03 Đăng nhập, A01 Đăng ký, A07 Tạo workspace | Điểm vào |
| S03 Giải thích quyền chỉ đọc, S04 Chọn tài khoản, S05 Gán Client | Luồng F1, nơi dễ rớt người nhất |
| D04 Đối chiếu số liệu | Cam kết lệch ≤ 1% |
| R04 Chia sẻ (có chặn BR01), R01 Danh sách báo cáo, C01 Danh sách Client | Hoàn tất luồng báo cáo |
| S07 Ngắt kết nối & xóa dữ liệu | Meta yêu cầu khi duyệt app |
| X06 Hỗ trợ + Báo số liệu lệch | Nguyên tắc 1 và 10 |
| X01 404, X02 403, X03 Lỗi chung, X04 Banner hệ thống | Trạng thái lỗi toàn app |

### Đợt 2 — P0 hoàn thiện (20 màn)
| Nhóm | Màn |
|---|---|
| Công khai | M01 Landing, M02 Bảng giá, M03 Quyền riêng tư, M04 Điều khoản, M05 Hướng dẫn xóa dữ liệu |
| Xác thực | A02 Xác minh email, A04 Quên mật khẩu, A05 Đặt lại mật khẩu, A06 Chấp nhận lời mời |
| Vận hành | S01 Demo dữ liệu mẫu, D01 Tổng quan tài khoản, D02 Danh sách phát hiện, D03 Chi tiết phát hiện |
| Báo cáo | R05 Lịch gửi, R07 PDF A4 |
| Cài đặt & hệ thống | ST01 Workspace, ST02 Thành viên & vai trò, ST05 Thông báo, ST06 Hồ sơ cá nhân, X05 Trung tâm thông báo |

### Đợt 3 — Admin (3 màn), trước khi bật cờ P1 đầu tiên
AD01 Ma trận cờ (kèm nhật ký phát hành), AD02 Hộp thoại bật cờ, AD03 Sự cố & playbook

### Đợt 4 — P1 (6 màn)
P103 Creative library, P104 So sánh creative, P105 Kết quả trước/sau, ST04 Kết quả checkout, M06 Trang hoà vốn, A08 Onboarding Buyer

### Đợt 5 — P2a (4 màn)
P205 Guardrails & kill switch (làm trước), P201 Nâng quyền ghi, P204 Chi tiết hành động + hoàn tác, AD04 Kill switch toàn cục

### Đợt 6 — P2b (4 màn)
P212 Rule builder (tách khỏi A06), P213 Backtest, P214 Shadow mode, P215 Hiệu quả tự động hóa

### Đợt 7 — Email (7 mẫu)
E01 xác minh, E02 mời, E06 token sắp hết hạn, E04 báo cáo theo lịch, E03 digest tuần, E05 thanh toán thất bại, E07 hành động thất bại

**Kèm mỗi đợt:**
- Trạng thái E, L, P, X, F của màn trong đợt (theo cột "Trạng thái" của danh mục).
- Sửa 4 điểm trên các màn đã có: A09 đổi 30 → 90 ngày, bỏ bảng cờ ở A08, chốt A11, đổi tên khung.
