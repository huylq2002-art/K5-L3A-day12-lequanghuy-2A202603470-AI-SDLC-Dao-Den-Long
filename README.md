# Đảo Đèn Lồng

**Phase 2 · Ba hòn đảo**

Theo Mây và lời Ông Đăng qua Đảo Bến, Đảo Cau và Đảo Chuông. Gom đom đóm, thắp hết đèn của từng đêm và mang tổng điểm đến Bình Minh. Đảo Cau có cầu tre và bục nhảy sang bờ kia. Đảo Chuông có ba tầng, dốc dẫn lên vành đá và những cơn gió mạnh.

## Cài và chơi

Dùng Node.js 22.18+ thuộc dòng 22, hoặc 24 trở lên, cùng npm và trình duyệt hỗ trợ WebGL 2.

```sh
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173/` hoặc địa chỉ Vite in ra. `npm run build` tạo bản tĩnh trong `dist/`.

| Phím | Hành động |
| --- | --- |
| `WASD` hoặc mũi tên | Di chuyển theo hướng camera. Đến gần đom đóm và bùa để tự nhặt. |
| `Space` | Nhảy khi chạm đất. |
| `Shift` | Lướt theo hướng di chuyển hoặc hướng Mây đang nhìn. |
| `E` | Nạp đèn chưa sáng gần nhất. Mỗi đèn cần 10 đom đóm. |
| `F` | Tỏa Sáng, tốn 3 đom đóm. Làm choáng Bóng Mực và có thể buộc Gió Lạc thả đồ. |
| `Q` / `R`, kéo chuột | Xoay camera. Cuộn để đổi khoảng cách. |
| `Esc` / `P` | Tạm dừng hoặc tiếp tục. Menu tạm dừng có chơi lại, cài đặt và quay về menu chính. |

Túi chứa 10 đom đóm. Mỗi đêm bắt đầu với ba Ngọn Lửa. Bóng Mực gây mất một Ngọn Lửa và làm rơi một nửa đom đóm. Rơi xuống biển mây làm mất một Ngọn Lửa và toàn bộ đom đóm đang mang. Bùa Gió tăng tốc và bỏ hồi chiêu Lướt trong 10 giây. Âm lượng và độ nhạy chuột được lưu trong trình duyệt.

| Cách tính điểm trong đêm | Điểm |
| --- | ---: |
| Mỗi đom đóm nạp vào đèn | +10 |
| Mỗi đèn thắp sáng | +100 |
| Mỗi Bóng Mực trúng một lần Tỏa Sáng | +5 |
| Thắng đêm | `floor(giây còn) × 2 + Ngọn Lửa còn lại × 50` |

Điểm chiến dịch cộng từ các Đêm đã thắng. Một đêm thua có thể chơi lại và giữ điểm của các đêm đã thắng trước đó.

## Test Contract v1.1

```sh
npm test
node src/cli/headless.js --seed 7 --night 3 --ticks 2160 --snapshot-every 60 --out replay.jsonl
```

`--night` nhận `1`, `2`, `3`. `--seed`, `--night`, `--ticks` và `--out` là bắt buộc. `--scenario`, `--inputs` và `--snapshot-every` là tùy chọn. Snapshot mặc định mỗi 10 tick. Thư mục chứa tệp đầu ra cần tồn tại. Lệnh thành công trả mã `0`, đầu vào sai trả mã `2` và báo lỗi qua stderr.

Input là mảng bản ghi có `tick` nguyên, không âm và tăng nghiêm ngặt, hoặc đối tượng `{ "inputs": [...] }`. `[x,z]` và `{x,z}` được chấp nhận trong `move`. `x`/`z` hay `move_x`/`move_z` cũng hợp lệ. Trục di chuyển và yaw giữ nguyên đến khi cập nhật. `jump`, `interact` và `pulse` được ghi tại tick cần bấm. `dash` và `pause` bắt đầu khi chuyển từ `false` sang `true`. Một tick thiếu trường nút được xem là `false`.

```json
[
  { "tick": 0, "move": [0, 1], "cam_yaw_deg": 90, "dash": true },
  { "tick": 12, "move": [0, 0], "pause": true },
  { "tick": 40, "pause": true }
]
```

CLI dựng scenario và ghi snapshot tick 0 trước `night_start`. Bản ghi tick `k` tạo trạng thái và sự kiện ở tick `k+1`. Khi pause, `tick` tiếp tục tăng và `sim_tick` đứng yên. Dòng cuối mỗi lượt hợp lệ là `end`.

- [Hợp đồng và tuning](game.contract.json)
- [Spec và tiêu chí chấp nhận](docs/notes/ticket-02-spec.md)
- [Giả định triển khai](docs/notes/phase-2.md)
- [Bằng chứng kiểm thử và ba replay](docs/proof/phase-2/README.md)
