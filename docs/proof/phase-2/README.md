# Bằng chứng Phase 2

Tái tạo các lệnh bên dưới từ tag `phase-2` với Test Contract v1.1.

| Tệp | Nội dung |
| --- | --- |
| `test.log` | Toàn bộ `npm test` trên Windows với Node.js 24.16.0. Cùng bộ test đạt với Node.js 22.18.0. |
| `browser.log` | Kiểm tra menu, cài đặt, ba bản đồ, Bình Minh và FPS trên bản build 1280×720. Với luồng thắng qua ba đêm, công cụ trình duyệt dùng scenario gần đèn cuối để kiểm tra chuyển cảnh. |
| `benchmark.log` | Đêm 3 với lịch sinh mặc định, đủ 21.600 tick và snapshot mỗi 10 tick. Scenario giữ Mây sống đến bình minh để đo trọn ván. |
| `night1.jsonl` | Lướt ra bờ, pause, mất cả túi khi rơi, hồi sinh, nhặt và thắp đèn cuối. |
| `night2.jsonl` | Bục nhảy Đảo Cau, Pulse, Bùa Gió, nhặt đom đóm và thắp đèn cuối. |
| `night3.jsonl` | Bục nhảy lên tầng 2, cảnh báo gió, pause và chu kỳ gió mạnh. |

```sh
npm test
npm run build
node tests/browser-phase-2.mjs
node src/cli/headless.js --seed 7 --night 1 --scenario tests/fixtures/phase-2/night1-scenario.json --inputs tests/fixtures/phase-2/night1-inputs.json --ticks 180 --out docs/proof/phase-2/night1.jsonl
node src/cli/headless.js --seed 7 --night 2 --scenario tests/fixtures/phase-2/night2-scenario.json --inputs tests/fixtures/phase-2/night2-inputs.json --ticks 120 --out docs/proof/phase-2/night2.jsonl
node src/cli/headless.js --seed 7 --night 3 --scenario tests/fixtures/phase-2/night3-scenario.json --inputs tests/fixtures/phase-2/night3-inputs.json --ticks 2220 --snapshot-every 60 --out docs/proof/phase-2/night3.jsonl
node src/cli/headless.js --seed 7 --night 3 --scenario tests/fixtures/phase-2/full-night-scenario.json --ticks 21600 --out full-night.jsonl
```

Đặt `DAO_DEN_LONG_CHROME` nếu Chrome được cài ở đường dẫn khác với mặc định của script. Script tạo ảnh kiểm tra cục bộ trong `.npm-cache/`. Phase 1 có thể tái tạo từ tag `phase-1`.
