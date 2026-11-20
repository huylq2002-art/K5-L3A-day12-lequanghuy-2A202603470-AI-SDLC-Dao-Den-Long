# Kiểm tra Test Contract v1.0

1. Đối chiếu từng khóa `tuning` với `src/core/config.ts` và chạy `npm test`.
2. Chạy `headless_cmd` trong `game.contract.json` với seed, scenario và inputs mẫu. Parse riêng từng dòng JSONL. Xác nhận snapshot tick 0, tick định kỳ, `sim_tick`, tọa độ tối đa ba chữ số thập phân, tên và payload sự kiện, một dòng `end` cuối cùng.
3. Chạy lại cùng tham số và so sánh từng byte, kể cả ID tự sinh. Kiểm tra exit code `0` cho cả giới hạn tick lẫn kết thúc sớm.
4. Thử JSON lỗi, tick lặp hoặc giảm, sai kiểu và cờ CLI lỗi. Xác nhận thông báo trên stderr và exit code `2`.
