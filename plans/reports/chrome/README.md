# Creator badge + feedback: evidence

Screenshots (headless Chromium, 1440x900 and 390x844): `home`, `match` (4-player, 3 CPU), `match-menu`
(holds "Góp ý"), `modal`, `match-modal`, `error` (429), `success`.

End-to-end submit against `npx vite --port 5188` with local D1 (`wrangler d1 execute DB --local`):

```
SELECT id, category, substr(message,1,34) message, contact, room_code, path, viewport FROM feedback ORDER BY id
10 visual  Bàn cờ đẹp quá, mong có thêm hiệu   minh@example.vn  -        /           1440x900
11 bug     Góp ý từ trong ván đấu: thử gửi kè  -                YX4HP9   /r/YX4HP9   1440x900
12 visual  Bàn cờ đẹp quá, mong có thêm hiệu   minh@example.vn  -        /           390x844
13 bug     Góp ý từ trong ván đấu: thử gửi kè  -                4ZB3AB   /r/4ZB3AB   390x844
```
