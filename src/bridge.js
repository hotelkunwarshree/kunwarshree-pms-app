/* Website ke andar chalne wala chhota code (page load hone se PEHLE).
   Website me koi badlav nahi chahiye — ye wahi kaam app ke raste kara deta hai:

   1. 🖨  Print   — website chhupe iframe ka print() bulati hai. WebView me
                    print() kuch nahi karta, isliye parchi ka HTML app ko
                    bhejte hain → Android ka print dialog (printer / PDF).
   2. ⬇  Download — CSV / Excel / Backup blob link se aate hain. WebView unhe
                    save nahi kar pata, isliye file app ko bhejte hain →
                    "Share / Save" (Files, Drive, WhatsApp…).
   RawBT (rawbt:) aur Google login app khud pakadta hai (App.js). */

export const BRIDGE_JS = `
(function () {
  if (window.__ksApp) return;
  window.__ksApp = true;
  var RN = window.ReactNativeWebView;
  function post(m) { try { RN.postMessage(JSON.stringify(m)); } catch (e) {} }

  /* ── 🖨 PRINT ── */
  function sendPrint(doc) {
    try {
      var root = doc.documentElement.cloneNode(true);
      var head = root.querySelector('head');
      if (head && !head.querySelector('base')) {
        var b = doc.createElement('base');
        b.href = location.origin + '/';
        head.insertBefore(b, head.firstChild);
      }
      post({ type: 'print', title: doc.title || 'Print', html: '<!doctype html>' + root.outerHTML });
    } catch (e) { post({ type: 'log', msg: 'print: ' + e }); }
  }
  function patchPrint(w) {
    try {
      if (!w || w.__ksPrint) return;
      w.__ksPrint = true;
      w.print = function () { sendPrint(w.document); };
    } catch (e) {}
  }
  patchPrint(window);
  var cw = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  if (cw && cw.get) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true, enumerable: cw.enumerable,
      get: function () { var w = cw.get.call(this); patchPrint(w); return w; }
    });
  }

  /* ── ⬇ DOWNLOAD ── website link turant "revoke" kar deti hai, isliye blob pehle hi yaad rakh lo */
  var blobs = {};
  var mk = URL.createObjectURL, rv = URL.revokeObjectURL;
  URL.createObjectURL = function (o) {
    var u = mk.call(URL, o);
    try { if (o instanceof Blob) blobs[u] = o; } catch (e) {}
    return u;
  };
  URL.revokeObjectURL = function (u) {
    setTimeout(function () { delete blobs[u]; try { rv.call(URL, u); } catch (e) {} }, 60000);
  };
  function sendBlob(blob, name) {
    var r = new FileReader();
    r.onload = function () {
      var s = String(r.result || ''), i = s.indexOf(',');
      post({ type: 'download', name: name, mime: blob.type || 'application/octet-stream', base64: s.slice(i + 1) });
    };
    r.onerror = function () { post({ type: 'log', msg: 'download read failed' }); };
    r.readAsDataURL(blob);
  }
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.href || '';
    if (this.hasAttribute('download') && /^(blob|data):/.test(href)) {
      var name = this.getAttribute('download') || 'download';
      if (blobs[href]) { sendBlob(blobs[href], name); return; }
      fetch(href).then(function (r) { return r.blob(); })
        .then(function (b) { sendBlob(b, name); })
        .catch(function () { post({ type: 'log', msg: 'download failed' }); });
      return;
    }
    return click.apply(this, arguments);
  };
})();
true;
`

/* login ke baad: website ki jagah par session rakh do aur page dobara kholo */
export const loginJS = (key, session) => `
(function () {
  try { localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(session))}); } catch (e) {}
  location.replace(location.origin + '/pms');
})();
true;
`

/* RawBT khul gaya → website ko batao (warna wo "RawBT nahi mila" dikhati hai) */
export const RAWBT_OK_JS = `try { window.dispatchEvent(new Event('blur')); } catch (e) {} true;`

/* app kya-kya kar sakti hai — website isse dekh kar option dikhati hai
   (purani app me ye nahi hota, to website "app update karein" kehti hai) */
export const capsJS = (caps) => `
try { window.__ksAppCaps = ${JSON.stringify({ v: 2, ...caps })}; } catch (e) {}
true;
`

/* 📡 Wi-Fi printer ka jawab website ko */
export const lanDoneJS = (id, ok, msg) => `
try { window.__ksLanDone && window.__ksLanDone(${JSON.stringify(String(id || ''))}, ${ok ? 'true' : 'false'}, ${JSON.stringify(String(msg || ''))}); } catch (e) {}
true;
`

/* 🔵 paired Bluetooth printers ki list website ko */
export const btListJS = (id, ok, data) => `
try { window.__ksBtList && window.__ksBtList(${JSON.stringify(String(id || ''))}, ${ok ? 'true' : 'false'}, ${JSON.stringify(data ?? null)}); } catch (e) {}
true;
`
