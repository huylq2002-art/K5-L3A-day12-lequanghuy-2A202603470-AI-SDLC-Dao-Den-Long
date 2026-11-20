# Kiểm tra trước khi bàn giao Phase 3

- Chạy `npm ci`, `npm test` và `npm run build` với Node phiên bản được hỗ trợ.
- Kiểm tra hết giờ với đủ hoặc thiếu đèn, cùng luồng qua ba đêm. Trong trình duyệt thử châm dầu, bộ đếm sức chứa, thanh dầu nhấp nháy, hình đèn tắt xẹp và rách, cùng lưu bảng màu dễ phân biệt qua lần tải trang.
- Đo FPS trung bình ở viewport 1280×720 trên bản build thường. Ghi trình duyệt, trình dựng WebGL, kích thước render và thời lượng lấy mẫu.
- Làm theo `contract-verifier.md`. Lưu log test và replay mẫu vào `docs/proof/phase-3/`. Giữ bằng chứng Phase 1–2 làm mốc hồi quy.
- Đối chiếu ADR, nhật ký triển khai, README và Breaking Changes trong CHANGELOG.
