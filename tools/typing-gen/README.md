# typing-gen — passage bank → typing tables

Build-time only. Nothing here ships to the browser except its output,
`assets/js/typing-layouts.js`.

`build.mjs` reads the passage bank in `assets/js/typing-text.js` and writes
the tables the typing test needs:

| table | what it holds |
| --- | --- |
| `KD` | every Hindi cluster in the bank → the Kruti Dev 010 keys that type it |
| `KD_KEY` | one Kruti Dev key → what it prints (the on-screen keyboard labels) |
| `INS` | every Hindi character → the Inscript key (`[code, shift]`) |
| `INS_KEY` | key code → `[normal, shift, altGr]` (the on-screen keyboard diagram) |

Two upstream sources, both MIT:

- **`oracle.mjs`** — `krutiDevToUnicode()` from
  [@bharattype/hindi-transliteration](https://www.npmjs.com/package/@bharattype/hindi-transliteration).
  Used as an oracle: the build brute-forces the keys *into* it, so every entry is
  round-trip verified. Cross-checked against `ltrc/kru2uni` (IIIT Hyderabad);
  both use the same canonical Kruti Dev 010 table. The same converter is
  vendored to `assets/js/typing-kd.js` so the test accepts any key sequence the
  font accepts, not just the canonical one.
- **[@coldsofttech/saccade-hi](https://www.npmjs.com/package/@coldsofttech/saccade-hi)**
  — source of the Inscript (Mangal) keymap.

## Running it

```bash
cd tools/typing-gen
npm pack @coldsofttech/saccade-hi @coldsofttech/saccade-keyboards
mkdir -p node_modules/@coldsofttech/saccade-hi node_modules/@coldsofttech/saccade-keyboards node_modules/react
tar xzf coldsofttech-saccade-hi-*.tgz      -C node_modules/@coldsofttech/saccade-hi --strip-components=1
tar xzf coldsofttech-saccade-keyboards-*.tgz -C node_modules/@coldsofttech/saccade-keyboards --strip-components=1
# the layout module imports React; a stub is enough to read the keymap
printf '%s' '{"name":"react","version":"18.3.1","type":"module","exports":{".":"./index.js","./jsx-runtime":"./jsx-runtime.js"}}' > node_modules/react/package.json
printf '%s' 'export const useState=()=>[0,()=>{}];export const useEffect=()=>{};export const useMemo=(f)=>f();export const useCallback=(f)=>f;export const useRef=()=>({current:null});export const useLayoutEffect=()=>{};export const Fragment="div";export const memo=(c)=>c;export const forwardRef=(c)=>c;export const createContext=()=>({});export const createElement=()=>null;export default {};' > node_modules/react/index.js
printf '%s' 'export const jsx=()=>null;export const jsxs=()=>null;export const Fragment="div";' > node_modules/react/jsx-runtime.js
node build.mjs
```

The run prints `clusters: N mapped: N problems: 0` and `inscript gaps: 0`.
**Never commit a table with problems:** a problem means the passage asks the
student to type something no key can produce (usually a high-byte Kruti Dev
character like `ई`, `ृ` or the chandrabindu — rewrite the word instead).

After editing `assets/js/typing-text.js`, re-run `node build.mjs` and commit
the regenerated `assets/js/typing-layouts.js`.
