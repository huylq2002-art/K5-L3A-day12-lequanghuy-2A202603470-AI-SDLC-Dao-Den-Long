# Hướng dẫn cho tác nhân AI

- Đọc `game.contract.json` và hai hướng dẫn trong `.claude/skills/` trước khi thay đổi mô phỏng, CLI hoặc chuẩn bị bản phát hành.
- Hệ tọa độ tay phải, Y hướng lên, mặt đất Y=0, Mây mặc định xuất phát tại (0,0,0). `+X` là phải và `+Z` là tiến tại góc camera 0°. Khoảng cách gameplay dùng `Math.hypot(dx, dz) <= radius` trên XZ, không cộng bán kính nhân vật.
- Giới hạn độ dài input `(x, z)` về 1. Với `θ = cam_yaw_deg * Math.PI / 180`, dùng `x' = x * cos(θ) + z * sin(θ)` và `z' = -x * sin(θ) + z * cos(θ)`.
- Dựng scenario trước snapshot tick 0. Mô phỏng đúng 60 tick/giây. Với `k = 0..N-1`, đọc input tick `k`, tính trạng thái tick `k+1` và đóng dấu mọi sự kiện ở bước đó bằng `k+1`. `sim_tick` bằng `tick` ở Phase 1.
- Cấm phá vỡ Test Contract v1.0. Giữ nguyên tên cờ, schema, tick, trạng thái, tên sự kiện, cách làm tròn tọa độ và exit code. Tuning trong `src/core/config.ts` phải bằng `game.contract.json`.
- Để gameplay trong `src/core/`. Client chỉ gửi input và đọc state/sự kiện. Lõi không sử dụng DOM, đồng hồ hệ thống, WebGL, I/O hoặc RNG ngoài seed.
- Dùng `npm test` và quy trình trong `phase-delivery.md` trước khi bàn giao. Lệnh trong contract phải chạy được từ gốc repo trên Windows, macOS và Linux.
