# Kiểm tra trước khi bàn giao Phase 2

- Chạy `npm ci`, `npm test` và `npm run build` với Node phiên bản được hỗ trợ.
- Kiểm tra menu → giới thiệu → chơi → kết quả → đêm sau → Bình Minh. Thử Esc/P, chơi lại đêm, về menu và việc lưu cài đặt qua lần tải trang. Kiểm tra cả ba bản đồ, HUD, mũi chỉ đèn, cảnh báo gió, âm thanh và hiệu ứng lướt.
- Đo FPS trung bình ở viewport 1280×720 trên bản build thường. Ghi trình duyệt, trình dựng WebGL, kích thước render và thời lượng lấy mẫu.
- Làm theo `contract-verifier.md`. Lưu log test, ba replay và lệnh tái tạo vào `docs/proof/phase-2/`. Giữ bằng chứng Phase 1 làm mốc hồi quy.
- Đối chiếu spec, README, CHANGELOG và ghi chép giả định. Đưa cập nhật AGENTS và kỹ năng vào commit Phase 2 để có lịch sử.
