# Bằng chứng Phase 3

Tái tạo các lệnh bên dưới từ tag `phase-3` với Test Contract v1.2.

- `test.log` ghi kết quả `npm test`.
- `browser.log` ghi kết quả chơi thử trong Chrome. Script kiểm tra luồng đến bình minh qua ba đêm, châm dầu, sức chứa và lưu bảng màu dễ phân biệt.
- `oil-at-dawn.jsonl` ghi Đêm 1 từ scenario hai giây. L3 cạn dầu trước lần tương tác đầu. Mây châm dầu L1, nhặt đom đóm để thắp lại L3 và thắng ở tick 120. S2 hút L2 suốt hai giây và phát hai sự kiện theo cadence 60 tick.

```sh
npm test
npm run build
node tests/browser-phase-3.mjs
node src/cli/headless.js --seed 23 --night 1 --scenario tests/fixtures/phase-3/scenario.json --inputs tests/fixtures/phase-3/inputs.json --ticks 180 --out docs/proof/phase-3/oil-at-dawn.jsonl
```

Đặt `DAO_DEN_LONG_CHROME` nếu trình duyệt ở đường dẫn khác với mặc định. Script trình duyệt lưu ảnh kiểm tra cục bộ trong `.npm-cache/`. Các lượt Phase 1 và 2 có thể tái tạo ở tag tương ứng.
