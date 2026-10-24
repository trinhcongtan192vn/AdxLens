-- Bộ đếm đăng nhập sai: không có policy; chỉ role chủ bảng (service) đọc/ghi.
alter table app.auth_throttle enable row level security;
