# Mini UniKey Hybrid Chrome Extension v3.6

Mini UniKey Hybrid là một Chrome Extension nhỏ mô phỏng cách gõ Telex tiếng Việt của UniKey ngay trong trình duyệt. Extension có 2 cách dùng:

- Convert trong popup: nhập Telex vào textarea, xem kết quả tiếng Việt ở ô output.
- Gõ trực tiếp trên trang web: extension tự chuyển Telex trong `input`, `textarea`, `contenteditable`, một số editor dùng `role="textbox"`, shadow DOM và iframe cùng origin.

## Quá trình tạo extension

Extension được xây dựng theo hướng tách phần lõi chuyển Telex ra khỏi phần giao diện và phần xử lý nhập liệu trên web:

- `engine.js`: chứa logic chuyển Telex sang tiếng Việt, gồm dấu thanh `s f r x j`, dấu mũ `aa ee oo dd`, dấu `w` như `aw ow uw`, trường hợp `uo + w -> ươ`, quy tắc `qu/gi`, vị trí đặt dấu và cơ chế gõ lại phím để hoàn tác.
- `popup.html`, `popup.css`, `popup.js`: tạo cửa sổ popup để convert văn bản theo kiểu đầy đủ, không phụ thuộc vào trạng thái gõ trên trang web.
- `content.js`: chạy trong trang web, lắng nghe sự kiện nhập liệu và chỉ xử lý từ đang gõ quanh con trỏ.
- `manifest.json`: khai báo Chrome Extension Manifest V3, quyền `storage`, content script và popup.

Trong quá trình phát triển, popup được dùng làm "ground truth" vì nó xử lý toàn bộ chuỗi text bằng `processText`. Phần khó hơn là gõ trực tiếp trên web, vì nội dung đang hiển thị không còn phản ánh đầy đủ chuỗi phím gốc mà người dùng vừa gõ. Ví dụ khi đã chuyển thành `nói`, nếu người dùng gõ thêm `s` để hoàn tác dấu, extension cần hiểu raw input là `noiss`, không chỉ nhìn vào chữ đang hiển thị.

Từ v3.6, `content.js` dùng raw-word buffer để lưu chuỗi phím gốc theo từng element. Nhờ vậy các case như `nois -> nói`, rồi gõ thêm `s` để ra lại `nois`, hoạt động gần với popup hơn.

## Cách hoạt động

### Popup convert

1. Người dùng mở popup của extension.
2. Nhập Telex vào ô "Cửa sổ convert Telex".
3. `popup.js` gọi `window.MiniUniKeyEngine.processText(...)`.
4. Kết quả tiếng Việt hiển thị ở ô "Output tiếng Việt".
5. Có thể bấm "Copy Output" để copy kết quả.

### Gõ Telex trực tiếp trên trang web

1. `content.js` được inject vào các trang web theo `manifest.json`.
2. Extension lắng nghe `beforeinput`, `input` và `compositionend`.
3. Với `input` và `textarea`, extension lưu phím vừa gõ vào raw-word buffer, gọi `processWord(raw)`, rồi thay thế đúng phần word hiện tại.
4. Với `contenteditable`, extension ưu tiên sửa trực tiếp text node đang chứa caret để giảm nhảy con trỏ và giữ cấu trúc DOM của editor.
5. Khi người dùng gõ khoảng trắng, ký tự không phải chữ, paste hoặc di chuyển sang vùng khác, state có thể được reset để tránh chuyển nhầm.

Extension bỏ qua `input[type="password"]`, vì vậy ô mật khẩu sẽ giữ nguyên nội dung người dùng nhập và không bị chuyển Telex.

## Cài đặt vào Chrome

1. Mở Chrome.
2. Vào `chrome://extensions`.
3. Bật "Developer mode" ở góc phải phía trên.
4. Bấm "Load unpacked".
5. Chọn thư mục chứa các file của extension này, tức thư mục có `manifest.json`.
6. Sau khi load xong, Chrome sẽ hiển thị extension "Mini UniKey Hybrid".

Nếu đã cài trước đó và vừa sửa code, vào `chrome://extensions` rồi bấm nút reload của extension để Chrome nạp lại bản mới.

## Cách bật/tắt chuyển Telex trực tiếp trên trang web

1. Bấm icon extension "Mini UniKey Hybrid" trên thanh công cụ Chrome.
2. Trong popup, dùng checkbox "Bật chuyển Telex trực tiếp trên trang web".
3. Khi checkbox bật, extension sẽ chuyển Telex trực tiếp trong các ô nhập liệu được hỗ trợ trên trang web.
4. Khi checkbox tắt, extension không chuyển Telex trực tiếp trên trang web. Popup convert vẫn có thể dùng để convert text trong cửa sổ popup.

Trạng thái bật/tắt được lưu bằng `chrome.storage.sync`, nên Chrome có thể giữ lại lựa chọn này giữa các lần mở trình duyệt.

## Ví dụ Telex

- `tieengs` -> `tiếng`
- `duowngf` -> `dường`
- `aws` -> `ắ`
- `aas` -> `ấ`
- `nois` -> `nói`
- `noiss` -> `nois`

## Giới hạn hiện tại

- Một số editor phức tạp như Gmail, ChatGPT, Slate hoặc Draft.js có thể có edge case riêng vì chúng tự quản lý DOM và selection.
- Extension ưu tiên giảm nhảy caret bằng cách sửa text node trực tiếp, nhưng vẫn có fallback rewrite nội dung khi cần.
- Chưa có dictionary check, nên một số từ tiếng Anh có thể bị chuyển nếu gõ giống pattern Telex.

## Nguồn tạo

Extension này được tạo và cải tiến với sự hỗ trợ của ChatGPT và Codex (CodeX).
