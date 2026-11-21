# Cờ Cá Ngựa 3D Online

Game cờ cá ngựa 3D nhiều người chơi trên trình duyệt: chơi ngay với một cái tên hoặc đăng ký, đăng nhập (email, Google, Facebook, X), tạo phòng công khai hoặc riêng tư, chia sẻ link, mời người đang online, chơi với người hoặc CPU.

Chơi khách: người mới mở link phòng (hoặc trang chủ) sẽ vào màn hình `/bat-dau`, nhập một cái tên là chơi, không cần email. Người chơi khách là một người dùng không có email và mật khẩu, tối đa 10 lần tạo khách mỗi địa chỉ mỗi giờ (`GUEST_LIMIT_PER_HOUR` ghi đè giá trị này, chỉ để chạy thử cục bộ) và khách không còn phiên nào hợp lệ sẽ bị dọn. Khi ván kết thúc, khách được mời lưu tài khoản bằng email hoặc nhà cung cấp ngay trong phòng và giữ nguyên tên, chỗ ngồi; sảnh luôn có lối "Lưu tài khoản" cho khách.

Production: <https://ca-ngua-online.johnny-bui1911.workers.dev>

## Kiến trúc

- `web/`: client React + react-three-fiber (Vite). `web/src/scene/` là bàn cờ 3D, `web/src/room/` và `web/src/lobby/` là sảnh, phòng chờ và HUD.
- `worker/`: Cloudflare Worker (Hono). `worker/auth/` là tài khoản và OAuth trên D1; `worker/rooms/` là Durable Object cho từng phòng (`RoomDO`: ghế, luật, xúc xắc, CPU, hẹn giờ) và sảnh (`LobbyDO`: phòng công khai, người online, lời mời).
- `shared/`: mô hình bàn cờ, luật chơi (`shared/game/`) và hợp đồng HTTP/WebSocket (`shared/protocol.ts`) dùng chung cho client và server.
- `migrations/`: schema D1. `e2e/`: Playwright và máy chủ OAuth giả lập.

Luật chơi được mô tả tại `shared/game/types.ts`.

## Phát triển

Cần Node 22.

```sh
npm ci
npm run db:migrate:local   # tạo D1 cục bộ
npm run dev                # http://127.0.0.1:5173 (client + worker + Durable Objects)
```

Kiểm tra:

```sh
npm run typecheck
npm test                   # vitest: luật chơi, auth, trạng thái phòng, layout bàn cờ
npm run e2e                # Playwright, tự khởi động server ở cổng 5173 (và OAuth giả lập ở 5199)
```

`scene-dev.html` (chỉ có khi chạy `npm run dev`) phát một ván toàn CPU để xem và chỉnh bàn cờ 3D.

## Deploy

```sh
npm run db:migrate:remote
npm run deploy
```

Đăng nhập mạng xã hội cần secret của từng nhà cung cấp: xem [docs/oauth-setup.md](docs/oauth-setup.md).
