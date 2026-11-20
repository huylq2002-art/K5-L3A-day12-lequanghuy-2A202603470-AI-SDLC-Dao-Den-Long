# Đảo Đèn Lồng

**v1.0.0 · Phase 4 — Bình minh**

**Video demo** [Dành chỗ cho liên kết video]

Theo Mây và lời Ông Đăng qua Đảo Bến, Đảo Cau và Đảo Chuông. Gom đom đóm, thắp đèn và châm dầu để giữ đủ ánh sáng đến Bình Minh. Đảo Cau có cầu tre và bục nhảy sang bờ kia. Đảo Chuông có ba tầng, dốc dẫn lên vành đá và những cơn gió mạnh.

## Cài và chơi

Dùng Node.js 22.18+ thuộc dòng 22, hoặc 24 trở lên, cùng npm và trình duyệt hỗ trợ WebGL 2.

```sh
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173/` hoặc địa chỉ Vite in ra. `npm run build` tạo bản tĩnh trong `dist/`. `npm start` phục vụ bản production trên loopback và tự build nếu cần.

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

Trong **Cài đặt**, có thể đổi chín phím chơi, xem thông báo phím trùng và khôi phục mặc định. **Giảm chuyển động** tắt rung camera, chớp toàn màn hình và nhấp nháy đồng hồ. **Chữ lớn** tăng cỡ chữ ×1,25 từ cỡ cơ sở 18 px. Chỉ báo xuất hiện khi Bóng Mực mới sinh, gió sắp tới, còn 10 giây hoặc đèn yếu dầu.

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

## Test Contract v1.3

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

## Benchmark và soak

```sh
node src/cli/bench.js --seed 42 --duration 30 --out bench.json
node --expose-gc src/cli/soak.js --seed 7 --nights 10 --out soak.json
```

Benchmark cần Chrome, Edge hoặc Chromium cài sẵn. Đặt `DAO_DEN_LONG_CHROME` nếu chương trình ở đường dẫn khác. Cảnh Đêm 1 chạy ở viewport 1280×720, DPR 1, với camera quay một vòng mỗi 15 giây. Sau 3 giây khởi động, công cụ đo các khoảng giữa hai khung hình hoàn tất trong cửa sổ `--duration`. p95 dùng nearest-rank. `load_ms` tính từ lúc tiến trình Node bắt đầu, bao gồm khởi tạo Chromium và build tự động nếu thiếu `dist/`.

Công cụ gửi cả `--disable-frame-rate-limit` và `--disable-gpu-vsync`. `vsync_off` là `true` khi DevTools xác nhận cả hai cờ trong tiến trình Chromium. Đây là xác nhận cấu hình, còn FPS thực tế phụ thuộc trình dựng và nền tảng. Khi Chromium không khởi động được trong sandbox lồng trên Windows, công cụ thử lại tiến trình benchmark loopback với hồ sơ tạm và `--no-sandbox`. [Cờ Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/components/viz/common/switches.cc) · [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-getBrowserCommandLine)

`peak_mem_mb` là RSS/working set cộng theo các PID Chromium, lấy mẫu mỗi giây và báo theo MiB. Giá trị `null` kèm giải thích trên stderr nếu hệ thống không cung cấp số đo. RSS tổng có thể tính lặp các trang được chia sẻ giữa tiến trình. Soak đo RSS của một tiến trình Node sau khi dựng đêm đầu và sau khi giải phóng đêm cuối. Lệnh báo mã `1` nếu có crash hoặc RSS cuối vượt 120% RSS đầu. [Chrome DevTools SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getProcessInfo)

## Bảng xếp hạng và bản phát hành

Lưu điểm sau Bình Minh hoặc sau khi thua. Tên dài 3–12 ký tự `[A-Za-z0-9_]`. Bảng giữ 10 điểm cao nhất và xếp người đạt sớm hơn trước khi bằng điểm. Cả dev, production và CLI dùng `data/leaderboard.json`. Có thể ghi đè đường dẫn bằng `DAO_DEN_LONG_LEADERBOARD`.

```sh
node src/cli/run.js --export-leaderboard out.json
npm run release
```

Gói `release/dao-den-long-v1.0.0.zip` có bản đã build và máy chủ Node cục bộ. Sau khi giải nén, chạy `node src/cli/run.js` tại gốc gói. `node tests/browser-phase-4.mjs` kiểm tra trình duyệt sau khi build, dùng dữ liệu bảng xếp hạng riêng trong `.npm-cache/`.

- [Hợp đồng và tuning](game.contract.json)
- [ADR về dầu đèn và sinh tồn đến bình minh](docs/notes/adr-001-lantern-fuel-and-dawn-survival.md)
- [Nhật ký triển khai Phase 3](docs/notes/phase-3.md)
- [Retro bốn phase](docs/notes/retro.md)
- [Bằng chứng phát hành](docs/proof/phase-4/README.md)
