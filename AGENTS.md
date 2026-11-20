# Hướng dẫn cho tác nhân AI

- Đọc `game.contract.json` và hai hướng dẫn trong `.claude/skills/` trước khi thay đổi mô phỏng, CLI hoặc chuẩn bị bản phát hành.
- Hệ tọa độ tay phải, Y hướng lên, `+X` là phải và `+Z` là tiến tại góc camera 0°. Tọa độ bản đồ trong `src/core/maps.js` là nguồn chung cho mô phỏng và đồ họa. Đêm 3 thêm tầng Y=3, Y=6, dốc và vách. Đom đóm/bùa và đòn chạm Bóng Mực kiểm tra cả XZ lẫn chênh cao. Pulse đo 3D từ chân Mây + 0,8 m.
- Giới hạn độ dài input `(x, z)` về 1. Với `θ = cam_yaw_deg * Math.PI / 180`, dùng `x' = x * cos(θ) + z * sin(θ)` và `z' = -x * sin(θ) + z * cos(θ)`.
- Dựng scenario trước snapshot tick 0, rồi ghi `night_start` tại tick 0. Với `k = 0..N-1`, đọc input tick `k`, tạo tick `k+1` và đóng dấu sự kiện bằng `k+1`. Pause giữ `sim_tick` và toàn bộ gameplay đứng yên trong khi `tick` tiếp tục tăng.
- Giữ Test Contract v1.1 và duy trì hồi quy Đêm 1 với tuning mới. Thứ tự bắt buộc là input/pause → bộ đếm → di chuyển/rơi → nhặt → nạp → vùng sáng → Pulse → AI di chuyển → cướp rồi đánh theo ID → sinh → kết quả → snapshot. Tuning trong `src/core/config.ts` phải bằng `game.contract.json`.
- Để gameplay trong `src/core/`. Client chỉ gửi input và đọc state/sự kiện. Lõi không sử dụng DOM, đồng hồ hệ thống, WebGL, I/O hoặc RNG ngoài seed.
- Đối chiếu tiêu chí trong `docs/notes/ticket-02-spec.md`. Dùng `npm test` và quy trình trong `phase-delivery.md` trước khi bàn giao. Lệnh hợp đồng chạy từ gốc repo trên Windows, macOS và Linux.
