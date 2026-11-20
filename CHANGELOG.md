# Changelog

## 3.0.0 · Phase 3 — Đèn cạn dầu

### Breaking Changes từ Test Contract v1.1 lên v1.2

- Thời lượng ba đêm đổi thành 240 / 270 / 300 giây. Bỏ kết thúc sớm `all_lit`. Chiến thắng `dawn_survived` chỉ xảy ra ở bình minh nếu còn Ngọn Lửa và đang sáng ít nhất 3 / 4 / 5 đèn tương ứng từng đêm.
- Đèn có dầu, có thể cạn rồi tắt, châm bằng đom đóm và thắp lại với giá 5. Vùng an toàn chỉ tồn tại từ 30 dầu trở lên. Bóng Mực có trạng thái `drain` và có thể hút dầu đồng thời.
- Sức chứa đom đóm tăng từ 10 đến 20 theo số lần thắp. Điểm nạp giảm còn 5 mỗi con, thắp lại được 40 điểm và Pulse trúng Bóng Mực đang hút dầu được 15 điểm. Thưởng bình minh dựa vào đèn còn sáng, dầu và Ngọn Lửa còn lại.
- Snapshot thêm `player.capacity` và `lanterns[].{fuel,ever_lit,relit_count}`. Scenario thêm bộ đếm thắp đèn, nhiên liệu, lịch sử đèn và mục tiêu hút của Bóng Mực. Thêm `refuel`, `lantern_out`, `fuel_drain` và trường `relight` cho `lantern_lit`.

### Giao diện

- Thêm thanh dầu 3D, nhấp nháy đèn yếu, vỏ giấy xẹp và rách khi tắt. HUD hiển thị sức chứa hiện tại và số đèn cần giữ sáng.
- Thêm tùy chọn lưu bền vững **Bảng màu dễ phân biệt** với viền và mắt Bóng Mực màu xanh lam và cảnh báo trắng có biểu tượng.

## 2.0.0 · Phase 2 — Ba hòn đảo

- Chuỗi Đảo Bến, Đảo Cau và Đảo Chuông với giới thiệu, kết quả từng đêm và tổng điểm Bình Minh.
- Thêm Lướt, rơi và hồi sinh, cầu tre, bục nhảy, địa hình ba tầng, gió mạnh, Gió Lạc và Bùa Gió.
- Chuẩn hóa thứ tự mô phỏng 60 Hz và nâng Test Contract lên v1.1 với pause, ba bản đồ và snapshot mở rộng.
- Thêm menu, cài đặt lưu cục bộ, nhạc nền, hướng dẫn tìm đèn và HUD hồi chiêu.

## 1.0.0 · Phase 1

- Đêm 1 – Đảo Bến với năm đèn lồng lớn, đom đóm, Mây và Bóng Mực.
- Lõi mô phỏng theo seed chạy 60 tick/giây, dùng chung cho trình duyệt và CLI Test Contract v1.0.
- Giao diện Three.js, camera xoay, bản đồ nhỏ, HUD, âm thanh tổng hợp và chơi lại.
- Harness AI, kiểm thử Node.js và bằng chứng replay Phase 1.
