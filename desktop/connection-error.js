const button = document.querySelector('button');
button.addEventListener('click', async () => {
  button.disabled = true;
  try {await window.legacyConnection.retry();}
  catch {document.querySelector('#error').textContent = 'Chưa thể thử lại. Hãy mở lại ứng dụng.'; button.disabled = false;}
});
