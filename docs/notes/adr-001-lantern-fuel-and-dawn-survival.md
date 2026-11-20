# ADR 001 · Dầu đèn và sinh tồn tới bình minh

**Trạng thái** Đã áp dụng trong TICKET-03 và Test Contract v1.2.

## Bối cảnh

Phase 2 dùng cờ `lit` và kết thúc ngay khi tất cả đèn sáng. TICKET-03 yêu cầu đèn có thể tắt, giữ lịch sử thắp và đánh giá lượng ánh sáng còn lại đúng tick bình minh. CLI và trình duyệt cần dùng cùng trạng thái để replay theo seed.

## Quyết định

Mỗi đèn giữ `lit`, `fuelUnits`, `deposited`, `everLit` và `relitCount`. Một `fuelUnits` bằng `1/60` dầu. Đèn đầy có 6000 đơn vị, hao tự nhiên 1 đơn vị mỗi tick, mỗi Bóng Mực hút thêm 5 và mỗi đom đóm nạp thêm 600. Nhánh tương tác dùng số nguyên để tính số đom đóm phải dùng, giới hạn 6000 và tính mức 1800 đơn vị cho vùng an toàn. Snapshot, payload sự kiện liên quan đến dầu và HUD xuất tới một chữ số thập phân. Tính điểm lấy phần nguyên của dầu từ trạng thái nội bộ. Cách này cho phép phân biệt một đèn thực sự còn 30 dầu với một đèn thấp hơn nhưng hiển thị `30.0`.

Ở bước 2, gom mọi Bóng Mực đã ở `drain` với mục tiêu hợp lệ, trừ tổng hao hụt và phát sự kiện định kỳ cho từng con. Đèn cạn tắt cùng bước, giữ `everLit` và xóa tiến độ nạp. Đèn vừa tắt có thể nhận đom đóm để thắp lại ở bước 5 của cùng tick. Hút dầu bắt đầu được trừ từ tick sau khi Bóng Mực đến nơi và vào `drain` ở bước 8. `fuel_drain` tính mỗi 60 tick đã thực sự hút của phiên liên tục, sau khi cộng hao hụt. Pause giữ nguyên dầu và phiên hút.

Bước 6 xác định vùng an toàn theo dầu sau tương tác. Nếu một vùng vừa phục hồi, Bóng Mực bên trong bắt đầu bị đẩy ra và tạm dừng sát thương. Một lượt đẩy đã bắt đầu hoàn tất trong 30 tick, kể cả khi vùng sáng lại mất trước khi kết thúc. Điểm Pulse dùng trạng thái đầu tick để thao tác châm dầu ở bước 5 vẫn giữ đúng thưởng nếu Bóng Mực đang hút từ đầu tick.

Bước 11 xét `no_flames` trước. Khi đồng hồ xuống 0, đếm đèn còn cháy sau mọi cập nhật. Ngưỡng để thắng là `ceil(0.6 × số đèn)` và đèn ít dầu vẫn tính nếu còn cháy. Lõi cộng thưởng theo đèn, phần nguyên của dầu và Ngọn Lửa còn lại. Bộ đếm số lần tự thắp dùng để tính sức chứa và bắt đầu lại từ 0 ở đêm tiếp theo.

## Hệ quả

Replay v1.1 có thể cho thời điểm kết thúc, điểm và sự kiện khác khi chạy trên v1.2 dù dùng chung dữ liệu. Giữ bằng chứng cũ tại các tag tương ứng. Client chỉ đọc trạng thái từ lõi để chọn hình vỏ đèn, thanh dầu, ánh sáng, vùng an toàn, cảnh báo và sức chứa.
