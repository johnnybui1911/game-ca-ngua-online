# Cờ Cá Ngựa 3D Online

Game cờ cá ngựa 3D nhiều người chơi trên trình duyệt: chơi ngay với một cái tên hoặc đăng ký, đăng nhập (email, Google, Facebook, X), tạo phòng công khai hoặc riêng tư, chia sẻ link, mời người đang online, chơi với người hoặc CPU.

Trang chủ `/` mở công khai: bàn cờ 3D trong phòng khách đêm Tết chiếm toàn màn hình, máy tự chơi một ván minh hoạ, nút "Chơi ngay" ở giữa phía dưới. Mọi bước sau (nhập tên, sảnh, phòng chờ, đăng nhập, đăng ký) là tấm kính hiện trên cùng một bàn cờ, bàn không tải lại khi chuyển trang; vào ván thì camera bay về chỗ ngồi của mình. Máy không có GPU (trình duyệt dựng hình bằng phần mềm) chỉ thấy ảnh tĩnh của bàn cờ cho tới ván đầu tiên.

Chơi khách: người mới bấm "Chơi ngay" hoặc mở link phòng sẽ thấy tấm kính `/bat-dau` để nhập một cái tên là chơi, không cần email. Người chơi khách là một người dùng không có email và mật khẩu, tối đa 10 lần tạo khách mỗi địa chỉ mỗi giờ (`GUEST_LIMIT_PER_HOUR` ghi đè giá trị này, chỉ để chạy thử cục bộ) và khách không còn phiên nào hợp lệ sẽ bị dọn. Khi ván kết thúc, khách được mời lưu tài khoản bằng email hoặc nhà cung cấp ngay trong phòng và giữ nguyên tên, chỗ ngồi; sảnh luôn có lối "Lưu tài khoản" cho khách.

Trong phòng: mỗi quân có nhãn tên trên bàn cờ (mặc định là số 1–4), người chơi đặt tên cho quân màu của mình ở phòng chờ hoặc trong "Menu" khi đang chơi. Chủ phòng có thể tạm dừng/tiếp tục ván (người đang tới lượt giữ nguyên thời gian còn lại) và đóng phòng để huỷ ván. Trên điện thoại có thể bật "Lắc máy để đổ xúc xắc" (nút "Bật lắc để đổ" hoặc trong "Menu"; lựa chọn lưu trong trình duyệt, iOS hỏi quyền cảm biến mỗi lần vào trang); mỗi lần lắc đổ một lần.

Luật chơi: nút tròn "?" ở thanh trạng thái khi đang chơi, mục "Luật chơi" trong "Menu" và nút "Luật chơi" ở phòng chờ mở bảng luật (nội dung ở `shared/rules-text.ts`, có test so khớp với trang giới thiệu `gioi-thieu.html`). Mở bảng luật không làm dừng đồng hồ lượt; tới lượt mình thì đầu bảng hiện "Còn N giây".

Biểu cảm nhanh: người đã có chỗ ngồi bấm nút "Biểu cảm" (biểu tượng mặt cười) ở phòng chờ hoặc trong ván (kể cả khi tạm dừng) để gửi một trong 8 biểu cảm có sẵn; mọi người trong phòng thấy bong bóng cạnh chỗ ngồi của người gửi trong 3 giây, không có chữ tự do. Có thể ẩn biểu cảm của người khác bằng "Ẩn biểu cảm" (lưu trong trình duyệt, bong bóng của chính mình vẫn hiện). Danh sách cố định nằm ở `shared/emotes.ts`; `RoomDO` chỉ chuyển tiếp tin `emote` tới các kết nối đang mở, không ghi vào storage, không đổi `seq`, không phát lại khi kết nối lại, và giới hạn mỗi người dùng 3 biểu cảm liên tiếp rồi 1 biểu cảm mỗi 2 giây (`EMOTE_BURST`, `EMOTE_REFILL_PER_SEC` trong `worker/rooms/constants.ts`; vượt mức thì bị bỏ qua, không báo lỗi).

Độ khó máy: chủ phòng chọn "Độ khó máy" ở phòng chờ (Dễ / Thường / Khó, mặc định Thường); người khác trong phòng thấy mức đang chọn, ghế máy ghi "Máy · Khó" và huy hiệu trong ván ghi "Máy · Khó". Mức áp dụng cho mọi máy trong phòng, kể cả máy vào chơi thay người rời phòng giữa ván; người còn ngồi ghế nhưng hết giờ hoặc mất kết nối vẫn được máy đánh hộ ở mức Thường. Chỉ đổi được khi phòng đang chờ (sau ván, "Chơi lại" giữ nguyên mức). Dễ chơi nước của mức Thường 25% số lượt, còn lại chọn ngẫu nhiên một nước đi hợp lệ; ở ván thường Dễ không tự ý đá quân (kể cả lượt chơi như mức Thường): chỉ đá khi mọi nước đi đều đá; Thường ở ván thường ưu tiên vào chuồng đích, rồi xuất quân, rồi đá quân đã đi được ít nhất 42 ô, rồi quân đi xa nhất mà không đá ai (chỉ đá quân mới đi khi mọi nước đều đá), còn ở ván nhanh ưu tiên lên chuồng, đá quân, xuất quân, quân đi xa nhất; Khó chấm điểm từng nước (đá quân xa nhất, tránh bị đá, đặt quân sẵn sàng đá, không chiếm bậc thấp của đường về đích, nhường ô xuất quân) chỉ dựa trên vị trí công khai và nước đi hiện tại, không biết trước xúc xắc. Đo sức mạnh các mức bằng giả lập: `CPU_BENCH=1 npx vitest run shared/game/cpu-bench.test.ts --silent=false` (đặt `CPU_BENCH_GAMES` để đổi số ván mỗi cặp, mặc định 1000).

Âm thanh: nhạc nền ở trang chủ, các màn hình vào game, sảnh và phòng chờ, nhạc khác khi đang chơi, tiếng xúc xắc, tiếng vó ngựa theo từng ô quân đi (thêm tiếng va khi đá quân), và chuông báo khi tới lượt mình (thêm một lần khi còn 10 giây). Trình duyệt chỉ cho phát tiếng sau lần chạm đầu tiên, nên nhạc trang chủ bắt đầu (fade-in) ngay khi người chơi chạm vào màn hình. Tất cả được tổng hợp bằng Web Audio trong `web/src/audio/`, không có tệp âm thanh; bật/tắt nhạc và hiệu ứng ở nút loa góc dưới bên trái (hoặc "Menu" khi đang chơi), lựa chọn lưu trong trình duyệt.

Hoạt cảnh và chất lượng: "Hoạt cảnh: Đầy đủ / Giảm" trong "Cài đặt ván" ở phòng chờ và trong "Menu" khi đang chơi (lưu ở `ca-ngua:motion`, hệ điều hành bật "giảm chuyển động" cũng tính là Giảm) đổi nhảy từng ô, đá quân có khựng hình và camera lướt gần thành các bước trượt ngắn. Chất lượng hình (`high | medium | low`) tự chọn theo thiết bị rồi tự hạ khi khung hình tụt; ép mức bằng `?quality=low|medium|high`. Cú đá chạy như một pha highlight ở mức `high` và `medium`: ngựa đá bật cao, lắc từ phải sang trái rồi đá vào sườn ngựa kia, camera zoom cận vào pha va; ngựa bị đá khựng một nhịp, nhấc lên từ từ, rồi bị hất bay vòng cung cao với hai vòng xoay, camera zoom ra để thấy nó rơi về chuồng, có bụi, chớp sáng và tiếng gió vút (khoảng 1,5 giây ở nhịp Nhanh và Ván nhanh, 2,5–3 giây ở nhịp Vừa và Thư thả). Ở mức `low` hoặc khi dựng hình bằng phần mềm, cú đá chạy bản gọn như trước.

Production: <https://ca-ngua-online.johnny-bui1911.workers.dev>

## Kiến trúc

- `web/`: client React + react-three-fiber (Vite). `web/src/shell/` là khung ứng dụng (một canvas dùng chung cho mọi trang, trang chủ, tấm kính, góc logo/góp ý/âm thanh); `web/src/scene/` là bàn cờ 3D (`render/` ánh sáng, hậu kỳ và mức chất lượng, `environment/` phòng khách Tết, `motion/` hoạt cảnh); `web/src/demo/` là ván minh hoạ ở trang chủ; `web/src/room/` và `web/src/lobby/` là sảnh, phòng chờ và HUD; `web/src/ui/` là design system (token trong `web/src/styles/tokens.css`, font tự host trong `public/fonts/`, trang xem thử `design-preview.html` chỉ chạy ở dev).
- `gioi-thieu.html` + `web/src/landing/`: trang giới thiệu tĩnh tại `/gioi-thieu` (địa chỉ cũ `/co-ca-ngua-online` chuyển hướng 301 về đây) (luật, câu hỏi thường gặp, dữ liệu có cấu trúc cho Google), một entry Vite riêng không tải ứng dụng React hay three.js. Video hero, ảnh minh hoạ luật và `public/og-image.jpg` được chụp lại từ cảnh 3D bằng `node scripts/capture-landing-media.mjs`. `public/robots.txt` và `public/sitemap.xml` trỏ tới trang này.
- `worker/`: Cloudflare Worker (Hono). `worker/auth/` là tài khoản và OAuth trên D1; `worker/rooms/` là Durable Object cho từng phòng (`RoomDO`: ghế, luật, xúc xắc, CPU, hẹn giờ) và sảnh (`LobbyDO`: phòng công khai, người online, lời mời).
- `shared/`: mô hình bàn cờ, luật chơi (`shared/game/`) và hợp đồng HTTP/WebSocket (`shared/protocol.ts`) dùng chung cho client và server.
- `migrations/`: schema D1. `e2e/`: Playwright và máy chủ OAuth giả lập.

Luật chơi được mô tả tại `shared/game/types.ts`, gồm luật thường và biến thể "ván nhanh". Nội dung luật hiển thị trong phòng nằm ở `shared/rules-text.ts`.

### Cài đặt ván

Chủ phòng chọn ở phòng chờ (chỉ đổi được khi phòng đang chờ, giữ nguyên qua "chơi lại"); người khác thấy giá trị hiện tại ở dạng chỉ đọc.

- **Thời gian mỗi lượt**: 10, 15, 20, 30 (mặc định) hoặc 60 giây. Hết giờ, máy chủ chơi thay. Người chơi bị hết giờ 2 lượt liên tiếp thì chuyển sang chơi tự động ("Tự động"): máy chủ chơi thay họ cho tới khi họ bấm "Tôi đã quay lại" hoặc tự đổ xúc xắc, đi quân.
- **Ván nhanh** (luật biến thể N3): mỗi màu có sẵn 1 ngựa ở ô xuất phát; chuồng đích của một màu bị khóa cho tới khi màu đó đá được ít nhất 1 ngựa đối thủ (đá khi ra chuồng cũng tính); ngựa đầu tiên của bất kỳ màu nào lên chuồng thắng ngay. Các luật còn lại giữ nguyên. Ván nhanh cũng tự đi khi chỉ có một nước, và ở cùng một nhịp ván thì máy chủ cùng hoạt ảnh chạy nhanh hơn ván thường. Bật ván nhanh khi thời gian mỗi lượt còn 30 giây thì tự chọn 20 giây. Ván thường không đổi luật.
- **Nhịp ván**: Nhanh, Vừa (mặc định) hoặc Thư thả. Quyết định tung xúc xắc, từng bước nhảy, cú đá và khoảng nghỉ giữa hai lượt máy dài bao lâu; không đổi luật, độc lập với Ván nhanh. Phòng chờ ghi kèm thời lượng ước tính của ván theo số ghế (ví dụ Vừa, 4 người: khoảng 30–40 phút bàn cờ chạy, chưa kể thời gian suy nghĩ). Phòng tạo trước khi có cài đặt này và ván minh hoạ ở trang chủ chạy nhịp Vừa.
- **Tự đổ xúc xắc**: máy chủ đổ giúp người đến lượt sau 1,5 giây; không tính là bỏ lượt.
- **Luật** (luật thêm, mặc định bật): **Tung 1 hoặc 6 ba lần liên tiếp thì mất lượt**. Trong một lượt, lần tung 1 hoặc 6 thứ ba liên tiếp bị hủy: không đi được và lượt chuyển sang màu kế tiếp; các nước đi bằng hai lần tung trước vẫn giữ. Chủ phòng có thể tắt. Bảng luật trong phòng liệt kê luật thêm đang bật, và thanh điều khiển báo khi một người mất lượt vì luật này. Phòng tạo trước khi có cài đặt này cũng chơi với luật bật từ ván kế tiếp; ván đang chơi không đổi.
- **Thử nghiệm xúc xắc** (`DICE_SHAPING` trong `shared/experiments.ts`, đang bật; chỉ đổi trong code): máy chủ không cho máy ra cùng một số 1 hoặc 6 hai lần liền trong một lượt (6-1-6 vẫn được), và người chơi không còn ngựa trên đường đua mà hai lượt liền không ra 1 hoặc 6 thì lần tung đầu của lượt thứ ba chắc chắn ra 1 hoặc 6 (`worker/rooms/dice-shaping.ts`). Trong lúc bật, mục **Luật** bị ẩn ở phòng chờ và luật mất lượt tắt cho các ván mới. Không hiển thị cho người chơi.

Số liệu đo nhịp ván (số thao tác, commit, phút theo nhịp máy chủ) nằm ở `plans/20261121-turn-timer-quick-mode/plan.md`; chạy lại bằng `PACING_REPORT=1 npx vitest run shared/game/pacing.test.ts`.

Ba nhịp nằm trong một bảng duy nhất ở `shared/game/pace.ts` (`nhanh`, `vua`, `thu-thai`; mỗi nhịp có bảng riêng cho ván nhanh). Bàn cờ diễn hoạt theo nhịp của phòng, còn máy chủ chờ đúng thời lượng hoạt ảnh của lượt vừa rồi cộng một nhịp nghỉ trước khi chơi cho máy; đồng hồ lượt của người chơi cũng chỉ bắt đầu khi bàn cờ diễn xong lượt trước. Thời lượng ước tính lấy từ bảng `shared/game/pace-estimate.ts`; sửa số trong một nhịp thì `npm test` báo bảng ước tính cần cập nhật theo.


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

`scene-dev.html` (chỉ có khi chạy `npm run dev`) phát một ván toàn CPU để xem và chỉnh bàn cờ 3D; thêm `?level=easy|normal|hard` để xem các CPU chơi ở mức đó.

`scene-dev.html` cũng nhận `?pace=nhanh|vua|thu-thai` (nhịp ván của phòng thử, mặc định Vừa) và `?quick=1`; `?server=1` cho các CPU chơi đúng nhịp máy chủ (đổ và đi trong một lượt), `?paused=1` mở ở trạng thái tạm dừng.

## Deploy

```sh
npm run db:migrate:remote
npm run deploy
```

Đăng nhập mạng xã hội cần secret của từng nhà cung cấp: xem [docs/oauth-setup.md](docs/oauth-setup.md).

## Đo phễu người chơi

Worker đếm tổng theo ngày (UTC) vào bảng D1 `daily_events` (`day`, `event`, `source`, `n`), không lưu id, địa chỉ hay tên người chơi. Danh sách sự kiện và nguồn nằm ở `shared/analytics.ts`.

- Trình duyệt báo `visit` (mỗi tab một lần), `landing_view` (mỗi lần mở trang giới thiệu, theo nguồn của chính lần ghé đó) và `invite_shared` (sao chép hoặc chia sẻ link phòng) qua `POST /api/events`.
- Worker tự đếm `guest_started`, `signed_up` (đăng ký email), `account_saved` (khách lưu tài khoản), `room_created`; phòng đếm `match_started_solo` (1 người + máy), `match_started_group` (từ 2 người), `match_finished` với nguồn `-`; ván nhanh đếm thêm (không thay) `match_started_quick` và `match_finished_quick`, nên `match_started_solo + match_started_group` vẫn là tổng số ván bắt đầu; ván có ít nhất một ghế máy còn đếm `cpu_match_easy`, `cpu_match_normal` hoặc `cpu_match_hard` theo mức của phòng.
- Nguồn lấy từ `?utm_source=` của lần ghé đầu tiên (cookie `ca_src`, 30 ngày); link mời trong phòng tự gắn `utm_source=invite`. Nguồn ngoài danh sách thành `other`, không có thì là `direct`.

So tỉ lệ hoàn tất của ván nhanh với ván thường:

```sh
npx wrangler d1 execute DB --remote --command \
  "SELECT event, SUM(n) FROM daily_events WHERE event IN ('match_started_solo','match_started_group','match_finished','match_started_quick','match_finished_quick') GROUP BY event"
```

Xem số liệu production:

```sh
npx wrangler d1 execute DB --remote --command \
  "SELECT day, event, source, n FROM daily_events WHERE day >= date('now','-7 day') ORDER BY day, event, source"
```

## Góp ý của người chơi

`POST /api/feedback` (cùng origin, JSON) lưu góp ý vào bảng D1 `feedback`: loại (`idea`, `visual`, `rules`, `ui`, `bug`), nội dung 2–2000 ký tự (văn bản thuần), liên hệ (tuỳ chọn), mã phòng, đường dẫn, kích thước màn hình, trình duyệt, `user_id` khi đã đăng nhập (kể cả khách) và `client_key` (băm địa chỉ, không lưu IP). Mỗi máy gửi tối đa 5 góp ý / 10 phút và 30 / ngày, vượt thì trả 429. Kiểu dữ liệu dùng chung nằm ở `shared/feedback.ts`.

Đọc góp ý trên Cloudflare Dashboard: **Workers & Pages → D1 → `ca-ngua-online` → Tables → `feedback`** (tab Data).

Hoặc bằng dòng lệnh:

```sh
npx wrangler d1 execute DB --remote --command \
  "SELECT id, datetime(created_at/1000,'unixepoch') AS luc, category, message, contact, room_code, viewport FROM feedback ORDER BY id DESC LIMIT 50"
```

Production cần chạy `npm run db:migrate:remote` để có bảng `feedback` (bước deploy đã làm việc này). Cục bộ: `npm run db:migrate:local`, rồi thêm `--local` thay cho `--remote`.
