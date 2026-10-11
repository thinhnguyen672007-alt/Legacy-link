const input = document.querySelector('input'), button = document.querySelector('button'), error = document.querySelector('#error');
window.legacySetup.getServer().then(url => {input.value = url || '';});
document.querySelector('form').addEventListener('submit', async e => {
  e.preventDefault(); button.disabled = true; error.textContent = 'Đang kiểm tra máy chủ…';
  try {const result = await window.legacySetup.connect(input.value); error.textContent = result.error || '';}
  catch {error.textContent = 'Không thể kết nối. Kiểm tra địa chỉ rồi thử lại.';}
  finally {button.disabled = false;}
});
