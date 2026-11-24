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
| Free; nhập tên là chơi; rủ bạn bằng link; máy Dễ/Thường/Khó | |
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
> ✅ Free. Nhập tên là chơi, không cần đăng ký, không cần cài app.
>
> Ván nào bị đá ngay trước cửa chuồng thì comment kể cho tui nghe nha 😆 Thấy chỗ nào dở bấm "Góp ý" trong game, tui sửa liền 🙏
>
> #CoCaNgua #CoCaNguaOnline #NgayVanHoaVietNam #TroChoiTuoiTho #GameViet #Claude #ClaudeCode #Blender #VibeCoding

Ảnh: `truoc-sau-1080x1248.jpg` (ảnh đầu) → `ngua-truoc-sau-1600x924.jpg` → clip pha đá (hoặc `da-ngua-2-khung-1600x884.jpg`) → `tet-board-780x1560.jpg`.
**Sau khi đăng:** bình luận vào bài 21/11: "Bản mới lên rồi nè: [link bài mới]".

---

## 2. Nhóm code (Vibe Code Kiếm Cơm, Build in Public…)

Link: `https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook`

Trước khi đăng: đọc nội quy nhóm (tag `#share`, ngày được đăng link, có cho đăng link trong bài không); mỗi nhóm cách nhau vài giờ và đổi nhẹ câu mở; trả lời bình luận nhanh trong giờ đầu.

> 👋 Chào mọi người, em là Johnny ạ
>
> Cờ Cá Ngựa 3D Online: rủ nhau một ván, vui như hồi nhỏ 🐴
>
> Nhân Ngày Văn hoá Việt Nam hôm nay, em xin giới thiệu game em vibe code cùng AI agent, để mình cùng chơi lại một trò tuổi thơ rất Việt Nam 🧧
>
> Ý tưởng rất đơn giản: nhóm bạn hay cả gia đình, đi cafe hay ở nhà, đều có thể chơi ngay một ván cờ cá ngựa ngay trên điện thoại hoặc tablet, với thiết kế 3D đồ họa đậm chất Việt, chỉ bằng một đường link. Khỏi phải đi tìm mua bộ cờ cá ngựa ở ngoài. Nhanh lẹ, free, giải trí nhanh cho anh chị em hội nhóm.
>
> Điểm nổi bật:
>
> 🎮 Chơi ngay trên trình duyệt, nhập tên là chơi, không cần cài app, không cần đăng ký. Free ạ.
>
> 📜 Có bảng luật ngay trong ván, quên luật là bấm xem liền.
>
> 🏮 Bàn cờ 3D như phòng khách ngày Tết: quân ngựa gỗ, bàn sơn mài, đèn lồng, câu đối, tượng "Mã đáo thành công".
>
> 📊 Bảng đá ngựa: xem ai đá nhiều nhất nhà.
>
> 👨‍👩‍👧 Rủ bạn bằng link, phòng công khai hoặc riêng tư, thiếu người thì có máy chơi cùng (Dễ, Thường, Khó).
>
> 🚪 Đang chơi dở vẫn xin vào thay máy được, chủ phòng bấm duyệt.
>
> ⚡ Mode "Ván Nhanh" cho anh em chơi nhanh gọn: 1 ngựa lên chuồng là thắng.
>
> ⏱️ Tùy chọn thời gian ván: 20, 30, 60 phút hay vô hạn.
>
> Link game em để ở phần bình luận ạ.
>
> Vì là sản phẩm cá nhân nên chắc chắn còn nhiều điểm cần cải thiện, rất mong các bác chơi thử và góp ý về giao diện, tính năng hoặc chỗ nào chưa hợp lý để em hoàn thiện thêm ạ. Cho em hỏi luôn: hồi nhỏ nhà các bác chơi cờ cá ngựa luật thế nào, ra chuồng bằng 6 hay 1 hoặc 6? 😄
>
> Cảm ơn BQT đã duyệt và mọi người đã đọc bài 😍
>
> #bipvn #buildinpublicvn #buildinpublic #CoCaNgua #NgayVanHoaVietNam

**Bình luận đầu tiên (anh tự đăng ngay sau khi đăng bài):**

> 🎮 Chơi thử: https://ca-ngua-online.johnny-bui1911.workers.dev/?utm_source=facebook
> Luật chơi đầy đủ + giới thiệu: https://ca-ngua-online.johnny-bui1911.workers.dev/gioi-thieu?utm_source=facebook

Nếu nhóm cho đăng link trong bài, dán link vào ngay sau câu "Free ạ." và bỏ dòng "Link game em để ở phần bình luận ạ".

Ảnh (album, 4 ảnh đầu hiện ra ngoài, nên xếp theo thứ tự):
1. Có clip pha đá thì clip đầu tiên; chưa có thì `ngua-truoc-sau-1600x924.jpg` (ảnh kể chuyện "trước và sau")
2. `da-ngua-2-khung-1600x884.jpg`
3. `tuong-ma-dao-thanh-cong-2400x1600.jpg`
4. `trang-chu-desktop-2400x1500.jpg` (thấy nút "Chơi ngay")
5. `4-ngua-4-mau-2000x1333.jpg`
6. `trang-chu-mobile-1170x2532.jpg`
7. `gioi-thieu-desktop-2400x1500.jpg`
8. `truoc-sau-1080x1248.jpg`

Cần anh xác nhận trước khi đăng:
- Đoạn "Ý tưởng rất đơn giản" viết theo ý anh; chỗ "chỉ bằng ..." anh bỏ trống, em điền "một đường link". Sửa nếu anh muốn từ khác.
- "Điện thoại hoặc tablet": em chỉ kiểm điện thoại và máy tính; tablet chưa kiểm.
- Mọi tính năng trong bài đều có trên bản live (đã quay và chụp trong bộ ảnh/video). Không nhắc Fable 5.2, 1 prompt, bản 21/11.
- Link worker.dev sẽ đổi khi có domain mới; thay link trong bình luận trước khi đăng.
