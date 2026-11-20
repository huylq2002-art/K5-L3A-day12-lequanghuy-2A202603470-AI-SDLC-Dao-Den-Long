# Bằng chứng Phase 4 · Bình minh

| Tệp | Nội dung |
| --- | --- |
| `test.log` | Kết quả unit, integration và hồi quy headless. |
| `bench.json` | Đo thực tế với seed 42, 3 giây khởi động và 30 giây đo, ở 1280×720 với DPR 1. |
| `soak.json` | 10 đêm trong một tiến trình, seed 7–16, báo cáo RSS và kết quả từng đêm. |
| `browser.log` | Chạy Chrome với bản production và các scenario kiểm tra UI, lưu điểm và cài đặt. |
| `compatibility.log` | So byte với tag `phase-3` trên cả ba đêm và chạy các lệnh từ bản nguồn cài mới. |
| `release.log` | Build, kiểm tra ZIP, khởi động từ thư mục đã giải nén và xuất bảng xếp hạng. |

```sh
npm test
npm run build
node src/cli/bench.js --seed 42 --duration 30 --out docs/proof/phase-4/bench.json
node --expose-gc src/cli/soak.js --seed 7 --nights 10 --out docs/proof/phase-4/soak.json
node tests/browser-phase-4.mjs
npm run release
```

`bench.json` thu khung hình từ Chromium chạy Three.js/WebGL 2 trên Intel UHD. RSS là working set lấy mẫu từ các tiến trình Chromium. Trên môi trường kiểm thử Windows hiện tại, CLI đã phải thử lại bước khởi tạo Chromium với hồ sơ tạm. `load_ms` bao gồm cả thời gian khởi tạo đó. Lượt soak được đo riêng trên Node.
