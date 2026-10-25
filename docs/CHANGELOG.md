# Changelog

Mỗi feature merge vào `develop` có một mục: thay đổi gì, test tự động đi kèm, vùng bảo vệ bị chạm, và cách PM kiểm tra thủ công. PM verify trên `develop` trước khi merge `develop → main`.

## [110] Rule: giá trị động so với trung bình tài khoản, cửa sổ 3 ngày, Sunsetting dừng hẳn — 2026-10-25

Từ đối chiếu gap với Madgicx Academy (`docs/research/madgicx-2026-10.md` mục 7): Strategies và Sunsetting.

- **Giá trị động**:
  - với chỉ số dạng tỷ lệ (CPA, CTR, tần suất, ROAS ở cửa sổ 7 / 3 / 1 ngày), chọn **"× trung bình tài khoản"**, vd.
    "ROAS 3 ngày ≥ 1,2 × trung bình tài khoản";
  - mốc tính trên cả tài khoản trong cùng cửa sổ, cả trong backtest từng ngày;
  - thiếu mốc thì không khớp.
- **Cửa sổ 3 ngày**: chi tiêu, kết quả, CPA, ROAS 3 ngày gần nhất.
- **Sunsetting dừng hẳn**: tùy chọn "Đã ở sàn mà vẫn kém → tạm dừng hẳn nhóm QC". Tạm dừng là hành động auto được phép;
  guardrail không đổi.
- `entityMetrics` gom phần tính chỉ số vào `deriveMetrics`, dùng chung cho đối tượng và tài khoản (`accountBaseline`).

**Vùng bảo vệ:** `packages/core/execution/rules.ts`. Không đổi guardrails / gateway. ADR-0021 cập nhật mục 6.

**Test tự động:**
- `execution/rule-insights.test.ts`:
  - mốc tài khoản;
  - ngưỡng = hệ số × mốc, thiếu mốc thì không khớp;
  - 3 ngày = tổng 3 ngày;
  - backtest dùng mốc từng ngày;
  - giá trị động chỉ cho chỉ số tỷ lệ; dừng khi chạm sàn cần sàn.
- `execution/tactics.test.ts`: ở sàn + `pauseAtFloor` → hành động tạm dừng tự động; không bật thì bỏ qua.

## [143] Bố cục 3 khối: right panel trợ lý theo ngữ cảnh (Hỏi AI · Giải thích · Thông báo) — 2026-10-25

PM góp ý UI/UX #5; PM chọn "gập, mở khi cần".

- **Bố cục:** sidebar trái · nội dung giữa · **right panel** (380px).
  - Mặc định gập thành thanh dọc mảnh ở mép phải; mở / đóng nhớ theo người dùng (cookie `rp`).
  - Màn nhỏ: nút nổi mở bottom sheet.
  - Ẩn ở trang AI Agents (đã là màn hỏi đáp đầy đủ).
- **Hỏi AI** (sau cờ P1):
  - hỏi ngay trong panel, không phải sang màn AI Agents;
  - tự gửi kèm ngữ cảnh: tài khoản đang chọn, kỳ, và **đối tượng đang xem** khi ở trang chi tiết chiến dịch / nhóm QC /
    QC (agent bắt đầu bằng `entity_details`);
  - câu trả lời qua cùng bộ kiểm số; thẻ đề xuất ("Xem & duyệt") và thẻ kế hoạch (duyệt một lần) dùng được ngay trong
    panel;
  - nút "Hội thoại mới". Thay ô "Hỏi AdxLens" nổi ở đáy trang.
- **Giải thích** (sau cờ P1):
  - câu hỏi gợi ý theo màn: trang chủ (chi phí / kết quả, chi tiêu, vấn đề), Quảng cáo / Mở rộng (mệt, tốt nhất), Phễu,
    Business (MER), Địa lý, trang chi tiết (vì sao đối tượng đổi, con nào kéo xuống);
  - **nút ✨ cạnh mỗi KPI trang chủ** mở panel và hỏi "Vì sao {chỉ số} thay đổi so với kỳ trước?";
  - số do công cụ tính, AI chỉ diễn giải.
- **Thông báo:** 15 thông báo gần nhất, bấm để mở và đánh dấu đã đọc, "Xem tất cả" về màn Thông báo.

**Vùng bảo vệ:** không. Dùng lại API agent / thông báo sẵn có, không đổi quyền hay cờ.

**Test tự động:**
- `lib/right-panel.test.ts`: đối tượng ngữ cảnh từ đường dẫn chi tiết; gợi ý theo màn; ẩn ở AI Agents; mặc định gập.
- E2E `workspace-home.spec.ts`:
  - mặc định gập; cờ P1 tắt → thanh dọc chỉ có Thông báo;
  - mở tab Thông báo → tải lại vẫn mở → đóng về thanh dọc;
  - không còn ô hỏi nổi.

**PM kiểm tra:**
1. Bật cờ Gợi ý → trang chủ bấm ✨ cạnh "Chi tiêu" → panel mở và trả lời.
2. Mở một nhóm QC từ Ads Manager → Hỏi AI "vì sao CPA tăng?" → câu trả lời về đúng nhóm QC đó.

## [142] Chi tiết chiến dịch / nhóm QC / QC mở ở khung giữa, nhớ trang nguồn — 2026-10-25

PM góp ý UI/UX #4 (chọn "Trong khung giữa"): bấm vào chi tiết thì như sang màn của client, sidebar đổi.

- Sidebar không còn đổi (từ 139).
- **Breadcrumb của trang chi tiết bắt đầu bằng trang nguồn:** "← Ads Manager › Tài khoản › Chiến dịch › Nhóm QC › …";
  không còn "Clients › Client".
  - Nguồn qua `?from=` (Ads Manager mặc định; Quảng cáo, Mở rộng gắn nguồn khi mở);
  - đi xuống chiến dịch / nhóm QC / tab vẫn giữ nguồn.
- **Sidebar sáng mục nguồn** khi đang ở trang chi tiết.
- "← Ads Manager" quay về trang nguồn với bộ lọc đang lưu (client, tài khoản, kỳ).
- Helper thuần `lib/entity-origin.ts`; nguồn lạ → Ads Manager (không nhận đường dẫn tùy ý).

**Vùng bảo vệ:** không.

**Test tự động:**
- `lib/entity-origin.test.ts`: nguồn lạ → mặc định; thêm `from=` giữ tham số; sidebar sáng mục nguồn ở trang chi tiết.
- E2E `workspace-home.spec.ts`: Ads Manager → mở quảng cáo → "← Ads Manager", sidebar sáng Ads Manager → bấm quay lại
  đúng `/w/ads-manager`.
  - Sửa sau CI 143: selector link sidebar giới hạn trong "Điều hướng chính" (breadcrumb cũng là `nav` có cùng link).

## [141] Một màn "Thông báo": Hộp thư + Quy tắc cảnh báo — 2026-10-25

PM góp ý UI/UX #1: màn Thông báo và màn Cảnh báo chưa rõ mục đích, cần một màn chung.

- **Màn "Thông báo"** (`/w/alerts`, mục chuông ở đáy sidebar, kèm số chưa đọc):
  - tab **Hộp thư**: mọi sự kiện đã xảy ra. Lọc theo nhóm: Cảnh báo chỉ số · Hành động · Báo cáo · Hệ thống. Lọc "Chỉ
    chưa đọc", nút "Đánh dấu đã đọc tất cả";
  - tab **Quy tắc cảnh báo**: tạo / bật / tắt / xóa cảnh báo chỉ số, gợi ý ngưỡng (như trước). `?new=1` mở thẳng tab này.
- `/notifications` (link trong email cũ) chuyển về màn chung; menu tài khoản → "Thông báo" mở màn chung.
- Nhóm loại thông báo là hàm thuần `notificationGroup`. Loại mới chưa xếp nhóm → "Hệ thống", vẫn hiện ở "Tất cả".

**Vùng bảo vệ:** không.

**Test tự động:**
- `lib/notification-groups.test.ts`: nhóm theo loại; loại lạ → hệ thống.
- E2E `workspace-home.spec.ts`: tiêu đề "Thông báo", bộ lọc hộp thư, lọc "Báo cáo", `/notifications` → màn chung, tab
  "Quy tắc cảnh báo" → tạo / tắt cảnh báo như cũ.
  - **Đổi test (quy tắc 8):** bước cũ chờ tiêu đề "Cảnh báo"; PM yêu cầu gộp nên tiêu đề / đường vào đổi. Assertion về
    tạo cảnh báo giữ nguyên.

## [140] Bộ lọc kỳ đặt đúng vùng dữ liệu, không còn ở đầu mọi trang — 2026-10-25

PM góp ý UI/UX #3: bộ lọc ngày ở header hầu hết các màn, kể cả màn không lọc theo ngày được.

- **Trang chủ:** bộ lọc 7 / 14 / 30 ngày chuyển vào khối **Hiệu suất**. Sức khỏe, Tracking, Cần chú ý không theo kỳ.
- **AI Agents, Cảnh báo, Launcher:** bỏ bộ lọc kỳ (không có số theo kỳ).
- **Ads Manager, Quảng cáo, Phễu, Địa lý, Mở rộng, Business, Audiences:** giữ bộ lọc ở đầu trang. Mọi khối của các
  trang này theo kỳ.
- **Trang cổ điển:** thanh trên chỉ hiện bộ chọn kỳ ở trang có số theo kỳ (tài khoản / chi tiết chiến dịch, trang
  client, Creative). Bỏ ở Clients, Báo cáo, Kết nối, Cài đặt, Thông báo, Nhật ký…
- Khi in / xuất PDF vẫn ghi kỳ trên dòng phạm vi.
- Component `PeriodFilter` dùng chung.

**Vùng bảo vệ:** không.

**Test tự động:**
- `lib/period.test.ts` (`periodApplies`): trang có / không có số theo kỳ.
- E2E `workspace-home.spec.ts`:
  - trang chủ có đúng 1 bộ lọc kỳ (khối Hiệu suất);
  - Cảnh báo không có bộ lọc;
  - Clients không có bộ chọn kỳ.

## [139] Chọn client ở một nơi, sidebar luôn một bộ menu — 2026-10-25

PM góp ý UI/UX #2 và #4: hai dropdown chọn khách gây rối; mở chi tiết thì sidebar đổi sang menu của client.

- **Bộ chọn client duy nhất** ở đầu sidebar ("Tất cả client" / một client):
  - lưu theo người dùng (cookie `w_client`);
  - **chỉ lọc dữ liệu**: ở nguyên trang, không chuyển sang trang client;
  - đổi client → bỏ chọn tài khoản cũ.
- **Ô ở đầu trang Workspace** thành bộ lọc **tài khoản QC** trong client đang xem; client chỉ có 1 tài khoản thì ẩn.
  Tài khoản đã chọn mà không thuộc client đang xem → bỏ qua.
- **Sidebar:**
  - luôn 3 nhóm Phân tích · Khách & báo cáo · Thực thi;
  - bỏ chế độ "menu của client" (trước đây tự bật khi mở `/clients/…` hoặc chi tiết chiến dịch);
  - trang client vẫn mở từ mục Clients, đủ tab chiến dịch / đối chiếu / báo cáo / cài đặt.

**Vùng bảo vệ:** không.

**Test tự động:**
- `lib/scope.test.ts` (`pickScope`):
  - client lọc tài khoản; client lạ → mọi client;
  - tài khoản ngoài client bị bỏ;
  - không chọn tài khoản → cùng tiền tệ chính.
- E2E `workspace-home.spec.ts`: chọn client ở sidebar → vẫn `/w`, sidebar giữ nguyên, không có bộ chọn tài khoản (client
  1 tài khoản); chọn lại "Tất cả client".

**PM kiểm tra:** chọn một client ở sidebar → trang chủ, Ads Manager, Phễu… chỉ còn số của client đó; menu không đổi.

## [138] Tạo quảng cáo qua chat: agent viết nội dung + soạn kế hoạch, người dùng duyệt một lần trong chat (ADR-0030 / 0031) — 2026-10-25

PM hỏi "ra lệnh cho agent qua chat để tạo ads". Agent chỉ đề xuất; tạo trên Meta chỉ khi người dùng duyệt thẻ kế hoạch.

- **`write_ad_copy`:**
  - gọi model của việc **viết nội dung** (AI router, khóa workspace; không có khóa → báo cấu hình);
  - trả 1–3 phương án tiêu đề + nội dung chính;
  - **phương án có con số người dùng chưa gõ bị loại** (vd. người dùng nói "giảm 30%", model viết "giảm 50%" → loại);
  - tối đa 3 lần gọi mỗi câu trả lời.
- **`propose_ad_plan`:**
  - tạo kế hoạch `proposed` (creative → nhóm QC mới → quảng cáo, bước sau tham chiếu bước trước);
  - tên / tiêu đề / nội dung chỉ được có số người dùng đã gõ hoặc số công cụ trả;
  - ngân sách ngày phải là số người dùng đã nói (hiểu "200k", "2 triệu") hoặc ngân sách nhóm QC mẫu;
  - sai → lỗi công cụ, agent phải hỏi lại.
- **Thẻ kế hoạch trong chat:**
  - đủ tham số từng bước: ảnh, tiêu đề, nội dung, CTA, link, ngân sách theo tiền tệ tài khoản, quốc gia, tuổi, audience,
    tham chiếu bước;
  - "Duyệt & chạy" chỉ hiện với người có quyền duyệt Client; vi phạm guardrail hiện ngay dưới bước;
  - đang chạy → cập nhật từng bước (thành công / lỗi / bỏ qua); "Bỏ kế hoạch"; kế hoạch hết hạn sau 24 giờ.
- **API:** `GET /api/v1/action-plans/[id]`, `POST …/approve` (202; vi phạm → 422 kèm kiểm từng bước), `POST …/cancel`.
  Sau cờ P2a; kế hoạch chỉ hiện với người xem được tài khoản QC.
- **Worker:** agent nhận thêm model viết nội dung theo tuyến `copywriting` (không bao giờ khóa nền tảng).
- **Prompt:** chỉ dẫn quy trình tạo quảng cáo (`launch_assets` → `write_ad_copy` → `propose_ad_plan`), không bao giờ nói
  "đã tạo".

**Vùng bảo vệ:** `packages/db/schema/agent.ts` (chỉ kiểu TS của tin nhắn: `plans`, `newName`, `newValue`; không
migration). Không chạm execution: agent gọi `createActionPlan` (chỉ tạo đề xuất).

**Test tự động:**
- `core/agent/ad-plan-tools.test.ts`:
  - số người dùng gõ hiểu "200k", "2 triệu", "1,5tr";
  - luồng đầy đủ: viết nội dung loại phương án "50%" → kế hoạch có "70%" bị từ chối → kế hoạch "30%" được tạo `proposed`,
    gắn tin nhắn, không có hành động nào;
  - ngân sách chưa nói → từ chối; không có model viết nội dung → lỗi; quá 3 lần viết → dừng ở 3;
  - cờ P2a tắt → không có hai công cụ.
- `api/v1/action-plans/[id]/action-plans.test.ts`: cờ tắt → 404; xem đủ bước; duyệt bước không hợp lệ → 422 kèm kiểm, vẫn
  chờ; buyer → 404; hủy, hủy lần hai → 409.
- Bộ cách ly: `GET /api/v1/action-plans/[id]`, `POST …/approve`, `POST …/cancel` (kế hoạch của B → 404).

**PM kiểm tra:**
1. Cài đặt → Tích hợp: có khóa AI.
2. Launcher: tải một ảnh.
3. AI Agents: "Tạo quảng cáo sale giảm 30% cho sản phẩm X, ngân sách 200k/ngày, link https://…" → thẻ kế hoạch 3 bước
   → "Duyệt & chạy" → từng bước chuyển ✓.
4. Nhật ký có 3 hành động; quảng cáo mới ở trạng thái tạm dừng.

## [137] Kế hoạch hành động: chuỗi tạo quảng cáo duyệt một lần, chạy tuần tự qua Execution Gateway (ADR-0031) — 2026-10-25

Lõi + job; công cụ agent và thẻ trong chat ở 138.

- **Kế hoạch** (`app.action_plans`):
  - tối đa 6 bước `create_creative` / `create_adset` / `create_ad`;
  - bước sau tham chiếu bước trước bằng `{ "ref": "<khóa>" }`, chỉ bước đứng trước và đúng loại;
  - trạng thái `proposed → approved → running → done | failed`, hoặc `canceled`; chưa duyệt thì hết hạn sau 24 giờ.
- **Duyệt một lần** (`approveActionPlan`):
  - quyền duyệt theo Client như Launcher;
  - mọi bước không tham chiếu chạy đủ kiểm tra của Launcher (nguồn, ảnh, link, guardrails, kill switch);
  - bước thứ n tính n − 1 bước trước vào giới hạn hành động / ngày;
  - vi phạm → trả kết quả kiểm từng bước, kế hoạch vẫn `proposed`.
- **Job `execute:plan`:**
  - kiểm cờ ở đầu job; chạy bằng quyền của người duyệt;
  - mỗi bước là một hành động duyệt tay trong Nhật ký (`params.plan_id`), thực hiện + xác minh như Launcher;
  - bước lỗi → dừng, các bước sau `skipped`, đối tượng đã tạo giữ nguyên (đều PAUSED / creative không tiêu tiền);
  - chạy lại job không ghi lần hai.
- **Gateway:**
  - `requestLaunch` tách phần kiểm (`checkLaunch`) và phần tạo hành động không enqueue (`insertPlannedLaunch`); hành vi
    `requestLaunch` không đổi;
  - nhóm QC mới được ghi vào bản chụp cấu trúc ngay, để bước quảng cáo tìm thấy.
- **Mock Meta (`write-mock`):** `createAd` nhận cả nhóm QC / creative vừa tạo trong phiên, như Meta thật.

**Vùng bảo vệ — cần PM duyệt, chạy staging trước khi merge `main`:**
- `packages/db`: migration 0087–0088, bảng `action_plans` có RLS;
- `packages/core/execution`: `plans.ts`, `gateway.ts` (tách hàm, không nới guardrail).

**Rủi ro:** kế hoạch tạo nhiều đối tượng trong một lần duyệt. Giảm thiểu:
- mọi đối tượng PAUSED;
- giới hạn hành động / ngày tính cả kế hoạch;
- người duyệt thấy đủ tham số (thẻ ở 138).

**Test tự động:**
- `core/execution/plans.test.ts`:
  - tham chiếu sai / khóa trùng / quá 6 bước / id lạ → từ chối;
  - duyệt → job chạy creative → nhóm QC → quảng cáo dùng đúng id vừa tạo, PAUSED, 3 hành động có `plan_id`; chạy lại →
    bỏ qua;
  - nhóm QC lỗi → `failed`, quảng cáo `skipped`, creative giữ;
  - ngân sách vượt guardrail → không duyệt được, báo đúng bước;
  - buyer không thấy; hết hạn; hủy; cờ tắt trước khi chạy → không bước nào chạy; cờ tắt → không tạo được;
  - 6 bước > 5 hành động / ngày → bước 6 bị chặn.
- Bộ cách ly job: `execute:plan`.
- Test cũ của Launcher (`launch.test.ts`) giữ nguyên, vẫn qua.

## [136] AI agent: công cụ đọc mới và đề xuất đủ loại thay đổi đã có — 2026-10-25

PM yêu cầu "nâng cấp bộ công cụ cho AI agent". Công cụ dùng chung cho chat AI Agents và MCP (ADR-0020).

- **Công cụ đọc mới:**
  - `account_structure`: chiến dịch / nhóm QC theo bản chụp (trạng thái, ngân sách ngày, giá thầu, giới hạn chi, mục tiêu
    tối ưu, chiến dịch cha). Agent tìm đúng đối tượng trước khi đề xuất.
  - `launch_assets`: nhóm QC làm mẫu, audience, Page, ảnh sẵn sàng trong thư viện creative, creative đã có. Chuẩn bị cho
    kế hoạch tạo quảng cáo (ADR-0031).
  - `store_summary`: doanh thu thật từ Shopify / Shopee / TikTok Shop, phiên / chuyển đổi GA4, chi tiêu và **MER tính
    sẵn trong code**. Agent trả lời được "MER tuần này của Client X?".
- **`propose_action` thêm loại** (vẫn chỉ tạo thẻ, người dùng xem trước và tự duyệt):
  - tạm dừng / bật lại chiến dịch;
  - đổi tên quảng cáo / nhóm QC / chiến dịch;
  - đổi giá thầu nhóm QC, đổi giới hạn chi tiêu chiến dịch.
  - Thiếu tham số (tên mới, giá trị mới) hoặc sai cấp đối tượng → lỗi công cụ.
- **Thẻ đề xuất trong chat:** hiện tên mới; hộp thoại duyệt điền sẵn tên / giá thầu / giới hạn chi đề xuất; xem trước
  trước → sau và guardrails như bảng chiến dịch.
- Kết quả `propose_action` nhắc lại tham số đề xuất, để câu trả lời nói đúng giá trị trên thẻ mà vẫn qua bộ kiểm số.
  Bộ kiểm số không đổi.

**Vùng bảo vệ:** không (agent chỉ đọc + tạo thẻ; ghi vẫn qua Execution Gateway khi người dùng duyệt).

**Test tự động:** `core/agent/tools.test.ts`:
- `account_structure`: giá thầu 40000 / giới hạn chi 60000000 từ dữ liệu mẫu, tên bọc «», tài khoản workspace khác → lỗi;
- `launch_assets`: chỉ ảnh `ready`;
- `store_summary`: doanh thu, đơn, MER = doanh thu / chi tiêu; buyer không có Client → không có số, Client lạ → lỗi;
- `propose_action`: thiếu tham số / sai cấp → lỗi; đổi tên, giá thầu → thẻ đúng, không tạo hành động; cờ P2a tắt → không
  có công cụ ghi.

Test cũ (`agent.test.ts`, `mcp.test.ts`) giữ nguyên.

**PM kiểm tra:** AI Agents → "Đổi tên chiến dịch X thành Sale 11.11" → thẻ đề xuất có tên mới → "Xem & duyệt" điền sẵn
tên; "MER 7 ngày của Client Y?" khi Client có kết nối cửa hàng.

## [135] Cài đặt → Tích hợp: nhiều khóa AI và chọn model cho từng việc (ADR-0030) — 2026-10-25

Giao diện cho AI router (134).

- **Thẻ "Mô hình AI của workspace":**
  - liệt kê mọi khóa đã lưu: nhà cung cấp, model, 4 ký tự cuối, trạng thái, lần dùng cuối, nút gỡ riêng từng khóa;
  - form "Thêm khóa" / "Đổi khóa / model của nhà cung cấp này": chọn nhà cung cấp đã có khóa thì để trống ô khóa để
    chỉ đổi model.
- **Khối "Model cho từng việc":** Phân tích (AI Agents), Viết nội dung quảng cáo, Tạo ảnh creative.
  - Mỗi dòng hiện model đang dùng, nhãn "Mặc định" / "Đã chọn".
  - Chỉ cho chọn nhà cung cấp đã có khóa và làm được việc đó. Tạo ảnh chỉ OpenAI, chọn model trong danh sách đóng.
  - Nút "Về mặc định".

**Vùng bảo vệ:** không.

**Test tự động:** E2E `creatives.spec.ts`: lưu khóa Anthropic rồi OpenAI → 2 khóa cùng hiện; tạo ảnh = `gpt-image-1`;
phân tích "Mặc định". API và lõi đã có test ở 134.

**PM kiểm tra:** Cài đặt → Tích hợp → thêm hai khóa → ở "Model cho từng việc" chọn model rẻ hơn cho "Viết nội dung
quảng cáo" → nhãn "Đã chọn"; bấm "Về mặc định" → quay về model của khóa phân tích.

## [134] AI router: nhiều khóa AI (mỗi nhà cung cấp một khóa), chọn model theo việc (ADR-0030) — 2026-10-25

PM yêu cầu: "Triển khai AI router và nâng cấp bộ công cụ cho AI agent". Phần này là lõi router; giao diện ở 135.

- **Nhiều khóa:**
  - workspace lưu được khóa Anthropic, OpenAI, Gemini, DeepSeek **cùng lúc**, mỗi nhà cung cấp một khóa;
  - lưu khóa nhà cung cấp B không còn xóa khóa nhà cung cấp A.
- **Việc AI và mặc định:**
  - `analysis` (AI agent chat): mặc định khóa cập nhật gần nhất;
  - `copywriting` (viết nội dung quảng cáo, dùng ở 138): mặc định theo `analysis`;
  - `image` (tạo ảnh creative): mặc định khóa OpenAI, model `gpt-image-1`.
- **Chọn model cho từng việc** (`app.llm_routes`):
  - chỉ Owner / Manager;
  - nhà cung cấp phải đã có khóa và làm được việc đó (ảnh chỉ OpenAI, model trong danh sách đóng);
  - xóa khóa → lựa chọn trỏ tới nhà cung cấp đó bị xóa;
  - nhật ký `llm_route.saved` / `llm_route.deleted`.
- **Worker:**
  - agent chat và AI tạo ảnh lấy client theo tuyến;
  - ghi lần dùng / mã lỗi lên đúng khóa của nhà cung cấp.
  - Workspace dùng Claude cho chat vẫn tạo ảnh được nếu có thêm khóa OpenAI.
- **Hạn mức ảnh AI:** thêm **20 ảnh / workspace / 24 giờ**, ngoài giới hạn 3 ảnh đang tạo.
- **API:**
  - `GET /api/v1/llm-routes`: mọi khóa (không khóa rõ) + model hiệu lực theo việc;
  - `PUT /api/v1/llm-routes`, `DELETE /api/v1/llm-routes?task=`;
  - `DELETE /api/v1/llm-key?provider=` xóa một khóa.

**Vùng bảo vệ:** `packages/db`, migration 0085–0086:
- `llm_keys` đổi ràng buộc duy nhất `workspace_id` → `(workspace_id, provider)`; dữ liệu cũ (≤ 1 khóa) giữ nguyên;
- bảng `llm_routes` có RLS.

Không chạm `connections` (dùng lại `encryptSecret` / `decryptSecret`).

**Test tự động:**
- `core/agent/router.test.ts`:
  - hai khóa cùng tồn tại, mặc định theo việc;
  - chọn model kiểm vai trò / nhà cung cấp / khóa / model ảnh;
  - worker gọi đúng endpoint + model theo việc, ghi lần dùng đúng khóa;
  - xóa khóa → route bị xóa, ảnh tắt;
  - workspace khác không thấy gì;
  - hạn mức 20 ảnh / ngày.
- `api/v1/llm-routes/llm-routes.test.ts`: cờ tắt → 404, danh sách không lộ khóa, chọn / bỏ / xóa khóa theo nhà cung cấp.
- Bộ cách ly: `GET|PUT|DELETE /api/v1/llm-routes`.
- Test cũ (`llm-keys`, `creative-image`, `llm-key` route) giữ nguyên, không sửa.

**PM kiểm tra:** Cài đặt → Tích hợp → lưu khóa Anthropic rồi khóa OpenAI → AI Agents trả lời bằng Claude; Launcher vẫn có
"AI tạo ảnh".

## [133] Kết nối TikTok Shop: đơn / doanh thu người bán trên TikTok theo Client (ADR-0029 phụ lục) — 2026-10-25

PM yêu cầu: "tích hợp thêm tiktok để lấy số khách bán trên tiktok". Đây là **TikTok Shop** (đơn bán), không phải TikTok
Ads (PM: chưa cần).

- **Kết nối → "Cửa hàng & Analytics" → Kết nối TikTok Shop:**
  - chọn Client → người bán ủy quyền trên Seller Center;
  - mỗi shop được ủy quyền thành một kết nối gắn Client đó;
  - đồng bộ 30 ngày đơn; hằng ngày 3 ngày.
- **`store-client` → TikTok Shop Open API 202309:**
  - chữ ký HMAC, URL ủy quyền (service id), đổi / làm mới token, danh sách shop (vùng → tiền tệ, múi giờ);
  - `orders/search` phân trang, bỏ đơn hủy, cộng tiền bằng decimal;
  - lỗi token → `TIKTOK_HTTP_401` → "Cần kết nối lại".
- **Token:**
  - lưu refresh token + `shop_cipher` (mã hóa);
  - refresh token dùng chung giữa các shop của một lần ủy quyền → khi TikTok đổi token, worker cập nhật mọi kết nối đang
    giữ token cũ (không làm hỏng shop còn lại).
- **Business Dashboard:** doanh thu / đơn / AOV / MER cộng chung web + sàn (Shopify, Shopee, TikTok Shop) của cùng Client.
- **Env mới:** `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_SERVICE_ID`.
  - **Hướng dẫn tạo app:** `docs/runbooks/store-connectors.md` mục 5.

**Vùng bảo vệ:** không đổi schema (`provider` thêm `tiktok_shop`, cột text); token dùng `core/connections/secrets`.

**Test tự động:**
- `store-client/tiktok-shop.test.ts`:
  - chữ ký đúng chuẩn (bỏ sign / access_token, có body);
  - phân trang `page_token`; bỏ đơn hủy; ngày theo múi giờ vùng; lỗi token → 401.
- `core/stores/stores.test.ts`:
  - 2 shop chung token: đồng bộ shop 1 xoay token thì shop 2 vẫn đồng bộ được;
  - doanh thu cộng chung; token không plaintext.
- Bộ cách ly: `GET /api/v1/stores/tiktok/authorize`, `callback`.

## [132] Kết nối Shopee: doanh thu / số đơn theo Client ở Business Dashboard (ADR-0029 phụ lục) — 2026-10-25

PM yêu cầu: sau Facebook, Google, Shopify thì tích hợp luôn Shopee (TikTok Ads chưa cần).

- **Kết nối → "Cửa hàng & Analytics" → Kết nối Shopee:** chọn Client → chủ shop đăng nhập Shopee Seller và ủy quyền shop
  → AdxLens lưu refresh token (mã hóa), đồng bộ 30 ngày đơn; hằng ngày 03:00 giờ shop → 3 ngày.
- **`store-client` → Shopee Open Platform v2:**
  - chữ ký HMAC (partner key), URL ủy quyền, đổi code / làm mới token;
  - thông tin shop (vùng → tiền tệ, múi giờ);
  - `get_order_list` theo cửa sổ 14 ngày + `get_order_detail` theo lô 50, bỏ đơn hủy, cộng tiền bằng decimal;
  - lỗi chỉ mã (token sai / hết hạn → `SHOPEE_HTTP_401` → "Cần kết nối lại").
- **Refresh token xoay vòng:** mỗi lần đồng bộ, worker lưu refresh token mới (mã hóa lại); token cũ hết hiệu lực.
- **Business Dashboard:** doanh thu / số đơn / AOV / MER cộng chung Shopify + Shopee của cùng Client (cùng tiền tệ).
- **Env mới:** `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_HOST` (sandbox / live).
  - **Hướng dẫn tạo app cho PM:** `docs/runbooks/store-connectors.md` mục 4.
- `state` OAuth gắn trong redirect URL (Shopee không trả lại `state`), đối chiếu cookie ký 10 phút.

**Vùng bảo vệ:** không đổi schema (`provider` thêm giá trị `shopee`, cột text); token dùng `core/connections/secrets`.

**Test tự động:**
- `store-client/shopee.test.ts`:
  - chữ ký đúng chuẩn v2, URL ủy quyền;
  - danh sách + chi tiết, bỏ đơn hủy, ngày theo múi giờ vùng;
  - lỗi token → 401.
- `core/stores/stores.test.ts`:
  - refresh token mới được lưu (mã hóa, khác bản cũ);
  - doanh thu cộng chung Shopify + Shopee;
  - bị thu hồi → cần kết nối lại.
- Bộ cách ly: `GET /api/v1/stores/shopee/authorize`, `callback`.

## [131] Kết nối Google Analytics 4 (Google OAuth): phiên / chuyển đổi theo Client ở Business (ADR-0029) — 2026-10-25

Bước 2 của kết nối cửa hàng / analytics (bước 1: Shopify [130]). PM chọn Google OAuth.

- **Kết nối → "Cửa hàng & Analytics" → GA4:**
  - nhập **Property ID** + chọn Client → **Kết nối Google Analytics** → đăng nhập Google, đồng ý quyền
    `analytics.readonly` (chỉ đọc);
  - AdxLens kiểm quyền đọc đúng property đó (không có quyền → `?store=noaccess`), lưu **refresh token mã hóa**, đồng bộ
    30 ngày; hằng ngày 03:00 giờ property → 3 ngày.
- **`store-client` → GA4:** URL OAuth (offline + consent), đổi code (thiếu refresh token → lỗi rõ), làm mới access token,
  đọc property (tên, tiền tệ, múi giờ), Data API `runReport` theo ngày (sessions, keyEvents); lỗi chỉ mã HTTP.
- **Business Dashboard** (nội bộ + link công khai): thêm ô **Phiên (GA4)**, **Chuyển đổi (GA4)**. Doanh thu GA4 **không**
  cộng vào doanh thu cửa hàng, để tránh tính trùng với Shopify.
- **Runbook** `docs/runbooks/store-connectors.md` mục 3: tạo OAuth client Google Cloud, bật API, test users / verification,
  redirect URI, sự cố (refresh token hết hạn sau 7 ngày khi app ở chế độ Testing).

**Vùng bảo vệ:** không đổi schema (dùng bảng của [130]); token dùng `core/connections/secrets`.

**Test tự động:**
- `store-client/ga4.test.ts`: URL OAuth (scope chỉ đọc, offline, consent); thiếu refresh token → lỗi; `runReport` → theo
  ngày; property id sai dạng bị chặn.
- `core/stores/stores.test.ts`: refresh token không plaintext; đồng bộ phiên / chuyển đổi; doanh thu cửa hàng không đổi
  khi có GA4.
- Bộ cách ly: `GET /api/v1/stores/ga4/authorize`, `callback`.

## [130] Kết nối Shopify: doanh thu / số đơn cửa hàng theo Client ở Business Dashboard (ADR-0029) — 2026-10-25

PM chọn: Shopify qua app OAuth Partner; GA4 qua Google OAuth (bước 131); mỗi shop / property gắn một Client; hiện ở
Business Dashboard (nội bộ + link công khai).

- **ADR-0029** (chấp nhận).
- **Package mới `packages/store-client`:** lớp duy nhất gọi API cửa hàng / analytics, chỉ đọc; có mock `STORE_MOCK=1`.
  - Shopify: dựng URL OAuth, kiểm `hmac` callback, đổi code lấy token, đọc thông tin shop;
  - đơn theo ngày (múi giờ shop, phân trang `Link`, bỏ đơn hủy / test, cộng tiền bằng decimal).
- **Module core mới `stores`:**
  - lưu kết nối (token **mã hóa** như token Meta; kết nối lại → thay token, giữ Client);
  - danh sách không token; gắn Client; ngắt kết nối (xóa token + số liệu ngày);
  - đồng bộ (chỉ worker giải mã); tổng hợp theo Client; lịch theo giờ shop.
- **Bảng mới** (migration 0083–0084, RLS theo workspace): `app.store_connections`, `analytics.store_daily`.
- **Job `sync:store_daily`:**
  - vừa kết nối → 30 ngày;
  - hằng ngày 03:00 giờ shop → 3 ngày (cùng scheduler với Meta);
  - 401 / 403 → kết nối "Cần kết nối lại".
- **Kết nối → thẻ "Cửa hàng & Analytics":** nhập shop + chọn Client → **Kết nối Shopify** (OAuth); danh sách shop,
  đổi Client, lần đồng bộ, ngắt kết nối. Chưa cấu hình app → hướng dẫn.
- **Business Dashboard** (nội bộ + link công khai `/b`): khi Client có shop → ô **Doanh thu cửa hàng, Số đơn, AOV cửa
  hàng, MER** (doanh thu cửa hàng / chi tiêu QC cùng kỳ, chỉ khi cùng tiền tệ; chia bằng decimal).
- **Env mới:** `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_VERSION`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `STORE_MOCK`.
  - **Hướng dẫn tạo app Shopify cho PM:** `docs/runbooks/store-connectors.md`.

**Vùng bảo vệ:** `packages/db` (2 bảng + RLS); token dùng `core/connections/secrets` (không đổi module connections).

**Test tự động:**
- `store-client/shopify.test.ts`:
  - chuẩn hóa shop / chặn host lạ; URL OAuth;
  - hmac đúng / sai secret / sai tham số; cộng tiền không float;
  - phân trang + múi giờ + bỏ đơn hủy / test; lỗi HTTP chỉ mã.
- `core/stores/stores.test.ts`:
  - token không plaintext, không trả ra; buyer bị chặn; Client workspace khác → 404; kết nối lại thay token;
  - đồng bộ ghi đè theo ngày + tổng theo Client; 401 → cần kết nối lại; ngắt kết nối xóa token + số liệu;
  - cách ly workspace; lịch theo giờ shop.
- Bộ cách ly:
  - route `stores`, `stores/[id]`, `stores/shopify/authorize`, `callback`;
  - job `sync:store_daily` (kể cả id kết nối của workspace khác).

## [129] Link Business Dashboard công khai cho khách (ADR-0028) — 2026-10-25

Gap "Link Business công khai" (PM chọn sau khi đối chiếu Madgicx Academy).

- **`/w/business` → "Chia sẻ với khách"** (thay nút sao chép link nội bộ):
  - tạo link công khai theo **Client**, kỳ 7 hoặc 30 ngày tới hôm qua (so với kỳ trước), mật khẩu và hạn
    (7 / 30 / 90 ngày) tùy chọn;
  - link được sao chép ngay;
  - danh sách link: lượt xem, thu hồi.
  - Cần quyền báo cáo (`reports.manage`) và quyền xem Client.
- **Trang công khai `/b/<token>`** (không cần đăng nhập, không index, mobile-first):
  - logo agency, tên khách, khối tổng hợp (khi các tài khoản cùng tiền tệ) và từng tài khoản QC;
  - cùng ô chỉ số như trang nội bộ; số do code tính từ snapshot.
- **Khóa như link báo cáo** (ADR-0007, P0-22 / 23): trong kỳ có tài khoản chưa xác nhận Client, ngày đối chiếu lệch
  > 1%, kết nối đã ngắt hoặc dữ liệu mẫu → trang hiện "Số liệu đang được cập nhật", không hiện số. Hết lý do → tự mở lại.
- **Bảo mật:**
  - token 32 byte;
  - mật khẩu scrypt + cookie ký 12 giờ cho đúng link;
  - thu hồi có hiệu lực ngay;
  - badge "Báo cáo bởi AdxLens" theo gói.
- **Bảng mới `app.business_links`** (migration 0081–0082, RLS theo workspace). Tra token ở `core/ops` (xuyên
  workspace có chủ đích, như link báo cáo).
- Ô chỉ số Business tách thành component dùng chung (`components/business-tiles.tsx`).

**Vùng bảo vệ:** `packages/db` (bảng + RLS).

**Test tự động:**
- `reporting/business-share.test.ts`:
  - buyer không tạo được; mật khẩu ngắn → 422;
  - trang công khai đúng kỳ 30 ngày tới hôm qua; đếm lượt xem;
  - mật khẩu → `password` / mở khóa → `ok`; thu hồi → `revoked`;
  - đối chiếu lệch trong kỳ / tài khoản chưa xác nhận → `locked`; hết hạn → `expired`.
- Bộ cách ly:
  - `GET/POST /api/v1/business-links`, `DELETE /api/v1/business-links/[id]` (Client của workspace khác → 404);
  - `POST /api/v1/public/business/[token]/unlock` (miễn trừ: trang công khai).

## [128] AI tạo ảnh cho creative bằng khóa OpenAI của workspace (ADR-0027) — 2026-10-25

Bước 2 của gap "Upload creative + AI tạo ảnh" (bước 1: [127]).

- **Thẻ "Creative mới" → khối "AI tạo ảnh"** (chỉ hiện khi workspace có khóa OpenAI ở Cài đặt → Tích hợp):
  - nhập mô tả (5–1000 ký tự) → **Tạo ảnh**;
  - ảnh hiện trong danh sách bản nháp khi xong (trang tự hỏi lại mỗi 5 giây);
  - chọn ảnh như ảnh tải lên → tạo creative (vẫn cần duyệt).
- Workspace không có khóa OpenAI → lời nhắn + link Cài đặt → Tích hợp. Không dùng khóa nền tảng.
- **Job `recommend:creative_image`:**
  - kiểm cờ `p2a_approve` ở đầu job;
  - khóa OpenAI chỉ giải mã trong worker; gọi OpenAI Images (`gpt-image-1`, 1024×1024);
  - kiểm ảnh theo byte rồi lưu PNG vào bucket private `creatives` (`<workspace>/<tài khoản>/<bản nháp>.png`);
  - bản nháp `ready`; lỗi chỉ ghi mã (vd. `LLM_HTTP_401`), không ghi khóa hay nội dung trả về; lần dùng / lỗi gần nhất
    hiện ở thẻ khóa AI như agent.
- **Giới hạn:** tối đa 3 ảnh đang tạo cùng lúc mỗi workspace (chặn chi phí ngoài ý muốn). Chi phí tính vào tài khoản
  OpenAI của agency.

**Vùng bảo vệ:**
- `packages/core/execution` (bản nháp: hoàn tất / đếm đang tạo);
- `packages/jobs` (job mới).
- Không đổi schema.

**Test tự động:**
- `core/agent/creative-image.test.ts`:
  - cần khóa OpenAI (Anthropic → 409); mô tả ngắn → 422; quá 3 ảnh đang tạo → 409;
  - worker gọi đúng endpoint + Bearer, lưu đúng đường dẫn, bản nháp ready; chạy lại → bỏ qua;
  - lỗi 401 chỉ ghi mã; không khóa / cờ tắt → failed, không lưu ảnh;
  - ảnh rỗng → mã lỗi riêng.
- **Bộ cách ly:**
  - route `POST /api/v1/creative-drafts/ai`;
  - job `recommend:creative_image` (kể cả biến thể id bản nháp của workspace khác → không chạm).

## [127] Creative mới: tải ảnh lên → tạo ad creative qua Execution Gateway (ADR-0027) — 2026-10-25

Gap "Upload creative + AI tạo ảnh" (PM chọn; AI dùng khóa OpenAI của workspace). Bước 1: tải ảnh lên + tạo creative.
Bước 2 (AI tạo ảnh) làm ở PR sau.

- **ADR-0027** (chấp nhận).
- **Bảng mới `app.creative_drafts`** (migration 0079–0080, RLS theo workspace): bản nháp ảnh theo tài khoản QC (tải lên /
  AI), trạng thái `generating` / `ready` / `failed`.
- **`/w/launcher` → thẻ "Creative mới":**
  - tải ảnh PNG / JPEG / WebP ≤ 5MB (kiểm theo byte đầu file, không tin đuôi file); ảnh lưu ở bucket **private**
    `creatives`, xem qua URL ký 1 giờ;
  - chọn ảnh, Page (tài sản đã đồng bộ), link đích **https**, nội dung chính (≤ 2000), tiêu đề (≤ 255), nút CTA (danh
    sách cố định), tên (tự gợi ý) → **Tạo creative** (duyệt tay).
- **Worker:** tải ảnh từ bucket → `POST /act_x/adimages` (lấy hash) → `POST /act_x/adcreatives` (`object_story_spec`
  ảnh + link + CTA) → đọc lại xác minh.
  - Creative mới vào bản chụp cấu trúc ngay, nên chọn được ở Ad Launcher để tạo quảng cáo (luôn PAUSED).
  - Worker không có kho ảnh / không đọc được ảnh → thất bại rõ ràng, không gọi Meta.
- Creative không tự tiêu tiền; không hoàn tác. Rule tự động không bao giờ tạo (`no_auto_create`).

**Vùng bảo vệ:**
- `packages/db` (bảng + RLS);
- `packages/core/execution`;
- `packages/meta-client/write` (`uploadAdImage`, `createAdCreative`, `getCreative`).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `launch.test.ts`:
  - nhận diện ảnh theo byte; bản nháp ngoài workspace bị chặn;
  - link http / Page lạ / ảnh chưa sẵn sàng / thiếu nội dung → chặn;
  - thiếu kho ảnh → `no_storage`, không gọi Meta;
  - đủ luồng: upload ảnh → creative → vào bản chụp.
- `api/v1/creative-drafts`:
  - PNG vào bucket theo workspace; URL ký; file lạ / > 5MB → 422;
  - cờ tắt / buyer chưa gán / workspace khác → 404.
- Bộ cách ly: thêm `GET/POST /api/v1/creative-drafts`, `POST /api/v1/launcher/creatives`.

## [126] Launcher: tạo nhóm QC mới (luôn tạm dừng) từ nhóm QC mẫu (ADR-0026) — 2026-10-25

Bước 2 của gap "Audience pixel + nhóm QC mới" (bước 1: [125]).

- **`/w/launcher` → thẻ "Nhóm QC mới":**
  - chọn nhóm QC mẫu; nhóm mới nằm cùng chiến dịch, chép mục tiêu tối ưu, sự kiện chuyển đổi, cách tính phí, chiến lược
    / mức giá thầu;
  - người dùng đặt tên (tự gợi ý theo Client · chiến dịch · quốc gia · độ tuổi), quốc gia (mã 2 chữ, tối đa 25), độ tuổi
    18–65, custom audience đưa vào (tối đa 10, không chọn = nhắm rộng), ngân sách ngày;
  - chiến dịch dùng ngân sách chiến dịch → nhóm mới không đặt ngân sách riêng.
- **Luôn PAUSED;** bật chạy là một hành động `resume_adset` riêng, đủ guardrail.
- **Guardrail mới `new_adset_budget_too_large`:** ngân sách ngày ≤ ngân sách nhóm QC mẫu × (1 + ngưỡng ngân sách, mặc
  định 15%). Kiểm lúc duyệt và lúc worker chạy.
- **Gọi Meta:** đọc nhóm QC mẫu → `POST /act_x/adsets` (status PAUSED).
  - Đọc lại xác minh PAUSED + đúng chiến dịch; lỗi giữa chừng → không đoán, báo kiểm tra thủ công.
  - Không hoàn tác.
- **Rule tự động không bao giờ tạo nhóm QC** (`no_auto_create`).
- Nguồn audience phải là audience đã đồng bộ của đúng tài khoản; nhóm QC mẫu phải thuộc tài khoản.

**Vùng bảo vệ:**
- `packages/core/execution` (gateway, guardrail mới);
- `packages/meta-client/write` (`createAdSet`, `adSetTargeting`).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `launch.test.ts`:
  - ngân sách +30% → chặn; thiếu ngân sách / quốc gia / độ tuổi sai → 422;
  - audience / mẫu lạ → 404;
  - tạo PAUSED + xác minh; sai trạng thái → `verify_mismatch`;
  - tier auto → `no_auto_create`.
- `meta-client/write.test.ts`: dựng targeting, chặn giá trị sai.
- Bộ cách ly: thêm `POST /api/v1/launcher/adsets`.

## [125] Audience Launcher: custom audience từ pixel / tương tác Page / Instagram (ADR-0026) — 2026-10-25

Gap "Audience pixel + nhóm QC mới" (PM chọn sau khi đối chiếu Madgicx Academy). Bước 1: custom audience. Bước 2 (nhóm
QC mới, luôn PAUSED) làm ở PR sau.

- **ADR-0026** (chấp nhận): `create_custom_audience`, `create_adset`. Chỉ duyệt tay; rule tự động không bao giờ tạo.
- **`/w/launcher` → thẻ "Custom audience từ pixel / tương tác"**, 3 loại nguồn:
  - **Website (pixel):**
    - mọi lượt truy cập, hoặc một sự kiện: Xem trang, Xem nội dung, Thêm vào giỏ, Bắt đầu thanh toán, Mua hàng,
      Khách tiềm năng;
    - 1–180 ngày.
  - **Tương tác Page:** 1–365 ngày.
  - **Tương tác Instagram:** 1–365 ngày.
- Tên tự đặt theo tên Client · sự kiện · nguồn · số ngày; sửa được.
- **Nguồn chỉ là tài sản đã đồng bộ của workspace** (ADR-0016); pixel phải thuộc đúng tài khoản QC. Nguồn lạ → 404.
- **Gọi Meta:** `POST /act_x/customaudiences` (`rule` JSON, `prefill=1`).
  - Đọc lại để xác minh `subtype` (WEBSITE / ENGAGEMENT).
  - Lỗi giữa chừng → không đoán, báo kiểm tra thủ công.
  - Không hoàn tác (audience không tự tiêu tiền).
- Nhật ký hành động: "Đã tạo audience".

**Vùng bảo vệ:**
- `packages/core/execution`;
- `packages/meta-client/write` (`createCustomAudience`, `customAudienceRule`).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `launch.test.ts`:
  - pixel của tài khoản khác / Page lạ → 404; quá 180 ngày, sự kiện lạ → 422;
  - tạo + xác minh WEBSITE; tương tác Page → ENGAGEMENT; sai loại → `verify_mismatch`.
- `meta-client/write.test.ts`: dựng `rule` pixel / mọi lượt / Instagram; chặn số ngày và id sai.
- Bộ cách ly: thêm `POST /api/v1/launcher/audiences`.

## [124] Đổi giá thầu nhóm QC và giới hạn chi tiêu chiến dịch qua Execution Gateway (ADR-0025) — 2026-10-25

Bước 2 của gap "Giá thầu + giới hạn chi + đổi tên" (bước 1: đổi tên ở [119]).

- **Đồng bộ thêm từ Meta:** `bid_amount`, `bid_strategy` của nhóm QC và `spend_cap` của chiến dịch (lưu trong `attrs`).
- **`set_adset_bid`** (`POST /{adset_id}` với `bid_amount`):
  - chỉ nhóm QC đang có giá thầu (Bid cap / Cost cap); chiến lược tự động → `no_bid_amount`;
  - |thay đổi| ≤ ngưỡng ngân sách (mặc định 15%, workspace chỉ đặt chặt hơn) → `bid_change_too_large`.
- **`set_campaign_spend_cap`** (`POST /{campaign_id}` với `spend_cap`):
  - hạ hoặc đặt mới luôn được (thêm phanh);
  - nâng > ngưỡng → `spend_cap_change_too_large`;
  - không gỡ giới hạn.
- **Chung:**
  - đọc giá trị thật ngay trước khi ghi; đã bị đổi trên Meta sau khi duyệt thì không ghi đè;
  - xác minh bằng cách đọc lại; cập nhật bản chụp cấu trúc;
  - hoàn tác chịu cùng guardrail (hạ mạnh rồi hoàn tác = nâng quá ngưỡng → bị chặn);
  - chiến dịch trước đó chưa có giới hạn chi thì không hoàn tác.
  - Rule tự động không bao giờ tạo (`no_auto_edit`).
- **Giao diện (bảng chiến dịch / nhóm QC):**
  - nút **Giá thầu** ở nhóm QC có giá thầu; nút **Giới hạn chi** ở chiến dịch;
  - hộp thoại nhập giá trị mới → xem trước "cũ → mới" + vi phạm guardrail → duyệt;
  - Nhật ký hiện giá trị theo tiền tệ tài khoản.
- Ô nhập cùng đơn vị với ô ngân sách hiện có (đơn vị nhỏ nhất của Meta; xem nợ kỹ thuật `ZERO_DECIMAL`).
- **Chưa làm:** nút trong Ads Manager mới (đang có ở bảng của trang khách / tài khoản).

**Vùng bảo vệ:**
- `packages/core/execution` (gateway, guardrails, hoàn tác);
- `packages/meta-client/write` (`setBidAmount`, `setSpendCap`).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `execution/bid-cap.test.ts`:
  - giá thầu +10%: ghi, xác minh, bản chụp, hoàn tác;
  - +20% / chiến lược tự động / trùng giá → chặn;
  - giới hạn chi: hạ được, nâng > 15% chặn, hoàn tác (vừa / mạnh), đặt mới không hoàn tác;
  - đổi trên Meta → không ghi đè; rule tự động bị chặn.
- `lib/actions.test.ts`: hiển thị giá thầu / giới hạn chi / đổi tên.
- `grid-actions.test.ts`: thiếu giá trị → 422.

## [123] Bỏ xóa workspace ở Cài đặt; nút "Đồng bộ lại" ở trang Kết nối — 2026-10-25

PM yêu cầu:
- "bỏ tính năng xóa workspace ở phần cài đặt luôn, ko cho user xóa workspace. Nếu user muốn xóa dữ liệu thì đã có trong
  phần Ngắt kết nối";
- thêm nút chạy đồng bộ lại vào trang Kết nối.

- **Không còn xóa workspace phía người dùng:**
  - bỏ khối "Xóa workspace" ở Cài đặt → Workspace;
  - bỏ API `DELETE /api/v1/workspace`;
  - bỏ `deleteWorkspace` / `onWorkspaceDelete` trong `core/tenancy` (không còn ai dùng).
- Xóa dữ liệu: Ngắt kết nối (luồng xóa có mã). Xóa hẳn workspace: chỉ superadmin ở trang admin ([122]).
- Bỏ dòng nợ kỹ thuật về ST01 (hàm đã bị gỡ).
- **Kết nối → bảng tài khoản QC:** mỗi tài khoản có token hợp lệ có nút **Đồng bộ lại**.
  - Chọn 7 / 30 / 90 ngày tới hôm qua theo múi giờ tài khoản.
  - Xong thì tự đối chiếu lại; dùng chung API với nút ở trang Đối chiếu.
- **Chặn bấm trùng:** tài khoản đang có lần đồng bộ chưa xong (backfill / chạy lại) → 409 "Tài khoản đang đồng bộ", để
  không tốn quota Meta. Áp cho cả nút của staff ở admin. Playbook tự đồng bộ lại khi đối chiếu lệch (có độ
  trễ 24 giờ) không bị chặn.

**Test tự động:**
- `ingestion.test.ts`: đang đồng bộ → 409; xong rồi thì chạy lại được.
- `connections/resync-button.test.tsx`: tính khoảng ngày theo lịch.
- **Đổi test (quy tắc 8):** `settings.test.ts` "xóa workspace: chỉ owner, phải nhập đúng tên" thành "không có API xóa
  workspace cho người dùng", vì PM bỏ tính năng.

## [122] Trang admin: xóa workspace và xóa tài khoản người dùng — 2026-10-25

PM yêu cầu "cho phép xóa account và workspace ở trang admin".

- **Xóa workspace** (`/admin/workspaces/[id]` → **Vùng nguy hiểm**):
  - chỉ superadmin; gõ đúng tên workspace; bắt buộc lý do;
  - xóa mọi dòng có `workspace_id`, kể cả analytics và kết nối Meta (token bị xóa theo). Danh sách bảng đọc từ DB nên
    không sót bảng mới; bảng tham chiếu nhau không cascade được xóa theo nhiều lượt;
  - nhật ký admin và nhật ký cờ được giữ;
  - xong thì chuyển về danh sách workspace.
- **Xóa tài khoản** (nút trên từng dòng thành viên, trừ Owner):
  - chỉ superadmin; gõ đúng email; bắt buộc lý do;
  - xóa khỏi mọi workspace, xóa dữ liệu theo người dùng (thông báo, hội thoại AI, quyền OAuth…), xóa tài khoản đăng nhập
    Supabase;
  - **chặn:** tự xóa mình; tài khoản staff (gỡ quyền staff trước); người đang là Owner (xóa workspace hoặc chuyển quyền
    Owner trước).
- Mỗi thao tác ghi nhật ký admin (`workspace.deleted`, `user.deleted`).
- Truy vấn xuyên workspace có chủ đích nằm ở `core/ops` (quy tắc 1). Route mới thêm vào bộ cách ly (miễn trừ staff).
- **Nợ kỹ thuật ghi thêm:** ST01 (Owner tự xóa workspace) chỉ dựa vào cascade nên bỏ lại dữ liệu ở các bảng không có
  khóa ngoại (xem `docs/tech-debt.md`).

**Test tự động:** `core/ops/admin-delete.test.ts`:
- operator bị chặn; sai tên / thiếu lý do → từ chối;
- xóa trọn dữ liệu workspace (gồm analytics), workspace khác không bị đụng; có nhật ký;
- xóa tài khoản: chặn tự xóa / staff / Owner / sai email; xóa thành viên + đăng nhập; Owner và workspace nguyên vẹn.

## [121] AI Agents: hiển thị câu trả lời dạng markdown — 2026-10-25

PM yêu cầu "pretify câu trả lời từ AI": câu trả lời đang hiện chữ thô với dấu `**`.

- Câu trả lời của agent hiển thị dạng markdown:
  - **đậm**, *nghiêng*, `code`;
  - tiêu đề;
  - danh sách gạch đầu dòng / đánh số (kể cả dòng tiếp nối);
  - bảng `| … |`;
  - xuống dòng trong đoạn.
- **Bộ đọc markdown tự viết, tối giản** (`lib/mini-markdown.ts`):
  - dựng thành phần tử React, không dùng HTML thô, nên nội dung LLM không chèn được thẻ / script;
  - không thêm thư viện mới.
- Dấu `*` trong phép nhân / số (vd. `2 * 3`) không bị hiểu nhầm là chữ nghiêng.

**Test tự động:** `lib/mini-markdown.test.ts`:
- trong dòng: đậm / nghiêng / code;
- câu trả lời thật của agent (đoạn + danh sách + kết luận);
- tiêu đề, danh sách đánh số, bảng;
- thẻ HTML chỉ là chữ.

## [120] Script dọn dữ liệu test / mock trong DB local (`pnpm purge:test-data`) — 2026-10-25

PM yêu cầu "xóa hết dữ liệu mock ở trang admin". PM chọn: xóa dữ liệu test + mock, giữ workspace thật; làm bằng script
có chạy thử.

- **`pnpm purge:test-data`:** chạy thử, chỉ in số lượng sẽ xóa. Thêm `-- --apply` để xóa thật.
- **Chỉ chạy với DB trên máy** (127.0.0.1 / localhost), không bao giờ staging / production (quy tắc 9).
- **Workspace không có kết nối Meta thật** (id người dùng Meta dạng số, không phải mẫu): xóa cả workspace và mọi dòng có
  `workspace_id`. Danh sách bảng đọc từ DB nên không sót bảng mới.
- **Workspace có kết nối thật:** giữ; chỉ gỡ kết nối mock / mẫu bên trong cùng tài khoản QC và dữ liệu của chúng.
- **User test** (`@e2e.local`, `@test.local`) không còn thuộc workspace nào được giữ: xóa ở app và Supabase Auth, kể cả
  đăng ký test chưa vào app.
- Trong giao dịch xóa, tắt khóa ngoại và trigger chỉ-thêm (`session_replication_role = replica`), để xóa trọn nhật ký
  của dữ liệu test.
- **Đã chạy trên DB local** (dùng chung bản dev + bản team) ngày 25/10:
  - giữ 3 workspace: Tan Trinh, Tan Trinh - thật, Nguyễn văn test;
  - xóa 284 workspace test, 325 user test + 16 tài khoản đăng nhập test;
  - gỡ 1 kết nối Meta mock (3 tài khoản QC).
- Gỡ file truy vấn tạm `packages/db/q-tmp.mjs` bị commit nhầm ở [119] (làm CI lint lỗi).

**Test tự động:** `scripts/lib/purge-test-data.test.ts`:
- nhận diện kết nối thật / mock / mẫu;
- chỉ chấp nhận DB local;
- chia giữ / xóa: user test còn thuộc workspace được giữ thì giữ; email thật không bao giờ bị xóa.

## [119] Đổi tên quảng cáo / nhóm QC / chiến dịch qua Execution Gateway (ADR-0025) — 2026-10-25

PM chọn làm gap "Giá thầu + giới hạn chi + đổi tên" (đối chiếu Madgicx Academy). Bước này làm **đổi tên**. Giá thầu và
giới hạn chi làm ở bước sau theo cùng ADR.

- **ADR-0025** (chấp nhận): đổi tên, giá thầu nhóm QC, giới hạn chi chiến dịch.
  - Chỉ duyệt tay; rule tự động không bao giờ tạo (`no_auto_edit`).
  - Guardrails giữ nguyên.
- **Hành động mới:** `rename_ad`, `rename_adset`, `rename_campaign`.
  - Gọi `POST /{id}` với `name`.
  - Trạng thái trước = tên theo lần đồng bộ gần nhất.
  - Ngay trước khi ghi, đọc lại tên thật. Tên đã bị đổi trên Meta sau khi duyệt thì không ghi đè (`state_changed`).
  - Verify bằng cách đọc lại tên; cập nhật bản chụp cấu trúc.
  - Hoàn tác về tên cũ.
- **Kiểm tên:** bỏ khoảng trắng hai đầu, 1–400 ký tự, không ký tự điều khiển, khác tên hiện tại.
- **Giao diện:**
  - Ads Manager có nút bút chì cạnh tên;
  - bảng chiến dịch / nhóm QC / QC có nút "Đổi tên";
  - hộp thoại nhập tên mới → xem trước "tên cũ → tên mới" → duyệt;
  - Nhật ký hành động hiện tên cũ → mới.

**Vùng bảo vệ:**
- `packages/core/execution` (gateway, guardrails, hoàn tác);
- `packages/meta-client/write` (`setName`; chỉ execution import).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Sửa lỗi của [118]:** sau khi gộp trang chủ, ô trống của `/w` hiện nút "Kết nối Meta" cho cả buyer. `/overview` cũ có
kiểm quyền `connections.manage`, nay `/w` kiểm lại đúng như vậy. E2E `auth-workspace` (buyer không thấy Kết nối) bắt
được lỗi này.

**Test tự động:** `execution/rename.test.ts`:
- luồng đủ: xem trước → duyệt → ghi 1 lần → xác minh → bản chụp → hoàn tác;
- tên không hợp lệ / trùng → từ chối;
- tên bị đổi trên Meta sau khi duyệt → không ghi đè;
- rule tự động không đổi tên; cờ tắt → không chạy.

## [118] Một giao diện duy nhất: gộp giao diện cổ điển vào khung Workspace — 2026-10-25

PM báo lỗi: đang ở giao diện mới, mở chi tiết chiến dịch / nhóm QC / QC / bài post thì quay về sidebar cũ. PM chọn:
- trang chủ là `/w`, có thêm khối "Cần chú ý" của agency;
- các điều khiển của thanh trên cũ gộp vào sidebar.

- **Khung chung** (`components/workspace/app-shell.tsx`):
  - mọi trang trong app (`/w/*` và khoảng 35 trang có từ giao diện cổ điển) dùng cùng sidebar;
  - URL không đổi, nên link cũ, bookmark và link trong email / báo cáo vẫn chạy;
  - không bỏ trang hay tính năng nào.
- **Sidebar mới:**
  - logo + chọn workspace (vai trò, "Tạo workspace mới");
  - chọn khách; nút Tạo;
  - 3 nhóm:
    - **Phân tích:** Trang chủ, Business, Quảng cáo, Ads Manager, Phễu, Địa lý, Mở rộng, Audiences;
    - **Khách & báo cáo:** Clients, Báo cáo, Việc tuần này, Creative;
    - **Thực thi:** AI Agents, Launcher, Rule tự động, Nhật ký hành động;
  - đáy: Cảnh báo, Kết nối, Cài đặt, menu tài khoản (hồ sơ, thông báo, ngôn ngữ, đăng xuất);
  - đang xem một Client thì sidebar chuyển sang menu của Client đó (G3) như trước;
  - cờ và vai trò ẩn mục như trước.
- **Trang có từ giao diện cũ** có dòng đầu trang: breadcrumb + chọn kỳ (Tháng này / Tháng trước giữ nguyên).
- **Trang chủ:**
  - `/overview` chuyển về `/w`;
  - `/w` thêm khối "Khách cần chú ý" (lệch đối chiếu, lỗi đồng bộ, phát hiện mức cao, ngân sách, sức khỏe);
  - `/w` thêm banner "tài khoản chưa gán Client";
  - màn chào mừng buyer mới chuyển sang `/w`.
- Bỏ nút "Giao diện cổ điển" / "Thử giao diện mới"; xóa `components/shell/sidebar.tsx` và `top-bar.tsx`.

**Test tự động:**
- `workspace-nav.test.ts`:
  - `shellNav` gom đủ mục của 2 giao diện cũ;
  - cờ tắt thì nhóm Thực thi ẩn;
  - buyer không có Báo cáo / Kết nối;
  - nhãn đúng namespace.
- **Đổi test (quy tắc 8)**, vì đúng hành vi PM vừa chọn (bỏ giao diện cổ điển, `/overview` chuyển về `/w`):
  - E2E `workspace-home`: bỏ bước bấm "Thử giao diện mới" / "Giao diện cổ điển"; thêm kiểm tra mở Clients vẫn cùng
    khung;
  - E2E `helpers`, `auth-workspace`: URL sau đăng ký / nhận lời mời là `/w`;
  - E2E `clients-assign`: kiểm tra khối "Cần chú ý" ở `/w`; Client vừa gán kiểm ở `/clients`.

## [117] Mô hình AI của workspace: thêm Google Gemini và DeepSeek, mở rộng danh sách model — 2026-10-25

PM yêu cầu: "tích hợp thêm các model khác nhau của anthropic, gemini, openAi và deepseek".

- **Cài đặt → Tích hợp → Mô hình AI của workspace:**
  - chọn được 4 nhà cung cấp: Anthropic (Claude), OpenAI (GPT), Google (Gemini), DeepSeek;
  - mỗi nhà cung cấp có danh sách model gợi ý; gõ được tên model khác mà tài khoản dùng được;
  - có hướng dẫn chỗ tạo khóa cho từng nhà cung cấp.
- **Model gợi ý:**
  - Anthropic: Sonnet / Opus / Haiku 5.5, Fable 5.1, Sonnet 4.5;
  - OpenAI: GPT-5 / 5 mini / 5 nano, GPT-4.1 / 4.1 mini, o4-mini;
  - Gemini: 2.5 Pro / Flash / Flash-Lite;
  - DeepSeek: `deepseek-chat`, `deepseek-reasoner`.
- **Gemini và DeepSeek** dùng API tương thích OpenAI Chat Completions, có tool calling. Vòng công cụ, kiểm số (quy tắc
  5) và cách ly khóa giữ nguyên:
  - khóa chỉ giải mã trong worker;
  - lỗi chỉ ghi mã HTTP.
- **Kiểm dạng khóa:**
  - Gemini: `AIza…`;
  - DeepSeek: `sk-…`.
- `packages/db`: hằng `LLM_PROVIDERS` thêm 2 giá trị. Cột là `text`, không có ràng buộc DB, nên **không có migration**
  (`db:check` khớp).

**Test tự động:** `llm-keys.test.ts`:
- Gemini / DeepSeek: chặn khóa sai dạng;
- gọi đúng endpoint với `max_tokens` và Bearer;
- id tool call rỗng được tự đặt.

## [116] Cờ tính năng toàn app × gói + ngoại lệ; kết nối là đồng ý cho ghi (ADR-0024) — 2026-10-25

PM yêu cầu ngày 25/10/2026: "đã qua giai đoạn thử nghiệm", quản lý cờ cho toàn app và theo gói; kết nối là đồng ý cho
app quyền kiểm soát tài khoản.

- **Quy tắc mới:** tính năng chạy khi **cờ toàn app bật VÀ gói của workspace có**, trừ ngoại lệ của workspace (bật thêm /
  tắt riêng). Thứ tự cha → con giữ nguyên.
- **`/admin/flags`** làm lại thành 3 phần:
  - **Toàn app**: bật / tắt từng cờ, superadmin, bắt buộc lý do; tắt cờ cha tắt luôn cờ con;
  - **Theo gói**: ma trận gói × tính năng, mặc định theo bảng giá, superadmin sửa;
  - **Ngoại lệ theo workspace**: mỗi ô hiện giá trị hiệu lực + nhãn "bật thêm / tắt riêng"; bấm để chọn Bật thêm / Tắt
    riêng / Theo toàn app × gói;
  - nhật ký thay đổi toàn app / gói.
- **Checklist** chỉ để tham khảo, không chặn bật cờ hay duyệt đề xuất nữa.
- **Quyền ghi Meta:**
  - kết nối có `ads_management` được ghi ngay, bỏ bước "Cấp quyền ghi";
  - Owner vẫn tắt được; kết nối lại không ghi đè lựa chọn đã tắt;
  - kết nối hiện có (chưa từng chỉnh) được bật theo quyết định này.
- Execution Gateway / rule không kiểm gói riêng nữa: gói đã nằm trong cờ hiệu lực, nên ngoại lệ "bật thêm" hoạt động.
- **Chuyển đổi:**
  - cờ toàn app khởi tạo **tắt** (không tự bật cờ, quy tắc 7);
  - cờ đang bật theo workspace giữ thành "bật thêm";
  - dòng "tắt" cũ bị xóa.
- `CLAUDE.md`: câu mô tả cờ ở mục "Sản phẩm" sửa theo ADR-0024.

**Vùng bảo vệ:**
- `packages/core/flags`;
- `packages/db` (migration 0077–0078: bảng mới + chuyển đổi dữ liệu);
- `packages/core/connections` (mặc định quyền ghi);
- `packages/core/execution` (bỏ `plan_required`).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `flags.test.ts`:
  - mặc định toàn app tắt; ma trận gói theo bảng giá;
  - bật toàn app × gói (Free chỉ P0, Growth đủ); sửa ma trận;
  - tắt cờ cha toàn app tắt cờ con; nhật ký;
  - ngoại lệ bật thêm / tắt riêng / bỏ; chỉ superadmin đổi toàn app / gói.
- `api/v1/admin/flag-scopes.test.ts`: API toàn app / gói / bỏ ngoại lệ / nhật ký, quyền operator.
- **Đổi test (quy tắc 8)**, vì đúng hành vi PM vừa đổi:
  - `flags.test.ts`: 2 test "checklist chưa đạt thì chặn" thành "không chặn, vẫn ghi nhật ký";
  - `admin.test.ts`, `admin-roles.test.ts`: bỏ bước "vượt checklist";
  - `gateway.test.ts`: "gói Free → 402" thành "toàn app bật nhưng gói Free không có P2a → 404";
  - `gateway.test.ts`, `launch.test.ts`: `write: false` nghĩa là Owner tự tắt quyền ghi;
  - `rules.test.ts`: `plan_required` thành `feature_disabled` qua toàn app × gói;
  - `write-access.test.ts`: kết nối có `ads_management` → được ghi ngay.
  - Không bỏ kiểm tra an toàn nào: kill switch, guardrail, quyền theo Client, `no_write_access` khi Owner tắt vẫn được
    test.
- E2E: helper `forceFlagOn` thay luồng checklist; bỏ bước "Cấp quyền ghi".

**PM làm sau khi cập nhật:**
1. Vào `/admin/flags` → **Toàn app** → bật lần lượt Báo cáo → Gợi ý → Duyệt 1 click → Tự động hóa.
2. Xem / sửa ma trận **Theo gói**.

## [115] Sửa: ảnh creative mờ — 2026-10-25

- **Lỗi** (PM báo): ảnh ở Workspace › Quảng cáo, thư viện Creative và báo cáo rất mờ. Meta mặc định trả `thumbnail_url`
  khoảng 64×64, app phóng lên thẻ lớn.
- **Sửa:**
  - đồng bộ xin thumbnail **720×720** (`thumbnail_width` / `thumbnail_height` khi đọc `adcreatives`);
  - creative ảnh dùng `image_url` gốc khi có (lưới quảng cáo, thư viện creative, top quảng cáo trong báo cáo).
- Ảnh rõ sau **lần đồng bộ kế tiếp**: bản chụp hiện tại vẫn là link ảnh nhỏ.

**Test tự động:** `meta-client/read.test.ts` (xin thumbnail 720×720); test lưới quảng cáo / thư viện creative vẫn qua.

## [114] Sửa: bấm "Kết nối Meta" báo "Thiếu workspace (header X-Workspace-Id)" — 2026-10-25

- **Lỗi** (PM báo trên bản team): link điều hướng `GET /api/v1/connections/meta/authorize` trả 400 khi trình duyệt chưa có
  cookie chọn workspace `ws`, vd. chưa từng chuyển workspace hoặc trình duyệt mới. Trang thì vẫn hiện bình thường vì
  `getPageContext` tự lấy workspace đầu tiên.
- **Sửa:** `route()` dùng cùng quy tắc với trang. Không có header / cookie thì dùng workspace đầu tiên của người dùng (theo
  tên, như trang). Người dùng không thuộc workspace nào vẫn trả 400. Header / cookie của workspace không phải thành viên
  vẫn trả 403.
- **Đổi test (quy tắc 8):** `server/route.test.ts`, test "400 khi thiếu workspace" nay kiểm hành vi mới: thiếu workspace
  → workspace đầu tiên; không có workspace → 400; không phải thành viên → 403. Assertion không giảm; thêm ca không có
  workspace. Bộ cách ly workspace giữ nguyên và vẫn qua.

## [113] Audiences: interest gợi ý (Madgicx Audience Studio "Discover Similar") — 2026-10-25

- **Khi đồng bộ cấu trúc**, worker lấy tối đa 10 interest đang dùng nhiều nhất của tài khoản và hỏi Meta gợi ý
  (`search?type=adinterestsuggestion`, chỉ đọc, quyền `ads_read`).
  - Lưu tối đa 30 gợi ý chưa dùng làm entity `interest`: tên, nhóm, quy mô Meta ước tính, gợi ý từ interest nào.
  - Lỗi / thiếu quyền thì bỏ qua, không chặn đồng bộ.
  - Token chỉ giải mã trong worker (quy tắc 2), nên web chỉ đọc bản đã lưu.
- **Workspace › Audiences** có thêm bảng **Interest gợi ý**: gộp trùng giữa tài khoản, sắp theo quy mô.

**Test tự động:**
- `reporting/audiences.test.ts`: gợi ý được lưu khi đồng bộ, bỏ interest đang dùng, sắp theo quy mô, ghi nguồn; buyer
  không thấy.
- E2E: bảng gợi ý trên trang Audiences.

## [112] Gap giao diện so với Madgicx: lọc giai đoạn phễu, Mở trong Ad Launcher, nhiều nhóm QC, tem tên — 2026-10-25

Từ đối chiếu gap (`docs/research/madgicx-2026-10.md` mục 7).

- **Ads Manager mới:** bộ lọc **giai đoạn phễu** (Tìm khách mới / Tương tác lại / Bám đuổi / Giữ chân).
  - Quảng cáo lấy giai đoạn theo nhóm QC cha.
  - Chế độ cây vẫn hiện chiến dịch có nhóm QC khớp.
- **Creative → "Mở trong Ad Launcher"** (khi cờ P2a bật): mở Launcher đúng tài khoản, creative chọn sẵn.
- **Ad Launcher:**
  - chọn **tối đa 5 nhóm QC** một lần (Madgicx Ad Picker); mỗi cặp nhóm QC × creative là một hành động duyệt, tối đa 10
    cặp mỗi lần;
  - bị chặn giữa chừng (vd. hết hạn mức hành động hôm nay) thì dừng, báo "đã gửi n / tổng";
  - **tem tên**: tên quảng cáo mặc định bắt đầu bằng tên Client (Madgicx white label "asset name stamp").

**Test tự động:**
- `api/v1/launcher/launcher.test.ts`:
  - nhiều nhóm QC → mỗi cặp một hành động, tên đánh số;
  - hết hạn mức giữa chừng → dừng, trả số đã tạo;
  - hết hẳn → 422;
  - quá 10 cặp → 422.
- E2E `p2a.spec.ts` cập nhật cách chọn: nhóm QC chọn sẵn, chọn creative theo nhãn.

## [111] Sửa nút cập nhật bản team: lỗi build do kiểu route cũ — 2026-10-25

- **Lỗi:** `Cap-nhat-AdxLens.cmd` build lỗi `Type '"/w"' is not assignable to type 'LayoutRoutes'`. Nguyên nhân: Next kiểm
  kiểu cả `.next/types` của lần build trước lẫn `.next-next/types` của bản mới.
- **Sửa:** `scripts/team.mjs` xóa `apps/web/.next/types` trước khi build. App đang chạy không dùng file kiểu, nên team
  không bị gián đoạn thêm.

## [109] (đã gỡ) Bản xem trước cho PM — 2026-10-25

PM thấy không cần, nên đã gỡ lại toàn bộ: `Xem-truoc-AdxLens.cmd`, `scripts/preview*.mjs`, biến `WORKER_SCHEDULES`.
`Cap-nhat-AdxLens.cmd` lấy `develop` mới nhất như trước. Từ giờ dev push xong thì cập nhật bản team luôn để PM test trên
https://adxlens-dev.sctech.io.vn.

## [108] Tạm dừng / bật lại chiến dịch ngay trong AdxLens (ADR-0015) — 2026-10-25

PM duyệt ngày 25/10/2026 ("Phần có ghi Meta thì cũng làm luôn"). ADR-0015 chuyển sang **Chấp nhận**.

- **Bảng chiến dịch** (cổ điển: tài khoản, Client, trang chi tiết) có nút Tạm dừng / Bật lại cho từng dòng và hàng loạt,
  khi được duyệt hành động.
  - Trước đây chỉ có nhóm QC / quảng cáo; nhóm QC bị dừng do chiến dịch hiện "Bật chiến dịch trước (Ads Manager)".
  - Nay dòng đó ghi "Bật chiến dịch trước", và người dùng bật được ngay trong AdxLens.
- **Execution Gateway:**
  - `pause_campaign` / `resume_campaign`, `target_type = campaign`, chỉ duyệt tay;
  - guardrail `no_auto_campaign` chặn rule tự động (chặt hơn);
  - xác minh bằng đọc lại `status`, hoàn tác được; đã ở trạng thái đích thì không gọi Meta;
  - ngưỡng dữ liệu đếm theo `campaign_id`.
- Hộp duyệt chiến dịch cảnh báo: tạm dừng sẽ dừng mọi nhóm QC bên dưới; bật lại không bật nhóm QC đang tắt.
- Chưa làm: hộp duyệt hiện số nhóm QC bị ảnh hưởng và chi tiêu 7 ngày (ghi trong ADR).

**Vùng bảo vệ:** `packages/core/execution`, `packages/meta-client/write` (đọc / ghi `campaign`), `packages/db` (giá trị
`target_type = campaign`, không cần migration SQL). **Cần PM chạy `pnpm execution:check` trên staging trước khi merge
`main`.**

**Test tự động:** `execution/campaign.test.ts`:
- tạm dừng → xác minh → hoàn tác bật lại;
- đã ở trạng thái đích thì `no_change`;
- loại trừ → vi phạm;
- rule tự động bị chặn (`no_auto_campaign`);
- cờ tắt → từ chối.

## [107] Rule chạy theo lịch: ngày / giờ trong tuần — 2026-10-25

Theo Madgicx Custom automation: lịch theo ngày / giờ trong tuần.

- Rule builder có ô **Chỉ chạy theo lịch**: chọn ngày (T2…CN) và khung giờ (giờ tài khoản).
- Ngoài lịch thì rule **không đánh giá**, cả shadow lẫn live (`outside_schedule`).
- Chỉ làm rule chạy ít đi. Giờ yên tĩnh 22:00–06:00 vẫn áp dụng. Vùng `execution`: thêm `inRuleSchedule`, kiểm ở đầu
  `shadowEvaluate` / `liveEvaluate`.
- Không làm rule cấp chiến dịch: ADR-0015 không cho rule tự tạm dừng cả chiến dịch.

**Test tự động:** `execution/tactics.test.ts`:
- đúng ngày + khung giờ theo múi giờ (VN vs New York), không lịch thì luôn chạy;
- ngoài lịch → không tạo hành động; trong lịch → chạy.

## [106] Ad Launcher + Audience Launcher (ADR-0023) — 2026-10-25

Theo Madgicx 3.4 (Ad Launcher, Audience Launcher). Đây là hai hành động ghi Meta mới; PM đã duyệt ngày 25/10/2026.

- **Workspace › Launcher** (`/w/launcher`, sau cờ P2a):
  - **Ad Launcher**:
    - chọn nhóm QC có sẵn và tối đa 5 creative tốt nhất (sắp theo ROAS kỳ đang chọn);
    - mỗi creative tạo một quảng cáo mới **ở trạng thái TẠM DỪNG**;
    - mỗi cái là một hành động duyệt tay qua Execution Gateway.
  - **Audience Launcher**: tạo lookalike 1–10% (tối đa 3 tỷ lệ) từ custom audience có sẵn, theo quốc gia. Không đụng
    quảng cáo / ngân sách.
- **Execution Gateway:**
  - hành động `create_ad`, `create_lookalike`, chỉ tier `approve`;
  - guardrail mới `no_auto_create` chặn tự chạy (chặt hơn, không nới);
  - đủ cổng: cờ, gói, kill switch, breaker, quyền ghi, hạn mức / ngày, loại trừ;
  - nguồn (nhóm QC, creative, audience) phải thuộc tài khoản QC theo snapshot;
  - ghi một lần, đọc lại xác minh (quảng cáo PAUSED đúng nhóm QC / audience LOOKALIKE);
  - lỗi giữa chừng: không đoán, không gọi lại, báo kiểm tra thủ công. Không hoàn tác được.
- **meta-client (ghi):** `createAd`, `createLookalike`, `getAudience`. Meta giả có thêm quảng cáo / audience tạo ra và
  lỗi theo kịch bản.
- **Đồng bộ:** lưu custom audience thành entity `audience` (id, tên, loại) làm nguồn cho Launcher.
- Nhật ký hành động hiện "Tạo quảng cáo / Tạo lookalike".
- **Chưa làm (ghi trong ADR):**
  - tạo creative mới / AI Ad Generator (cần lưu file + chọn mô hình tạo ảnh);
  - audience theo pixel / tương tác.

**Vùng bảo vệ:**
- `packages/core/execution` (`gateway.ts`: `requestLaunch`, `executeLaunch`; `guardrails.ts`);
- `packages/meta-client/write`;
- `packages/db` (giá trị `target_type = account`, entity `audience`; không cần migration SQL).
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `execution/launch.test.ts`:
  - tạo quảng cáo PAUSED + xác minh + nhật ký;
  - nguồn lạ, buyer, loại trừ, cờ tắt, chưa có quyền ghi;
  - không tự chạy (`no_auto_create`, rule, preview);
  - lỗi Meta → kiểm tra thủ công / verify_mismatch;
  - lookalike: tạo, xác minh, nguồn / tỷ lệ / quốc gia sai.
- Cách ly: probe 2 route Launcher.
- E2E `p2a.spec.ts`: chọn creative → tạo → banner "đang chạy qua Execution Gateway".

## [105] Ads Manager mới: sửa ngân sách ngày ngay trong bảng — 2026-10-25

Theo Madgicx Ads Manager 2.0: sửa ngân sách trực tiếp.

- **Workspace › Ads Manager** thêm cột **Ngân sách ngày** cho nhóm QC (theo tiền tệ tài khoản).
- Khi được duyệt hành động (cờ P2a + quyền duyệt Client), mỗi dòng có nút bút chì. Nút mở hộp duyệt như giao diện cổ
  điển: xem trước, guardrails ±15%, thực hiện qua Execution Gateway, hoàn tác được.
- Không có đường ghi mới: dùng lại `set_adset_budget` và `ActionDialog` (G4).

**Test tự động:** E2E `p2a.spec.ts`: Ads Manager mới → chế độ nhóm QC → bút chì → hộp duyệt có ô "Ngân sách ngày mới".

## [104] Tactic tự động kiểu Madgicx: Stop-loss, Surf, Sunsetting, Revive (ADR-0021) — 2026-10-25

PM duyệt "Phần có ghi Meta thì cũng làm luôn". ADR-0021 chuyển sang **Chấp nhận**.

- **Thư viện rule** có nhóm **Tactic tự động (kiểu Madgicx)** gồm 4 mẫu. Mẫu nào cũng tạo ở shadow 14 ngày rồi mới live
  (ADR-0012).
  - **Stop-loss**:
    - ngày dữ liệu gần nhất chi ≥ ngưỡng mà 0 click → tạm dừng; ngưỡng gợi ý = 2 × CPC 30 ngày, kèm "Vì sao giá trị
      này?";
    - sáng hôm sau (giờ chọn, mặc định 07:00) Owner / Manager nhận **đề xuất bật lại** kèm nút Hoàn tác.
  - **Surf**:
    - ROAS hôm qua ≥ 2 và 7 ngày ≥ 1,5 → +15% ngân sách (trần bắt buộc);
    - **tự trả ngân sách cũ** vào giờ chọn (mặc định 21:00) qua Execution Gateway.
  - **Sunsetting**: CPA tăng ≥ 30% → −15%, cách nhau ≥ 48 giờ, **không dưới sàn** (bắt buộc); đã ở sàn thì bỏ qua.
  - **Revive**: quảng cáo **do rule dừng** trong 7 ngày mà số 7 ngày vẫn tốt → đề xuất bật lại, 1 lần / hành động. Không
    đụng quảng cáo người dùng tự tắt; không ghi Meta.
- **Hành động hẹn giờ** (`app.scheduled_reverts`, job `maintenance:reverts_tick` mỗi 15 phút → `execute:revert`):
  - Trả ngân sách đi qua đủ guardrails, kill switch, breaker, quyền ghi, verify.
  - Người dùng đã sửa ngân sách tay thì không trả (`manual_change`).
  - Đang giờ yên tĩnh / hết hạn mức hôm nay thì chờ lần sau (tối đa 24 giờ).
  - Chỉ bỏ cooldown 24 giờ cùng rule cho đúng hành động trả về.
- **Không tự bật lại:** guardrail `no_auto_resume` giữ nguyên (quy tắc 6). Stop-loss / Revive chỉ đề xuất; người dùng
  bấm Hoàn tác (luồng duyệt tay).
- **Chỉ số rule mới:**
  - 7 ngày: click liên kết, ROAS;
  - ngày gần nhất: chi tiêu, kết quả, click, CPA, ROAS.
- **Tùy chọn rule mới:** sàn ngân sách ngày; giờ hẹn (06:00–21:00, server kiểm theo giờ yên tĩnh của workspace);
  `cooldownHours` ≥ 24.
- Thông báo mới `rule_suggest_resume` (trong app + email, tắt được).
- Sửa nhỏ: rule builder nay báo đúng "bắt buộc nhập trần" cho mẫu tăng ngân sách. Trước đây trang không truyền cờ này.

**Giới hạn (ghi trong ADR):**
- Dữ liệu theo ngày đã đồng bộ, chưa có trong ngày; "Stop-loss trong ngày" = sau một ngày xấu.
- Chưa có rule cấp chiến dịch (cần ADR-0015) và lịch theo giờ trong tuần.

**Vùng bảo vệ:**
- `packages/core/execution`: `rules.ts`, `gateway.ts` (`requestAutoAction`: `cooldownHours`, `revertOf`), `reverts.ts`
  mới.
- `packages/db`: `scheduled_reverts`, migration 0075–0076.
- **Cần PM chạy integration test trên staging trước khi merge `main`.**

**Test tự động:**
- `execution/tactics.test.ts`:
  - giờ hẹn theo múi giờ;
  - Surf: tăng → hẹn 21:00 → trả đúng ngân sách cũ qua Gateway, 1 lần;
  - Surf: sửa tay thì không trả, giờ yên tĩnh thì chờ;
  - Stop-loss: tạm dừng → sáng mai thông báo kèm link Hoàn tác, không tạo hành động bật lại;
  - Revive: chỉ đối tượng do rule dừng, 1 đề xuất, không ghi;
  - Sunsetting: sàn + cooldown 48 giờ;
  - kiểm hợp lệ (hẹn sai loại, giờ yên tĩnh, sàn, Revive có tham số, cooldown < 24);
  - 4 mẫu có trong thư viện.
- Cách ly: probe `execute:revert` (lịch của A, và id lịch của B trong ngữ cảnh A).
- **Đổi test (quy tắc 8):** `automation.test.ts` đổi số mẫu mong đợi 4 → 8, vì thêm 4 tactic.

## [103] Phễu › Giai đoạn: biểu đồ tỷ trọng chi tiêu × ROAS — 2026-10-25

Theo Madgicx 360° Meta Dashboard, Strategy Status Overview.

- Tab **Giai đoạn phễu** có thêm biểu đồ phía trên bảng: mỗi giai đoạn một cột % chi tiêu, đường chấm là ROAS. Không có
  ROAS thì không vẽ chấm.
- Số lấy từ `stageAnalysis` (091), không tính lại.

**Test tự động:** `funnels/stage-chart.test.tsx` (số cột, chấm ROAS chỉ khi có, nhãn); E2E: biểu đồ hiện trong tab
Giai đoạn phễu.

## [102] Xuất PDF các trang phân tích Workspace — 2026-10-25

Theo Madgicx 360° Audit "Export PDF".

- Mọi trang Workspace (Trang chủ, Business, Quảng cáo, Ads Manager, Phễu, Địa lý, Mở rộng, Audiences) có nút **Xuất PDF**.
  Nút mở hộp in của trình duyệt (Lưu thành PDF).
- Bản in:
  - ẩn sidebar, ô hỏi AI, banner, bộ chọn phạm vi / kỳ và các nút;
  - thêm một dòng ghi **phạm vi + kỳ** (vd. "Tất cả tài khoản (3) · 30 ngày");
  - nội dung giãn hết khổ giấy.
- Báo cáo gửi khách vẫn dùng PDF dựng ở worker như trước (có kiểm toàn vẹn).

**Test tự động:** E2E `workspace-home.spec.ts`: nút Xuất PDF; ở chế độ in, sidebar ẩn và dòng phạm vi / kỳ hiện.

## [101] Báo cáo theo mẫu ngành: E-commerce / Lead gen — 2026-10-25

Theo Madgicx One-Click Report templates.

- **Tạo báo cáo** có ô **Mẫu báo cáo**: Chung / E-commerce / Lead gen. Mẫu được gợi ý sẵn theo mục tiêu chính của Client
  (ROAS / lượt mua → E-commerce; lead / CPL → Lead gen).
- Bộ KPI theo mẫu, áp cho web, link công khai và PDF:
  - **Chung** (như cũ): Chi tiêu, Kết quả, Chi phí / kết quả, ROAS, CTR, Hiển thị;
  - **E-commerce**: Chi tiêu, Doanh thu, ROAS, Lượt mua, Chi phí / lượt mua, Giá trị đơn TB;
  - **Lead gen**: Chi tiêu, Khách tiềm năng, CPL, CTR, CPM, Hiển thị.
- Đổi được mẫu sau khi tạo (Chỉnh báo cáo → Mẫu báo cáo). Mẫu lưu trong `edits.template`, không cần dựng lại.
- Số vẫn là số đã dựng trong báo cáo. Giá trị đơn TB = doanh thu Meta / lượt mua, do code tính
  (`reporting/report-templates.ts`).
- Khối "Mục tiêu của kỳ" (goal tracker) đã có từ 089.

**Test tự động:**
- `report-view.test.tsx`: bộ KPI + nhãn từng mẫu; AOV 150.000; mặc định như cũ.
- `report.test.ts` (test mới): mẫu lưu khi tạo, đổi sau được, không chọn thì không có.

## [100] Top Audiences (Workspace) — 2026-10-25

Theo Madgicx Top Audiences / Audience Studio, phần chỉ đọc.

- **Đồng bộ đọc thêm** interest / behavior trong targeting nhóm QC (`flexible_spec`, chỉ id + tên), vẫn chỉ quyền
  `ads_read`. Mỗi nhóm QC lưu `attrs.audiences`: lookalike / custom audience (theo loại Meta trả), sở thích, hoặc
  "Rộng" khi không có gì.
- Trang mới **Workspace › Audiences** (`/w/audiences`):
  - mỗi audience có loại, số nhóm QC, chi tiêu, kết quả, CPA, ROAS, CTR; sắp theo chi tiêu;
  - trang ghi rõ: nhóm QC dùng nhiều audience được tính cho mỗi audience.
- Chưa làm:
  - ước tính quy mô audience (reach estimate);
  - Audience mixer;
  - gợi ý interest.
  Hai mục đầu cần API khác; mục cuối thuộc nhóm tạo audience (ghi Meta).

**Test tự động:**
- `reporting/audiences.test.ts`: tách audience theo loại; đủ 4 loại từ dữ liệu giả; sắp theo chi tiêu; buyer không
  thấy gì.
- E2E: trang Audiences.
- **Đổi test (quy tắc 8):** `lib/workspace-nav.test.ts` thêm `audiences` vào menu mong đợi, vì menu có mục mới.

## [099] Creative: xu hướng theo tuần của từng định dạng — 2026-10-25

Theo Madgicx Creative Insights (weekly trend). Cảnh báo "thiếu định dạng" đã có từ 087.

- Trang **Creative** (cổ điển) thêm khối **Xu hướng theo tuần**: 8 tuần gần nhất (thứ Hai → Chủ nhật), mỗi ô là tỷ trọng
  chi tiêu của định dạng trong tuần, kèm ROAS khi có doanh thu.
- `reporting.creativeFormatTrend`: chỉ tài khoản người dùng được xem; số do code tính.

**Test tự động:**
- `reporting/creative-trend.test.ts`: tuần tăng dần; tỷ trọng mỗi tuần ~100%; tổng chi = insight trong kỳ; buyer không
  thấy gì.
- E2E `creatives.spec.ts`: khối xu hướng hiện với dữ liệu mẫu.

## [098] Địa lý: Quốc gia · Tier 1–4 + khu vực / quốc gia đang lên — 2026-10-25

Theo Madgicx Geo & Demo: International scaling và Trending countries.

- **Đồng bộ thêm breakdown theo quốc gia** (`country`, mã ISO). Chỉ cần quyền `ads_read`, thêm 1 lời gọi insight mỗi lô.
  Meta giả có VN / US / SG / TH / KH.
- **Workspace › Địa lý** có 2 tab:
  - **Khu vực** (như cũ): thêm cột chi tiêu so kỳ trước và nhãn **Đang lên / Đang xuống / Mới** (đổi ≥ 20%);
  - **Quốc gia · Tier**: 4 thẻ Tier (tỷ trọng chi tiêu, số nước, kết quả, CPA) + bảng theo nước có nhãn Tier và xu hướng;
    wasted spend tính theo nước.
- Tier là phân tầng tham khảo theo thu nhập / giá quảng cáo, không phải phân loại của Meta; trang ghi rõ điều này.
- Công cụ `breakdown` của AI Agents / MCP nhận thêm `country`.

**Test tự động:**
- `reporting/geo-tiers.test.ts`:
  - Tier theo mã nước;
  - xu hướng ±20% / mới / wasted;
  - đồng bộ lưu breakdown quốc gia; tổng Tier = 100%; VN ở Tier 3.
- E2E: tab Quốc gia · Tier.
- **Đổi test (quy tắc 8):** `ingestion.test.ts` (2 test A4) thêm `country` vào danh sách breakdown mong đợi, vì đồng bộ có nhóm mới. Kiểm "tổng mỗi nhóm khớp chi tiêu insight" giữ nguyên và áp cho cả `country`.

## [097] Business Dashboard (Workspace) — 2026-10-25

Theo Madgicx Business Dashboard, mục 3.3 trong tài liệu nghiên cứu.

- Trang mới **Workspace › Business** (`/w/business`):
  - **Tổng hợp (Blended)** của phạm vi đang chọn, 7 ô có % so kỳ trước: Chi tiêu, Doanh thu, ROAS, Lượt mua, CTR, CPC,
    Giá trị đơn TB (Meta);
  - **khối theo từng tài khoản QC** người dùng được xem, mỗi khối theo tiền tệ của tài khoản đó;
  - nút **Chia sẻ**: sao chép link trang, người nhận cần quyền trong workspace.
- Các ô Lợi nhuận ròng / MER / CAC / LTV ghi rõ **"cần nguồn đơn hàng (Shopify / web) — chưa kết nối"**. AdxLens không
  ước lượng các số này từ dữ liệu Meta.

**Test tự động:**
- `reporting/business.test.ts`: tổng hợp = tổng insight; tổng các khối = tổng hợp; AOV; buyer chưa được gán khách thì
  không thấy gì.
- E2E `workspace-home.spec.ts`: mở trang Business.
- **Đổi test (quy tắc 8):** `lib/workspace-nav.test.ts` thêm `business` vào danh sách menu mong đợi, vì menu có mục mới. Assertion vẫn so khớp toàn bộ danh sách.

## [096] Chọn đối tượng trong bảng làm ngữ cảnh cho AI + nút Dừng — 2026-10-25

Theo Madgicx roadmap chat, mục 3.5 trong tài liệu nghiên cứu.

- **Workspace › Ads Manager:**
  - khi cờ P1 bật, mọi dòng (cả chiến dịch) có ô chọn;
  - nút **Hỏi AI về mục đã chọn** mở AI Agents với các mục đó (cùng cấp, tối đa 20).
- **AI Agents:**
  - **chip ngữ cảnh** hiện tên đối tượng, bỏ được từng cái;
  - tên lấy từ DB theo quyền người xem; id lạ hoặc không được xem thì bỏ;
  - câu hỏi gửi kèm cấp + meta_id;
  - prompt chỉ ghi cấp + id, không đưa tên vào: tên là dữ liệu Meta, lấy qua công cụ, bọc «» (quy tắc 10).
- **Công cụ mới `entity_details`** (AI Agents + MCP): chỉ số kỳ này / kỳ trước / % thay đổi của các đối tượng cụ thể.
  Chỉ trả đối tượng thuộc tài khoản người dùng được xem.
- **Nút Dừng** khi đang trả lời:
  - tin chuyển "Đã dừng";
  - worker kiểm trước mỗi vòng gọi công cụ và không ghi đè tin đã dừng;
  - chỉ người hỏi dừng được.
- Banner "chưa cấu hình AI" không hiện khi workspace đã có khóa riêng (ADR-0022).
- `/api/v1/agent/ask` khai báo thêm cờ P1 ở route; core vẫn kiểm như cũ.

**Test tự động:** `agent.test.ts`:
- prompt có cấp + id, bỏ id sai;
- `entity_details` chỉ trả đối tượng được xem, tên bọc «»;
- dừng trước khi worker chạy, và dừng giữa chừng;
- người khác không dừng được.

Cách ly: probe `POST /api/v1/agent/threads/[id]/stop`.

## [095] Đề xuất kèm "tiết kiệm được ₫X trong 30 ngày" + ngưỡng từ dữ liệu ("Vì sao giá trị này?") — 2026-10-25

Theo Madgicx AI Marketer (ý tưởng #1 trong `docs/research/madgicx-2026-10.md`). Phần này chỉ đọc, không gọi Meta.

- **Backtest rule** (`POST /api/v1/automation-rules/backtest`) trả thêm ước tính:
  - với mỗi đối tượng, lấy lần kích hoạt đầu tiên trong 30 ngày;
  - tạm dừng: chi tiêu sau ngày đó là **chi tiêu tránh được**;
  - đổi ngân sách: × |%|; tăng ngân sách là **chi thêm**;
  - giao diện ghi rõ giả định "Meta không dồn ngân sách sang chỗ khác".
- **Ngưỡng gợi ý từ dữ liệu 30 ngày** (`GET /api/v1/automation-rules/templates/suggest`):
  - "chi ≥ 2 × chi phí / kết quả của tài khoản mà 0 kết quả";
  - "tần suất ≥ 1,5 × trung bình (tối thiểu 2)";
  - mỗi giá trị có dòng **Vì sao giá trị này?**; không đủ dữ liệu thì giữ giá trị mẫu.
- **Việc tuần này → chi tiết** có nút **Tạo automation từ gợi ý này** khi gợi ý có mẫu rule tương ứng và cờ P2b bật. Nút mở
  rule builder đúng mẫu + tài khoản.

**Vùng bảo vệ:** `packages/core/execution`, chỉ thêm `rule-insights.ts` (đọc snapshot). Không đổi guardrails, gateway
hay hành động ghi.

**Test tự động:**
- `execution/rule-insights.test.ts`: tiết kiệm khi tạm dừng / giảm ngân sách, chi thêm khi tăng, không khớp thì `none`;
  ngưỡng 2×CPA / 1,5× tần suất; không đủ dữ liệu thì không gợi ý; buyer bị chặn; mẫu lạ trả 404.
- Cách ly: probe route gợi ý.

**PM kiểm tra:**
1. Bật cờ P2b.
2. Vào Việc tuần này → mở gợi ý "chi tiêu không chuyển đổi" → Tạo automation.
3. Ô ngưỡng chi có dòng "Vì sao giá trị này?". Bấm Backtest để thấy "có thể đã tránh được khoảng …".

## [094] Dùng AdxLens trong Claude / ChatGPT bằng gói của chính user (connector MCP có OAuth) — 2026-10-25

- **MCP server** (ADR-0020) nay hỗ trợ **OAuth 2.1** theo MCP authorization spec (ADR-0022 phần B):
  - **discovery:** `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`; MCP trả `401` kèm
    `WWW-Authenticate: Bearer resource_metadata=…`;
  - **đăng ký client động** `POST /api/v1/oauth/register`: chỉ client công khai; redirect https hoặc localhost; giới
    hạn theo IP;
  - **trang cấp quyền** `/oauth/authorize`: đăng nhập AdxLens, chọn workspace, xem quyền, Cho phép / Từ chối; PKCE S256
    bắt buộc; redirect_uri sai thì không chuyển hướng;
  - **token** `POST /api/v1/oauth/token`: mã dùng 1 lần trong 10 phút, access 1 giờ, refresh 30 ngày (xoay mỗi lần
    dùng); thu hồi `POST /api/v1/oauth/revoke`; chỉ lưu SHA-256.
  - MCP nhận cả khóa API `adx_…` (như cũ) và access token OAuth `adxo_…`. Grant chạy với quyền của người cấp: buyer
    chỉ thấy Client được gán.
- **Cài đặt → Tích hợp** có thẻ **Dùng AdxLens trong Claude / ChatGPT**:
  - URL connector;
  - các bước cho claude.ai / Claude Desktop, ChatGPT, Claude Code;
  - danh sách ứng dụng đã kết nối, thu hồi được.
- Kết quả: user chat bằng gói Claude / ChatGPT của họ; AdxLens không trả tiền LLM. Connector chỉ đọc (đề xuất chờ
  duyệt nếu có cờ P2a), không ghi Meta.

**Vùng bảo vệ:** `packages/db`: bảng `app.oauth_clients` (không thuộc workspace, RLS bật, không policy) và
`app.oauth_grants` (RLS theo workspace), migration 0073–0074. Truy vấn tra token xuyên workspace nằm ở `core/ops/oauth.ts`,
có ghi chú lý do (quy tắc 1).

**Test tự động:**
- `agent/oauth.test.ts`:
  - kiểm redirect_uri;
  - cờ tắt thì không cấp quyền;
  - PKCE sai, client sai, redirect sai, hết hạn, dùng lại mã → `invalid_grant`;
  - access token → đúng workspace + người cấp, hết hạn sau 1 giờ;
  - refresh xoay (token cũ hết hiệu lực); thu hồi RFC 7009;
  - buyer chỉ thấy / thu hồi grant của mình; workspace khác không thu hồi được.
- `api/v1/oauth/oauth.test.ts`: luồng HTTP đầy đủ discovery → 401 → đăng ký → cấp quyền → token (form) → MCP → thu hồi.
- Cách ly workspace: probe 6 route mới, dấu vết ứng dụng của B.
- **Đổi test (quy tắc 8)**: `tests/isolation/fingerprint.ts` sắp hàng theo toàn bộ nội dung thay vì cột 1. Lý do: CI
  của 093 (run PR) báo sai "route làm đổi dữ liệu B" ở `automation-rules/[id]/mode`, dù route bị chặn ở kiểm cờ và
  chưa chạm DB. 15 bảng có cột 1 là `workspace_id`, nên thứ tự các hàng trùng khóa đổi theo kế hoạch truy vấn. Băm vẫn
  phủ mọi bảng và mọi cột; không nới assertion nào.
- E2E `creatives.spec.ts`: trang Tích hợp + luồng OAuth trên trình duyệt (giả callback claude.ai) → `tools/list`.

**PM kiểm tra:**
1. Cần URL **https công khai** (`start-public` / tunnel). claude.ai và ChatGPT không gọi được `localhost`.
2. Bật cờ P1.
3. Trong claude.ai: Settings → Connectors → Add custom connector → dán URL ở trang Tích hợp → Connect → đăng nhập
   AdxLens → Cho phép.
4. Hỏi Claude "Chi tiêu 7 ngày qua của tài khoản X?".
5. Ở trang Tích hợp, "Ứng dụng đã kết nối" có Claude; bấm Thu hồi → Claude mất quyền.

## [093] AI Agents chạy bằng khóa AI của chính agency (Anthropic / OpenAI) — 2026-10-25

- **Cài đặt → Tích hợp** có thêm thẻ **Mô hình AI của workspace** (ADR-0022 phần A):
  - Owner / Manager chọn Anthropic (Claude) hoặc OpenAI (GPT), nhập model và khóa API;
  - khóa được mã hóa khi lưu (cùng khóa với token Meta), chỉ hiện 4 ký tự cuối;
  - trang báo lần dùng gần nhất và lỗi gần nhất: khóa sai, hết hạn mức, model không dùng được.
- **Worker** `recommend:agent_reply`:
  - workspace có khóa thì dùng khóa đó, không có thì dùng khóa nền tảng;
  - khóa workspace lỗi thì **không** rơi sang khóa nền tảng: trả bảng số kèm mã lỗi.
  - OpenAI gọi Chat Completions có function calling, dùng chung công cụ, bộ kiểm số, cờ và giới hạn câu hỏi.
- **AI Agents**: câu trả lời ghi "Trả lời bằng khóa AI của workspace · model". Khóa riêng bị từ chối thì báo rõ.
- **Sửa thiếu sót của 084**: `/api/v1/api-keys` chưa kiểm cờ P1 ở server; nay đã kiểm (quy tắc 7).
- Vì sao không dùng "đăng nhập Claude / ChatGPT" trong app: Anthropic và OpenAI không cho bên thứ ba dùng gói
  subscription của user (ADR-0022). Cách dùng gói của user là connector MCP (mục 094).

**Vùng bảo vệ:**
- `packages/db`: bảng `app.llm_keys`, migration 0071–0072; RLS bật, không có policy cho người dùng.
- `packages/core/connections`: chỉ thêm `encryptSecret` / `decryptSecret`.

**Test tự động:**
- `agent/llm-keys.test.ts`:
  - quyền Owner / Manager;
  - dạng khóa theo nhà cung cấp;
  - không lưu hoặc trả khóa rõ (DB, API, nhật ký);
  - đổi model giữ khóa; đổi nhà cung cấp phải nhập khóa;
  - client OpenAI (URL, header, tool_calls), ghi lần dùng / lỗi `LLM_HTTP_401` không lộ khóa;
  - chuyển hội thoại sang định dạng OpenAI.
- `agent.test.ts`: ghi khóa nào trả lời; lỗi thì có mã lỗi, không có thông điệp nhà cung cấp.
- `worker handlers/recommend.test.ts`: khóa workspace được dùng thay khóa nền tảng; không có khóa thì dùng khóa nền tảng.
- `api/v1/llm-key/llm-key.test.ts`: cờ tắt → 404 (cả khóa API MCP), lưu / đọc / xóa.
- Cách ly workspace: probe 3 route mới, dấu vết model của B.

**PM kiểm tra:**
1. Bật cờ P1.
2. Vào Cài đặt → Tích hợp, chọn OpenAI hoặc Anthropic, dán khóa của anh, lưu.
3. Hỏi ở Workspace → AI Agents: câu trả lời ghi "Trả lời bằng khóa AI của workspace".
4. Thử khóa sai: câu trả lời là bảng số, trang Tích hợp báo "khóa sai".

## [092] Trang chủ Workspace: bảng "Theo khách hàng" (tab Agency) — 2026-10-25

- Ở phạm vi **Tất cả tài khoản** (≥ 2 khách), trang chủ có bảng theo từng khách: chi tiêu 7 ngày, so tuần trước, sức khỏe thấp nhất, **mục tiêu so với thực tế 7 ngày** (hoặc link "Đặt mục tiêu"). Khách lệch mục tiêu nhiều nhất lên đầu, rồi sức khỏe thấp. Như tab Agency của Madgicx Home (Madgicx khóa khi chỉ có 1 tài khoản; AdxLens hiện khi có từ 2 khách).
- Dùng lại `agencyOverview` + `clientGoalStatus` (đã có test); thứ tự ở `lib/agency.ts`.

**Test tự động:** `lib/agency.test.ts`.

## [091] Giai đoạn phễu, trang đích, chữ quảng cáo (Madgicx 360° Audit) — 2026-10-25

**Thay đổi** (chỉ ĐỌC Meta; không quyền mới ngoài `ads_read`):
- **Đồng bộ thêm** (meta-client + ingestion):
  - creative: chữ quảng cáo, tiêu đề, URL đích, CTA (cả trong `object_story_spec`);
  - nhóm QC: custom audience trong targeting;
  - danh sách custom audience kèm loại.
  - Giai đoạn phễu của nhóm QC lưu ở `entities.attrs.funnel_stage`: danh sách khách → Giữ chân; web / app → Bám đuổi; tương tác → Tương tác lại; rộng / sở thích / lookalike → Tìm khách mới. Không đọc được audience thì để trống (không đoán, không chặn đồng bộ).
- **Workspace › Phễu** thêm 2 tab:
  - **Giai đoạn phễu** (Madgicx Meta Dashboard): tỷ trọng chi tiêu, số nhóm QC, kết quả, chi phí / kết quả, ROAS;
  - **Trang đích** (Madgicx "Top landing pages"): gộp theo host + đường dẫn, bỏ UTM; click → chuyển đổi.
- **Creative (cổ điển)**: khối **Chữ quảng cáo** (Madgicx Ad Copy Insights): theo độ dài (ngắn / vừa / dài), có / không emoji, có / không link trong chữ (tỷ trọng chi tiêu, CTR, ROAS), emoji dùng nhiều, ma trận 4 góc cho từng đoạn chữ.
- AI Agents / MCP: thêm công cụ `funnel_stages`, `landing_pages` (URL bọc «» như dữ liệu).
- Meta giả: creative có chữ / URL / CTA; nhóm QC có audience LAL / web / danh sách khách.

**Test tự động:** `copy-stage.test.ts` (phân loại giai đoạn, đồng bộ lưu giai đoạn + chữ, tổng theo giai đoạn = tổng tài khoản, trang đích bỏ UTM + URL không hợp lệ, chữ quảng cáo theo nhóm + 4 góc, `object_story_spec`, cách ly workspace); `agent.test.ts` (2 công cụ mới); E2E tab Giai đoạn phễu / Trang đích.

## [090] AI Agents trả lời theo ngôn ngữ người hỏi; ADR-0021 đề xuất tactic tự động; tài liệu onboarding — 2026-10-25

- AI Agents: câu hỏi mang ngôn ngữ giao diện (vi / en); system prompt và bộ kiểm số dùng đúng ngôn ngữ đó (số "1,5" vs "1.5").
- `docs/adr/0021-automation-tactics.md` (**Đề xuất**, cần PM duyệt): Stop-loss trong ngày (bật lại 00:00), Surf, Sunsetting, Revive — cần "hành động hẹn giờ" trong Execution Gateway.
- `docs/onboarding.md` mục 16: Workspace, AI Agents (`ANTHROPIC_API_KEY` cho worker), MCP (curl, `claude mcp add`), quyền Meta rộng.

**Test tự động:** `agent.test.ts` (trả lời theo ngôn ngữ người hỏi).

## [089] Mục tiêu Client trong báo cáo và danh sách Client — 2026-10-25

**Thay đổi** (ADR-0017 phần "nơi dùng mục tiêu"; theo Madgicx One-Click Report "goal tracker"):
- **Báo cáo** (xem trước, trang công khai, PDF): khối **"Mục tiêu của kỳ"** khi Client đã đặt mục tiêu: giá trị thực tế của chỉ số chính, mục tiêu, **tốt hơn / kém mục tiêu X%** (xanh / đỏ), chỉ số phụ kỳ này + kỳ trước. Số tính trên tài khoản cùng tiền tệ mục tiêu; Client chưa có mục tiêu thì báo cáo không đổi. Không đưa vào tóm tắt LLM.
- **Danh sách Client**: dòng "Mục tiêu chính: …" thêm **"· tốt hơn / kém hơn X%"** theo 7 ngày qua.
- Core: `reportGoal` trong `buildReport`, `clientGoalStatus` trong `reporting/goals.ts`.

**Test tự động:** `report-view.test.tsx` (có / không có khối mục tiêu, định dạng tiền, tốt hơn, chỉ số phụ); `report.test.ts` (Client chưa có mục tiêu → `goal = null`); `goals.test.ts` (trạng thái 7 ngày = gợi ý 7 ngày, % đúng hướng).

## [088] Cổ điển — Bảng chiến dịch: cột "Thay đổi gần nhất" + bộ lọc lưu được — 2026-10-25

**Thay đổi** (bảng chiến dịch / nhóm QC / quảng cáo ở trang Tài khoản, Client, chi tiết; theo Madgicx Ads Manager 2.0):
- Cột **Thay đổi gần nhất**: hành động gần nhất qua AdxLens trên đối tượng hoặc đối tượng con (chiến dịch ← nhóm QC / quảng cáo, ghi tên đối tượng con), kèm thời điểm; bỏ hành động đã hủy. Chưa gồm thay đổi làm trực tiếp trong Ads Manager.
- **Bộ lọc lưu được**: "Lưu bộ lọc" giữ tìm kiếm + hiển thị + sắp xếp + bộ cột với một tên; chọn lại từ "Bộ lọc đã lưu" (tối đa 20, lưu ở trình duyệt).
- Core `reporting/latest-changes.ts` (chỉ đọc `actions` + `entities`).

**Test tự động:** `latest-changes.test.ts` (3 cấp, con → cha, bỏ hủy, cách ly workspace).

## [087] Cổ điển — Creative Insights: theo định dạng + ma trận creative 4 góc — 2026-10-25

**Thay đổi** (trang Creative P103, theo Madgicx 360° Audit "Creative Insights"):
- **Theo định dạng** (Ảnh / Video / Băng chuyền / Động / Văn bản): số creative, **% chi tiêu so với % doanh thu** (xanh khi doanh thu chiếm nhiều hơn chi tiêu, đỏ khi ngược lại; không có doanh thu thì dùng % kết quả), ROAS, CTR, CVR.
- Cảnh báo **thiếu định dạng** (ảnh / video / băng chuyền chưa có).
- **Ma trận creative** chi tiêu × doanh thu (ngưỡng = trung vị): Có thể mở rộng / Chủ lực / Mới bắt đầu / Chi quá tay, kèm việc nên làm và 3 creative mỗi góc.
- Core `reporting/creative-insights.ts` (hàm thuần trên số đã tính).

**Test tự động:** `creative-insights.test.ts` (tỷ trọng, ROAS / CTR / CVR, thiếu định dạng, 4 góc, dùng kết quả khi không có doanh thu).

## [086] Cổ điển — Tổng quan tự động hóa (đã kích hoạt 7 ngày, tần suất theo rule) — 2026-10-25

**Thay đổi** (trang Tự động hóa P211, theo Madgicx "Automation Overview"):
- Khối **"Đã kích hoạt 7 ngày qua"**: đếm hành động do rule tạo theo loại (Bật lại / Tạm dừng / Tăng ngân sách / Giảm ngân sách) + biểu đồ theo ngày.
- Bảng rule thêm cột **48 giờ / 7 ngày / Kích hoạt cuối**.
- Chỉ ĐỌC bảng `actions` (tier `auto`), không đụng Execution Gateway. Core `reporting/automation-overview.ts`.
- Sửa định dạng `mcp.test.ts` (CI `format:check`).

**Test tự động:** `automation-overview.test.ts` (đếm theo loại / ngày / rule, bỏ hành động duyệt tay, cách ly workspace, phân loại ngân sách tăng / giảm).

## [085] Sửa E2E sau W1 / W3 — 2026-10-24

- Trang Quyền ghi: kết nối mới (ADR-0016) đã có `ads_management` nhưng **lần bật đầu vẫn là "Cấp quyền ghi"** (OAuth xác nhận lại với Meta, như trước); "Bật lại quyền ghi" chỉ hiện sau khi đã từng bật rồi thu hồi. Giữ đúng luồng E2E P2a / P2b (không đổi test).
- Sidebar Workspace: nhãn "Điều hướng Workspace" đặt trên `<nav>` (trước đặt nhầm trên `<aside>`, trình đọc màn hình và E2E không thấy).

**Test tự động:** E2E `p2a.spec.ts`, `p2b.spec.ts`, `workspace-home.spec.ts` (CI).

## [084] W10 — MCP server cho AdxLens (khóa API theo workspace) — 2026-10-24

**Thay đổi** (ADR-0020; vùng bảo vệ `db`: `app.api_keys` + RLS):
- Endpoint **`POST /api/v1/mcp`** (MCP Streamable HTTP, JSON-RPC 2.0, giao thức `2025-06-18`): `initialize`, `ping`, `tools/list`, `tools/call`; notification → 202; `GET` → 405. Dùng **chung bộ công cụ với AI Agents** (W9), số do AdxLens tính.
- **Khóa API** `adx_<prefix>_<secret>`: chỉ lưu SHA-256, khóa rõ hiện **một lần**; chạy với quyền của người tạo trong workspace (mất quyền → khóa ngừng); thu hồi có hiệu lực ngay; nhật ký `api_key.created` / `api_key.revoked`; tối đa 20 khóa hoạt động; 60 lời gọi / phút / khóa.
- `propose_action` chỉ khi khóa có phạm vi **"Đề xuất thay đổi"** VÀ cờ `p2a_approve` bật → thẻ chờ duyệt trong AI Agents (hội thoại "MCP · <tên khóa>"); MCP không bao giờ thực thi ghi.
- Cờ `p1_recommendations` kiểm ở mỗi request.
- Tra khóa theo hash (xuyên workspace, bước xác thực) đặt ở `core/ops` có ghi chú lý do.
- **Cài đặt → Tích hợp** (owner / manager, sau cờ P1): tạo khóa (tùy chọn phạm vi đề xuất), hiện khóa một lần + cấu hình mẫu Claude Desktop + lệnh `claude mcp add` cho Claude Code; danh sách (dùng gần nhất), thu hồi.
- ADR-0019 / 0020 cập nhật đúng cách đã làm (thẻ đề xuất + hộp thoại G4; vị trí code).

**Test tự động:**
- `mcp.test.ts`: chỉ lưu hash (khóa test băm khớp giữa agent và ops), danh sách không có hash, buyer không tạo, thu hồi → từ chối; cờ tắt; initialize / notification / tools/list / tools/call = tổng insight; method lạ, batch; cách ly workspace; `propose_action` cần phạm vi + cờ, chỉ tạo thẻ.
- `api/v1/mcp/mcp.test.ts`: 401 khi không / sai khóa, 200 initialize, 202 notification, danh sách không lộ khóa, thu hồi → 401.
- `settings-tabs.test.ts`: tab Tích hợp theo cờ + vai trò. `tests/isolation`: dữ liệu B + probe khóa API.

## [083] W9 — AI Agents: chat có công cụ đọc, số do AdxLens tính, đề xuất thay đổi chờ duyệt — 2026-10-24

**Thay đổi** (ADR-0019; vùng bảo vệ `db`: `agent_threads`, `agent_messages` + RLS; không sửa `execution` / `flags`):
- Module mới `packages/core/agent`:
  - **8 công cụ đọc**: tài khoản, KPI kỳ này / kỳ trước + % thay đổi tính sẵn, xếp hạng chiến dịch / nhóm QC / quảng cáo theo chỉ số, "Vì sao CPA đổi" (phân rã A1), vấn đề đang mở + điểm sức khỏe, breakdown tuổi-giới tính / vị trí / khu vực, độ mệt quảng cáo.
  - **`propose_action`** (chỉ khi cờ `p2a_approve` bật): chỉ tạo **thẻ đề xuất** trong tin trả lời; người dùng bấm "Xem trước và duyệt" → hộp thoại G4 sẵn có (guardrails, Execution Gateway). Agent không bao giờ ghi Meta.
  - **LLM không tạo số**: mọi số trong câu trả lời phải có trong kết quả công cụ (bộ kiểm số của tóm tắt báo cáo); sai → sinh lại tối đa 3 lần → trả **bảng số** từ công cụ.
  - **Dữ liệu không phải lệnh**: tên tài khoản / chiến dịch bọc «», system prompt nêu rõ.
  - Chạy với quyền của **người hỏi** (buyer chỉ thấy Client được gán); hội thoại riêng từng người.
  - Giới hạn 50 câu hỏi / người / ngày.
- Worker job `recommend:agent_reply` (LLM có thể > 10 giây); LLM tool-use Anthropic qua `ANTHROPIC_API_KEY` sẵn có; không có key → tin "chưa cấu hình".
- Cờ: API + job + trang kiểm `p1_recommendations` ở server.
- API `POST /api/v1/agent/ask`, `GET /api/v1/agent/threads`, `GET/PATCH/DELETE /api/v1/agent/threads/[id]`.
- Trang **AI Agents** `/w/agents` (bố cục Madgicx Agents): lịch sử + yêu thích + xóa, câu mẫu "Hỏi về tài khoản" (6) và "Làm việc gì đó" (3), chọn ngữ cảnh tài khoản, "AdxLens đang xem số liệu…", danh sách công cụ đã dùng, thẻ đề xuất, ghi chú "AI có thể sai".
- **Ô hỏi nổi** trên mọi trang Workspace (khi cờ bật) → mở Agents với câu hỏi; trang chủ "Hỏi AdxLens" cũng vậy.

**Test tự động:**
- `agent.test.ts` (LLM giả theo kịch bản): cờ tắt; trả lời đúng số → lưu + công cụ đã dùng; bịa số → bảng số; `propose_action` chỉ khi P2a, không tạo action; tên bọc «» + công cụ với tài khoản workspace khác lỗi; giới hạn / ngày + cách ly theo người và workspace; không có key; tập số được phép.
- `tests/isolation`: dữ liệu B (thread, message) + probe 5 route + job `recommend:agent_reply` (kể cả gọi chéo message của B).
- E2E: cờ tắt → không menu, không ô hỏi nổi, trang chặn.

## [082] W8 — Phễu, Địa lý, Mở rộng ("Quảng cáo có mệt không?") của Workspace — 2026-10-24

**Thay đổi** (như Madgicx Funnels / Geography / Scale):
- **Phễu** `/w/funnels`: Nhận biết (lượt hiển thị) → Cân nhắc (click liên kết, thêm vào giỏ) → Chuyển đổi (lượt mua / lead / kết quả, tự chọn theo dữ liệu); tỷ lệ chuyển giữa các bước; bảng theo chiến dịch hoặc nhóm QC (CTR, click → chuyển đổi, đỏ khi có click mà không chuyển đổi). Bỏ bước "thêm giỏ" khi không có sự kiện. Phễu theo landing page ghi chú "cần URL đích" (chưa đọc).
- **Địa lý** `/w/geography`: theo khu vực (breakdown `region` sẵn có), thanh tỷ trọng chi tiêu, kết quả, CPA, CTR; **"wasted spend"**: khu vực có chi mà không có kết quả được đánh dấu + banner tổng tiền.
- **Mở rộng** `/w/scale`:
  - biểu đồ bong bóng **tần suất × CPC** (kích thước = chi tiêu), 4 góc theo trung vị: Mới và rẻ → tăng ngân sách; Đang cạn → làm mới creative; Đắt từ đầu → sửa creative / tệp; Vẫn ổn → theo dõi; danh sách quảng cáo cần làm mới;
  - **theo định dạng**: số QC, chi tiêu, tỷ trọng, chi phí / kết quả, ROAS;
  - **tuổi × giới tính** dạng heatmap chi tiêu;
  - **chi tiêu theo ngày**.
- Core `reporting/analysis.ts` (`funnelAnalysis`, `geographyAnalysis`, `classifyFatigue`, `scaleAnalysis`, `entityNames`); mọi số do code tính.

**Test tự động:** `analysis.test.ts` (phễu = tổng insight + tỷ lệ, phễu 3 bước khi không có thêm giỏ; 4 góc theo trung vị; tỷ trọng địa lý ~100% + wasted; format mix ~100%, tuổi × giới tính, xu hướng 7 ngày; cách ly workspace); E2E 3 trang.

## [081] W7 — Ads Manager của Workspace: cây 3 cấp, cột chọn được, sparkline + % trong từng ô, dòng tổng — 2026-10-24

**Thay đổi** (như Madgicx "Ads Manager"):
- 3 chế độ xem: **cây** Chiến dịch › Nhóm QC › Quảng cáo (mở / thu gọn từng dòng), **phẳng** theo nhóm QC, **phẳng** theo quảng cáo.
- Mỗi ô: giá trị, **% so kỳ trước** (xanh / đỏ theo hướng tốt), **sparkline theo ngày**.
- **Cột chọn được** (tối đa 10 trong 18 chỉ số, nhớ theo trình duyệt); **dòng tổng** ở đầu bảng; **ẩn đối tượng không chi tiêu** (mặc định bật); tìm theo tên (giữ cha của dòng khớp).
- Chọn nhiều nhóm QC / quảng cáo → **Tạm dừng / Bật lại** qua hộp thoại G4 sẵn có (xem trước, guardrails, Execution Gateway). Chỉ hiện khi cờ `p2a_approve` bật và người dùng được duyệt hành động; chiến dịch không có thao tác (ADR-0015 chưa duyệt).
- Core `reporting/ads-manager.ts` (`adsManagerData`): một truy vấn theo (đối tượng, ngày) mỗi cấp, cộng ngày bằng `sumRaw` (tiền thập phân); dùng chung `METRIC_SUMS` của danh mục chỉ số.

**Test tự động:** `ads-grid.test.ts` (đủ 3 cấp, dòng chiến dịch và dòng tổng = tổng insight, chuỗi 7 ngày, nhóm QC theo cha); E2E `workspace-home.spec.ts` (dòng tổng, mở chiến dịch, chế độ quảng cáo).

## [080] W6 — Lưới Quảng cáo của Workspace (thẻ theo từng quảng cáo) — 2026-10-24

**Thay đổi** (như Madgicx Workspace "Ads"):
- Mỗi quảng cáo một thẻ: **thumbnail** creative, trạng thái, **loại** (Ảnh / Video / Băng chuyền / Động / Văn bản, từ `object_type`), **mục tiêu** chiến dịch, tên chiến dịch, **4 chỉ số chọn được** (nhớ theo trình duyệt) kèm % so kỳ trước.
- Lọc theo loại (chip), mục tiêu, trạng thái; tìm theo tên quảng cáo / chiến dịch; sắp theo bất kỳ chỉ số nào (chỉ số chi phí sắp tăng dần). Kỳ 7 / 14 / 30 ngày theo đầu trang.
- Core `reporting/ads-grid.ts` (`adsGrid`, `adFormat`); chỉ quảng cáo có chi tiêu trong kỳ hoặc đang chạy.

**Test tự động:** `ads-grid.test.ts` (loại theo creative, mục tiêu, chỉ số = tổng insight, có kỳ trước, cách ly workspace, ánh xạ object_type); E2E lọc Video.

## [079] W5 — Cảnh báo tự đặt + gợi ý ngưỡng từ dữ liệu 30 ngày — 2026-10-24

**Thay đổi** (ADR-0018, vùng bảo vệ `db`: bảng `app.custom_alerts` + RLS):
- Trang **Cảnh báo** `/w/alerts` (như Madgicx Alert): tài khoản (hoặc "Mọi tài khoản" cùng tiền tệ, chỉ owner / manager), chỉ số (11), điều kiện vượt / dưới, ngưỡng, theo ngày hôm qua hoặc 7 ngày qua. Khi tạo hiện **trung bình 7 ngày** của chỉ số và chip gợi ý từ dữ liệu. Danh sách: lần báo gần nhất + giá trị, bật / tắt, xóa. Tối đa 50 / workspace.
- **Gợi ý cảnh báo** trên trang chủ: "CPM 7 ngày dao động X - Y trong 30 ngày qua → Báo khi vượt Z", tạo 1 click. Giá trị 7 ngày tính trên tổng thành phần (không trung bình tỷ lệ); ngưỡng = phân vị 90 (chỉ số chi phí) / 10 (CTR, ROAS); cần ≥ 14 cửa sổ có số.
- Worker: sau audit hằng ngày (`audit:run`) đánh giá cảnh báo của tài khoản + cảnh báo "mọi tài khoản"; mỗi cảnh báo bắn tối đa 1 lần cho mỗi ngày dữ liệu; thông báo loại mới `custom_alert` (trong app + email, tắt được ở cài đặt).
- API `GET/POST /api/v1/alerts`, `PATCH/DELETE /api/v1/alerts/[id]` (bộ test cách ly có dữ liệu B).

**Test tự động:**
- `alerts.test.ts`: tạo / bật tắt / xóa, từ chối chỉ số / ngưỡng sai, buyer không đặt "mọi tài khoản"; cách ly workspace; worker bắn đúng 1 lần với giá trị = tổng insight; gợi ý ngưỡng nằm trong khoảng, thiếu dữ liệu thì không gợi ý.
- `tests/isolation`: dữ liệu B cho `meta_assets`, `client_goals`, `custom_alerts` + probe 4 route cảnh báo.
- E2E `workspace-home.spec.ts` (chung với W4).

## [078] W4 — Trang chủ Workspace (sức khỏe, tracking, 4 KPI tùy chỉnh có sparkline, cần chú ý) — 2026-10-24

**Thay đổi** (bố cục theo Madgicx Home):
- **Sức khỏe tài khoản** 0–100 kèm nhãn (Xuất sắc / Tốt / Trung bình / Kém); phạm vi agency hiện điểm thấp nhất + trung bình + 3 tài khoản thấp nhất.
- **Tracking**: Pixel của các tài khoản trong phạm vi với trạng thái theo lần bắn gần nhất (từ tài sản Meta W1; Madgicx để "Coming soon").
- **Hiệu suất**: 4 KPI có giá trị, % so kỳ trước (xanh / đỏ theo hướng tốt của chỉ số), sparkline kỳ này + kỳ trước (nét đứt), **độ phủ dữ liệu "Dữ liệu 5/7 ngày"**; **Tùy chỉnh** chọn đúng 4 chỉ số (cookie theo người xem); mặc định theo mục tiêu Client (W2) hoặc bộ Madgicx (chi tiêu, giá trị chuyển đổi, ROAS, chi phí / lượt mua).
- **Hỏi AdxLens** + thao tác nhanh (Vì sao CPA đổi, tạo báo cáo, tạo cảnh báo, tạo rule — theo cờ và vai trò).
- **Cần chú ý**: 6 phát hiện đang mở mức cao trước, link tới phát hiện.
- Core `reporting/home.ts` (`workspaceHome`, `healthLabel`, `defaultHomeMetrics`), `insight.topFindings`; mọi số do code tính.

**Test tự động:** `alerts.test.ts` phần trang chủ (KPI = tổng insight, sparkline 7 điểm, độ phủ, sức khỏe, Pixel; nhãn; KPI mặc định theo mục tiêu); E2E `workspace-home.spec.ts` (chuyển giao diện, các khối, đổi kỳ, tùy chỉnh KPI, tạo + tắt cảnh báo, quay về cổ điển).

## [077] W3 — Khung giao diện Workspace `/w` song song giao diện cổ điển — 2026-10-24

**Thay đổi:**
- Route group mới `(workspace)/w`: sidebar trái kiểu Madgicx Workspace (logo + tên workspace, nút **Tạo mới** mở menu Báo cáo / Quản lý quảng cáo / Hỏi AI agent / Rule tự động / Cảnh báo theo cờ và vai trò; Trang chủ, AI Agents, Quảng cáo, Ads Manager, Phễu, Địa lý, Mở rộng; đáy: Cảnh báo, Cài đặt, **Giao diện cổ điển**).
- Đầu trang Workspace: bộ chọn **phạm vi** (Tất cả tài khoản = agency, hoặc một tài khoản; cookie `w_scope`, server kiểm lại tài khoản thuộc quyền xem) + kỳ **7 / 14 / 30 ngày** (dùng chung cookie kỳ).
- Phạm vi agency chỉ cộng tài khoản cùng tiền tệ chính (không cộng khác tiền tệ), báo số tài khoản bị loại.
- Giao diện cổ điển: nút **Giao diện mới** trên thanh trên.
- AI Agents sau cờ `p1_recommendations` (ẩn menu + chặn trang ở server).

**Test tự động:** `workspace-nav.test.ts` (ẩn Agents khi cờ tắt, mục đang chọn).

## [076] W2 — Onboarding theo Client: mục tiêu KPI có số thực tế, chỉ số phụ, ngành, tài sản mặc định — 2026-10-24

**Thay đổi** (ADR-0017, vùng bảo vệ `db`: bảng `app.client_goals` + RLS):
- **Danh mục chỉ số dùng chung** `core/reporting/metric-catalog.ts`: 18 chỉ số (chi tiêu, CTR, CPC, CPM, chi phí / kết quả, lượt mua, chi phí / lượt mua, giá trị chuyển đổi, ROAS, lead, CPL, thêm giỏ, chi phí / thêm giỏ…). CPA / ROAS / CPM / CTR giữ đúng định nghĩa cũ; chỉ số mới tính từ `actions` đã lưu, mỗi dòng lấy action type ưu tiên đầu tiên (không đếm trùng purchase / omni_purchase). Chia thập phân, không float trên tiền.
- **Onboarding 3 bước** `/clients/[id]/onboarding` (như Madgicx):
  1. chọn chỉ số tối ưu chính, bên cạnh là **giá trị thực tế hôm qua / 7 / 30 ngày**, nhập mục tiêu hoặc bấm "Dùng giá trị 7 ngày";
  2. chọn tối đa 2 chỉ số phụ (kèm giá trị 30 ngày);
  3. ngành + ngành con (11 ngành, danh mục cố định), Page / Instagram / Pixel mặc định từ tài sản Meta (W1).
  - "Để sau" đánh dấu đã qua onboarding.
- Trang Client: banner "Đặt mục tiêu" khi chưa onboarding; tab **Mục tiêu** (mục tiêu so với 7 ngày qua theo hướng tốt của chỉ số, chỉ số phụ, ngành, tài sản).
- Danh sách Client: dòng phụ "Mục tiêu chính: …" hoặc link "Đặt mục tiêu".
- API `GET/PUT /api/v1/clients/[id]/goal` (`clients.manage`), có trong bộ test cách ly workspace.
- Meta giả: chiến dịch bán hàng có thêm sự kiện "thêm vào giỏ".

**Test tự động:**
- `goals.test.ts`: gợi ý = tổng insight; lưu từng bước + tiền tệ; từ chối chỉ số / mục tiêu / ngành / tài sản sai; cách ly workspace + buyer không sửa; so mục tiêu theo hướng; danh mục chỉ số chia thập phân.
- `tests/isolation/probes.ts`: thêm GET / PUT goal.
- E2E `client-onboarding.spec.ts`: kết nối → đồng bộ → 3 bước → tab Mục tiêu.

## [075] W1 — Xin quyền Meta rộng khi kết nối + đọc Page / Instagram / Pixel / Catalog — 2026-10-24

**Thay đổi** (ADR-0016, vùng bảo vệ `connections` + `meta-client` + `db`, PM chọn 24/10):
- Kết nối xin một lần `CONNECT_SCOPES` (quảng cáo đọc + quản lý, Business, catalog, Page, lead, Instagram). Chỉ `ads_read` bắt buộc. Ghi đè bằng env `META_CONNECT_SCOPES` nếu app Meta chưa có use case.
- **Ghi vẫn tắt:** có `ads_management` chưa cho ghi; Owner vẫn phải bật ở trang Quyền ghi (nay chỉ là công tắc, không cần OAuth lại) + cờ P2 + Execution Gateway.
- Bảng mới `app.meta_assets` (RLS theo workspace): worker đọc danh sách Page (+ Instagram business), Pixel theo ad account, catalog theo Business mỗi lần làm mới tài khoản. Không lưu page token, chưa đọc nội dung Page / lead. Thiếu quyền nhóm nào thì bỏ qua nhóm đó.
- Màn S03 viết lại: từng nhóm quyền dùng để làm gì, "AdxLens không tự thay đổi quảng cáo".
- Trang Kết nối: thẻ "Tài sản Meta" (số Page / Instagram / Pixel / catalog) + quyền chưa cấp, link kết nối lại.
- Runbook dev-public mục 2.6: use case cần thêm trong app Meta, cách xử lý "Invalid Scopes".

**Test tự động:**
- `oauth.test.ts`: khóa danh sách `CONNECT_SCOPES` (đổi test cũ chỉ-đọc theo ADR-0016), ghi đè env luôn giữ `ads_read`.
- `assets.test.ts`: lưu đủ 4 nhóm, cách ly workspace, không lưu page token, thiếu quyền một nhóm vẫn làm mới tài khoản.
- `write-access.test.ts`: kết nối có `ads_management` nhưng `write_enabled` vẫn false.

## [074] Lộ trình Workspace + ADR 0016–0020 (tài liệu) — 2026-10-24

- `docs/roadmap-workspace.md`: 11 đợt W0–W10 (quyền rộng, onboarding theo Client, giao diện Workspace song song, Home, alert, Ads, Ads Manager, Funnels / Geography / Scale, AI agents, MCP).
- ADR-0016 quyền Meta rộng khi kết nối (đổi PRD P0-03), ADR-0017 mục tiêu theo Client, ADR-0018 alert tự đặt, ADR-0019 AI agents, ADR-0020 MCP server.
- PRD P0-03 ghi chú thay đổi theo ADR-0016.

**Test tự động:** không có (chỉ tài liệu).

## [073] "Vì sao CPA tăng / giảm?" đọc nhanh hơn — 2026-10-24

**Thay đổi** (trang tài khoản, trang chiến dịch / nhóm QC / quảng cáo, báo cáo web + PDF — cùng một khối):
- **Câu kết luận đầu khối:** "Chủ yếu do **tỷ lệ chuyển đổi giảm 24%** (104% mức tăng)" khi một yếu tố giải thích ≥ 50%; không có thì ghi "do nhiều yếu tố cùng lúc".
- **CPA trước → nay** bên phải, nhãn ▲/▼ % (đỏ khi tăng, xanh khi giảm).
- **Mỗi yếu tố** (giá hiển thị CPM, tỷ lệ click CTR, tỷ lệ chuyển đổi):
  - tên dễ hiểu + một dòng giải thích, mức thay đổi;
  - **thanh "phần giải thích"** tô **đỏ** khi làm CPA xấu đi, **xanh** khi bù lại / làm tốt lên;
  - bỏ yếu tố < 5%.
- **"Nên kiểm tra"** theo yếu tố làm CPA tăng nhiều nhất (chỉ khi CPA tăng; nội dung cố định, không có số).
- **Chiến dịch đóng góp nhiều nhất** thành bảng: CPA trước → nay, thanh đóng góp.
- Không đổi cách tính (core `explainCpaChange`), không dùng LLM.
- Logic gắn nhãn ở `lib/cpa-insight.ts`.

**Test tự động:**
- `lib/cpa-insight.test.ts`: nguyên nhân chính ≥ 50%; yếu tố bù ngược = tốt; CPA giảm; nhiều yếu tố.
- `report-view.test.tsx`: câu kết luận, CPA trước → nay, bỏ yếu tố nhỏ, thanh tối đa 100%, gợi ý, bảng chiến dịch.

## [072] Không bắt chờ đồng bộ 90 ngày: vào trang chủ ngay, số liệu hiện dần — 2026-10-24

**Thay đổi**
- **Màn đồng bộ (S06):** khi chưa xong, nút **"Vào trang chủ, đồng bộ tiếp ở nền"** dùng được ngay (trước đây nút Tiếp tục bị khóa tới khi xong). Xong thì vẫn "Tiếp tục" sang Clients như cũ.
- **Chỉ báo đồng bộ trên toàn app** khi backfill 90 ngày hoặc đồng bộ lại đang chạy (đồng bộ hằng ngày không tính):
  - banner "Đang đồng bộ dữ liệu 90 ngày (x%, n tài khoản)…", ghi rõ số của khoảng dài có thể chưa đủ và chưa đối chiếu với Meta;
  - link "Xem tiến độ" cho người quản lý kết nối;
  - **trang tự làm mới mỗi 15 giây** (bỏ qua khi tab ẩn, giữ trạng thái trên trình duyệt) để số liệu hiện dần; xong thì banner tự biến mất.
- **Dữ liệu vốn đã ghi theo từng khối 7 ngày, khối mới nhất trước** (worker chạy 3 khối song song), nên số liệu gần đây có trước. Không đổi worker, đối chiếu hay ngưỡng.

**Test tự động:** `lib/sync-progress.test.ts` (`backgroundSync`: backfill / đồng bộ lại đang chạy → %, đồng bộ hằng ngày hoặc đã xong → không hiện).

**PM kiểm tra:** kết nối thêm một tài khoản QC → ở màn đồng bộ bấm "Vào trang chủ…" → thấy banner tiến độ, số liệu tăng dần sau mỗi lần làm mới.

## [071] Mọi URL tuyệt đối do web tạo theo origin công khai (Meta OAuth, email, thanh toán, link báo cáo) — 2026-10-24

**Lỗi tiềm ẩn:** các chỗ dưới đây lấy `getEnv().APP_URL` / `PUBLIC_REPORT_URL`. Hai biến này **tự điền `http://localhost:3000`** khi thiếu, nên chạy sau Cloudflare Tunnel mà thiếu biến sẽ ra link localhost:
- `redirect_uri` Meta OAuth (bắt đầu + callback);
- link mời thành viên;
- link xác minh / đặt lại mật khẩu (`redirectTo`);
- ngắt kết nối;
- URL trả về sau thanh toán Stripe / PayOS / portal;
- URL data deletion trả cho Meta;
- link báo cáo `/r/...` (API chia sẻ + trang chia sẻ).

**Sửa:**
- `server/public-base.ts`:
  - `appBaseUrl(req)` = `publicOrigin`: `APP_URL` → `x-forwarded-host` / `-proto` → origin request;
  - `reportBaseUrl(req)`: `PUBLIC_REPORT_URL` nếu đặt, không thì origin công khai + `/r`;
  - `currentRequest()` cho Server Action / Server Component.
- Áp cho mọi chỗ trên. `redirect_uri` ở bước bắt đầu và callback dùng cùng một hàm nên luôn khớp.
- Worker (email báo cáo, digest) và cảnh báo đội vận hành không có request → vẫn dùng env; script dev công khai đặt `APP_URL`, `PUBLIC_REPORT_URL`.

**Test tự động:**
- `connections.test.ts`: `redirect_uri` theo `APP_URL`; không có `APP_URL` → theo `x-forwarded-host`; không có gì → localhost.
- `settings.test.ts`: link mời theo domain công khai.
- `public-url.test.ts`: gốc link báo cáo.

## [070] Bản team test tách thư mục + nút "Cập nhật bản test" (gián đoạn vài giây) — 2026-10-24

**Thay đổi**
- **`Cap-nhat-AdxLens.cmd` / `pnpm team:update`** (`scripts/team.mjs`):
  - bản team chạy ở git worktree `<thư mục dev>-team` (vd. `E:\VideCode\AdxLens-team`), *detached* ở `origin/develop` (chỉ code đã push);
  - lần đầu tự tạo worktree và copy `.env.local`, không đọc / in nội dung.
- **Thứ tự cập nhật:**
  1. checkout bản mới;
  2. `pnpm install` nếu lockfile đổi;
  3. **build vào `apps/web/.next-next` trong lúc app cũ vẫn chạy**;
  4. Chromium, Redis / Supabase (tự khởi động lại nếu cấu hình Auth đổi), migration, tài khoản PM;
  5. dừng app cũ (mọi tiến trình `start-local`) → đổi tên `.next-next` → `.next` → bật `start-local --fast` trong cửa sổ "AdxLens (ban team)".
  - In thời gian gián đoạn và danh sách thay đổi.
  - Đã mới nhất và đang chạy → không làm gì.
  - Thư mục team có file sửa tay → từ chối.
- **`next.config`:** `distDir` đọc `NEXT_DIST_DIR` (mặc định `.next`).
- **`start-local`:**
  - `--fast` chỉ bật web + worker từ bản build có sẵn;
  - ghi `.adxlens-app.json` (pid) khi app chạy;
  - không tự mở trình duyệt ở `--fast`.
- **Runbook** `dev-public.md` mục 7: hai thư mục, cách cập nhật, lưu ý (không chạy app / E2E / migration chưa merge ở thư mục dev khi bản team đang chạy).

**Test tự động:** `scripts/lib/team.test.ts` (thư mục team, PID theo cổng từ netstat, khi nào cài lại phụ thuộc, định dạng thời gian). Kiểm thực tế trên máy: xem báo cáo cập nhật trong PR / chat.

## [069] Redirect sau đăng nhập / OAuth theo địa chỉ công khai (sau Cloudflare Tunnel) — 2026-10-24

**Lỗi:** sau Cloudflare Tunnel, `request.url` là `http://localhost:3000`. Các redirect tuyệt đối tạo từ nó đưa người dùng ngoài về `localhost`:
- xác minh email / đặt lại mật khẩu (`/auth/callback`);
- đăng xuất;
- kết nối Meta (`/api/v1/connections/meta/callback`);
- middleware chuyển về `/login?next=`.

**Sửa:**
- `lib/public-url.ts` (`publicOrigin`, `publicUrl`) lấy origin theo thứ tự: `APP_URL` (cấu hình tin cậy; script dev công khai đặt bằng `PUBLIC_DEV_APP_URL`) → `x-forwarded-host` + `x-forwarded-proto` (host phải hợp lệ) → `request.url` (localhost).
- Dùng cho cả 4 chỗ trên.
- Đã rà các chỗ khác, đều đã dùng `APP_URL`: link mời, `redirectTo` đăng ký / quên mật khẩu, redirect URI Meta OAuth, link thanh toán, data deletion. Kiểm CSRF `route.ts` đã dùng `x-forwarded-host`.

**Test tự động:**
- `lib/public-url.test.ts`: ưu tiên `APP_URL`; header chuyển tiếp; host không hợp lệ / `APP_URL` sai → bỏ qua; fallback localhost.
- `connections.test.ts`: callback Meta với `APP_URL` công khai → `Location` theo domain công khai.
- E2E 15/15 ở localhost: chạy khi Supabase và SMTP ở chế độ local. Khi đang bật chế độ dev công khai, email E2E đi qua Resend nên E2E local không dùng được → dùng CI.

## [068] Chế độ "dev công khai": team test bản dev trên máy local qua domain — 2026-10-24

**Thay đổi**
- **Runbook** [docs/runbooks/dev-public.md](runbooks/dev-public.md): việc PM tự làm cho Cloudflare (domain + Tunnel `adxlens-dev.sctech.io.vn` → `:3000`, `adxlens-dev-sb.sctech.io.vn` → `:54321`, Access cho team), Meta tester + URL domain dev, Resend (`notify.sctech.io.vn`), `.env.local`, kiểm tra và tắt.
- **`Mo-AdxLens.cmd` / `start-local`:** `PUBLIC_DEV_APP_URL` trong `.env.local` = chế độ dev công khai.
  - **Từ chối chạy** khi mật khẩu PM mặc định hoặc < 12 ký tự, email PM `.local`, SMTP vẫn là Mailpit, `EMAIL_FROM` không thuộc domain thật, URL không phải `https://`.
  - **Supabase Auth theo domain dev:** site URL, redirect, link trong email qua hostname Supabase của tunnel, gửi email Auth bằng SMTP thật. Đổi chế độ → tự khởi động lại Supabase (dữ liệu giữ nguyên).
  - **Web / worker** chạy với `APP_URL`, `PUBLIC_REPORT_URL` = domain dev, `STORAGE_PUBLIC_URL` = hostname Supabase.
  - **Tài khoản PM** lấy từ `PM_EMAIL` / `PM_PASSWORD`:
    - mật khẩu truyền qua biến môi trường, không đặt trên dòng lệnh, không in ra màn hình khi đã đặt riêng;
    - tài khoản mặc định `pm@adxlens.local` bị **khóa** (mật khẩu ngẫu nhiên, bỏ quyền staff) khi mở ra ngoài.
  - Kiểm tra tunnel trả lời được sau khi app lên.
- **`seed-staff`:**
  - mật khẩu qua `SEED_STAFF_PASSWORD`;
  - user đã có thì **cập nhật mật khẩu** (trước đây giữ mật khẩu cũ);
  - `--lock` khóa tài khoản.
- **`infra/supabase/config.toml`** (vùng bảo vệ `infra/**`):
  - `site_url`, `additional_redirect_urls`, `auth.external_url`, `[auth.email.smtp]` đọc `env(...)` từ `infra/supabase/.env`;
  - file này do `scripts/supabase-env.mjs` sinh từ `.env.local` (gitignore). Không có `.env.local` (CI) → giá trị local như cũ;
  - `pnpm dev` và CI chạy bước này trước `supabase start`.
- **Link logo / PDF cho trình duyệt** đổi từ địa chỉ nội bộ sang `STORAGE_PUBLIC_URL` nếu có (`lib/storage-url.ts`). Server vẫn gọi Supabase qua local.

**Test tự động:**
- `scripts/lib/start-local.test.ts`: chế độ local / công khai; chặn mật khẩu mặc định, SMTP Mailpit…; nội dung `infra/supabase/.env` (có thoát ngoặc kép, `/auth/v1`).
- `lib/storage-url.test.ts`: đổi địa chỉ, giữ chữ ký; link nơi khác giữ nguyên.
- Kiểm thực tế: Supabase local khởi động với config mới, GoTrue nhận `SITE_URL`, `API_EXTERNAL_URL`, SMTP Mailpit; E2E đủ 15/15 (đăng ký → email xác minh → vào app).

**Vùng bảo vệ:** `infra/supabase/config.toml`. Ở local không đổi hành vi: giá trị như cũ, chỉ chuyển sang `env(...)`. **Rủi ro:** thiếu `infra/supabase/.env` thì `supabase start` báo lỗi parse config → luôn chạy qua `Mo-AdxLens.cmd`, `pnpm dev`, hoặc `node scripts/supabase-env.mjs`.

**PM kiểm tra:** làm theo runbook mục 1–5.

## [067] Admin: tìm kiếm chung, liên kết về workspace, mục lục trang workspace — 2026-10-24

**Thay đổi**
- **Ô tìm kiếm chung trên thanh trên admin:**
  - tìm theo tên workspace, email thành viên, mã tài khoản QC (`act_…`, có hoặc không tiền tố, khớp đầu mã) hoặc tên tài khoản, mã yêu cầu xóa dữ liệu (khớp đúng);
  - chỉ một kết quả → mở thẳng trang chi tiết workspace;
  - nhiều kết quả → trang `/admin/search` chia theo nhóm, mỗi dòng có link về workspace.
  - Core: `ops.adminSearch`, xuyên workspace có chủ đích, chỉ trả tên và mã.
- **Sự cố:** chi tiết sự cố của một workspace có link "Mở workspace".
- **Trang chi tiết workspace:** thanh mục lục dính trên đầu (Gói, Cờ, Thành viên, Kết nối, Tài khoản QC, Đồng bộ, Sự cố, Xóa dữ liệu, kèm số lượng) để nhảy tới từng phần.

**Test tự động:**
- `ops/workspace-lookup.test.ts`: tìm theo email; tài khoản theo `act_…` / chỉ chữ số / đầu mã / tên; mã xóa dữ liệu khớp đúng, không khớp một phần; chuỗi quá ngắn → rỗng.
- E2E `admin-ops.spec.ts`: tìm theo email → mở thẳng chi tiết workspace, sidebar tô mục Workspace; mục lục → `#members`.

**PM kiểm tra:** gõ email của anh hoặc `act_…` của TRON_GLAMPING vào ô tìm kiếm admin → Enter → vào thẳng trang workspace; bấm "Thành viên" ở mục lục.

## [066] Admin: sidebar theo luồng việc, trang "Hôm nay", banner kill switch — 2026-10-24

**Thay đổi**
- **Sidebar thay cho tab ngang.** Các mục xếp theo luồng việc của operator:
  - Hôm nay;
  - Khách hàng (Workspace);
  - Vận hành dữ liệu (Sự cố, Đồng bộ & hàng đợi, Đối chiếu số liệu);
  - An toàn thực thi (Thực thi & breaker, Kill switch);
  - Phát hành (Cờ tính năng);
  - Doanh thu (Gói & thanh toán);
  - Tuân thủ (Xóa dữ liệu, Nhật ký admin);
  - Cấu hình (Đội ngũ, Mẫu email, Hệ thống).
- **Trên sidebar:**
  - mục đang mở được tô sáng;
  - mỗi mục có **số việc đang chờ**, đỏ khi khẩn: sự cố P1, breaker mở, xóa dữ liệu quá hạn, đồng bộ kẹt;
  - Kill switch hiện thẳng trạng thái BẬT / TẮT;
  - mục chỉ superadmin thao tác được có khóa 🔒 khi người xem là operator (vẫn mở để xem).
- **Trang "Hôm nay"** (`/admin`, trước đây chuyển thẳng sang Ma trận cờ):
  - mỗi loại việc đang chờ là một thẻ, việc khẩn lên trước: số lượng, việc tồn lâu nhất, tối đa 3 mục kèm link về workspace, nút "Xử lý →";
  - không còn việc gì thì ghi "Mọi thứ ổn".
- **Banner đỏ trên mọi trang admin** khi kill switch toàn cục đang BẬT, kèm lý do.
- **Core:** `ops.adminInbox`
  - dùng chính các hàm mà từng trang dùng (`syncIssues`, `reconciliationBoard`, `executionOverview`, `billingOverview`, `deletionRequestsOverview`) + sự cố mở + đề xuất cờ chờ duyệt + kill switch, nên số trên sidebar khớp với trang;
  - xuyên workspace có chủ đích, chỉ trang staff gọi; không trả số liệu quảng cáo hay token.
- **Đổi tên mục:**
  - Vận hành → Đồng bộ & hàng đợi;
  - Đối chiếu → Đối chiếu số liệu;
  - Thực thi → Thực thi & breaker;
  - Ma trận cờ → Cờ tính năng;
  - Thanh toán → Gói & thanh toán.
- i18n kèm luôn chuỗi cho [067].

**Test tự động:**
- `ops/admin-inbox.test.ts`: không có việc → 0; gom sự cố (P1 lên đầu, khẩn), breaker, chỉ xóa quá hạn, đề xuất cờ, thanh toán quá hạn; kill switch bật → hiện lý do.
- `lib/admin-nav.test.ts`: mỗi trang đúng một mục; mục đang mở (trang con khớp mục cha); màu số.
- E2E `admin-ops.spec.ts`: vào `/admin` thấy "Hôm nay" + sidebar, mục đang mở.

**PM kiểm tra:** vào http://localhost:3000/admin → trang Hôm nay; sidebar có nhóm và số việc. Bật kill switch toàn cục → banner đỏ trên mọi trang admin → tắt.

## [065] Bộ chọn workspace + "Tạo workspace mới"; giới hạn 1 workspace Free mỗi user — 2026-10-24

**Thay đổi**
- **Bộ chọn workspace** trên thanh trên đổi từ ô chọn thường sang menu (như Slack / Notion):
  - danh sách workspace kèm vai trò (Owner / Manager / Media buyer), dấu ✓ ở workspace đang mở;
  - cuối menu có **"+ Tạo workspace mới"**, mở màn tạo workspace (A07).
  - Menu tài khoản giữ nguyên, chỉ dành cho việc cá nhân.
- **Màn tạo workspace khi đã có workspace:**
  - nhắc "Mỗi workspace là một agency riêng: thanh toán, kết nối Meta và thành viên riêng. Thêm khách mới? Hãy tạo Client", có link tới Client;
  - có nút Quay lại.
- **Giới hạn workspace Free** (quyết định PM 24/10):
  - mỗi user **sở hữu** tối đa `MAX_OWNED_FREE_WORKSPACES = 1` workspace ở gói Free. Workspace tính là Free khi chưa có subscription, gói `free`, hoặc đã hủy;
  - tạo thêm → 402 `PLAN_REQUIRED` (`reason: free_workspace_limit`), màn tạo báo cần nâng cấp gói của workspace hiện có hoặc dùng Client;
  - là thành viên (không phải owner) workspace của người khác thì không tính;
  - staff AdxLens không bị giới hạn.
  - Cấu hình ở `packages/core/billing/plans.ts`.

**Test tự động:**
- `billing/service.test.ts`: đếm workspace Free theo owner; nâng cấp → tạo thêm được; hủy gói → lại tính Free; manager không tính; staff không giới hạn.
- `settings.test.ts`: tạo workspace thứ 2 khi đã có 1 Free → 402, không đặt cookie, không tạo workspace.
- E2E `auth-workspace.spec.ts`: menu workspace hiện vai trò Owner → "Tạo workspace mới" → nhắc dùng Client → bị chặn vì giới hạn Free → Quay lại.

**PM kiểm tra:**
- Bấm ô workspace trên thanh trên → thấy vai trò → "Tạo workspace mới".
- Tài khoản `pm@adxlens.local` là staff nên **không bị giới hạn**. Muốn thấy giới hạn Free, đăng ký một user thường (email xác minh ở http://127.0.0.1:54324) → tạo workspace đầu → tạo workspace thứ hai → bị báo giới hạn.
- Ở `/admin` đổi gói workspace hiện có sang Starter → tạo lại được.

## [064] Báo cáo Audit có nội dung riêng; hộp thoại thao tác báo lý do lỗi — 2026-10-24

**Thay đổi**
- **Báo cáo Audit khác Định kỳ.** Trước đây loại báo cáo chỉ đổi tiêu đề.
  - **Phần dữ liệu khi dựng** (`core/reporting/report.ts`):
    - lấy tới 30 vấn đề đang mở mỗi tài khoản (Định kỳ: 10);
    - kèm điểm health bị trừ theo từng nhóm quy tắc, mỗi vấn đề kèm nhóm;
    - tổng hợp `audit` gồm số vấn đề theo mức độ và tổng tác động ước tính theo từng tiền tệ (cộng decimal, `auditTotals`);
    - không kèm "việc agency đã làm".
  - **Thứ tự hiển thị của Audit:**
    1. Kết quả kiểm tra: điểm sức khỏe, nhóm bị trừ điểm, số vấn đề, tổng tác động.
    2. Vấn đề cần xử lý, ghi rõ nhóm của từng vấn đề.
    3. Bối cảnh số liệu trong kỳ: KPI và chiến dịch nổi bật.
  - Audit bỏ: lý do CPA đổi, chi tiêu theo ngày, đối tượng / vị trí, creative.
  - Báo cáo Định kỳ giữ nguyên.
  - Mô tả hai loại ở màn tạo báo cáo đã viết lại cho rõ.
- **Hộp thoại thao tác trên bảng báo lý do lỗi.**
  - Trước đây, khi gửi lỗi (vd. "Kết nối chưa có quyền ghi", kill switch, không có quyền duyệt), hộp thoại chỉ báo "N không thực hiện được" rồi đóng.
  - Nay hộp thoại giữ mở và ghi lý do dưới từng đối tượng.
  - Nếu chỉ gửi được một phần: đối tượng đã gửi hiện "Đã gửi" và không gửi lại khi bấm lần nữa.

**Test tự động:**
- `report.test.ts`: Audit khác Định kỳ — health theo nhóm khớp điểm, số vấn đề theo mức độ khớp danh sách, không có việc agency đã làm; Định kỳ không có các trường này. Tổng tác động cộng decimal theo tiền tệ (0.1 + 0.2 = 0.3000).
- `report-view.test.tsx`: Audit đặt kết quả kiểm tra và vấn đề trước số liệu, ẩn chi tiêu theo ngày; Định kỳ giữ thứ tự cũ.
- `gateway.test.ts`: kết nối chưa có quyền ghi → bulk trả `FORBIDDEN` + "Kết nối chưa có quyền ghi" cho từng đối tượng, không tạo hành động. Chỉ thêm test, không đổi code `execution`.

**PM kiểm tra:**
- Tạo 2 báo cáo cho TRON_GLAMPING cùng kỳ, một Audit và một Định kỳ → nội dung và thứ tự khác nhau.
- Gỡ quyền ghi → bảng nhóm QC → Tạm dừng → Thực hiện → hộp thoại ghi "Kết nối chưa có quyền ghi" dưới đối tượng.

## [fix] Bảng chiến dịch: đối tượng bị dừng do cấp trên — 2026-10-24

**Thay đổi**
- Ad set / ad có trạng thái hiệu lực "Chiến dịch tạm dừng" hoặc "Nhóm tạm dừng":
  - bảng không còn nút Bật lại / Tạm dừng và ô chọn hàng loạt cho chúng, vì bật lại chính chúng không làm chúng chạy;
  - thay vào đó hiện ghi chú "Bật chiến dịch trước (Ads Manager)" / "Bật nhóm QC trước";
  - nút Ngân sách vẫn còn.
- ADR-0015 (đề xuất, chờ PM duyệt): thêm tạm dừng / bật lại **chiến dịch** qua Execution Gateway, chỉ ở mức duyệt.

**Test tự động:** `lib/grid.test.ts` (nhận `CAMPAIGN_PAUSED` / `ADSET_PAUSED`; `PAUSED`, `ACTIVE` không tính).

**PM kiểm tra:** TRON_GLAMPING → chiến dịch TG_T9_TRUNGTHU → nhóm QC TT_HN+TN_20-45_FB → các quảng cáo "Chiến dịch tạm dừng" hiện ghi chú thay cho nút Bật lại.

## [fix] Thông báo khởi động báo đúng Meta thật / giả — 2026-10-24

`scripts/start-local.mjs`: dòng "Meta… bản GIẢ" trước đây viết cứng; giờ đọc `META_MOCK` trong `.env.local` (`META_MOCK=0` → "Meta: THẬT"). Chỉ đổi chữ hiển thị, không đổi cách chạy. **PM kiểm tra:** mở `Mo-AdxLens.cmd` với `META_MOCK=0` → bảng thông tin ghi "Meta: THẬT".

## [063] Thao tác ngay trên bảng chiến dịch + bộ cột (G4) — 2026-10-24

**Thay đổi**
- **Bộ cột** trên mọi bảng chiến dịch / nhóm QC / quảng cáo: *Hiệu suất* (chi tiêu, hiển thị, click, CTR, kết quả, CPA, ROAS), *Chuyển đổi* (chi tiêu, kết quả, CPA, giá trị chuyển đổi, ROAS), *Phân phối* (chi tiêu, hiển thị, CPM, click, CTR); nhớ lựa chọn ở trình duyệt (tiện ích riêng từng người xem, lỗi bộ nhớ → mặc định). Dòng tổng theo bộ cột.
- **Thao tác trên dòng / hàng loạt** (khi cờ Duyệt 1 click bật **và** người dùng được duyệt hành động cho Client đó): bảng nhóm QC và quảng cáo có cột chọn (tối đa 20) + nút **Tạm dừng / Bật lại** từng dòng và hàng loạt, **Ngân sách** cho nhóm QC dùng ngân sách ngày. Mọi thao tác mở **hộp thoại xem trước**: trước → sau, vi phạm guardrails từng đối tượng; chỉ gửi đối tượng không vi phạm; theo dõi ở Nhật ký hành động. Chiến dịch không có thao tác ghi (Execution Gateway chỉ hỗ trợ ad / ad set — ADR-0009, 0010); nhân bản không làm từ bảng (ADR-0011).
- API (sau cờ `p2a_approve`): `POST /api/v1/actions/preview` (xem trước, không gọi Meta), `POST /api/v1/actions/bulk` (1–20) → `execution.requestManualActions`: **lần lượt từng cái qua `requestAction`** (cờ, gói, kill switch, breaker, quyền ghi, quyền duyệt theo Client, guardrails — số hành động / ngày tính dần); tài khoản ngoài phạm vi → 404 cả lô; lỗi nghiệp vụ từng cái trả về. Không có đường tắt qua guardrails.

**Test tự động:** `gateway.test.ts` (tạm dừng nhiều ad từ bảng: 2 thành công + 1 đối tượng không tồn tại → NOT_FOUND riêng; hành động `approve`, không gắn gợi ý; tài khoản workspace khác → 404 cả lô; rỗng → 422); `grid-actions.test.ts` (cờ tắt → 404 cả preview và bulk; cờ bật: đổi ngân sách thiếu số tiền / nhân bản → 422); bộ cách ly: 2 route mới (`crossBody` tài khoản B → bị từ chối).

**Vùng bảo vệ:** `packages/core/execution/**` (`requestManualActions` chỉ gọi lại `requestAction`) — **cần PM chạy staging** trước khi merge main. Coverage `execution` 96,01% dòng.

**PM kiểm tra:** bật cờ Duyệt 1 click cho workspace dữ liệu mẫu → Client → tab Nhóm QC → chọn 2 nhóm → Tạm dừng → xem trước → Thực hiện → Nhật ký hành động; nút Ngân sách → nhập ngân sách mới → Xem trước (vượt ±15% → báo vi phạm). Đổi bộ cột sang "Chuyển đổi".

## [062] Bộ chọn khách, thanh bên theo phạm vi, "Khách cần chú ý" (G3) — 2026-10-24

**Thay đổi** (theo cách tài khoản quản lý của Google Ads)
- **Bộ chọn khách** trên thanh trên: "Tất cả khách" hoặc một Client → chuyển phạm vi.
- **Thanh bên hai phạm vi**: phạm vi agency như cũ; khi đang xem một Client (trang Client, tài khoản / chiến dịch / nhóm QC / quảng cáo của Client, hoặc danh sách lọc `?client=`) thanh bên đổi sang mục của khách đó: ← Tất cả khách · tên Client · Chiến dịch · Nhóm QC · Quảng cáo · Đối chiếu số liệu · Báo cáo · Việc cần làm · Creative · Rule tự động · Nhật ký hành động · Cài đặt khách (mục P1/P2 chỉ khi cờ bật, mục Báo cáo chỉ Owner / Manager).
- **Danh sách lọc theo khách** `?client=`: Việc cần làm, Creative (chỉ tài khoản của khách), Rule tự động, Nhật ký hành động, Báo cáo; chip "Khách: X · Xem mọi khách"; các bộ lọc khác giữ phạm vi khách. Core: `listWeeklyActions`, `listActions`, `listRules` nhận `clientId` (lọc qua `listAdAccounts` — vẫn theo quyền người xem).
- **Tổng quan agency — "Khách cần chú ý"**: mỗi khách kèm lý do — lệch số với Meta, tài khoản đồng bộ lỗi, vấn đề mức cao, ngân sách tháng dự kiến vượt / thiếu (từ ngày thứ 5), health < 60; xếp theo mức nghiêm trọng (`core/reporting/attention.ts`, chỉ đọc kết quả đã tính).

**Test đổi (lý do):** E2E `clients-assign.spec.ts` — trang Tổng quan giờ có link tên Client ở cả khối "Khách cần chú ý" lẫn bảng → bộ chọn thu hẹp về link trong bảng (`getByRole('table')`); hành vi kiểm tra giữ nguyên.

**Test tự động:** `lib/scope.test.ts` (nhận phạm vi từ đường dẫn / `?client=` / tài khoản thuộc khách; mục theo cờ và vai trò; mục đang chọn theo tab); `attention.test.ts` (gom và xếp lý do; khách ổn không hiện; `listRules` lọc theo khách).

**PM kiểm tra:** chọn TRON_GLAMPING ở bộ chọn khách → thanh bên đổi sang mục của khách; Việc cần làm / Nhật ký trong phạm vi khách có chip lọc; "← Tất cả khách" quay về; Tổng quan có khối "Khách cần chú ý".

## [061] Bảng chiến dịch kiểu Google Ads + trang riêng cho từng chiến dịch / nhóm QC / quảng cáo (G1, G2) — 2026-10-24

**Nguyên nhân (PM báo):** mọi dòng ở tab Chiến dịch / Nhóm QC / Quảng cáo của Client đều dẫn về **cùng trang tổng quan tài khoản** — chưa có trang cho từng đối tượng, nên "phân tích mở camp nào cũng giống nhau". Bảng còn hiện hàng chục đối tượng tắt, 0 chi tiêu; không lọc / sắp xếp / so kỳ trước.

**Thay đổi**
- **G1 — bảng mới** (`EntityGrid`, thay `EntityTable`): mặc định chỉ hiện đối tượng **đang chạy hoặc có chi tiêu** (chọn "Có chi tiêu trong kỳ" / "Tất cả", báo số đối tượng đang ẩn); **tìm theo tên**; **sắp xếp** mọi cột; **dòng tổng** (tiền cộng trên BigInt, không qua số thực; chỉ khi một tiền tệ); dưới chi tiêu / kết quả / CPA có **% so với kỳ trước** (CPA giảm = xanh). Tab Nhóm QC / Quảng cáo hiện tên chiến dịch / nhóm QC cha. Trang tài khoản (D01) thêm bảng chiến dịch.
- Nhãn đối chiếu rõ nghĩa: "Khớp Meta (lệch 0%)" / "Lệch 1,4% so với Meta" (trước "Khớp 0%" dễ hiểu nhầm).
- **G2 — trang `/accounts/[id]/{campaign|adset|ad}/[metaId]`**: đường dẫn phạm vi Clients › Client › Tài khoản › Chiến dịch › Nhóm QC › Quảng cáo; trạng thái, ngân sách ngày, giai đoạn học, nút "Mở trong Ads Manager"; tab:
  - **Tổng quan**: số liệu + so kỳ trước **của riêng đối tượng**, "Vì sao CPA thay đổi" với **con đóng góp nhiều nhất** (chiến dịch → nhóm QC, nhóm QC → quảng cáo), chi tiêu / kết quả theo ngày, đối tượng / vị trí / khu vực (chiến dịch = mọi nhóm QC của nó; quảng cáo = nhóm QC chứa nó, có ghi chú);
  - **Nhóm QC / Quảng cáo** (con trực tiếp, cùng bảng G1);
  - **Vấn đề** đang mở của đối tượng và con cháu;
  - **Lịch sử thay đổi** qua AdxLens (Execution Gateway) trên đối tượng và con cháu.
- `core/reporting/entity-detail.ts` (`entityInfo`, `entityKpis`, `entityDaily`, `childRows`, `descendantIds`, `entityCpaChange`, `entityBreakdown`, `entityFindings`, `entityHistory`): mọi truy vấn có `workspace_id` + kiểm tài khoản người xem được thấy.

**Test tự động:** `entity-detail.test.ts` (KPI / chuỗi ngày đúng cấp, không lẫn chiến dịch khác; con trực tiếp xếp theo chi tiêu; con cháu; chuỗi cha; CPA chiến dịch tăng do đúng nhóm QC; vấn đề / lịch sử chỉ của đối tượng + con cháu; workspace khác → 404); `lib/grid.test.ts` (cộng tiền decimal, % so kỳ trước).
- **Test đổi (lý do):** E2E `clients-assign.spec.ts`, `reports-share.spec.ts` — chữ badge đối chiếu đổi từ "Khớp 1%" sang "Khớp Meta (lệch 1%)" / "Lệch 1,4% so với Meta"; selector cập nhật theo chữ mới, cùng số phần tử mong đợi.

**PM kiểm tra:** Client TRON_GLAMPING → tab Chiến dịch: chỉ còn chiến dịch có chi tiêu / đang chạy; bấm "Cdich _ tuong tac _ inbox" → trang riêng của chiến dịch (số, vì sao CPA, nhóm QC con, vấn đề); đi tiếp vào nhóm QC → quảng cáo; đường dẫn phía trên quay lại từng cấp.

## [060] Rule tự động mạnh hơn: điều kiện HOẶC, mẫu tăng ngân sách ad set thắng, nhật ký kích hoạt, sao chép rule (B1) — 2026-10-24

**Thay đổi** (ADR-0014, sửa đổi ADR-0012 mục 1)
- **Kiểu khớp** `match`: "Khi TẤT CẢ điều kiện đúng (VÀ)" (mặc định, rule cũ giữ nguyên) hoặc "Khi BẤT KỲ điều kiện nào đúng (HOẶC)". Chỉ số thiếu dữ liệu không bao giờ làm điều kiện đúng, kể cả với HOẶC. Backtest, shadow, live dùng cùng kiểu khớp. Cột `automation_rules.match` (migration 0059–0060, chỉ nhận `all` / `any`).
- **Mẫu mới "Tăng ngân sách nhóm thắng (CPA giảm mạnh)"** (`increase_budget_winner`): CPA giảm ≥ 20% và ≥ 10 kết quả → +15% ngân sách ngày (mức tối đa ADR-0010); **bắt buộc trần ngân sách ngày** — không có trần → không tạo được (ADR-0012 mục 2).
- **Nhật ký kích hoạt** trên trang rule: mỗi lần đánh giá mở xem đối tượng khớp kèm giá trị chỉ số của từng điều kiện lúc đó, ngân sách mới (nếu có), lý do bị chặn (guardrail / cooldown). Dòng điều kiện hiện "VÀ" / "HOẶC".
- **Sao chép rule sang tài khoản khác** (Owner, `POST /api/v1/automation-rules/[id]/copy`, 1–20 tài khoản, sau cờ `p2b_auto`): mỗi bản sao là rule riêng cho một tài khoản, **luôn bắt đầu chạy thử 14 ngày**, không kế thừa live, **không chép danh sách loại trừ**; bỏ qua tài khoản nguồn / đã có bản sao cùng tên; tài khoản ngoài workspace → 404.
- Không có hành động ghi mới, không nới ±15%, không bỏ shadow 14 ngày.

**Test tự động:** `rules.test.ts` (HOẶC khớp khi một điều kiện đúng, chỉ số null không khớp, đối tượng tắt không khớp; rule lưu `match`; mẫu tăng ngân sách thiếu trần → 422, có trần → shadow, ngân sách không vượt trần; sao chép: shadow, giữ `match` và giới hạn / ngày, bỏ `excludeMetaIds`, bỏ nguồn / trùng, tài khoản workspace khác → 404, ngữ cảnh workspace khác → 404); `automation.test.ts` (copy: cờ tắt → 404, cờ bật → bản sao shadow, `match` = any); bộ cách ly: route copy mới.
- **Test đổi (lý do):** `automation.test.ts` "cờ bật: mẫu…" — trước khẳng định đúng 3 mẫu; ADR-0014 thêm mẫu thứ 4. Nay khẳng định 4 mẫu **và** có `increase_budget_winner` (thêm assertion).

**Vùng bảo vệ:** `packages/core/execution/**` (rules.ts), `packages/db/**` (migration 0059–0060) — **cần PM chạy staging** trước khi merge main. Coverage `execution` 95,95% dòng.

**PM kiểm tra:** Rule tự động → Tạo rule → mẫu "Tăng ngân sách nhóm thắng" (thử bỏ trống trần → báo lỗi) → đổi kiểu khớp sang HOẶC → Lưu (chạy thử) → trang rule: "Sao chép sang tài khoản khác"; sau `pnpm rules:simulate` mở "Đối tượng khớp" ở nhật ký.

## [059] Duyệt hàng loạt từ Việc tuần này (B2) — 2026-10-24

**Thay đổi**
- Việc tuần này (khi cờ Duyệt 1 click bật, người có quyền cập nhật gợi ý): cột chọn cho gợi ý "Đề xuất" (tối đa 20, "Chọn tất cả"), nút **Xem trước & duyệt (n)** → hộp thoại liệt kê từng gợi ý: loại hành động, đối tượng, **trước → sau**, vi phạm guardrails / thiếu quyền, "không tự động được"; chỉ gửi gợi ý thực hiện được. Sau khi gửi hiện kết quả từng cái.
- `POST /api/v1/recommendations/bulk-approve` (`{ ids }`, 1–20, sau cờ `p2a_approve`) → `execution.approveRecommendations`: **lần lượt từng gợi ý qua `approveRecommendation`** (cờ, gói, kill switch, breaker, quyền theo Client, guardrails; "số hành động / ngày" tính dần theo từng cái). Một cái lỗi nghiệp vụ không dừng cả lô (trả `code`, `message`); lỗi hệ thống ném lên. **Có id không thuộc workspace → 404 cả lô.** Không có đường tắt nào qua guardrails.

**Test tự động:** `gateway.test.ts` (lô 3 gợi ý: 2 thực hiện + 1 không tự động được → CONFLICT, bỏ trùng id, đúng 2 hành động; id của workspace khác → NOT_FOUND cả lô; rỗng / > 20 → VALIDATION_FAILED); `bulk-approve.test.ts` (cờ tắt → 404; id lạ → 404; > 20 → 422; buyer → bị chặn); bộ cách ly: route mới với `crossBody` id gợi ý của B → bị từ chối.

**Vùng bảo vệ:** `packages/core/execution/**` (`approveRecommendations` chỉ gọi lại đường duyệt sẵn có) — **cần PM chạy staging** trước khi merge main.

**PM kiểm tra:** bật cờ Duyệt 1 click cho workspace mẫu (Meta giả) → Việc tuần này → chọn 2–3 gợi ý → Xem trước & duyệt → Nhật ký hành động có từng hành động.

## [058] Báo cáo sâu: đối tượng / vị trí / khu vực, quảng cáo chi nhiều nhất, nhận xét agency (A4) — 2026-10-24

**Thay đổi**
- **Đồng bộ thêm insight theo nhóm** (`analytics.insights_breakdowns`, migration 0057–0058): mỗi lô đồng bộ gọi thêm 3 lần Meta ở cấp ad set với `breakdowns` = tuổi + giới tính / nền tảng + vị trí / khu vực; kết quả tính theo mục tiêu ad set như số liệu chính. Là dữ liệu phụ: Meta từ chối một nhóm (lỗi không phải token / quyền / rate limit) → bỏ nhóm đó cho lô (`breakdownSkipped`), đồng bộ vẫn xong; token hỏng / mất quyền / rate limit vẫn xử lý như cũ. Ngắt kết nối → xóa cùng dữ liệu tài khoản (cascade).
- **Báo cáo** (web / công khai / PDF), mỗi tài khoản:
  - **Đối tượng, vị trí và khu vực**: 3 bảng top 8 nhóm (tỷ trọng chi, CPA decimal), ghi chú "số theo nhóm có thể lệch nhẹ tổng tài khoản".
  - **Quảng cáo chi nhiều nhất**: top 5 ad theo chi tiêu kèm ảnh thumbnail creative (chỉ URL https), chi tiêu, kết quả, CPA, CTR.
  - **Nhận xét của agency** (trường mới khi sửa báo cáo, hiện ngay sau tóm tắt).
  - Ẩn / hiện được 2 mục mới như các mục cũ.
- meta-client: `InsightQuery.level` thêm `adset`, `breakdown` (`BREAKDOWNS`), trường nhóm trong `insightSchema`; Meta giả tách nhóm theo trọng số, tổng khớp đúng ad set.
- `core/reporting/report-extras.ts` (`breakdownTable`, `topAds`); `ReportContent.accounts[].breakdowns / topAds` (tùy chọn).

**Test tự động:** `mock.test.ts` (tổng theo nhóm = tổng ad set cho cả 3 nhóm); `ingestion.test.ts` (lưu đủ 3 nhóm, tổng chi khớp insight; Meta từ chối một nhóm → bỏ nhóm, đồng bộ xong; token hỏng → thất bại như cũ); `report-extras.test.ts` (xếp hạng, tỷ trọng, CPA decimal, bỏ ngoài kỳ; top ad + thumbnail chỉ https; ngữ cảnh workspace khác không đọc được); `deletion.test.ts` thêm khẳng định `insights_breakdowns` có dữ liệu trước và bằng 0 sau purge (chặt hơn, không nới).

**Vùng bảo vệ:** `packages/db/**` (migration 0057–0058 + RLS).

**PM kiểm tra:** TRON_GLAMPING → "Chạy lại đồng bộ" 30 ngày (để có dữ liệu nhóm) → tạo báo cáo → mục "Đối tượng, vị trí và khu vực" + "Quảng cáo chi nhiều nhất" có ảnh; Sửa → "Nhận xét của agency".

## [fix] Execution Gateway: giờ tạo hành động theo cùng đồng hồ với guardrail — 2026-10-24

**Nguyên nhân:** `actions.created_at` do DB tự đặt (giờ thật), còn guardrail "số hành động hôm nay / rule tối đa mỗi ngày" và cooldown 24 giờ đếm theo đồng hồ của gateway. Hai mốc lệch ngày thì đếm ra 0 → giới hạn ngày không chặn. Phát hiện khi ngày đổi sang 24/10: test gateway (đồng hồ cố định 23/10) tạo 24 hành động thay vì 2. Ở production hai đồng hồ trùng nhau nên hiếm, nhưng có thể lệch đúng thời điểm qua nửa đêm giờ tài khoản.

**Sửa:** `requestAction` và `requestAutoAction` ghi `created_at` bằng đúng `clock.now()` dùng để kiểm guardrail. Không đổi giá trị guardrail nào; giới hạn nay chặt và xác định hơn.

**Test:** không đổi test; `gateway.test.ts` "rule live … tối đa theo giới hạn/ngày" và "hiệu quả tự động hóa" (đỏ từ 24/10) xanh lại; toàn bộ 61 test execution xanh.

**Vùng bảo vệ:** `packages/core/execution/**` — **cần PM chạy `pnpm execution:check` trên staging** trước khi merge vào main.

## [057] Cảnh báo bất thường hằng ngày (A5) — 2026-10-23

**Thay đổi**
- Sau đồng bộ + đối chiếu + audit mỗi ngày (`audit:run`), kiểm **hôm qua** của từng tài khoản so với **7 ngày trước** (dữ liệu đã đối chiếu):
  - **Chi tiêu tăng vọt**: ≥ ×2 trung bình và chênh ≥ 500.000đ (tiền khác: 20);
  - **Chi tiêu về 0** khi trung bình ≥ mức trên (quảng cáo có thể đã dừng: thẻ lỗi, bị từ chối…);
  - **CPA tăng** ≥ 50% (hôm qua ≥ 3 kết quả, nền ≥ 10 kết quả);
  - **Không có kết quả dù vẫn chi** (nền ≥ 3 kết quả/ngày, hôm qua chi ≥ 50% mức thường).
  - Cần ≥ 5/7 ngày nền có chi tiêu; thiếu dữ liệu → không báo.
- Thông báo mới `anomaly` (trong app + email, tắt được ở ST05) cho Owner, Manager và Buyer được xem Client; chống trùng theo (tài khoản, ngày, loại). Nội dung theo ngôn ngữ người nhận, số % do engine tính.
- `core/insight/anomaly.ts` (`detectAnomalies` hàm thuần, `runAnomalyCheck`, ngưỡng ở `ANOMALY_CONFIG`).

**Test tự động:** `anomaly.test.ts` (4 loại bất thường; bình thường / nền thiếu / chênh tuyệt đối nhỏ / hôm qua ít kết quả → không báo; gửi thông báo đúng tham số, không lặp cùng ngày).

**PM kiểm tra:** sau lần đồng bộ hằng ngày (3h sáng) hoặc "Chạy lại đồng bộ", nếu hôm qua có biến động → chuông thông báo + email (Mailpit ở local).

## [056] Ngân sách tháng theo Client + cảnh báo tốc độ chi (A3) — 2026-10-23

**Thay đổi**
- Trang Client: thẻ **Ngân sách tháng MM/YYYY** — đã chi / ngân sách (thanh tiến độ + vạch số ngày đã qua), **dự kiến cả tháng** theo tốc độ trung bình, trạng thái **Đúng tiến độ / Dự kiến vượt / Dự kiến thiếu** (±10%), **mức chi mỗi ngày còn lại** để vừa ngân sách. Owner / Manager đặt / sửa ngân sách (tiền tệ phải trùng tài khoản QC của Client).
- Tính trên chi tiêu đến **hết hôm qua** theo múi giờ tài khoản, chỉ tài khoản cùng tiền tệ, bỏ kết nối đã ngắt. Tiền là decimal (chia chính xác trên BigInt, không qua tỷ lệ số thực); % chỉ để hiển thị.
- **Cảnh báo** (`maintenance:daily_tick`, 09:00 VN): từ ngày thứ 5 của tháng, dự kiến vượt / thiếu > 10% → thông báo `budget_pacing` (trong app + email, tắt được ở ST05) cho Owner và Manager được xem Client; **một lần mỗi trạng thái mỗi tháng**, sửa ngân sách hoặc về đúng tiến độ thì đặt lại.
- API `GET / PUT / DELETE /api/v1/clients/[id]/budget` (DELETE theo `?month=`). Bảng `app.client_budgets` (migration 0055–0056: RLS workspace, kiểm tháng `YYYY-MM`, số tiền > 0). `core/reporting/pacing.ts`; `core/ops` `workspacesWithClientBudgets` (xuyên workspace có chú thích, chỉ trả id).

**Test tự động:** `pacing.test.ts` (chi đúng tháng, bỏ ngày tháng trước; dự kiến / mức chi mỗi ngày chính xác; ±10%; kiểm đầu vào số dương, tháng, tiền tệ; buyer → 403; cảnh báo một lần, đặt lại; < 5 ngày không cảnh báo). Bộ cách ly: 3 route mới (ngữ cảnh A không đọc / ghi ngân sách Client B).
- **Test đổi (lý do):** `apps/worker/src/dispatch.test.ts` — kết quả `maintenance:daily_tick` thêm `pacing`; mở rộng kỳ vọng (giữ nguyên trường cũ), không nới.

**Vùng bảo vệ:** `packages/db/**` (migration 0055–0056).

**PM kiểm tra:** Client TRON_GLAMPING → "Đặt ngân sách tháng" (vd. bằng chi tiêu 30 ngày) → thẻ hiện tiến độ; đặt thấp hơn hẳn → "Dự kiến vượt"; `pnpm job:trigger -- maintenance:daily_tick '{"tick":"manual"}'` → thông báo (nếu đã qua ngày 5).

## [055] "Vì sao CPA thay đổi?" trong báo cáo và trang tài khoản (A1) — 2026-10-23

**Thay đổi**
- Khối **Vì sao CPA tăng / giảm?** ở báo cáo (dưới số liệu chính, ẩn cùng mục KPI) và trang tổng quan tài khoản (D01):
  - CPA kỳ trước → kỳ này (%), **phân rã theo yếu tố**: CPA = CPM ÷ CTR (click liên kết / hiển thị) ÷ tỷ lệ chuyển đổi (kết quả / click); mỗi yếu tố có % thay đổi và % thay đổi CPA nó giải thích (phân rã log, cộng = 100%).
  - **Chiến dịch đóng góp nhiều nhất** (tối đa 3, cùng chiều thay đổi): phân rã cộng chính xác ΔCPA = Σ[(chi_i − CPA₁·kq_i)/KQ] giữa hai kỳ; hiện CPA chiến dịch trước → sau và % đóng góp.
  - Chỉ giải thích khi **mỗi kỳ ≥ 10 kết quả**, có hiển thị và click, và CPA đổi **≥ 5%** — thiếu dữ liệu thì không hiện (thà không giải thích còn hơn sai).
- Tóm tắt báo cáo thêm câu "CPA tăng X% chủ yếu do … ; chiến dịch "…" chiếm Y% mức thay đổi". Theo quyết định PM, **LLM được diễn giải** phần này: các số phân rã được đưa vào danh sách kiểm số (`summaryFacts`, nhãn `account_N.cpa_factor.*`, `cpa_driver_campaign_N.*`) — LLM không tạo số; **tên chiến dịch không đưa vào prompt** (CLAUDE.md quy tắc 10).
- `core/reporting/cpa-change.ts` (`explainCpaChange`, hàm thuần); `ReportContent.accounts[].cpaChange` (tùy chọn). Tiền (CPA, chi tiêu) giữ chuỗi decimal từ số liệu; chỉ tỷ lệ % dùng số thực.

**Test tự động:** `cpa-change.test.ts` (CVR giảm một nửa → CPA ×2, yếu tố CVR 100%; đóng góp chiến dịch đúng chiều và xếp hạng; thiếu kết quả / click hoặc CPA đổi < 5% → null); `summary.test.ts` (câu giải thích qua kiểm số, tên chiến dịch không nằm trong danh sách gửi LLM).

**PM kiểm tra:** Client TRON_GLAMPING → trang tài khoản (kỳ 30 ngày) → khối "Vì sao CPA …" (nếu CPA đổi ≥ 5% và đủ dữ liệu); tạo báo cáo → khối cùng nội dung + câu trong tóm tắt.

## [054] Báo cáo: "Agency đã làm gì trong kỳ" tự động (A2) — 2026-10-23

**Thay đổi**
- Mục **Việc đã làm** của báo cáo (R03 / trang công khai / PDF) nay tự tổng hợp trong kỳ, theo ngày giờ của từng tài khoản:
  - **Thay đổi trên Meta** đã thực hiện qua Execution Gateway (thành công / đã hoàn tác; bỏ thất bại, đang chờ, bản ghi hoàn tác): ngày, loại, đối tượng, trước → sau (ngân sách theo tiền tệ tài khoản), "tự động (rule)" khi do rule live.
  - **Việc đã hoàn thành** (Việc tuần này đánh dấu xong).
  - Số **vấn đề đã xử lý** (phát hiện done / resolved).
  - Tối đa 15 dòng mỗi nhóm, "… và N mục khác". Ghi chú tay của agency vẫn hiện bên dưới; ẩn mục được như cũ.
- Tóm tắt thêm câu "Trong kỳ, đội đã thực hiện N thay đổi trên Meta và hoàn thành M việc." — các số này nằm trong danh sách số được kiểm (`summaryFacts`), LLM không tạo số mới.
- `ReportContent.agencyWork` (tùy chọn): báo cáo cũ không có vẫn hiện bình thường. `core/reporting/agency-work.ts`.

**Test tự động:** `agency-work.test.ts` (đúng kỳ theo múi giờ tài khoản, bỏ ngoài kỳ / thất bại / đang chờ / việc chưa xong, ngữ cảnh workspace A không đọc được tài khoản B, không có gì → null); `summary.test.ts` (câu mới + kiểm số đạt).

**PM kiểm tra:** duyệt 1 hành động ở Việc tuần này (Meta giả) hoặc đánh dấu xong 1 việc → tạo báo cáo kỳ chứa ngày đó → mục "Việc đã làm" liệt kê.

## [050–053] Admin: thanh toán, xóa dữ liệu, thực thi, hệ thống, thông báo bảo trì, mẫu email — 2026-10-23

**Thay đổi** (ADR-0013 mục 6–7)
- **Thanh toán** `/admin/billing`: bảng gói (giá VND / USD, tài khoản kèm, phí vượt, quyền — quyền chỉ xem); superadmin **Sửa** (tiền là chuỗi số nguyên đồng, không float; lần đầu sửa tạo dòng `billing_plans` từ mặc định). Workspace quá hạn / vượt hạn mức, 50 đơn PayOS và 50 sự kiện webhook gần nhất (không trả link thanh toán hay mã khách của nhà cung cấp). Ở `/admin/workspaces/<id>`: **Đặt gói thủ công** (chỉ khi không thanh toán qua Stripe / PayOS) và **Gia hạn ân hạn** 1–14 ngày (lùi mốc bắt đầu ân hạn).
- **Xóa dữ liệu** `/admin/deletions`: mọi yêu cầu xóa (mã, nguồn, trạng thái, hạn xóa); **quá hạn** khi qua hạn > 1 ngày mà chưa xong, nổi lên đầu.
- **Thực thi** `/admin/execution`: số hành động 7 ngày theo trạng thái, hành động thất bại gần đây, **breaker đang mở** (superadmin **Đóng breaker**, bắt buộc lý do — `core/execution/controls.ts` `closeBreakerByStaff`, không gọi Meta, ghi audit của workspace + nhật ký admin), rule đang chạy thật.
- **Hệ thống** `/admin/system`: phiên bản, kiểm thực thi của phiên bản, sự cố mở theo mức, smoke sau deploy gần nhất, **lịch định kỳ** (lần chạy kế tiếp; "Trễ" khi quá 5 phút → worker có thể dừng). **Kênh cảnh báo đội**: superadmin đặt email nhận (tối đa 20) — web và worker gộp với `OPS_ALERT_EMAILS` lúc gửi; Slack chỉ hiện đã / chưa cấu hình. **Thông báo bảo trì**: vi + en, tự tắt theo giờ, hiện banner trong app cho mọi khách (`app.system_settings`, migration 0053–0054).
- **Mẫu email** `/admin/emails`: xem trước mọi mẫu (lời mời, token sắp hết hạn, xóa dữ liệu, digest, báo cáo theo lịch, mọi email thông báo) vi / en bằng dữ liệu mẫu cố định, trong iframe `sandbox` (không chạy script). Không gửi email.
- Thanh điều hướng admin xuống dòng khi hẹp (13 mục).

**Test tự động**
- `packages/core/src/ops/admin-extra.test.ts`: sửa giá (chuỗi số, float → 422, quyền gói giữ nguyên), operator → 403; tặng gói bị chặn khi đang thanh toán qua cổng; gia hạn ân hạn đúng số ngày, ngoài 1–14 → 422, không có ân hạn → 409; yêu cầu xóa quá hạn; breaker: operator 403, lý do bắt buộc, đóng rồi → 404; email cảnh báo gộp / bỏ trùng; bảo trì cần đủ vi / en, tự hết hạn; lịch trễ; mọi mẫu email dựng được.
- `apps/web/src/app/api/v1/admin/admin-extra.test.ts`: người ngoài 404 ở 10 route; operator xem được, 5 thao tác ghi → 403; superadmin sửa giá / tặng gói / bật bảo trì; trang hệ thống không lộ Slack webhook.
- E2E `admin-ops.spec.ts`: tra cứu theo email → chi tiết; các trang vận hành / đối chiếu / thực thi / xóa dữ liệu; sửa gói; bật bảo trì → **khách thấy banner** → tắt → banner mất; mẫu email; nhật ký.
- Bộ cách ly: 10 route mới khai báo `exempt` có lý do.

**Vùng bảo vệ:** `packages/db/**` (migration 0053–0054 `system_settings` + RLS), `packages/core/execution/**` (thêm `closeBreakerByStaff`: chỉ đặt lại breaker như `closeBreaker` của khách, không gọi Meta, không nới guardrail — **cần PM chạy staging** theo quy trình execution).

**PM kiểm tra:** `/admin/system` → Thông báo bảo trì → bật → mở app bằng tài khoản khách thấy banner → tắt. `/admin/billing` → Sửa gói → `/pricing` thấy giá mới. `/admin/emails` xem từng mẫu.

## [049] Admin: bảng đối chiếu toàn hệ thống — 2026-10-23

**Thay đổi**
- `/admin/reconciliation` (+ `GET /api/v1/admin/reconciliation?days=&issues=`): mọi tài khoản QC thật (bỏ dữ liệu mẫu, kết nối đã ngắt) với số ngày lệch > 1% / số ngày đã đối chiếu trong 7 hoặc 30 ngày, ngày lệch gần nhất, độ lệch chi tiêu / kết quả lớn nhất (chuỗi decimal từ DB), trạng thái **Chặn chia sẻ** (cùng quy tắc báo cáo ADR-0007: có ngày lệch hoặc gán chưa xác nhận), **Đối chiếu trễ > 3 ngày**; mặc định chỉ hiện tài khoản có vấn đề. Nút Chạy lại đồng bộ trên từng dòng.
- `core/ops/reconciliation-board.ts`: dùng `status` đã tính bởi core/reconciliation — **không tính lại ngưỡng 1%**; không trả chi tiêu.

**Test tự động:** `reconciliation-board.test.ts` (đếm ngày lệch trong kỳ, bỏ ngày ngoài kỳ, độ lệch lớn nhất dạng decimal, chặn chia sẻ, đối chiếu trễ, bỏ demo / kết nối đã ngắt); `admin-ops.test.ts` (404 người ngoài, không trả chi tiêu, `days` > 90 → 422).

**PM kiểm tra:** `/admin/reconciliation` → "Tất cả" → TRON_GLAMPING "Khớp", 0 ngày lệch.

## [fix] Tóm tắt báo cáo mẫu viết hoa chữ đầu câu — 2026-10-23

**Thay đổi:** tóm tắt mẫu (khi không dùng LLM) một tài khoản bắt đầu bằng "chi tiêu …" chữ thường (PM thấy ở R03). Nay "Chi tiêu …" / "Spend …"; nhiều tài khoản vẫn "Tên: chi tiêu …". Số liệu và bộ kiểm tra số không đổi.

**Test đổi (lý do):** `summary.test.ts` và `report.test.ts` trước khẳng định chuỗi chữ thường `'chi tiêu …'` / `'spend …'` (`toContain`); nay khẳng định chặt hơn: tóm tắt **bắt đầu** bằng "Chi tiêu …" / "Spend …".

## [048] Admin: vận hành đồng bộ, hàng đợi job, mức dùng Meta API — 2026-10-23

**Thay đổi**
- `/admin/operations` (+ `GET /api/v1/admin/operations`):
  - **Đồng bộ lỗi (7 ngày) hoặc kẹt > 3 giờ** trên mọi workspace (bỏ kết nối đã ngắt), nút **Chạy lại đồng bộ** (3 / 7 / 30 / 90 ngày đến hôm qua theo giờ tài khoản, bắt buộc lý do). Nút này cũng có ở từng tài khoản trong `/admin/workspaces/<id>`.
  - **Hàng đợi BullMQ**: chờ / đang chạy / hẹn giờ / lỗi theo queue; bấm số lỗi → danh sách job lỗi (lý do lỗi **đã che** chuỗi giống token / secret, cắt 300 ký tự; không trả payload) → **Chạy lại** / **Bỏ** (bắt buộc lý do). Queue `execute` (ghi Meta) **không chạy lại được** (ADR-0008), chỉ bỏ sau khi kiểm Ads Manager.
  - **Meta API 60 phút**: lời gọi, lỗi, rate limit (mã 4/17/32/613, 80000–80014), thời gian trung bình, top 10 workspace.
- `core/ops/operations.ts` (`syncIssues`, `adminResync`, `metaApiUsage`, `QueueAdmin`, `failedJobs`, `handleFailedJob`, `scrubJobError`); web `server/queue-admin.ts` (BullMQ). Mọi thao tác ghi `/admin/audit` (`sync.resync`, `queue.retry`, `queue.discard`).

**Test tự động**
- `operations.test.ts`: lọc đồng bộ lỗi / kẹt đúng mốc, bỏ kết nối đã ngắt; chạy lại N ngày đúng khoảng theo giờ tài khoản + nhật ký; kết nối đã ngắt → 409; đếm rate limit; che token; `execute` không chạy lại; job lạ → 404.
- `admin-ops.test.ts`: người ngoài → 404 ở mọi route; ngày ngoài 1–90 → 422; queue lạ (`toString`) → 404.
- Bộ cách ly: 4 route mới khai báo `exempt` có lý do.

**PM kiểm tra:** `/admin/operations` → bảng Hàng đợi có đủ queue; `/admin/workspaces/<id>` → "Chạy lại đồng bộ" cho TRON_GLAMPING 3 ngày → `/admin/audit` có dòng "Chạy lại đồng bộ".

## [fix] Trang Client luôn có lối vào "Đối chiếu số liệu" — 2026-10-23

**Thay đổi:** badge đối chiếu (dẫn tới D04, nơi có nút "Chạy lại đồng bộ") trước chỉ hiện khi đã có kết quả đối chiếu; Client mới đồng bộ lần đầu (hoặc đồng bộ lỗi) không có đường bấm chạy lại. Nay hiện khi Client có ít nhất một tài khoản QC (badge "Chưa đối chiếu").

**Test tự động:** E2E `clients-assign.spec.ts` vẫn đi qua badge tới D04 (không đổi).

**PM kiểm tra:** Client mới gán tài khoản, chưa đồng bộ xong → cạnh tên Client có "Chưa đối chiếu" → bấm → D04 có nút "Chạy lại đồng bộ".

## [fix] Đồng bộ tài khoản Meta thật bị treo ở `adcreatives` — 2026-10-23

**Thay đổi**
- PM đồng bộ tài khoản thật "TRON_GLAMPING": tiến độ đứng ở 0%. `job_audit` cho thấy `act_…/adcreatives` trả **HTTP 500, mã 1** lặp lại (Meta: "Please reduce the amount of data you're asking for") vì trang 500 creative có `thumbnail_url` quá nặng; mỗi lần client lại thử y nguyên → lô đồng bộ không xong.
- `MetaHttp.paginate`: gặp mã 1 khi trang còn thu nhỏ được → thử lại **cùng trang với `limit` ÷4** (tối thiểu 25), không thử lại y nguyên; các trang sau dùng `limit` nhỏ hơn (theo URL `next` của Meta). Ở trang nhỏ nhất vẫn lỗi → thử lại như lỗi tạm thời rồi báo lỗi như cũ.

**Test tự động:** `http.test.ts` — trang nặng tự giảm 500 → 125 → 31 rồi đọc được, không chờ backoff; ở `limit` 25 vẫn lỗi thì thử lại theo `maxAttempts` rồi ném lỗi mã 1.

**PM kiểm tra:** mở lại màn đồng bộ — TRON_GLAMPING chạy tiếp (nếu báo lỗi thì bấm "Đồng bộ lại").

## [047] Admin: tra cứu workspace (hỗ trợ khách) — 2026-10-23

**Thay đổi**
- `/admin/workspaces`: tìm theo tên workspace **hoặc email thành viên**; số thành viên, tài khoản QC (không tính kết nối đã ngắt).
- `/admin/workspaces/[id]` (+ `GET /api/v1/admin/workspaces/[id]`): gói (đang hưởng / đã đăng ký, trạng thái, tài khoản active / hạn mức, hết kỳ, ân hạn), cờ, thành viên, kết nối Meta (người kết nối, trạng thái, hạn token, quyền ghi — **không bao giờ trả token**), tài khoản QC (Client, gán, đồng bộ, đồng bộ gần nhất, số ngày lệch 30 ngày; tài khoản chờ xóa có nhãn), 20 lần đồng bộ gần nhất (lỗi), sự cố đang mở, yêu cầu xóa dữ liệu. Không trả số liệu quảng cáo.
- `core/ops/workspace-lookup.ts` (`searchWorkspaces`, `adminWorkspaceDetail`): truy vấn xuyên workspace có chú thích, chỉ route staff gọi.

**Test tự động:** `workspace-lookup.test.ts` (tìm theo tên / email thành viên, chi tiết không chứa token, id lạ → 404); `admin-roles.test.ts` (người ngoài 404, staff xem được). Bộ cách ly: route mới khai báo `exempt` có lý do.

**PM kiểm tra:** `/admin/workspaces` → gõ email của mình → mở workspace → thấy kết nối Meta, tài khoản "Tan Trinh", trạng thái đồng bộ.

## [046] Admin: vai trò superadmin / operator, đề xuất bật cờ, nhật ký admin — 2026-10-23

**Thay đổi** (ADR-0013)
- `app.staff.role` (`superadmin` / `operator`); staff PM cũ → superadmin, staff thường → operator (không ai mất quyền đang có). `pnpm seed:staff -- --can-enable-flags` tạo superadmin.
- **Đội ngũ** `/admin/staff`: superadmin thêm staff theo email người đã có tài khoản, đổi vai trò, gỡ quyền (bắt buộc lý do; không tự đổi / gỡ mình; luôn còn ≥ 1 superadmin). Operator chỉ xem.
- **Đề xuất bật cờ** (`app.flag_proposals`, `core/flags/proposals.ts`): operator bấm ô cờ → "Gửi đề xuất"; superadmin duyệt (bật qua `enableFlag`, checklist chạy lại, vượt checklist cần chọn và ghi log) hoặc từ chối (lý do); người đề xuất tự hủy được. Mỗi workspace × cờ chỉ một đề xuất chờ.
- **Kill switch toàn cục:** mọi staff **bật** được (dừng khẩn cấp), chỉ superadmin **tắt**.
- **Nhật ký admin** `/admin/audit` (`app.admin_audit_log`, trigger chặn sửa / xóa): staff, đề xuất, kill switch. Superadmin xem tất cả, operator chỉ dòng của mình.
- Header admin hiện vai trò (Superadmin / Operator).

**Test tự động**
- `apps/web/src/app/api/v1/admin/admin-roles.test.ts`: quyền từng vai trò, không tự hạ / gỡ mình, nhật ký chỉ thêm (UPDATE / DELETE bị chặn), operator chỉ thấy nhật ký của mình, đề xuất → duyệt (checklist chưa đạt không vượt → 409) → cờ bật + `flag_change_log`, từ chối / hủy.
- E2E `admin-roles.spec.ts`: operator đề xuất → superadmin duyệt (vượt checklist) → cờ bật → nhật ký → đổi vai trò.
- Bộ cách ly: 8 route mới khai báo `exempt` có lý do (route staff, người không phải staff → 404).
- **Test đổi (lý do):** `admin.test.ts` "kill switch toàn cục" — trước khẳng định staff thường bật → 403; ADR-0013 (PM chốt 23/10) cho operator bật khẩn cấp. Test nay khẳng định operator bật được, **không tắt được (403)**, superadmin tắt được, người ngoài 404 cả GET và POST (thêm assertion, không bớt).
- **Test đổi (lý do):** E2E `p2b.spec.ts` — guardrail chặn hành động tự động 22:00–06:00 giờ tài khoản, nên chạy lúc 22:14 (giờ VN) thì không có hành động tự động và test đỏ (CI chạy buổi tối cũng đỏ). Thêm bước `useDaytimeTimezone` (chỉ DB local E2E) đặt múi giờ tài khoản QC sang múi đang ban ngày trước khi đánh giá rule live. Guardrail và assertion giữ nguyên.

**Vùng bảo vệ:** `packages/db/**` (migration 0051–0052: cột `role`, 2 bảng, RLS, trigger append-only), `packages/core/flags/**` (đề xuất; điều kiện bật cờ đọc `role = superadmin` thay vì `can_enable_flags`, cùng giá trị sau migration).

**PM kiểm tra:** `/admin/staff` thêm một email đã đăng ký làm operator → đăng nhập bằng email đó → `/admin/flags` bấm ô cờ tắt → "Gửi đề xuất" → đăng nhập superadmin → đề xuất ở đầu trang → Duyệt → `/admin/audit` thấy cả hai dòng.

## [fix] Tài khoản của kết nối đã ngắt không còn hiện để gán / đồng bộ — 2026-10-23

**Thay đổi**
- PM thấy màn gán Client (S05) liệt kê cả 3 tài khoản Meta giả của kết nối đã ngắt (đang chờ xóa 7 ngày) cạnh tài khoản thật. `listAdAccounts` nay mặc định bỏ tài khoản của kết nối `revoked` (S05, S06, Client, Tổng quan, Creative, rule builder…); `unconfirmedCount` cũng bỏ chúng. `includeRevoked: true` chỉ dùng ở nhật ký hành động và breaker để vẫn hiện tên tài khoản của lịch sử.

**Test tự động:** `assignment.test.ts` — tài khoản của kết nối đã ngắt không có trong danh sách gán, không tính vào "chưa xác nhận"; `includeRevoked` vẫn trả về.

**Vùng bảo vệ:** `packages/core/connections/**` (truy vấn danh sách tài khoản, không chạm token), `packages/core/execution/**` (log.ts, controls.ts chỉ truyền `includeRevoked: true`, hành vi giữ nguyên).

**PM kiểm tra:** ngắt một kết nối → màn gán Client và trang Client không còn tài khoản của kết nối đó; nhật ký hành động cũ vẫn hiện tên tài khoản.

## [fix] Bỏ quyền `email` khi kết nối Meta — 2026-10-23

**Thay đổi**
- `READ_SCOPES` chỉ còn `ads_read`, `business_management` (`WRITE_SCOPES` thêm `ads_management`). PM test với Meta App thật (Facebook Login for Business) bị chặn: "Invalid Scopes: email". Quyền `email` không được dùng ở đâu. Cập nhật L3 mục quyền, mock, trang S02.

**Test tự động:** `packages/meta-client/src/oauth.test.ts` (danh sách scope, URL đăng nhập đúng scope / redirect_uri / state).

**PM kiểm tra:** Kết nối → Kết nối Meta → trang Facebook hiện hộp cấp quyền, không còn lỗi "Invalid Scopes".

## [tooling] Mở app local bằng một cú double-click — 2026-10-23

**Thay đổi**
- `Mo-AdxLens.cmd` (gốc repo) và `pnpm start:local` (`scripts/start-local.mjs`): bật Docker Desktop nếu cần → `pnpm install` khi lockfile đổi → Redis + Supabase → `.env.local` (chỉ điền key Supabase còn trống; không tạo lại khóa mã hóa token) → migration → tài khoản staff `pm@adxlens.local` / `AdxLens@local1` → web + worker → mở trình duyệt. App đang chạy sẵn thì chỉ mở trình duyệt.
- `.gitattributes`: file `.cmd` giữ CRLF.
- Mặc định chạy **bản build** (build lại chỉ khi commit hoặc code chưa commit trong `apps/web`, `packages` đổi; dấu build ở `apps/web/.next/adxlens-build-stamp`). Lý do: PM thấy chuyển tab chậm — `next dev` biên dịch từng trang lần đầu mở (đo: /reports 19 giây, /automation 8,7 giây); bản build: mọi trang 0,06–0,17 giây. `--dev` để chạy `pnpm dev` như cũ.
- Sửa `pnpm seed:staff`: đổi `scripts/seed-staff.ts` → `.mts` (top-level await lỗi khi tsx chạy ở gốc CommonJS).

**Test tự động:** `scripts/lib/start-local.test.ts` (đọc `supabase status`, điền key còn trống, không ghi đè key đã có, không đổi khóa token, dấu build đổi khi code đổi).

**PM kiểm tra:** double-click `Mo-AdxLens.cmd` → trình duyệt mở trang đăng nhập → đăng nhập bằng tài khoản PM ở trên.

## [045] E2E luồng implementation-guide Phần 4, diễn tập 3 sự cố — 2026-10-23

**Thay đổi**
- `apps/worker/src/drill.ts` + `pnpm drill [-- --cleanup]` (chỉ local, Meta giả): tạo workspace diễn tập rồi giả lập:
  1. **Meta rate limit** → health check mở sự cố, playbook `meta_rate_limited` hoãn queue `sync`;
  2. **đối chiếu lệch** (ngày lệch 1,4% của mock) → `reconciliation_warning` + `reconcile_retry`;
  3. **thực thi lỗi** → hành động thất bại, `execution_failed` P1, breaker mở.

  In ĐẠT / LỖI từng bước; `--cleanup` xóa workspace diễn tập, đóng sự cố, xóa người dùng diễn tập. `core/execution` thêm `newMockMetaWriter` (bản ghi giả có cài lỗi, chỉ local / test) để worker không import lớp ghi trực tiếp.
- **Test đổi (lý do):** `tests/isolation/routes.test.ts` và `jobs.test.ts` — test duyệt mọi route / job nay có timeout riêng 300 giây (trước dùng mặc định 20 giây). Số route tăng (B5–B9) làm test vượt 20 giây trên CI, vitest bắt đầu test kế tiếp khi test cũ còn chạy → lỗi trùng khóa giả. Không đổi assertion nào. Khóa idempotency của hành động mẫu workspace B trong `world.ts` thêm id workspace (tránh trùng nếu dữ liệu chưa dọn).
- **CI E2E chạy trên bản build:** job `e2e` build web rồi chạy Playwright với `next start` (biến `E2E_WEB_COMMAND`). Với 13 spec, `next dev` trên runner CI biên dịch từng trang lần đầu truy cập nên chậm, làm 4 spec quá timeout (điều hướng, chuyển trang). Không đổi timeout hay assertion nào; local vẫn mặc định `pnpm dev`.
- E2E mới `safety.spec.ts` (implementation-guide 4.4):
  - Client của workspace khác → 404, không lộ tên;
  - người thường vào `/admin` → 404;
  - API sau cờ (Gợi ý, Creative, Nhật ký hành động, Rule tự động) khi cờ tắt → 404;
  - trang mở thẳng → "chưa bật".
- Phần 4 được phủ bởi 12 spec E2E (danh sách ở `docs/onboarding.md` mục 11). Ngoài E2E:
  - mua gói bằng thẻ test Stripe / PayOS cần khóa sandbox (PM kiểm tay theo onboarding mục 6–7);
  - "token không có trong log" được kiểm bằng test đơn vị (`meta-client` che token, route OAuth).

**Test tự động**
- `apps/worker/src/drill.test.ts`: cả 3 sự cố ĐẠT, dọn sạch (không còn workspace, không còn sự cố mở).
- E2E `safety.spec.ts`. Đã chạy thật `pnpm drill -- --cleanup` trên DB local: 3/3 ĐẠT.

**Vùng bảo vệ:** `packages/core/execution/**` (chỉ thêm hàm tạo bản ghi giả cho local / test).

**PM kiểm tra:** `pnpm drill` → `/admin/incidents` thấy 3 sự cố (cảnh báo đội nếu đặt `OPS_ALERT_EMAILS`) → `pnpm drill -- --cleanup`. `pnpm test:e2e` xanh.

## [044] Quy trình agent-diagnose, runbook đầy đủ, onboarding hoàn chỉnh, xoay khóa token — 2026-10-23

**Thay đổi**
- `.github/ISSUE_TEMPLATE/agent-diagnose.yml`: mẫu issue chỉ nhận dữ liệu đã che (fingerprint, job / route, mã lỗi, stack trace, môi trường), bắt buộc xác nhận không có token / dữ liệu khách. `docs/runbooks/agent-diagnose.md`: quy trình phát hiện → agent → CI → review độc lập → PM.
- `docs/runbooks/`:
  - mục lục `README.md`;
  - runbook mới: đối chiếu lệch, rate limit, token hết hạn, backfill lỗi / kẹt, smoke sau deploy, thanh toán, xóa dữ liệu, khôi phục DB, xoay khóa token, bật / tắt cờ (checklist từng cờ);
  - đã có từ 037: sự cố thực thi.
- `docs/onboarding.md` hoàn chỉnh (L3 20): bản đồ module + luồng dữ liệu, bảng lệnh, danh sách E2E, diễn tập sự cố, tài liệu ở đâu, tuần đầu cho dev mới.
- Xoay khóa token (L3 5.4 — trước đây chưa có): `reencryptWorkspaceTokens` (`core/connections`, theo từng workspace, chỉ worker / CLI, không log token) + `pnpm tokens:rotate`.
- Playbook `execution_failed` bổ sung theo L2 11.2: **hành động tự động thất bại → tạm dừng rule live đã tạo ra nó** (nhật ký `rule_paused`).

**Test tự động**
- `connections/rotate.test.ts`: mã hóa lại bằng khóa mới, token đọc lại đúng, chạy lại không đổi, không chạm workspace khác.
- `execution/gateway.test.ts` (+1): hành động tự động lỗi → rule chuyển "tạm dừng".

**Vùng bảo vệ:** `packages/core/connections/**` (xoay khóa: giải mã + mã hóa lại; không đổi thuật toán), `packages/core/execution/**` (tạm dừng rule khi lỗi). Cần PM chạy staging cùng lượt với 035–041.

**PM kiểm tra:** đọc `docs/onboarding.md` và `docs/runbooks/README.md`; tạo thử issue bằng mẫu "Chẩn đoán lỗi".

## [043] Trang sự cố AD03, playbook worker_stuck và deploy_smoke_failed, kênh báo đội — 2026-10-23

**Thay đổi**
- `core/ops/stuck.ts`:
  - Tín hiệu `stuck_work` trong `ops:health_check`: hành động "đang thực hiện" quá 15 phút; đồng bộ "đang chạy" quá 3 giờ.
  - Playbook `worker_stuck` (tối đa 3 lần / giờ, vượt → leo thang):
    - hành động kẹt → thất bại `stuck_check_manually`. **Không chạy lại lời gọi ghi** (ADR-0008). Mở sự cố P1;
    - đồng bộ kẹt → thất bại `stalled` để chạy lại;
    - hết kẹt → đóng sự cố.
  - `recordDeploySmoke`: smoke lỗi → sự cố P1 `deploy_smoke_failed` + lần chạy "leo thang (báo PM)" (rollback do PM / nền tảng deploy); đạt → đóng.
- `core/ops/alerts.ts`: kênh báo đội AdxLens (`registerIncidentSink`, `teamAlertSink`): sự cố **P1/P2 mới hoặc vừa nâng mức** → email `OPS_ALERT_EMAILS` và/hoặc Slack `OPS_SLACK_WEBHOOK_URL`; nội dung chỉ mức, loại, tiêu đề chung, link AD03 (không tên khách / campaign / token); kênh lỗi không làm hỏng việc mở sự cố. Đăng ký ở worker và web. **Bỏ mục tech-debt "đội AdxLens chưa có kênh cảnh báo riêng"**.
- `incidentDetail`; API `GET /admin/incidents`, `GET|POST /admin/incidents/{id}` (staff).
- Trang AD03 `/admin/incidents`: lọc trạng thái, mức, số lần, chi tiết (detail đã che), lần chạy playbook, "Đã giảm thiểu" / "Đã xử lý".
- `pnpm smoke -- <base_url>`: kiểm `/api/health`, `/`, `/pricing`, `/r/demo`, `/login`; lỗi → thoát mã 1 + ghi sự cố (khi có `DATABASE_URL`).

**Test tự động**
- `ops/stuck.test.ts` (5):
  - hành động kẹt → thất bại kiểm tra thủ công + P1, hành động mới không bị chạm; đồng bộ kẹt → stalled;
  - giới hạn 3 lần / giờ → leo thang; hết kẹt đóng sự cố;
  - smoke lỗi / đạt;
  - kênh báo đội chỉ gửi P1/P2 mới hoặc nâng mức;
  - email + Slack đúng nội dung, kênh lỗi không làm hỏng.
- `admin.test.ts` (+1): AD03 không phải staff 404, staff xem / chi tiết / xử lý. Bộ cách ly: 3 route admin miễn trừ có lý do.

**Vùng bảo vệ:** không (ops; playbook không đụng execution ngoài việc đánh dấu thất bại hành động kẹt, không gọi Meta).

**PM kiểm tra:** `/admin/incidents` (sau khi bật kill switch toàn cục ở 037 sẽ có sự cố P1); `pnpm smoke -- http://localhost:3000` khi đang chạy `pnpm dev`.

## [041] Rule live tạo hành động tự động qua gateway, hiệu quả tự động hóa (P215) — 2026-10-23

> Chạm `packages/core/execution` — **cần PM chạy staging trước khi merge `develop → main`**; đây là đường ghi `tier=auto` (ADR-0012).

**Thay đổi**
- `gateway.ts` → `requestAutoAction`: hành động `tier=auto` qua **đúng** cổng an toàn của duyệt tay (cờ duyệt hành động + cờ tự chạy, gói, kill switch, breaker, quyền ghi) và guardrails `auto` (giờ yên lặng theo giờ tài khoản, không bật lại / nhân bản, giới hạn số hành động/ngày = min(workspace, rule), loại trừ của workspace + rule); mỗi đối tượng không bị cùng rule thao tác lại trong 24 giờ; nhật ký `auto_requested`.
- `rules.ts`:
  - `liveEvaluate` (`evaluate_rules`): đánh giá trên snapshot, tạo hành động cho từng đối tượng khớp, ghi `rule_evaluations` (id hành động đã tạo, lý do bị chặn).
  - `automationEffectiveness` (P2-14, 30 ngày): hành động / thành công / thất bại / hoàn tác (mục tiêu ≤ 5%) / chi tiêu 7 ngày trước của đối tượng bị tạm dừng (ước tính, ghi rõ không phải nhân quả).
- Worker `rules:evaluate` (kiểm cờ ở đầu job); `maintenance:rules_tick` (040) enqueue cho rule live.
- API `GET /automation-rules/effectiveness`. Trang P215 `/automation/results` (tỷ lệ hoàn tác tô màu theo mục tiêu 5%). Nhật ký hành động hiện "Hệ thống" là người duyệt của hành động tự động.

**Test tự động**
- `execution/gateway.test.ts` (+4):
  - rule live tạo đúng số hành động theo giới hạn/ngày của rule, `tier=auto`, worker thực hiện, đánh giá ghi id + lý do chặn, lần sau trong 24 giờ không lặp;
  - **giờ yên lặng, kill switch, tắt cờ tự chạy → không tạo hành động** (lý do được ghi);
  - rule không live → bỏ qua;
  - hiệu quả: tổng / thành công / hoàn tác / tỷ lệ.
- Coverage `packages/core/execution`: **97,9% dòng**.
- Worker: `rules:evaluate` **cờ tắt → không chạy**. Route: `effectiveness` cờ tắt 404. Bộ cách ly: probe job `rules:evaluate` + route mới.
- **E2E mới `p2b.spec.ts`**:
  1. mẫu → sửa điều kiện → backtest → lưu chạy thử ("Bật chạy thật" bị khóa);
  2. giả lập 14 ngày → 14 lần đánh giá, mở khóa → bật chạy thật;
  3. rule tạo hành động tự động → worker thực hiện → nhật ký "Thành công", người duyệt "Hệ thống";
  4. P215 có dòng.

**Vùng bảo vệ:** `packages/core/execution/**`.

**PM kiểm tra:** theo `p2b.spec.ts` trên develop (Meta mock, `pnpm rules:simulate`); trên staging với tài khoản test trước khi bật cờ tự động hóa cho khách (L3 18.3: P2a ≥ 8 tuần, hoàn tác ≤ 5%).

## [040] Shadow mode chạy định kỳ (P214), lệnh giả lập thời gian chỉ ở local — 2026-10-23

**Thay đổi**
- Job `maintenance:rules_tick` mỗi 30 phút: enqueue `rules:shadow_evaluate` (rule shadow) / `rules:evaluate` (rule live, 041) cho từng rule — truy vấn xuyên workspace có chú thích (`core/ops`), chỉ trả định danh.
- Worker `rules:shadow_evaluate`: kiểm cờ tự động hóa ở đầu job; ghi `would_do` một lần mỗi ngày dữ liệu (đã có ở 039). Trang chi tiết rule (P214) hiện các lần đánh giá, đối tượng khớp, lý do bị chặn.
- `simulateShadowDays` + `pnpm rules:simulate -- <rule_id> [--days 14]`: **chỉ chạy khi `APP_ENV=local`** — ghi đánh giá shadow cho N ngày trước và lùi mốc bắt đầu shadow để thử luồng bật chạy thật trên máy dev.

**Test tự động**
- `execution/rules.test.ts` (+1): giả lập 14 ngày → 14 lần đánh giá, mốc shadow lùi đúng 14 ngày.
- Worker `dispatch.test.ts` (+1): `rules:shadow_evaluate` **cờ tắt → không chạy**. Bộ cách ly: probe job `rules:shadow_evaluate` (rule của A, B không đổi).

**Vùng bảo vệ:** `packages/core/execution/**` (thêm hàm giả lập, không đổi đường ghi).

**PM kiểm tra:** tạo rule (039) → `pnpm rules:simulate -- <rule_id>` → chi tiết rule hiện 14 lần đánh giá, "Đã chạy thử 14/14 ngày", nút "Bật chạy thật" mở (khi cờ + gói đủ).

## [039] Rule tự động: mô hình, rule builder từ mẫu (P211, P212), backtest (P213) — 2026-10-23

> Chạm `packages/core/execution` — **cần PM duyệt ADR-0012 và chạy staging trước khi merge `develop → main`**.

**Thay đổi**
- ADR-0012 (Đề xuất): điều kiện tối giản kiểm bằng zod (cấp ad / ad set; điều kiện VÀ trên spend, results, CPA, CTR, tần suất, % thay đổi CTR/CPA so tuần trước); hành động rule chỉ tạm dừng ad / ad set hoặc ngân sách ±15% (tăng phải có trần; không bật lại, không nhân bản); mẫu từ gợi ý P1; shadow ≥ 14 ngày trước live; guardrails rule chỉ chặt hơn workspace.
- DB: `app.automation_rules`, `app.rule_evaluations` + RLS (migration 0049–0050).
- `core/execution/rules.ts`:
  - `RULE_TEMPLATES` + `listRuleTemplates` (sắp theo số gợi ý loại đó đã làm);
  - `createRule` (luôn shadow; kiểm hợp lệ ngữ nghĩa và guardrails);
  - `setRuleMode` + `liveBlocker` (cờ tự chạy, gói, đủ 14 ngày shadow; về shadow đặt lại mốc);
  - `entityMetrics` (snapshot 7 ngày + 7 ngày trước, thập phân);
  - `matchConditions` (chỉ đối tượng đang chạy);
  - `ruleBudget` (làm tròn xuống, không vượt trần);
  - `backtestRule` (30 ngày, mỗi đối tượng ≤ 1 lần / 24 giờ);
  - `evaluateRule` (kèm lý do guardrails sẽ chặn, tier auto);
  - `shadowEvaluate` (một lần mỗi ngày dữ liệu, không tạo hành động);
  - `ruleEvaluationsFor`.
- API `/automation-rules` (GET, POST), `/templates`, `/backtest`, `/{id}` (GET, DELETE), `/{id}/mode` — Owner/manager, sau cờ tự động hóa.
- Trang P211 `/automation`, P212 `/automation/new` (chọn mẫu, sửa điều kiện / hành động / giới hạn, **bắt buộc backtest trước khi lưu**, kết quả P213 ngay dưới), chi tiết `/automation/{id}` (tóm tắt rule, tiến độ chạy thử x/14 ngày, lý do chưa bật live, kết quả đánh giá, đổi chế độ, xóa).

**Test tự động**
- `execution/rules.test.ts` (8): chỉ số snapshot + mẫu "ad mệt" khớp đúng (bỏ ad đã tắt); ngân sách làm tròn + trần; kiểm hợp lệ (cấp, ±15%, tăng cần trần, guardrails chặt hơn); vòng đời shadow → live (cờ, gói, 14 ngày; về shadow đặt lại mốc); quyền + cách ly; backtest 30 ngày không lặp trong 24 giờ; shadow ghi một lần / ngày, loại trừ hiện lý do chặn, không tạo hành động; mẫu sắp theo số lần làm.
- `api/v1/automation-rules/automation.test.ts` (2): **cờ tắt → 404**; cờ bật: mẫu, backtest, tạo, live 409, tạm dừng, buyer 403.
- Bộ cách ly: probe 6 route (tài khoản / rule của B → từ chối); world B có rule bí mật; A bật thêm cờ tự động hóa.

**Vùng bảo vệ:** `packages/core/execution/**`, `packages/db/**` (2 bảng + RLS, migration 0049–0050).

**PM kiểm tra:** duyệt ADR-0012. Bật cờ "Tự động hóa" → Rule tự động → Tạo rule → chọn mẫu → Chạy backtest → Lưu và chạy thử → chi tiết hiện "Đã chạy thử 0/14 ngày", nút "Bật chạy thật" bị khóa.

## [038] Hộp thoại duyệt hành động từ gợi ý (P202) — 2026-10-23

> Chạm `packages/core/execution` — **cần PM chạy staging trước khi merge `develop → main`**.

**Thay đổi**
- `core/execution/proposal.ts`: gợi ý → hành động v1:
  - creative mệt → tạm dừng ad;
  - chi tiêu không chuyển đổi → tạm dừng ad set;
  - phân bổ ngân sách kém → **giảm** ngân sách ngày đúng 15% (không bao giờ tăng từ gợi ý);
  - creative thua chỉ dùng ở 1 ad → tạm dừng ad đó;
  - các loại khác → làm thủ công.

  `proposalForRecommendation` trả trước / sau, vi phạm guardrails, cảnh báo (không hoàn tác được; ngân sách có thể đưa về giai đoạn học; tạm dừng ad cuối cùng đang chạy của ad set) và người xem có quyền duyệt không. `approveRecommendation` gửi qua đúng gateway, gợi ý chuyển "Đang làm"; gateway thành công → gợi ý "Đã làm".
- API `GET /recommendations/{id}/proposal`, `POST /recommendations/{id}/approve` (202, theo L3 10.2) — sau cờ duyệt hành động.
- Giao diện: drawer P102 có "Duyệt thực hiện trên Meta" (khi cờ bật) → P202: thay đổi trước → sau, ghi chú "trước theo lần đồng bộ gần nhất", cảnh báo, vi phạm guardrails (khóa nút), không có quyền (khóa nút); xác nhận → chuyển tới P204 theo dõi thực hiện + xác minh.

**Test tự động**
- `execution/gateway.test.ts` (+4): creative mệt → đề xuất tạm dừng, duyệt → "Đang làm", thực hiện → "Đã làm"; ngân sách giảm đúng 15% + cảnh báo; gợi ý thủ công → không đề xuất, duyệt 409; buyer chưa được cấp quyền → `canApprove=false`, duyệt 403; workspace khác 404.
- `recommendations.test.ts` (+ **cờ tắt → 404** cho 2 route). Bộ cách ly: probe 2 route (gợi ý của B → 404).
- **E2E mới `p2a.spec.ts`** (toàn luồng B7, Meta mock):
  1. kết nối, PM bật 3 cờ, gói Growth;
  2. P201 cấp quyền ghi;
  3. P101 → P202 duyệt tạm dừng ad mệt;
  4. worker thực hiện + xác minh (P204 "Thành công", dòng thời gian có "Đọc lại để xác minh");
  5. hoàn tác → thành công, P203 có 2 dòng (1 "Đã hoàn tác");
  6. P205 bật kill switch → banner X04.

**Vùng bảo vệ:** `packages/core/execution/**`.

**PM kiểm tra:** theo đúng các bước của `p2a.spec.ts` trên develop (Meta mock); trên staging với tài khoản Meta test trước khi bật cờ cho khách.

## [037] Kill switch (workspace + toàn cục, CLI dự phòng), circuit breaker, playbook execution_failed, checklist cờ duyệt hành động — 2026-10-23

> Chạm `packages/core/execution` — **cần PM chạy staging trước khi merge `develop → main`**.

**Thay đổi**
- `core/execution/controls.ts`:
  - `setWorkspaceKillSwitch` (Owner; bật cần lý do; hủy ngay hành động đang chờ; audit);
  - `executionControls` (trạng thái + breaker theo tài khoản);
  - `closeBreaker` (Owner mở khóa, audit);
  - `registerExecutionHooks`: checklist kỹ thuật cờ `p2a_approve` (L3 18.3) — có kết nối được cấp quyền ghi; `execution:check` của **phiên bản deploy hiện tại** (`APP_VERSION`) đạt; kill switch toàn cục tắt; Owner đã lưu guardrails. Tắt cờ duyệt hành động → hủy mọi hành động đang chờ; tắt cờ tự chạy → hủy hành động `auto` đang chờ (L3 18.1).
- `core/ops/kill-switch.ts`:
  - kill switch toàn cục (xuyên workspace có chú thích): bật → hủy hành động đang chờ của mọi workspace, mở sự cố P1;
  - bản cho CLI theo workspace;
  - `recordExecutionCheck` / `latestExecutionCheck`.
- DB: `app.ops_execution_checks` (migration 0047–0048). Env `APP_VERSION`.
- Playbook `execution_failed` (L3 12): mọi thất bại mở / gom sự cố theo tài khoản (P2). Breaker vừa mở → nâng P1 và hủy các hành động đang chờ khác của tài khoản. `openIncident` nay **nâng mức** khi lần lặp nghiêm trọng hơn (không bao giờ hạ).
- CLI: `pnpm killswitch -- on|off [--workspace <id>] --reason "…"`; `pnpm execution:check` ghi kết quả vào DB (chạy mock không tính là đạt).
- API:
  - `GET|POST /kill-switch`, `POST /circuit-breakers/{id}/close` (Owner, sau cờ);
  - `GET|POST /admin/kill-switch` (staff xem, chỉ PM đổi, cần lý do).
- Giao diện:
  - P205 thêm thẻ Kill switch (trạng thái, bật có hộp thoại lý do, tắt, danh sách tài khoản bị tạm khóa + "Mở khóa");
  - AD04 `/admin/kill-switch`;
  - X04 biến thể kill switch (workspace / toàn cục), chỉ hiện khi cờ duyệt hành động bật.
- Runbook `docs/runbooks/execution-incident.md`.

**Test tự động**
- `execution/controls.test.ts` (7):
  - kill switch workspace: cần lý do, hủy hành động đang chờ, audit, tắt lại;
  - chỉ Owner, không ảnh hưởng workspace khác;
  - breaker hiện ở P205, Owner mở khóa, tài khoản workspace khác 404;
  - toàn cục hủy hành động mọi workspace + sự cố P1;
  - CLI theo workspace;
  - **checklist cờ** (đúng phiên bản deploy);
  - **tắt cờ hủy hành động đang chờ** (tự chạy chỉ hủy `auto`).
- `execution/gateway.test.ts` (+1, +assert): sự cố gom theo tài khoản và nâng P1 khi breaker mở; breaker mở hủy hành động đang chờ khác.
- `api/v1/admin/admin.test.ts` (+1): AD04 không phải staff 404, staff 403 khi đổi, PM cần lý do. `api/v1/guardrails` (+1): kill switch workspace cờ tắt 404, bật / trạng thái.
- Bộ cách ly: probe 3 route workspace (breaker của B → 404); 2 route admin miễn trừ có lý do.

**Vùng bảo vệ:** `packages/core/execution/**`, `packages/db/**` (1 bảng + RLS, migration 0047–0048). `packages/core/ops` (đổi `openIncident`: nâng mức).

**PM kiểm tra:** Cài đặt → Guardrails → Bật kill switch (lý do) → banner đỏ trên mọi trang; tắt. `/admin/kill-switch` bật / tắt toàn cục. `pnpm killswitch -- on --reason "thử CLI"` rồi `off`.

## [036] Nhật ký hành động (P203), chi tiết + hoàn tác (P204) — 2026-10-23

> Chạm `packages/core/execution` — **cần PM chạy staging trước khi merge `develop → main`** (cùng lượt với 035).

**Thay đổi**
- `core/execution/log.ts`: `listActions` (theo phạm vi Client, lọc trạng thái / tài khoản), `getAction` (dòng thời gian từ nhật ký append-only, hành động hoàn tác liên quan), `undoAction` (P2-06): tạo hành động **mới** ngược lại (bật lại / tạm dừng / ngân sách về giá trị cũ, `undo_of`) đi qua đúng gateway; nhân bản, hành động thất bại / không đổi / đã hoàn tác → không hoàn tác được. Hoàn tác không tính vào giới hạn số hành động/ngày.
- Gateway: thành công thì ghi xuyên trạng thái đã xác minh (trạng thái / ngân sách) vào `analytics.entities` để xem trước và hoàn tác dùng trạng thái đúng trước lần đồng bộ kế tiếp; hoàn tác thành công đánh dấu hành động gốc "đã hoàn tác".
- API `GET /actions`, `GET /actions/{id}`, `POST /actions/{id}/undo` (202) — sau cờ duyệt hành động.
- Trang P203 `/action-log` (lọc trạng thái; thời điểm, hành động, thay đổi trước → sau, người duyệt, trạng thái) và P204 `/action-log/{id}` (tóm tắt, dòng thời gian, banner thất bại / cần kiểm tra thủ công, nút hoàn tác có hộp thoại xác nhận; lỗi hiển thị theo mã, song ngữ). Ngân sách hiển thị theo đơn vị nhỏ nhất của tiền tệ (tech-debt: bảng tiền tệ không có phần lẻ).

**Test tự động**
- `execution/gateway.test.ts` (+3): tạm dừng → hoàn tác bật lại qua gateway, gốc "đã hoàn tác", bản chụp cập nhật, không hoàn tác lần hai; hoàn tác ngân sách về đúng giá trị; nhân bản / thất bại không hoàn tác được; danh sách theo phạm vi Client, buyer không thấy ngoài phạm vi, workspace khác 404.
- `api/v1/actions/actions.test.ts`: **cờ tắt → 404** cho 3 route. `lib/actions.test.ts`: hiển thị thay đổi (VND đồng, USD cent).
- Bộ cách ly: probe 3 route; world B có một hành động (tên/id bí mật không lộ; hoàn tác chéo workspace → 404).

**Vùng bảo vệ:** `packages/core/execution/**`.

**PM kiểm tra:** sau khi duyệt một hành động (038) → "Nhật ký hành động" → mở chi tiết → "Hoàn tác".

## [035] Execution Gateway: executor, verifier, idempotency, lỗi giữa chừng, test tích hợp — 2026-10-23

> **Cần PM chạy test tích hợp trên staging trước khi merge `develop → main`** (vùng bảo vệ `execution`, L3 13.1): `pnpm execution:check -- <ad_id> <adset_id>` với tài khoản Meta test (`docs/onboarding.md` mục 8).

**Thay đổi**
- DB: `app.actions` (theo L3 5.2 + `target_type`, `params`, `after_expected`, `result_code`, `error_message` đã che, `undo_of`), `app.action_logs` (**append-only**: trigger chặn UPDATE), `app.kill_switches` (`global` / theo workspace), `app.circuit_breakers` (theo tài khoản QC). RLS (migration 0045–0046).
- `core/execution/gateway.ts`:
  - `previewAction` (trước theo lần đồng bộ gần nhất / sau mong đợi / vi phạm guardrails / hoàn tác được không — không gọi Meta);
  - `requestAction` (cờ → gói Growth+ → kill switch toàn cục + workspace → breaker → quyền ghi của kết nối → vai trò theo Client → guardrails; tạo `pending` + nhật ký, enqueue `execute:action`; đang có hành động trùng → 409);
  - `executeAction` (worker): giành quyền chạy `pending → executing` có điều kiện (retry trùng → bỏ qua); kiểm lại toàn bộ cổng an toàn và guardrails với dữ liệu thật; đọc trạng thái thật — đã ở đích → `no_change` không gọi Meta; khác `before_state` → `state_changed` không ghi đè; **ghi một lần, không retry**; luôn đọc lại để xác minh (Meta báo lỗi nhưng đã áp → `applied_despite_error`; không khớp → `verify_mismatch`); nhân bản lỗi → `meta_error_check_manually` (không đoán).
  - Thất bại: đếm breaker (mở sau N lỗi theo guardrails), thông báo Owner + người duyệt. Thành công: thông báo `action_executed` (mới). Thông điệp lỗi đã che token.
- `safety.ts`: trạng thái kill switch (đọc dòng `global` — xuyên workspace có chú thích), breaker, `cancelPending`. `writer.ts`: `createMetaWriter` (mock dùng chung / HTTP không retry) — worker lấy lớp ghi qua đây, không import `meta-client/write`.
- `self-test.ts` + `pnpm execution:check`: test tích hợp mọi `action_type` trên tài khoản Meta test, chỉ local/staging, từ chối đối tượng ngoài `META_WRITE_TEST_ACCOUNTS`, trả lại trạng thái gốc.
- Worker: handler `execute:action`; `WorkerServices.metaWriter`.

**Test tự động**
- `execution/gateway.test.ts` (18): tạm dừng ad end-to-end + nhật ký + thông báo; `no_change`; ngân sách ±10% số nguyên; nhân bản PAUSED + không hoàn tác được; **lỗi trước khi áp; đã áp nhưng báo lỗi; verify không khớp; đối tượng bị đổi sau khi duyệt; nhân bản lỗi không gọi lại; retry trùng / duyệt trùng**; 3 lỗi → breaker mở chặn tiếp; **cờ tắt thì không chạy** (cả lúc duyệt và lúc worker chạy); kill switch workspace/toàn cục; gói Free 402; không quyền ghi 403; kill switch bật sau duyệt → hủy; guardrails +20% và quá 5 hành động/ngày; buyer cần quyền duyệt theo Client; cách ly workspace; nhật ký không sửa được.
- `execution/safety.test.ts` (5): hủy pending đúng phạm vi; breaker; kill switch theo phạm vi; lớp ghi mock/thật; self-test đủ action_type và từ chối tài khoản ngoài danh sách.
- Coverage `packages/core/execution`: **95,6% dòng** (yêu cầu ≥ 90%).
- Bộ cách ly: probe job `execute:action` (A bị hủy do gói/quyền ghi, B không đổi).

**Vùng bảo vệ:** `packages/core/execution/**`, `packages/db/**` (4 bảng + RLS + trigger, migration 0045–0046). **Rủi ro:** ghi sai trên tài khoản Meta thật nếu cấu hình nhầm môi trường — giảm bởi: cờ tắt mặc định, gói Growth+, quyền ghi bật riêng từng kết nối, guardrails khóa, không retry ghi, xác minh sau ghi, breaker, kill switch.

**PM kiểm tra:** chạy `pnpm execution:check` trên staging với tài khoản Meta test; duyệt ADR-0008..0011.

## [034] Guardrails có test khóa, P205 — 2026-10-23

**Thay đổi**
- Module mới `packages/core/execution` (vùng bảo vệ). `guardrails.ts`: `GUARDRAIL_DEFAULTS` theo ADR-0001 A7 (±15% ngân sách mỗi hành động, ≤ 5 hành động/ngày/tài khoản, ≥ 3 ngày dữ liệu, không tự chạy 22:00–06:00 giờ tài khoản, breaker sau 3 lỗi) — **đóng băng và khóa giá trị bằng test**; `tighterViolations` (workspace chỉ được chặt hơn); `effectiveGuardrails` (dòng DB bị sửa tay lỏng hơn vẫn dùng mặc định); `saveGuardrails` (Owner, nới lỏng → 422 `GUARDRAIL_VIOLATION`); `checkGuardrails` thuần hàm cho gateway: loại trừ (kể cả cấp cha), số hành động/ngày, dữ liệu tối thiểu, ngân sách ±% tính thập phân, không có ngân sách ngày; với tự chạy: khung giờ yên lặng, **không tự bật lại**, **không tự nhân bản**.
- DB: `app.guardrail_settings` + RLS (migration 0043–0044).
- API `GET|PUT /guardrails` (Owner, sau cờ duyệt hành động). Trang P205 `/settings/guardrails` (tab "Guardrails" chỉ hiện khi cờ bật): mỗi trường ghi "Cố định: …" và chỉ cho siết chặt; danh sách ID không bao giờ thay đổi. Kill switch thêm vào P205 ở 037.
- Quyền duyệt theo Client (Owner cấp cho buyer) và cột "Duyệt hành động" ở ST02 đã có từ trước (`canApproveActions`), gateway dùng ở 035.

**Test tự động**
- `execution/guardrails.test.ts` (9): **giá trị mặc định khóa + đóng băng**; mọi kiểu nới lỏng bị chặn; biên ±15% (15,01% bị chặn); số hành động, dữ liệu, loại trừ cấp cha; giờ yên lặng chỉ áp tự chạy; không tự bật lại / nhân bản; mặc định khi chưa cấu hình; dòng DB lỏng bị bỏ qua; chỉ Owner; cách ly.
- `api/v1/guardrails/guardrails.test.ts` (2): **cờ tắt → 404**; Owner siết được, nới → 422, manager 403. Bộ cách ly: probe 2 route.

**Vùng bảo vệ:** `packages/core/execution/**` (mới), `packages/db/**` (1 bảng + RLS, migration 0043–0044).

**PM kiểm tra:** Cài đặt → Guardrails (khi cờ duyệt hành động bật): thử đặt 20% → bị từ chối; đặt 10% → lưu được.

## [033] ADR hành động ghi, lớp ghi Meta, nâng quyền ghi (P201) — 2026-10-23

**Thay đổi**
- ADR mới (trạng thái **Đề xuất — PM duyệt bắt buộc**): `0008-execution-gateway` (một cổng ghi duy nhất, thứ tự kiểm tra, không tự retry ghi, verifier, idempotency, nhật ký append-only, circuit breaker, kill switch, hoàn tác, chỉ local/staging); `0009` tạm dừng / bật lại ad, ad set (không tự bật lại thứ người dùng tắt); `0010` ngân sách ngày ad set (±15% khóa test, không float, không CBO/trọn đời); `0011` nhân bản ad set (bản sao luôn PAUSED, không hoàn tác tự động, không retry).
- `packages/meta-client/write` (chỉ `core/execution` được import — đã có kiểm tra ranh giới): `HttpMetaWrite` (`maxAttempts = 1`, ngân sách phải là số nguyên đơn vị nhỏ nhất), `getObject` để đọc lại. `write-mock`: `MockMetaWrite` ghi vào trạng thái dùng chung để `MockMetaRead` đọc lại được; cài lỗi theo kịch bản (lỗi trước khi áp, lỗi sau khi đã áp, áp sai giá trị).
- DB: `meta_connections.write_enabled`, `write_changed_at` (migration 0042). `core/connections/write-access.ts`: `listWriteAccess`, `setWriteEnabled` (chỉ khi có scope `ads_management`, không cho kết nối mẫu; Owner), `connectionCanWrite` (cho gateway).
- OAuth `authorize?scope=write` chỉ khi cờ duyệt hành động bật và là Owner (`auth_type=rerequest`); callback bật quyền ghi khi Meta cấp `ads_management`. API `POST /connections/{id}/write-access` (thu hồi / bật lại, có hiệu lực ngay).
- Trang P201 `/connections/write-access`: AdxLens sẽ làm gì khi có quyền ghi, trạng thái theo kết nối, cấp / thu hồi / bật lại; gói chưa đủ (dưới Growth) → khóa nút + link gói. Nút "Quyền ghi" ở S02 chỉ hiện cho Owner khi cờ bật.

**Test tự động**
- `meta-client/write.test.ts` (7): POST đúng tham số + appsecret_proof; **không retry ghi khi Meta lỗi tạm thời**; ngân sách không nhận số lẻ; lỗi không chứa token; mock ghi → đọc lại; 3 kịch bản lỗi; đối tượng không tồn tại.
- `connections/write-access.test.ts` (3): bật/thu hồi; không scope / kết nối mẫu / đã thu hồi / kết nối lại chỉ đọc → không ghi được; chỉ Owner; cách ly.
- `api/v1/connections/write-access.test.ts` (2): **cờ tắt → 404**; Owner nâng quyền (mock) → bật, thu hồi 204, manager 403.
- Bộ cách ly: probe route mới (kết nối của B → 404, B không đổi); A bật thêm cờ duyệt hành động để probe chạy hết logic.

**Vùng bảo vệ:** `packages/db/**` (2 cột, migration 0042), `packages/core/connections/**` (quyền ghi theo kết nối; không đổi mã hóa token). Lớp ghi Meta là tiền đề cho `packages/core/execution` (035).

**PM kiểm tra:** duyệt ADR-0008..0011. Bật cờ duyệt hành động cho workspace (AD02) → Kết nối → "Quyền ghi" → "Cấp quyền ghi" (Meta mock) → trạng thái "Được ghi" → "Thu hồi quyền ghi".

## [032] Kết quả trước / sau (P105), onboarding media buyer (A08) — 2026-10-23

**Thay đổi**
- `packages/core/recommendation/outcomes.ts` (P1-08): `listOutcomes` so chỉ số chính 7 ngày trước / 7 ngày sau ngày "Đã làm" (múi giờ tài khoản, bỏ ngày làm); chỉ số và phạm vi theo loại gợi ý (bảng ở `docs/rules/weekly-actions.md`); trạng thái chờ đủ ngày / không đo; % thay đổi có dấu tính bằng thập phân; buyer chỉ thấy Client được gán.
- `recommendation/onboarding.ts` (P1-11): `buyerOnboarding` (Client được giao, số việc tuần này, việc gán cho mình) và `dismissOnboarding`. DB: `memberships.onboarded_at` (migration 0041).
- API: `GET /recommendations/outcomes`, `DELETE /me/onboarding` — kiểm cờ `p1_recommendations`.
- Trang P105 `/weekly-actions/results` (banner giới hạn nhân quả, trạng thái chờ / không đo, thay đổi tô màu theo hướng tốt); link từ P101. A08 `/welcome`: buyer mở Tổng quan lần đầu khi cờ Gợi ý bật → màn chào mừng, không cần cấu hình; "Bắt đầu" hoặc "Xem creative" đóng màn.

**Test tự động**
- `recommendation/outcomes.test.ts` (6): % có dấu; CPA cấp tài khoản giảm → cải thiện, bỏ ngày làm; CTR đúng ad giảm → không cải thiện; chờ đủ 7 ngày / không đo / chỉ việc đã làm; buyer + cách ly; onboarding chỉ cho buyer, đóng rồi không hiện.
- `recommendations.test.ts` (+1, + cờ tắt cho 2 route mới). Bộ cách ly: probe 2 route. E2E `creatives.spec.ts` (+ P105). A08 chưa có E2E riêng (cần luồng mời buyer) — có test core + route.

**Vùng bảo vệ:** `packages/db/**` (1 cột, migration 0041).

**PM kiểm tra:** Việc tuần này → đánh dấu "Đã làm" → "Kết quả trước / sau" hiện "chờ … ngày". Mời một buyer (gán Client), đăng nhập bằng buyer khi cờ Gợi ý bật → màn chào mừng.

## [031] Weekly Action List (P101–P102), trạng thái + gán việc, thông báo cho media buyer, checklist cờ P1 — 2026-10-23

**Thay đổi**
- DB: `app.recommendations` (tuần, nguồn, hành động, lý do, bằng chứng, tác động `numeric`, độ tin cậy, công sức, điểm, trạng thái Đề xuất / Đang làm / Đã làm / Bỏ qua + lý do, người được gán). RLS (migration 0039–0040).
- `packages/core/recommendation/weekly.ts`: `generateWeeklyActions` (từ phát hiện đang mở + creative Thua/Winner; idempotent, giữ trạng thái), `priorityScore` (PRD 10.3: tác động tương đối × độ tin cậy ÷ công sức × hệ số "sai"), `wrongRates` / `reviewQueue` (loại gợi ý hay bị bỏ qua vì "sai" xếp thấp hơn và vào rà soát), `listWeeklyActions` (buyer chỉ thấy Client được gán), `updateWeeklyAction` (bỏ qua bắt buộc lý do; chỉ gán cho người xem được Client), `assignableMembers`. Bảng giá trị ở `docs/rules/weekly-actions.md`.
- Job `recommend:build` (kiểm cờ ở đầu job); `maintenance:report_tick` enqueue vào thứ Hai 07:00 theo múi giờ workspace.
- Thông báo mới: `weekly_actions` (P1-09: mỗi thành viên nhận số việc theo phạm vi Client của mình, trong app + email) và `action_assigned` (trong app).
- Checklist kỹ thuật cờ `p1_recommendations` (L3 18.3): P0 bật ≥ 14 ngày; tỷ lệ phát hiện "sai" ≤ 20% — hiện trong hộp thoại bật cờ AD02.
- API: `GET /recommendations` (`week`, `status`, `assignee=me`), `PATCH /recommendations/{id}`, `GET /recommendations/{id}/assignees` — đều kiểm cờ ở server.
- Trang P101 `/weekly-actions`: danh sách xếp hạng, lọc trạng thái / "Việc của tôi" / tuần, đổi trạng thái tại chỗ (bỏ qua mở hộp thoại lý do); P102 drawer: vì sao, tác động, độ tin cậy, công sức, cách xếp hạng, gán người, mở Ads Manager.

**Test tự động**
- `recommendation/weekly.test.ts` (10): công thức điểm; tạo + xếp hạng + idempotent giữ trạng thái; bỏ phát hiện đã xong; tuần phải là thứ Hai; **bỏ qua vì "sai" giảm điểm tuần sau (× 0,3) và vào rà soát**; thông báo theo phạm vi Client; bỏ qua cần lý do, đã làm ghi thời điểm, buyer chỉ thấy/sửa việc của mình; gán sai phạm vi bị chặn + thông báo người được gán; cách ly workspace; lịch thứ Hai 07:00; checklist cờ P1.
- `api/v1/recommendations/recommendations.test.ts` (2): **cờ tắt thì không chạy**; cờ bật: danh sách, bỏ qua cần lý do, người nhận việc, lọc "của tôi". Worker: `recommend:build` cờ tắt → không chạy.
- Bộ cách ly: probe 3 route + job `recommend:build`; world B có một gợi ý (tên bí mật không lộ).
- E2E `creatives.spec.ts` (+ P101/P102): tạo danh sách → đổi trạng thái → mở chi tiết.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0039–0040).

**PM kiểm tra:** bật cờ "Gợi ý" → `pnpm job:trigger -- recommend:build '{"workspaceId":"<id>","week":"<thứ Hai tuần này>"}'` → sidebar "Việc tuần này": đổi trạng thái, bỏ qua (chọn lý do), mở chi tiết, gán người. Email "Việc tuần này" ở Mailpit.

## [030] Creative library (P103), so sánh creative (P104), phân loại + dự báo mệt — 2026-10-23

**Thay đổi**
- Module mới `packages/core/recommendation` (P1). `creativeLibrary`: gom ad theo creative gốc trong một tài khoản (thumbnail, định dạng, số ad, thời gian chạy, chi tiêu, kết quả, CPA, CTR, ROAS, tần suất); phân loại **Winner / Cần theo dõi / Đang mệt / Thua / Chưa đủ dữ liệu** kèm lý do; "Đang mệt" dùng **đúng ngưỡng của rule `creative_fatigue`** (một nguồn, có test khóa); dự báo mệt (hồi quy CTR 14 ngày, ghi rõ là dự báo). `compareCreatives`: 2–4 creative, chỉ số + chuỗi theo ngày. Quy tắc công khai ở `docs/rules/creatives.md`.
- Buyer chỉ xem tài khoản của Client được gán; tài khoản workspace khác → 404.
- API `GET /creatives`, `GET /creatives/compare` — kiểm cờ `p1_recommendations` ở server.
- Trang P103 `/creatives` (chọn tài khoản, lọc theo nhãn, bảng / lưới, chọn creative để so sánh) và P104 `/creatives/compare` (bảng chỉ số cạnh nhau, biểu đồ CTR và chi tiêu). Mục "Creative" ở sidebar chỉ hiện khi cờ bật; mở thẳng URL khi cờ tắt → trang "tính năng chưa bật".
- Không cần migration (dùng `analytics.entities` + `insights_daily` sẵn có).

**Test tự động**
- `recommendation/creatives.test.ts` (10): ngưỡng mệt trùng rule; gom 2 ad cùng creative; Winner/Theo dõi/Thua theo trung vị; **không đủ dữ liệu thì không xếp** (ít hiển thị, ít creative cùng loại); Đang mệt; buyer không được Client → 404; cách ly workspace; dự báo (giảm đều, đã chạm ngưỡng, ổn định, tăng, thiếu ngày); so sánh 2–4.
- `api/v1/creatives/creatives.test.ts` (2): **cờ tắt thì không chạy** (404); cờ bật trả dữ liệu, so sánh 1 creative → 422. `lib/creatives.test.ts`: đọc `ids` an toàn.
- Bộ cách ly: probe 2 route; world B có creative + ad (tên/ảnh bí mật không lộ); A bật thêm `p1_recommendations` để probe chạy hết logic.
- E2E mới `creatives.spec.ts`: dữ liệu mẫu → cờ tắt không có mục Creative, URL → "chưa bật" → PM bật Báo cáo + Gợi ý (vượt checklist có log) → P103 → chọn 2 → P104.

**Vùng bảo vệ:** không.

**PM kiểm tra:** bật cờ "Gợi ý" cho workspace (AD02) → sidebar "Creative" → lọc theo nhãn, đổi Bảng/Lưới, rê chuột vào nhãn xem lý do → chọn 2 creative → "So sánh".

## [029] Trang hoà vốn công khai M06 — 2026-10-23

**Thay đổi**
- `packages/core/billing/break-even.ts`: công thức PRD 13.3 — tài khoản × giờ tiết kiệm mỗi tài khoản × giá giờ, so với phí gói rẻ nhất đủ số tài khoản (vượt Scale thì cộng phí tài khoản thêm); tiền tính BigInt; giá giờ hoà vốn làm tròn lên. Giá gói đọc từ `app.billing_plans`.
- Trang `/break-even` (M06): công khai, không gắn cờ (ADR-0001 B7), form GET tính ở server; link từ M02. Song ngữ.
- Tech-debt: mặc định 6 giờ / 150.000đ là giả định, cần PM chốt và so khung Penpot M06.

**Test tự động**
- `billing/break-even.test.ts` (3): chọn gói đúng theo số tài khoản, giá trị, chênh lệch, giá giờ hoà vốn; vượt Scale cộng tài khoản thêm; lỗ ròng âm; 0 giờ không chia cho 0.
- E2E `billing.spec.ts` (+1): M02 → M06, mặc định Starter, đổi số liệu → tính lại, chênh lệch âm.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `/pricing` → "Trang hoà vốn" → đổi số tài khoản / giờ / giá giờ → "Tính".

## [028] Cổng thanh toán VN — PayOS (sandbox): thanh toán theo kỳ, webhook, gia hạn, nhắc gia hạn — 2026-10-23

**Thay đổi**
- DB: `app.payment_orders` (đơn theo kỳ: `order_code` số do DB cấp, gói, kỳ, số tiền VND `numeric`, trạng thái, link). RLS (migration 0037–0038).
- `packages/core/billing/payos.ts`: PayOS REST bằng `fetch`; `payosSignature` (HMAC-SHA256, khóa xếp chữ cái), `verifyPayosWebhook`; `periodAmountVnd` (BigInt; năm = 12 × 80% làm tròn nghìn); `startPayosCheckout` (chỉ owner; chặn khi đang trả qua Stripe); `applyPaidOrder` — **số tiền phải khớp đơn**, chỉ đơn `pending`, gia hạn từ max(bây giờ, hết kỳ hiện tại) + 1 tháng / 12 tháng, gọi lặp không gia hạn hai lần; `confirmPayosOrder` (ST04 tra trạng thái đơn trên PayOS bằng khóa AdxLens, không tin query trên URL).
- `billing/cancel.ts`: hủy / tiếp tục gói cho cả Stripe và PayOS (route `/billing/cancel` dùng chung).
- `core/ops/billing-webhooks.ts` → `handlePayosWebhook` (tìm workspace theo mã đơn — xuyên workspace có chú thích; webhook thử của PayOS trả 200). `core/ops/billing-renewals.ts` → `runPayosRenewals` trong `maintenance:daily_tick`: nhắc gia hạn trước 7 và 1 ngày (loại thông báo mới `billing_renewal`, bắt buộc, có email); hết kỳ chưa trả → `past_due` từ ngày hết kỳ (ân hạn 7 ngày → Free); đã hủy cuối kỳ → `canceled`.
- API: `POST /billing/checkout` thêm `method: stripe | payos`; `POST /webhooks/payos`.
- Giao diện: ST03 chọn phương thức (QR / chuyển khoản VND — mặc định; thẻ quốc tế), nút "Gia hạn" cho gói PayOS, "Quản lý thanh toán" chỉ với Stripe; ST04 hiện "đã nhận thanh toán … tới ngày …" / "chưa nhận". Banner X04 past_due đổi lời cho cả hai cổng ("Chưa thanh toán kỳ hiện tại…").
- `docs/onboarding.md` mục 7. Tech-debt: đổi gói giữa kỳ chưa tính chênh lệch.

**Test tự động**
- `billing/payos.test.ts` (13): chữ ký đúng chuẩn PayOS; webhook sửa số tiền / sai khóa bị từ chối; số tiền kỳ; tạo đơn → webhook → active 1 tháng, lặp không gia hạn hai lần; gia hạn sớm cộng từ hết kỳ, kỳ năm; số tiền lệch không ghi nhận, mã lỗi bỏ qua, đơn lạ; ST04 tra cứu PAID/CANCELLED; **cách ly đơn giữa workspace**; chặn khi đang dùng Stripe; nhắc 7/1 ngày mỗi mốc một lần; hết kỳ → quá hạn → Free → trả lại active; hủy cuối kỳ → Free không nhắc; hủy khi Free → 409.
- `billing.test.ts` (+1): checkout PayOS, webhook chữ ký sai 400 / đúng áp gói / lặp không gia hạn.
- **Test đổi:** `apps/worker/src/dispatch.test.ts` — kết quả `maintenance:daily_tick` nay có thêm `renewals`; kỳ vọng được mở rộng thêm trường này (giữ nguyên các trường cũ), không nới.
- Bộ cách ly: probe `POST /webhooks/payos`; world B có đơn PayOS (link bí mật không được lộ). `installTestServer` cài PayOS giả.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0037–0038).

**PM kiểm tra:** cần khóa PayOS thử nghiệm — `docs/onboarding.md` mục 7: chọn Growth bằng QR → thanh toán → ST04 báo đã nhận, ST03 hiện ngày hết kỳ; `pnpm job:trigger -- maintenance:daily_tick '{"tick":"manual"}'` khi gần hết kỳ → thông báo "Nhắc gia hạn gói".

## [027] Thanh toán Stripe (test mode): checkout, cổng tự phục vụ, webhook, past_due, hủy gói, thông tin hóa đơn — 2026-10-23

**Thay đổi**
- DB: `app.billing_events` (chống xử lý webhook trùng, unique theo nhà cung cấp + mã sự kiện), `app.billing_profiles` (tên công ty, MST, địa chỉ, email hóa đơn). RLS (migration 0035–0036).
- `packages/core/billing/stripe.ts`: Stripe REST bằng `fetch` (không thêm thư viện); số tiền tính bằng BigInt (USD theo cent nếu gói có giá USD, không thì VND; năm = 12 × 80%); `startStripeCheckout` (metadata workspace + gói, chỉ owner), `openStripePortal`, `setStripeCancel` (hủy/tiếp tục cuối kỳ); `verifyStripeSignature` (HMAC-SHA256, so sánh hằng thời gian, lệch tối đa 5 phút); `applyStripeEvent`: `checkout.session.completed` → gói active; `customer.subscription.updated` → trạng thái, ngày gia hạn, hủy cuối kỳ; `deleted` → Free; `invoice.payment_failed` → past_due (mở ân hạn 7 ngày, giữ mốc cũ khi lặp) + thông báo/E05 cho owner một lần; `invoice.paid` → active.
- `packages/core/ops/billing-webhooks.ts`: tìm workspace theo mã subscription/customer Stripe (ưu tiên) hoặc metadata — truy vấn xuyên workspace có chú thích; xử lý trong transaction, mỗi sự kiện một lần.
- `billing/profile.ts`: thông tin xuất hóa đơn (zod: MST chỉ số và gạch).
- API: `POST /billing/checkout`, `POST /billing/portal`, `POST /billing/cancel`, `GET|PUT /billing/profile` (owner), `POST /webhooks/stripe` (chữ ký trên body thô). Chưa cấu hình khóa → 503 `SERVICE_UNAVAILABLE` (mã lỗi mới).
- Giao diện ST03: "Đổi gói" (tháng/năm) → Stripe Checkout; "Quản lý thanh toán"; "Hủy gói"/"Tiếp tục gói"; form thông tin xuất hóa đơn. ST04 `/settings/billing/checkout?status=success|cancel` (không tự đổi gói theo query — chờ webhook).
- `docs/onboarding.md` mục 6: chạy thanh toán thử với Stripe CLI. Tech-debt: phí tài khoản vượt hạn mức, hóa đơn VAT điện tử.

**Test tự động**
- `billing/stripe.test.ts` (14): chữ ký (đúng / sai secret / body sửa / quá 5 phút / header hỏng); số tiền USD/VND tháng/năm; checkout mang metadata + giá từ DB; chỉ owner; cổng + hủy cuối kỳ; webhook áp gói và **idempotent**; updated/deleted; payment_failed → past_due, một thông báo + một email, giữ mốc ân hạn, paid → active; invoice dạng API mới; workspace không xác định; **cách ly: sự kiện của B không chạm A kể cả khi metadata trỏ A**; thông tin hóa đơn.
- E2E mới `billing.spec.ts`: ST03 Free 0/1, lưu thông tin hóa đơn, ST04 hủy.
- `apps/web/.../billing.test.ts` (4): checkout owner/manager; hủy khi Free → 409; profile 200/422; webhook chữ ký sai 400 không đổi gói, đúng thì áp.
- Bộ cách ly: probe 5 route mới; world B có subscription Stripe + thông tin hóa đơn (chuỗi bí mật không được lộ). `installTestServer` cài Stripe giả (test route không gọi mạng; không đổi assertion nào).

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS, migration 0035–0036).

**PM kiểm tra:** cần khóa Stripe **test** — làm theo `docs/onboarding.md` mục 6: chọn gói Growth → thẻ 4242 → ST04 báo thành công, ST03 hiện Growth; `stripe trigger invoice.payment_failed` → banner đỏ + email; "Hủy gói" → hiện "Kết thúc ngày …".

## [026] Gói cấu hình trong DB, đếm tài khoản đang hoạt động, vượt hạn mức + ân hạn — 2026-10-23

**Thay đổi**
- DB: `app.billing_plans` (giá VND `numeric`, hạn mức tài khoản, giá tài khoản thêm, quyền theo gói; bảng toàn hệ thống, RLS bật không policy) và `app.subscriptions` (gói theo workspace, trạng thái `active|past_due|canceled`, kỳ, nhà cung cấp thanh toán, mốc `past_due_since` / `over_limit_since`). Seed 4 gói theo PRD 13.3 (migration 0033–0034). **PM đổi giá bằng cách sửa dòng trong `app.billing_plans`**; code chỉ dùng giá mặc định khi thiếu dòng.
- `packages/core/billing/service.ts`: `getPlans`, `activeAccountCount` (chi tiêu 30 ngày; không tính tài khoản mẫu và kết nối đã thu hồi), `billingStatus` (gói đăng ký / gói đang hưởng quyền, vượt hạn mức, ân hạn 7 ngày — ADR-0001 A8), `currentPlanKey(ctx)` (thay stub Free; bỏ mục tech-debt), `hasPlanEntitlement`, `showPoweredBy`, `refreshOverLimit`, `syncableAccountIds`, `setSubscription` (027/028 dùng).
- Quy tắc: `past_due` quá 7 ngày hoặc gói đã hủy → quyền về Free. Vượt hạn mức → ghi mốc, đồng bộ bình thường trong 7 ngày; hết ân hạn → **đồng bộ hằng ngày chỉ chạy cho số tài khoản trong hạn mức (nhập sớm nhất)**, dữ liệu cũ giữ nguyên. Hết vượt → xóa mốc.
- Đồng bộ hằng ngày (`runDailySync`) cập nhật mốc vượt hạn mức và bỏ qua tài khoản ngoài hạn mức (`skipped / plan_limit`).
- Nhãn "Powered by" ở share link và PDF: ẩn khi gói có quyền `remove_badge` (Scale) hoặc workspace được gỡ thủ công.
- Giao diện: S04 hạn mức theo gói thật; M02 bảng giá đọc từ DB; X04 thêm biến thể **thanh toán thất bại** và **vượt hạn mức** (trong ân hạn / hết ân hạn), link tới Gói & thanh toán cho người có quyền; ST03 hiện gói, giá, tài khoản đang hoạt động / hạn mức, ngày gia hạn và cảnh báo ân hạn (thanh toán ở 027–028).

**Test tự động**
- `billing/service.test.ts` (11): giá từ DB và fallback; gói không active về mặc định; đếm tài khoản đúng (bỏ mẫu, thu hồi, workspace khác); Free mặc định, đổi gói đổi quyền; past_due giữ gói 7 ngày rồi về Free; gói hủy về Free; nhãn Powered by; vượt hạn mức ghi mốc một lần, trong ân hạn không giới hạn, hết ân hạn chỉ giữ tài khoản sớm nhất; hết vượt thì xóa mốc.
- `ingestion.test.ts` (+2): hết ân hạn → tài khoản ngoài hạn mức bỏ qua đồng bộ, tài khoản trong hạn mức vẫn chạy; vượt lần đầu ghi mốc và vẫn đồng bộ.
- Bộ cách ly: world B có subscription (past_due, vượt hạn mức) — vân tay B không đổi khi chạy route/job của A.

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS + seed, migration 0033–0034).

**PM kiểm tra:** Cài đặt → Gói & thanh toán hiện Free, "x/1" tài khoản. Nhập ≥ 2 tài khoản có chi tiêu → banner vượt hạn mức. Đổi giá một gói trong `app.billing_plans` (Supabase Studio) → `/pricing` hiện giá mới.

## [025] Tài khoản mẫu (S01), banner dữ liệu mẫu (X04), báo cáo mẫu `/r/demo` — 2026-10-23

**Thay đổi**
- DB: `meta_connections.is_demo`, `clients.is_demo`; trigger chặn share link thêm điều kiện **dữ liệu mẫu** (migration 0031–0032).
- `packages/core/connections/demo.ts` (PRD P0-02): "Dùng tài khoản mẫu" tạo kết nối mẫu + 2 tài khoản QC (một khớp số liệu, một có ngày lệch để thấy luồng đối chiếu) + 2 Client mẫu đã xác nhận, bắt đầu backfill; gọi lại không tạo thêm. **Kết nối mẫu luôn đọc dữ liệu giả** (`metaFor`) ở đồng bộ, đối chiếu, làm mới tài khoản — không bao giờ gọi Meta thật. "Xóa dữ liệu mẫu" xóa kết nối (cascade số liệu) và Client mẫu, giữ Client thật.
- Báo cáo từ dữ liệu mẫu ghi `demo` và mẫu báo cáo hiện dòng "Báo cáo mẫu — số liệu minh họa"; **không chia sẻ / không xuất PDF / lịch gửi hoãn** (lý do "Client dùng dữ liệu mẫu").
- API `POST|DELETE /api/v1/demo`. Trang S01 `/demo` (từ S03 "Xem tài khoản mẫu trước"): giải thích + "Dùng tài khoản mẫu" → S06. Banner hệ thống X04 biến thể dữ liệu mẫu ("Kết nối tài khoản thật", "Xóa dữ liệu mẫu").
- `/r/demo`: báo cáo mẫu công khai (số liệu cố định, ghi rõ là mẫu) cho nút "Xem báo cáo mẫu" ở trang chủ. Bỏ mục `/r/demo` trong `docs/tech-debt.md`.
- Ghi chú cho 026: tài khoản mẫu không tính vào số tài khoản đang hoạt động khi tính phí.

**Test tự động**
- `packages/core/src/connections/demo.test.ts` (4): tạo đủ + idempotent; đồng bộ kết nối mẫu thành công **dù Meta thật lỗi** (chứng minh không gọi Meta); báo cáo mẫu đánh dấu `demo` và 422 khi chia sẻ; xóa dữ liệu mẫu giữ Client thật.
- `report-view.test.tsx` (+1): dòng "Báo cáo mẫu". Bộ cách ly: probe 2 route demo.
- E2E mới `demo.spec.ts`: S03 → S01 → dùng tài khoản mẫu → S06 xong → Clients có banner + Client mẫu → xóa → trống; `/r/demo` có dòng "Báo cáo mẫu".

**Vùng bảo vệ:** `packages/db/**` (2 cột + cập nhật trigger chặn chia sẻ), `packages/core/connections/**` (kết nối mẫu dùng token giả mã hóa như thường; không chạm logic token thật).

**PM kiểm tra:** Kết nối → "Xem tài khoản mẫu trước" → "Dùng tài khoản mẫu" → banner dữ liệu mẫu trên mọi trang → "Xóa dữ liệu mẫu". Trang chủ → "Xem báo cáo mẫu".

## [024b] Digest tuần (E03), lệnh kích hoạt job cho dev — 2026-10-23

**Thay đổi**
- DB: `app.health_snapshots` (health theo tài khoản × tuần) để digest so "thay đổi sức khỏe" với tuần trước. RLS.
- `packages/core/reporting/digest.ts` (PRD P0-19): gửi thứ Hai 08:00 theo múi giờ workspace cho từng owner/manager **theo phạm vi Client của họ**: health hiện tại + thay đổi so tuần trước, vấn đề mới trong 7 ngày (số mức cao), số ngày lệch đối chiếu, số báo cáo khách được lên lịch trong tuần. Chụp health tuần này mỗi lần chạy. Tôn trọng cài đặt "Tổng kết tuần" (mặc định email, không trong app); chống gửi trùng theo tuần. Email E03 song ngữ, bảng theo tài khoản (health thấp trước). Không có văn bản do LLM.
- `notify()` thêm `forceRecord` (lưu dòng chống trùng cho email gửi riêng).
- Worker: `notify:digest` (kiểm cờ `p0_reports` ở đầu job); `maintenance:report_tick` mỗi giờ cũng enqueue digest cho workspace đang thứ Hai 08:00. `core/ops/report-schedules.ts`: múi giờ mọi workspace (xuyên workspace có chú thích).
- `pnpm job:trigger -- <job> '<payload JSON>'`: kích hoạt job ngay ở dev/staging (kiểm payload theo schema, chặn production). Hướng dẫn trong `docs/onboarding.md`. ESLint cho phép `console` trong `src/cli/`.

**Test tự động**
- `digest.test.ts` (3): thời điểm thứ Hai 08:00 theo múi giờ; gửi owner + manager giới hạn Client (manager không thấy tài khoản Client khác), chụp health, không gửi trùng, tuần sau hiện thay đổi; tắt email thì không gửi.
- Worker: `notify:digest` cờ tắt → không gửi. Bộ cách ly: probe job `notify:digest` cho A không đổi dữ liệu B.
- Kiểm thủ công: `pnpm job:trigger` enqueue job hợp lệ, từ chối payload sai.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0029–0030).

**PM kiểm tra:** `pnpm job:trigger -- notify:digest '{"workspaceId":"<id>","week":"<thứ Hai tuần này>"}'` (cờ báo cáo bật) → Mailpit có email "Tổng kết tuần".

## [024a] Lịch gửi báo cáo (R05): tự động / cần duyệt, hoãn khi chưa toàn vẹn, PDF đính kèm — 2026-10-23

**Thay đổi**
- DB: `app.report_schedules` (Client, hằng tuần theo thứ / hằng tháng ngày 1–28, giờ gửi theo múi giờ của lịch, tự động / cần duyệt, link / link + PDF, ngôn ngữ, người nhận), `app.report_deliveries` (mỗi lần chạy theo kỳ `2026-W43` / `2026-10`, duy nhất theo lịch + kỳ). RLS.
- `packages/core/reporting/schedule.ts` (PRD P0-17, P0-24): kiểm cấu hình (email chuẩn hóa + bỏ trùng, ≤ 10; múi giờ hợp lệ), kỳ = tuần trước (thứ Hai–Chủ nhật) hoặc tháng trước theo múi giờ của lịch, `isDue` theo giờ địa phương. `runSchedule`: dựng báo cáo kỳ ngay trong job (không LLM số), kiểm toàn vẹn → **hoãn** (chưa xác nhận gán / lệch > 1% / kết nối ngắt / không dựng được) và báo account manager kèm lý do (bắt buộc, có email); cần duyệt → chờ duyệt + báo người lập lịch; tự động → link công khai hạn 30 ngày gửi từng người nhận (E04, tên agency, reply-to email báo cáo của agency, PDF đính kèm khi chọn) + báo "đã gửi". Idempotent theo kỳ. `approveDelivery` → đánh dấu đã duyệt và enqueue gửi lại (job kiểm toàn vẹn lần nữa, dùng lại báo cáo đã dựng).
- Email hỗ trợ tệp đính kèm. Loại thông báo mới `report_needs_approval`; lý do hoãn hiển thị bằng chữ (vi/en).
- Worker: `notify:scheduled_report` (kiểm cờ `p0_reports` ở đầu job; PDF qua trang in ký 10 phút), `maintenance:report_tick` mỗi giờ (lịch đến giờ → enqueue kỳ vừa kết thúc). `core/ops/report-schedules.ts` liệt kê lịch đang bật xuyên workspace (có chú thích lý do).
- API (cờ `p0_reports`): `GET|POST /api/v1/report-schedules`, `PATCH|DELETE /api/v1/report-schedules/{id}`, `POST /api/v1/report-deliveries/{id}/approve`.
- Giao diện R05 `/reports/schedules`: danh sách lịch (mô tả lịch, cách gửi, người nhận, lần gửi gần đây với trạng thái + lý do, "Duyệt & gửi"), thêm/sửa/xóa, trống. Nút "Lịch gửi" ở R01.

**Test tự động**
- `schedule.test.ts` (7): giờ chạy/kỳ tuần & tháng + múi giờ; kiểm cấu hình; tự động gửi đúng người nhận + link 30 ngày + thông báo + chạy lại bỏ qua; PDF đính kèm; chưa xác nhận gán → hoãn, không gửi khách, không tạo link, báo kèm lý do; cần duyệt → duyệt → gửi, không dựng lần hai.
- API `schedules.test.ts` (2): cờ tắt 404; tạo/danh sách/sửa/xóa, buyer 403, dữ liệu sai 422.
- Bộ cách ly: dữ liệu B có lịch + lần gửi; probe 5 route (+ tài nguyên B) và job `notify:scheduled_report` dùng lịch B.
- **Test đổi:** `apps/web/src/i18n/messages.test.ts` — hàm lấy biến nội suy trước coi chữ trong nhánh ICU `select` là biến (ví dụ `{có…}`); nay chỉ lấy biến thật (`{ten}` / `{ten, …}`). Ý nghĩa kiểm tra giữ nguyên.

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS, migration 0027–0028).

**PM kiểm tra:** (cờ báo cáo bật) Báo cáo → Lịch gửi → thêm lịch "Cần duyệt", giờ hiện tại → trong vòng 1 giờ (hoặc lệnh kích hoạt ở 024b) có lần gửi "Chờ duyệt" → Duyệt & gửi → Mailpit có email khách.

## [023] Thông báo: trung tâm thông báo (X05), cài đặt (ST05), email theo loại, E01 song ngữ — 2026-10-23

**Thay đổi**
- DB: `app.notifications` (một dòng mỗi người nhận, khóa i18n + tham số, link, đã đọc, trạng thái email, khóa chống trùng), `app.notification_settings` (theo người dùng × loại). RLS.
- `packages/core/notification/service.ts` (PRD P0-25): loại thông báo `sync_done`, `reconciliation_warning`, `token_expiring`, `token_expired`, `report_viewed`, `report_sent`, `report_postponed`, `billing_failed`, `action_failed`. **Loại bắt buộc** (sự cố số liệu, token, thanh toán, hành động thất bại, báo cáo bị hoãn) luôn bật cả trong app và email. `notify()` chọn người nhận theo vai trò + quyền xem Client (manager giới hạn Client khác, buyer không thuộc vai trò bị loại), theo cài đặt, chống trùng theo sự kiện, enqueue `notify:send_email`. Gửi email theo locale người nhận, ghi trạng thái. Danh sách, số chưa đọc, đánh dấu đã đọc (chỉ của mình), cài đặt.
- Mẫu email theo loại (vi/en, cùng nội dung với trung tâm thông báo) `templates/alerts.ts`; E06 token dùng playbook có sẵn + thêm vào trung tâm thông báo.
- Sự kiện đã nối: backfill xong → "đồng bộ xong"; đối chiếu lệch → người phụ trách (bắt buộc, có email); token sắp/đã hết hạn → trung tâm thông báo; khách mở link báo cáo lần đầu → người tạo link. (`report_sent`/`report_postponed` ở 024, `billing_failed` ở 027, `action_failed` ở 036.)
- Worker `notify:send_email`.
- API: `GET|POST /api/v1/notifications` (danh sách đã dịch + chưa đọc / đọc tất cả), `POST /api/v1/notifications/{id}/read`, `GET|PATCH /api/v1/me/notification-settings`.
- Giao diện: X05 `/notifications` (chưa đọc nổi bật, bấm mở + đánh dấu đã đọc, đọc tất cả, trống); số chưa đọc thật trên menu tài khoản; ST05 Cài đặt › Thông báo (bảng loại × trong app / email, loại bắt buộc "Luôn bật" không tắt được).
- E01: mẫu email xác minh và đặt lại mật khẩu song ngữ của Supabase Auth (`infra/supabase/templates/`, cấu hình trong `config.toml`).

**Test tự động**
- `packages/core/src/notification/notification.test.ts` (4): người nhận theo vai trò + quyền Client, email chỉ khi bật, chống trùng; cài đặt thường/bắt buộc, `email: false`; gửi email theo locale + trạng thái + không gửi lại; đánh dấu đọc chỉ của mình; mọi loại có mẫu email.
- Thêm khẳng định vào test luồng: backfill xong có 1 thông báo; đối chiếu lệch có thông báo (email queued) và chạy lại không báo trùng; khách mở link 2 lần → 1 thông báo; playbook token tạo thông báo trong app.
- API `notifications.test.ts` (3): danh sách đã dịch/đọc/đọc tất cả; cài đặt; mọi loại có nhãn/tiêu đề/nội dung vi+en.
- Bộ cách ly: dữ liệu B có thông báo; probe 5 route + job `notify:send_email` dùng thông báo B.
- E2E: đăng ký đi qua mẫu email xác minh mới.
- **Test đổi:** `reconciliation.test.ts` — trước khẳng định `enqueue` đúng 1 lệnh (job đồng bộ lại); nay đối chiếu lệch còn enqueue email thông báo, nên lọc theo tên job (vẫn đúng 1 job đồng bộ lại, và đúng 1 email sau 2 lần chạy).

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS, migration 0025–0026), `infra/**` (mẫu email Supabase Auth + cấu hình template). Rủi ro: cần khởi động lại Supabase local để nạp mẫu; staging cấu hình mẫu tương ứng trên Supabase dashboard.

**PM kiểm tra:** Thông báo trên menu tài khoản sau khi đồng bộ; Cài đặt › Thông báo bật email "Đồng bộ xong" → lần sau có email ở Mailpit; email xác minh khi đăng ký có hai ngôn ngữ.

## [042] Trang nội bộ bật/tắt cờ (AD01, AD02) + E2E báo cáo đầy đủ — 2026-10-23

**Thay đổi**
- Trang nội bộ `/admin` (chỉ đội AdxLens; người khác thấy 404, không lộ có trang admin): khung "AdxLens Admin · Nội bộ", email + PM/Staff.
- AD01 `/admin/flags`: ma trận workspace × cờ (owner, số tài khoản QC, ngày tạo, tìm theo tên), bấm ô để bật/tắt.
- AD02 (hộp thoại): chạy checklist kỹ thuật tự động; bật chỉ PM (`can_enable_flags`); checklist chưa đạt → chặn, PM có thể **vượt kèm lý do (ghi log `override`)**; phụ thuộc cờ cha không vượt được; tắt mọi staff được, tắt kéo theo cờ phụ thuộc; lý do bắt buộc ≥ 5 ký tự; lịch sử đổi cờ. Đường bật cờ duy nhất vẫn là `core/flags` (CLAUDE.md quy tắc 7). Nhãn cờ trên giao diện không chứa tên cờ/mã giai đoạn (khóa cờ chỉ hiện từ code ở trang nội bộ).
- Checklist `p0_reports` (L3 18.3) trong `core/reporting/flag-checks.ts`: mọi tài khoản QC đã xác nhận gán; đối chiếu 7 ngày gần nhất không lệch; không có sự cố P1 mở.
- `core/ops/admin.ts`: truy vấn ma trận (xuyên workspace có chú thích lý do, chỉ route `staff`).
- API (staff): `GET /api/v1/admin/workspaces`, `GET /api/v1/admin/workspaces/{id}/flags/{key}/checklist`, `POST /api/v1/admin/workspaces/{id}/flags/{key}`, `GET /api/v1/admin/workspaces/{id}/flag-history`.

**Sửa lỗi hạ tầng phát hiện khi chạy E2E đầy đủ**
- Storage bucket local chưa được tạo (logo, PDF lỗi "Bucket not found"): `pnpm dev` và CI chạy `supabase seed buckets` sau khi bật Supabase.
- Next.js dev nạp lại module theo route → mỗi lần tạo pool Postgres mới → cạn 100 kết nối ("remaining connection slots are reserved"). `getDb` giữ pool trên `globalThis`.
- Playwright: nạp `.env.local` trong config; reporter `github` trên CI (lỗi E2E hiện thành annotation); ESLint/Prettier bỏ qua `playwright-report/`, `test-results/`.
- Truy vấn con trong ma trận admin tham chiếu cột ngoài phải ghi đủ tên bảng (drizzle render cột không kèm bảng → đếm sai) — đã sửa và có test.

**Test tự động**
- `flag-checks.test.ts` (4): checklist đạt/chưa đạt từng mục, phụ thuộc cờ cha, ma trận admin.
- `admin.test.ts` (3): không phải staff → 404; staff thường không bật được; PM bật bị chặn khi checklist chưa đạt, vượt được và ghi log `override`; tắt kéo theo; lịch sử; khóa cờ sai 404, lý do ngắn 422.
- **E2E mới `reports-share.spec.ts`**: đồng bộ tài khoản khớp số liệu → cờ tắt không có mục Báo cáo → PM bật `p0_reports` qua AD01/AD02 (checklist 3/3 đạt) → tạo báo cáo → worker dựng (có nguồn "Khớp Meta tính đến") → tạo link → khách (trình duyệt khác, không đăng nhập) mở trang công khai có "Powered by" → **xuất PDF thật bằng Chromium trong worker** → thu hồi → khách thấy "đã hết hạn hoặc bị thu hồi".
- Bộ cách ly: 4 route admin miễn (có lý do; kiểm chặn người không phải staff ở `admin.test.ts`).

**Vùng bảo vệ:** `packages/db/**` (`getDb` giữ pool trên `globalThis` — không đổi schema/RLS), `infra/**` (không đổi; CI chạy thêm `supabase seed buckets`). Không chạm `packages/core/flags/**` (chỉ gọi API có sẵn).

**PM kiểm tra:** `pnpm seed:staff -- --email <email> --password "..." --can-enable-flags` → đăng nhập → `/admin/flags` → bật "Báo cáo" cho workspace (xem checklist, thử vượt có lý do).

## [022] PDF báo cáo A4 qua worker (Playwright) — 2026-10-23

**Thay đổi**
- `packages/core/reporting/pdf.ts` (L3 9, R07): phiên bản PDF = thời điểm dựng báo cáo (dựng lại → PDF cũ hết hiệu lực); `requestPdf` (kiểm toàn vẹn như chia sẻ — ADR-0007 — rồi enqueue `pdf:render`, đã có thì trả sẵn sàng), `pdfStatus`, `renderReportPdf` (kiểm lại toàn vẹn + phiên bản trong job, render, lưu bucket `reports/{workspace}/{report}/{phiên bản}.pdf`).
- Worker: `pdf:render` (kiểm cờ `p0_reports` ở đầu job) mở trang in nội bộ bằng URL ký 10 phút, Playwright Chromium `page.pdf` A4 + print CSS (trình duyệt dùng lại, mỗi job một context), upload Supabase Storage bằng service role.
- Trang in nội bộ `/print/report/{id}?key=` (chỉ mở bằng khóa ký đúng báo cáo + workspace, noindex), cùng mẫu báo cáo, khổ A4, nhãn Powered by theo workspace.
- `signPayload`/`verifyPayload` chuyển vào `packages/core/shared/signing.ts` (dùng chung web và worker).
- API: `POST /api/v1/reports/{id}/pdf` (202 khi đưa vào hàng đợi, 200 + URL ký 1 giờ khi đã có, 422 khi bị khóa), `GET /api/v1/reports/{id}/pdf`.
- R04: thẻ "PDF (A4)" — Xuất PDF, chờ worker xong, Tải PDF.
- `docs/onboarding.md`: cài Chromium cho worker.

**Test tự động**
- `pdf.test.ts` (2): yêu cầu → enqueue đúng phiên bản; render ghi đường dẫn; lần sau sẵn sàng không enqueue lại; dựng lại → phiên bản cũ bỏ qua; chưa toàn vẹn → 422 và job không render.
- `signing.test.ts` (1): ký/kiểm, sai secret, sửa nội dung, hết hạn.
- Worker: `pdf:render` cờ tắt → không render.
- Kiểm thủ công: render thật bằng Chromium ra tệp `%PDF` (31 KB). E2E xuất PDF qua giao diện thêm ở 042.
- Bộ cách ly: probe 2 route + job `pdf:render` dùng báo cáo B.

**Vùng bảo vệ:** không.

**PM kiểm tra:** R04 → "Xuất PDF" → "Tải PDF" mở PDF A4 cùng nội dung trang công khai.

## [021] Chia sẻ link công khai, trang báo cáo công khai mobile-first — 2026-10-23

**Thay đổi**
- DB: `app.share_links` (token 32 byte base64url, mật khẩu scrypt có muối, nhãn Powered by theo workspace lúc tạo, hạn, thu hồi, lượt xem). RLS.
- **Trigger DB `app.guard_share_link`** (lớp chặn thứ hai, ADR-0007): không tạo được link khi báo cáo chưa sẵn sàng, Client có tài khoản chưa xác nhận gán, có ngày lệch > 1% trong kỳ, hoặc kết nối Meta đã ngắt.
- `packages/core/reporting/share.ts`: tạo link (kiểm lại toàn vẹn tại thời điểm chia sẻ → 422 `REPORT_BLOCKED` kèm lý do), danh sách, thu hồi, trạng thái công khai (thu hồi / hết hạn / **tạm khóa** khi sau đó số liệu lệch hoặc kết nối bị ngắt — P0-22, P0-23 / cần mật khẩu / xem được), ghi lượt xem. `core/ops/public-share.ts`: tra token (xuyên workspace có chú thích lý do — người xem công khai không có workspace).
- API: `GET|POST /api/v1/reports/{id}/share-links` (201, url công khai theo `PUBLIC_REPORT_URL`), `DELETE /api/v1/share-links/{id}`, `POST /api/v1/public/share/{token}/unlock` (đúng mật khẩu → cookie ký 12 giờ, chỉ cho link đó).
- R04 `/reports/{id}/share` (dạng trang theo PM): tạo link (hạn 7/30/90 ngày hoặc không, mật khẩu tùy chọn, tự sao chép), danh sách (lượt xem, trạng thái, sao chép, thu hồi), trạng thái bị chặn BR01 kèm lý do và lối xử lý. Nút "Chia sẻ" ở R03.
- R06 `/r/{token}`: trang công khai mobile-first dùng chung mẫu báo cáo; trạng thái hết hạn/thu hồi, tạm khóa, mật khẩu; `noindex`.

**Test tự động**
- `packages/core/src/reporting/share.test.ts` (7): token + hạn + mật khẩu băm/kiểm; chưa xác nhận gán → 422 **và trigger DB chặn ghi thẳng**; ngày lệch → chặn API + trigger; trạng thái công khai ok/mật khẩu/hết hạn/thu hồi + đếm lượt xem; link đã tạo bị khóa khi sau đó lệch hoặc ngắt kết nối, mở lại khi hết lệch; gỡ nhãn; muối ngẫu nhiên.
- API `share.test.ts` (3): tạo/danh sách (không lộ hash)/thu hồi, 422 khi chưa xác nhận, mở khóa đúng/sai mật khẩu.
- Bộ cách ly: dữ liệu B có link chia sẻ; probe 3 route (+ báo cáo/link B), unlock miễn (có lý do).

**Vùng bảo vệ:** `packages/db/**` (1 bảng, RLS, **trigger chặn chia sẻ**, migration 0023–0024). Rủi ro: trigger chặn mọi insert share link khi dữ liệu chưa toàn vẹn — đúng ý đồ; lỗi trả `REPORT_BLOCKED`.

**PM kiểm tra:** (cờ `p0_reports` bật) R03 → "Chia sẻ" → tạo link (thử có mật khẩu) → mở link ở cửa sổ ẩn danh/điện thoại; thu hồi → link báo "đã hết hạn hoặc bị thu hồi".

## [020] Tóm tắt LLM có kiểm tra số; tóm tắt mẫu khi không có API key — 2026-10-23

**Thay đổi**
- `packages/core/reporting/summary.ts` (PRD P0-16, CLAUDE.md quy tắc 5):
  - Tập số được phép (`summaryFacts`): KPI, % thay đổi so kỳ trước, CTR, health, số tài khoản, số vấn đề (và mức cao), tác động ước tính — viết theo locale báo cáo.
  - Prompt chỉ chứa tập số + mã quy tắc; **không** đưa tên tài khoản/chiến dịch (dữ liệu người dùng, quy tắc 10). Yêu cầu không bịa/không làm tròn khác/không nhắc ngày.
  - Kiểm tra số: trích mọi số theo định dạng locale (vi "1.234,5", en "1,234.5"), bỏ ngày; mỗi số phải khớp một giá trị cho phép (±0,5% tương đối hoặc ±0,05). Không qua → sinh lại (tối đa 2 lần) → tóm tắt mẫu không LLM. LLM lỗi → tóm tắt mẫu, không chặn báo cáo.
  - Client Anthropic Messages API bằng `fetch` (không thêm SDK), model `ANTHROPIC_MODEL` (mặc định claude-sonnet-5-5), max_tokens 600, nhiệt độ 0,2. Không có `ANTHROPIC_API_KEY` → tóm tắt mẫu.
- `report:build` sinh tóm tắt khi dựng; cột `reports.summary_source` (`llm` | `template`). R03 ghi rõ nguồn tóm tắt.

**Test tự động**
- `packages/core/src/reporting/summary.test.ts` (12): trích số vi/en + bỏ ngày, số bịa bị bắt, giảm viết không dấu vẫn khớp, tập số đủ loại, prompt không chứa tên tài khoản (thử chèn lệnh), mẫu vi/en và số trong mẫu tự qua kiểm tra, LLM đúng → dùng, bịa 3 lần → mẫu (đếm lần gọi), lần 2 đúng → dùng, lỗi mạng → mẫu, client Anthropic gọi đúng định dạng / lỗi HTTP.
- `report.test.ts`: báo cáo dựng có tóm tắt mẫu.

**Vùng bảo vệ:** `packages/db/**` (1 cột, migration 0022).

**PM kiểm tra:** không có key → R03 ghi "Tóm tắt tự động từ số liệu (không dùng AI)". Có key ở staging → "Tóm tắt do AI viết… đã được kiểm tra".

## [019] Dựng báo cáo: nội dung có cấu trúc, mẫu vi/en, thương hiệu (sau cờ `p0_reports`) — 2026-10-23

**Thay đổi**
- ADR-0007 (PM chọn): cho tạo báo cáo nháp; chặn chia sẻ/gửi khi có tài khoản chưa xác nhận gán hoặc ngày lệch > 1% trong kỳ (kiểm lại tại thời điểm chia sẻ/gửi). L3 10.2 sửa cho khớp.
- DB: `app.reports` (Client, loại, kỳ, ngôn ngữ, trạng thái building/ready/failed, `content` JSON, `edits` của agency, `integrity` + `reconciliation_status` lúc dựng, phiên bản mẫu, tóm tắt cho 020, PDF cho 022). RLS.
- `packages/core/reporting/report.ts`: tạo (bất đồng bộ, enqueue `report:build`), dựng `ReportContent` (theo từng tài khoản: KPI kỳ này + kỳ trước cùng độ dài, chi tiêu/kết quả theo ngày, 5 chiến dịch chi tiêu cao nhất, health, đối chiếu; 10 phát hiện đang mở xếp theo mức độ và tác động; thương hiệu workspace ← ghi đè Client; nguồn số liệu P0-13: khớp Meta lúc nào, attribution, tiền tệ, múi giờ), toàn vẹn, chỉnh phần agency viết (tiêu đề, việc đã làm, kế hoạch, ẩn mục), dựng lại, xóa, danh sách (buyer chỉ thấy Client được gán). Loại "pitch" chưa mở (PRD P0-18 chỉ làm nếu E5 đạt).
- `SYSTEM_ACTOR` cho job worker chỉ đọc. Worker `report:build` kiểm cờ `p0_reports` ở đầu job.
- API (đều kiểm cờ phía server): `GET|POST /api/v1/reports`, `GET|PATCH|DELETE /api/v1/reports/{id}`, `POST /api/v1/reports/{id}/rebuild`.
- Mẫu báo cáo `apps/web/src/report/report-view.tsx`: một mẫu cho xem trước, trang công khai (021) và PDF (022); nhãn theo ngôn ngữ báo cáo (không theo người xem); biểu đồ SVG render server; dòng nguồn số liệu; "Powered by AdxLens" (tùy gói, 026). Đặt trong `apps/web` (không phải `packages/ui/report` như L3 9) để dùng chung bộ dịch i18n của web.
- Giao diện: sidebar "Báo cáo" sau cờ; R01 danh sách (trống, trạng thái, "Chưa chia sẻ được"); R02 tạo (Client, loại, kỳ 7/30 ngày/tháng trước/tùy chọn, ngôn ngữ); R03 xem trước (đang dựng tự cập nhật, lỗi, banner khóa chia sẻ kèm lý do và lối xử lý, chỉnh nội dung, dựng lại, xóa); C02 tab Báo cáo.
- Vitest dùng JSX runtime tự động (test render component).

**Test tự động**
- `packages/core/src/reporting/report.test.ts` (4): tạo + dựng đủ nội dung (KPI, kỳ so sánh, phát hiện mức cao trước, nguồn P0-13); toàn vẹn chưa xác nhận / lệch trong kỳ → khóa, kỳ không chứa ngày lệch → không khóa; chỉnh + dựng lại + khoảng ngày sai; quyền buyer, workspace khác.
- `apps/web/src/report/report-view.test.tsx` (4): nhãn theo ngôn ngữ báo cáo, số định dạng vi/en, delta, ẩn mục, nhãn Powered by, chưa đối chiếu.
- API `reports.test.ts` (2): **cờ tắt → 404, không tạo, không enqueue**; cờ bật tạo/xem/sửa, buyer 403. Worker: `report:build` cờ tắt → không dựng.
- Bộ cách ly: cờ bật cho A qua `core/flags`; dữ liệu B có báo cáo; probe 6 route + job `report:build` (+ báo cáo B).
- **Test đổi:** `apps/web/src/lib/nav.test.ts` — mục "Báo cáo" nay sau cờ `p0_reports` (roadmap B3), nên khi mọi cờ tắt sidebar không còn "Báo cáo"; thêm khẳng định bật cờ thì hiện.
- E2E báo cáo thêm ở 042 (khi có màn bật cờ của PM để bật trong test).

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0020–0021).

**PM kiểm tra:** bật cờ `p0_reports` cho workspace (tạm qua Supabase Studio bảng `app.feature_flags` hoặc chờ màn AD01 ở 042) → sidebar "Báo cáo" → "+ Tạo báo cáo" → R03.

## [018b] O01 Tổng quan agency, cột số liệu C01, bảng chiến dịch C02 — 2026-10-23

**Thay đổi**
- `packages/core/reporting/overview.ts` (PRD P0-11): theo Client và tài khoản — chi tiêu 7 ngày (so 7 ngày trước) và 30 ngày, ngày theo múi giờ từng tài khoản tới hôm qua, cộng theo tiền tệ (không quy đổi); health của Client = tài khoản thấp nhất; số vấn đề mức cao đang mở; đối chiếu. Tài khoản chưa gán tách riêng; kết nối đã ngắt bị loại. Không thống kê theo media buyer.
- O01 `/overview` thay trang giữ chỗ: KPI (chi tiêu 7/30 ngày — "Nhiều tiền tệ" khi không cộng được, vấn đề cao, tài khoản lệch), banner tài khoản chưa gán, bảng Client | Tài khoản QC | Chi tiêu 7 ngày + delta | 30 ngày | Health | Vấn đề cao | Đối chiếu; trạng thái trống (CTA kết nối) và đang tải (skeleton).
- C01: cột Chi tiêu 30 ngày, Health, Vấn đề cao có số liệu thật (cột Báo cáo cuối ở 019+).
- C02 tab Chiến dịch / Nhóm QC / Quảng cáo: bảng trạng thái, chi tiêu, hiển thị, click, CTR, kết quả, CPA, ROAS theo kỳ đang chọn; dòng nguồn.

**Test tự động**
- `metrics.test.ts` (+1): tổng quan theo Client (chi tiêu theo tiền tệ, 30 ngày/7 ngày trước, health, vấn đề cao, tài khoản chưa gán).
- E2E: O01 có Client vừa gán; C02 có bảng chiến dịch (cột Chiến dịch, ROAS).

**Vùng bảo vệ:** không.

**PM kiểm tra:** Tổng quan sau khi đồng bộ; Clients thấy chi tiêu 30 ngày/health; Client → tab Chiến dịch/Nhóm QC/Quảng cáo.

## [018a] Giao diện phát hiện: D01 tổng quan tài khoản, D02 danh sách, D03 chi tiết — 2026-10-23

**Thay đổi**
- `packages/core/reporting/metrics.ts`: KPI theo tài khoản (chi tiêu, kết quả, hiển thị, click, doanh thu; CTR; CPA/ROAS/CPM chia thập phân không float), chuỗi theo ngày đủ ngày (ngày thiếu = 0), bảng theo cấp campaign/ad set/ad. Áp quyền buyer theo Client. `divDecimal` trong `shared/decimal`.
- D01 `/accounts/{id}`: hàng KPI so với kỳ trước (màu theo tốt/xấu, CPA tăng = đỏ), biểu đồ xu hướng (Recharts: chi tiêu cột, kết quả đường), health score + thành phần theo nhóm, 5 phát hiện nổi bật, badge đối chiếu, dòng nguồn số liệu. Kỳ theo bộ chọn trên thanh trên, ngày theo múi giờ tài khoản.
- D02 `/accounts/{id}/findings`: lọc mức độ / trạng thái / nhóm (chip), bảng mức độ, phát hiện + đối tượng + lý do, nhóm, tác động ước tính, cập nhật, trạng thái; trống.
- D03 drawer (`?finding=`): vì sao, nên làm gì, tác động + cách tính, bằng chứng (chỉ số tuần trước → tuần này), mở trong Ads Manager, dòng "không do mô hình ngôn ngữ tạo", Đã xem / Đã làm / Bỏ qua (cần lý do) / Báo sai.
- C02 tab Cài đặt: tên tài khoản QC mở D01. Thư viện `recharts` (L3 mục 2).
- `docs/tech-debt.md`: so bố cục với Penpot khi plugin hoạt động (lần dựng này plugin bị trình duyệt tạm ngưng).

**Test tự động**
- `packages/core/src/reporting/metrics.test.ts` (5): KPI khớp tổng insight, CPA/ROAS, chuỗi ngày đủ, tổng campaign = tổng tài khoản, quyền buyer/workspace khác, không dữ liệu.
- `apps/web/src/lib/kpi.test.ts` (2): delta tốt/xấu theo chỉ số. `decimal.test.ts` (+1).
- E2E: C02 → D01 (health score) → D02 → D03 (nếu có phát hiện: mở, "Đã làm").

**Vùng bảo vệ:** không.

**PM kiểm tra:** Clients → Client → tab Cài đặt → bấm tài khoản → D01; "Xem tất cả phát hiện" → D02 → bấm một dòng → D03.

## [017] Quy tắc audit (phần 2): learning limited, chi tiêu không chuyển đổi, vệ sinh tài khoản, theo dõi chuyển đổi — 2026-10-23

**Thay đổi**
- 4 quy tắc (ngưỡng trong `docs/rules/README.md`, chờ PM duyệt):
  - `learning_limited` (ad set): trạng thái `LEARNING_LIMITED` từ API, hoặc suy từ < 50 kết quả/7 ngày khi API không trả trạng thái; mức theo tỷ trọng chi tiêu.
  - `spend_no_conversion` (ad set tối ưu chuyển đổi): chi tiêu 7 ngày vượt ngưỡng theo tiền tệ mà 0 kết quả, chỉ khi tài khoản vẫn có kết quả cùng mục tiêu ở nơi khác (tránh nhầm với lỗi theo dõi); tác động = toàn bộ chi tiêu.
  - `account_hygiene`: tên mặc định/bản sao ở đối tượng đang chạy; campaign/ad set đang bật mà 7 ngày không chi tiêu.
  - `conversion_tracking` (tài khoản): kết quả 3 ngày gần nhất giảm ≥ 70% so với 14 ngày trước trong khi chi tiêu và click không giảm tương ứng.
- Bộ v1 đủ 8 quy tắc trong `RULES`; văn bản vi/en.

**Test tự động**
- `rules-2.test.ts` (12): fixture phát hiện đúng, **không đủ dữ liệu → không phát hiện**, biên, mục tiêu click không áp dụng, cả tài khoản không có kết quả thì không báo lãng phí, chi tiêu cũng giảm thì không báo lỗi theo dõi, nhận diện tên mặc định.
- `insight.test.ts`: chạy đủ 8 quy tắc trên mock bắt thêm "chi tiêu không chuyển đổi" (ad set Sở thích) và "học hạn chế" (ad set traffic).

**Vùng bảo vệ:** không.

## [016] Quy tắc audit (phần 1): creative fatigue, phân bổ ngân sách, ad thắng bị bỏ đói, phân mảnh — 2026-10-23

**Thay đổi**
- 4 quy tắc trong `packages/core/src/insight/rules/` (ngưỡng trong `docs/rules/README.md`, chờ PM duyệt sau E4; đổi qua `app.rule_configs`):
  - `creative_fatigue` (ad): tần suất ≥ 2,5 tăng ≥ 20% và CTR giảm ≥ 25%; tác động = chi tiêu 7 ngày × mức giảm CTR.
  - `budget_misallocation` (ad set): CPA ≥ 1,5× trung vị các ad set cùng mục tiêu tối ưu, chiếm ≥ 15% chi tiêu; tác động = chi tiêu × (1 − CPA trung vị / CPA).
  - `starved_winner` (ad): CPA ≤ 0,7× ad set nhưng chi tiêu ≤ 15%; không ước tính tiền.
  - `fragmentation` (campaign): ≥ 4 và ≥ 50% ad set ngân sách nhỏ (theo tiền tệ) hoặc học hạn chế.
- Trùng lặp đối tượng **không triển khai**: API không có dữ liệu (PRD 9.4 "chỉ khi API có dữ liệu"); ghi trong `docs/rules/README.md`.
- `mulRatio` (tiền × tỷ lệ trên BigInt) cho tác động ước tính.
- Văn bản vi/en `rules.<id>.name/why/what/impact` + nhãn nhóm; số định dạng theo locale (ICU).

**Test tự động**
- `rules-1.test.ts` (12): mỗi quy tắc có fixture phát hiện đúng (mức độ, tác động), **không đủ dữ liệu → không phát hiện**, biên ngưỡng, khác mục tiêu không so, ngưỡng theo tiền tệ.
- `insight.test.ts` (+1): chạy bộ quy tắc thật trên dữ liệu mock → bắt đúng 3 mẫu cài sẵn (fatigue, ad thắng bị bỏ đói, phân mảnh).
- `apps/web/src/server/translate.test.ts` (2): mọi quy tắc có văn bản ở cả hai ngôn ngữ, dịch không sót placeholder. `decimal.test.ts` (+1).

**Vùng bảo vệ:** không.

**PM kiểm tra:** duyệt bảng ngưỡng ở `docs/rules/README.md`; giao diện phát hiện ở 018.

## [015] Insight engine: hợp đồng quy tắc, phát hiện, phản hồi, health score — 2026-10-23

**Thay đổi**
- ADR-0006: vòng đời phát hiện — một dòng mỗi (tài khoản, quy tắc, đối tượng); tự `resolved` khi hết; `done`/`resolved` mở lại khi quay lại; `dismissed` giữ nguyên; giải thích lưu khóa i18n + tham số.
- DB: `app.findings`, `app.finding_feedback`, `app.rule_configs` (mặc định toàn hệ thống / ghi đè theo workspace, `NULLS NOT DISTINCT`). RLS.
- `packages/core/insight`:
  - Hợp đồng `Rule` (L2 5.1): `defaults`, `minData`, `detect(snapshot, config)`.
  - Ảnh chụp bằng truy vấn tổng hợp SQL: 7 ngày gần vs 7 ngày trước theo múi giờ tài khoản, cấp ad / ad set / campaign (chi tiêu, hiển thị, reach, click, kết quả, doanh thu, tần suất có trọng số, số ngày hoạt động), cấu trúc + ngân sách + learning stage, chuỗi 28 ngày cấp tài khoản.
  - Engine `runAudit`: cấu hình hiệu lực (code ← toàn hệ thống ← workspace), upsert theo ADR-0006, quy tắc lỗi không chặn quy tắc khác và không xóa phát hiện cũ của nó.
  - Health score: high −15, medium −7, low −3, trần nhóm −30, sàn 0, có thành phần theo nhóm (có test khóa).
  - Phản hồi seen/done/dismissed (cần lý do)/wrong; tỷ lệ "sai" theo quy tắc (L2 5.4). Buyer chỉ thấy tài khoản của Client được gán.
  - Deep link Ads Manager theo cấp đối tượng.
- Chuỗi job: đối chiếu ổn (không có ngày lệch trong 14 ngày gần nhất) → `audit:run` (L3 7.3). Worker handler `audit:run`.
- API: `GET /api/v1/ad-accounts/{id}/findings` (lọc mức độ/nhóm/trạng thái, phân trang), `GET /api/v1/findings/{id}`, `POST /api/v1/findings/{id}/feedback`. Giải thích dịch theo locale phía server.
- `docs/rules/README.md`: hợp đồng và quy trình duyệt ngưỡng. Bộ quy tắc thật ở 016–017.

**Test tự động**
- `packages/core/src/insight/insight.test.ts` (10): ảnh chụp đúng cửa sổ + tổng khớp giữa các cấp, không dữ liệu → no_data, vòng đời ADR-0006, cấu hình tắt/ghi đè ngưỡng, quy tắc lỗi được cô lập, phản hồi + tỷ lệ sai, quyền buyer/workspace khác, health score khóa + chỉ tính đang mở, deep link.
- API `findings.test.ts` (2). Bộ cách ly: dữ liệu B có phát hiện; probe 3 route + job `audit:run` (+ tài khoản B).

**Vùng bảo vệ:** `packages/db/**` (3 bảng + RLS, migration 0018–0019).

**PM kiểm tra:** chưa có giao diện (D01–D03 ở 018); quy tắc thật ở 016–017.

## [014] Ngắt kết nối và xóa dữ liệu (S07), data deletion callback — 2026-10-23

**Thay đổi**
- DB: `app.deletion_requests` (mã xác nhận `XD-XXXXXXXX`, nguồn user/meta_callback, trạng thái pending/in_progress/done/cancelled, hạn xóa). RLS.
- `packages/core/connections/deletion.ts` (P0-22, L3 5.5, ADR-0001 A8):
  - Ngắt kết nối: xóa token ngay (ghi đè rỗng), trạng thái `revoked`, tạo yêu cầu xóa, hẹn job `maintenance:purge_connection_data` sau 7 ngày, email xác nhận kèm mã. Gọi lại khi đang chờ → cùng mã.
  - Purge: xóa kết nối và mọi dữ liệu quảng cáo (tài khoản QC, insight, cấu trúc, lần đồng bộ, đối chiếu — cascade), email "đã xóa". Kết nối lại trước hạn → hủy yêu cầu (hoàn tác nhầm lẫn). Chạy trước hạn → không xóa.
  - Không gọi API ghi của Meta để thu hồi quyền (quy tắc 3); hộp thoại hướng dẫn gỡ ứng dụng trong cài đặt Facebook.
  - `parseSignedRequest` (HMAC-SHA256, so sánh hằng thời gian).
- `packages/core/ops/data-deletion.ts`: callback Meta thu hồi mọi kết nối của `meta_user_id` ở mọi workspace (chung một mã); tra trạng thái công khai theo mã. Truy vấn xuyên workspace có chú thích lý do.
- API: `POST /api/v1/connections/{id}/disconnect`; `POST /api/v1/webhooks/meta` (form `signed_request`, trả `{ url, confirmation_code }` theo yêu cầu của Meta).
- Giao diện: S02 thêm thẻ "Kết nối Meta" (tài khoản Meta, số tài khoản QC, trạng thái, "Ngắt kết nối và xóa dữ liệu"); S07 hộp thoại (giải thích xóa token ngay, xóa dữ liệu sau 7 ngày trong cam kết 30 ngày, khóa link báo cáo, phải tick "Tôi hiểu"); banner "Đang chờ xóa dữ liệu (mã …)" / "Đã xóa dữ liệu …". Trang M05 tra cứu mã hoạt động thật (thêm trạng thái "đã hủy").
- `docs/tech-debt.md`: bỏ mục deletion-status (đã xong).

**Test tự động**
- `packages/core/src/connections/deletion.test.ts` (6): token xóa ngay + hẹn purge + email; purge trước hạn không xóa; purge đúng hạn xóa sạch 6 bảng; kết nối lại → hủy; gọi lại cùng mã; buyer/workspace khác bị chặn; callback Meta thu hồi đúng người dùng ở nhiều workspace, không chạm người khác; chữ ký sai/payload hỏng bị từ chối; mã không tồn tại.
- `apps/web/src/app/api/v1/connections/disconnect.test.ts` (2): API ngắt kết nối (buyer 403, không lộ token), webhook chữ ký đúng/sai/thiếu.
- Bộ cách ly: probe route disconnect (+ kết nối B), webhook miễn (có lý do); probe job purge (+ kết nối B).
- E2E: ngắt kết nối từ S02 → banner có mã → trang M05 hiển thị "Đã nhận yêu cầu".

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0016–0017), `packages/core/connections/**` (xóa token khi ngắt kết nối). Rủi ro: purge xóa cascade toàn bộ dữ liệu của kết nối — chỉ chạy khi đã quá hạn 7 ngày và kết nối chưa được kết nối lại (có test).

**PM cần làm khi cấu hình Meta App:** Data Deletion Callback URL và Deauthorize Callback URL = `https://<APP_URL>/api/v1/webhooks/meta`; trang hướng dẫn xóa dữ liệu = `https://<APP_URL>/data-deletion`.

**PM kiểm tra:** Kết nối → thẻ "Kết nối Meta" → "Ngắt kết nối và xóa dữ liệu" → tick → banner mã XD-…; Mailpit có email xác nhận; mở `/data-deletion?code=<mã>`.

## [013b] Playbook meta_rate_limited, token_expiring; báo cáo E4 — 2026-10-23

**Thay đổi**
- `packages/core/ops/playbooks.ts` (L2 11.2):
  - `meta_rate_limited`: health check `meta_rate_limit` (job_audit 15 phút gần nhất: ≥ 20 lời gọi và > 20% bị rate limit → lỗi, sự cố P2); playbook hoãn queue `sync` 15 phút (BullMQ `rateLimit`), tối đa 3 lần/giờ rồi leo thang. Chạy ngay sau `ops:health_check`.
  - `token_expiring`: job `maintenance:daily_tick` (lên lịch 09:00 giờ Việt Nam) quét kết nối sắp hết hạn trong 7 ngày → email người kết nối (1 lần/ngày/kết nối). Token dài hạn của Meta không làm mới được phía server nên hành động là nhắc kết nối lại. Đã quá hạn → kết nối "hết hạn", sự cố P3, email báo đã hết hạn. Truy vấn xuyên workspace có chú thích lý do (module ops).
- Email `connectionExpiringEmail` (vi/en), link tới trang Kết nối.
- Worker: dịch vụ `appUrl`, `throttleQueue`.
- Báo cáo E4: `dataCoverageReport` (theo workspace: ngày có dữ liệu, ngày đối chiếu, ngày lệch, lệch chi tiêu lớn nhất, tỷ lệ phủ tần suất/doanh thu/kết quả, loại kết quả, số campaign/ad set/ad/creative, creative có thumbnail, video, learning stage, ngân sách) + `pnpm e4:report -- --workspace <uuid> [--days 30]` in Markdown (chặn chạy ở production).
- `docs/onboarding.md` mục 5: đồng bộ, đối chiếu, lịch định kỳ, E4.

**Test tự động**
- `packages/core/src/ops/playbooks.test.ts` (5): email nhắc + giới hạn 1 lần/ngày, bỏ qua kết nối còn xa/không hạn, quá hạn → hết hạn + sự cố + email không chứa token, ngưỡng rate limit (dưới 20 lời gọi, đúng 20%), hoãn queue 3 lần rồi leo thang, kiểm tra ổn thì không chạy.
- `apps/worker/src/dispatch.test.ts` (+1): `maintenance:daily_tick`.
- `reconciliation.test.ts` (+1): báo cáo E4 đúng số và chỉ trong workspace, Markdown.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `pnpm e4:report -- --workspace <id workspace đã đồng bộ> --days 14` in bảng; với tài khoản thật của design partner (staging) đây là báo cáo E4.

## [013a] Đối chiếu số liệu với Meta (ngưỡng 1%), D04 — 2026-10-23

**Thay đổi**
- DB: `app.reconciliation_results` theo (tài khoản, ngày): chi tiêu, kết quả, hiển thị, click liên kết, doanh thu chuyển đổi — AdxLens và Meta; `results_by_type` (từng action_type), độ lệch % numeric(10,6), `ok`/`warning`. RLS.
- `packages/core/shared/decimal.ts`: số thập phân cố định trên BigInt (cộng tiền, độ lệch %, so sánh) — không float.
- `packages/core/reconciliation`:
  - `RECONCILIATION_THRESHOLD_PCT = 1` (có test khóa). Ngày `ok` khi chi tiêu **và** kết quả lệch ≤ 1% (L3 6.4).
  - Kết quả so theo từng loại action (mua hàng, lead, click…) trên mọi ad với insight cấp tài khoản của Meta, lấy loại lệch nhiều nhất (không để loại này bù loại kia). Ngày Meta có số mà AdxLens thiếu dữ liệu → lệch.
  - Lệch → sự cố P2 `reconciliation_warning` + playbook `reconcile_retry`: đồng bộ lại các ngày lệch sau 24 giờ (1 lần/ngày/tài khoản, vượt thì leo thang). Hết lệch → đóng sự cố. Token thu hồi → kết nối hết hạn.
  - Badge 7 ngày tới hôm qua theo múi giờ tài khoản; chi tiết D04 (tổng từng chỉ số, ROAS tính trên số nguyên).
- Ingestion: lần chạy đồng bộ xong tự enqueue `reconcile:account` cho khoảng ngày của nó; `startManualSync` (đồng bộ lại khoảng ≤ 90 ngày, có thể hoãn); jobId backfill gắn với lần chạy (để đồng bộ lại không bị trùng job cũ). Trạng thái đồng bộ không bị lần đồng bộ lại đã lên lịch (chưa chạy) che mất.
- Worker: handler `reconcile:account`.
- API: `GET /api/v1/ad-accounts/{id}/reconciliation?from&to` (D04), `POST /api/v1/ad-accounts/{id}/resync`, `sync-status` có `reconciliation` (trước đây `null`).
- Giao diện: D04 Đối chiếu số liệu (Penpot: chọn tài khoản, 7/14/30 ngày, "Chạy lại đồng bộ", banner ngày lệch, bảng Chỉ số | AdxLens | Ads Manager | Chênh lệch | % | Trạng thái, nguyên nhân có thể, dòng nguồn); badge "Khớp x% / Lệch x%" ở S06, cột Đối chiếu C01, tiêu đề C02 (bấm mở D04).

**Test tự động**
- `packages/core/src/shared/decimal.test.ts` (3); `packages/core/src/reconciliation/reconciliation.test.ts` (9): ngưỡng khóa 1%, biên ≤ 1%, ROAS, tài khoản khớp mọi ngày, mock lệch 1,4% đúng một ngày → warning + sự cố + playbook hoãn 24 giờ + lần 2 leo thang, hết lệch đóng sự cố, thiếu dữ liệu nội bộ → lệch, pending, không đối chiếu tài khoản workspace khác.
- `ingestion.test.ts` (+1): lần đồng bộ lại đã lên lịch không che backfill đã xong.
- Worker: chạy hết hàng đợi → backfill xong tự đối chiếu 90 ngày.
- API `ad-accounts/reconciliation.test.ts` (5); `lib/recon.test.ts` (3).
- Bộ cách ly: dữ liệu B có kết quả đối chiếu; probe job `reconcile:account` (+ biến thể tài khoản B), 2 route mới.
- E2E: S06 hiện badge đối chiếu cho 2 tài khoản; C02 → D04.
- **Test đổi:** `connections.test.ts` trước khẳng định `reconciliation: null` (giữ chỗ của 012); nay là `{ status: 'pending' }` vì 013 điền đối chiếu thật.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0014–0015).

**PM kiểm tra:** sau S06, mở Clients → cột Đối chiếu; Client có tài khoản "Thời trang Linh" (mock lệch 1,4% ngày 3 hôm trước) → "Lệch 1,4%" → D04 thấy banner ngày lệch, bảng chỉ số, "Chạy lại đồng bộ".

## [012] Đồng bộ số liệu: backfill 90 ngày, daily sync, S06 — 2026-10-23

**Thay đổi**
- ADR-0005 (PM chọn): backfill bắt đầu ngay khi nhập tài khoản ở S04; xác nhận gán chỉ chặn chia sẻ/gửi. L2, L3 7.3 sửa cho khớp.
- DB: `analytics.entities` (campaign/ad set/ad/creative; ngân sách numeric; `attrs` có optimization_goal, thumbnail…), `analytics.insights_daily` (cấp ad, `date` theo múi giờ ad account, tiền numeric(18,4), `results` + `result_type` theo mục tiêu tối ưu, `conversion_value`, cửa sổ attribution 7d_click_1d_view), `app.sync_runs` (backfill/daily, lô, số ngày, số dòng, mã lỗi). RLS cho cả ba.
- `packages/core/ingestion`: chia lô 7 ngày (mới nhất trước), `startBackfill` (idempotent; lần trước lỗi thì tạo lần mới), `syncRange` (lô đầu đồng bộ cấu trúc, upsert insight theo khóa (tài khoản, loại, id, ngày), cộng tiến độ nguyên tử vì các lô chạy song song; xong thì tài khoản `ok`, `last_synced_at`, `active_30d` theo chi tiêu 30 ngày), `runDailySync` (3 ngày tới hôm qua; cùng ngày chạy rồi thì bỏ qua), `syncStatuses`. Lỗi token (190) → kết nối hết hạn, lỗi quyền → `no_access`, cả hai không retry; lỗi tạm thời ném để BullMQ retry, lần cuối ghi `META_RATE_LIMITED`/`META_ERROR`. Số tiền Meta đi thẳng chuỗi → numeric, không qua float.
- Kết quả theo `optimization_goal` (mua hàng, lead, click, landing page view, tin nhắn…) và `custom_event_type` của ad set.
- Worker: handler `sync:backfill_account`, `sync:daily_account`; scheduler mỗi giờ `maintenance:daily_sync_tick` tìm tài khoản đang 03:00 giờ địa phương (`core/ops/daily-sync.ts`, truy vấn xuyên workspace có chú thích lý do) và enqueue daily sync. `dispatch` truyền `finalAttempt`.
- API: `POST /ad-accounts/import` bắt đầu backfill; `GET /api/v1/ad-accounts/{id}/sync-status` (L3 10.2; đối chiếu = null tới 013); `POST /api/v1/ad-accounts/{id}/sync` (thử lại).
- Giao diện S06 Tiến độ đồng bộ (Penpot): thanh tiến độ, "N% · x / y tài khoản", bảng Tài khoản | Tiến độ (Xong / Đang chạy N% / Lỗi) | Đối chiếu (— tới 013), tự làm mới khi đang chạy, banner lỗi theo nguyên nhân + "Thử lại đồng bộ" hoặc "Kết nối lại với Meta", "Tiếp tục" khi xong. S05 "Xong, bắt đầu đồng bộ" → S06. Không hiển thị "còn khoảng N phút" và "sẽ email khi xong" (chưa có ước lượng tin cậy và email — 023).
- E2E: Playwright khởi động worker riêng (`webServer` thứ hai, chờ log khởi động).

**Test tự động**
- `packages/core/src/ingestion/ingestion.test.ts` (11): chia lô, kết quả theo goal, chuỗi tiền không qua float, backfill trọn 90 ngày **tổng chi tiêu từng ngày khớp insight cấp tài khoản của Meta mock**, tiến độ giữa chừng, idempotent (không lần mới, không nhân đôi dòng), ngày theo múi giờ tài khoản, token thu hồi, rate limit retry + lần cuối, mất quyền, không đồng bộ tài khoản workspace khác, daily sync 3 ngày + bỏ qua chạy lại.
- `apps/worker/src/handlers/sync.test.ts` (4): mọi lô qua dispatch, `finalAttempt`, scheduler đúng tài khoản 03:00 + ngày theo múi giờ, bỏ qua kết nối hết hạn.
- `apps/web/src/lib/sync-progress.test.ts` (3); API import → 13 job backfill, sync-status, thử lại khi đang chạy không tạo lần mới.
- Bộ cách ly: dữ liệu B có sync run + entity + insight; probe job `sync:backfill_account`, `sync:daily_account` (+ biến thể dùng tài khoản B); probe 2 route mới.
- E2E `clients-assign.spec.ts`: thêm S06 chờ worker đồng bộ xong 2 tài khoản → Tiếp tục → C01.

**Vùng bảo vệ:** `packages/db/**` (3 bảng + RLS, migration 0012–0013). Không chạm token (dùng `withConnectionToken` có sẵn).

**PM kiểm tra:** `pnpm dev` → kết nối Meta (mock) → S04 chọn → S05 → "Xong, bắt đầu đồng bộ" → S06 chạy tới 100% trong vài giây. Supabase Studio: `analytics.insights_daily` có dữ liệu 90 ngày, cột tiền kiểu numeric.

## [011] Gán tài khoản QC cho Client: S05, C01, khung C02 — 2026-10-23

**Thay đổi**
- `packages/core/connections/assignment.ts`: gán + xác nhận tài khoản QC cho Client có sẵn hoặc tạo Client mới; tài khoản đã xác nhận cho Client khác → 409 (phải bỏ gán trước); bỏ gán (về "chưa gán"); đếm tài khoản chưa xác nhận (BR01); lưu trữ Client kéo theo trả tài khoản về "chưa gán"; tổng quan C01 (Client actor thấy được + tài khoản đã gán). Chỉ owner/manager (`clients.manage`); không gán vào Client của workspace khác hay Client đã lưu trữ.
- API: `GET /api/v1/ad-accounts`, `POST|DELETE /api/v1/ad-accounts/{id}/assign` (đúng một trong `client_id` / `create_client_name`), `GET|POST /api/v1/clients`, `GET|PATCH|DELETE /api/v1/clients/{id}` (DELETE = lưu trữ, báo cáo cũ giữ nguyên).
- Giao diện theo Penpot:
  - S05 "Gán mỗi tài khoản cho một Client" (bước 4/4): gợi ý "Khớp tên", ô chọn Client có sẵn hoặc "+ Tạo Client mới: <tên gợi ý>", Xác nhận / Đã xác nhận + Đổi, banner "Còn N dòng chưa xác nhận…", hộp thoại "+ Tạo Client mới", "Xong, bắt đầu đồng bộ" → C01.
  - C01 Clients: badge "N Client · M tài khoản", tìm Client/tài khoản (không phân biệt dấu), banner tài khoản chưa xác nhận + "Xác nhận gán", thao tác dòng (Xác nhận gán / Kết nối lại), trạng thái trống, "+ Thêm Client". Cột chi tiêu/health/vấn đề/đối chiếu/báo cáo cuối hiện "—" tới khi có dữ liệu (012, 013, 015+, 023+).
  - C02 Client: breadcrumb, tab Chiến dịch | Nhóm QC | Quảng cáo | Báo cáo | Cài đặt (bảng số liệu ở 012+); tab Cài đặt liệt kê tài khoản QC + Bỏ gán; Đổi tên, Lưu trữ Client.
- i18n vi/en: namespace `clients`.

**Test tự động**
- `packages/core/src/connections/assignment.test.ts` (7): gán Client có sẵn, tạo Client khi gán, 409 khi đã thuộc Client khác + bỏ gán rồi gán lại, không gán vào Client workspace khác, buyer không gán được, lưu trữ Client trả tài khoản về chưa gán, buyer chỉ thấy Client được gán.
- `apps/web/src/app/api/v1/clients/clients.test.ts` (5): luồng S05 → C01, validate body, 409/bỏ gán, tạo/đổi tên/lưu trữ, buyer 403 + chỉ thấy Client của mình.
- `apps/web/src/lib/assign.test.ts` (3), `apps/web/src/lib/clients.test.ts` (3): lựa chọn mặc định S05, tìm không dấu C01.
- Bộ cách ly: probe 8 route mới (có `crossParams`/`crossBody` dùng tài khoản và Client của B).
- E2E `apps/web/e2e/clients-assign.spec.ts`: đăng ký → Meta giả → S04 chọn 2 tài khoản → S05 xác nhận (tên gợi ý + Client tạo bằng hộp thoại) → C01 tìm → C02 → Bỏ gán → banner C01.

**Vùng bảo vệ:** `packages/core/connections/**` (chỉ thêm `assignment.ts`, không chạm token).

**PM kiểm tra:** sau S04 → S05: xác nhận từng dòng, thử đổi Client; vào Clients thấy số Client/tài khoản; mở Client → tab Cài đặt → Bỏ gán → quay lại Clients thấy banner chưa xác nhận.

## [010] Kết nối Meta: OAuth chỉ đọc, token mã hóa, S02–S04 — 2026-10-23

**Thay đổi**
- Bảng `meta_connections` (token AES-256-GCM, `token_key_version` để xoay khóa; RLS bật, **không** policy cho người dùng — chỉ service role đọc), `meta_available_accounts` (danh sách tài khoản truy cập được + chi tiêu 30 ngày), `ad_accounts` (L3 5.2: Client, trạng thái gán suggested/confirmed, đồng bộ, `active_30d`), `job_audit` (mỗi lời gọi Meta: endpoint, tài khoản, thời lượng, mã lỗi — không token).
- `packages/core/connections`: lưu kết nối (cùng tài khoản Meta trong workspace → cập nhật kết nối cũ khi kết nối lại), danh sách kết nối không bao giờ có token, S04 danh sách tài khoản + đã nhập, nhập tài khoản với gợi ý Client theo tên (bỏ hậu tố "- Main", "| VN"…), buyer chỉ thấy tài khoản của Client được gán, sức khỏe token (hết hạn / còn ≤ 7 ngày), `withConnectionToken` (chỉ worker), ghi `job_audit`.
- Job `sync:refresh_accounts` (worker): giải mã token, làm mới danh sách tài khoản và chi tiêu 30 ngày theo múi giờ từng tài khoản (tổng bằng số nguyên, lưu numeric); token bị Meta thu hồi (190) → kết nối "hết hạn".
- OAuth (L3 10.2): `GET /api/v1/connections/meta/authorize` (state ngẫu nhiên, cookie ký HMAC 10 phút gắn workspace + user), `GET …/callback` (kiểm state so sánh hằng thời gian, đổi code → token dài hạn, kiểm quyền `ads_read`, mã hóa + lưu, enqueue làm mới, chuyển tới S04; lỗi Meta → về S02 với thông báo, không lộ token). `META_MOCK=1`: OAuth giả quay về callback, dùng dữ liệu mock — bị chặn ở staging/production.
- API: `GET /api/v1/connections`, `GET /api/v1/connections/{id}/ad-accounts`, `POST /api/v1/ad-accounts/import`.
- Giao diện theo Penpot: S02 Kết nối Meta (bảng theo tài khoản QC: ID rút gọn, Client/gợi ý, token Hợp lệ/Hết hạn/Còn N ngày, đồng bộ cuối, múi giờ, tiền tệ, có chi tiêu 30N, Kết nối lại; banner tổng hợp; trạng thái trống; lỗi OAuth), S03 Giải thích quyền chỉ đọc, S04 Chọn tài khoản (chi tiêu 30 ngày, tự làm mới khi worker đang tính, đếm theo gói, vượt hạn mức chỉ cảnh báo vì có ân hạn — PRD 13.3; trạng thái trống). Bố cục "Thiết lập · bước N/4". Banner hệ thống X04 khi token hết hạn.
- Worker: dịch vụ chung (Meta theo môi trường, khóa token, email), ghi `job_audit` cho mọi lời gọi Meta.
- `scripts/check-boundaries.mjs`: chặn `apps/web` dùng `withConnectionToken`/`decryptToken` (giải mã token chỉ trong worker, quy tắc 2).
- `docs/tech-debt.md`: `currentPlanKey()` trả Free tới feature 026.

**Test tự động**
- `packages/core/src/connections/connections.test.ts` (11): AES-GCM (giải mã đúng, sửa byte/sai khóa thất bại, IV ngẫu nhiên), DB chỉ có ciphertext + danh sách không có token, kết nối lại, `withConnectionToken` + kết nối hết hạn, không dùng token workspace khác, buyer không quản lý kết nối, nhập + gợi ý Client, tài khoản không thuộc kết nối, buyer chỉ thấy tài khoản được gán, sức khỏe token, gợi ý tên.
- `packages/core/src/connections/refresh.test.ts` (3): chi tiêu 30 ngày đúng tổng, token thu hồi → hết hạn, cột numeric.
- `apps/web/src/app/api/v1/connections/connections.test.ts` (6): authorize → callback lưu kết nối mã hóa + S04 không lộ token, state sai → 403, state của workspace khác → 403, người dùng từ chối, buyer không kết nối được, nhập tài khoản.
- Bộ cách ly: dữ liệu B có kết nối + tài khoản QC; probe 5 route mới (có `crossBody`); probe job `sync:refresh_accounts` (chạy thật với token mã hóa bằng khóa test) và biến thể dùng kết nối của B.
- `apps/web/src/lib/format.test.ts` (2), `scripts/lib/boundaries.test.ts` (+1).

**Vùng bảo vệ:** `packages/core/connections/**` (token), `packages/db/**` (4 bảng, RLS).

**PM kiểm tra:** `pnpm dev` (worker cùng chạy), đăng nhập → Kết nối → "+ Kết nối tài khoản" → "Tiếp tục với Meta" (mock) → S04 thấy 4 tài khoản, chi tiêu 30 ngày hiện sau vài giây. Supabase Studio: bảng `app.meta_connections` chỉ có `token_ciphertext` dạng bytea.

## [009] Meta client, rate limit API — 2026-10-23

**Thay đổi**
- `packages/meta-client` — lớp duy nhất gọi Meta (L3 6.2):
  - Phân trang theo `paging.next` (bỏ token cũ trong URL next, gắn lại token hiện tại), `appsecret_proof` cho mọi lời gọi.
  - Retry backoff mũ có jitter cho rate limit (4/17/32/613, 80000–80014, HTTP 429; chờ lâu gấp 4) và 5xx/lỗi mạng, tối đa 5 lần; lỗi token (190) và quyền (10, 200–299) không retry.
  - Đọc header `x-business-use-case-usage`: ≥ 75% → giảm đồng thời của app 50%.
  - Giới hạn đồng thời: 1 request/tài khoản QC, 5 request/app.
  - Validate mọi phản hồi bằng zod; hook audit mỗi lời gọi (endpoint, tài khoản, thời lượng, mã lỗi) — không chứa token.
  - Mọi thông điệp lỗi được che token, `client_secret`, `appsecret_proof`, `code`.
  - API đọc: `me`, quyền đã cấp, tài khoản QC, campaign/ad set/ad/creative, insights theo ngày (cửa sổ 7d_click/1d_view); OAuth: URL xin quyền (chỉ đọc P0–P1; P2 thêm `ads_management` + `auth_type=rerequest`), đổi code, đổi token dài hạn.
  - Phần ghi Meta không nằm trong package này lúc này (B7, chỉ `packages/core/execution` được import).
- `@adxlens/meta-client/mock` (chỉ local/test, `META_MOCK=1`): 4 tài khoản (3 VND, 1 USD múi giờ Bangkok), dữ liệu xác định; mẫu cài sẵn cho rule audit (ad mệt, chi tiêu không chuyển đổi, ad thắng bị bỏ đói, learning limited, phân mảnh); "Thời trang Linh" lệch 1,4% ở một ngày để thử đối chiếu.
- API web: giới hạn 600 request/phút/workspace (Redis, header `X-RateLimit-Remaining`, vượt → 429); gỡ khỏi `docs/tech-debt.md`.
- Sửa lỗi Semaphore (phát hiện bằng test): slot được chuyển thẳng cho tác vụ đang chờ, không để tác vụ mới chen vào.

**Test tự động**
- `packages/meta-client/src/http.test.ts` (11, msw): phân trang + appsecret_proof, retry rate limit, retry 5xx tối đa 5 lần, 190 không retry + không lộ token, phản hồi sai định dạng, giảm tốc theo header, insights + attribution, đổi token không gửi access_token + không lộ client_secret, 1 request/tài khoản, giới hạn app khi giảm tốc.
- `packages/meta-client/src/mock.test.ts` (4): xác định, dữ liệu tới hôm qua, account = tổng ad trừ ngày lệch 1,4%, cấu trúc.
- `apps/web/src/server/route.test.ts`: rate limit 600/phút, workspace khác không ảnh hưởng.

**Vùng bảo vệ:** không (meta-client ngoài danh sách CLAUDE.md; CODEOWNERS yêu cầu PM duyệt).

**PM kiểm tra:** `pnpm test` xanh.

## [008] Workspace, thành viên, lời mời, Cài đặt; E2E — 2026-10-23

**Thay đổi**
- A07 Tạo workspace (tên, múi giờ theo trình duyệt, tiền tệ báo cáo); A06 Chấp nhận lời mời: người mới đặt họ tên + mật khẩu (email được mời coi như đã xác minh), người đã có tài khoản đăng nhập để chấp nhận, đăng nhập sai tài khoản được cảnh báo; A06 · hết hạn.
- Cài đặt: thanh tab dùng chung theo vai trò (owner: Workspace · Thành viên · Gói & thanh toán · Thông báo · Hồ sơ; manager: Thành viên · Thông báo · Hồ sơ; buyer: Thông báo · Hồ sơ; Guardrails chỉ khi P2 bật).
  - ST01: tên, múi giờ, ngôn ngữ, logo (PNG/SVG ≤ 1MB, kiểm theo nội dung file, SVG có script/handler/link ngoài bị từ chối), màu chủ đạo, email gửi báo cáo (cảnh báo domain chưa xác minh), xóa workspace (nhập đúng tên).
  - ST02: bảng thành viên + lời mời đang chờ (Gửi lại), mời thành viên (email, vai trò, Client), sửa vai trò/Client/quyền duyệt theo Client (cột "Duyệt hành động" chỉ khi P2 bật), xóa thành viên, chuyển quyền owner cho manager (xác nhận bằng mật khẩu); trạng thái trống.
  - ST06: họ tên, ngôn ngữ, đổi mật khẩu (cần mật khẩu hiện tại, đăng xuất phiên khác), đăng xuất mọi thiết bị khác.
  - ST03, ST05: khung tạm (feature 026, 023).
- Email qua SMTP (ADR-0004, nodemailer): Mailpit ở local, Resend SMTP ở staging/production; email mời E02 bản đầu (song ngữ, escape dữ liệu người dùng).
- Supabase Storage: bucket `brand` (công khai, PNG/SVG ≤ 1MB), `reports` (riêng tư), `creatives` (riêng tư).
- Schema: `workspaces.default_currency`, `workspaces.report_from_email`.
- `pnpm seed:staff -- --email … --password … [--can-enable-flags]`: tạo tài khoản đội AdxLens ở local (từ chối chạy ở production).
- **Quyết định PM 23/10/2026:** A01 báo "Email này đã có tài khoản…" như Penpot (ADR-0003 cập nhật). Test cũ "không tiết lộ email" được đổi theo yêu cầu mới (CLAUDE.md quy tắc 8: lý do ghi tại đây).
- Sửa lỗi phát hiện qua E2E: kích thước giao diện nhỏ hơn thiết kế (root font-size 13px làm spacing rem co lại); múi giờ mặc định lấy theo máy chủ thay vì trình duyệt; tên múi giờ cũ `Asia/Saigon` được chuẩn hóa thành `Asia/Ho_Chi_Minh`; A06 báo "tất cả Client" cho buyer chưa được gán; nhãn "Đã mời sau 1 giây nữa" do lệch đồng hồ.
- `route()`: chỉ đọc body JSON khi route có schema (route upload tự đọc multipart); `uuidParam()` cho id sai định dạng trả 404 thay vì 500; mật khẩu xác nhận lại qua `verifyPassword` (thay được trong test, không có đường tắt theo APP_ENV).
- Bộ test cách ly: probe cho 16 route mới; mỗi probe băm dữ liệu workspace B trước/sau và phải không đổi.
- E2E Playwright (`pnpm test:e2e`) + job CI `e2e` (Supabase CLI trên runner).

**Test tự động**
- `apps/web/src/app/api/v1/settings.test.ts` (15): mời (email có link, DB chỉ lưu hash), manager không mời được, không mời vai trò owner, gửi lại đổi token, id sai → 404, đổi vai trò/không đổi owner, chuyển quyền cần đúng mật khẩu, tạo workspace + cookie, múi giờ sai, màu/email gửi báo cáo, xóa workspace (quyền + tên), logo PNG/sai loại/SVG độc/quá 1MB, đổi mật khẩu.
- `packages/core/src/notification/email.test.ts` (2), `apps/web/src/server/storage.test.ts` (3), `apps/web/src/lib/settings-tabs.test.ts` (3), `apps/web/src/lib/timezone.test.ts` (4), tenancy: thêm A06 buyer/manager, chi tiết lời mời.
- `apps/web/e2e/auth-workspace.spec.ts` (4): M01/M02 + đổi ngôn ngữ; F1 đăng ký → email Mailpit → xác minh → tạo workspace → sidebar ẩn mục P1/P2 → ST01 lưu (múi giờ theo trình duyệt) → ST02 mời → email mời → đăng xuất X07 → A06 người mới → buyer không thấy Báo cáo/Kết nối; A03 sai mật khẩu còn 4 lần; A01 email đã có tài khoản.

**Vùng bảo vệ:** `packages/db/**` (cột workspace), `infra/**` (bucket Storage).

**PM kiểm tra:** `pnpm exec supabase stop --workdir infra` rồi `pnpm dev`; `pnpm seed:staff -- --email pm@adxlens.local --password "mat-khau-pm-10" --can-enable-flags`; đăng ký tài khoản mới ở `/signup`, mở Mailpit http://127.0.0.1:54324; thử mời thành viên ở Cài đặt › Thành viên, mở email mời ở Mailpit trong cửa sổ ẩn danh.

## [007] Xác thực A01–A05 — 2026-10-22

**Thay đổi**
- ADR-0003 (xác thực, landing, workspace) và bổ sung L3 mục 3 (route group `(marketing)`, `(auth)`, `(app)`).
- Supabase Auth email + mật khẩu, bắt buộc xác minh email; mật khẩu ≥ 10 ký tự (theo Penpot A01/A05; config Supabase đồng bộ).
- A01 Đăng ký (họ tên, email công việc, mật khẩu, đồng ý điều khoản), A02 Kiểm tra email (gửi lại sau 60 giây), A03 Đăng nhập, A04 Quên mật khẩu, A05 Đặt lại mật khẩu (hết hạn sau 60 phút → màn "hết hạn"; đặt lại xong đăng xuất các phiên khác), `/auth/callback` (đổi mã PKCE, đồng bộ hồ sơ, chuyển tới tạo workspace nếu chưa có).
- Không tiết lộ email đã tồn tại: đăng ký luôn chuyển tới A02; quên mật khẩu luôn báo "đã gửi nếu email tồn tại"; sai email hay sai mật khẩu cùng một thông điệp.
- Khóa đăng nhập tạm 15 phút sau 5 lần sai (Penpot A03 · lỗi), đếm theo hash email (bảng `app.auth_throttle`, không lưu email rõ, RLS không policy).
- Chuyển hướng sau đăng nhập chỉ nhận đường dẫn nội bộ.
- **Lệch so với Penpot (chờ PM chốt):** khung "A01 · lỗi" hiện "Email này đã có tài khoản"; bản code theo PROMPTS (không tiết lộ email đã tồn tại).

**Test tự động**
- `apps/web/src/server/auth-flows.test.ts` (21): chuẩn hóa email, không tiết lộ email đã tồn tại, mật khẩu < 10 ký tự, bắt buộc điều khoản, lỗi đăng nhập chung chung, đếm lần thử và khóa (khi khóa không gọi Supabase), email chưa xác minh, `next` nội bộ, quên mật khẩu luôn "đã gửi", mật khẩu nhập lại sai, link hết hạn, cửa sổ 60 phút, 7 trường hợp `safeNext` (gồm `//`, `/\`, URL ngoài, `javascript:`, CRLF).
- `packages/core/src/tenancy/auth-throttle.test.ts` (3): khóa sau 5 lần/hết khóa đếm lại, đăng nhập đúng xóa bộ đếm, không lưu email rõ.

**Vùng bảo vệ:** `packages/db/**` (bảng auth_throttle), `infra/**` (config Supabase: mật khẩu 10, OTP 24 giờ).

**PM kiểm tra:** chạy `pnpm exec supabase stop --workdir infra && pnpm dev` (nạp config mới); đăng ký ở `/signup`, mở Mailpit http://127.0.0.1:54324, bấm link xác minh, đăng nhập ở `/login`; nhập sai 5 lần thấy thông báo khóa 15 phút.

## [006] Trang công khai M01–M05, cấu hình gói — 2026-10-22

**Thay đổi**
- `packages/core/billing/plans.ts`: **cấu hình gói duy nhất** (PM sửa tại đây): Free 0 ₫/1 tài khoản, Starter 590.000 ₫/5, Growth 1.490.000 ₫/15, Scale 3.490.000 ₫/40; thêm tài khoản 79.000 ₫/tháng; trả năm giảm 20%; ân hạn 7 ngày; gói mặc định Free; quyền theo gói (gỡ nhãn chỉ Scale; quyền ghi P2 từ Growth — ADR-0001 A5, A6, A8).
- Trang công khai theo Penpot: M01 Landing, M02 Bảng giá (đọc từ cấu hình, gói Growth nổi bật), M03 Quyền riêng tư, M04 Điều khoản, M05 Hướng dẫn xóa dữ liệu có ô tra mã xác nhận. Header/footer chung, đổi ngôn ngữ vi/en không cần đăng nhập.
- Lệch so với Penpot (có chủ đích): M05 đường dẫn "Kết nối › …" (Kết nối không nằm trong tab Cài đặt, ux-requirements 6.7); "trong thời hạn cam kết" → "trong vòng 30 ngày" (ADR-0001 A8).
- `docs/tech-debt.md`: nội dung pháp lý giữ chỗ, link báo cáo mẫu, tra mã xóa dữ liệu, rate limit API.

**Test tự động**
- `packages/core/src/billing/plans.test.ts` (6): gói mặc định Free, quyền ghi từ Growth, chỉ Scale gỡ nhãn, giá năm, ân hạn 7 ngày, giá tăng dần.
- `apps/web/src/app/(marketing)/marketing.test.ts` (3): mỗi gói có chuỗi vi/en, chuỗi giao diện không hard-code giá, mã xóa sai định dạng.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `pnpm dev`, mở http://localhost:3000 (landing), `/pricing`, `/privacy`, `/terms`, `/data-deletion`; đổi ngôn ngữ ở header.

## [005] Khung app web, design system code, bộ test cách ly workspace — 2026-10-22

**Thay đổi**
- ADR-0002: thư viện giao diện (Next.js 15, Tailwind 4, nền shadcn/ui: radix-ui, cva, clsx, tailwind-merge; lucide-react; sonner; @supabase/ssr; next-intl).
- `packages/ui`: token CSS chép từ Penpot (tên giữ nguyên), theme Tailwind, component Button, Badge, Delta (màu theo tốt/xấu, luôn có mũi tên và dấu), Input/Select/Checkbox/Field, Card, PageHeader, KpiStat, SourceFootnote, EmptyState, Skeleton, Banner, Tab/Segmented/FilterChip/NavItem, Table, Dialog, Drawer 480px, Tooltip, Menu.
- `apps/web`: thanh trên toàn chiều ngang theo Penpot O01/X07 (logo + breadcrumb, bộ chọn kỳ toàn cục, chọn workspace, avatar với menu X07: Hồ sơ cá nhân, Thông báo, Ngôn ngữ, Đăng xuất); sidebar 224px 9 mục, 4 mục P1/P2 ẩn hẳn khi cờ tắt, buyer không thấy Báo cáo/Kết nối; trang lỗi X01 404, X02 403, X03 (có mã lỗi), F-state "tính năng chưa bật".
- i18n vi/en bằng next-intl, locale theo cookie/hồ sơ.
- `route()` dùng chung cho mọi API: xác thực Supabase (cookie hoặc Bearer), workspace qua `X-Workspace-Id`/cookie và kiểm thành viên, quyền theo vai trò, cờ kiểm phía server (tắt → 404), validate zod (422 kèm đường dẫn lỗi), lỗi chuẩn `{error:{code,message,details}}`, lỗi lạ → 500 không lộ thông điệp, chặn CSRF theo Origin cho request ghi dùng cookie.
- API: `GET /api/health`, `GET /api/v1/me`, `POST /api/v1/me/workspace`, `POST /api/v1/me/preferences`; `POST /auth/logout`. Middleware làm mới phiên, chặn trang app khi chưa đăng nhập.
- Bộ test cách ly workspace (`tests/isolation`): tự quét mọi `app/api/**/route.ts`; route thiếu probe → test đỏ; gọi bằng ngữ cảnh A, phản hồi không được chứa định danh/tên của B; dùng tài nguyên B phải bị từ chối; giả header workspace B bị từ chối. Job theo workspace: băm dữ liệu B trước/sau khi chạy job A phải không đổi; job thiếu probe → đỏ.
- Logger che thêm thông tin đăng nhập trong URL và token trong query string; lỗi đã serialize vẫn được che.
- CI build web.

**Test tự động**
- `apps/web/src/server/route.test.ts` (9): 401, 400/403 workspace, thành viên, 422, 403 vai trò, cờ tắt → 404 và handler không chạy / cờ bật → chạy, AppError/500 không lộ, CSRF, route staff.
- `tests/isolation/routes.test.ts`, `tests/isolation/jobs.test.ts`.
- `apps/web/src/lib/nav.test.ts` (5), `period.test.ts` (6), `breadcrumb.test.ts` (3), `apps/web/src/i18n/messages.test.ts` (4: cùng khóa, cùng biến, không rỗng, không lộ tên cờ/mã giai đoạn).
- Logger: thêm test URL có mật khẩu, query token, thuộc tính tùy ý của lỗi.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `pnpm --filter @adxlens/web build` xanh. Giao diện xem được sau feature 007 (đăng nhập).

## [004] Logger, danh mục job, vận hành (ops), khung worker — 2026-10-22

**Thay đổi**
- Logger Pino chung (`@adxlens/core/shared`): che token/authorization/password/cookie/body/email theo khóa, che chuỗi dạng token Meta (`EAA…`) và `Bearer …` cả trong message và lỗi; logger con gắn `workspace_id`, `job_id`.
- `packages/jobs`: 11 queue (L3 7.1), 17 job `<queue>:<verb>` với payload zod, idempotency key (L2 9), retry 5 lần backoff mũ 30 giây, cổng `Enqueue` để core không import BullMQ.
- Bảng `app.ops_incidents`, `app.ops_playbook_runs` (RLS bật). `packages/core/ops`: mở sự cố gom theo fingerprint, playbook có giới hạn số lần (L2 11.2; vượt giới hạn → leo thang, playbook lạ không bao giờ chạy), health check đăng ký được, mở sự cố khi kiểm tra lỗi.
- `apps/worker`: BullMQ worker cho mọi queue, dispatch validate payload trước khi gọi handler, lịch `ops:health_check` mỗi 5 phút, kiểm tra backlog queue `sync` (> 100 → sự cố P2).
- Sửa: `TOKEN_ENC_KEY_V2` để trống được coi là chưa cấu hình.
- CI: khóa test sinh ngẫu nhiên mỗi lần chạy; `.gitleaks.toml` bỏ qua file `*.test.ts` (chuỗi giả).

**Test tự động**
- `packages/core/src/shared/logger.test.ts` (5): token trong field lồng nhau, trong message/lỗi, body request, giữ workspace_id/job_id.
- `packages/jobs/src/jobs.test.ts` (4): quy ước tên, workspaceId bắt buộc, validate payload, jobId ổn định.
- `packages/core/src/ops/ops.test.ts` (8): gom sự cố, đếm P1, giới hạn playbook, hết cửa sổ, playbook lỗi, playbook lạ, health check.
- `apps/worker/src/dispatch.test.ts` (3): job lạ, payload sai, health check.
- `packages/config/src/env.test.ts`: thêm test khóa V2 để trống.

**Vùng bảo vệ:** `packages/db/**` (bảng ops).

**PM kiểm tra:** `pnpm test` xanh; `pnpm --filter @adxlens/worker dev` in "worker đã chạy".

## [003] Cờ tính năng theo workspace — 2026-10-22

**Thay đổi**
- Bảng `app.feature_flags` (mặc định tắt) và `app.flag_change_log` (append-only, trigger chặn sửa/xóa ở mức DB). RLS bật.
- `packages/core/flags`: `isEnabled`, `assertEnabled` (cờ tắt → 404 `FEATURE_DISABLED`, thông điệp không lộ tên cờ), `getFlags`, cache 60 giây qua interface (Redis ở web/worker; xóa cache khi đổi cờ).
- Bật cờ: chỉ staff có `can_enable_flags`; bắt buộc lý do; chạy checklist kỹ thuật (module khác đăng ký mục kiểm tra qua `registerFlagCheck`); checklist chưa đạt thì chặn, PM vượt được khi ghi lý do (log `override = true`). Không bao giờ bật cờ con khi cờ cha tắt, kể cả khi vượt.
- Tắt cờ: mọi staff; tắt dây chuyền cờ phụ thuộc (p0 → p1 → p2a → p2b); chạy handler đăng ký qua `onFlagDisabled` (dùng ở B7 để hủy action pending). Dữ liệu giữ nguyên.

**Test tự động** (`packages/core/src/flags/flags.test.ts`, 16 test): mặc định tắt; 404 không lộ tên cờ; chỉ PM bật; thành viên workspace không tự bật; bắt buộc lý do; nhật ký kèm checklist; chặn cờ con khi cờ cha tắt; checklist chặn và vượt có ghi log; kiểm tra lỗi coi là chưa đạt; tắt dây chuyền + handler; người ngoài không tắt được; cache và xóa cache; cách ly workspace; nhật ký append-only ở DB; chuỗi phụ thuộc.

**Vùng bảo vệ:** `packages/core/flags/**`, `packages/db/**`.

**PM kiểm tra:** `pnpm test` xanh. Giao diện bật cờ (AD01, AD02) đến ở feature 042.

## [002] Database lõi, RLS, tenancy — 2026-10-22

**Thay đổi**
- `packages/db`: Drizzle ORM + postgres.js; schema `app` và `analytics`; tiền `numeric(18,4)`, tỷ lệ `numeric(10,6)`. Lệnh `pnpm db:generate`, `db:migrate`, `db:check` (thất bại khi schema có thay đổi chưa sinh migration).
- Bảng: `users`, `workspaces`, `memberships` (vai trò owner/manager/buyer, `client_access`, `approve_client_ids`), `clients`, `invitations` (chỉ lưu hash token), `staff`, `audit_events`.
- RLS bật trên mọi bảng; hàm `app.enable_workspace_rls()` dùng cho bảng mới; role `authenticated` không được cấp quyền trực tiếp.
- `packages/core/shared`: `AppError` có `code` và HTTP status, token ngẫu nhiên 32 byte, so sánh hằng thời gian, kiểu `WorkspaceCtx`/`ActorCtx`.
- `packages/core/tenancy`: ma trận quyền theo vai trò (từ ux-requirements mục 6), quyền theo Client, quyền duyệt P2a (owner/manager mặc định; buyer khi owner cấp theo Client), tạo/sửa workspace, thành viên, lời mời 7 ngày (một lần dùng, email phải trùng), chuyển quyền owner cho manager (ADR-0001 B8), Client (tạo, sửa, lưu trữ).
- Test tích hợp chạy trên database `adxlens_test` tạo lại mỗi lần `pnpm test` (cần Postgres: Supabase local hoặc service CI).

**Test tự động**
- `packages/db/src/rls.test.ts`: mọi bảng bật RLS; role authenticated chỉ thấy workspace trong JWT; không claim thì không thấy gì; bảng staff không đọc được.
- `packages/core/src/tenancy/permissions.test.ts`: ma trận quyền, quyền theo Client, quyền duyệt (8 test).
- `packages/core/src/tenancy/tenancy.test.ts`: workspace, lời mời (hợp lệ, hết hạn, sai email, token sai, Client workspace khác), vai trò, xóa thành viên, chuyển quyền owner, Client theo quyền và theo workspace (15 test).

**Vùng bảo vệ:** `packages/db/**` (schema, migration, RLS).

**PM kiểm tra:** `pnpm test` xanh; mở Supabase Studio (http://127.0.0.1:54323) thấy schema `app` với các bảng trên, mỗi bảng có biểu tượng RLS bật.

## [001] Monorepo, CI, môi trường local — 2026-10-22

**Thay đổi**
- Monorepo pnpm + Turborepo, TypeScript strict, ESLint (flat config), Prettier, Vitest.
- `packages/config`: schema biến môi trường bằng zod; lỗi chỉ nêu tên biến, không in giá trị.
- `.env.example` đầy đủ biến; `pnpm env:init` sinh `.env.local` với khóa ngẫu nhiên và key Supabase local.
- Supabase CLI (`infra/supabase/config.toml`): bật xác minh email, mật khẩu ≥ 8 ký tự. Redis qua `infra/docker/compose.yml`.
- `pnpm dev`: bật Redis + Supabase, chạy migration, chạy web + worker.
- `scripts/check-boundaries.mjs` (chạy trong `pnpm lint`): chặn import sâu giữa module core, chặn mọi chỗ ngoài `packages/core/execution` dùng phần ghi của Meta (quy tắc tuyệt đối 3).
- CI GitHub Actions: lint, format, typecheck, test + coverage, db:check, quét bí mật (gitleaks), audit phụ thuộc. CODEOWNERS, PR template, `docs/onboarding.md`.

**Test tự động**
- `packages/config/src/env.test.ts`: mặc định local, khóa rỗng, danh sách tài khoản test, khóa sai độ dài, lỗi không lộ bí mật.
- `scripts/lib/boundaries.test.ts`: 5 trường hợp ranh giới import.

**Vùng bảo vệ:** `infra/**` (compose, config Supabase).

**PM kiểm tra:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` xanh.
