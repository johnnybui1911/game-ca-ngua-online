# Feature Comparison: UI/UX 3D game — chess.tqd.me vs Cờ Cá Ngựa 3D

## Source: https://chess.tqd.me/ (Cờ Tướng 3D — closed source, chỉ có bundle production)
## Local Project: game-ca-ngua-online (React 19 + R3F 9 + drei 10 + three 0.187, Cloudflare Workers/D1)
## Mode: `--compare` (báo cáo, chưa lập plan implement)

---

## 0. Source manifest

| Mục | Giá trị |
| --- | --- |
| URL | https://chess.tqd.me/ (lang `vi`, PWA standalone, theme `#080a0f`) |
| Bundle phân tích | `/assets/index-Dsp46te_.js` (1.45 MB), `/assets/index-D3U3yto6.css` (36 KB), `manifest.webmanifest` — snapshot 2026-11-21 |
| Repo / license | Không có repo công khai. **Không có license → không được copy code, model GLB, logo, texture.** Chỉ học nguyên lý thiết kế và tự dựng lại. |
| Cách lấy bằng chứng | Đọc bundle tĩnh + chụp Chromium headless 1440×900 và 390×844 (mobile). Không chạy code của source ngoài trang web. |
| Giới hạn | Headless không quay được hoạt cảnh ăn quân (click theo toạ độ bị lệch khi camera đang lật). Phần animation chiến đấu bên dưới lấy từ hằng số trong bundle `window.wizardChess.ATTACK_SYNC_PROFILES` / `LOCOMOTION_GAIT_PROFILES`, **chưa thấy tận mắt** [INFERENCE]. |

---

## 1. Source anatomy — vì sao trang đó trông "thật", không giống AI làm

### 1.1 Không gian 3D (cung điện / thánh đường)

Quan sát (camera Toàn Cảnh, ẩn UI bằng `H`): bàn cờ đặt trên **đài đen viền vàng** giữa một **sảnh đá kiểu gothic** — cột đá chạm khía, cửa sổ hoa hồng, cửa vòm, cổng tam giác vàng sau bàn, cột obelisk đen có chóp kim cương vàng, **2 lò lửa (brazier) hai bên bàn** cháy thật.

Kỹ thuật (từ bundle, vanilla three.js, không dùng R3F):

| Lớp | Cách làm | Giá trị cụ thể |
| --- | --- | --- |
| Model | GLB nén gzip + meshopt + KTX2 (basis), tải `./assets/glb/<name>.glb.gz` | Kiến trúc + quân cờ là model thật, có `AnimationMixer` (quân có skeleton, chạy clip) |
| Nền + sương | `scene.background = #070A12`, `FogExp2(#080B14, 0.015)` | Sương rất mỏng → sảnh xa mờ dần, có chiều sâu |
| Ánh sáng môi trường | **Tự dựng env map**: scene phụ chứa các hộp `MeshBasicMaterial` phát sáng (softbox) → `PMREMGenerator.fromScene` | `environmentIntensity = 0.24` — phản chiếu mềm trên quân sơn mài/vàng mà không cần file HDR |
| Đèn | Hemisphere (0xD8CCB8 / 0x261C14, 0.85) + 3 directional: key ấm 2.55, fill 1.1, rim 1.1 | Kiểu chiếu sáng 3 điểm của studio ảnh |
| Lửa | `PointLight` cam nhấp nháy theo seed + sprite additive glow + `ShaderMaterial` lửa/than hồng + `Points` hạt bụi/tàn lửa bay | Nguồn sáng "sống" → toàn cảnh không bị tĩnh |
| Render | `ACESFilmicToneMapping`, exposure **1.24**, sRGB, `PCFSoftShadowMap`, `shadowMap.autoUpdate=false` (chỉ cập nhật khi có thay đổi), SMAA, UnrealBloom | Màu điện ảnh, highlight vàng có bloom nhẹ |
| Hiệu năng | Tự dò GPU (`UNMASKED_RENDERER_WEBGL`), coarse pointer, `devicePixelRatio` kẹp 1.75–2; cài đặt **"Chất Lượng: Tự Động (Tối Đa)"** | Máy yếu tự hạ cấp |
| Camera | OrbitControls damping 0.16, rotate 0.55, zoom 0.75, polar 0.12…0.46π, dist 1.45…12; 6 preset (Tự do, 3/4, Chính, Từ trên, Ngang, Toàn cảnh), khoá góc, WASD bay | Chuyển preset bằng animation mượt |

### 1.2 Animation — vì sao "không giả"

Từ hằng số trong bundle [INFERENCE: chưa quay được clip]:

- **Dáng đi riêng từng quân** (`LOCOMOTION_GAIT_PROFILES`): mỗi loại có `moveTimeScale`, `stepFreqPerSq` (số bước/ô), `stepLift` (nhấc chân), `hoverLift`, `pitchLean` (nghiêng người tới trước), `rollSway` (lắc ngang). Ví dụ Mã: `hoverLift 0.075`, `pitchLean 0.18` → phi nhảy chồm tới; Voi: chậm `0.8`, lắc mạnh `0.038`.
- **Đòn đánh có nhịp** (`ATTACK_SYNC_PROFILES`): `standoff` (dừng cách mục tiêu), `swingStartClip` → `contactClip` → `secondContactClip` → `blowClip`, `maxLunge` (lao tới), **`hitStopDuration: 0.03`** (khựng 30ms lúc trúng đòn — kỹ thuật game đối kháng). Mỗi quân có tên chiêu riêng ("Phalanx Shield-Breaker & Spear Thrust"…).
- **Combat camera zoom** (`setCombatCameraZoomEnabled`): camera áp sát khi ăn quân.
- **Mức hoạt cảnh** người dùng chọn được: "🎬 Hoạt Cảnh: Đầy Đủ" (`setMotionLevel`).
- Chiếu tướng: vignette đỏ đập nhịp (`@keyframes check-vignette-pulse`).
- UI: một đường cong duy nhất `cubic-bezier(.22,1,.36,1)` (ease-out mạnh, dừng êm), transition 0.18–0.25s, overlay fade 0.22s.

Nguyên lý rút ra: **anticipation → action → hit-stop → follow-through**, và **mỗi vật có trọng lượng khác nhau**. Không phải "lerp từ A đến B trong 0.5s".

### 1.3 Logo người tạo (góc phải trên)

- `#trainer-logo-watermark`: card ~56px, nền trắng 88%, viền `1px rgba(212,175,55,.42)` (vàng), radius 14px, shadow `0 6px 20px rgba(0,0,0,.48)`, ảnh `/assets/logo-dungtq.png` (avatar + chữ ký "DũngTQ"), `title`/`aria-label` "Biểu trưng DũngTQ", `draggable=false`, transition opacity/transform 0.25s.
- Luôn hiện cả desktop lẫn mobile, không chiếm chỗ thao tác.

### 1.4 Typography tiếng Việt — sự thật

- CSS khai báo `Inter` (body) và `Cinzel` (tiêu đề) nhưng **không tải webfont nào** (`document.fonts` rỗng, không có `@font-face`).
- Thực tế hiển thị: **SF Pro** trên Mac/iOS (qua `-apple-system`), Segoe UI trên Windows. Tiêu đề fallback **Georgia** (Cinzel vốn không có dấu tiếng Việt).
- Cái làm chữ trông "chuyên nghiệp" không phải font lạ, mà là cách dùng:
  - Tiêu đề serif viết hoa, giãn chữ, màu vàng `#d4af37` / `#f5d76e` (P3: `color(display-p3 .86 .69 .24)`).
  - Nhãn nút 11.8–12.5px, đậm 600–800, letter-spacing ~0.02–0.03em.
  - Nhãn nhóm VIẾT HOA màu vàng nhỏ ("VÁN ĐẤU", "GÓC NHÌN").
  - Chữ kem `#f0ece1` trên nền gần đen, không dùng trắng tinh.
- Lưu ý: local **cũng dùng `system-ui`** cho body → cùng SF Pro. Khác biệt nằm ở **font tiêu đề `Trebuchet MS`** (`tokens.css:36`) — chính font này cộng nền gỗ sáng làm local trông kiểu "web cũ / AI".

### 1.5 Đề xuất & góp ý (góc phải dưới)

- FAB `#btn-feedback-fab`: pill, viền `rgba(245,215,110,.78)`, glow vàng `0 0 16px rgba(212,175,55,.35)`, chấm xanh `#34d399` phát sáng (cảm giác "đang có người nghe"), chữ "💬 Đề Xuất" 12.5px/800, hover scale 0.18s.
- Modal: kicker "✦ CỘNG ĐỒNG GÓP Ý • ĐỒNG SÁNG TẠO ✦", tiêu đề serif vàng, nền radial vàng ở đỉnh + gradient đen, viền vàng 78%, shadow `0 24px 64px rgba(0,0,0,.88)` + glow vàng.
- Form 4 trường: (1) Môn cờ, (2) Hạng mục — 💡 Ý tưởng mới / 🎨 Tạo hình & màu quân / 🤖 Độ khó & luật / 📱 Giao diện / 🐞 Báo lỗi, (3) Tên/liên hệ (tuỳ chọn, mặc định "Người chơi ẩn danh"), (4) Nội dung (bắt buộc, ≥2 ký tự).
- `POST /api/feedback` gửi kèm `deviceInfo` = `innerWidth×innerHeight • userAgent(120)`. Có thêm `/api/upload-screenshot` (đính kèm ảnh chụp).
- Điểm vào thứ hai: nút "💬 Đề Xuất & Góp Ý" trong modal chọn môn cờ.

### 1.6 Các pattern UX khác đáng học

| Pattern | Chi tiết |
| --- | --- |
| Game-first | Không có landing riêng: mở URL là vào ngay đấu trường 3D. SEO nằm ở `<title>`/meta/OG. |
| Loading | Overlay chữ vàng "CỜ TƯỚNG 3D" + thanh tiến trình + câu trạng thái có hồn ("Đã tải kiến trúc đấu trường...") đè lên scene đang dựng — không màn trắng. |
| HUD kính | Thanh trên dạng kính tối: `blur(22px) saturate(165%)`, fill `#10141e75`, stroke `#ffffff24`, specular `inset 0 1px 0 #ffffff38`, có SVG filter `liquid-glass-refract`. Fallback đặc `#0c0f16f7` khi tắt blur. |
| Trạng thái | Pill "● Lượt Phe Đỏ", badge "Đang cầm: Phe Đỏ" viền vàng. |
| Nút active | Viền + nền vàng nhạt cho lựa chọn đang chọn (độ khó, góc nhìn). |
| Chọn quân | Vòng sáng dưới quân, chấm xanh ô đi hợp lệ, tag tên quân ("Mã") + tooltip luật đi. |
| Tùy chỉnh | Panel kính chia nhóm: Ván đấu / Đấu với máy / Hai người / Góc nhìn / Hiển thị & âm thanh / Tài khoản / Ứng dụng (cài PWA). |
| Gợi ý điều khiển | Thanh mờ dưới trái: "Xoay 3D Tự Do: Bấm quân để đi • Kéo chuột trái: Xoay…" |
| Mobile | Top bar rút gọn còn 3 pill + logo; FAB đề xuất xuống dưới logo; dock 2 hàng ở đáy (Tướng, Góc 3D, Xoay 3D, Tên, Đi lại, 2 Người, Góc chuẩn). |
| Ẩn UI | Phím `H` để ngắm cảnh / chụp màn hình. |

Điểm **không nên học**: emoji trong mọi nút (🆕 ↩ 🤖 🎥…) — trong bối cảnh tối/vàng của họ thì tạm ổn, nhưng chính emoji là dấu hiệu "AI làm" mà anh muốn bỏ ở local. Nên thay bằng icon set SVG thống nhất.

---

## 2. Local map — hiện trạng Cờ Cá Ngựa 3D

| Mảng | Hiện trạng (file) |
| --- | --- |
| Landing | HTML tĩnh `co-ca-ngua-online.html` + `web/src/landing/landing.css`: hero nâu gỗ, 4 chấm màu, ảnh `board.jpg`, khối "3 bước", luật, bảng so sánh, FAQ. Nền kem sáng ở các section. |
| Màn vào game | `GuestEntryPage` card kem giữa nền gỗ sọc, nút xanh lá, "Đang tải…" trơn khi load. |
| Font | `--font-body: system-ui…`, `--font-display: 'Trebuchet MS'…` (`tokens.css:35-36`). Không webfont. |
| Bảng màu | Gỗ `#2e1b0e…#f1e3c8`, felt xanh `#123f2a/#1f6b46`, giấy `#fbf4e6`, 4 màu ngựa bão hoà cao. |
| Không gian 3D | **Không có môi trường**: canvas trong suốt trên `radial-gradient(#5a3b27 → #1d130f)` (`GameScene.tsx:96`). Bàn cờ lơ lửng trong khoảng nâu. |
| Render | `NeutralToneMapping`, `PCFShadowMap`, không env map, không bloom, không fog (`GameScene.tsx:103-105`). |
| Quân / xúc xắc | Ngựa procedural (`horse-geometry.ts`), xúc xắc cube vẽ chấm canvas. |
| Animation | `director.ts`: roll 0.5s, move 0.5s lerp, kick 0.36+0.22s, hop 0.16s, confetti 3.4s. DOM chỉ có `@keyframes emote-pop`. |
| HUD trận | Card người chơi trên (2×2 / 1×4), panel kem dưới: "Lượt của bạn", đếm giây, nút "Đổ xúc xắc" xanh, "Rời phòng". |
| Tín hiệu thương hiệu | Không có logo/credit người làm. |
| Góp ý | Không có. Backend Worker + D1 sẵn (`worker/`, `migrations/`), đã có pattern rate-limit (`0003_auth_attempts.sql`) và analytics (`/api/events`, `0004_daily_events.sql`). |
| PWA | Không có manifest. |

---

## 3. Head-to-Head

| Aspect | Source (chess.tqd.me) | Local (Cá Ngựa) | Recommendation |
| --- | --- | --- | --- |
| Môi trường 3D | Sảnh đá GLB, fog, env map tự dựng, lửa sống, bloom | Gradient CSS sau canvas | **Port nguyên lý**, dựng bối cảnh Việt riêng (mục 4) |
| Tone/màu | ACES 1.24, nền gần đen + vàng kim + kem | Neutral, nâu gỗ + kem + xanh lá | Chuyển sang "tối sang + 1 kim loại nhấn"; giữ 4 màu ngựa làm màu phe |
| Ánh sáng | Hemi + key/fill/rim + point light nhấp nháy | Đèn cơ bản | 3 điểm + nguồn sáng ấm có chuyển động (đèn lồng/nến) |
| Animation quân | Gait profile + attack timeline + hit-stop + combat cam | Lerp 0.5s, kick 0.22s | Hop từng ô có squash/stretch, kick có anticipation + hit-stop + camera shake nhẹ |
| Motion UI | 1 easing chuẩn, transition 0.18–0.25s, fade overlay | Gần như không có | Thêm motion tokens + `prefers-reduced-motion` + setting "Hoạt cảnh" |
| Font | System sans + serif viết hoa vàng | System sans + Trebuchet MS | Bỏ Trebuchet; self-host **Be Vietnam Pro** (body/UI) + serif có dấu Việt cho tiêu đề |
| HUD | Kính tối, pill, viền vàng active | Panel kem phẳng, nút xanh khối | Kính tối + pill, giữ touch 48px hiện có |
| Logo creator | Card avatar góc phải trên | Không | Thêm, cần asset logo của anh |
| Góp ý | FAB + modal 4 trường + `/api/feedback` | Không | Thêm, tái dùng Worker/D1 + rate-limit pattern |
| Loading | Overlay thương hiệu trên scene đang dựng | "Đang tải…" trơn | Overlay có progress + câu trạng thái |
| Landing | Không có, game là landing | HTML tĩnh tông sáng, ảnh chụp | Giữ landing (SEO đang tốt) nhưng đổi sang cùng visual language với game; hero dùng ảnh/clip môi trường mới |
| Icon | Emoji | Emoji | Icon SVG thống nhất (vd. Lucide/Phosphor hoặc vẽ riêng) |
| PWA / chất lượng tự động | Có | Có fallback software renderer, chưa có tier | Thêm quality tier (drei `PerformanceMonitor`) trước khi thêm môi trường nặng |

---

## 4. Challenge (các giả định cần đối chất)

| # | Giả định | Source | Local | Rủi ro nếu sai |
| --- | --- | --- | --- | --- |
| 1 | "Copy không gian cung điện" | Thánh đường gothic hợp cờ vua/cờ tướng "đấu trường" | Cá ngựa là trò chơi gia đình, Tết, phòng khách Việt | Sảnh gothic sẽ lạc tông; người chơi VN không thấy "của mình". Nên bối cảnh Việt: **đình làng / nhà rường gỗ lim, đèn lồng, câu đối, sân gạch Bát Tràng** hoặc **phòng khách đêm Tết** (mâm ngũ quả, hoa mai/đào, đèn vàng ấm). |
| 2 | Có model GLB như source | Họ có model riêng (có thể tự làm/thuê) | Chưa có asset | Không được lấy GLB của họ. Cần: tự procedural (low-poly có chủ đích), asset CC0 (Poly Haven, Kenney, Quaternius), hoặc thuê/AI-gen + chỉnh tay. **Đây là chi phí lớn nhất** (>2 ngày). |
| 3 | Animation chiến đấu | Quân có skeleton + clip | Ngựa procedural không xương | Không cần skeleton: procedural motion (hop parabol theo đường đi, squash/stretch, nghiêng theo hướng, hit-stop khi đá) đủ "thật" với cá ngựa. |
| 4 | Hiệu năng | Có tier tự động + dò GPU | Có nhánh software renderer, chưa có tier | Môi trường + bloom + hạt có thể làm điện thoại tầm trung tụt FPS → phải làm tier trước. |
| 5 | Font Cinzel/Inter | Không tải thật, ăn may nhờ SF Pro | Cũng system font | Trên Windows/Android, system font tiếng Việt không đều. Self-host font có subset `vietnamese` thì ổn định trên mọi máy. |
| 6 | Feedback widget | Có BE riêng | Worker + D1 sẵn | Spam/lạm dụng → cần rate-limit + giới hạn độ dài + lọc HTML. Thấp, có sẵn pattern. |
| 7 | Bố cục HUD | Cờ tướng 1 người vs máy, nhiều nút camera | Cá ngựa 2–4 người online, cần thấy 4 người + xúc xắc | Đừng nhồi 6 preset camera như họ; cá ngựa cần **xúc xắc + lượt + 4 người** nổi bật nhất. |

Risk score: **Medium** — critical: #2 (asset/bối cảnh >2 ngày), #4 (perf mobile). #1 là quyết định sản phẩm, không phải rủi ro kỹ thuật.

---

## 5. Decision matrix (đề xuất)

| # | Decision | Source's Way | Local Way | Hybrid | Risk | Choice |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Bối cảnh 3D | Thánh đường gothic GLB | Gradient | Bối cảnh Việt (đình/nhà rường hoặc phòng khách Tết), dựng bằng R3F + asset CC0 + procedural | medium | **hybrid** |
| 2 | Pipeline render | ACES 1.24, PMREM softbox, bloom, fog | Neutral, không env | drei `<Environment>` + `<Lightformer>` (tương đương softbox), `FogExp2`, `@react-three/postprocessing` Bloom, ACES | low | **source pattern trên stack R3F** |
| 3 | Nguồn sáng sống | Brazier + point light nhấp nháy + hạt tàn lửa | Không | Đèn lồng/nến: point light flicker + sprite additive + drei `<Sparkles>` | low | **source pattern** |
| 4 | Animation quân | Gait/attack profile + hit-stop | Lerp | Mở rộng `director.ts`: hop từng ô (parabol, squash/stretch), kick = anticipation → hit-stop 30–50ms → knockback arc về chuồng; camera shake nhẹ; roll xúc xắc có nảy & settle | medium | **hybrid** |
| 5 | Motion UI | Easing `cubic-bezier(.22,1,.36,1)`, 0.18–0.25s | Không | Thêm motion tokens vào `tokens.css`, tôn trọng `prefers-reduced-motion`, setting "Hoạt cảnh: Đầy đủ / Giảm" | low | **source** |
| 6 | Font | System + serif fallback | System + Trebuchet | Self-host **Be Vietnam Pro** (400/600/800, subset vietnamese, woff2) cho UI; tiêu đề serif có dấu Việt (vd. **Playfair Display** hoặc **Noto Serif Display**) viết hoa giãn chữ | low | **improve on source** |
| 7 | Bảng màu / HUD | Nền gần đen, vàng kim, kem, kính blur | Gỗ sáng, kem, xanh lá | Nền tối ấm (gỗ lim đậm/sơn mài) + vàng đồng nhấn + kem; HUD kính tối, pill, active viền vàng; 4 màu ngựa làm màu phe | medium | **hybrid** |
| 8 | Logo creator | Card avatar 56px góc phải trên | Không | Giống source, asset logo của anh | low | **source** |
| 9 | Góp ý | FAB + modal 4 trường + `/api/feedback` + deviceInfo | Không | FAB "Góp ý" + modal (Hạng mục, Tên tuỳ chọn, Nội dung, kèm phòng/thiết bị) → Worker endpoint + bảng D1 `feedback` + rate-limit theo pattern `auth_attempts` | low | **source pattern trên stack local** |
| 10 | Landing | Không có | HTML tĩnh tông sáng | Giữ trang SEO, đổi sang visual language tối/vàng, hero bằng ảnh/clip môi trường mới | low | **local, restyle** |
| 11 | Icon | Emoji | Emoji | SVG icon set thống nhất | low | **neither** |
| 12 | Quality tier | Tự động theo GPU | Chỉ nhánh software | drei `PerformanceMonitor` + `AdaptiveDpr`, tắt bloom/hạt/shadow theo tier | medium | **source pattern** — làm trước #1 |

---

## 6. Recommendation

Thứ tự đề xuất (từ rẻ/nhìn thấy ngay → đắt):

1. **Design tokens + font + HUD tối** (#5, #6, #7, #11): đổi được cảm giác "AI làm" nhanh nhất, không đụng 3D.
2. **Logo creator + Góp ý** (#8, #9): nhỏ, độc lập, có BE sẵn.
3. **Pipeline render + quality tier** (#12, #2, #3): bàn cờ hiện tại sẽ đẹp lên rõ chỉ nhờ env lighting + ACES + bloom + fog, chưa cần môi trường.
4. **Animation quân / xúc xắc** (#4).
5. **Bối cảnh 3D Việt** (#1): đắt nhất, cần chốt concept + nguồn asset trước.
6. **Restyle landing** (#10) sau khi có ảnh môi trường mới.

Quyết định anh cần chốt trước khi lập plan:

- Concept bối cảnh: đình làng / nhà rường gỗ lim, hay phòng khách đêm Tết, hay vẫn "cung điện" nhưng kiểu Huế (Điện Thái Hoà: cột sơn son thếp vàng, mái ngói) thay vì gothic.
- Nguồn asset: procedural + CC0 (rẻ, chậm hơn) hay thuê/mua model.
- Logo/avatar creator: file nào, chữ ký gì.

Tiếp theo: chốt 3 điểm trên → chạy `/ak-xia … --port` hoặc `/ak-plan` với báo cáo này làm đầu vào.
