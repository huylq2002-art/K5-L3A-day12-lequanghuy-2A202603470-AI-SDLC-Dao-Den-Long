# Kiểm tra Test Contract v1.2

1. Đối chiếu từng khóa `tuning` với `src/core/config.ts` và chạy `npm test`.
2. Chạy `headless_cmd` cho `--night 1`, `2` và `3`. Parse từng dòng JSONL. Kiểm tra snapshot tick 0, `night_start`, `capacity`, `ever_lit`, `relit_count`, dầu làm tròn một chữ số, vector ba chữ số và một dòng `end` cuối. Kiểm tra cả `refuel`, `lantern_out`, `fuel_drain` và `lantern_lit.relight`.
3. So sánh hai lượt cùng seed theo từng byte. Xác minh khi pause, `tick` tăng và `sim_tick`, dầu, bộ đếm hút, giờ, cooldown, TTL, gió và lịch sinh đứng yên. Kiểm tra đèn cạn tắt trước tương tác, Pulse lấy điểm theo trạng thái đầu tick và bình minh dùng dầu sau mọi cập nhật.
4. Kiểm tra exit code `0` cho giới hạn tick và kết thúc sớm. Dùng bad input, sai đêm, tick không tăng và kiểu không hợp lệ để kiểm tra stderr và mã `2`.
5. Chạy đủ 18.000 tick Đêm 3 với snapshot mặc định và scenario bảo đảm sống đến bình minh. Kiểm tra `dawn_survived`, `dawn` và ưu tiên `no_flames`.
