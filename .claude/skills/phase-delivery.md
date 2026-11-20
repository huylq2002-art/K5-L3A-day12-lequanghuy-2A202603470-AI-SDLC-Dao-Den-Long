# Kiểm tra trước khi bàn giao Phase 4

- Chạy `npm ci`, `npm test` và `npm run build` với Node phiên bản được hỗ trợ.
- Kiểm tra qua ba đêm và thử lưu điểm trên cả màn thắng chiến dịch lẫn màn thua. Thử đổi phím, phím trùng, khôi phục, cảnh báo trực quan và giữ cài đặt qua lần tải lại.
- Làm theo `contract-verifier.md`. Lưu benchmark chuẩn, soak và log kiểm thử vào `docs/proof/phase-4/`.
- Tạo và giải nén gói ZIP. Chạy bản gói bằng Node với dữ liệu bảng xếp hạng riêng. Đối chiếu README, CHANGELOG, CREDITS, LICENSE và Retro trước khi chuẩn bị GitHub Release.
