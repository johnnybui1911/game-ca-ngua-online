# Bật đăng nhập Google, Facebook và X

Code của cả ba luồng đã chạy trên production. Mỗi nút chỉ hoạt động khi deployment có đủ Client ID và Client Secret của nhà cung cấp đó; khi chưa có, nút hiện "(chưa cấu hình)".

Địa chỉ production: `https://ca-ngua-online.johnny-bui1911.workers.dev`

Không dán secret vào chat, issue hay file trong repo. Lệnh `wrangler secret put` hỏi giá trị trong terminal và lưu thẳng lên Cloudflare. Secret có hiệu lực ngay, không cần deploy lại.

## Google

1. Vào <https://console.cloud.google.com/apis/credentials>, tạo project nếu chưa có.
2. Cấu hình "OAuth consent screen": loại External, điền tên app và email hỗ trợ, rồi chuyển sang trạng thái "In production" để người ngoài đăng nhập được.
3. "Create credentials" → "OAuth client ID" → loại "Web application".
4. Authorized redirect URI:
   `https://ca-ngua-online.johnny-bui1911.workers.dev/api/auth/oauth/google/callback`
5. Lưu secret:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

## Facebook

1. Vào <https://developers.facebook.com/apps>, tạo app với use case "Authenticate and request data from users with Facebook Login".
2. Trong "Facebook Login" → "Settings", thêm Valid OAuth Redirect URI:
   `https://ca-ngua-online.johnny-bui1911.workers.dev/api/auth/oauth/facebook/callback`
3. Quyền cần dùng: `public_profile` và `email`.
4. Ở chế độ Development chỉ admin và tester của app đăng nhập được. Để mọi người đăng nhập, chuyển app sang Live; Facebook yêu cầu một URL chính sách quyền riêng tư (repo này chưa có trang đó).
5. Lấy App ID và App Secret ở "App settings" → "Basic", rồi lưu:

```sh
npx wrangler secret put FACEBOOK_CLIENT_ID
npx wrangler secret put FACEBOOK_CLIENT_SECRET
```

## X

1. Vào <https://developer.x.com/en/portal/dashboard>, tạo project và app (gói Free là đủ).
2. Trong "User authentication settings": bật OAuth 2.0, loại app "Web App" (confidential client), quyền Read.
3. Callback URI:
   `https://ca-ngua-online.johnny-bui1911.workers.dev/api/auth/oauth/x/callback`
   Website URL: `https://ca-ngua-online.johnny-bui1911.workers.dev`
4. Lấy "OAuth 2.0 Client ID" và "Client Secret" (không phải API Key), rồi lưu:

```sh
npx wrangler secret put X_CLIENT_ID
npx wrangler secret put X_CLIENT_SECRET
```

## Kiểm tra

```sh
curl -s https://ca-ngua-online.johnny-bui1911.workers.dev/api/auth/me
```

Trường `providers` trả `true` cho nhà cung cấp đã có đủ hai secret. Sau đó mở trang đăng nhập và bấm nút tương ứng.

## Hành vi cần biết

- Tài khoản Google có email đã xác minh trùng với một tài khoản email/mật khẩu sẵn có sẽ được gắn vào tài khoản đó. Facebook và X luôn tạo tài khoản riêng.
- X không trả email, nên tài khoản tạo qua X không có email.
- Đổi tên miền thì phải cập nhật redirect URI ở cả ba nhà cung cấp.
