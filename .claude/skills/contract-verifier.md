# Kiểm tra Test Contract v1.1

1. Đối chiếu từng khóa `tuning` với `src/core/config.ts` và chạy `npm test`.
2. Chạy `headless_cmd` cho `--night 1`, `2` và `3`. Parse từng dòng JSONL. Kiểm tra snapshot tick 0, `night_start`, snapshot định kỳ, `wind`, trạng thái và các mảng `motes`, `drifters`, `charms`, độ chính xác ba chữ số của vector và một dòng `end` cuối.
3. So sánh hai lượt cùng seed theo từng byte. Xác minh `tick` tăng khi `paused` và `sim_tick`, giờ, cooldown, TTL, gió cùng lịch sinh giữ nguyên. Đối chiếu thứ tự sự kiện và quy tắc mục tiêu mới chỉ tương tác được từ tick sau.
4. Kiểm tra exit code `0` cho giới hạn tick và kết thúc sớm. Dùng bad input, sai đêm, tick không tăng và kiểu không hợp lệ để kiểm tra stderr và mã `2`.
5. Chạy đủ 21.600 tick Đêm 3 ở cadence mặc định với scenario bảo đảm sống đến bình minh. Ghi thời gian thực tế và xác nhận dưới 30 giây.
