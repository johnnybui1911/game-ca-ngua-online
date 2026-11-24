# Bộ ảnh và video quảng cáo (24/11)

- `slides.html`: 10 slide (1080×1350 ×9, 1600×900 ×1). Render: `mkdir -p ads/exports && node ads/scripts/render-slides.mjs <đường dẫn tuyệt đối tới ads> [s1,s2,...]`.
- `raw/`: ảnh chụp từ bản live (production) bằng `scripts/screens.mjs`, `extra.mjs`, `kickwin.mjs`, `settings3.mjs` (Playwright, cần GPU). Tên người chơi trong ảnh: Johnny (chủ phòng), Nam (người xin vào).
- `logo/`: logo (ngựa vàng trên nền đỏ). `co-ca-ngua-mark.svg` là bản gốc.
- `video/`: HyperFrames 1080×1920, 21 giây, không tiếng. Render: `cd ads/video && npx -y hyperframes@0.8.77 render . --strict --output ./ca-ngua-ban-moi-1080x1920.mp4`.
- Ảnh xuất ra đặt ở `../creatives/social/ads-*.jpg`.
