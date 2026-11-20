# Hướng dẫn cho tác nhân AI

- Đọc `game.contract.json` và hai hướng dẫn trong `.claude/skills/` trước khi thay đổi mô phỏng, CLI hoặc chuẩn bị bản phát hành.
- Hệ tọa độ tay phải, Y hướng lên, `+X` là phải và `+Z` là tiến tại góc camera 0°. Tọa độ bản đồ trong `src/core/maps.js` là nguồn chung cho mô phỏng và đồ họa. Đêm 3 thêm tầng Y=3, Y=6, dốc và vách. Đom đóm/bùa và đòn chạm Bóng Mực kiểm tra cả XZ lẫn chênh cao. Pulse đo 3D từ chân Mây + 0,8 m.
- Giới hạn độ dài input `(x, z)` về 1. Với `θ = cam_yaw_deg * Math.PI / 180`, dùng `x' = x * cos(θ) + z * sin(θ)` và `z' = -x * sin(θ) + z * cos(θ)`.
- Dựng scenario trước snapshot tick 0, rồi ghi `night_start` tại tick 0. Với `k = 0..N-1`, đọc input tick `k`, tạo tick `k+1` và đóng dấu sự kiện bằng `k+1`. Pause giữ `sim_tick` và toàn bộ gameplay đứng yên trong khi `tick` tiếp tục tăng.
- Test Contract v1.3 giữ nguyên tuning, luật chơi và đầu ra headless v1.2. Thứ tự bắt buộc là input/pause → bộ đếm, trừ dầu gồm hút theo trạng thái đầu tick và tắt đèn cạn → di chuyển/rơi → nhặt → nạp/châm → vùng sáng → Pulse → AI di chuyển → cướp rồi đánh theo ID → sinh → kết quả → snapshot. Dầu nội bộ là số nguyên đơn vị `1/60`, làm tròn một chữ số ở biên xuất. Điều kiện vùng sáng và điểm đều dùng dầu nguyên. Tuning trong `src/core/config.ts` phải bằng `game.contract.json`.
- Để gameplay trong `src/core/`. Client chỉ gửi input và đọc state/sự kiện. Lõi không sử dụng DOM, đồng hồ hệ thống, WebGL, I/O hoặc RNG ngoài seed.
- Benchmark có entry riêng với đúng 200 Bóng Mực `wander`, 100 đom đóm và L1–L3 dầu đầy. Giữ các tính năng HUD và hiệu ứng trình bày Phase 4 ngoài phép đo. Soak dùng `stepGame` thật trong một tiến trình.
- Đối chiếu ADR và nhật ký Phase 3 trong `docs/notes/`. Dùng `npm test` và quy trình trong `phase-delivery.md` trước khi bàn giao. Lệnh hợp đồng chạy từ gốc repo trên Windows, macOS và Linux.
