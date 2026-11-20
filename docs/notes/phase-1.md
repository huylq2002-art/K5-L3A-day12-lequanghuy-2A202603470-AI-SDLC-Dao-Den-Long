# Ghi chép Phase 1 · Đêm 1 – Đảo Bến

## Quyết định cho các phần PRD-0 để mở

| Hạng mục | Quyết định triển khai |
| --- | --- |
| Đảo | Bán kính 36 m. Chặn chuyển động tại mép đảo. Không có sự kiện `fall` trong Phase 1. Cây, bến và mái đình là cảnh trí. |
| Nhặt và nạp ánh sáng | Nhặt mọi đom đóm trong bán kính theo thứ tự danh sách. `E` nạp tối đa số ánh sáng đèn còn thiếu vào đèn chưa sáng gần nhất. Nếu bằng khoảng cách, ưu tiên đèn có ID nhỏ hơn. Có thể nạp từng phần. |
| Đom đóm mặc định | 53 đom đóm được tạo theo seed khi dựng ván mặc định. Các dải đom đóm dẫn tới cả năm đèn. Mảng `motes` trong scenario thay thế các vị trí ban đầu, kể cả mảng rỗng. Đom đóm rơi khi trúng đòn vẫn sinh trong lúc chơi. |
| Bóng Mực | Mặc định sinh con đầu sau 18 giây, sau đó thử sinh mỗi 30 giây, tối đa 6. Shade do scenario khai báo có trạng thái `chase` tại tick 0. `random_shades: false` tắt các đợt sinh tự động. |
| Vùng an toàn | Bóng Mực lách quanh vùng sáng và được đẩy ra nếu đứng trong vùng khi đèn vừa sáng. Pulse dịch chuyển theo hướng ra xa Mây, giới hạn bởi bờ đảo và vùng sáng. |
| Trúng đòn và Pulse | Mất 1 ngọn lửa, rơi `floor(carried × hit_drop_ratio)` đom đóm, bất tử 90 tick. Pulse hợp lệ tốn 2 ánh sáng, kể cả khi không có mục tiêu. Choáng 120 tick, hồi chiêu 180 tick. Nhảy không thay đổi các tầm tương tác XZ. |
| Thứ tự trong tick | Di chuyển/nhảy → nhặt → nạp → cập nhật vùng sáng, xét thắng → sinh shade → Pulse → shade đuổi và gây sát thương → xét thua. Trong tick cuối, thắp đèn thứ năm được tính trước bình minh hoặc va chạm. Nếu đã hết máu hoặc giờ ngay tại setup, lượt đầu chỉ phát kết quả. |
| Điểm | +10 mỗi lần nhặt, +200 mỗi lần thắp, +500 khi thắng. Điểm tại snapshot tick 0 luôn bằng 0, kể cả đèn đã sáng trong scenario. |
| Replay | PRD cung cấp tên cờ input và quy tắc tick. README ghi schema input đã chọn, cách giữ trục/yaw giữa các bản ghi và cách phát lệnh một lần. Snapshot chỉ được ghi ở các bội của chu kỳ. Khi ván kết thúc giữa hai mốc, dòng `end` lưu tick cuối. |
| Camera và âm thanh | Giao diện đổi dấu trục Z khi đưa tọa độ sang Three.js để chiều phải trên màn hình khớp công thức yaw. Camera, hạt, ánh sáng và âm thanh chỉ đọc mô phỏng. Ẩn tab tạm ngừng chạy tick. Trình duyệt mở Web Audio sau tương tác đầu tiên. |

## Nhật ký sử dụng AI

| Bước | Prompt và thao tác | Token ước tính |
| --- | --- | ---: |
| Thiết lập | Yêu cầu “Hãy đóng vai Senior Game & Software Engineer”, thiết lập Harness AI và xây hoàn chỉnh Phase 1 theo PRD-0 và Test Contract v1.0. Đọc repo, quy ước AGENTS và thiết lập lệnh dự án. | 3.000 input / 2.500 output |
| Triển khai | Tiếp nối cùng prompt. Viết lõi 60 Hz, CLI JSONL, shader và mô hình Three.js, điều khiển, HUD và Web Audio. | 7.000 input / 16.000 output |
| Xác minh | Tiếp nối yêu cầu tự chạy `npm test` và kiểm tra CLI. Kiểm tra build, replay, lệnh vận hành và chạy thử Chrome headless. | 7.000 input / 9.000 output |

Tổng ước tính khoảng 17.000 token input và 27.500 token output. Với đơn giá minh họa 2 USD/triệu token input và 12 USD/triệu token output, chi phí quy đổi khoảng **0,36 USD**. Đây là phép ước tính theo đơn giá giả định. Phiên làm việc không cung cấp số token hoặc chi phí hóa đơn thực tế.
