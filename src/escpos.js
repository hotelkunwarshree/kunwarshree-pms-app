/* 🧾 Website ka saada text → thermal printer ki bhasha (ESC/POS bytes).
   Text wahi hai jo RawBT ko jata hai (80mm = 48 akshar, 58mm = 32);
   yahan sirf printer ke "shuru karo", "aage badhao" aur "kaato" ke
   code jodte hain. Har copy ke baad kaagaz katta hai. */

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

/* printer sirf saade English akshar jaanta hai */
const SWAP = {
  '₹': 'Rs', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"',
  '•': '*', '×': 'x', '…': '...', '\u00a0': ' ',
}

function pushText(out, text) {
  for (const ch of String(text || '').replace(/\r/g, '')) {
    const s = SWAP[ch] ?? ch
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c === LF || (c >= 32 && c < 127)) out.push(c)
      else if (c === 9) out.push(32)
      else if (c > 0xffff || (c >= 0xd800 && c <= 0xdfff)) { /* emoji — chhod do */ }
      else out.push(63)          // '?'
    }
  }
}

export function escposBytes(text, copies = 1) {
  const n = Math.min(Math.max(Number(copies) || 1, 1), 5)
  const out = []
  for (let k = 0; k < n; k++) {
    out.push(ESC, 0x40)                       // printer reset
    pushText(out, String(text || '').replace(/\s+$/, ''))   // neeche ki khaali lines hatao
    out.push(LF, LF, LF)                      // kaatne tak kaagaz aage
    out.push(GS, 0x56, 0x42, 0x00)            // kaagaz kaato (partial cut)
  }
  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    const t = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    s += B64[(t >> 18) & 63] + B64[(t >> 12) & 63]
      + (b === undefined ? '=' : B64[(t >> 6) & 63])
      + (c === undefined ? '=' : B64[t & 63])
  }
  return s
}

export const escposJob = (text, copies) => toBase64(escposBytes(text, copies))
