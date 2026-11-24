# Bài đăng 24/11 (Ngày Văn hoá Việt Nam): bản cập nhật đêm 23→24/11

Xưng "tui". Thay bài 1 và bài 4 trong `social-posts.md` (bản đó viết cho bản 22/11, còn nói dưa hấu/mâm ngũ quả, pha đá cũ).

Bối cảnh đăng: anh chưa đăng bài nào trong campaign này, nên bài cá nhân vẫn nối tiếp bài ra mắt 21/11 13:15, còn bài nhóm code là bài đầu tiên ở nhóm.

## Đã đối chiếu với `main` @ c75e6ab và production (deploy 11:49 ngày 24/11)

| Được nói (có trong code/README) | Không nói |
|---|---|
| Ngựa vẽ lại: mô hình ngựa gỗ óc chó, bàn cờ sơn mài, chuồng đích dạng bậc thang, tượng ngựa chồm mạ vàng "Mã đáo thành công" (#56) | "Luật tung 1/6 lần thứ ba mất lượt": đang bị ẩn vì `DICE_SHAPING` bật |
| Pha đá: ngựa bật cao, đá hậu vào sườn ngựa kia, camera zoom cận; ngựa bị đá nhấc lên rồi bị hất bay vòng cung xoay 2 vòng, camera lùi ra theo tới chuồng; bụi, chớp sáng, tiếng gió (#62) | Pha đá chạy ở mọi máy: chỉ ở chất lượng cao/trung bình, máy yếu hoặc "Hoạt cảnh: Giảm" thấy bản gọn |
| Khói hoạt hình, vòng sáng vàng, sao chóng mặt quanh ngựa bị đá (e9d6450, f62639f) | Đăng nhập Google/Facebook/X (production tắt cả 3), xếp hạng, chat, "đông người chơi" |
| HUD làm lại cho điện thoại, biểu tượng ghế (vương miện chủ phòng), hộp thắng hiện sau pháo hoa (#64, #65, #70), nhạc sảnh mới (#63) | "Miễn phí mãi mãi" |
| Free, No Ads; nhập tên là chơi; rủ bạn bằng link; máy Dễ/Thường/Khó | |
| Văn hoá trong game: câu đối đỏ, đèn lồng, hoa văn, tượng ngựa "Mã đáo thành công" | Cờ cá ngựa là "di sản/trò chơi dân gian chính thức": không có nguồn, chỉ nói "trò tuổi thơ của nhiều nhà" |

Tượng ngựa là mạ vàng chồm lên (không phải "ngựa vàng" trơn như bài 22/11). Ảnh dùng bản vừa lấy từ `main`.

## Ảnh/video (`../creatives/social/`)

| File | Dùng cho |
|---|---|
| `truoc-sau-1080x1248.jpg` | Ván thật trên điện thoại, cùng cỡ màn 390×844, chụp bằng Chrome có GPU từ hai bản chạy cục bộ. Trái: bản 22/11 (`35d7753`, ngựa dựng bằng hình khối, HUD cũ, tượng ngựa vàng). Phải: `main` @ c75e6ab (ngựa gỗ, bàn sơn mài, HUD mới). Ảnh đầu bài cá nhân |
| `ngua-truoc-sau-1600x924.jpg` | **Zoom cận ngựa**: cùng vị trí, cùng camera (cảnh dựng sẵn `stage.html?stage=da-ngua`, chất lượng cao). Trái ngựa khối bản 22/11, phải ngựa gỗ có vân bản mới. Ảnh thứ 2 của bài cá nhân, ảnh đầu của bài nhóm code |
| `da-ngua-2-khung-1600x884.jpg` | 2 khung hình thật của pha đá bản mới: ngựa bật cao đá hậu; ngựa bị đá bay vòng, khói, vòng sáng vàng, sao chóng mặt. Dùng khi chưa có clip |
| `tet-board-780x1560.jpg` | Ảnh dọc, thấy rõ ngựa gỗ + tượng |
| `og-1200x630.jpg` | Ảnh xem trước link |
| `tet-board-loop-7s.mp4` | Video lặp 7s cảnh bàn cờ |
| **Clip pha đá (anh cần quay)** | Quan trọng nhất cho cả 2 bài, vì anh muốn nhấn pha đá. Quay 15–20s trên điện thoại mạnh, chất lượng cao, Hoạt cảnh: Đầy đủ, nhịp Vừa; bật Ván nhanh + máy Khó để có pha đá sớm. Chữ 3 giây đầu: "Ra 6 là tao đá mày về chuồng 😈" |

Chưa có clip thì dùng ảnh trước/sau; em không quay được pha đá vì cần GPU thật và xúc xắc ngẫu nhiên.

---

## 1. Facebook cá nhân

Link: `https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook`

> Hôm qua tui share game lên nhóm chung với mấy anh em hội AI Doanh Nghiệp, được 1 đại ca feedback nâng cấp design con ngựa gỗ, dùng Blender. Đêm qua tui bảo AI triển ngay 🐴
>
> Có lẽ đây là task phức tạp nhất từ đầu tới giờ: phải nghiên cứu, chọn model phù hợp, review các bản vẽ, căn chỉnh độ bóng. Vẽ con ngựa xong đẹp quá nên làm tới luôn: chỉnh lại animation "đá" cho trông điện ảnh 🎬
>
> 🎮 Chơi thử: https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook
>
> 🐴 **Vẽ lại con ngựa**
> - Không còn là khối nhựa ghép bằng code nữa: giờ là quân ngựa gỗ có vân, chạy Blender dọn model rồi nhuộm màu từng bên
> - Thử vàng với gỗ, cuối cùng chọn gỗ óc chó cho hợp phòng khách đêm Tết. Bàn cờ thành sơn mài, chuồng đích làm thành từng bậc thang
> - Giữa phòng là tượng ngựa chồm mạ vàng "Mã đáo thành công". Cái này phải chỉnh độ bóng mấy vòng mới ra được màu vàng thật, không bị vàng bùn 🥇
>
> 💥 **Đá ngựa: giờ đúng là một pha điện ảnh**
> - Ngựa bật cao, đá hậu thẳng vào sườn ngựa kia, camera zoom cận vào pha va
> - Ngựa bị đá khựng một nhịp, nhấc lên từ từ rồi bị hất bay vòng cung, xoay hai vòng. Camera lùi ra theo, thấy nó rơi về chuồng, có bụi, chớp sáng, tiếng gió vút
> - Thêm khói hoạt hình, vòng sáng vàng và sao chóng mặt quay quanh con ngựa xấu số 😵‍💫
> - Máy yếu thì game tự giảm cho mượt; không thích chuyển động nhiều thì chọn "Hoạt cảnh: Giảm"
>
> 📱 **Làm lại màn chơi**: thanh điều khiển gọn lại cho điện thoại, ghế người chơi có biểu tượng riêng (chủ phòng có vương miện 👑), thắng thì xem pháo hoa xong mới hiện bảng kết quả 🎆
>
> 🧧 Nhân Ngày Văn hoá Việt Nam, hôm nay nhà nào còn cả nhà gần nhau thì bỏ điện thoại xuống chơi một ván cờ cá ngựa thật. Nhà ở xa thì gửi link vào nhóm Zalo gia đình, mỗi người một nơi vẫn đá nhau được. Thiếu người thì thêm máy (Dễ / Thường / Khó).
>
> ✅ Free, No Ads. Nhập tên là chơi, không cần đăng ký, không cần cài app.
>
> Ván nào bị đá ngay trước cửa chuồng thì comment kể cho tui nghe nha 😆 Thấy chỗ nào dở bấm "Góp ý" trong game, tui sửa liền 🙏
>
> #CoCaNgua #CoCaNguaOnline #NgayVanHoaVietNam #TroChoiTuoiTho #GameViet #Claude #ClaudeCode #Blender #VibeCoding

Ảnh: `truoc-sau-1080x1248.jpg` (ảnh đầu) → `ngua-truoc-sau-1600x924.jpg` → clip pha đá (hoặc `da-ngua-2-khung-1600x884.jpg`) → `tet-board-780x1560.jpg`.
**Sau khi đăng:** bình luận vào bài 21/11: "Bản mới lên rồi nè: [link bài mới]".

---

## 2. Nhóm code (Vibe Code Kiếm Cơm, Build in Public…)

Link: `https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook`

Trước khi đăng: đọc nội quy nhóm (tag `#share`, ngày được đăng link); mỗi nhóm cách nhau vài giờ và đổi nhẹ câu mở; trả lời bình luận nhanh trong giờ đầu.

> **[Chia sẻ dự án] Cờ Cá Ngựa 3D chơi ngay trên trình duyệt, làm cùng đội AI agent. Mong anh chị em chơi thử và góp ý 🙏**
>
> Chào cả nhà, xin phép admin cho tui chia sẻ một dự án nhỏ ạ. Nhân Ngày Văn hoá Việt Nam, tui muốn mời mọi người chơi thử một trò chơi rất Việt Nam: cờ cá ngựa.
>
> Tui là Johnny. Mấy ngày nay tui cho một đội AI agent làm game cờ cá ngựa 3D chạy trên trình duyệt (điện thoại và máy tính): nhiều người chơi chung một phòng, có máy chơi cùng. Đêm qua đội vừa làm lại toàn bộ phần nhìn (vẽ lại ngựa bằng Blender, làm lại HUD, làm animation đá ngựa), nên tui xin mời mọi người chơi thử:
>
> 🎮 https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook
> Không cài app, không đăng ký, nhập tên là chơi. Free, không quảng cáo.
>
> 🐴 **Game có gì**
> - **Con ngựa:** dựng bằng hình khối ghép bằng code thì mãi trông như quân cờ vua nhựa, nên đêm qua tui cho agent làm lại bằng mô hình ngựa gỗ (nguồn CC0 từ Poly Haven), chạy Blender không giao diện bằng script để dọn mesh, giảm số tam giác (~2.600), xuất glb. Mỗi màu nhuộm lên cùng một vân gỗ óc chó.
> - **Bàn cờ sơn mài, chuồng đích dạng bậc thang**, giữa phòng là tượng ngựa chồm mạ vàng "Mã đáo thành công". Phòng chơi có đèn lồng, câu đối đỏ, hoa văn.
> - **Làm lại HUD cho điện thoại:** thanh điều khiển gọn, biểu tượng ghế, hộp thắng hiện sau pháo hoa.
> - **Pha đá ngựa:** bật cao, đá hậu vào sườn ngựa kia, camera zoom cận; ngựa bị đá nhấc lên rồi bay vòng cung xoay hai vòng, camera lùi theo tới chuồng; có bụi, chớp sáng, khói hoạt hình, vòng sáng vàng, sao chóng mặt, tiếng gió. Chạy ở mức đồ hoạ cao/trung bình; máy yếu tự hạ cho mượt.
> - Vẫn đúng luật cá ngựa Việt Nam, phòng nhiều người rủ bằng link, thêm máy 3 mức Dễ/Thường/Khó, ván nhanh, đồng hồ lượt, rớt mạng thì máy giữ chỗ.
>
> 🛠️ **Vài dòng cho anh chị em cùng vibe code**
> - Cách làm: tui chốt hướng thiết kế trước, chia việc theo mảng, mỗi mảng một nhánh riêng chạy song song, review rồi mới gộp.
> - Bài học: AI làm rất nhanh nhưng "đẹp hay chưa" vẫn phải người quyết. Món giữa bàn tui đổi qua mâm ngũ quả → dưa hấu → tượng ngựa vàng; riêng con ngựa phải làm lại bằng mô hình thật, vì dựng bằng hình khối thì mãi không ra ngựa.
> - Stack: React Three Fiber + Cloudflare Workers / Durable Objects / D1, đang chạy trong gói miễn phí. Âm thanh tổng hợp bằng Web Audio, không dùng file nhạc.
>
> 🙏 **Tui rất mong góp ý**
> 1. Máy anh chị chạy có mượt không? Cho tui xin tên máy và trình duyệt.
> 2. Pha đá ngựa có "đã" không, hay hơi dài, hơi rườm?
> 3. Lần đầu vào có chỗ nào khó hiểu?
> 4. Gặp lỗi thì bấm nút "Góp ý" trong game hoặc bình luận giúp tui.
>
> Hôm nay Ngày Văn hoá, ai có tuổi thơ gắn với bàn cờ cá ngựa thì rủ người nhà chơi một ván nha. Cảm ơn mọi người đã đọc và chơi thử ạ!
>
> #CoCaNgua #CoCaNguaOnline #NgayVanHoaVietNam #VibeCoding #AIAgent #Claude #ClaudeCode #BuildInPublic #Blender #ThreeJS

Ảnh: clip pha đá (đầu; chưa có thì `da-ngua-2-khung-1600x884.jpg`) → `ngua-truoc-sau-1600x924.jpg` → `truoc-sau-1080x1248.jpg` → `og-1200x630.jpg`.

Cần anh xác nhận trước khi đăng:
- Em đã bỏ "Fable 5.2" và "1 prompt". Bài viết như bài giới thiệu đầu tiên ở nhóm, không nhắc bản 21/11.
- "Mâm ngũ quả → dưa hấu → tượng ngựa": lấy từ lịch sử PR #50–#56; nếu anh không muốn kể thì xoá câu đó.
- "~2.600 tam giác", Poly Haven CC0, Blender script: lấy từ `plans/reports/20261124-sumup-3d-wood-redesign.md`.
- Câu "Chạy ở mức đồ hoạ cao/trung bình" đúng theo README, nhưng em chưa mở production bằng mắt sau deploy 11:49; anh mở thử pha đá trước khi đăng.
