/* Theme vor dem ersten Rendern setzen – verhindert Dark-Mode-Aufblitzen. */
(function(){
  try{
    const roh = localStorage.getItem('progression');
    if(!roh) return;
    const s = JSON.parse(roh);
    const wunsch = s && (s.theme === 'light' || s.theme === 'dark') ? s.theme : null;
    const dunkel = wunsch
      ? wunsch === 'dark'
      : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dunkel ? 'dark' : 'light';
  }catch{ /* Speicher nicht lesbar – Vorgabewert bleibt */ }
})();