# Ghi chép Phase 2

## Các quyết định ở phần đặc tả để mở

- Điểm xuất phát Đảo Chuông là `(0,6,-3.5)` trên đỉnh, phía nam tháp chuông. Góc bản đồ dùng `(r cos θ, y, r sin θ)`, tương ứng các dốc 30° và 150° nằm trên nửa `z > 0`. Bề mặt tầng 0 vẫn có thể dùng khi scenario đặt nhân vật dưới một tầng cao hơn.
- Gia tốc ngang là `tốc độ tối đa / 0,1 giây`. Thời gian cất bước và dừng tính ở tốc độ chạy đầy đủ. Bục nhảy giữ vector phóng ngang qua dash cho tới khi tiếp đất. Dash lấy hướng input đang yêu cầu nếu có, sau đó xét vận tốc ngang và hướng nhìn khi đứng yên.
- Tâm một Bóng Mực hoặc Gió Lạc là `pos` trong scenario và snapshot. Ngưỡng phát hiện và vùng sáng dùng XZ. Tương tác đèn và chạm Gió Lạc dùng XZ theo Ticket-02. Pulse tính bán kính hình cầu.
- Bóng Mực bắt đầu tự sinh ở `spawning` tại tick 300 và bắt đầu được tương tác từ tick sau. Shade chỉ định trong scenario mặc định ở `chase`. Bóng Mực lượn theo hướng sinh từ seed và đổi hướng khi gặp chặn. Các đường đẩy chạm mép sớm dừng tại vật cản.
- Vị trí sương của Gió Lạc là một vòng điểm quanh bờ từng đảo. Gió Lạc được giữ ở snapshot với trạng thái `removed` trong tick biến mất. Tick mô phỏng kế tiếp dọn thực thể. Hướng trốn khóa ở thời điểm bắt đầu chạy trốn.
- Trần số lượng áp dụng cho lần sinh đom đóm theo lịch. Các đom đóm rơi bắt buộc vẫn được tạo đầy đủ. Tọa độ chuẩn hóa tối đa ba chữ số. `ttl_s` là `null` với đom đóm không hết hạn và là số giây với đom đóm rơi. Mảng scenario `motes` vẫn nhận `[x,y,z]`, hoặc `{id?, pos, kind?, ttl_ticks?}` để kiểm thử TTL.
- Scenario `drifters` nhận `{id?, pos, state?, stolen?, state_ticks_left?}` và `charms` nhận `{id?, pos?, available?, respawn_ticks?}`. Có thể bỏ tọa độ bùa nếu dùng ID chuẩn. Danh sách rỗng thay thế cả danh sách gốc. Các cờ ngẫu nhiên điều khiển lịch về sau.
- `night_start` theo sau snapshot tick 0. Tick `resumed` thực hiện đủ bước gameplay. `sim_tick` điều khiển cả lịch sinh và báo gió. Mỗi cơn gió dùng PRNG riêng dựa trên seed, được chọn trước khi bắt đầu 120 tick. Trong thời gian báo gió, `wind.active` vẫn là `false` nhưng snapshot đã có `dir_deg`.
- Điểm `end` là điểm đêm hiện tại. Tổng điểm chiến dịch được ghi một lần mỗi khi thắng và giữ trong phiên chơi. Âm lượng và độ nhạy chuột được lưu giữa các lần tải trang.

## Nhật ký AI

Codex dùng yêu cầu TICKET-02 của người dùng để cập nhật sơ đồ ba đêm, thứ tự tick, mô phỏng, CLI, Three.js và kiểm thử. Tiếp đó dùng kết quả test, replay JSONL và Chrome ở 1280×720 để hiệu chỉnh chuyển động, ánh sáng và hiệu năng. Số token và chi phí hóa đơn thực tế không có trong dữ liệu dự án.
