# Bài đăng social: Cờ Cá Ngựa 3D bản mới (đại tu giao diện + tính năng)

Ngày soạn: 2026-11-22. Xưng "tui".

Bối cảnh đăng:
- **Facebook cá nhân:** đã có bài ra mắt lúc 13:15 ngày 21/11 (giao diện cũ, hứa "Sắp tới: tối ưu UI/UX, Mobile, performance"). Bài hôm nay là **bài cập nhật, trả bài lời hứa hôm qua**, không phải ra mắt lại từ đầu.
- **Build in public (Threads/X, nhóm dev):** chưa đăng bài nào. Bài hôm nay là **bài mở đầu**, phải giới thiệu dự án từ đầu.
- **Nhóm cộng đồng (board game, hoài niệm, gia đình):** chưa đăng bài nào. Bài hôm nay là **lần đầu giới thiệu**.
- **Nhóm vibe code / build in public (vd. "Vibe Code Kiếm Cơm", "Build in Public"):** chưa đăng bài nào. Bài 4 là **bài đầu tiên giới thiệu game và tính năng**, kèm link chơi thử và xin góp ý. Nhóm đông nên câu chữ lịch sự, có chào hỏi, xin phép admin, cảm ơn.

Bài thách đấu, kịch bản clip, Reddit trong `../../20261121-ca-ngua-3d-soft-launch/copy/content-pack.md` vẫn dùng được.

## Trước khi đăng

Trạng thái lúc 20:40 ngày 22/11:
- Tượng ngựa vàng "Mã đáo thành công" đã gộp vào `main` (#53, 4a2b118) và đang chạy trên production. Thêm cài đặt "Nhịp ván" (#55) và trang giới thiệu chuyển sang `/gioi-thieu` (#54, địa chỉ cũ tự chuyển hướng).
- **Ảnh landing và ảnh xem trước link (`public/og-image.jpg`) trên `main` và production chưa chụp lại, vẫn là nửa quả dưa hấu.** Dán link lên Facebook/Zalo sẽ hiện ảnh dưa hấu.
- Ảnh trong `../creatives/social/` đã chụp lại từ cảnh thật ở `main` @ 312cf5b (chạy `node scripts/capture-landing-media.mjs --only og,hero-mobile,hero,background` trong worktree `../game-ca-ngua-online-wt/campaign-capture`), đã có tượng ngựa vàng.

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Tượng ngựa vàng lên production | Xong (#53) |
| 2 | Ảnh campaign có tượng ngựa vàng | Xong |
| 3 | Commit media mới chụp (og-image, hero, hero-mobile, board-bg) vào `main` rồi deploy | **Còn**: không làm thì ảnh xem trước khi dán link vẫn là dưa hấu |
| 4 | Dán link vào [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/), bấm "Scrape Again" | **Còn**, sau việc 3 |
| 5 | Mở thử link trên iPhone và Android, trong trình duyệt của Facebook và Zalo | **Còn** |
| 6 | Quay video (kịch bản ở mục "Quay video") | **Còn** |

## Câu chữ chỉ nói điều đã có thật

Đã kiểm tra trong code `main` (312cf5b) và production ngày 2026-11-22.

| Được nói | Không nói (chưa có / chưa bật / chưa đo) |
|---|---|
| Free, No Ads (anh đã nói công khai hôm qua, hiện đúng) | "Miễn phí mãi mãi": chưa cam kết |
| Đúng luật cá ngựa Việt Nam, có bảng luật ngay trong ván | "Đăng nhập bằng Google/Facebook": production đang tắt cả 3 nhà cung cấp |
| Không cài app, nhập tên là chơi | "Đông người chơi", "xếp hạng", "chat": không có |
| Phòng khách đêm Tết 3D, ngựa nhảy từng ô, đá ngựa có hiệu ứng | "Ván nhanh 5 phút": chưa đo với người thật; chỉ có số mô phỏng (ít nước hơn khoảng 7 lần) |
| Ván nhanh, máy 3 mức Dễ/Thường/Khó, đồng hồ lượt | "Chạy mượt mọi máy": máy yếu tự hạ chất lượng, máy không có GPU chỉ thấy ảnh tĩnh ở trang chủ |
| Rủ bạn bằng link, mời người đang online, phòng công khai/riêng tư | "Lại 1 prompt": bản đại tu có chốt hướng, chia việc, review nhiều vòng |
| 8 biểu cảm nhanh, đặt tên ngựa, lắc máy để đổ (bật trong Menu), nút "Góp ý" | |

## Ảnh và video (`../creatives/social/`)

| File | Dùng cho |
|---|---|
| `hom-qua-hom-nay-1080x1350.jpg` | Ảnh so sánh: trái là ván trên điện thoại bản hôm qua, phải là bàn cờ đêm Tết bản mới. Ảnh đầu bài cá nhân |
| `og-1200x630.jpg` | Ảnh xem trước link (đã gắn vào trang) |
| `tet-board-780x1560.jpg` | Story, ảnh dọc cho Threads/Instagram, ảnh bìa clip |
| `tet-board-1280x720.jpg` | Ảnh ngang cho X, album Facebook |
| `tet-board-loop-7s.mp4` | Video lặp 7 giây (1280×720, không tiếng) cảnh bàn cờ đêm Tết |
| `rule-ra-chuong-800x600.png`, `rule-da-ngua-800x600.png`, `rule-ve-dich-800x600.png` | Album 3 ảnh luật (ra chuồng, đá ngựa, về đích) cho bài nhóm |

Ảnh và video ở bảng trên hiện vẫn là bản dưa hấu. Sau việc 1, chạy script ở việc 2 để lấy bản có tượng ngựa vàng từ `main`. Ảnh "hôm nay" trong ảnh so sánh là cảnh bàn cờ không có thanh điều khiển; chụp màn hình ván thật trên điện thoại anh để thay nếu muốn so sánh đúng từng màn.

## Link (giữ nguyên để đo nguồn)

| Kênh | Link |
|---|---|
| Facebook | https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook |
| Threads | https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=threads |
| X | https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=x |
| Trang luật + giới thiệu (cho bài nhóm) | https://ca-ngua-online.johnny-bui1911.workers.dev/gioi-thieu?utm_source=facebook |

---

## 1. Bài cá nhân: cập nhật sau 1 ngày (Facebook cá nhân)

Cùng giọng và bố cục với bài hôm qua (emoji đầu mục, gạch đầu dòng), nhưng chi tiết hơn. Mở bằng lời hứa hôm qua để người đã xem bài cũ thấy ngay đây là phần tiếp theo.

> 🐴 Hôm qua tui chê Claude làm UI lỏ, hứa sẽ tối ưu UI/UX, Mobile, performance. Nay trả bài: anh em Technical Agent Team cày nguyên đêm, đập đi làm lại gần như toàn bộ giao diện Cá Ngựa 3D 🧧
>
> 🎮 Chơi thử bản mới: https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook
>
> 🏮 **Giao diện mới: dọn bàn cờ về phòng khách đêm Tết**
> - Bàn cờ đặt trên sập sơn mài, xung quanh là đèn lồng đỏ, cành mai cành đào, bánh chưng, bao lì xì, và tượng ngựa vàng "Mã đáo thành công" chúc mọi người năm mới phi nước đại 🐎
> - Có cả câu đối "Thịt mỡ dưa hành câu đối đỏ / Cây nêu tràng pháo bánh chưng xanh"
> - Vừa mở trang là thấy máy đang tự chơi một ván minh hoạ. Bấm "Chơi ngay", nhập tên, vào sảnh, phòng chờ… đều hiện trên cùng bàn cờ đó, không tải lại trang
> - Vào ván, camera bay về đúng chỗ ngồi của bạn
>
> 🐎 **Đá ngựa giờ mới đúng là "đá"**
> - Ngựa nhảy từng ô chứ không trượt nữa
> - Đá ngựa: lấy đà, lao tới, khựng hình một nhịp rồi hất bay đối thủ về chuồng, camera lướt sát vào pha đá
> - Xúc xắc lăn, nảy vài lần rồi mới dừng
>
> 📱 **Mobile và performance (2 lời hứa còn lại)**
> - Thanh điều khiển làm lại cho điện thoại, nút to dễ bấm, tên người chơi không bị cắt
> - Game tự chọn mức đồ hoạ theo máy, khung hình tụt thì tự hạ để chơi vẫn mượt
> - Ai không thích chuyển động nhiều thì chọn "Hoạt cảnh: Giảm"
>
> ✨ **Tính năng mới từ sau bài hôm qua**
> - ⚡ Ván nhanh: mỗi màu có sẵn 1 ngựa ngoài chuồng, phải đá được 1 ngựa đối thủ mới mở chuồng đích, ngựa đầu tiên lên chuồng thắng luôn. Gọn hơn ván thường nhiều
> - 🤖 Máy 3 mức Dễ / Thường / Khó. Mức Khó biết né đòn, biết rình đá
> - ⏱️ Chủ phòng chọn 10–60 giây mỗi lượt, hết giờ máy đi giúp. Hết cảnh ngồi chờ đứa treo máy
> - 🐢 Nhịp ván Nhanh / Vừa / Thư thả: muốn đánh lẹ hay ngồi nhâm nhi trà cũng được
> - 😈 8 biểu cảm cà khịa: "Đá nè!", "Tha cho em", "Ra 6 đi!", "Xui quá"…
> - 🏷️ Đặt tên riêng cho từng con ngựa
> - 📳 Lắc điện thoại để đổ xúc xắc (bật trong Menu)
> - 🎵 Nhạc nền, tiếng vó ngựa theo từng bước, chuông báo khi tới lượt
> - 📖 Quên luật thì bấm "?" ngay trong ván
> - 💬 Nút "Góp ý" ngay trong game, gửi thẳng cho tui
>
> ✅ **Vẫn giữ như cũ**
> - Free, No Ads
> - Nhập tên là chơi, không cần đăng ký, không cần cài app
> - Tạo phòng, gửi link vào nhóm là cả hội vào. Thiếu người thì thêm máy
> - Rớt mạng thì máy giữ chỗ, đi giúp tới khi bạn quay lại
> - Đúng luật cá ngựa Việt Nam: ra chuồng bằng 1 hoặc 6, không nhảy qua ngựa khác, lên chuồng từng bậc, tung 1 hoặc 6 được đi tiếp
>
> Tết sắp tới, nhà ai ở xa không về kịp thì gửi link cho cả nhà làm một ván nha 🧧
>
> Chơi thử thấy hay cho tui xin 1 like, thấy chỗ nào dở cứ bấm "Góp ý" hoặc comment, tui sửa liền. Cảm ơn mọi người 🙏

Ảnh: `hom-qua-hom-nay-1080x1350.jpg` (ảnh đầu) → clip đá ngựa (việc 5) → `tet-board-780x1560.jpg`.

**Sau khi đăng:** vào bài hôm qua, bình luận "Bản mới đã lên rồi nè, giao diện Tết + ván nhanh + máy 3 mức: [link bài mới]". Người đã tương tác bài cũ sẽ nhận thông báo.

---

## 2. Build in public: bài mở đầu (Threads / X, dạng chuỗi)

Đây là bài đầu tiên của chuỗi nên tweet 1 phải tự giới thiệu dự án. Đặt tên chuỗi cố định (vd. "Nhật ký Cá Ngựa 3D #1") để các bài sau nối tiếp.

Số liệu lấy từ git: bản đại tu gồm 13 PR, 49 commit, 117 file code đổi (+11.893 / −1.728 dòng), commit đầu 02:29, commit cuối 13:35 ngày 22/11; tính năng mới từ chiều 21/11 tới nửa đêm. Mỗi tweet dưới 280 ký tự.

> **1/** Nhật ký Cá Ngựa 3D #1 🐴
> Tui đang cho một đội AI agent làm game cờ cá ngựa 3D chạy trên trình duyệt: nhập tên là chơi, rủ bạn bằng link, đúng luật Việt Nam. Free, không quảng cáo. Bài đầu kể chuyện 2 ngày qua 🧵
>
> **2/** Ngày 1: đúng 1 prompt, có game chơi được: bàn cờ 3D, phòng nhiều người, máy chơi cùng, rớt mạng máy giữ chỗ. Nhưng nhìn vô là biết AI làm UI: bàn cờ trơ trọi, nút như form đăng ký.
>
> **3/** Chiều với tối hôm đó thêm tính năng: đặt tên ngựa, nhạc và tiếng vó ngựa, 8 biểu cảm cà khịa, máy 3 mức Dễ/Thường/Khó, đồng hồ lượt, và "ván nhanh" vì ván thường 4 người quá dài.
>
> **4/** Đêm qua làm lại giao diện. Lần này không 1 prompt nữa: tui ngồi chốt hướng trước. Bàn cờ đặt giữa phòng khách đêm Tết, trang chủ là ván máy tự chơi, mọi màn hình nổi trên cùng một bàn cờ.
>
> **5/** Chia thành 11 mảng: design system, ánh sáng, bối cảnh Tết, animation, trang chủ, HUD, trang giới thiệu, góp ý… Mỗi mảng một nhánh riêng chạy song song, review chéo 2 vòng rồi mới gộp.
>
> **6/** Bối cảnh Tết gần như vẽ hết bằng code. Vụ vui: bản đầu có mâm ngũ quả, nhìn nghiêm như bàn thờ. Đổi qua dưa hấu, thử 3 kiểu vẫn không ưng. Chốt tượng ngựa vàng "Mã đáo thành công": game cờ ngựa thì phải có ngựa 🐎
>
> **7/** Pha đá ngựa: lấy đà → lao tới → khựng hình một nhịp → hất đối thủ về chuồng, camera lướt sát. Chủ phòng chọn nhịp ván Nhanh / Vừa / Thư thả; bàn cờ diễn xong lượt trước thì đồng hồ lượt mới chạy.
>
> **8/** Kết quả: 13 PR, 49 commit, ~12 nghìn dòng code, từ 2h sáng tới trưa nay. React Three Fiber + Cloudflare Workers / Durable Objects / D1, vẫn nằm trong gói free.
>
> **9/** Chơi thử rồi chê thẳng tay giúp tui, trong game có nút "Góp ý". Bài sau tui kể máy mức Khó được dạy chơi thế nào 🙏 [link threads hoặc link x]

Đính kèm: 1/ `tet-board-loop-7s.mp4`, 2/ `hom-qua-hom-nay-1080x1350.jpg`, 6/ `tet-board-780x1560.jpg` (thấy rõ tượng ngựa vàng, sau khi chạy lại script), 7/ clip đá ngựa (việc 5), 8/ quay màn hình trang chủ → bấm "Chơi ngay" → vào ván.

Cần anh xác nhận trước khi đăng: tweet 5 tả cách chia việc theo các nhánh `ui-*` trong repo; nếu anh muốn nói rõ tên model hoặc số agent thì thêm vào, em không có dữ liệu đó. Tweet 9 hứa một bài tiếp về máy mức Khó; đổi chủ đề nếu anh định kể chuyện khác.

---

## 3. Bài trong nhóm (board game, hoài niệm, gia đình, Tết): lần đầu giới thiệu

Dạng hỏi ý kiến, không nhắc AI (nhóm này quan tâm trò chơi, không quan tâm cách làm). Link để ở bình luận. Đọc nội quy nhóm trước; nhóm cấm quảng cáo thì xin admin hoặc chỉ gửi link khi có người hỏi.

> Tết này nhà mọi người còn ai lôi bàn cờ cá ngựa ra chơi không? 🧧
>
> Nhà tui hồi đó đêm giao thừa nào cũng một ván: ra chuồng phải tung 1 hoặc 6, đá trúng là đối thủ về chuồng, tung 1 hoặc 6 được đi tiếp, lên chuồng phải lên từng bậc. Ai bị đá ngay trước cửa chuồng là dỗi tới mùng 2 😆
>
> Giờ cả nhà mỗi người một nơi, nên tui tự làm một bản cờ cá ngựa 3D chơi trên điện thoại, dựng luôn cái phòng khách đêm Tết có đèn lồng, mai đào, bánh chưng, tượng ngựa vàng "Mã đáo thành công" cho đỡ nhớ. Không cần cài app, gửi link vào nhóm Zalo gia đình là cả nhà vào chơi được, thiếu người thì có máy chơi cùng.
>
> Tui muốn hỏi mọi người hai chuyện:
> 1️⃣ Luật nhà bạn có khác không? Ví dụ ra chuồng chỉ cần con 6, hay được nhảy qua đầu ngựa khác?
> 2️⃣ Tui có làm thêm "ván nhanh": mỗi màu có sẵn 1 ngựa ngoài chuồng, phải đá được 1 con của đối thủ mới được lên chuồng, ai lên chuồng trước là thắng. Mọi người thấy kiểu này vui hay mất chất?
>
> Ai muốn thử thì tui để link ở bình luận nha. Góp ý gì tui cũng sửa 🙏

Ảnh: album 3 ảnh `rule-ra-chuong` → `rule-da-ngua` → `rule-ve-dich`, hoặc 1 ảnh `tet-board-780x1560.jpg`.

**Bình luận (khi được phép hoặc khi có người hỏi):**

> Link đây nè: https://ca-ngua-online.johnny-bui1911.workers.dev/gioi-thieu?utm_source=facebook
> Trang này có luật đầy đủ, bấm "Chơi ngay" là vào game.

---

## 4. Bài nhóm vibe code / build in public: lần đầu giới thiệu

Cho các nhóm như "Vibe Code Kiếm Cơm", "Build in Public". Nhóm đông nên giọng lịch sự: chào hỏi, xin phép admin, nói rõ đang xin góp ý, cảm ơn. Người đọc ở đây quan tâm cả game lẫn cách làm, nên bài có 2 phần: tính năng và hậu trường.

Trước khi đăng:
- Đọc nội quy từng nhóm: có nhóm bắt gắn tag (vd. `#share`, `#showcase`) hoặc chỉ cho đăng link vào ngày nhất định.
- Mỗi nhóm cách nhau vài giờ và đổi nhẹ câu mở đầu; đăng cùng một bài vào nhiều nhóm một lúc dễ bị Facebook coi là spam.
- Giờ đầu sau khi đăng, trả lời bình luận nhanh để bài được đẩy lên.

> **[Chia sẻ dự án] Cờ Cá Ngựa 3D chơi ngay trên trình duyệt, làm cùng đội AI agent. Mong anh chị em chơi thử và góp ý 🙏**
>
> Chào cả nhà, xin phép admin cho tui chia sẻ một dự án nhỏ ạ.
>
> Tui là Johnny. Mấy ngày nay tui thử cho một đội AI agent làm game Cờ Cá Ngựa 3D chạy trên trình duyệt, chơi được cả điện thoại lẫn máy tính. Hôm nay bản tương đối hoàn chỉnh đầu tiên đã lên, nên tui xin mạn phép mời mọi người chơi thử.
>
> 🎮 Chơi thử: https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook
> Không cần cài app, không cần đăng ký, nhập tên là vào. Free, không quảng cáo.
>
> 🐴 **Game có gì**
> - Đúng luật cá ngựa Việt Nam: ra chuồng bằng 1 hoặc 6, đá ngựa đối thủ về chuồng, lên chuồng theo từng bậc, tung 1 hoặc 6 được đi tiếp. Có bảng luật ngay trong ván.
> - Bàn cờ 3D đặt giữa phòng khách đêm Tết: đèn lồng, mai đào, câu đối, bánh chưng, tượng ngựa vàng "Mã đáo thành công".
> - Ngựa nhảy từng ô; pha đá ngựa có lấy đà, khựng hình, camera lướt sát.
> - Rủ bạn bằng một đường link, hoặc mời người đang online trong sảnh; phòng công khai hoặc riêng tư.
> - Thiếu người thì thêm máy, có 3 mức Dễ / Thường / Khó. Rớt mạng thì máy đi giữ chỗ.
> - Ván nhanh: phải đá được 1 ngựa đối thủ mới mở chuồng đích, ngựa đầu tiên lên chuồng là thắng.
> - Đồng hồ lượt 10–60 giây, nhịp ván Nhanh / Vừa / Thư thả, 8 biểu cảm, đặt tên ngựa, lắc điện thoại để đổ xúc xắc.
>
> 🛠️ **Vài dòng về cách làm, gửi anh chị em cùng vibe code**
> - Bản đầu: đội agent dựng từ đúng 1 prompt (Fable 5.2). Chơi được, nhiều người, có máy chơi cùng, nhưng giao diện còn rất "AI".
> - Bản này: tui chốt hướng thiết kế trước, chia thành 11 mảng (design system, ánh sáng, bối cảnh Tết, animation, trang chủ, HUD…). Mỗi mảng chạy song song trên một nhánh riêng, review chéo 2 vòng rồi mới gộp.
> - Bối cảnh 3D gần như vẽ hết bằng code; âm thanh tổng hợp bằng Web Audio, không dùng file nhạc.
> - Stack: React Three Fiber + Cloudflare Workers / Durable Objects / D1, đang chạy trong gói miễn phí.
> - Một bài học nhỏ: món đặt giữa bàn tui đổi từ mâm ngũ quả sang dưa hấu (3 kiểu), cuối cùng là tượng ngựa vàng. AI làm rất nhanh, nhưng đẹp hay chưa thì vẫn phải người quyết 😅
>
> 🙏 **Tui rất mong nhận góp ý ở mấy điểm này**
> 1. Máy của anh chị em chạy có mượt không? Cho tui xin tên máy và trình duyệt.
> 2. Lần đầu vào có chỗ nào khó hiểu hoặc phải mò không?
> 3. Ván nhanh có vui không, hay nên chỉnh lại luật?
> 4. Gặp lỗi thì bấm nút "Góp ý" trong game hoặc bình luận giúp tui.
>
> Góp ý thẳng thắn tui đều trân trọng. Cảm ơn mọi người đã dành thời gian đọc và chơi thử ạ!

Ảnh: clip đá ngựa (việc 5) làm ảnh đầu nếu có, rồi `og-1200x630.jpg` và `hom-qua-hom-nay-1080x1350.jpg`. Không có clip thì dùng 2 ảnh sau.

Cần anh xác nhận: dòng "(Fable 5.2)" lấy từ bài cá nhân hôm qua của anh; bỏ đi nếu không muốn nêu model. Dòng "11 mảng, review chéo 2 vòng" dựa trên các nhánh `ui-*` trong repo.

---

## Quay video

Quay một lần thật dài trên điện thoại rồi cắt ra 3 bản:
- **Bản chính 60–75 giây:** cho bài cá nhân và bài nhóm vibe code. Đủ để đi từ trang chủ tới pha đá ngựa và màn thắng; dài hơn thì phần lớn người xem bỏ giữa chừng.
- **Bản ngắn 15–20 giây:** chỉ pha đá ngựa, cho Reels, Threads, X.
- **Bản đầy đủ 2 phút (tuỳ chọn):** chỉ đưa vào bình luận hoặc trả lời khi có người hỏi "chơi thế nào".

Video tự chạy không tiếng trên Facebook: 3 giây đầu phải có hình động và chữ (ngựa minh hoạ đang chạy + "Cờ cá ngựa 3D, chơi ngay trên trình duyệt"), mọi cảnh đều cần chữ chú thích.

Cắt bản chính 60–75 giây từ bảng dưới: trang chủ 5s → vào game và tạo phòng 8s (tua nhanh) → phòng chờ 10s → camera bay về ghế 4s → trong ván 25–35s (ra chuồng, ngựa nhảy, biểu cảm, pha đá ngựa) → màn thắng 5s → khung kết 3–5s.

### Chuẩn bị
- Dùng điện thoại thật (máy có GPU chạy mức đồ hoạ cao; quay màn hình máy tính dễ bị hạ mức).
- Bật Không làm phiền, pin trên 50%, độ sáng tối đa, cầm dọc.
- Bật nhạc và hiệu ứng trong game. Quay màn hình iOS ghi được tiếng của game; nhấn giữ nút quay trong Trung tâm điều khiển để tắt micro nếu không thuyết minh.
- Cài phòng: 4 ghế (anh + 3 máy), Độ khó máy **Khó**, bật **Ván nhanh** (có pha đá sớm, ván ngắn), Nhịp ván **Vừa**, thời gian lượt 15 giây, **tắt** Tự đổ xúc xắc để tự bấm.
- Đặt tên ngựa cho vui (vd. "Xích Thố", "Ô Vân"…), tên sẽ hiện trên bàn cờ.

### Kịch bản (mốc thời gian của bản dài sau khi cắt)

| Mốc | Cảnh | Phụ đề gợi ý |
|---|---|---|
| 0:00–0:08 | Trang chủ: ván máy tự chơi, để yên vài giây cho thấy đèn lồng, câu đối, tượng ngựa vàng | Cờ cá ngựa 3D, chơi ngay trên trình duyệt |
| 0:08–0:18 | Bấm "Chơi ngay" → nhập tên → vào sảnh → tạo phòng | Không cài app, nhập tên là chơi |
| 0:18–0:35 | Phòng chờ: thêm 3 máy, chọn Khó, bật Ván nhanh, chọn Nhịp ván, đặt tên ngựa, bấm sao chép link | Thiếu người thì thêm máy. Rủ bạn bằng một đường link |
| 0:35–0:42 | Bấm Bắt đầu: ngựa minh hoạ bay về chuồng, camera bay về ghế | Vào ván, camera bay về chỗ ngồi của bạn |
| 0:42–1:30 | Đổ xúc xắc, ra chuồng, ngựa nhảy từng ô; gửi biểu cảm "Đá nè!"; **pha đá ngựa** có camera lướt sát; bấm "?" mở bảng luật 1–2 giây | Đúng luật cá ngựa Việt Nam · Đá ngựa có hiệu ứng hẳn hoi 😈 |
| 1:30–1:50 | Ngựa đầu tiên lên chuồng, màn thắng | Ván nhanh: ngựa đầu tiên lên chuồng là thắng |
| 1:50–2:00 | Khung kết: chữ trên nền tượng ngựa vàng | Free · Không quảng cáo · Link ở bình luận |

Ván thật thường dài hơn 50 giây: cứ quay cả ván (5–10 phút), lúc cắt chỉ giữ các pha đẹp. Pha đá ngựa phụ thuộc xúc xắc; nếu không có pha nào, chơi thêm một ván.

Cảnh nên có thêm nếu có máy thứ hai: dán link vào Zalo, máy kia bấm link, nhập tên, vào ngay phòng. Cảnh này chứng minh "rủ bạn bằng một link" rõ nhất.

**Bản ngắn 15–20 giây:** 0–2s chữ "Khi mày chờ ra 6 cả ván…" → pha đá ngựa với camera lướt sát → chữ "…và tao đá mày về chuồng 😈" → 2 giây cuối "Cờ cá ngựa 3D · link ở bình luận".

### Phụ đề

- Gemini đọc được video và viết phụ đề kèm mốc thời gian (yêu cầu xuất dạng file SRT). Kiểm tra lại mốc và chính tả trước khi dùng. Gemini tự gắn chữ vào video thành file mới được hay không thì tuỳ bản anh đang dùng, em chưa kiểm chứng.
- Video quay màn hình không có lời nói, nên phụ đề thực chất là chữ chú thích. Dùng cột "Phụ đề gợi ý" ở bảng trên sẽ sát nội dung hơn để AI tự đoán.
- Gắn chữ vào video: dùng CapCut (thêm chữ hoặc nhập file SRT), hoặc gửi em video gốc và file SRT, em ghép bằng `ffmpeg` (máy đã có bộ lọc `subtitles`) và cắt luôn bản ngắn.

## Lịch đăng gợi ý (sau khi deploy xong)

| Thời điểm | Kênh | Bài |
|---|---|---|
| Hôm nay, 20:00–21:30 | Facebook cá nhân | Bài 1 + bình luận vào bài hôm qua |
| Hôm nay, cùng tối | Threads, X | Bài 2 (chuỗi mở đầu) |
| Ngày mai, 11:30–13:00 | Nhóm "Vibe Code Kiếm Cơm" | Bài 4 |
| Ngày mai, 20:00–22:00 | Nhóm "Build in Public" | Bài 4, đổi câu mở đầu |
| Các ngày sau | Nhóm dev / AI / indie khác, mỗi ngày 1 nhóm | Bài 4, đổi câu mở đầu |
| Ngày 3–5 | Mỗi ngày 1 nhóm board game / hoài niệm / gia đình | Bài 3, đổi câu mở đầu cho từng nhóm, không đăng cùng nội dung nhiều nhóm một lúc |

Đo sau 48 giờ bằng truy vấn trong README (mục "Đo phễu người chơi"): `visit` và `guest_started` theo nguồn `facebook` / `threads` / `x`; `match_started_quick` so với `match_finished_quick`; đọc bảng `feedback`.
