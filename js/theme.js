/* 화면이 그려지기 전에 저장해 둔 다크/라이트 모드를 먼저 적용한다 (깜빡임 방지) */
(function () {
  try {
    var t = localStorage.getItem('pair-card-studio:theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* 저장소를 못 쓰면 시스템 설정을 따른다 */ }
})();
