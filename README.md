# Đảo Đèn Lồng

**Phase 1 · Đêm 1 – Đảo Bến**

Theo dấu đom đóm, mang ánh sáng đến năm chiếc đèn lồng lớn và thắp sáng đảo trước bình minh. Đèn đã thắp tạo vùng an toàn. Khi Bóng Mực áp sát, Mây có thể dùng ánh sáng đang mang để đẩy lùi chúng.

## Cài và chơi

Dùng Node.js 22.18+ thuộc dòng 22, hoặc 24 trở lên, cùng npm. Các lệnh chạy từ thư mục gốc trên Windows, macOS và Linux. Trình duyệt cần WebGL 2.

```sh
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173/`. Nếu cổng bận, dùng địa chỉ Vite in ra. Chạy `npm run build` để tạo bản phát hành tĩnh trong `dist/`.

## Điều khiển

| Phím | Hành động |
| --- | --- |
| `WASD` hoặc phím mũi tên | Di chuyển theo hướng camera. Đi gần đom đóm để tự nhặt. |
| `Space` | Nhảy. |
| `E` | Nạp ánh sáng vào đèn chưa sáng gần nhất. Mỗi đèn cần 5 ánh sáng và có thể nạp nhiều lần. |
| `F` | Tỏa sáng, tốn 2 ánh sáng. Đẩy lùi và làm choáng Bóng Mực trong phạm vi 6 m. Hồi chiêu 3 giây. |
| `Q` / `R`, kéo chuột | Xoay camera. Cuộn để đổi khoảng cách. |
| **Chơi lại** | Khởi động lại Đêm 1. |

Mây bắt đầu với 3 ngọn lửa và 5 phút. Chạm Bóng Mực làm mất 1 ngọn lửa và rơi một nửa ánh sáng đang mang, làm tròn xuống. Thắp đủ năm đèn để thắng. Hết ngọn lửa hoặc đến bình minh khi đảo chưa sáng là thua.

| Sự kiện | Điểm |
| --- | ---: |
| Nhặt một đom đóm | +10 |
| Thắp một đèn lồng lớn | +200 |
| Thắng Đêm 1 | +500 |

## Kiểm thử và CLI

```sh
npm test
node src/cli/headless.js --seed 7 --night 1 --scenario tests/fixtures/scenario.json --inputs tests/fixtures/inputs.json --ticks 240 --out docs/proof/phase-1/sample.jsonl
```

`--seed`, `--night 1`, `--ticks` và `--out` là bắt buộc. `--scenario` và `--inputs` là tùy chọn. Dùng `--snapshot-every` để đổi chu kỳ snapshot, mặc định 10 tick. Thư mục chứa tệp `--out` cần tồn tại. CLI trả mã `0` khi chạy đủ số tick hoặc kết thúc ván và mã `2` kèm lỗi trên stderr khi tham số hoặc dữ liệu đầu vào sai.

Input là mảng JSON, hoặc đối tượng có khóa `inputs` chứa mảng. `tick` là số nguyên không âm tăng nghiêm ngặt. Ví dụ, bản ghi `{"tick":0,"move":[0,1],"cam_yaw_deg":90}` cho Mây đi theo `+X` từ bước đầu tiên. `move` nhận `[x,z]` hoặc `{"x":0,"z":1}`. Có thể dùng `x`/`z` hoặc `move_x`/`move_z` thay cho `move`. Trục di chuyển và yaw giữ giá trị tới khi được cập nhật. Các trường boolean `jump`, `interact` và `pulse` chỉ kích hoạt tại tick của bản ghi.

Mỗi dòng đầu ra là một đối tượng JSON. Snapshot ban đầu nằm tại tick 0. Sau đó CLI ghi sự kiện với tick của trạng thái mới, tiếp theo là snapshot nếu đến chu kỳ. Dòng cuối cùng luôn là `end` khi chạy thành công.

- [`game.contract.json`](game.contract.json) chứa lệnh chuẩn và toàn bộ tuning.
- [`docs/notes/phase-1.md`](docs/notes/phase-1.md) ghi các quy tắc bổ sung và nhật ký AI.
- [`docs/proof/phase-1/`](docs/proof/phase-1/) lưu kết quả kiểm thử và replay mẫu.
