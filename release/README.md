# Đảo Đèn Lồng v1.0.0

Giải nén, mở terminal tại thư mục `dao-den-long-v1.0.0` và dùng Node.js 22.18+ thuộc dòng 22 hoặc Node.js 24+.

```sh
node src/cli/run.js
```

Mở `http://127.0.0.1:5173/` trong trình duyệt hỗ trợ WebGL 2. Có thể đổi cổng với `--port 8080`. Bảng xếp hạng được tạo tại `data/leaderboard.json` khi lưu điểm. Dùng lệnh dưới đây để xuất bảng.

```sh
node src/cli/run.js --export-leaderboard out.json
```
