# Bằng chứng Phase 1

- `test.log` ghi đầu ra `npm test` trên Windows với Node.js 24.16.0. Bộ test cũng đạt trên Windows với Node.js 22.18.0.
- `browser-smoke.log` ghi lượt chạy bản build trong Chrome headless với WebGL 2 trên Windows.
- `sample.jsonl` ghi lượt replay từ hai fixture trong `tests/fixtures/`. Mây dùng Pulse, nhặt năm đom đóm và thắp đèn cuối cùng ở tick 66, kết thúc với 750 điểm.

Đã kiểm tra `npm ci`, `npm run build`, `npm run dev` và CLI trên Windows. Môi trường kiểm thử hiện có chỉ chạy Windows.

```sh
npm test
npm run build
node src/cli/headless.js --seed 7 --night 1 --scenario tests/fixtures/scenario.json --inputs tests/fixtures/inputs.json --ticks 240 --out docs/proof/phase-1/sample.jsonl
```
