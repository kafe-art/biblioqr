// Aplica el tema antes del primer render para evitar el parpadeo claro/oscuro.
// Archivo externo (no inline) para cumplir la Content Security Policy.
(function () {
  var saved = localStorage.getItem('biblioqr-theme')
  var dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  if (dark) document.documentElement.classList.add('dark')
})()
