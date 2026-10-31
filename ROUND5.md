# Round 5
- [x] S1 Tools, baseline, logic audit
- [ ] S2 Performance (render + simulation)
- [ ] S3 Multiplayer smoothing (runs in parallel with S2)
- [ ] S4 Actions: fishing chain, everyday actions, fish icons + 3D fish
- [ ] S5 Farm: 37 distinct crops, ripe moment, farm action animations
- [ ] S6 World: small details everywhere, ambient life, night light
- [ ] S7 Integrate, perf recheck, independent review, version bump, zip

Baseline screenshots: shots/baseline/<preset>-<desktop|phone>.png (S1, after the script-order fix below). Perf: docs/PERF_REPORT.md "Round 5 baseline".

## Điểm yếu hình ảnh
Xếp theo mức ảnh hưởng (preset: vấn đề).
1. farm, crops, river, town, village (cả PC và điện thoại): rải rác khắp màn hình có những mảnh vuông/hình thoi **màu đen** nhỏ (lá rơi/cánh hoa bị mất màu?). Nhìn như lỗi bẩn, rất dễ thấy trên nước và đất.
2. crops: cây chín và cây non khó phân biệt; hầu hết cây chín chỉ là một cụm lá nhỏ thấp, bí ngô/hoa là ngoại lệ. 37 loại cây trông na ná nhau ở mọi giai đoạn.
3. crops / farm: hàng rào trong của mảnh đất ban đầu vẫn còn khi đất đã mở rộng, cắt ngang qua luống; phần đất khóa/chưa trồng là một mảng cam phẳng rất lớn, trống trơn.
4. farm: mảnh đất trống là một khối nâu đặc không có luống, cỏ, sỏi hay vết cuốc; chiếm nửa khung hình mà không có chi tiết gì.
5. night: 21:00 chỉ là ảnh ban ngày nhuộm tím; đèn lồng, cột đèn, cửa sổ không phát sáng, không có quầng sáng, đom đóm hay ánh trăng trên nước.
6. icons: túi hạt giống của 37 loại gần như giống hệt nhau (chỉ khác chấm màu nhỏ); permit_1..4 là cùng một đồng xu; các món nấu (bowl) và các loài cá (cùng một dáng) khó phân biệt ở 48 px.
7. town / village / farm-desktop: hiệu ứng "đục lỗ" chấm halftone khi cây/mái che nhân vật tạo mảng chấm đen xám trên lá và mái (đặc biệt cây dừa ở town, mái tiệm nội thất), nhìn như lỗi in.
8. house (nhất là điện thoại): căn phòng nhỏ lọt thỏm giữa nền nâu trống chiếm 2/3 màn hình; tường phẳng, ít đồ, không có ánh sáng ấm, tường trái phủ ô carô tím (dither) trông như lỗi texture.
9. river: mặt nước rộng mênh mông chỉ có vệt sóng trắng; không có bóng cá, lục bình, thuyền gần, chim hay phản chiếu; vòng tròn trắng quanh chân cọc nhìn như sprite rời.
10. Điện thoại (mọi preset): ảnh render độ phân giải thấp, viền răng cưa/pixel hóa rõ (outline nhân vật, rìa mái, chữ trên biển); camera dọc quá gần nên chỉ thấy rất ít thế giới.
11. Điện thoại: minimap đè lên nút xoay camera (khung xoay nằm ngay dưới và chạm minimap), thanh năng lượng không có số.
12. village: "làng" thực ra là bãi cỏ với vài món rời (xích đu, dây phơi); vật hình chữ X màu xanh nằm bẹt trên cỏ (cối xay/chong chóng tre?) trông như lỗi mô hình; không có nhà dân, hàng rào tre, ao, người.
13. rain: chỉ có vạch mưa thẳng và vòng gợn; mặt đất không ướt/tối hơn, không vũng nước, không ai che dù; ánh sáng giống hệt ban ngày nhuộm xám.
14. town: chợ đẹp nhưng vắng: không có người mua, NPC đứng yên sau quầy, mái lá dừa phía trước che mất nhân vật.
15. farm-desktop: viền nhà và sườn nhà (mặt tối) có pattern carô xanh tím dither giống tường nhà trong.

## Logic audit (S1)
Đã sửa (lỗi rõ ràng, không đổi cân bằng):
- Mẹo mồi giun / mồi bột / mồi cá nhỏ và gợi ý câu đêm nhắc tới loài cá đã bị xóa (cá vền, tinca, cá vàng, cá chó, cá hồi): sửa thành đúng loài thích mồi đó (data_fish.js, fishing.js).
- Mẹo cần trúc "nước lặng thì cá cắn nhiều hơn" ngược với code (mưa cá cắn nhanh hơn): sửa (items.js).
- Mô tả Cơm nắm nói về cây lúa trong ruộng: sửa (data_shop.js).
- Nhãn khóa món nấu "Lv 3" khác cửa hàng "Cấp 3": thống nhất "Cấp" (cooking.js).
- Nâng cấp cuốc/bình tưới hứa giảm năng lượng x0.85 mỗi bậc nhưng State.setEnergy làm tròn mất phần lẻ (bình tưới mọi bậc vẫn tốn 1, cuốc Đồng vẫn tốn 2): useEnergy giờ cộng dồn phần lẻ (state.js).
- Lỗi khởi động: chunks.js nạp trước models_props.js và chill_spots.js nạp trước seat.js nên Game.Chunks và Game.ChillSpots không bao giờ chạy (2 lỗi console mỗi lần mở game): đổi thứ tự trong index.html.

## Cần anh quyết
Đã duyệt tất cả (31/10) và đã làm: 1 tiền thùng bán chia theo người bỏ vào (slot.o, Economy.owed cho người vắng), 2-3 DESIGN.md cập nhật theo code + bỏ dòng mất vàng, 4 hướng dương bán 260, 5 mốc cấp hạt theo DESIGN, 6 khách dùng cấp/món ăn của mình, 7 túi đầy thì gửi vào rương nhà, 8 giữ nguyên, 9 mẹo khác mùa trong bếp.

1. **Thùng bán chung trong chơi nhiều người chỉ trả tiền cho chủ phòng** (shop.js:41, time.js:155): khách bỏ nông sản/cá vào thùng chung nhưng không nhận đồng nào. Đề xuất: ghi người bỏ vào cho từng chồng đồ và trả tiền cho đúng người khi thức dậy.
2. **Câu cá chờ lâu hơn nhiều so với DESIGN** (§6: chờ 2-8 giây, cửa sổ cắn 0,9 giây; code: 3-48 giây, tối đa 60, cửa sổ 1,8 giây). Đề xuất: giữ code (đã gắn với bóng cá), cập nhật DESIGN.md.
3. **Thức khuya**: DESIGN §2 nói 26:00 ngất, mất 10% tiền (tối đa 500); code chạy tới 30:00, ngất chỉ còn 30% năng lượng, không mất tiền, dòng "mất N vàng" là code chết. Đề xuất: giữ luật hiện tại, sửa DESIGN và xóa dòng chết.
4. **Hướng dương lỗ tiền**: hạt 200, bán 80, 1 lần thu, không tái sinh, lỗ 120 mỗi cây. Đề xuất: giá bán 80 -> 260 (hoặc hạt 200 -> 60).
5. **Mức cấp mở hạt giống** khắt khe hơn DESIGN §5 (súp lơ/dưa lưới 80 vàng cần Cấp 3 thay vì Cấp 1; khế 400 cần Cấp 5 thay vì 6+). Đề xuất: theo DESIGN (<=100 Cấp 1, <=250 Cấp 2, <=400 Cấp 4, còn lại Cấp 6).
6. **Khách thu hoạch dùng cấp Làm nông của chủ phòng** để tính tỉ lệ vàng/bạc (farm.js:647). Đề xuất: gửi cấp của khách kèm lệnh thu hoạch, chủ phòng giới hạn 1-10.
7. **Khách thu hoạch có thể mất nông sản** nếu túi đầy giữa lúc gửi và lúc nhận (farm.js:722). Đề xuất: khi nhận mà túi đầy thì thả đồ ra đất/gửi vào hòm.
8. **Món nấu bán rẻ hơn nguyên liệu** (khoai nướng 60 < 2 khoai 160; canh củ cải 90 < ~130). Đề xuất: giữ (món nấu để lấy buff), hoặc nâng giá bán món lên ≈ 1,2x nguyên liệu.
9. **Tô quả mọng / Tiệc mùa gặt cần nguyên liệu khác mùa** (dâu xuân + việt quất hạ). Đề xuất: thêm một dòng mẹo "tích trữ nguyên liệu từ mùa trước" trong sổ công thức.
