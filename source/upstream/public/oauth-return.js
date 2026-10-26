'use strict';
try {
  const target=LDSDiscordLogin.returnToEditor(location.href,sessionStorage);
  history.replaceState(null,'',location.pathname);
  location.replace(target);
} catch(error) {
  history.replaceState(null,'',location.pathname);
  document.getElementById('result').textContent=error.message;
}
