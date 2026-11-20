# Retro · Đảo Đèn Lồng v1.0.0

## Đánh giá qua bốn phase

**Phase 1.** Tách mô phỏng 60 Hz khỏi Three.js mang lại lợi ích lớn nhất. Một scenario nhỏ chạy được bằng Node và tái hiện cùng kết quả với cùng seed. Codex dựng sớm cú pháp CLI, fixture và HUD, nên có thể kiểm tra input, tọa độ và thứ tự sự kiện trước khi cảnh 3D hoàn thiện. Trên Windows, Vite từng cố theo dõi tệp Cookies đang khóa trong cache kiểm thử Chrome. Log khởi động giúp xác định đường dẫn. Thêm cache vào danh sách bỏ qua của watcher, rồi kiểm tra lại đúng `run_cmd`. Kết quả xử lý được nguyên nhân mà game vẫn dùng cập nhật nóng cho mã nguồn.

**Phase 2.** Dùng một bảng dữ liệu địa hình cho mô phỏng và đồ họa giúp kiểm tra cầu, dốc và bục nhảy mà không đoán từ ảnh. Test hai phía của cầu và cả quỹ đạo phóng phát hiện các giả định sai về thời điểm đáp và vận tốc ngang. Một test ban đầu giả định Mây đã chạm đất sau 120 tick ở Đảo Chuông, trong khi vết trạng thái cho thấy Mây vẫn đang rơi ở `Y≈1,44`. Sửa thời điểm đo và giữ kiểm tra độ cao ở giữa quỹ đạo. Lượt đo đầu tiên cũng chỉ đạt 9 FPS vì chạy SwiftShader. Cần kiểm tra mã backend thay vì quy kết toàn bộ chênh lệch cho cảnh game. Sau tối ưu thứ tự vẽ và vật liệu, Chromium dùng Intel UHD đạt 144 FPS trong lượt đo thường. Hai lượt cho thấy báo cáo hiệu năng cần ghi cả cấu hình trình dựng hình.

**Phase 3.** ADR dành riêng cho dầu nguyên là tài liệu quan trọng nhất của change request. Khi đổi qua nhịp giảm dầu ở bước 2, `30.0` hiển thị có thể che mất chênh 1 đơn vị nội bộ. Test ngưỡng kiểm tra cả số nguyên và số đã làm tròn, cùng trường hợp đèn cạn được thắp lại trong một tick. Bộ test v1.1 ban đầu báo lỗi vì schema, thời lượng, điểm và điều kiện thắng đã thay đổi. Cập nhật từng kỳ vọng có lý do. Một fixture Pulse từng cho Mây quá ít đom đóm sau khi châm, nên nó chưa đi tới nhánh thưởng cho Bóng Mực đang hút. Điều chỉnh đầu vào để cả hai thao tác thực sự xảy ra trong tick. Replay hai giây sau đó chứng minh trạng thái dầu, lịch hút, thắp lại và kết thúc tại bình minh.

**Phase 4.** Dùng lại renderer trong một entry benchmark riêng để tăng số thực thể mà vẫn giữ ánh sáng của bản chơi. Đo đủ 30 giây và lưu thông tin backend, thời gian khởi động và RSS lấy mẫu. Chromium với sandbox lồng trên máy Windows này từng ngắt DevTools lúc khởi động. CLI thử lại phiên loopback với hồ sơ tạm và ghi rõ cấu hình. Soak tạo, chơi và hủy ván trong một tiến trình. Test so kết quả theo seed, còn RSS được đo riêng. API và CLI cùng đọc tệp điểm trên đĩa, nên có thể kiểm tra tính bền vững qua hai phiên máy chủ. Lần tạo ZIP đầu sai tên tệp giấy phép của Vite. Lượt build và giải nén tiếp theo kiểm tra được cả giấy phép và chạy máy chủ từ gói đã giải nén.

## Harness và cách tiết kiệm lượt làm việc

`AGENTS.md` hữu ích nhất cho những luật dễ hiểu sai như hệ tọa độ, thứ tự tick, pause và giới hạn nơi đặt logic. Giữ quy tắc ổn định ở đây và đưa thông số chi tiết vào contract hoặc ADR để tránh lặp tài liệu. Skill `contract-verifier` nối schema, exit code, replay và benchmark thành chuỗi kiểm tra có thể lặp lại. Skill `phase-delivery` bao phủ những việc unit test khó phát hiện như cài đặt qua tải lại, browser backend và mở gói phát hành. Fixture JSONL từ phase đã ổn định là lớp phòng thủ mạnh nhất cho TICKET-04 vì thay đổi UI và công cụ có thể được kiểm tra bằng một phép so byte.

Nếu làm lại, tôi sẽ chốt schema và các ca tại biên trước khi dựng cả màn chơi, nhất là pause ở tick sinh, thời điểm đạt ngưỡng dầu và tiêu chí kết thúc. Tôi sẽ đưa script mở gói ZIP, kiểm tra cỡ chữ và đo bằng Chromium vào harness từ khi làm menu, đồng thời ghi GPU, DPR và cờ browser ngay trong log. Có thể giảm token bằng cách yêu cầu một thay đổi theo từng lát có test, in phần đầu và cuối replay khi chẩn đoán, giữ fixture ngắn, và chỉ nạp đoạn mã đang sửa. Các quyết định có ảnh hưởng đến contract nên nằm trong một ADR có ví dụ thực thi được.

## Ước tính dùng AI

| Phase | Input ước tính | Output ước tính |
| --- | ---: | ---: |
| 1 | 17.000 | 27.500 |
| 2 | 28.000 | 38.000 |
| 3 | 17.000 | 21.000 |
| 4 | 24.000 | 32.000 |
| **Tổng** | **86.000** | **118.500** |

Tổng khoảng **204.500 token**. Với đơn giá giả định dùng trong ghi chép Phase 1 là 2 USD/triệu token input và 12 USD/triệu token output, chi phí ước tính **1,59 USD**. Đây là ước tính quy đổi dựa trên yêu cầu, mã và log kiểm thử. Số liệu hóa đơn và tỷ lệ cache thực tế không có trong bản Retro.
