# Đảo Đèn Lồng

**Phase 3 · Đèn cạn dầu**

Theo Mây và lời Ông Đăng qua Đảo Bến, Đảo Cau và Đảo Chuông. Gom đom đóm, thắp đèn và châm dầu để giữ đủ ánh sáng đến Bình Minh. Đảo Cau có cầu tre và bục nhảy sang bờ kia. Đảo Chuông có ba tầng, dốc dẫn lên vành đá và những cơn gió mạnh.

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
| `E` | Nạp hoặc châm dầu cho đèn nhận được đom đóm gần nhất. Thắp lần đầu cần 10 đom đóm, thắp lại cần 5, châm dầu thêm 10 nhiên liệu mỗi con. |
| `F` | Tỏa Sáng, tốn 3 đom đóm. Làm choáng Bóng Mực và có thể buộc Gió Lạc thả đồ. |
| `Q` / `R`, kéo chuột | Xoay camera. Cuộn để đổi khoảng cách. |
| `Esc` / `P` | Tạm dừng hoặc tiếp tục. Menu tạm dừng có chơi lại, cài đặt và quay về menu chính. |

Mây bắt đầu mỗi đêm với ba Ngọn Lửa và sức chứa 10 đom đóm. Mỗi lần thắp đèn hoặc thắp lại tăng sức chứa thêm 2, tối đa 20. Bóng Mực làm mất một Ngọn Lửa và làm rơi một nửa đom đóm khi đánh trúng Mây. Rơi xuống biển mây làm mất một Ngọn Lửa và cả túi. Bùa Gió tăng tốc và bỏ hồi chiêu Lướt trong 10 giây. Âm lượng, độ nhạy chuột và **Bảng màu dễ phân biệt** được lưu trong trình duyệt.

Đèn cháy hao 1 dầu mỗi giây. Đèn dưới 30 dầu nhấp nháy, mất vùng an toàn và có thể bị Bóng Mực hút thêm 5 dầu mỗi giây mỗi con. Để thắng, Mây phải còn Ngọn Lửa khi bình minh đến và giữ đủ số đèn sáng.

| Đêm | Thời gian | Đèn cần giữ sáng |
| --- | ---: | ---: |
| 1 · Đảo Bến | 04:00 | 3 / 5 |
| 2 · Đảo Cau | 04:30 | 4 / 6 |
| 3 · Đảo Chuông | 05:00 | 5 / 7 |

| Cách tính điểm trong đêm | Điểm |
| --- | ---: |
| Mỗi đom đóm nạp hoặc dùng để châm dầu | +5 |
| Thắp lần đầu / thắp lại | +100 / +40 |
| Mỗi Bóng Mực trúng Tỏa Sáng | +5, hoặc tổng +15 nếu đang hút dầu trước tick |
| Thắng đêm | `50 + floor(dầu còn lại)` mỗi đèn đang sáng và `+50` mỗi Ngọn Lửa còn lại |

Điểm chiến dịch cộng từ các Đêm đã thắng. Một đêm thua có thể chơi lại và giữ điểm của các đêm đã thắng trước đó.

## Test Contract v1.2

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

Scenario hỗ trợ `player.successful_lights`, đèn `{lit, fuel, ever_lit}` và Bóng Mực `{state: "drain", target_lantern_id: "L1"}`. Snapshot xuất `player.capacity` và `fuel`, `ever_lit`, `relit_count` cho từng đèn. `fuel` là số JSON làm tròn tới một chữ số thập phân. Ba lý do kết thúc là `dawn_survived`, `dawn` và `no_flames`.

- [Hợp đồng và tuning](game.contract.json)
- [ADR về dầu đèn và sinh tồn đến bình minh](docs/notes/adr-001-lantern-fuel-and-dawn-survival.md)
- [Nhật ký triển khai Phase 3](docs/notes/phase-3.md)
- [Bằng chứng kiểm thử và replay](docs/proof/phase-3/README.md)
