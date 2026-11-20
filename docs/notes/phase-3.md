# Nhật ký Phase 3 · Đèn cạn dầu

1. Đối chiếu TICKET-03 với thứ tự tick Phase 2 và đưa vòng đời đèn vào `src/core/lanterns.js`. Chuyển trường dầu scenario sang đơn vị `1/60` bằng làm tròn tới đơn vị nguyên gần nhất. Đèn `lit: true` mặc định đầy, được ghi là từng sáng và giữ bộ đếm thắp của người chơi ở giá trị kịch bản hoặc 0.
2. Thêm trạng thái hút, tiêu hao theo từng con và đẩy lùi khi vùng sáng phục hồi. Bóng Mực `wander` đã ở trong 2 m của đèn yếu bắt đầu hút. Các con đang trên đường vẫn có thể phát hiện Mây theo ngưỡng Phase 2. Trong `drain`, ngưỡng chuyển sang `chase` là 6 m. Khi mất mục tiêu hút, kết thúc tick ở `wander` rồi tìm mục tiêu trong tick kế tiếp. Nếu đèn cạn đúng tick báo hút, `fuel_drain` báo số dầu 0 trước `lantern_out`.
3. Nối dữ liệu lõi vào Three.js, HUD và điều kiện kết thúc ba đêm. Vỏ giấy đèn tắt xẹp 20% theo trục Y, có vết rách, thanh dầu chỉ xuất hiện khi đèn sáng. Nhấp nháy 1 Hz theo thời gian mô phỏng. Bảng màu dễ phân biệt dùng xanh `#00B3FF` cho mắt và viền, trắng `#FFFFFF` cùng `⚠` cho cảnh báo và lưu chung với âm lượng, độ nhạy.
4. Mở rộng schema và trình kiểm tra JSONL. Vì hao dầu chạy trước `E`, đèn đầy khi bắt đầu tick có thể nhận một đom đóm sau khi đã hao 1 đơn vị nguyên. Chọn đèn dựa trên mức dầu chính xác tại bước 5, kể cả khi HUD làm tròn thành `100.0`.

## Các test cũ được cập nhật

| Test Phase 2 | Điều chỉnh cho TICKET-03 |
| --- | --- |
| Snapshot v1.1 và tuning ba đêm | Kiểm tra schema v1.2, sức chứa, lịch sử/dầu đèn, trạng thái hút và thời lượng 240 / 270 / 300 giây. |
| Điểm nạp, thứ tự sự kiện và thưởng thắng | Kiểm tra 5 điểm mỗi đom đóm, payout mới và `relight`. Thêm ca mất Ngọn Lửa ở tick bình minh cùng đèn cạn trước tương tác. |
| Thắp đủ đèn thắng sớm | Thay bằng xác nhận vẫn chơi khi sáng hết đèn, sau đó thắng ở đúng tick bình minh khi đạt ngưỡng. |
| Đo trọn Đêm 3 trong 21.600 tick | Chạy đủ 18.000 tick với thời hạn 300 giây. |
| Trình duyệt chuyển đêm ngay sau khi nhấn E | Sau khi thắp đèn cuối, tiếp tục mô phỏng đến bình minh. Thêm kiểm tra bảng màu qua tải lại trang, cảnh báo, châm dầu và sức chứa. |

Các ca di chuyển, rơi, pause, địa hình, lịch sinh, gió, Gió Lạc và bùa tiếp tục chạy trong bộ test. Bổ sung kiểm tra hao dầu đến tick 6000, hút đồng thời, thay đổi vùng an toàn ở ngưỡng 30, châm dầu, thắp lại, sức chứa tối đa và ba lý do kết thúc. Codex dùng TICKET-03 và các lượt replay/kiểm thử để đối chiếu mã với đặc tả.
