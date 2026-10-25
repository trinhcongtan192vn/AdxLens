## Nguyên nhân / mục tiêu

<!-- Vì sao có PR này; feature roadmap số mấy. -->

## Phạm vi

<!-- Module, màn hình, endpoint, job đã thêm/sửa. -->

## Test đã thêm

<!-- Test hành vi mới, trường hợp lỗi chính, test cách ly workspace, test "cờ tắt thì không chạy" (P1/P2). -->
<!-- Nếu đổi test cũ: ghi lý do (CLAUDE.md quy tắc 8). -->

## Rủi ro

## Vùng bảo vệ bị chạm

- [ ] `packages/core/execution/**` (cần test tích hợp staging)
- [ ] `packages/db/**` (migration, RLS)
- [ ] `infra/**`
- [ ] `packages/core/flags/**`
- [ ] `packages/core/connections/**` (token)
- [ ] Không chạm vùng bảo vệ

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` xanh (chạm DB: thêm `pnpm db:check`)
- [ ] Không log token, không trả token qua API
- [ ] Mọi truy vấn nghiệp vụ có `workspace_id`
- [ ] Chuỗi giao diện qua i18n (vi, en)
- [ ] Nợ kỹ thuật (nếu có) đã ghi vào `docs/tech-debt.md`
