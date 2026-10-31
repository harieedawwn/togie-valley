# Tạo và cập nhật APK Togie Valley (không cần Android Studio)

APK là một "vỏ mỏng" mở game từ GitHub Pages, nên **APK chơi được online (nhiều người chơi)** và tự cập nhật game, không cần cài lại APK cho mỗi lần sửa game.

1. Tạo repo GitHub, tải TOÀN BỘ dự án lên nhánh `main` (nhớ cả thư mục ẩn `.github`; nếu kéo thả không thấy, dùng GitHub Desktop).
2. Bật GitHub Pages: vào **Settings > Pages**, ở mục **Build and deployment** chọn **Deploy from a branch**, Branch `main`, thư mục `/ (root)`, bấm **Save**. Đợi 1-2 phút.
3. Mở tab **Actions**, chọn **Build APK** (cột trái), bấm **Run workflow** (nhánh `main`). Đợi 5-10 phút đến khi có dấu tích xanh.
4. Vào trang chính của repo, bấm **Releases** (cột phải), mở bản **latest**, tải **Togie_Valley.apk**. Link tải này không bao giờ đổi.
5. Chép APK sang điện thoại, mở file, cho phép **Cài đặt ứng dụng không rõ nguồn** nếu máy hỏi, rồi bấm Cài đặt. Lần mở đầu tiên cần có mạng.

## Cập nhật game bình thường
- Tải file game mới lên nhánh `main` (gồm cả `sw.js`, `version.json`, `js/updater.js` trong gói bản vá). Chỉ cần đợi Pages cập nhật (1-2 phút).
- Lần sau người chơi mở app hoặc quay lại app, ở màn hình chính hoặc menu tạm dừng sẽ hiện bảng **Có bản cập nhật mới!**, bấm **Cập nhật ngay** là xong. Không bao giờ hiện giữa lúc đang chơi minigame.
- Dữ liệu lưu game được giữ nguyên.

## Khi nào phải cài lại APK
- Chỉ khi bản vá đổi phần "vỏ" Android (nằm trong gói bản vá, có ghi rõ). Khi đó app hiện bảng **Cần cài lại ứng dụng** với nút tải APK mới.
- Android luôn hỏi người dùng bấm Cài đặt; không có cách cài ngầm. APK được ký bằng một khóa cố định (`tools/togie-debug.keystore`) nên cài đè lên bản cũ vẫn giữ dữ liệu.

## Kiểm tra Pages đã chạy
- Mở `https://TÊN-BẠN.github.io/TÊN-REPO/` trên trình duyệt: thấy game là được. Mở thêm `.../version.json` để xem số bản hiện tại.
- Nếu báo 404: chờ thêm vài phút hoặc kiểm tra lại bước 2. Repo Private cần gói GitHub trả phí mới dùng Pages; nên để Public.

## Ghi chú
- Nếu máy chủ relay (Cloudflare Worker) có giới hạn Origin, phải cho phép `https://TÊN-BẠN.github.io`.
- Nhạc: bỏ `01.mp3`, `02.mp3`... vào thư mục `music/` trước khi tải lên.
- Đây là APK **debug**, chỉ để chơi cá nhân. Lỗi build: xem dòng đỏ trong log ở Actions, bấm **Re-run jobs** nếu là lỗi mạng.
