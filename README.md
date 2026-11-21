# Cờ Cá Ngựa 3D Online

Game cờ cá ngựa 3D nhiều người chơi trên trình duyệt: chơi ngay với một cái tên hoặc đăng ký, đăng nhập (email, Google, Facebook, X), tạo phòng công khai hoặc riêng tư, chia sẻ link, mời người đang online, chơi với người hoặc CPU.

Chơi khách: người mới mở link phòng (hoặc trang chủ) sẽ vào màn hình `/bat-dau`, nhập một cái tên là chơi, không cần email. Người chơi khách là một người dùng không có email và mật khẩu, tối đa 10 lần tạo khách mỗi địa chỉ mỗi giờ (`GUEST_LIMIT_PER_HOUR` ghi đè giá trị này, chỉ để chạy thử cục bộ) và khách không còn phiên nào hợp lệ sẽ bị dọn. Khi ván kết thúc, khách được mời lưu tài khoản bằng email hoặc nhà cung cấp ngay trong phòng và giữ nguyên tên, chỗ ngồi; sảnh luôn có lối "Lưu tài khoản" cho khách.

Trong phòng: mỗi quân có nhãn tên trên bàn cờ (mặc định là số 1–4), người chơi đặt tên cho quân màu của mình ở phòng chờ hoặc trong "Menu" khi đang chơi. Chủ phòng có thể tạm dừng/tiếp tục ván (người đang tới lượt giữ nguyên thời gian còn lại) và đóng phòng để huỷ ván. Trên điện thoại có thể bật "Lắc máy để đổ xúc xắc" (nút "Bật lắc để đổ" hoặc trong "Menu"; lựa chọn lưu trong trình duyệt, iOS hỏi quyền cảm biến mỗi lần vào trang); mỗi lần lắc đổ một lần.

Biểu cảm nhanh: người đã có chỗ ngồi bấm "💬 Biểu cảm" ở phòng chờ hoặc trong ván (kể cả khi tạm dừng) để gửi một trong 8 biểu cảm có sẵn; mọi người trong phòng thấy bong bóng cạnh chỗ ngồi của người gửi trong 3 giây, không có chữ tự do. Có thể ẩn biểu cảm của người khác bằng "Ẩn biểu cảm" (lưu trong trình duyệt, bong bóng của chính mình vẫn hiện). Danh sách cố định nằm ở `shared/emotes.ts`; `RoomDO` chỉ chuyển tiếp tin `emote` tới các kết nối đang mở, không ghi vào storage, không đổi `seq`, không phát lại khi kết nối lại, và giới hạn mỗi người dùng 3 biểu cảm liên tiếp rồi 1 biểu cảm mỗi 2 giây (`EMOTE_BURST`, `EMOTE_REFILL_PER_SEC` trong `worker/rooms/constants.ts`; vượt mức thì bị bỏ qua, không báo lỗi).

Âm thanh: nhạc nền ở các màn hình vào game, sảnh và phòng chờ, nhạc khác khi đang chơi, tiếng xúc xắc, tiếng vó ngựa theo từng ô quân đi (thêm tiếng va khi đá quân), và chuông báo khi tới lượt mình (thêm một lần khi còn 10 giây). Tất cả được tổng hợp bằng Web Audio trong `web/src/audio/`, không có tệp âm thanh; bật/tắt nhạc và hiệu ứng ở nút loa (hoặc "Menu" khi đang chơi), lựa chọn lưu trong trình duyệt.

Production: <https://ca-ngua-online.johnny-bui1911.workers.dev>

## Kiến trúc

- `web/`: client React + react-three-fiber (Vite). `web/src/scene/` là bàn cờ 3D, `web/src/room/` và `web/src/lobby/` là sảnh, phòng chờ và HUD.
- `co-ca-ngua-online.html` + `web/src/landing/`: trang giới thiệu tĩnh tại `/co-ca-ngua-online` (luật, câu hỏi thường gặp, dữ liệu có cấu trúc cho Google), một entry Vite riêng không tải ứng dụng React. `public/robots.txt` và `public/sitemap.xml` trỏ tới trang này.
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

## Đo phễu người chơi

Worker đếm tổng theo ngày (UTC) vào bảng D1 `daily_events` (`day`, `event`, `source`, `n`), không lưu id, địa chỉ hay tên người chơi. Danh sách sự kiện và nguồn nằm ở `shared/analytics.ts`.

- Trình duyệt báo `visit` (mỗi tab một lần), `landing_view` (mỗi lần mở trang giới thiệu, theo nguồn của chính lần ghé đó) và `invite_shared` (sao chép hoặc chia sẻ link phòng) qua `POST /api/events`.
- Worker tự đếm `guest_started`, `signed_up` (đăng ký email), `account_saved` (khách lưu tài khoản), `room_created`; phòng đếm `match_started_solo` (1 người + máy), `match_started_group` (từ 2 người), `match_finished` với nguồn `-`.
- Nguồn lấy từ `?utm_source=` của lần ghé đầu tiên (cookie `ca_src`, 30 ngày); link mời trong phòng tự gắn `utm_source=invite`. Nguồn ngoài danh sách thành `other`, không có thì là `direct`.

Xem số liệu production:

```sh
npx wrangler d1 execute DB --remote --command \
  "SELECT day, event, source, n FROM daily_events WHERE day >= date('now','-7 day') ORDER BY day, event, source"
```
