(function(){
  var $ = function(id){ return document.getElementById(id); };
  var data = { no:[], fans:[], mut:[] }, tab = 'no';

  function userFromHref(h){
    var m = /instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/.exec(h || '');
    return m ? m[1] : '';
  }
  function clean(u){ return String(u || '').trim().replace(/^@/, '').toLowerCase(); }

  // Recorre el JSON y saca un usuario por cada entrada con string_list_data
  function fromJSON(node, out){
    if (Array.isArray(node)) { node.forEach(function(n){ fromJSON(n, out); }); return; }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.string_list_data)) {
      var s = node.string_list_data[0] || {};
      var u = clean(s.value) || clean(userFromHref(s.href)) || clean(node.title);
      if (u) out.add(u);
      return;
    }
    Object.keys(node).forEach(function(k){ fromJSON(node[k], out); });
  }
  function fromHTML(text, out){
    var doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('a[href*="instagram.com"]').forEach(function(a){
      var u = clean(userFromHref(a.getAttribute('href'))) || clean(a.textContent);
      if (u && !/\s/.test(u)) out.add(u);
    });
  }
  function kindOf(path){
    var base = path.split('/').pop().toLowerCase();
    if (!/\.(json|html?)$/.test(base)) return null;
    if (/^followers/.test(base)) return 'followers';
    if (/^following/.test(base) && !/hashtag/.test(base)) return 'following';
    return null;
  }
  function parseInto(name, text, sets){
    var kind = kindOf(name);
    if (!kind) return false;
    if (/\.json$/i.test(name)) {
      var j;
      try { j = JSON.parse(text); } catch (e) { return false; }
      fromJSON(j, sets[kind]);
    } else {
      fromHTML(text, sets[kind]);
    }
    return true;
  }

  async function handle(files){
    var sets = { followers:new Set(), following:new Set() }, used = 0;
    try {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (/\.zip$/i.test(f.name)) {
          if (!window.JSZip) throw new Error('nozip');
          var zip = await JSZip.loadAsync(f);
          var names = Object.keys(zip.files).filter(function(n){ return !zip.files[n].dir && kindOf(n); });
          for (var k = 0; k < names.length; k++) {
            if (parseInto(names[k], await zip.files[names[k]].async('string'), sets)) used++;
          }
        } else if (parseInto(f.name, await f.text(), sets)) used++;
      }
    } catch (e) {
      return say(e.message === 'nozip'
        ? 'No se pudo abrir el .zip. Descomprímelo y sube los archivos followers_1 y following.'
        : 'No se pudo leer el archivo. Comprueba que sea el .zip que te envió Instagram.');
    }
    if (!used) return say('Aquí no hay archivos de seguidores. Busca followers_1 y following dentro de la carpeta «connections/followers_and_following».');
    if (!sets.following.size) return say('Falta la lista de seguidos (archivo following). Súbela junto con followers_1.');
    if (!sets.followers.size) return say('Falta la lista de seguidores (archivo followers_1). Súbela junto con following.');
    compute(sets.followers, sets.following);
    say('Listo: ' + sets.following.size + ' seguidos y ' + sets.followers.size + ' seguidores leídos.', true);
    $('how').open = false;
  }

  function compute(followers, following){
    var sort = function(a){ return a.sort(function(x, y){ return x.localeCompare(y); }); };
    data.no   = sort(Array.from(following).filter(function(u){ return !followers.has(u); }));
    data.fans = sort(Array.from(followers).filter(function(u){ return !following.has(u); }));
    data.mut  = sort(Array.from(following).filter(function(u){ return followers.has(u); }));
    $('c-no').textContent = data.no.length;
    $('c-fans').textContent = data.fans.length;
    $('c-mut').textContent = data.mut.length;
    render();
  }

  // Cuentas ocultas a mano (famosos, marcas...). Se recuerdan en este navegador.
  var hidden = new Set(), showHidden = false;
  try { hidden = new Set(JSON.parse(localStorage.getItem('wnfm-hidden') || '[]')); } catch (e) {}
  function saveHidden(){ try { localStorage.setItem('wnfm-hidden', JSON.stringify(Array.from(hidden))); } catch (e) {} }

  function shown(){
    var q = clean($('q').value);
    return data[tab].filter(function(u){
      return hidden.has(u) === showHidden && (!q || u.indexOf(q) !== -1);
    });
  }
  function render(){
    var rows = shown(), ul = $('list');
    ['no','fans','mut'].forEach(function(k){
      $('c-' + k).textContent = data[k].filter(function(u){ return !hidden.has(u); }).length;
    });
    var nHidden = data[tab].filter(function(u){ return hidden.has(u); }).length;
    $('toggle').textContent = showHidden ? 'Volver a la lista' : 'Ver ocultas (' + nHidden + ')';
    ul.textContent = '';
    if (!rows.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = $('q').value ? 'Ningún usuario coincide con la búsqueda.'
        : showHidden ? 'No has ocultado ninguna cuenta de esta lista.' : 'Nadie en esta lista.';
      ul.appendChild(li);
    }
    rows.forEach(function(u, i){
      var li = document.createElement('li');
      var n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
      var s = document.createElement('span'); s.className = 'u'; s.textContent = '@' + u;
      var a = document.createElement('a'); a.href = 'https://www.instagram.com/' + encodeURIComponent(u) + '/';
      a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ver perfil';
      var h = document.createElement('button'); h.type = 'button'; h.className = 'hide';
      h.textContent = showHidden ? 'Mostrar' : 'Ocultar';
      h.addEventListener('click', function(){
        if (hidden.has(u)) hidden.delete(u); else hidden.add(u);
        saveHidden(); render();
      });
      li.appendChild(n); li.appendChild(s); li.appendChild(h); li.appendChild(a);
      ul.appendChild(li);
    });
    $('foot').textContent = tab === 'no'
      ? 'Usa «Ocultar» para quitar famosos o marcas que no esperas que te sigan. Las cuentas desactivadas o que cambiaron de nombre hace poco pueden aparecer aquí por error.'
      : '';
  }
  function say(text, good){
    var el = $('status');
    el.textContent = text;
    el.className = good ? 'msg good' : 'msg';
  }

  // Eventos
  $('pick').addEventListener('click', function(){ $('file').click(); });
  $('file').addEventListener('change', function(e){ if (e.target.files.length) handle(Array.from(e.target.files)); e.target.value = ''; });
  var drop = $('drop');
  ['dragenter','dragover'].forEach(function(t){ drop.addEventListener(t, function(e){ e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(t){ drop.addEventListener(t, function(e){ e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function(e){ var fs = Array.from(e.dataTransfer.files || []); if (fs.length) handle(fs); });
  document.querySelectorAll('.tab').forEach(function(b){
    b.addEventListener('click', function(){
      tab = b.dataset.k;
      document.querySelectorAll('.tab').forEach(function(x){ x.setAttribute('aria-selected', String(x === b)); });
      render();
    });
  });
  $('q').addEventListener('input', render);
  $('toggle').addEventListener('click', function(){ showHidden = !showHidden; render(); });
  $('copy').addEventListener('click', function(){
    var btn = $('copy'), text = shown().map(function(u){ return '@' + u; }).join('\n');
    var done = function(ok){ btn.textContent = ok ? 'Copiada' : 'No se pudo copiar'; setTimeout(function(){ btn.textContent = 'Copiar lista'; }, 1600); };
    try { navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); }); }
    catch (e) { done(false); }
  });

  // Estado inicial: cuentas inventadas, marcadas como ejemplo
  compute(
    new Set(['cami.rojas','juanes_fotos','lau.mtz','andres.dev','sofi_viaja','tienda.cafe.bog','primo.david']),
    new Set(['cami.rojas','juanes_fotos','lau.mtz','andres.dev','futbol.diario','marca_ropa_oficial','recetas.faciles','ex.companero.u','memes.col'])
  );
})();
