/* ==========================================================================
 * Firefly Markdown · app.js
 * 纯原生 JS · 零依赖 · 离线可用
 * 模块：工具函数 / 存储 / Markdown 解析 / 代码高亮 / FrontMatter / 编辑器内核 / UI
 * ========================================================================== */
(function () {
'use strict';

/* ==========================================================================
 * 0. 基础工具
 * ========================================================================== */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = s => escapeHtml(s).replace(/"/g, '&quot;');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Firefly 主题仅支持 zh_CN/zh_TW/en/ja/ru，将旧格式或已弃用语言归一化
const normalizeLang = v => {
  const map = { 'zh-cn': 'zh_CN', 'zh_CN': 'zh_CN', 'zh-tw': 'zh_TW', 'zh_TW': 'zh_TW',
                'en': 'en', 'ja': 'ja', 'ru': 'ru' };
  return map[String(v || '').toLowerCase()] || '';
};

function debounce(fn, ms) {
  let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}

function toast(msg, type) {
  const host = $('#toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, 2100);
}

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalInput(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
/** datetime-local 值 → YAML 日期串 */
function fmtDate(v, withTime) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  if (!m) return v;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!withTime) return date;
  return `${date} ${m[4] || '00'}:${m[5] || '00'}:00`;
}
function parseDateToInput(v) {
  if (!v) return '';
  const s = String(v).trim().replace(/^["']|["']$/g, '');
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) return '';
  return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}T${pad(+(m[4] || 0))}:${m[5] || '00'}`;
}

/** URL 安全过滤 */
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^\s*javascript:|^\s*data:text\/html|^\s*vbscript:/i.test(s) ? '#' : s;
}

/** 生成 slug */
function slugify(str) {
  let s = String(str).trim().toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[^\w\u4e00-\u9fa5\- ]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s;
}

/* ==========================================================================
 * 1. 代码高亮（轻量 tokenizer）
 * ========================================================================== */
const HL = (function () {
  const S_STR = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` + '`(?:\\\\.|[^`\\\\])*`';
  const S_NUM = String.raw`\b(?:0[xX][\da-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b`;
  const kw = words => String.raw`\b(?:${words.join('|')})\b`;

  const jsKw = ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','class','extends','super','this','import','export','from','default','async','await','try','catch','finally','throw','typeof','instanceof','delete','in','of','yield','static','get','set','interface','type','enum','implements','public','private','protected','readonly','as','void','never','unknown','any','string','number','boolean'];
  const pyKw = ['def','class','return','if','elif','else','for','while','import','from','as','try','except','finally','with','lambda','pass','break','continue','yield','global','nonlocal','assert','raise','del','in','is','not','and','or','async','await','self','None','True','False'];
  const goKw = ['func','package','import','var','const','type','struct','interface','map','chan','go','defer','return','if','else','for','range','switch','case','default','break','continue','select','fallthrough','nil','true','false'];
  const cKw  = ['int','long','float','double','char','void','bool','class','struct','public','private','protected','static','final','const','new','delete','return','if','else','for','while','switch','case','break','continue','try','catch','throw','namespace','using','template','typename','virtual','override','this','null','nullptr','true','false','import','package','extends','implements','interface','enum','var','func'];
  const sqlKw = ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','JOIN','LEFT','RIGHT','INNER','OUTER','ON','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','AS','AND','OR','NOT','NULL','DISTINCT','UNION','ALL','CASE','WHEN','THEN','ELSE','END','PRIMARY','KEY','FOREIGN','REFERENCES','DEFAULT','WITH'];
  const shKw = ['if','then','else','elif','fi','for','while','do','done','case','esac','function','return','export','local','source','echo','cd','ls','mkdir','rm','cp','mv','cat','grep','sed','awk','curl','wget','git','npm','pnpm','yarn','node','python','sudo','apt','docker','chmod','chown'];

  const sets = {
    js:   [[String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`, 'tk-com'], [S_STR, 'tk-str'], [kw(jsKw), 'tk-key'], [String.raw`\b(?:true|false|null|undefined|NaN)\b`, 'tk-bool'], [S_NUM, 'tk-num'], [String.raw`\b[A-Za-z_$][\w$]*(?=\s*\()`, 'tk-fn']],
    py:   [[String.raw`#[^\n]*`, 'tk-com'], [String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|` + S_STR, 'tk-str'], [kw(pyKw), 'tk-key'], [S_NUM, 'tk-num'], [String.raw`\b[A-Za-z_][\w]*(?=\s*\()`, 'tk-fn']],
    go:   [[String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`, 'tk-com'], [S_STR, 'tk-str'], [kw(goKw), 'tk-key'], [S_NUM, 'tk-num'], [String.raw`\b[A-Za-z_][\w]*(?=\s*\()`, 'tk-fn']],
    c:    [[String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`, 'tk-com'], [S_STR, 'tk-str'], [kw(cKw), 'tk-key'], [S_NUM, 'tk-num'], [String.raw`\b[A-Za-z_][\w]*(?=\s*\()`, 'tk-fn']],
    css:  [[String.raw`\/\*[\s\S]*?\*\/`, 'tk-com'], [S_STR, 'tk-str'], [String.raw`@[\w-]+|![\w-]+`, 'tk-key'], [String.raw`[.#][\w-]+|&lt;?[a-z][\w-]*(?=[^{}:;]*\{)`, 'tk-tag'], [String.raw`[\w-]+(?=\s*:)`, 'tk-attr'], [String.raw`#[\da-fA-F]{3,8}\b|` + S_NUM + String.raw`[a-z%]*`, 'tk-num']],
    html: [[String.raw`&lt;!--[\s\S]*?--&gt;`, 'tk-com'], [String.raw`&lt;\/?[\w:-]+`, 'tk-tag'], [String.raw`[\w:-]+(?==)`, 'tk-attr'], [S_STR, 'tk-str'], [String.raw`\/?&gt;`, 'tk-tag']],
    json: [[S_STR + String.raw`(?=\s*:)`, 'tk-key'], [S_STR, 'tk-str'], [String.raw`\b(?:true|false|null)\b`, 'tk-bool'], [S_NUM, 'tk-num']],
    yaml: [[String.raw`#[^\n]*`, 'tk-com'], [String.raw`^\s*[\w.-]+(?=\s*:)`, 'tk-key'], [S_STR, 'tk-str'], [String.raw`\b(?:true|false|null|yes|no)\b`, 'tk-bool'], [S_NUM, 'tk-num']],
    sh:   [[String.raw`#[^\n]*`, 'tk-com'], [S_STR, 'tk-str'], [kw(shKw), 'tk-key'], [String.raw`\$\{?[\w]+\}?`, 'tk-fn'], [String.raw`\s-{1,2}[\w-]+`, 'tk-attr'], [S_NUM, 'tk-num']],
    sql:  [[String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`, 'tk-com'], [S_STR, 'tk-str'], ['(?i)' + kw(sqlKw), 'tk-key'], [S_NUM, 'tk-num']],
    def:  [[String.raw`#[^\n]*|\/\/[^\n]*`, 'tk-com'], [S_STR, 'tk-str'], [S_NUM, 'tk-num']]
  };

  const alias = {
    javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', mjs: 'js', cjs: 'js', vue: 'html', svelte: 'html',
    python: 'py', py3: 'py', golang: 'go', rust: 'c', rs: 'c', java: 'c', kotlin: 'c', kt: 'c', swift: 'c', dart: 'c',
    cpp: 'c', 'c++': 'c', csharp: 'c', cs: 'c', php: 'c', scss: 'css', less: 'css', sass: 'css',
    xml: 'html', svg: 'html', vbs: 'def', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', powershell: 'sh', ps1: 'sh',
    yml: 'yaml', ini: 'yaml', toml: 'yaml', conf: 'yaml', dockerfile: 'sh', makefile: 'sh'
  };

  return function highlight(code, lang) {
    const esc = escapeHtml(code);
    const key = alias[(lang || '').toLowerCase()] || ((lang || '').toLowerCase() in sets ? (lang || '').toLowerCase() : null);
    const rules = sets[key] || (lang ? sets.def : null);
    if (!rules) return esc;
    let flags = 'gm', src = rules.map(r => {
      let s = r[0];
      if (s.startsWith('(?i)')) { flags = flags.includes('i') ? flags : flags + 'i'; s = s.slice(4); }
      return '(' + s + ')';
    }).join('|');
    let re;
    try { re = new RegExp(src, flags); } catch (e) { return esc; }
    return esc.replace(re, function (m) {
      for (let i = 1; i < arguments.length - 2; i++) {
        if (arguments[i] !== undefined) return `<span class="${rules[i - 1][1]}">${m}</span>`;
      }
      return m;
    });
  };
})();

/* ==========================================================================
 * 1.5 数学公式渲染器（零依赖 LaTeX 子集）
 * ========================================================================== */
const MATH = (function () {
  const ESC = { '{': '{', '}': '}', '$': '$', '#': '#', '%': '%', '_': '_', '&': '&', ' ': ' ', '\\': '\\', ',': ' ', ';': ' ', ':': ' ', '!': '' };
  const SYM = {
    alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',varepsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',vartheta:'ϑ',
    iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',omicron:'ο',pi:'π',varpi:'ϖ',rho:'ρ',varrho:'ϱ',
    sigma:'σ',varsigma:'ς',tau:'τ',upsilon:'υ',phi:'φ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',
    Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Upsilon:'Υ',Phi:'Φ',Psi:'Ψ',Omega:'Ω',
    times:'×',cdot:'⋅',ast:'∗',star:'⋆',div:'÷',pm:'±',mp:'∓',
    leq:'≤',le:'≤',geq:'≥',ge:'≥',ne:'≠',neq:'≠',equiv:'≡',approx:'≈',cong:'≅',sim:'∼',simeq:'≃',
    propto:'∝',ll:'≪',gg:'≫',subset:'⊂',supset:'⊃',subseteq:'⊆',supseteq:'⊇',subseteqq:'⫅',supseteqq:'⫆',
    in:'∈',notin:'∉',ni:'∋',emptyset:'∅',varnothing:'∅',cap:'∩',cup:'∪',setminus:'∖',
    forall:'∀',exists:'∃',nexists:'∄',neg:'¬',lnot:'¬',land:'∧',wedge:'∧',lor:'∨',vee:'∨',
    rightarrow:'→',to:'→',leftarrow:'←',leftrightarrow:'↔',Rightarrow:'⇒',Leftarrow:'⇐',Leftrightarrow:'⇔',
    rightarrowtail:'↣',mapsto:'↦',uparrow:'↑',downarrow:'↓',updownarrow:'↕',longrightarrow:'⟶',longmapsto:'⟼',
    circ:'∘',oplus:'⊕',ominus:'⊖',otimes:'⊗',odot:'⊙',sum:'∑',prod:'∏',coprod:'∐',int:'∫',oint:'∮',
    partial:'∂',nabla:'∇',infty:'∞',aleph:'ℵ',hbar:'ℏ',ell:'ℓ',wp:'℘',Re:'ℜ',Im:'ℑ',imath:'ı',jmath:'ȷ',
    angle:'∠',perp:'⊥',parallel:'∥',vdots:'⋮',ddots:'⋱',dots:'…',ldots:'…',cdots:'⋯',dotsb:'⋯',dotsc:'…',
    prime:'′',degree:'°',deg:'°',dagger:'†',ddagger:'‡',
    cup:'∪',bot:'⊥',top:'⊤',models:'⊨',vdash:'⊢',dashv:'⊣',therefore:'∴',because:'∵',
    surd:'√',checkmark:'✓',triangle:'△',triangleq:'≜',sqcap:'⊓',sqcup:'⊔',
    langle:'⟨',rangle:'⟩',lfloor:'⌊',rfloor:'⌋',lceil:'⌈',rceil:'⌉',lbrace:'{',rbrace:'}',
    colon:'∶',mid:'∣',Vert:'∥',quad:' ',qquad:' ',
    AA:'Å',aa:'å',O:'Ø',o:'ø',L:'Ł',l:'ł',P:'¶',S:'§',pounds:'£',euro:'€',yen:'¥',
    natural:'ℕ',real:'ℝ',complex:'ℂ',integer:'ℤ',rational:'ℚ',
    bigcup:'∪',bigcap:'∩',bigvee:'∨',bigwedge:'∧',bigoplus:'⊕',bigotimes:'⊗',bigodot:'⊙',biguplus:'⊎',bigsqcup:'⨆',
    iint:'∬',iiint:'∭',iiiint:'⨌',oiint:'∯',oiiint:'∰',smallint:'∫',amalg:'⨿',
    sqcup:'⊔',uplus:'⊎',boxplus:'⊞',boxminus:'⊟',boxtimes:'⊠',curlyvee:'⋎',curlywedge:'⋏',dotplus:'∔',barwedge:'⊼',veebar:'⊻',
    Longleftarrow:'⟸',Longrightarrow:'⟹',implies:'⟹',impliedby:'⟸',iff:'⟺',Updownarrow:'⇕',
    nearrow:'↗',searrow:'↘',swarrow:'↙',nwarrow:'↖',rightsquigarrow:'⇝',leadsto:'⇝',
    prec:'≺',succ:'≻',preceq:'⪯',succeq:'⪰',Vdash:'⊩',vDash:'⊨',nvdash:'⊬',nvDash:'⊭',
    sqsubset:'⊏',sqsupset:'⊐',sqsubseteq:'⊑',sqsupseteq:'⊒',triangleleft:'◁',triangleright:'▷',trianglelefteq:'⊴',trianglerighteq:'⊵',unlhd:'⊴',unrhd:'⊵',
    lessdot:'⋖',gtrdot:'⋗',lll:'⋘',ggg:'⋙',lesseqgtr:'⋚',gtreqless:'⋛',lneq:'⪇',gneq:'⪈',lnapprox:'⪉',gnapprox:'⪊',
    nless:'≮',ngtr:'≯',nleq:'≰',ngeq:'≱',nsubseteq:'⊄',nsupseteq:'⊅',subsetneq:'⊊',supsetneq:'⊋',nprec:'⊀',nsucc:'⊁',nmid:'∤',nparallel:'∦',
    ltimes:'⋉',rtimes:'⋊',bowtie:'⋈',leftthreetimes:'⋋',rightthreetimes:'⋌',between:'≬',pitchfork:'⋔',circeq:'≗',
    complement:'∁',blacksquare:'■',blacktriangle:'▲',blacktriangledown:'▼',blacktriangleleft:'◀',blacktriangleright:'▶',
    spadesuit:'♠',heartsuit:'♥',diamondsuit:'♦',clubsuit:'♣',measuredangle:'∡',sphericalangle:'∢',backprime:'‵'
  };
  const ACCENTS = { vec:'m-vec', hat:'m-hat', tilde:'m-tilde', bar:'m-ovl', overline:'m-ovl', dot:'m-dot', ddot:'m-ddot', check:'m-check', acute:'m-acute', grave:'m-grave', breve:'m-breve', widetilde:'m-tilde', widehat:'m-hat',
    overrightarrow:'m-arr-r', overleftarrow:'m-arr-l', overleftrightarrow:'m-arr-lr', underrightarrow:'m-arr-ru', underleftarrow:'m-arr-lu', underleftrightarrow:'m-arr-lru', mathring:'m-ring' };
  const FONT = { mathrm:'m-rm', mathit:'m-it', mathbf:'m-bf', mathsf:'m-sf', mathtt:'m-tt', mathcal:'m-cal', mathfrak:'m-frak', textrm:'m-rm', textit:'m-it', textbf:'m-bf', textsf:'m-sf', texttt:'m-tt', textnormal:'' };
  // 运算符名（按 KaTeX 官方支持列表补全）：渲染为正体算子文本
  const OPNAMES = { arcsin:1,arccos:1,arctan:1,sin:1,cos:1,tan:1,cot:1,csc:1,sec:1,sinh:1,cosh:1,tanh:1,
    log:1,ln:1,lg:1,exp:1,
    lim:1,limsup:1,liminf:1,varlimsup:1,varliminf:1,injlim:1,projlim:1,varinjlim:1,varprojlim:1,plim:1,
    min:1,max:1,inf:1,sup:1,gcd:1,lcm:1,det:1,Pr:1,arg:1,argmax:1,argmin:1,dim:1,ker:1,deg:1,hom:1,
    mod:1,bmod:1,pmod:1,pod:1 };
  // 可带上下限的大运算符（sum/prod/int/... 已含于 SYM，这里集中管理上/下 placement）
  const BIGOPS = { sum:'∑',prod:'∏',int:'∫',oint:'∮',coprod:'∐',
    bigcup:'∪',bigcap:'∩',bigvee:'∨',bigwedge:'∧',bigoplus:'⊕',bigotimes:'⊗',bigodot:'⊙',biguplus:'⊎',bigsqcup:'⨆',
    iint:'∬',iiint:'∭',iiiint:'⨌',oiint:'∯',oiiint:'∰',smallint:'∫',amalg:'⨿' };
  const BB = { A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ',
    a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',
    0:'𝟘',1:'𝟙',2:'𝟚',3:'𝟛',4:'𝟜',5:'𝟝',6:'𝟞',7:'𝟟',8:'𝟠',9:'𝟡' };
  function eh(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function render(tex, display) {
    tex = String(tex || '');
    // 行内路径里文本已被 escapeHtml，这里还原常见实体，避免矩阵 & 分隔符被转义
    tex = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    let i = 0; const n = tex.length;
    let styleMode = display ? 'display' : 'text';
    let limitsMode = '';
    const sp = c => c===' '||c==='\t'||c==='\n'||c==='\r';
    function rawArg() {
      while (i<n && sp(tex[i])) i++;
      if (tex[i] === '{') { i++; const s = seqRaw('}'); if (tex[i] === '}') i++; return s; }
      return token();
    }
    function bbArg() {
      const s = rawArg();
      let out = '';
      for (const ch of s) out += (ch in BB) ? BB[ch] : ch;
      return `<span class="m-bb">${out}</span>`;
    }
    function bigOp(name) {
      const glyph = BIGOPS[name] || SYM[name];
      let up = null, down = null, moved = false;
      while (i<n) {
        if (tex[i] === '^') { i++; up = scriptArg(); moved = true; }
        else if (tex[i] === '_') { i++; down = scriptArg(); moved = true; }
        else break;
      }
      const over = (styleMode === 'display' && limitsMode !== 'nolimits') || limitsMode === 'limits';
      limitsMode = '';
      if (over && moved) {
        return `<span class="m-stackop">${up?`<span class="m-top">${up}</span>`:''}<span class="m-bigop">${glyph}</span>${down?`<span class="m-bot">${down}</span>`:''}</span>`;
      }
      return `<span class="m-bigop">${glyph}</span>${up?`<sup>${up}</sup>`:''}${down?`<sub>${down}</sub>`:''}`;
    }

    function token() {
      while (i<n && sp(tex[i])) i++;
      if (i>=n) return '';
      const c = tex[i];
      if (c === '\\') {
        i++;
        if (i>=n) return '';
        const nx = tex[i];
        if (/[a-zA-Z]/.test(nx)) { let name=''; while(i<n && /[a-zA-Z]/.test(tex[i])) name += tex[i++]; return cmd(name); }
        const ch = tex[i++];
        if (ch in ESC) return ESC[ch];
        return eh(ch);
      }
      if (c === '{') { i++; const inner = seq('}', false); if (tex[i] === '}') i++; return inner; }
      if (c === '}') { i++; return ''; }
      i++; return eh(c);
    }
    function scriptArg() {
      while (i<n && sp(tex[i])) i++;
      if (tex[i] === '{') { i++; const s = seq('}', false); if (tex[i] === '}') i++; return s; }
      return token();
    }
    function cmd(name) {
      if (name === 'limits') { limitsMode = 'limits'; return ''; }
      if (name === 'nolimits') { limitsMode = 'nolimits'; return ''; }
      if (name === 'displaystyle') { styleMode = 'display'; return ''; }
      if (name === 'textstyle' || name === 'scriptstyle' || name === 'scriptscriptstyle') { styleMode = 'text'; return ''; }
      if (name in BIGOPS) return bigOp(name);
      if (name === 'pmod') { const a = scriptArg(); return `<span class="m-op"> mod </span><span class="m-paren">(</span>${a}<span class="m-paren">)</span>`; }
      if (name === 'pod') { const a = scriptArg(); return `<span class="m-paren">(</span>${a}<span class="m-paren">)</span>`; }
      if (name === 'bmod' || name === 'mod') return `<span class="m-op"> mod </span>`;
      if (name in OPNAMES) return `<span class="m-op">${name}</span>`;
      if (name in SYM) return SYM[name];
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
        const a = scriptArg(), b = scriptArg();
        return `<span class="m-frac"><span class="m-num">${a}</span><span class="m-den">${b}</span></span>`;
      }
      if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
        const a = scriptArg(), b = scriptArg();
        return `<span class="m-binom"><span class="m-paren">(</span><span class="m-frac"><span class="m-num">${a}</span><span class="m-den">${b}</span></span><span class="m-paren">)</span></span>`;
      }
      if (name === 'sqrt') {
        let idx='';
        if (tex[i] === '[') { i++; idx = '<span class="m-root">'+seq(']',false)+'</span>'; if (tex[i] === ']') i++; }
        const body = scriptArg();
        return `<span class="m-sqrt">${idx}<span class="m-radic">√</span><span class="m-body">${body}</span></span>`;
      }
      if (name === 'underline') { return `<span class="m-under">${scriptArg()}</span>`; }
      if (name === 'overbrace') { return `<span class="m-obrace">${scriptArg()}</span>`; }
      if (name === 'underbrace') { return `<span class="m-ubrace">${scriptArg()}</span>`; }
      if (name === 'overset' || name === 'stackrel') { const top = scriptArg(); const base = scriptArg(); return `<span class="m-stack"><span class="m-up">${top}</span><span class="m-base">${base}</span></span>`; }
      if (name === 'underset') { const bot = scriptArg(); const base = scriptArg(); return `<span class="m-stack"><span class="m-base">${base}</span><span class="m-down">${bot}</span></span>`; }
      if (name in FONT) { const c = scriptArg(); const cls = FONT[name]; return cls ? `<span class="${cls}">${c}</span>` : c; }
      if (name in ACCENTS) { const c = scriptArg(); return `<span class="${ACCENTS[name]}"><span class="m-acc">${c}</span></span>`; }
      if (name === 'mathscr') { return `<span class="m-scr">${scriptArg()}</span>`; }
      if (name === 'mathbb' || name === 'Bbb') { return bbArg(); }
      if (name === 'boldsymbol' || name === 'bm') { return `<span class="m-bf">${scriptArg()}</span>`; }
      if (name === 'text' || name === 'textnormal' || name === 'mbox') { return `<span class="m-text">${scriptArg()}</span>`; }
      if (name === 'ce') { return `<span class="m-ce">${scriptArg().replace(/->/g,'→').replace(/<=>/g,'⇌').replace(/<=/g,'≤')}</span>`; }
      if (name === 'operatorname') { return `<span class="m-op">${scriptArg()}</span>`; }
      if (name === 'left' || name === 'right' || name === 'bigl'||name==='Bigl'||name==='biggl'||name==='Biggl'||name==='bigr'||name==='Bigr'||name==='biggr'||name==='Biggr'||name==='big'||name==='Big'||name==='bigg'||name==='Bigg') { while(i<n && sp(tex[i])) i++; const d = tex[i++]||''; return `<span class="m-delim">${eh(d)}</span>`; }
      if (name === 'begin') {
        while(i<n && sp(tex[i])) i++;
        let env='';
        if (tex[i]==='{'){ i++; env=seqRaw('}'); if (tex[i]==='}') i++; }
        env = env.replace(/\*$/,'');
        let cols='';
        if (env==='array'){ while(i<n&&sp(tex[i]))i++; if(tex[i]==='{'){ i++; cols=seqRaw('}'); if(tex[i]==='}')i++; } }
        return envBlock(env, cols);
      }
      if (name === 'end') { while(i<n && sp(tex[i])) i++; if (tex[i]==='{'){ i++; seqRaw('}'); if (tex[i]==='}') i++; } return ''; }
      if (name === 'tag'||name==='label'||name==='nonumber'||name==='notag'||name==='color'||name==='textcolor') { scriptArg(); if (name==='color'||name==='textcolor') return scriptArg(); return ''; }
      if (name === 'mathopen'||name==='mathclose'||name==='mathord'||name==='mathbin'||name==='mathrel'||name==='mathop') { return scriptArg(); }
      return `<span class="m-unknown" title="暂不支持的命令">${eh('\\'+name)}</span>`;
    }
    function seqRaw(stop) { let s=''; while (i<n && tex[i]!==stop) { s+=tex[i++]; } return s; }
    function envBlock(env, cols) {
      const target = '\\end{'+env+'}';
      let body='';
      while (i<n) { if (tex.substr(i, target.length) === target) { i += target.length; break; } body += tex[i++]; }
      const rows = body.split(/\\\\/).map(r=>r.trim()).filter(r=>r.length);
      if (env === 'cases' || env === 'rcases' || env === 'dcases') {
        const brace = (env === 'rcases' || env === 'dcases') ? '}' : '{';
        let h = `<span class="m-cases"><span class="m-brace">${brace}</span><table class="m-matrix">`;
        for (const r of rows) { const c = r.split('&'); h += '<tr>'+c.map(x=>`<td>${render(x,false)}</td>`).join('')+'</tr>'; }
        return h + '</table></span>';
      }
      const clsMap = { matrix:'m-none', smallmatrix:'m-small', aligned:'m-none', gathered:'m-none', array:'m-none',
        pmatrix:'m-paren', bmatrix:'m-bracket', Bmatrix:'m-brace', vmatrix:'m-vbar', Vmatrix:'m-Vbar' };
      const cls = clsMap[env] || 'm-none';
      const colSpec = (env === 'array' && cols) ? cols.replace(/[^lcr|]/g,'').split('').filter(c=>c!=='|') : null;
      let h = `<span class="m-env ${cls}"><table class="m-matrix">`;
      rows.forEach(r => {
        const cells = r.split('&');
        h += '<tr>' + cells.map((x, ci) => {
          const al = colSpec ? (colSpec[ci] || 'c') : 'c';
          const style = al === 'l' ? ' style="text-align:left"' : al === 'r' ? ' style="text-align:right"' : '';
          return `<td${style}>${render(x, false)}</td>`;
        }).join('') + '</tr>';
      });
      return h + '</table></span>';
    }
    function seq(stop) {
      let out='';
      while (i<n) {
        if (stop && tex.substr(i, stop.length) === stop) break;
        const c = tex[i];
        if (c === '^') { i++; out += '<sup>'+scriptArg()+'</sup>'; continue; }
        if (c === '_') { i++; out += '<sub>'+scriptArg()+'</sub>'; continue; }
        out += token();
      }
      return out;
    }
    return seq('', false);
  }
  return { render };
})();
function renderMath(tex, display) {
  if (typeof katex !== 'undefined') {
    try {
      return katex.renderToString(tex, {
        displayMode: !!display,
        throwOnError: false,
        strict: false,
        trust: false
      });
    } catch (e) {
      /* fall through to the custom renderer on any KaTeX failure */
    }
  }
  return MATH.render(tex, display);
}

/* ==========================================================================
 * 2. Markdown 解析器
 * ========================================================================== */
const MD = (function () {
  const INLINE_HTML_OK = /^(br|kbd|sup|sub|u|em|strong|mark|small|del|ins|span|code|abbr|img|a|b|i)$/i;
  const BLOCK_HTML_OK  = /^(iframe|div|details|summary|section|figure|figcaption|video|audio|source|table|thead|tbody|tr|td|th|center|p|blockquote|pre|ul|ol|li|h[1-6]|hr|img|picture|canvas|svg|path|span|embed|object)$/i;

  function sanitizeTag(raw) {
    // 去除事件属性与危险协议
    return raw.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
              .replace(/(src|href)\s*=\s*("|')\s*(javascript:|vbscript:|data:text\/html)[^"']*\2/gi, '$1=$2#$2');
  }
  /** 已转义文本 → 原文（用于取出 URL 再作属性转义） */
  const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /** 已转义文本用作属性值时只需处理引号 */
  const q = s => String(s).replace(/"/g, '&quot;');

  /* ---------- 行内解析 ---------- */
  function inline(text, ctx) {
    const store = [];
    const put = html => { store.push(html); return '\u0000' + (store.length - 1) + '\u0000'; };

    let s = String(text);

    // 1) 转义字符
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|=:])/g, (m, c) => put(escapeHtml(c)));

    // 2) 行内代码
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, f, code) => put('<code>' + escapeHtml(code.replace(/^ | $/g, '')) + '</code>'));

    // 3) 原生行内 HTML
    s = s.replace(/<\/?([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g, (m, tag) =>
      INLINE_HTML_OK.test(tag) ? put(sanitizeTag(m)) : m);

    // 4) 剩余文本转义
    s = escapeHtml(s);

    // 5) 图片
    s = s.replace(/!\[([^\]]*)\]\(([^()\s]+(?:\([^()]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\)/g,
      (m, alt, url, title) => put(`<img src="${escapeAttr(safeUrl(unesc(url)))}" alt="${q(alt)}"${title ? ` title="${q(title)}"` : ''} loading="lazy">`));

    // 6) 剧透（可嵌套 Markdown）
    s = s.replace(/:spoiler\[([^\]]*)\]/g, (m, c) => put(`<span class="spoiler" title="点击显示">${inlineRaw(c, ctx)}</span>`));

    // 7) 脚注引用
    s = s.replace(/\[\^([^\]\s]+)\]/g, (m, id) => {
      if (!ctx || !ctx.footnotes) return m;
      const n = ctx.footnoteOrder.indexOf(id) >= 0 ? ctx.footnoteOrder.indexOf(id) + 1 : ctx.footnoteOrder.push(id);
      return put(`<sup id="fnref-${escapeAttr(id)}"><a href="#fn-${escapeAttr(id)}">[${n}]</a></sup>`);
    });

    // 8) 链接
    s = s.replace(/\[([^\]]*)\]\(([^()\s]+(?:\([^()]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\)/g,
      (m, txt, url, title) => put(`<a href="${escapeAttr(safeUrl(unesc(url)))}"${title ? ` title="${q(title)}"` : ''}${/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : ''}>${inlineRaw(txt, ctx)}</a>`));

    // 8.5) Wiki Link 内部链接 [[slug]] / [[slug|别名]] / [[#标题]] / [[slug#标题|别名]]
    // 单独成段的 [[slug]] 在区块层渲染为文章卡片（见 parseBlocks）；此处仅处理行内链接
    s = s.replace(/\[\[([^\]]+?)\]\]/g, (m, inner) => {
      let target = inner.trim(), alias = '';
      const bar = target.indexOf('|');
      if (bar >= 0) { alias = target.slice(bar + 1).trim(); target = target.slice(0, bar).trim(); }
      const hash = target.indexOf('#');
      const slug = (hash >= 0 ? target.slice(0, hash) : target).trim();
      const heading = hash >= 0 ? target.slice(hash) : '';
      let href, text;
      if (!slug) { href = heading || '#'; text = alias || heading.replace(/^#/, ''); }
      else {
        href = '/posts/' + slug.replace(/^\/+|\/+$/g, '') + '/' + heading;
        const doc = (Store.docs() || []).find(d => ((d.meta && d.meta.slug) || '').trim() === slug);
        text = alias || (doc ? (doc.meta.title || doc.name) : slug.split('/').pop());
      }
      return put(`<a href="${escapeAttr(href)}" class="wiki-link"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}>${inlineRaw(text, ctx)}</a>`);
    });

    // 9) 自动链接
    s = s.replace(/&lt;((?:https?|mailto):[^\s&]+)&gt;/g, (m, url) => put(`<a href="${escapeAttr(safeUrl(unesc(url)))}" target="_blank" rel="noopener">${url}</a>`));
    s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<>()"']+[^\s<>()"'.,;:!?])/g,
      (m, pre, url) => pre + put(`<a href="${escapeAttr(safeUrl(unesc(url)))}" target="_blank" rel="noopener">${url}</a>`));

    // 10) 行内数学公式 $...$（排除 $$ 块级与转义 \$）
    s = s.replace(/(^|[^\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/g,
      (m, pre, tex) => pre + put(`<span class="math-inline">${renderMath(tex, false)}</span>`));

    // 11) 强调
    s = s.replace(/\*\*\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/___([^\s_][\s\S]*?[^\s_]|[^\s_])___/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^\s_][\s\S]*?[^\s_]|[^\s_])__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w*])\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w_])_([^\s_][\s\S]*?[^\s_]|[^\s_])_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

    // 11) 硬换行：编辑器里直接回车即换行（WYSIWYG），导出时 normalizeBody 会自动补两个空格保证标准 Markdown
    s = s.replace(/\n/g, '<br>\n');

    // 还原占位
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => store[+i]);
    return s;
  }
  function inlineRaw(t, ctx) { return inline(t, ctx); }

  /* ---------- 块级解析 ---------- */
  const RE = {
    fence:   /^ {0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)[ \t]*(.*)$/,
    heading: /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*\s*$/,
    hr:      /^ {0,3}((?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/,
    quote:   /^ {0,3}>[ \t]?(.*)$/,
    item:    /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/,
    github:  /^ {0,3}::github\{[^}]*repo\s*=\s*["']([^"']+)["'][^}]*\}\s*$/,
    fndef:   /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/,
    setext:  /^ {0,3}(=+|-+)\s*$/
  };

  function parseBlocks(lines, ctx) {
    let out = '', i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 空行
      if (!line.trim()) { i++; continue; }

      // 围栏代码块
      let m = RE.fence.exec(line);
      if (m) {
        const fence = m[1][0], len = m[1].length, lang = m[2] || '';
        const meta = m[3] || '';
        const buf = []; i++;
        while (i < lines.length) {
          const cl = new RegExp('^ {0,3}' + (fence === '`' ? '`' : '~') + '{' + len + ',}\\s*$').test(lines[i]);
          if (cl) { i++; break; }
          buf.push(lines[i]); i++;
        }
        const code = buf.join('\n');
        const fm = parseFenceMeta(meta);
        if (lang === 'mermaid') {
          out += `<div class="mermaid-block"><div class="mermaid-head"><svg class="ico ico-sm"><use href="#i-mermaid"/></svg> Mermaid 图表</div><pre class="mermaid-code">${escapeHtml(code)}</pre><div class="mermaid-hint">构建时由 Firefly 渲染为静态 SVG</div></div>`;
        } else if (lang === 'plantuml') {
          out += `<div class="plantuml-block"><div class="mermaid-head"><svg class="ico ico-sm"><use href="#i-mermaid"/></svg> PlantUML 图表</div><pre class="plantuml-code">${escapeHtml(code)}</pre><div class="mermaid-hint">构建时由 Firefly 渲染为静态 SVG</div></div>`;
        } else {
          out += codeBlockHtml(code, lang, fm);
        }
        continue;
      }

      // 块级数学公式 $$ ... $$
      if (/^\s*\$\$/.test(line)) {
        let body = line.replace(/^\s*\$\$/, '').replace(/\s*\$\$\s*$/, '');
        const strippedLeading = line.replace(/^\s*\$\$/, '');
        if (body !== strippedLeading) {
          out += `<div class="math-block">${renderMath(body, true)}</div>`; i++; continue;
        }
        const buf = [body]; i++;
        while (i < lines.length) {
          if (/^\s*\$\$/.test(lines[i])) { i++; break; }
          buf.push(lines[i]); i++;
        }
        out += `<div class="math-block">${renderMath(buf.join('\n'), true)}</div>`;
        continue;
      }

      // GitHub 卡片指令
      m = RE.github.exec(line);
      if (m) { out += ghCard(m[1]); i++; continue; }

      // 脚注定义
      m = RE.fndef.exec(line);
      if (m) {
        const id = m[1]; const buf = [m[2]]; i++;
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
        ctx.footnotes[id] = buf.join('\n');
        if (ctx.footnoteOrder.indexOf(id) < 0) ctx.footnoteOrder.push(id);
        continue;
      }

      // 标题
      m = RE.heading.exec(line);
      if (m) {
        const lv = m[1].length, txt = m[2];
        const id = ctx.uid(slugify(txt.replace(/[*`~_\[\]]/g, '')) || 'h' + lv);
        ctx.headings.push({ level: lv, text: txt.replace(/[*`~_]/g, ''), id });
        out += `<h${lv} id="${escapeAttr(id)}">${inline(txt, ctx)}</h${lv}>`;
        i++; continue;
      }

      // 分割线
      if (RE.hr.test(line)) { out += '<hr>'; i++; continue; }

      // 原生 HTML 块
      m = /^ {0,3}<([A-Za-z][\w:-]*)/.exec(line);
      if (m && BLOCK_HTML_OK.test(m[1])) {
        const tag = m[1].toLowerCase(), buf = [];
        let depth = 0, closed = false;
        while (i < lines.length) {
          const l = lines[i]; buf.push(l);
          depth += (l.match(new RegExp('<' + tag + '\\b', 'gi')) || []).length;
          depth -= (l.match(new RegExp('</' + tag + '\\s*>', 'gi')) || []).length;
          i++;
          if (depth <= 0) { closed = true; break; }
        }
        if (!closed) { /* 未闭合也照常输出 */ }
        out += sanitizeTag(buf.join('\n'));
        continue;
      }

      // 图片画廊 [grid] … [/grid]（最多并排 4 张；可写 cols=N 显式指定 1–4 列）
      const mGrid = /^ {0,3}\[grid((?:\s+[^\]]*)?)\]\s*$/i.exec(line);
      if (mGrid) {
        const gArg = (mGrid[1] || '').trim();
        const gc = /cols\s*=\s*"?(\d)"?/i.exec(gArg) || /^"?(\d)"?$/.exec(gArg);
        const cols = gc ? Math.min(4, Math.max(1, +gc[1])) : 4;
        const buf = []; i++;
        while (i < lines.length && !/^ {0,3}\[\/grid\]\s*$/i.test(lines[i])) { buf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        const items = buf.map(l => l.trim()).filter(Boolean).map(l => {
          const imm = /^\s*!\[([^\]]*)\]\(([^()\s]+(?:\([^()]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\)/.exec(l);
          if (imm) {
            const alt = imm[1], url = imm[2], title = imm[3];
            const img = `<img src="${escapeAttr(safeUrl(unesc(url)))}" alt="${q(alt)}"${title ? ` title="${q(title)}"` : ''} loading="lazy">`;
            return `<figure class="grid-item">${img}${alt ? `<figcaption>${inlineRaw(alt, ctx)}</figcaption>` : ''}</figure>`;
          }
          return `<div class="grid-item">${inline(l, ctx)}</div>`;
        }).join('');
        out += `<div class="img-grid${cols ? ' cols-' + cols : ''}">${items}</div>`;
        continue;
      }

      // 代码组 ::: code-group labels=[...]
      let mCG = /^ {0,3}:::\s*code-group\s*(?:labels=\[([^\]]*)\])?\s*$/i.exec(line);
      if (mCG) {
        const labels = (mCG[1] || '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);
        const blocks = []; i++;
        while (i < lines.length && !/^ {0,3}:::\s*$/.test(lines[i])) {
          const fm = RE.fence.exec(lines[i]);
          if (fm) {
            const fence = fm[1][0], len = fm[1].length, lang = fm[2] || '';
            const meta = fm[3] || '';
            const cbuf = []; i++;
            while (i < lines.length) {
              if (new RegExp('^ {0,3}' + (fence === '`' ? '`' : '~') + '{' + len + ',}\\s*$').test(lines[i])) { i++; break; }
              cbuf.push(lines[i]); i++;
            }
            blocks.push({ lang, code: cbuf.join('\n'), meta });
          } else { i++; }
        }
        if (i < lines.length) i++;
        if (blocks.length) out += renderCodeGroup(blocks, labels, ctx);
        continue;
      }

      // Docusaurus 风格提示块 :::type ... :::
      let mAdm = /^ {0,3}:::([a-z][a-z0-9-]*)\s*(?:\[([^\]]*)\])?\s*$/i.exec(line);
      if (mAdm) {
        const type = mAdm[1].toLowerCase(), title = mAdm[2] || '';
        const buf = []; i++;
        while (i < lines.length && !/^ {0,3}:::\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        out += admBlock(type, title, buf.join('\n'), ctx, false);
        continue;
      }
      // Python-Markdown / Obsidian 风格 !!! note / ??? note
      mAdm = /^ {0,3}(\?{3,}|!{3,})\+?\s*([a-z][a-z0-9-]*)\s*(?:["“]([^"”]*)["”])?\s*$/i.exec(line);
      if (mAdm) {
        const collapsible = mAdm[1][0] === '?';
        const expanded = mAdm[1].endsWith('+');
        const type = mAdm[2].toLowerCase(), title = mAdm[3] || '';
        const buf = []; i++;
        while (i < lines.length && lines[i].trim()) { buf.push(lines[i]); i++; }
        const indents = buf.map(l => (l.match(/^ */) || [''])[0].length);
        const minIndent = indents.length ? Math.min.apply(null, indents) : 0;
        const ded = minIndent >= 4 ? minIndent : 0;
        const raw = buf.map(l => l.slice(ded)).join('\n');
        out += admBlock(type, title, raw, ctx, collapsible, expanded);
        continue;
      }

      // 引用 / 提示块
      if (RE.quote.test(line)) {
        const buf = [];
        while (i < lines.length && (RE.quote.test(lines[i]) || (buf.length && lines[i].trim() && !isBlockStart(lines[i])))) {
          const q = RE.quote.exec(lines[i]);
          buf.push(q ? q[1] : lines[i].trim());
          i++;
        }
        const adm = /^\s*\[!([a-z0-9-]+)\]\s*(.*)$/i.exec(buf[0] || '');
        if (adm) {
          const type = adm[1].toLowerCase();
          const custom = (adm[2] || '').trim();
          const ghLabels = { note:'注释', tip:'提示', info:'信息', important:'重要', warning:'警告', caution:'注意', danger:'危险', success:'成功', failure:'失败', bug:'缺陷', question:'疑问', quote:'引用', abstract:'摘要', example:'示例' };
          // 已知类型沿用 “TYPE · 中文” 标题；未知类型交给 admBlock 自行回退
          const defTitle = ghLabels[type] ? (type.toUpperCase() + ' · ' + ghLabels[type]) : '';
          const title = custom || defTitle;
          const rest = buf.slice(1);
          out += admBlock(type, title, rest.join('\n'), ctx, false);
        } else {
          out += `<blockquote>${parseBlocks(buf, ctx)}</blockquote>`;
        }
        continue;
      }

      // 表格
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf('|') >= 0) {
        const head = splitRow(line);
        const aligns = splitRow(lines[i + 1]).map(c => {
          const t = c.trim();
          if (/^:.*:$/.test(t)) return 'center';
          if (/:$/.test(t)) return 'right';
          if (/^:/.test(t)) return 'left';
          return '';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) { rows.push(splitRow(lines[i])); i++; }
        let html = '<table><thead><tr>';
        head.forEach((c, k) => html += `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c.trim(), ctx)}</th>`);
        html += '</tr></thead><tbody>';
        rows.forEach(r => {
          html += '<tr>';
          for (let k = 0; k < head.length; k++) html += `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline((r[k] || '').trim(), ctx)}</td>`;
          html += '</tr>';
        });
        out += html + '</tbody></table>';
        continue;
      }

      // 列表
      if (RE.item.test(line)) {
        const block = [];
        while (i < lines.length) {
          const l = lines[i];
          if (RE.item.test(l)) { block.push(l); i++; continue; }
          if (!l.trim()) {
            const nx = lines[i + 1];
            if (nx && (RE.item.test(nx) || /^\s{2,}\S/.test(nx))) { block.push(''); i++; continue; }
            break;
          }
          if (/^\s{2,}\S/.test(l)) { block.push(l); i++; continue; }
          break;
        }
        out += renderList(block, ctx);
        continue;
      }

      // 段落
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { buf.push(lines[i]); i++; }
      if (!buf.length) { buf.push(lines[i]); i++; }
      // 单独成段的 [[slug]] → 渲染为文章卡片（Firefly 仅支持 [[slug]]，不支持 ![[slug]]）
      const paraText = buf.join('\n').trim();
      const wikiM = paraText.match(/^\[\[([^\]]+?)\]\]\s*$/);
      if (wikiM) { out += renderWikiCard(wikiM[1], ctx); continue; }
      // Setext 标题
      if (i < lines.length && RE.setext.test(lines[i]) && buf.length === 1) {
        const lv = lines[i].trim()[0] === '=' ? 1 : 2;
        const id = ctx.uid(slugify(buf[0]) || 'h' + lv);
        ctx.headings.push({ level: lv, text: buf[0], id });
        out += `<h${lv} id="${escapeAttr(id)}">${inline(buf[0], ctx)}</h${lv}>`;
        i++; continue;
      }
      out += `<p>${inline(buf.join('\n'), ctx)}</p>`;
    }
    return out;
  }

  /* 单独成段的 wiki 链接 → 文章卡片（标题/描述/时间/分类/标签/封面从本地文档库读取） */
  const WC_ICONS = {
    calendar: '<svg class="wc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    book: '<svg class="wc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    tag: '<svg class="wc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    chevron: '<svg class="wc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
  };
  function renderWikiCard(inner, ctx) {
    let target = inner.trim(), alias = '';
    const bar = target.indexOf('|');
    if (bar >= 0) { alias = target.slice(bar + 1).trim(); target = target.slice(0, bar).trim(); }
    const hash = target.indexOf('#');
    const slug = (hash >= 0 ? target.slice(0, hash) : target).trim();
    const heading = hash >= 0 ? target.slice(hash) : '';
    const href = slug ? '/posts/' + slug.replace(/^\/+|\/+$/g, '') + '/' + heading : (heading || '#');
    const doc = slug ? (Store.docs() || []).find(d => ((d.meta && d.meta.slug) || '').trim() === slug) : null;
    // 默认封面兜底（与编辑器默认随机封面 API 保持一致）
    const DEFAULT_COVER = 'https://api.boxmoe.com/random.php';
    const coverWrap = cover => `<span class="wc-cover-wrap"><img class="wc-cover" src="${escapeAttr(cover || DEFAULT_COVER)}" alt="" loading="lazy"><span class="wc-cover-overlay">${WC_ICONS.chevron}</span></span>`;
    if (doc) {
      const m = doc.meta || {};
      const title = alias || m.title || doc.name || slug;
      const cover = coverValue(m) || DEFAULT_COVER;
      const desc = m.description || '';
      const date = m.published ? String(m.published).slice(0, 10) : '';
      const cat = m.category || '';
      const tags = Array.isArray(m.tags) ? m.tags : [];
      // Firefly/Fuwari 风格：左侧内容（标题带强调线、图标元信息、描述），右侧圆角封面
      return `<a class="wiki-card rich" href="${escapeAttr(href)}">` +
        `<span class="wc-body">` +
          `<span class="wc-title">${escapeHtml(title)}</span>` +
          `<span class="wc-meta">` +
            (date ? `<span class="wc-m-item">${WC_ICONS.calendar}<span>${escapeHtml(date)}</span></span>` : '') +
            (cat ? `<span class="wc-m-item">${WC_ICONS.book}<span>${escapeHtml(cat)}</span></span>` : '') +
            (tags.length ? `<span class="wc-m-item">${WC_ICONS.tag}<span>${tags.map(t => escapeHtml(t)).join(' / ')}</span></span>` : '') +
          `</span>` +
          (desc ? `<span class="wc-desc">${escapeHtml(desc)}</span>` : '') +
        `</span>` +
        coverWrap(cover) +
      `</a>`;
    }
    // 目标文章不在本地库：仍渲染为占位卡片（独占段的意图就是卡片，保持视觉一致）
    const title = alias || slug.split('/').pop();
    return `<a class="wiki-card rich placeholder" href="${escapeAttr(href)}">` +
      `<span class="wc-body">` +
        `<span class="wc-title">${escapeHtml(title)}</span>` +
        `<span class="wc-meta"><span class="wc-m-item">${WC_ICONS.book}<span>未在本地文档库找到该文章</span></span></span>` +
      `</span>` +
      coverWrap(DEFAULT_COVER) +
    `</a>`;
  }

  function isBlockStart(l) {
    return RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) ||
           RE.item.test(l) || RE.github.test(l) || RE.fndef.test(l) || /^ {0,3}</.test(l) ||
           /^ {0,3}:::[a-z]/i.test(l) || /^ {0,3}[!?]{3,}/.test(l) || /^\s*\$\$/.test(l);
  }
  function admBlock(type, customTitle, raw, ctx, collapsible, expanded) {
    const labels = { note:'注释', tip:'提示', info:'信息', warning:'警告', danger:'危险', success:'成功', failure:'失败', bug:'缺陷', question:'疑问', quote:'引用', abstract:'摘要', example:'示例', caution:'注意', important:'重要' };
    const t = String(type || 'note').toLowerCase();
    const title = customTitle || labels[t] || t.toUpperCase();
    const inner = parseBlocks(raw.split('\n'), ctx);
    if (collapsible) {
      return `<details class="admonition adm-${escapeHtml(t)} adm-collapse${expanded ? ' open' : ''}"><summary class="adm-title">${escapeHtml(title)}</summary>${inner}</details>`;
    }
    return `<div class="admonition adm-${escapeHtml(t)}"><div class="adm-title">${escapeHtml(title)}</div>${inner}</div>`;
  }
  // 把 "1,3-5" 解析成行号集合
  function parseLineMarks(spec) {
    const set = new Set();
    (spec || '').split(',').forEach(part => {
      const p = part.trim();
      if (!p) return;
      const r = /^(\d+)\s*-\s*(\d+)$/.exec(p);
      if (r) {
        let a = +r[1], b = +r[2];
        if (a > b) { const t = a; a = b; b = t; }
        for (let n = a; n <= b && n - a < 2000; n++) set.add(n);
      } else if (/^\d+$/.test(p)) set.add(+p);
    });
    return set;
  }
  // 解析代码块 fence 元信息：title="…" / {行标记} / wrap / showLineNumbers / start=N
  function parseFenceMeta(s) {
    const meta = (s || '').trim();
    const empty = { title: '', markers: '', marks: new Set(), wrap: false, lineNumbers: false, start: 1, hint: '' };
    if (!meta) return empty;
    const tM = meta.match(/title=["']([^"']*)["']/i);
    const title = tM ? tM[1] : '';
    const mkr = meta.match(/\{([^{}]*)\}/);
    const markers = mkr ? mkr[1].trim() : '';
    const marks = parseLineMarks(markers);
    const wrap = /\bwrap\b/i.test(meta);
    const sM = meta.match(/\b(?:startLineNumber|start)=(\d+)/i);
    const start = sM ? Math.max(1, +sM[1]) : 1;
    const wantLn = /\b(?:showLineNumbers|lineNumbers|numbers)\b/i.test(meta);
    const noLn = /\b(?:noLineNumbers|hideLineNumbers)\b/i.test(meta);
    // 自动换行时行号无法与折行对齐，故与行号互斥
    const lineNumbers = !noLn && !wrap && (wantLn || marks.size > 0);
    const parts = [];
    if (markers && !lineNumbers) parts.push('行标记 {' + markers + '}');
    if (wrap) parts.push('自动换行');
    return { title, markers, marks, wrap, lineNumbers, start, hint: parts.join(' · ') };
  }
  // 统一渲染代码块（含行号栏与标记行）
  function codeBlockHtml(code, lang, fm) {
    const rows = code.split('\n');
    const cls = [];
    if (fm.wrap) cls.push('code-wrap');
    if (fm.lineNumbers) cls.push('has-ln');
    const headLang = escapeHtml(lang || 'text') + (fm.title ? ' · ' + escapeHtml(fm.title) : '');
    const head = `<div class="code-head"><span>${headLang}</span><span>${rows.length} 行</span></div>`;
    const codeEl = `<code class="lang-${escapeAttr(lang)}">${HL(code, lang)}</code>`;
    let body = codeEl;
    if (fm.lineNumbers) {
      const nums = rows.map((_, idx) => {
        const no = fm.start + idx;
        return `<span class="ln${fm.marks.has(no) ? ' ln-mark' : ''}">${no}</span>`;
      }).join('');
      body = `<div class="code-body"><span class="line-nums" aria-hidden="true">${nums}</span>${codeEl}</div>`;
    }
    const foot = fm.hint ? `<div class="code-meta">${escapeHtml(fm.hint)}</div>` : '';
    return `<pre${cls.length ? ` class="${cls.join(' ')}"` : ''}>${head}${body}${foot}</pre>`;
  }
  function splitRow(row) {
    let s = row.trim().replace(/^\|/, '').replace(/\|$/, '');
    const out = []; let cur = '', esc = false;
    for (const ch of s) {
      if (esc) { cur += ch; esc = false; continue; }
      if (ch === '\\') { esc = true; cur += ch; continue; }
      if (ch === '|') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function renderList(block, ctx) {
    const items = [];
    for (const l of block) {
      const m = RE.item.exec(l);
      if (m) {
        const indent = m[1].replace(/\t/g, '  ').length;
        const ordered = /\d/.test(m[2][0]);
        let content = m[3], checked = null;
        const t = /^\[([ xX])\]\s+(.*)$/.exec(content);
        if (t) { checked = t[1].toLowerCase() === 'x'; content = t[2]; }
        items.push({ indent, ordered, checked, start: ordered ? parseInt(m[2], 10) : null, lines: [content], children: [] });
      } else if (items.length) {
        const last = items[items.length - 1];
        last.lines.push(l.replace(new RegExp('^ {0,' + (last.indent + 4) + '}'), ''));
      }
    }
    if (!items.length) return '';

    const root = { ordered: items[0].ordered, indent: items[0].indent, start: items[0].start, items: [] };
    const stack = [root];
    for (const it of items) {
      let top = stack[stack.length - 1];
      if (it.indent > top.indent + 1) {
        const parent = top.items[top.items.length - 1];
        if (parent) {
          const nl = { ordered: it.ordered, indent: it.indent, start: it.start, items: [] };
          parent.children.push(nl);
          stack.push(nl); top = nl;
        }
      } else {
        while (stack.length > 1 && it.indent < top.indent) { stack.pop(); top = stack[stack.length - 1]; }
      }
      top.items.push(it);
    }
    return renderListNode(root, ctx);
  }

  function renderListNode(node, ctx) {
    const isTask = node.items.length > 0 && node.items.every(it => it.checked !== null);
    const tag = node.ordered ? 'ol' : 'ul';
    const startAttr = node.ordered && node.start && node.start !== 1 ? ` start="${node.start}"` : '';
    let html = `<${tag}${startAttr}${isTask ? ' class="task-list"' : ''}>`;
    for (const it of node.items) {
      const raw = it.lines.join('\n').replace(/\s+$/, '');
      const multi = /\n\s*\n/.test(raw) || /^\s{0,3}(```|~~~|>|#{1,6}\s|\|)/m.test(raw);
      let body = multi ? parseBlocks(raw.split('\n'), ctx) : inline(raw, ctx);
      const kids = it.children.map(c => renderListNode(c, ctx)).join('');
      if (it.checked !== null) {
        html += `<li class="task-item${it.checked ? ' done' : ''}"><input type="checkbox" disabled${it.checked ? ' checked' : ''}><span>${body}${kids}</span></li>`;
      } else {
        html += `<li>${body}${kids}</li>`;
      }
    }
    return html + `</${tag}>`;
  }

  function ghCard(repo) {
    const r = escapeHtml(repo);
    return `<a class="gh-card" href="https://github.com/${escapeAttr(repo)}" target="_blank" rel="noopener" data-gh="${escapeAttr(repo)}">
      <svg class="gh-ico" viewBox="0 0 24 24"><use href="#i-github"/></svg>
      <span class="gh-main">
        <span class="gh-name">${r}</span>
        <span class="gh-desc">GitHub 仓库卡片 · 发布后由主题实时拉取仓库简介与数据</span>
        <span class="gh-meta"><span>★ stars</span><span>⑂ forks</span><span>● language</span></span>
      </span></a>`;
  }

  // 代码组：将多个代码块渲染为带标签页的切换容器（纯 CSS 切换，无需 JS）
  function renderCodeGroup(blocks, labels, ctx) {
    const gid = ctx.uid('cg');
    const metas = blocks.map(b => parseFenceMeta(b.meta || ''));
    const labelFor = (b, i) => escapeHtml(labels[i] || metas[i].title || b.lang || ('代码 ' + (i + 1)));
    const radios = blocks.map((b, i) =>
      `<input class="cg-radio" type="radio" name="${escapeAttr(gid)}" id="${escapeAttr(gid)}-${i}"${i === 0 ? ' checked' : ''}>`).join('');
    const tabbar = blocks.map((b, i) =>
      `<label class="cg-tab" for="${escapeAttr(gid)}-${i}">${labelFor(b, i)}</label>`).join('');
    const panels = blocks.map((b, i) =>
      `<div class="cg-panel">${codeBlockHtml(b.code, b.lang || 'text', metas[i])}</div>`).join('');
    return `<div class="code-group">${radios}<div class="cg-tabs">${tabbar}</div><div class="cg-panels">${panels}</div></div>`;
  }

  return function render(src) {
    const ctx = {
      headings: [], footnotes: {}, footnoteOrder: [], seen: {},
      uid(base) { let id = base || 'sec'; let n = 1; while (this.seen[id]) id = base + '-' + (++n); this.seen[id] = 1; return id; }
    };
    const lines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    let html = parseBlocks(lines, ctx);

    if (ctx.footnoteOrder.length) {
      html += '<div class="footnotes"><ol>';
      ctx.footnoteOrder.forEach(id => {
        const body = ctx.footnotes[id] || '';
        html += `<li id="fn-${escapeAttr(id)}">${inline(body, ctx)} <a href="#fnref-${escapeAttr(id)}">↩</a></li>`;
      });
      html += '</ol></div>';
    }
    return { html, headings: ctx.headings };
  };
})();

/* ==========================================================================
 * 3. 应用状态与默认值
 * ========================================================================== */
const DEFAULT_META = () => ({
  title: '', published: toLocalInput(new Date()), updated: '', withTime: false,
  description: '', slug: '', author: '', lang: '',
  coverMode: 'none', coverRandom: 'https://api.boxmoe.com/random.php', coverId: '', coverRandomCustom: '', coverUrl: '',
  category: '', tags: [],
  draft: false, pinned: false, comment: true,
  slugAsName: false,
  licensePreset: '', licenseName: '', licenseUrl: '', sourceLink: '',
  password: '', passwordHint: '',
  extras: []
});

const SAMPLE = (typeof window !== 'undefined' && window.FIREFLY_SAMPLE) ? window.FIREFLY_SAMPLE : '';

const state = { meta: DEFAULT_META(), content: SAMPLE, docId: null, docName: '未命名文章' };

/* ==========================================================================
 * 4. 本地存储 / 文档库
 * ========================================================================== */
const Store = {
  K_DOCS: 'fmd.docs.v1', K_CUR: 'fmd.current.v1', K_PREF: 'fmd.pref.v1', K_TAGS: 'fmd.tags.v1',
  read(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('本地存储写入失败（可能已满）', 'err'); return false; } },
  docs() { return this.read(this.K_DOCS, []); },
  saveDocs(list) { this.write(this.K_DOCS, list); },
  pref() { return this.read(this.K_PREF, { theme: 'auto', layout: 'three', sync: true }); },
  savePref(p) { this.write(this.K_PREF, p); },
  memo() { return this.read(this.K_TAGS, { tags: [], cats: [], authors: [] }); },
  saveMemo(m) { this.write(this.K_TAGS, m); }
};

function persistDoc(silent) {
  const docs = Store.docs();
  const name = state.meta.title.trim() || '未命名文章';
  state.docName = name;
  let doc = docs.find(d => d.id === state.docId);
  if (!doc) {
    doc = { id: state.docId || ('d' + Date.now().toString(36)), name, updatedAt: Date.now(), meta: state.meta, content: state.content };
    state.docId = doc.id;
    docs.unshift(doc);
  } else {
    doc.name = name; doc.updatedAt = Date.now(); doc.meta = state.meta; doc.content = state.content;
  }
  Store.saveDocs(docs.slice(0, 60));
  Store.write(Store.K_CUR, state.docId);
  $('#docName').textContent = name;
  if (!silent) setSaveState('已保存');
}
const persistDebounced = debounce(() => persistDoc(), 700);

function setSaveState(txt, saving) {
  const el = $('#saveState');
  el.textContent = txt;
  el.classList.toggle('saving', !!saving);
}

/* 记忆标签 / 分类 / 作者 */
function rememberMemo() {
  const m = Store.memo();
  state.meta.tags.forEach(t => { if (t && m.tags.indexOf(t) < 0) m.tags.unshift(t); });
  if (state.meta.category && m.cats.indexOf(state.meta.category) < 0) m.cats.unshift(state.meta.category);
  if (state.meta.author && m.authors.indexOf(state.meta.author) < 0) m.authors.unshift(state.meta.author);
  m.tags = m.tags.slice(0, 30); m.cats = m.cats.slice(0, 20); m.authors = m.authors.slice(0, 10);
  Store.saveMemo(m);
  renderMemo();
}
function renderMemo() {
  const m = Store.memo();
  $('#categoryList').innerHTML = m.cats.map(c => `<option value="${escapeAttr(c)}">`).join('');
  $('#authorList').innerHTML = m.authors.map(c => `<option value="${escapeAttr(c)}">`).join('');
  const rec = m.tags.filter(t => state.meta.tags.indexOf(t) < 0).slice(0, 12);
  $('#tagRecent').innerHTML = rec.map(t => `<button type="button" data-tag="${escapeAttr(t)}">+ ${escapeHtml(t)}</button>`).join('');
}

/* ==========================================================================
 * 5. FrontMatter 生成与解析
 * ========================================================================== */
function yamlValue(v) {
  const s = String(v);
  if (s === '') return '""';
  const needQuote =
    /^[\s]|[\s]$/.test(s) ||
    /[:#"'{}\[\],&*?|<>=!%@`]/.test(s) ||
    /^[-?]/.test(s) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(s) ||
    /^[\d.+-]+$/.test(s);
  if (!needQuote) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function coverValue(meta) {
  if (meta.coverMode === 'random') {
    const base = meta.coverRandom === '__custom__' ? meta.coverRandomCustom.trim() : meta.coverRandom;
    if (!base) return '';
    const id = (meta.coverId || '').trim();
    if (id) {
      const sep = base.indexOf('?') >= 0 ? (base.endsWith('?') ? '' : '&') : '?';
      return base + sep + id;
    }
    return base;
  }
  if (meta.coverMode === 'custom') return meta.coverUrl.trim();
  return '';
}

function buildFrontMatter() {
  const m = state.meta, L = [];
  const push = (k, v) => L.push(`${k}: ${v}`);

  push('title', yamlValue(m.title.trim() || '未命名文章'));
  push('published', fmtDate(m.published, m.withTime) || fmtDate(toLocalInput(new Date()), m.withTime));
  if (m.updated) push('updated', fmtDate(m.updated, m.withTime));
  if (m.description.trim()) push('description', yamlValue(m.description.trim().replace(/\s*\n\s*/g, ' ')));

  const cover = coverValue(m);
  if (cover) push('image', yamlValue(cover));

  if (m.tags.length) push('tags', '[' + m.tags.map(t => yamlValue(t)).join(', ') + ']');
  if (m.category.trim()) push('category', yamlValue(m.category.trim()));
  if (m.draft) push('draft', 'true');
  if (m.pinned) push('pinned', 'true');
  if (m.slug.trim()) push('slug', yamlValue(m.slug.trim()));
  if (m.lang) push('lang', yamlValue(m.lang));
  if (m.author.trim()) push('author', yamlValue(m.author.trim()));
  push('comment', m.comment ? 'true' : 'false');
  if (m.licenseName.trim()) push('licenseName', yamlValue(m.licenseName.trim()));
  if (m.licenseUrl.trim()) push('licenseUrl', yamlValue(m.licenseUrl.trim()));
  if (m.sourceLink.trim()) push('sourceLink', yamlValue(m.sourceLink.trim()));
  if (m.password.trim()) push('password', yamlValue(m.password.trim()));
  if (m.passwordHint.trim()) push('passwordHint', yamlValue(m.passwordHint.trim()));
  m.extras.forEach(e => { if (e.k && e.k.trim()) push(e.k.trim(), e.v.trim() === '' ? '""' : (/^(true|false|\d+(\.\d+)?|\[.*\]|\{.*\})$/.test(e.v.trim()) ? e.v.trim() : yamlValue(e.v.trim()))); });

  return '---\n' + L.join('\n') + '\n---';
}
function normalizeBody(src) {
  const lines = src.replace(/^\n+/, '').split('\n');
  const structural = /^\s*(#{1,6}\s|>|[-*+\u2022]\s|\d+[.)]\s|```|~~~|---|\*\*\*|___|::github|\[\^|<|\||\$\$|:::|!{3,}|\?{3,})/;
  const isPara = l => l.trim() !== '' && !structural.test(l);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    out.push(line);
    if (isPara(line) && next !== undefined && isPara(next)) {
      out[out.length - 1] = line.replace(/\s+$/, '') + '  ';
    }
  }
  return out.join('\n');
}
function buildFullDoc() { return buildFrontMatter() + '\n\n' + normalizeBody(state.content); }

/* ---------- 解析导入的 Markdown ---------- */
function parseYamlValue(raw) {
  let s = raw.trim();
  if (!s) return '';
  if (/^\[.*\]$/.test(s)) {
    const inner = s.slice(1, -1);
    if (!inner.trim()) return [];
    return splitFlow(inner).map(x => stripQuote(x.trim())).filter(x => x !== '');
  }
  return stripQuote(s);
}
function splitFlow(s) {
  const out = []; let cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { cur += c + (s[++i] || ''); continue; } if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
function stripQuote(s) {
  s = s.trim();
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function parseMarkdown(text) {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\s*\n?/.exec(src);
  const meta = DEFAULT_META();
  meta.tags = []; meta.extras = []; meta.comment = true; meta.published = '';
  let body = src;
  const known = ['title','published','updated','description','image','tags','category','draft','pinned','slug','lang','author','comment','licenseName','licenseUrl','sourceLink','password','passwordHint'];

  if (m) {
    body = src.slice(m[0].length);
    const lines = m[1].split('\n');
    const raw = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      const key = kv[1];
      let val = kv[2];
      if (val.trim() === '' || val.trim() === '|' || val.trim() === '>') {
        // 块列表 or 多行文本
        const items = [];
        let j = i + 1;
        while (j < lines.length && /^\s+/.test(lines[j]) && lines[j].trim()) {
          const li = /^\s*-\s+(.*)$/.exec(lines[j]);
          items.push(li ? stripQuote(li[1]) : lines[j].trim());
          j++;
        }
        raw[key] = /^\s*-\s+/.test(lines[i + 1] || '') ? items : items.join(' ');
        i = j - 1;
      } else {
        raw[key] = parseYamlValue(val);
      }
    }

    const T = k => (typeof raw[k] === 'string' ? raw[k] : (raw[k] == null ? '' : String(raw[k])));
    meta.title = T('title');
    meta.published = parseDateToInput(raw.published) || toLocalInput(new Date());
    meta.updated = parseDateToInput(raw.updated);
    meta.withTime = /\d{1,2}:\d{2}/.test(String(raw.published || '')) || /\d{1,2}:\d{2}/.test(String(raw.updated || ''));
    meta.description = T('description');
    meta.slug = T('slug');
    meta.author = T('author');
    meta.lang = normalizeLang(T('lang'));
    meta.category = T('category');
    meta.tags = Array.isArray(raw.tags) ? raw.tags : (raw.tags ? String(raw.tags).split(/[,、]/).map(s => s.trim()).filter(Boolean) : []);
    meta.draft = /^true$/i.test(T('draft'));
    meta.pinned = /^true$/i.test(T('pinned'));
    meta.comment = raw.comment == null ? true : !/^false$/i.test(T('comment'));
    meta.licenseName = T('licenseName');
    meta.licenseUrl = T('licenseUrl');
    meta.sourceLink = T('sourceLink');
    meta.password = T('password');
    meta.passwordHint = T('passwordHint');

    const img = T('image');
    if (img) {
      // 预设均为 PHP 类随机图接口，可在地址后追加 ?id 区分不同文章封面
      const opts = $$('#f-cover-random option').map(o => o.value).filter(v => v && v !== '__custom__');
      let matched = null, mid = '';
      for (const o of opts) {
        if (img === o) { matched = o; mid = ''; break; }
        const q = o.indexOf('?');
        const base = q >= 0 ? o.slice(0, q) : o;
        const m = new RegExp('^' + base.replace(/[.?*+^${}()|[\]\\]/g, '\\$&') + '\\?(.+)$').exec(img);
        if (m) { matched = o; mid = m[1]; break; }
      }
      if (matched) { meta.coverMode = 'random'; meta.coverRandom = matched; meta.coverId = mid; }
      else if (/^https?:\/\//i.test(img) && /(api|random|acg|php)/i.test(img)) { meta.coverMode = 'random'; meta.coverRandom = '__custom__'; meta.coverRandomCustom = img; }
      else { meta.coverMode = 'custom'; meta.coverUrl = img; }
    }
    Object.keys(raw).forEach(k => {
      if (known.indexOf(k) < 0) meta.extras.push({ k, v: Array.isArray(raw[k]) ? '[' + raw[k].join(', ') + ']' : String(raw[k]) });
    });
  }
  return { meta, body: body.replace(/^\n+/, '') };
}

/* ==========================================================================
 * 6. 编辑器内核
 * ========================================================================== */
const ed = $('#editor');

const Editor = {
  get value() { return ed.value; },
  set value(v) { ed.value = v; this.changed(); },
  sel() { return { s: ed.selectionStart, e: ed.selectionEnd, t: ed.value.slice(ed.selectionStart, ed.selectionEnd) }; },

  /** 保留原生撤销栈的替换 */
  replace(start, end, text, selS, selE) {
    ed.focus();
    ed.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      const v = ed.value;
      ed.value = v.slice(0, start) + text + v.slice(end);
    }
    if (selS != null) ed.setSelectionRange(selS, selE == null ? selS : selE);
    this.changed();
  },

  insert(text, caretBack) {
    const { s, e } = this.sel();
    const pos = s + text.length - (caretBack || 0);
    this.replace(s, e, text, pos);
  },

  /** 包裹选区 */
  wrap(before, after, placeholder) {
    const { s, e, t } = this.sel();
    const v = ed.value;
    // 已包裹 → 取消
    if (t && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
      this.replace(s - before.length, e + after.length, t, s - before.length, e - before.length);
      return;
    }
    if (t && t.startsWith(before) && t.endsWith(after) && t.length >= before.length + after.length) {
      const inner = t.slice(before.length, t.length - after.length);
      this.replace(s, e, inner, s, s + inner.length);
      return;
    }
    const body = t || placeholder || '';
    this.replace(s, e, before + body + after, t ? s + before.length : s + before.length, t ? e + before.length : s + before.length + body.length);
  },

  /** 行范围 */
  lineRange(pos) {
    const v = ed.value;
    const s = v.lastIndexOf('\n', pos - 1) + 1;
    let e = v.indexOf('\n', pos);
    if (e < 0) e = v.length;
    return { s, e };
  },
  selLines() {
    const { s, e } = this.sel();
    const a = this.lineRange(s), b = this.lineRange(e);
    return { s: a.s, e: b.e, text: ed.value.slice(a.s, b.e) };
  },

  /** 行首前缀切换 */
  linePrefix(prefix, opts) {
    opts = opts || {};
    const r = this.selLines();
    const lines = r.text.split('\n');
    const re = opts.strip || new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // 只有非空行全部已有该前缀时才“取消”；空行不计入，避免在空行上触发时没反应
    const nonEmpty = lines.filter(l => l.trim());
    const allHave = nonEmpty.length > 0 && nonEmpty.every(l => re.test(l));
    let n = 0;
    const out = lines.map(l => {
      if (allHave) return l.replace(re, '');
      if (opts.clean) l = l.replace(opts.clean, '');
      const p = opts.ordered ? (++n) + '. ' : prefix;
      return l.trim() || lines.length === 1 ? p + l : l;
    }).join('\n');
    this.replace(r.s, r.e, out, r.s, r.s + out.length);
  },

  changed() {
    onEditorInput();
  }
};

/* ---------- 工具栏命令 ---------- */
const ORDER_RE = /^\s*\d+[.)]\s+/;
const CLEAN_LINE = /^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/;

const CMD = {
  undo: () => document.execCommand('undo'),
  redo: () => document.execCommand('redo'),
  h1: () => CMD.head(1), h2: () => CMD.head(2), h3: () => CMD.head(3),
  head(n) {
    const p = '#'.repeat(n) + ' ';
    Editor.linePrefix(p, { strip: new RegExp('^#{' + n + '}\\s+'), clean: /^\s*#{1,6}\s+/ });
  },
  bold: () => Editor.wrap('**', '**', '粗体文本'),
  italic: () => Editor.wrap('*', '*', '斜体文本'),
  strike: () => Editor.wrap('~~', '~~', '删除线'),
  inlinecode: () => Editor.wrap('`', '`', 'code'),
  quote: () => Editor.linePrefix('> ', { strip: /^>\s?/ }),
  ul: () => Editor.linePrefix('- ', { strip: /^\s*[-*+]\s+/, clean: CLEAN_LINE }),
  ol: () => Editor.linePrefix('1. ', { strip: ORDER_RE, ordered: true, clean: CLEAN_LINE }),
  task: () => Editor.linePrefix('- [ ] ', { strip: /^\s*[-*+]\s+\[[ xX]\]\s+/, clean: CLEAN_LINE }),
  hr: () => Editor.insert('\n---\n\n'),
  codeblock() {
    const { t } = Editor.sel();
    Editor.wrap('```js\n', '\n```\n', t || '// 在此输入代码');
  },
  footnote() {
    const id = 'fn' + ((Editor.value.match(/\[\^[^\]]+\]:/g) || []).length + 1);
    const { s, e } = Editor.sel();
    Editor.replace(s, e, `[^${id}]`, s + id.length + 3);
    const caret = ed.selectionStart;
    const v = Editor.value;
    const tail = (/\n$/.test(v) ? '' : '\n') + `\n[^${id}]: 脚注内容`;
    Editor.replace(v.length, v.length, tail, caret);   // 追加定义后光标回到正文
  },
  link: () => openModal('#modalLink', () => { $('#lkText').value = Editor.sel().t || ''; $('#lkUrl').value = ''; $('#lkTitle').value = ''; $('#lkUrl').focus(); }),
  image: () => openModal('#modalImage', () => { $('#imgAlt').value = Editor.sel().t || ''; $('#imgUrl').value = ''; $('#imgUrl').focus(); }),
  table: () => openModal('#modalTable'),
  github: () => openModal('#modalGithub', () => { $('#ghRepo').value = ''; $('#ghRepo').focus(); }),
  video: () => openModal('#modalVideo', () => { $('#vdInput').value = ''; $('#vdInput').focus(); }),
  iframe: () => openModal('#modalIframe', () => { $('#ifUrl').value = ''; $('#ifUrl').focus(); }),
  admonition: () => openModal('#modalAdmonition', () => {
    $('#adText').value = Editor.sel().t || '';
    $$('#adStyle .seg-item').forEach(x => x.classList.toggle('active', x.dataset.s === 'github'));
    $$('#adType .seg-item').forEach(x => x.classList.toggle('active', x.dataset.t === 'NOTE'));
    $('#adCollapsible').checked = false;
    $('#adCollapsibleWrap').hidden = true;
  }),
  'admonition-d': () => openModal('#modalAdmonition', () => {
    $('#adText').value = Editor.sel().t || '';
    $$('#adStyle .seg-item').forEach(x => x.classList.toggle('active', x.dataset.s === 'docusaurus'));
    $$('#adType .seg-item').forEach(x => x.classList.toggle('active', x.dataset.t === 'TIP'));
    $('#adCollapsible').checked = false;
    $('#adCollapsibleWrap').hidden = true;
  }),
  'admonition-o': () => openModal('#modalAdmonition', () => {
    $('#adText').value = Editor.sel().t || '';
    $$('#adStyle .seg-item').forEach(x => x.classList.toggle('active', x.dataset.s === 'obsidian'));
    $$('#adType .seg-item').forEach(x => x.classList.toggle('active', x.dataset.t === 'note'));
    $('#adCollapsible').checked = false;
    $('#adCollapsibleWrap').hidden = false;
  }),
  mathblock: () => Editor.insert('\n$$\n' + (Editor.sel().t || 'e^{i\\pi} + 1 = 0') + '\n$$\n\n'),
  math: () => openModal('#modalMath', () => { $('#mathTex').value = 'e^{i\\pi} + 1 = 0'; $$('#mathMode .seg-item').forEach(x => x.classList.toggle('active', x.dataset.m === 'inline')); $('#mathTex').focus(); }),
  mermaid: () => openModal('#modalMermaid', () => { $('#mmText').value = 'graph TD\n  A[开始] --> B{条件检查}\n  B -->|是| C[处理步骤 1]\n  B -->|否| D[处理步骤 2]\n  C --> E[结束]\n  D --> E'; $('#mmText').focus(); }),
  wikilink: () => openModal('#modalWikilink', () => { $('#wkSlug').value = ''; $('#wkAlias').value = Editor.sel().t || ''; $('#wkSlug').focus(); }),
  wikicard: () => openModal('#modalWikicard', () => { $('#wcSlug').value = ''; $('#wcTitle').value = Editor.sel().t || ''; $('#wcSlug').focus(); }),
  codeln: () => openModal('#modalCodeln', () => { $('#clLang').value = 'js'; $('#clStart').value = ''; $('#clNumbers').checked = true; $('#clWrap').checked = false; $('#clMarks').value = ''; $('#clCode').value = Editor.sel().t || ''; $('#clLang').focus(); }),
  plantuml: () => openModal('#modalPlantuml', () => { $('#puText').value = '@startuml\nAlice -> Bob: 认证请求\nBob --> Alice: 响应\n@enduml'; $('#puText').focus(); }),
  grid: () => openModal('#modalGrid', () => { $('#gdUrls').value = ''; $('#gdUrls').focus(); }),
  codegroup: () => openModal('#modalCodegroup', () => { $('#cgTabs').innerHTML = ''; cgAddRow('js', 'JavaScript', 'console.log("Hi");'); $('#cgAdd').focus(); }),
  spoiler: () => Editor.wrap(':spoiler[', ']', '隐藏内容'),
  find: () => toggleFind(true),
  zen: () => toggleZen()
};

// 移动端将下拉菜单锚定到视口右侧，避免触发按钮在可滚动工具栏右缘时菜单溢出
function fixDropdownPositions() {
  const mobile = window.innerWidth <= 760;
  const tbBottom = mobile ? Math.round(document.getElementById('toolbar').getBoundingClientRect().bottom) : 0;
  $$('.tb-dropdown').forEach(dd => {
    const menu = dd.querySelector('.tb-dropdown-menu');
    if (!menu) return;
    if (mobile && dd.classList.contains('open')) {
      menu.style.position = 'fixed';
      menu.style.top = (tbBottom + 4) + 'px';
      menu.style.left = 'auto';
      menu.style.right = '8px';
      menu.style.zIndex = '300';
    } else {
      menu.style.position = ''; menu.style.top = ''; menu.style.left = ''; menu.style.right = ''; menu.style.zIndex = '';
    }
  });
}

$('#toolbar').addEventListener('click', e => {
  const dropTrigger = e.target.closest('.tb-dropdown > .tb-btn');
  if (dropTrigger) {
    const parent = dropTrigger.parentElement;
    const willOpen = !parent.classList.contains('open');
    $$('.tb-dropdown').forEach(d => d.classList.remove('open'));
    if (willOpen) parent.classList.add('open');
    fixDropdownPositions();
    return;
  }
  const menuItem = e.target.closest('.tb-dropdown-menu [data-cmd]');
  if (menuItem) {
    $$('.tb-dropdown').forEach(d => d.classList.remove('open'));
    fixDropdownPositions();
    const fn = CMD[menuItem.dataset.cmd];
    if (fn) fn();
    return;
  }
  const btn = e.target.closest('[data-cmd]');
  if (!btn) return;
  const fn = CMD[btn.dataset.cmd];
  if (fn) fn();
});

// 点击外部关闭工具栏下拉分组
document.addEventListener('click', e => {
  if (!e.target.closest('.tb-dropdown')) { $$('.tb-dropdown').forEach(d => d.classList.remove('open')); fixDropdownPositions(); }
});
window.addEventListener('resize', debounce(fixDropdownPositions, 120));

/* ---------- 键盘 ---------- */
ed.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;

  if (slashOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(key)) {
    e.preventDefault(); slashNav(key); return;
  }

  if (mod && !e.shiftKey && !e.altKey) {
    const map = { b: 'bold', i: 'italic', k: 'link', '`': 'inlinecode', '1': 'h1', '2': 'h2', '3': 'h3', d: 'dup', f: 'find' };
    const k = key.toLowerCase();
    if (map[k]) {
      e.preventDefault();
      if (map[k] === 'dup') return dupLine();
      CMD[map[k]] && CMD[map[k]]();
      return;
    }
  }
  if (mod && e.shiftKey && key.toLowerCase() === 'k') { e.preventDefault(); return delLine(); }
  if (e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) { e.preventDefault(); return moveLine(key === 'ArrowUp' ? -1 : 1); }

  // Tab 缩进
  if (key === 'Tab') {
    e.preventDefault();
    const { s, e: en, t } = Editor.sel();
    if (t.indexOf('\n') >= 0 || e.shiftKey) {
      const r = Editor.selLines();
      const out = r.text.split('\n').map(l => e.shiftKey ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l).join('\n');
      Editor.replace(r.s, r.e, out, r.s, r.s + out.length);
    } else {
      Editor.replace(s, en, '  ');
    }
    return;
  }

  // 回车：列表续写 / 引用续写 / 表格
  if (key === 'Enter' && !e.shiftKey && !mod) {
    const pos = ed.selectionStart;
    if (pos !== ed.selectionEnd) return;
    const { s } = Editor.lineRange(pos);
    const lineToCaret = ed.value.slice(s, pos);
    const li = /^(\s*)([-*+]|(\d{1,9})[.)])[ \t]+(\[[ xX]\][ \t]+)?(.*)$/.exec(lineToCaret);
    if (li) {
      e.preventDefault();
      if (!li[5].trim() && !(li[4] || '').trim()) {           // 空条目 → 结束列表
        Editor.replace(s, pos, '', s);
        return;
      }
      const marker = li[3] ? (parseInt(li[3], 10) + 1) + li[2].slice(-1) : li[2];
      const task = li[4] ? '[ ] ' : '';
      Editor.insert('\n' + li[1] + marker + ' ' + task);
      return;
    }
    const q = /^(\s*>[ \t]?)(.*)$/.exec(lineToCaret);
    if (q) {
      e.preventDefault();
      if (!q[2].trim()) { Editor.replace(s, pos, '', s); return; }
      Editor.insert('\n' + q[1]);
      return;
    }
  }

  // 选区包裹
  if (ed.selectionStart !== ed.selectionEnd) {
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '*': '*', '_': '_', '~': '~', '=': '=' };
    if (pairs[key]) { e.preventDefault(); Editor.wrap(key, pairs[key]); return; }
  }
});

function dupLine() {
  const r = Editor.selLines();
  Editor.replace(r.e, r.e, '\n' + r.text, r.e + 1 + r.text.length);
}
function delLine() {
  const r = Editor.selLines();
  const end = Math.min(ed.value.length, r.e + 1);
  Editor.replace(r.s, end, '', r.s);
}
function moveLine(dir) {
  const v = ed.value, r = Editor.selLines();
  if (dir < 0) {
    if (r.s === 0) return;
    const prev = Editor.lineRange(r.s - 1);
    const prevText = v.slice(prev.s, prev.e);
    Editor.replace(prev.s, r.e, r.text + '\n' + prevText, prev.s, prev.s + r.text.length);
  } else {
    if (r.e >= v.length) return;
    const next = Editor.lineRange(r.e + 1);
    const nextText = v.slice(next.s, next.e);
    Editor.replace(r.s, next.e, nextText + '\n' + r.text, r.s + nextText.length + 1, r.s + nextText.length + 1 + r.text.length);
  }
}

/* ---------- 斜杠命令 ---------- */
const SLASH = [
  { k: 'h1', icon: 'i-hash', name: '一级标题', desc: '# 标题' },
  { k: 'h2', icon: 'i-hash', name: '二级标题', desc: '## 标题' },
  { k: 'h3', icon: 'i-hash', name: '三级标题', desc: '### 标题' },
  { k: 'bold', icon: 'i-bold', name: '粗体', desc: '**文本**' },
  { k: 'italic', icon: 'i-italic', name: '斜体', desc: '*文本*' },
  { k: 'ul', icon: 'i-ul', name: '无序列表', desc: '- 项目' },
  { k: 'ol', icon: 'i-ol', name: '有序列表', desc: '1. 项目' },
  { k: 'task', icon: 'i-task', name: '任务列表', desc: '- [ ] 待办' },
  { k: 'quote', icon: 'i-quote', name: '引用', desc: '> 引用' },
  { k: 'codeblock', icon: 'i-terminal', name: '代码块', desc: '``` 语言' },
  { k: 'table', icon: 'i-table', name: '表格', desc: '生成表格' },
  { k: 'link', icon: 'i-link', name: '链接', desc: '[文字](url)' },
  { k: 'image', icon: 'i-image', name: '图片', desc: '![alt](url)' },
  { k: 'hr', icon: 'i-minus', name: '分割线', desc: '---' },
  { k: 'spoiler', icon: 'i-spoiler', name: '剧透遮罩', desc: ':spoiler[…]' },
  { k: 'github', icon: 'i-github', name: 'GitHub 卡片', desc: '::github{repo}' },
  { k: 'video', icon: 'i-video', name: '视频嵌入', desc: 'B站 / YouTube' },
  { k: 'iframe', icon: 'i-frame', name: 'Iframe', desc: '自定义嵌入' },
  { k: 'math', icon: 'i-math', name: '行内数学公式', desc: '$...$ KaTeX' },
  { k: 'mathblock', icon: 'i-math', name: '块级数学公式', desc: '$$...$$ KaTeX' },
  { k: 'mermaid', icon: 'i-mermaid', name: 'Mermaid 图表', desc: '```mermaid' },
  { k: 'wikilink', icon: 'i-wikilink', name: '内部链接', desc: '[[slug|别名]]' },
  { k: 'wikicard', icon: 'i-wikilink', name: '文章卡片', desc: '[[slug]] 卡片式内链（独占一段）' },
  { k: 'codeln', icon: 'i-code', name: '代码块（行号）', desc: '```js showLineNumbers {2}' },
  { k: 'plantuml', icon: 'i-plantuml', name: 'PlantUML 图表', desc: '```plantuml' },
  { k: 'grid', icon: 'i-grid', name: '图片画廊', desc: '[grid] … [/grid]（最多并排 4 张）' },
  { k: 'codegroup', icon: 'i-codegroup', name: '代码组', desc: '::: code-group' },
  { k: 'admonition', icon: 'i-alert', name: '提示块（GitHub）', desc: '> [!TIP]' },
  { k: 'admonition-d', icon: 'i-alert', name: '提示块（Docusaurus）', desc: ':::tip' },
  { k: 'admonition-o', icon: 'i-alert', name: '提示块（Obsidian）', desc: '!!! note' },
  { k: 'footnote', icon: 'i-footnote', name: '脚注', desc: '[^1]' }
];
let slashOpen = false, slashIdx = 0, slashStart = -1, slashList = [];

function openSlash() {
  slashOpen = true; slashIdx = 0; slashStart = ed.selectionStart - 1;
  filterSlash('');
}
function filterSlash(q) {
  slashList = SLASH.filter(x => !q || x.name.includes(q) || x.k.includes(q.toLowerCase()) || x.desc.toLowerCase().includes(q.toLowerCase()));
  const menu = $('#slashMenu');
  if (!slashList.length) { closeSlash(); return; }
  slashIdx = clamp(slashIdx, 0, slashList.length - 1);
  menu.innerHTML = slashList.map((x, i) =>
    `<button class="slash-item${i === slashIdx ? ' sel' : ''}" data-k="${x.k}"><svg class="ico"><use href="#${x.icon}"/></svg><span><b>${x.name}</b><i>${escapeHtml(x.desc)}</i></span></button>`).join('');
  menu.classList.remove('hidden');
  const c = caretCoords();
  const wrap = $('#editorWrap');
  const top0 = wrap.offsetTop;                       // 菜单相对 .panel-editor 定位
  const maxTop = top0 + wrap.clientHeight - 300;
  menu.style.left = clamp(c.x, 8, Math.max(8, wrap.clientWidth - 262)) + 'px';
  menu.style.top = clamp(top0 + c.y + 22, top0 + 8, Math.max(top0 + 8, maxTop)) + 'px';
}
function closeSlash() { slashOpen = false; $('#slashMenu').classList.add('hidden'); }
function slashNav(key) {
  if (key === 'Escape') return closeSlash();
  if (key === 'ArrowDown') { slashIdx = (slashIdx + 1) % slashList.length; return filterSlash(currentSlashQuery()); }
  if (key === 'ArrowUp') { slashIdx = (slashIdx - 1 + slashList.length) % slashList.length; return filterSlash(currentSlashQuery()); }
  runSlash(slashList[slashIdx].k);
}
function currentSlashQuery() { return ed.value.slice(slashStart + 1, ed.selectionStart); }
function runSlash(k) {
  const end = ed.selectionStart;
  Editor.replace(slashStart, end, '', slashStart);
  closeSlash();
  setTimeout(() => { const fn = CMD[k]; fn && fn(); }, 0);
}
$('#slashMenu').addEventListener('mousedown', e => {
  const it = e.target.closest('[data-k]');
  if (it) { e.preventDefault(); runSlash(it.dataset.k); }
});

/** 计算光标在编辑区中的坐标（镜像法） */
let mirror = null;
function caretCoords() {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.style.cssText = 'position:absolute;visibility:hidden;white-space:pre-wrap;word-break:break-word;top:0;left:0;pointer-events:none;';
    $('#editorWrap').appendChild(mirror);
  }
  const cs = getComputedStyle(ed);
  ['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft',
   'borderTopWidth','borderLeftWidth','letterSpacing','tabSize','textIndent'].forEach(p => mirror.style[p] = cs[p]);
  mirror.style.width = ed.clientWidth + 'px';
  const pre = ed.value.slice(0, ed.selectionStart);
  mirror.textContent = pre;
  const span = document.createElement('span');
  span.textContent = '\u200b';
  mirror.appendChild(span);
  const gw = $('#gutter').offsetWidth || 0;
  return { x: span.offsetLeft + gw, y: span.offsetTop - ed.scrollTop };
}

/* ---------- 查找替换 ---------- */
let findMatches = [], findCur = -1;
function toggleFind(show) {
  const bar = $('#findBar');
  const on = show === undefined ? bar.classList.contains('hidden') : show;
  bar.classList.toggle('hidden', !on);
  if (on) { $('#findInput').value = Editor.sel().t || $('#findInput').value; $('#findInput').select(); doFind(); }
  else { ed.focus(); }
}
function buildFindRe() {
  const q = $('#findInput').value;
  if (!q) return null;
  const flags = 'g' + ($('#findCase').checked ? '' : 'i');
  try { return new RegExp($('#findRegex').checked ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); }
  catch (e) { return null; }
}
function doFind(keep) {
  const re = buildFindRe();
  findMatches = [];
  if (re) { let m; while ((m = re.exec(ed.value)) !== null) { findMatches.push([m.index, m.index + m[0].length]); if (m[0] === '') re.lastIndex++; if (findMatches.length > 5000) break; } }
  if (!keep) findCur = findMatches.length ? 0 : -1;
  $('#findCount').textContent = (findMatches.length ? findCur + 1 : 0) + '/' + findMatches.length;
  if (findCur >= 0 && findMatches[findCur]) {
    const [a, b] = findMatches[findCur];
    ed.focus(); ed.setSelectionRange(a, b);
    scrollCaretIntoView();
  }
}
function findStep(d) {
  if (!findMatches.length) return;
  findCur = (findCur + d + findMatches.length) % findMatches.length;
  doFind(true);
}
function scrollCaretIntoView() {
  const before = ed.value.slice(0, ed.selectionStart).split('\n').length - 1;
  const lh = parseFloat(getComputedStyle(ed).lineHeight) || 24;
  const target = before * lh - ed.clientHeight / 2;
  ed.scrollTop = clamp(target, 0, ed.scrollHeight);
}
$('#findInput').addEventListener('input', () => doFind());
$('#findCase').addEventListener('change', () => doFind());
$('#findRegex').addEventListener('change', () => doFind());
$('#findNext').addEventListener('click', () => findStep(1));
$('#findPrev').addEventListener('click', () => findStep(-1));
$('#findClose').addEventListener('click', () => toggleFind(false));
$('#findInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') toggleFind(false);
});
$('#btnReplace').addEventListener('click', () => {
  if (findCur < 0 || !findMatches[findCur]) return;
  const [a, b] = findMatches[findCur];
  Editor.replace(a, b, $('#replaceInput').value, a + $('#replaceInput').value.length);
  doFind();
});
$('#btnReplaceAll').addEventListener('click', () => {
  const re = buildFindRe();
  if (!re) return;
  const rep = $('#replaceInput').value;
  const nv = ed.value.replace(re, rep);
  const n = findMatches.length;
  Editor.replace(0, ed.value.length, nv, 0, 0);
  toast(`已替换 ${n} 处`, 'ok');
  doFind();
});

/* ---------- 输入 / 统计 / 行号 ---------- */
function onEditorInput() {
  state.content = ed.value;
  updateGutter();
  updateStats();
  renderPreviewDebounced();
  setSaveState('保存中…', true);
  persistDebounced();
}
ed.addEventListener('input', e => {
  onEditorInput();
  if (e.data === '/') {
    const p = ed.selectionStart - 1;
    const ch = p > 0 ? ed.value[p - 1] : '\n';
    if (ch === '\n' || ch === ' ' || p === 0) openSlash();
  } else if (slashOpen) {
    if (ed.selectionStart <= slashStart) closeSlash();
    else filterSlash(currentSlashQuery());
  }
});
ed.addEventListener('blur', () => setTimeout(closeSlash, 120));
ed.addEventListener('click', () => { closeSlash(); updateCaretInfo(); });
ed.addEventListener('keyup', updateCaretInfo);
ed.addEventListener('scroll', () => {
  $('#gutter').scrollTop = ed.scrollTop;
  syncPreviewScroll();
});

function updateGutter() {
  const g = $('#gutter');
  const n = ed.value.split('\n').length;
  if (g.childElementCount !== n) {
    let html = '';
    for (let i = 1; i <= n; i++) html += '<i>' + i + '</i>';
    g.innerHTML = html;
  }
  g.scrollTop = ed.scrollTop;
  updateCaretInfo();
}
function updateCaretInfo() {
  const pos = ed.selectionStart;
  const before = ed.value.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  $('#statPos').textContent = `行 ${line}, 列 ${col}`;
  const g = $('#gutter');
  const prev = g.querySelector('.cur');
  if (prev) prev.classList.remove('cur');
  const cur = g.children[line - 1];
  if (cur) cur.classList.add('cur');
}
function updateStats() {
  const v = ed.value;
  const chars = v.length;
  const cjk = (v.match(/[\u4e00-\u9fa5\u3040-\u30ff]/g) || []).length;
  const en = (v.replace(/[\u4e00-\u9fa5\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9_'-]+/g) || []).length;
  const words = cjk + en;
  $('#statWords').textContent = words;
  $('#statChars').textContent = chars;
  $('#statLines').textContent = v.split('\n').length;
  $('#statRead').textContent = Math.max(1, Math.ceil(words / 350));
}

/* ---------- 滚动同步 ---------- */
let syncLock = false;
function syncPreviewScroll() {
  if (!$('#syncScroll').checked || syncLock) return;
  const pane = $('#previewRender');
  if (!pane.classList.contains('active')) return;
  const max = ed.scrollHeight - ed.clientHeight;
  if (max <= 0) return;
  const ratio = ed.scrollTop / max;
  syncLock = true;
  pane.scrollTop = ratio * (pane.scrollHeight - pane.clientHeight);
  setTimeout(() => syncLock = false, 40);
}

/* ==========================================================================
 * 7. 预览渲染
 * ========================================================================== */
let lastHeadings = [];
function renderPreview() {
  const m = state.meta;
  const { html, headings } = MD(state.content);
  lastHeadings = headings;

  const cover = coverValue(m);
  const meta = [];
  const dt = fmtDate(m.published, m.withTime);
  const dtUpdated = m.updated ? fmtDate(m.updated, m.withTime) : '';
  if (dt) meta.push(`<span class="m-pill">🗓 ${escapeHtml(dt)}</span>`);
  // 只有当 updated 显式设置且与 published 不同时才展示，避免用户只填发布时间却出现两个日期
  if (dtUpdated && dtUpdated !== dt) meta.push(`<span class="m-pill">🔄 ${escapeHtml(dtUpdated)}</span>`);
  if (m.category) meta.push(`<span class="m-pill">📁 ${escapeHtml(m.category)}</span>`);
  if (m.author) meta.push(`<span class="m-pill">✍ ${escapeHtml(m.author)}</span>`);
  m.tags.forEach(t => meta.push(`<span class="m-pill tag"># ${escapeHtml(t)}</span>`));
  if (m.draft) meta.push('<span class="m-pill draft">草稿</span>');
  if (m.pinned) meta.push('<span class="m-pill pinned">置顶</span>');
  if (m.password) meta.push('<span class="m-pill lock">🔒 已加密</span>');
  if (!m.comment) meta.push('<span class="m-pill">💬 评论关闭</span>');

  const header = `<header class="pv-header">
    ${cover ? `<img class="pv-cover" src="${escapeAttr(safeUrl(cover))}" alt="cover" onerror="this.style.display='none'">` : ''}
    <h1 class="pv-title">${escapeHtml(m.title || '未命名文章')}</h1>
    ${m.description ? `<p class="pv-desc">${escapeHtml(m.description)}</p>` : ''}
    ${meta.length ? `<div class="pv-meta">${meta.join('')}</div>` : ''}
    <hr class="pv-divider">
  </header>`;

  $('#previewRender').innerHTML = header + (html || '<p class="pane-empty">开始写点什么吧…</p>');

  // YAML / 源码
  $('#previewYaml').innerHTML = highlightYaml(buildFrontMatter());
  $('#previewSource').textContent = buildFullDoc();

  // 大纲
  const ol = $('#outlineList');
  ol.innerHTML = headings.length
    ? headings.map(h => `<button class="outline-item" data-lv="${h.level}" data-id="${escapeAttr(h.id)}"><em>H${h.level}</em><span>${escapeHtml(h.text)}</span></button>`).join('')
    : '<div class="outline-empty">暂无标题，使用 # 创建章节</div>';
}
const renderPreviewDebounced = debounce(renderPreview, 60);

function highlightYaml(y) {
  return escapeHtml(y).split('\n').map(line => {
    if (/^---$/.test(line)) return '<span class="y-mark">---</span>';
    const m = /^([A-Za-z_][\w-]*)(:\s*)([\s\S]*)$/.exec(line);
    if (!m) return line;
    let val = m[3];
    let cls = 'y-val';
    if (/^(true|false)$/.test(val)) cls = 'y-bool';
    else if (/^[\d.]+$/.test(val)) cls = 'y-num';
    return `<span class="y-key">${m[1]}</span><span class="y-mark">${m[2]}</span><span class="${cls}">${val}</span>`;
  }).join('\n');
}

$('#outlineList').addEventListener('click', e => {
  const it = e.target.closest('[data-id]');
  if (!it) return;
  switchTab('render');
  const el = document.getElementById(it.dataset.id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#previewRender').addEventListener('click', e => {
  const sp = e.target.closest('.spoiler');
  if (sp) { sp.classList.toggle('show'); return; }
  const a = e.target.closest('a[href^="#"]');
  if (a) {
    const id = a.getAttribute('href').slice(1);
    if (/^(fn|fnref)-/.test(id)) {
      e.preventDefault();
      const target = document.getElementById(id);
      if (target) {
        const pane = $('#previewRender');
        pane.scrollTop = target.offsetTop - pane.offsetTop - 12;
      }
    }
  }
});

/* 预览标签页 */
function switchTab(name) {
  $$('.pv-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  const map = { render: '#previewRender', outline: '#previewOutline', yaml: '#previewYaml', source: '#previewSource' };
  $$('.pv-pane').forEach(p => p.classList.remove('active'));
  $(map[name]).classList.add('active');
}
$('#previewTabs').addEventListener('click', e => {
  const t = e.target.closest('.pv-tab');
  if (t) switchTab(t.dataset.tab);
});
$('#btnCopyPane').addEventListener('click', () => {
  const active = $('.pv-pane.active');
  const txt = active.id === 'previewYaml' ? buildFrontMatter()
            : active.id === 'previewSource' ? buildFullDoc()
            : active.innerText;
  copyText(txt, '已复制当前面板内容');
});

/* ==========================================================================
 * 8. 表单绑定
 * ========================================================================== */
function bindInput(sel, key, ev) {
  const el = $(sel);
  el.addEventListener(ev || 'input', () => {
    state.meta[key] = el.type === 'checkbox' ? el.checked : el.value;
    afterMetaChange();
  });
  return el;
}
function afterMetaChange() {
  renderPreviewDebounced();
  setSaveState('保存中…', true);
  persistDebounced();
  $('#descCount').textContent = state.meta.description.length;
  updateCoverUI();
}

bindInput('#f-title', 'title');
bindInput('#f-published', 'published', 'change');
bindInput('#f-updated', 'updated', 'change');
bindInput('#f-description', 'description');
bindInput('#f-slug', 'slug');
bindInput('#f-slug-as-name', 'slugAsName', 'change');
bindInput('#f-author', 'author');
bindInput('#f-lang', 'lang', 'change');
bindInput('#f-category', 'category');
bindInput('#f-cover-url', 'coverUrl');
bindInput('#f-cover-random', 'coverRandom', 'change');
bindInput('#f-cover-id', 'coverId');
bindInput('#f-cover-random-custom', 'coverRandomCustom');
bindInput('#f-license-name', 'licenseName');
bindInput('#f-license-url', 'licenseUrl');
bindInput('#f-source-link', 'sourceLink');
bindInput('#f-password', 'password');
bindInput('#f-password-hint', 'passwordHint');
bindInput('#f-draft', 'draft', 'change');
bindInput('#f-pinned', 'pinned', 'change');
bindInput('#f-comment', 'comment', 'change');
bindInput('#f-with-time', 'withTime', 'change');

$('#f-title').addEventListener('blur', rememberMemo);
$('#f-category').addEventListener('blur', rememberMemo);
$('#f-author').addEventListener('blur', rememberMemo);

$('#btnNowPublished').addEventListener('click', () => { state.meta.published = toLocalInput(new Date()); $('#f-published').value = state.meta.published; afterMetaChange(); });
$('#btnNowUpdated').addEventListener('click', () => { state.meta.updated = toLocalInput(new Date()); $('#f-updated').value = state.meta.updated; afterMetaChange(); });

$('#btnSlugAuto').addEventListener('click', () => {
  const t = state.meta.title.trim();
  let s = slugify(t);
  if (!s || /^[\u4e00-\u9fa5-]+$/.test(s)) {
    // 纯中文标题 → 用日期 + 短哈希，避免 URL 过长
    const d = (state.meta.published || toLocalInput(new Date())).slice(0, 10);
    let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    s = (s ? s + '-' : 'post-') + d + '-' + h.toString(36).slice(0, 4);
  }
  state.meta.slug = s; $('#f-slug').value = s; afterMetaChange();
  toast('已生成 slug', 'ok');
});

$('#btnAutoDesc').addEventListener('click', () => {
  const plain = state.content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~#>|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const d = plain.slice(0, 110) + (plain.length > 110 ? '…' : '');
  state.meta.description = d; $('#f-description').value = d; afterMetaChange();
  toast(d ? '已生成摘要' : '正文为空', d ? 'ok' : 'err');
});

/* 封面模式 */
$('#coverMode').addEventListener('click', e => {
  const b = e.target.closest('.seg-item');
  if (!b) return;
  state.meta.coverMode = b.dataset.mode;
  afterMetaChange();
});
function updateCoverUI() {
  const m = state.meta;
  $$('#coverMode .seg-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m.coverMode));
  $('.cover-random').classList.toggle('hidden', m.coverMode !== 'random');
  $('.cover-custom').classList.toggle('hidden', m.coverMode !== 'custom');
  $('#f-cover-id').classList.toggle('hidden', m.coverMode !== 'random');
  $('#f-cover-random-custom').classList.toggle('hidden', m.coverRandom !== '__custom__');
  const url = coverValue(m);
  const box = $('#coverPreview');
  if (url) { box.classList.remove('hidden'); if ($('#coverImg').getAttribute('src') !== url) $('#coverImg').src = url; }
  else box.classList.add('hidden');
}

/* 标签 chips */
function renderTags() {
  const box = $('#tagChips');
  $$('.chip', box).forEach(c => c.remove());
  const input = $('#tagInput');
  state.meta.tags.forEach((t, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${escapeHtml(t)}<button type="button" data-i="${i}" title="移除"><svg class="ico" style="width:11px;height:11px"><use href="#i-x"/></svg></button>`;
    box.insertBefore(chip, input);
  });
  renderMemo();
}
function addTags(str) {
  String(str).split(/[,，、;；]/).map(s => s.trim()).filter(Boolean).forEach(t => {
    if (state.meta.tags.indexOf(t) < 0) state.meta.tags.push(t);
  });
  renderTags(); afterMetaChange(); rememberMemo();
}
$('#tagInput').addEventListener('keydown', e => {
  const v = e.target.value;
  if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、') {
    e.preventDefault();
    if (v.trim()) { addTags(v); e.target.value = ''; }
  } else if (e.key === 'Backspace' && !v && state.meta.tags.length) {
    state.meta.tags.pop(); renderTags(); afterMetaChange();
  }
});
$('#tagInput').addEventListener('blur', e => { if (e.target.value.trim()) { addTags(e.target.value); e.target.value = ''; } });
$('#tagChips').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  state.meta.tags.splice(+b.dataset.i, 1);
  renderTags(); afterMetaChange();
});
$('#tagRecent').addEventListener('click', e => {
  const b = e.target.closest('button[data-tag]');
  if (b) addTags(b.dataset.tag);
});

/* 协议预设 */
$('#f-license-preset').addEventListener('change', e => {
  const v = e.target.value;
  state.meta.licensePreset = v;
  if (v && v !== '__custom__') {
    const [n, u] = v.split('|');
    state.meta.licenseName = n; state.meta.licenseUrl = u;
    $('#f-license-name').value = n; $('#f-license-url').value = u;
  } else if (!v) {
    state.meta.licenseName = ''; state.meta.licenseUrl = '';
    $('#f-license-name').value = ''; $('#f-license-url').value = '';
  }
  afterMetaChange();
});

/* 自定义字段 */
function renderExtras() {
  const box = $('#extraFields');
  box.innerHTML = state.meta.extras.map((e, i) => `
    <div class="extra-item">
      <input type="text" data-x="k" data-i="${i}" value="${escapeAttr(e.k)}" placeholder="字段名">
      <input type="text" data-x="v" data-i="${i}" value="${escapeAttr(e.v)}" placeholder="值">
      <button class="icon-btn" data-del="${i}" title="删除"><svg class="ico ico-sm"><use href="#i-trash"/></svg></button>
    </div>`).join('');
}
$('#btnAddExtra').addEventListener('click', () => { state.meta.extras.push({ k: '', v: '' }); renderExtras(); afterMetaChange(); });
$('#extraFields').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.x) { state.meta.extras[+el.dataset.i][el.dataset.x] = el.value; afterMetaChange(); }
});
$('#extraFields').addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (b) { state.meta.extras.splice(+b.dataset.del, 1); renderExtras(); afterMetaChange(); }
});

/* 折叠面板 */
$('#configBody').addEventListener('click', e => {
  const h = e.target.closest('.acc-head');
  if (h) h.parentElement.classList.toggle('open');
});
$('#btnCollapseAll').addEventListener('click', e => {
  const accs = $$('.acc');
  const anyOpen = accs.some(a => a.classList.contains('open'));
  accs.forEach(a => a.classList.toggle('open', !anyOpen));
  e.target.textContent = anyOpen ? '展开' : '折叠';
});

/* ---------- 表单 ← 状态 ---------- */
function fillForm() {
  const m = state.meta;
  $('#f-title').value = m.title;
  $('#f-published').value = m.published;
  $('#f-updated').value = m.updated;
  $('#f-with-time').checked = !!m.withTime;
  $('#f-description').value = m.description;
  $('#descCount').textContent = m.description.length;
  $('#f-slug').value = m.slug;
  $('#f-slug-as-name').checked = !!m.slugAsName;
  $('#f-author').value = m.author;
  $('#f-lang').value = normalizeLang(m.lang);
  $('#f-cover-random').value = m.coverRandom;
  $('#f-cover-random-custom').value = m.coverRandomCustom;
  $('#f-cover-id').value = m.coverId;
  $('#f-cover-url').value = m.coverUrl;
  $('#f-category').value = m.category;
  $('#f-draft').checked = m.draft;
  $('#f-pinned').checked = m.pinned;
  $('#f-comment').checked = m.comment;
  $('#f-license-name').value = m.licenseName;
  $('#f-license-url').value = m.licenseUrl;
  $('#f-source-link').value = m.sourceLink;
  $('#f-password').value = m.password;
  $('#f-password-hint').value = m.passwordHint;
  const preset = $$('#f-license-preset option').find(o => o.value.split('|')[0] === m.licenseName);
  $('#f-license-preset').value = preset ? preset.value : (m.licenseName ? '__custom__' : '');
  renderTags(); renderExtras(); updateCoverUI();
}

/* ==========================================================================
 * 9. 弹窗系统
 * ========================================================================== */
function openModal(sel, before) {
  const m = $(sel);
  if (before) before();
  m.hidden = false;
  const f = m.querySelector('input, textarea, select');
  setTimeout(() => f && f.focus(), 30);
}
function closeModal(sel) { $(sel).hidden = true; }
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) {
    const m = e.target.closest('.modal');
    if (m) m.hidden = true;
  } else if (e.target.classList.contains('modal')) {
    e.target.hidden = true;
  }
});

/* 链接 */
$('#lkOk').addEventListener('click', () => {
  const t = $('#lkText').value || '链接文字';
  const u = $('#lkUrl').value.trim() || 'https://';
  const ti = $('#lkTitle').value.trim();
  closeModal('#modalLink');
  Editor.insert(`[${t}](${u}${ti ? ` "${ti}"` : ''})`);
});
/* 图片 */
$('#imgOk').addEventListener('click', () => {
  const a = $('#imgAlt').value || 'image';
  const u = $('#imgUrl').value.trim() || '/images/example.png';
  const cap = $('#imgCaption').checked;
  closeModal('#modalImage');
  Editor.insert(`![${a}](${u})` + (cap ? `\n*${a}*\n` : ''));
});
/* 表格 */
$('#tbAlign').addEventListener('click', e => {
  const b = e.target.closest('.seg-item');
  if (b) { $$('#tbAlign .seg-item').forEach(x => x.classList.remove('active')); b.classList.add('active'); }
});
$('#tbOk').addEventListener('click', () => {
  const c = clamp(parseInt($('#tbCols').value, 10) || 3, 1, 12);
  const r = clamp(parseInt($('#tbRows').value, 10) || 3, 1, 30);
  const al = $('#tbAlign .seg-item.active').dataset.align;
  const sep = al === 'center' ? ':---:' : al === 'right' ? '---:' : ':---';
  let out = '\n| ' + Array.from({ length: c }, (_, i) => '列 ' + (i + 1)).join(' | ') + ' |\n';
  out += '| ' + Array.from({ length: c }, () => sep).join(' | ') + ' |\n';
  for (let i = 0; i < r; i++) out += '| ' + Array.from({ length: c }, () => '  ').join(' | ') + ' |\n';
  closeModal('#modalTable');
  Editor.insert(out + '\n');
});
/* GitHub */
$('#ghOk').addEventListener('click', () => {
  let v = $('#ghRepo').value.trim();
  const m = /github\.com\/([\w.-]+\/[\w.-]+)/i.exec(v);
  if (m) v = m[1];
  v = v.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(v)) { toast('请输入 owner/name 格式', 'err'); return; }
  closeModal('#modalGithub');
  Editor.insert(`\n::github{repo="${v}"}\n\n`);
});
/* 视频 */
function buildVideoEmbed(input, w, h, autoplay) {
  const s = input.trim();
  let bv = null, av = null, page = 1, yt = null;
  let m;
  if ((m = /(?:bilibili\.com\/video\/)?(BV[\w]{10})/i.exec(s))) bv = m[1];
  if ((m = /(?:bilibili\.com\/video\/)?av(\d+)/i.exec(s))) av = m[1];
  if ((m = /[?&]p=(\d+)/.exec(s))) page = m[1];
  if ((m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(s))) yt = m[1];

  if (bv || av) {
    const q = (bv ? 'bvid=' + bv : 'aid=' + av) + `&p=${page}&autoplay=${autoplay ? 1 : 0}&high_quality=1&danmaku=0`;
    return `<iframe width="${w}" height="${h}" src="//player.bilibili.com/player.html?${q}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>`;
  }
  if (yt) {
    return `<iframe width="${w}" height="${h}" src="https://www.youtube.com/embed/${yt}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  if (/^https?:\/\//i.test(s)) return `<iframe width="${w}" height="${h}" src="${s}" frameborder="0" allowfullscreen></iframe>`;
  return null;
}
$('#vdInput').addEventListener('input', e => {
  const r = buildVideoEmbed(e.target.value, '100%', 468, false);
  const tip = $('#vdDetect');
  if (!e.target.value.trim()) { tip.textContent = '自动识别 B站（BV号 / av号 / 分P）与 YouTube（watch / youtu.be / shorts）'; tip.className = 'hint'; }
  else if (r) { tip.textContent = r.includes('bilibili') ? '✓ 已识别：哔哩哔哩' : r.includes('youtube') ? '✓ 已识别：YouTube' : '✓ 通用 iframe 嵌入'; tip.className = 'hint'; tip.style.color = 'var(--teal)'; }
  else { tip.textContent = '未能识别，请检查链接'; tip.className = 'hint warn'; tip.style.color = ''; }
});
$('#vdOk').addEventListener('click', () => {
  const code = buildVideoEmbed($('#vdInput').value, $('#vdW').value || '100%', $('#vdH').value || '468', $('#vdAutoplay').checked);
  if (!code) { toast('无法识别视频链接', 'err'); return; }
  closeModal('#modalVideo');
  Editor.insert('\n' + code + '\n\n');
});
/* Iframe */
$('#ifOk').addEventListener('click', () => {
  const u = $('#ifUrl').value.trim();
  if (!u) { toast('请输入地址', 'err'); return; }
  closeModal('#modalIframe');
  Editor.insert(`\n<iframe width="${$('#ifW').value || '100%'}" height="${$('#ifH').value || '468'}" src="${u}" frameborder="0"${$('#ifFull').checked ? ' allowfullscreen' : ''}></iframe>\n\n`);
});
/* 数学公式模式切换 */
$('#mathMode').addEventListener('click', e => {
  const b = e.target.closest('.seg-item');
  if (b) { $$('#mathMode .seg-item').forEach(x => x.classList.remove('active')); b.classList.add('active'); }
});
/* 提示块 */
$('#adType').addEventListener('click', e => {
  const b = e.target.closest('.seg-item');
  if (b) { $$('#adType .seg-item').forEach(x => x.classList.remove('active')); b.classList.add('active'); }
});
$('#adStyle').addEventListener('click', e => {
  const b = e.target.closest('.seg-item');
  if (!b) return;
  $$('#adStyle .seg-item').forEach(x => x.classList.remove('active')); b.classList.add('active');
  $('#adCollapsibleWrap').hidden = b.dataset.s !== 'obsidian';
});
$('#adOk').addEventListener('click', () => {
  const t = $('#adType .seg-item.active').dataset.t;
  const style = $('#adStyle .seg-item.active').dataset.s;
  const body = ($('#adText').value || '提示内容').split('\n');
  let snip = '';
  if (style === 'github') {
    snip = '\n> [!' + t + ']\n' + body.map(l => '> ' + l).join('\n') + '\n\n';
  } else if (style === 'docusaurus') {
    snip = '\n:::' + t + (body.length === 1 ? '[' + body[0] + ']' : '') + '\n' + body.join('\n') + '\n:::\n\n';
  } else { // obsidian
    const open = $('#adCollapsible').checked ? '???' : '!!!';
    snip = '\n' + open + ' ' + t + ' "' + (body[0] || '提示') + '"\n' + body.map(l => '    ' + l).join('\n') + '\n\n';
  }
  closeModal('#modalAdmonition');
  Editor.insert(snip);
});
/* 数学公式 */
$('#mathOk').addEventListener('click', () => {
  const tex = ($('#mathTex').value || '').trim();
  if (!tex) { toast('请输入公式', 'err'); return; }
  const mode = $('#mathMode .seg-item.active').dataset.m;
  closeModal('#modalMath');
  if (mode === 'block') Editor.insert('\n$$\n' + tex + '\n$$\n\n');
  else Editor.insert('$' + tex + '$');
});
/* Mermaid */
$('#mmOk').addEventListener('click', () => {
  const code = ($('#mmText').value || '').trim();
  if (!code) { toast('请输入图表定义', 'err'); return; }
  closeModal('#modalMermaid');
  Editor.insert('\n```mermaid\n' + code + '\n```\n\n');
});
/* 内部链接 */
$('#wkOk').addEventListener('click', () => {
  const slug = $('#wkSlug').value.trim();
  if (!slug) { toast('请输入文章 slug', 'err'); return; }
  const alias = $('#wkAlias').value.trim();
  closeModal('#modalWikilink');
  Editor.insert(`[[${slug}${alias ? '|' + alias : ''}]]`);
});
/* 文章卡片 */
$('#wcOk').addEventListener('click', () => {
  const slug = $('#wcSlug').value.trim();
  if (!slug) { toast('请输入文章 slug', 'err'); return; }
  const title = $('#wcTitle').value.trim();
  closeModal('#modalWikicard');
  // 独占一段才会被渲染为卡片：前后补空行确保独立成段（Firefly 仅支持 [[slug]]，不支持 ![[slug]]）
  Editor.insert(`\n\n[[${slug}${title ? '|' + title : ''}]]\n\n`);
});
/* PlantUML */
$('#puOk').addEventListener('click', () => {
  const code = ($('#puText').value || '').trim();
  if (!code) { toast('请输入图表定义', 'err'); return; }
  closeModal('#modalPlantuml');
  Editor.insert('\n```plantuml\n' + code + '\n```\n\n');
});
/* 图片画廊 */
$('#gdOk').addEventListener('click', () => {
  const lines = ($('#gdUrls').value || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) { toast('请至少填写一个图片地址', 'err'); return; }
  const items = lines.map(l => {
    const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(l);
    return m ? `![${m[1]}](${m[2]})` : `![image](${l})`;
  }).join('\n');
  closeModal('#modalGrid');
  Editor.insert('\n[grid]\n' + items + '\n[/grid]\n\n');
});
/* 代码组：动态标签页 */
function cgAddRow(lang, label, code) {
  const row = document.createElement('div');
  row.className = 'cg-row';
  row.innerHTML = `<div class="cg-row-head">
      <input class="cg-lang" placeholder="语言，如 js" value="${escapeAttr(lang || '')}">
      <input class="cg-label" placeholder="标签（可选）" value="${escapeAttr(label || '')}">
      <button class="cg-del icon-btn" type="button" title="删除"><svg class="ico ico-sm"><use href="#i-x"/></svg></button>
    </div>
    <textarea class="cg-code" rows="3" placeholder="代码…">${escapeHtml(code || '')}</textarea>`;
  row.querySelector('.cg-del').addEventListener('click', () => row.remove());
  $('#cgTabs').appendChild(row);
}
$('#cgAdd').addEventListener('click', () => cgAddRow('', '', ''));
$('#cgOk').addEventListener('click', () => {
  const rows = $$('#cgTabs .cg-row');
  const blocks = [], labels = [];
  rows.forEach(r => {
    const lang = r.querySelector('.cg-lang').value.trim();
    const label = r.querySelector('.cg-label').value.trim();
    const code = r.querySelector('.cg-code').value;
    if (!code.trim()) return;
    blocks.push('```' + (lang || 'text') + '\n' + code.replace(/\n$/, '') + '\n```');
    labels.push(label || lang || '代码');
  });
  if (!blocks.length) { toast('请至少填写一个代码块', 'err'); return; }
  closeModal('#modalCodegroup');
  Editor.insert('\n::: code-group labels=[' + labels.join(', ') + ']\n' + blocks.join('\n') + '\n:::\n\n');
});
/* 代码块（行号） */
$('#clOk').addEventListener('click', () => {
  const lang = ($('#clLang').value || 'js').trim() || 'js';
  const code = ($('#clCode').value || '').replace(/\n$/, '');
  if (!code.trim()) { toast('请输入代码', 'err'); return; }
  const parts = [lang];
  if ($('#clNumbers').checked) parts.push('showLineNumbers');
  if ($('#clStart').value.trim()) parts.push('start=' + parseInt($('#clStart').value, 10));
  if ($('#clMarks').value.trim()) parts.push('{' + $('#clMarks').value.trim() + '}');
  if ($('#clWrap').checked) parts.push('wrap');
  closeModal('#modalCodeln');
  Editor.insert('\n```' + parts.join(' ') + '\n' + code + '\n```\n\n');
});
/* 确认框 */
let confirmCb = null;
function confirmBox(title, text, cb) {
  $('#cfTitle').textContent = title;
  $('#cfText').textContent = text;
  confirmCb = cb;
  openModal('#modalConfirm');
}
$('#cfOk').addEventListener('click', () => { closeModal('#modalConfirm'); confirmCb && confirmCb(); confirmCb = null; });

/* ==========================================================================
 * 10. 文档库
 * ========================================================================== */
function renderDocs() {
  const docs = Store.docs();
  const box = $('#docList');
  if (!docs.length) { box.innerHTML = '<div class="outline-empty">暂无文章</div>'; return; }
  box.innerHTML = docs.map(d => {
    const dt = new Date(d.updatedAt);
    const n = (d.content || '').length;
    return `<div class="doc-item${d.id === state.docId ? ' cur' : ''}">
      <button class="d-main" data-open="${d.id}">
        <div class="d-title">${escapeHtml(d.name || '未命名文章')}</div>
        <div class="d-meta">${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())} · ${n} 字符${d.meta && d.meta.draft ? ' · 草稿' : ''}</div>
      </button>
      <button class="icon-btn" data-dl="${d.id}" title="导出"><svg class="ico ico-sm"><use href="#i-download"/></svg></button>
      <button class="icon-btn del" data-del="${d.id}" title="删除"><svg class="ico ico-sm"><use href="#i-trash"/></svg></button>
    </div>`;
  }).join('');
}
$('#btnDocs').addEventListener('click', () => { renderDocs(); openModal('#modalDocs'); });
$('#btnNewDoc').addEventListener('click', () => {
  persistDoc(true);
  state.docId = null;
  state.meta = DEFAULT_META();
  state.content = '';
  ed.value = '';
  fillForm(); onEditorInput(); renderPreview();
  persistDoc(true); renderDocs();
  closeModal('#modalDocs');
  toast('已新建文章', 'ok');
  $('#f-title').focus();
});
$('#docList').addEventListener('click', e => {
  const open = e.target.closest('[data-open]');
  const del = e.target.closest('[data-del]');
  const dl = e.target.closest('[data-dl]');
  const docs = Store.docs();
  if (open) {
    persistDoc(true);
    const d = docs.find(x => x.id === open.dataset.open);
    if (!d) return;
    state.docId = d.id;
    state.meta = Object.assign(DEFAULT_META(), d.meta || {});
    state.content = d.content || '';
    ed.value = state.content;
    fillForm(); onEditorInput(); renderPreview();
    Store.write(Store.K_CUR, state.docId);
    $('#docName').textContent = d.name;
    closeModal('#modalDocs');
    toast('已切换：' + d.name, 'ok');
  }
  if (dl) {
    const d = docs.find(x => x.id === dl.dataset.dl);
    if (d) {
      const saveMeta = state.meta, saveContent = state.content;
      state.meta = Object.assign(DEFAULT_META(), d.meta || {}); state.content = d.content || '';
      downloadMd();
      state.meta = saveMeta; state.content = saveContent;
    }
  }
  if (del) {
    const id = del.dataset.del;
    const d = docs.find(x => x.id === id);
    confirmBox('删除文章', `确定删除「${d ? d.name : ''}」？此操作不可恢复。`, () => {
      const list = Store.docs().filter(x => x.id !== id);
      Store.saveDocs(list);
      if (state.docId === id) {
        // 删除的是当前文章：优先切换到剩余文章，没有时才新建空白文章
        if (list.length > 0) {
          const next = list[0];
          state.docId = next.id;
          state.meta = Object.assign(DEFAULT_META(), next.meta || {});
          state.content = next.content || '';
          ed.value = state.content;
          fillForm(); onEditorInput(); renderPreview();
          Store.write(Store.K_CUR, state.docId);
          $('#docName').textContent = next.name || '未命名文章';
        } else {
          state.docId = null;
          state.meta = DEFAULT_META();
          state.content = '';
          ed.value = '';
          fillForm(); onEditorInput(); renderPreview();
          persistDoc(true);
          Store.write(Store.K_CUR, state.docId);
          $('#docName').textContent = state.meta.title.trim() || '未命名文章';
        }
      }
      renderDocs(); toast('已删除');
    });
  }
});

/* ==========================================================================
 * 11. 导入 / 导出 / 复制 / 重置
 * ========================================================================== */
function downloadMd() {
  // 默认用「标题」作为导出文件名；开启 slugAsName 后用 slug（兜底回退到标题）
  const titleSlug = slugify(state.meta.title) || 'untitled';
  const name = (state.meta.slugAsName
    ? (state.meta.slug.trim() || titleSlug)
    : titleSlug)
    .replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  const blob = new Blob(['\uFEFF' + buildFullDoc()], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.md';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
$('#btnExport').addEventListener('click', () => {
  if (!state.meta.title.trim() && !state.meta.slug.trim()) { toast('请先填写文章标题或 slug', 'err'); $('#f-title').focus(); return; }
  downloadMd(); toast('已导出 Markdown 文件', 'ok');
});

function copyText(txt, okMsg) {
  const done = () => toast(okMsg || '已复制', 'ok');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallback());
  } else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择', 'err'); }
    ta.remove();
  }
}
$('#btnCopy').addEventListener('click', () => copyText(buildFullDoc(), '已复制完整博文'));

function importText(text, filename) {
  const { meta, body } = parseMarkdown(text);
  persistDoc(true);
  state.docId = null;
  state.meta = meta;
  if (!meta.title && filename) state.meta.title = filename.replace(/\.(md|markdown|mdx|txt)$/i, '');
  state.content = body;
  ed.value = body;
  fillForm(); onEditorInput(); renderPreview(); persistDoc();
  toast('导入成功：' + (state.meta.title || filename || 'Markdown'), 'ok');
}
$('#btnImport').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => importText(String(r.result), f.name);
  r.readAsText(f, 'utf-8');
  e.target.value = '';
});

/* 拖拽导入 */
let dragDepth = 0;
window.addEventListener('dragenter', e => {
  if (!e.dataTransfer || Array.from(e.dataTransfer.types || []).indexOf('Files') < 0) return;
  dragDepth++; $('#dropMask').classList.add('on');
});
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropMask').classList.remove('on'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('#dropMask').classList.remove('on');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (/\.(md|markdown|mdx|txt)$/i.test(f.name)) {
    const r = new FileReader(); r.onload = () => importText(String(r.result), f.name); r.readAsText(f, 'utf-8');
  } else if (/^image\//.test(f.type)) {
    Editor.insert(`![${f.name.replace(/\.[^.]+$/, '')}](/images/${f.name})`);
    toast('已插入图片引用，请把图片放到站点 images 目录', 'ok');
  } else toast('仅支持 .md / .markdown / .txt 文件', 'err');
});

/* 粘贴：图片 → 引用；HTML → Markdown */
ed.addEventListener('paste', e => {
  const dt = e.clipboardData;
  if (!dt) return;
  const file = Array.from(dt.files || [])[0];
  if (file && /^image\//.test(file.type)) {
    e.preventDefault();
    const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.png`;
    Editor.insert(`![${name.replace(/\.[^.]+$/, '')}](/images/${name})`);
    toast('已插入图片引用路径', 'ok');
    return;
  }
  const html = dt.getData('text/html');
  const plain = dt.getData('text/plain');
  if (html && html.length > 20 && !/^\s*<meta[^>]*>\s*$/i.test(html)) {
    const md = html2md(html);
    if (md && md.trim() && md.trim() !== (plain || '').trim()) {
      e.preventDefault();
      Editor.insert(md);
      toast('已将富文本转换为 Markdown', 'ok');
    }
  }
});

function html2md(html) {
  const box = document.createElement('div');
  box.innerHTML = html.replace(/<!--[\s\S]*?-->/g, '');
  box.querySelectorAll('script,style,meta,link').forEach(n => n.remove());
  const walk = node => {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      const inner = walk(n);
      switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          out += `\n\n${'#'.repeat(+tag[1])} ${inner.trim()}\n\n`; break;
        case 'strong': case 'b': out += inner.trim() ? `**${inner.trim()}**` : ''; break;
        case 'em': case 'i': out += inner.trim() ? `*${inner.trim()}*` : ''; break;
        case 'del': case 's': out += `~~${inner.trim()}~~`; break;
        case 'code': out += n.closest('pre') ? inner : '`' + inner.trim() + '`'; break;
        case 'pre': out += `\n\n\`\`\`\n${n.textContent.replace(/\n+$/, '')}\n\`\`\`\n\n`; break;
        case 'a': out += `[${inner.trim() || n.getAttribute('href')}](${n.getAttribute('href') || ''})`; break;
        case 'img': out += `![${n.getAttribute('alt') || 'image'}](${n.getAttribute('src') || ''})`; break;
        case 'br': out += '  \n'; break;
        case 'hr': out += '\n\n---\n\n'; break;
        case 'blockquote': out += '\n\n' + inner.trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n'; break;
        case 'li': {
          const p = n.parentElement && n.parentElement.tagName.toLowerCase();
          const idx = Array.from(n.parentElement.children).indexOf(n) + 1;
          out += (p === 'ol' ? `${idx}. ` : '- ') + inner.trim() + '\n'; break;
        }
        case 'ul': case 'ol': out += '\n' + inner + '\n'; break;
        case 'p': case 'div': case 'section': out += '\n\n' + inner.trim() + '\n\n'; break;
        case 'table': {
          const rows = Array.from(n.querySelectorAll('tr'));
          if (!rows.length) break;
          const cells = r => Array.from(r.children).map(c => c.textContent.trim().replace(/\|/g, '\\|'));
          const head = cells(rows[0]);
          out += '\n\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n';
          rows.slice(1).forEach(r => out += '| ' + cells(r).join(' | ') + ' |\n');
          out += '\n'; break;
        }
        default: out += inner;
      }
    });
    return out;
  };
  return walk(box).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

/* 重置 */
$('#btnReset').addEventListener('click', () => {
  confirmBox('重置全部内容', '将清空当前文章的配置与正文（其他文章不受影响），确定继续？', () => {
    state.meta = DEFAULT_META();
    state.content = '';
    ed.value = '';
    fillForm(); onEditorInput(); renderPreview(); persistDoc();
    toast('已重置');
  });
});

/* 打印 */
$('#btnPrint').addEventListener('click', () => { switchTab('render'); setTimeout(() => window.print(), 120); });

/* ==========================================================================
 * 12. 主题 / 布局 / 移动端
 * ========================================================================== */
const pref = Store.pref();
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const use = $('#btnTheme use');
  use.setAttribute('href', t === 'dark' ? '#i-moon' : t === 'light' ? '#i-sun' : '#i-auto');
  $('#btnTheme').title = '主题：' + ({ auto: '跟随系统', light: '浅色', dark: '深色' })[t];
  pref.theme = t; Store.savePref(pref);
}
$('#btnTheme').addEventListener('click', () => {
  let isDark = pref.theme === 'dark';
  if (pref.theme === 'auto' && window.matchMedia) {
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    if (darkMq && typeof darkMq.matches === 'boolean') isDark = darkMq.matches;
  }
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  toast('主题：' + (next === 'dark' ? '深色' : '浅色'));
});

function applyLayout(l) {
  $('#workspace').dataset.layout = l;
  pref.layout = l; Store.savePref(pref);
}
$('#btnLayout').addEventListener('click', () => {
  const order = ['three', 'split', 'focus'];
  const next = order[(order.indexOf(pref.layout) + 1) % 3];
  applyLayout(next);
  toast('布局：' + ({ three: '三栏', split: '编辑 + 预览', focus: '仅编辑' })[next]);
});

function toggleZen() {
  document.body.classList.toggle('zen');
  if (document.body.classList.contains('zen')) toast('专注模式（F11 或 Esc 退出）');
}

/* 移动端面板切换 */
function setMobilePanel(p) {
  $('#app').dataset.mobile = p;
  $$('.mt-item').forEach(b => b.classList.toggle('active', b.dataset.panel === p));
  if (p === 'config') openConfigDrawer(true);
  else { openConfigDrawer(false); if (p === 'preview') renderPreview(); }
}
$('#mobileTabs').addEventListener('click', e => {
  const b = e.target.closest('.mt-item');
  if (b) setMobilePanel(b.dataset.panel);
});
function openConfigDrawer(on) {
  $('#panelConfig').classList.toggle('open', on);
  $('#scrim').classList.toggle('on', on);
}
$('#btnMobileMenu').addEventListener('click', () => openConfigDrawer(!$('#panelConfig').classList.contains('open')));
$('#btnCloseConfig').addEventListener('click', () => { openConfigDrawer(false); if (window.innerWidth <= 760) setMobilePanel('editor'); });
$('#scrim').addEventListener('click', () => { openConfigDrawer(false); if (window.innerWidth <= 760 && $('#app').dataset.mobile === 'config') setMobilePanel('editor'); });

/* 全局快捷键 */
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'F1') { e.preventDefault(); openModal('#modalHelp'); }
  if (e.key === 'F11') { e.preventDefault(); toggleZen(); }
  if (e.key === 'Escape') {
    if (document.body.classList.contains('zen')) { document.body.classList.remove('zen'); return; }
    const m = $$('.modal').find(x => !x.hidden);
    if (m) m.hidden = true;
    else if (!$('#findBar').classList.contains('hidden')) toggleFind(false);
  }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); downloadMd(); toast('已导出 Markdown 文件', 'ok'); }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); renderDocs(); openModal('#modalDocs'); }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyText(buildFullDoc(), '已复制完整博文'); }
  if (mod && e.key === '\\') { e.preventDefault(); $('#btnLayout').click(); }
  if (mod && e.key.toLowerCase() === 'f' && document.activeElement !== ed) { e.preventDefault(); toggleFind(true); }
});
$('#btnHelp').addEventListener('click', () => openModal('#modalHelp'));

/* 离开提醒 */
window.addEventListener('beforeunload', () => { persistDoc(true); });

/* ==========================================================================
 * 13. 启动
 * ========================================================================== */
function boot() {
  applyTheme(pref.theme || 'auto');
  applyLayout(pref.layout || 'three');
  $('#syncScroll').checked = pref.sync !== false;
  $('#syncScroll').addEventListener('change', e => { pref.sync = e.target.checked; Store.savePref(pref); });

  const docs = Store.docs();
  const curId = Store.read(Store.K_CUR, null);
  const cur = docs.find(d => d.id === curId) || docs[0];
  if (cur) {
    state.docId = cur.id;
    state.meta = Object.assign(DEFAULT_META(), cur.meta || {});
    state.content = cur.content != null ? cur.content : '';
    $('#docName').textContent = cur.name || '未命名文章';
  } else {
    state.meta = DEFAULT_META();
    state.meta.title = '欢迎使用 Firefly Markdown';
    state.meta.description = '一款纯前端、零依赖、离线可用的 Astro-Firefly 博文生成器。';
    state.meta.tags = ['Astro', '博客', '工具'];
    state.meta.category = '工具分享';
    state.content = SAMPLE;
  }

  ed.value = state.content;
  fillForm();
  updateGutter();
  updateStats();
  renderPreview();
  setSaveState('已保存');

  setMobilePanel('editor');
  // 视口切换时保证面板状态正确
  let wasMobile = window.innerWidth <= 760;
  window.addEventListener('resize', debounce(() => {
    const isMobile = window.innerWidth <= 760;
    if (isMobile !== wasMobile) { wasMobile = isMobile; setMobilePanel('editor'); }
    if (!isMobile && window.innerWidth > 1080) openConfigDrawer(false);
  }, 200));

  // 首次访问自动展开基础信息
  if (!docs.length) $$('.acc')[0].classList.add('open');
}
boot();

/* ==========================================================================
 * 12. GitHub 后端（Device Flow OAuth + Contents API）
 *     设计：localStorage 仍是本地工作副本；GitHub 作为可选的同步/发布远端。
 *     登录用 GitHub Device Flow（纯前端、无需服务器密钥），文章读写走
 *     Contents API，保存即提交，可触发 Astro-Firefly 在 Vercel 自动重建。
 * ========================================================================== */
const GH = (function () {
  const K_TOKEN = 'fmd.gh.token.v1';
  const DEFAULT_CFG = { owner: '', repo: '', branch: 'main', path: 'src/content/posts' };

  function cfg() { const p = Store.pref(); return Object.assign({}, DEFAULT_CFG, p.gh || {}); }
  function saveCfg(partial) { const p = Store.pref(); p.gh = Object.assign({}, DEFAULT_CFG, p.gh || {}, partial); Store.savePref(p); }
  function getToken() { try { return localStorage.getItem(K_TOKEN) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem(K_TOKEN, t); else localStorage.removeItem(K_TOKEN); } catch (e) {} }

  // 服务器模式（后端代理 GitHub OAuth）：会话令牌存于本浏览器，GitHub 凭证只在后端
  const K_SERVER_TOKEN = 'fmd.server.token.v1';
  const K_SERVER_LOGIN = 'fmd.server.login.v1';
  const K_BACKEND = 'fmd.backend.url.v1';
  function serverToken() { try { return localStorage.getItem(K_SERVER_TOKEN) || ''; } catch (e) { return ''; } }
  function serverLogin() { try { return localStorage.getItem(K_SERVER_LOGIN) || ''; } catch (e) { return ''; } }
  function backendUrl() { try { return (localStorage.getItem(K_BACKEND) || '').replace(/\/+$/, ''); } catch (e) { return ''; } }
  function setServerSession(token, login) {
    try {
      if (token) { localStorage.setItem(K_SERVER_TOKEN, token); if (login) localStorage.setItem(K_SERVER_LOGIN, login); }
      else { localStorage.removeItem(K_SERVER_TOKEN); localStorage.removeItem(K_SERVER_LOGIN); }
    } catch (e) {}
  }

  function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }

  let user = null;
  let pollTimer = null;

  async function api(path, opts) {
    opts = opts || {};
    const srvTok = serverToken(), base = backendUrl();
    const headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (srvTok && base) {
      // 服务器模式：经后端 /api/github 代理（后端持 GitHub 凭证，前端只持会话令牌）
      headers['Authorization'] = 'Bearer ' + srvTok;
      if (opts.body) headers['Content-Type'] = 'application/json';
      const res = await fetch(base + '/api/github' + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      let data = {};
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        const msg = (data && (data.message || data.error_description)) || ('HTTP ' + res.status);
        throw new Error(msg);
      }
      return data;
    }
    // 默认：纯前端 PAT 直连 GitHub（无需后端）
    const tk = getToken();
    if (tk) headers['Authorization'] = 'Bearer ' + tk;
    if (opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.message || data.error_description)) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  async function fetchUser() {
    if (!getToken()) { user = null; return null; }
    try { user = await api('/user'); } catch (e) { user = null; setToken(''); }
    return user;
  }

  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // GitHub 登录：Personal Access Token 模式（纯前端，直接调 api.github.com，无需服务端/代理）
  async function login(pat) {
    if (!pat) { throw new Error('请输入 Personal Access Token'); }
    setToken(pat);
    try {
      const u = await api('/user');
      user = u;
      return u;
    } catch (e) {
      setToken('');
      throw e;
    }
  }
  function logout() { stopPoll(); setToken(''); user = null; }

  function repoPath(p) {
    return '/repos/' + encodeURIComponent(cfg().owner) + '/' + encodeURIComponent(cfg().repo) + '/contents/' + String(p).replace(/^\/+|\/+$/g, '');
  }

  async function listPosts() {
    const data = await api(repoPath(cfg().path) + '?ref=' + encodeURIComponent(cfg().branch));
    if (!Array.isArray(data)) return [];
    return data.filter(f => /\.(md|markdown|mdx)$/i.test(f.name)).map(f => ({ name: f.name, path: f.path, sha: f.sha, download: f.download_url }));
  }
  async function getPost(path) {
    const data = await api(repoPath(path) + '?ref=' + encodeURIComponent(cfg().branch));
    const content = (data.content && data.encoding === 'base64') ? b64d(data.content) : '';
    return { content, sha: data.sha };
  }
  async function putPost(path, text, sha) {
    const body = { message: (sha ? 'update: ' : 'add: ') + path, content: b64e(text), branch: cfg().branch };
    if (sha) body.sha = sha;
    return api(repoPath(path), { method: 'PUT', body });
  }
  async function deletePost(path, sha) {
    return api(repoPath(path), { method: 'DELETE', body: { message: 'delete: ' + path, sha, branch: cfg().branch } });
  }

  function fileSlug(meta) {
    // 与「导出文件名使用 slug」开关保持一致：关闭用标题 slug，开启用 meta.slug（兜底标题 slug）
    const titleSlug = slugify(meta.title) || 'untitled';
    const name = meta.slugAsName
      ? (meta.slug.trim() || titleSlug)
      : titleSlug;
    return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  }
  function postPath(meta) { return cfg().path.replace(/\/+$/, '') + '/' + fileSlug(meta) + '.md'; }

  function upsertLocal(meta, body) {
    const docs = Store.docs();
    const slug = (meta.slug || '').trim();
    let doc = slug ? docs.find(d => ((d.meta && d.meta.slug) || '').trim() === slug) : null;
    if (!doc) doc = docs.find(d => (d.name || '') === (meta.title || '').trim());
    if (!doc) {
      doc = { id: 'gh-' + (slug || slugify(meta.title) || ('d' + Date.now().toString(36))), name: meta.title || '未命名文章', updatedAt: Date.now(), meta, content: body };
      docs.unshift(doc);
    } else {
      doc.name = meta.title || doc.name; doc.meta = meta; doc.content = body; doc.updatedAt = Date.now();
    }
    Store.saveDocs(docs.slice(0, 60));
  }

  async function pullAll(onProgress) {
    const files = await listPosts();
    let imported = 0;
    for (const f of files) {
      const { content } = await getPost(f.path);
      const { meta, body } = parseMarkdown(content);
      upsertLocal(meta, body);
      imported++; onProgress && onProgress(imported, files.length);
    }
    return imported;
  }

  // 用指定 meta+content 生成完整 .md（用于发布全部，避免改动全局 state）
  function buildDocFor(meta, content) {
    const sm = state.meta, sc = state.content;
    state.meta = meta; state.content = content;
    const out = buildFullDoc();
    state.meta = sm; state.content = sc;
    return out;
  }

  async function publishCurrent() {
    const path = postPath(state.meta);
    let sha; try { const ex = await getPost(path); sha = ex.sha; } catch (e) { sha = undefined; }
    await putPost(path, buildFullDoc(), sha);
    return fileSlug(state.meta);
  }
  async function publishAll() {
    const docs = Store.docs();
    let ok = 0;
    for (const d of docs) {
      const m = d.meta || DEFAULT_META();
      const path = postPath(m);
      let sha; try { const ex = await getPost(path); sha = ex.sha; } catch (e) {}
      await putPost(path, buildDocFor(m, d.content || ''), sha); ok++;
    }
    return ok;
  }
  async function deleteRemoteCurrent() {
    const path = postPath(state.meta);
    let ex;
    try { ex = await getPost(path); }
    catch (e) {
      if (/not found/i.test(e.message)) return fileSlug(state.meta); // 远程本就不存在，视为已删除（幂等）
      throw e;
    }
    await deletePost(path, ex.sha);
    return fileSlug(state.meta);
  }

  return { cfg, saveCfg, getToken, setToken, fetchUser, login, logout, listPosts, pullAll, publishCurrent, publishAll, deleteRemoteCurrent, getUser: () => user,
    serverToken, serverLogin, backendUrl, setServerSession };
})();

/* ---------- GitHub 同步 UI ---------- */
function openGhSync() {
  const c = GH.cfg();
  $('#ghsOwner').value = c.owner; $('#ghsRepo').value = c.repo; $('#ghsBranch').value = c.branch;
  $('#ghsPath').value = c.path;
  $('#ghsPat').value = GH.getToken() || '';
  $('#ghsBackend').value = GH.backendUrl() || '';
  $('#ghsMsg').textContent = '';
  refreshGhUI();
  openModal('#modalGhSync');
}
function refreshGhUI() {
  const token = GH.getToken(), u = GH.getUser(), status = $('#ghsStatus');
  if (!status) return;
  const srvTok = GH.serverToken(), srvLogin = GH.serverLogin();
  if (srvTok && srvLogin) status.innerHTML = '<span class="gh-dot on"></span> 已通过服务器登录为 <b>' + escapeHtml(srvLogin) + '</b>';
  else if (token && u) status.innerHTML = '<span class="gh-dot on"></span> 已登录为 <b>' + escapeHtml(u.login) + '</b>';
  else if (token) status.innerHTML = '<span class="gh-dot on"></span> 已登录（PAT）';
  else status.innerHTML = '<span class="gh-dot"></span> 未登录';
  const online = !!(token || srvTok);
  $('#ghsLogin').disabled = !!token;
  $('#ghsLogout').disabled = !token;
  $('#ghsPull').disabled = !online;
  $('#ghsPush').disabled = !online;
  $('#ghsPushAll').disabled = !online;
  $('#ghsDel').disabled = !online;
  // 服务器模式 UI 同步
  const be = $('#ghsBackend'); if (be) be.value = GH.backendUrl() || '';
  const sstat = $('#ghsServerStatus'); if (sstat) sstat.textContent = (srvTok && srvLogin) ? ('当前：服务器会话（' + srvLogin + '）') : '';
  const slo = $('#ghsServerLogout'); if (slo) slo.hidden = !(srvTok && srvLogin);
}
$('#btnGh').addEventListener('click', openGhSync);
['ghsOwner', 'ghsRepo', 'ghsBranch', 'ghsPath'].forEach(id => {
  $('#' + id).addEventListener('change', e => {
    const map = { ghsOwner: 'owner', ghsRepo: 'repo', ghsBranch: 'branch', ghsPath: 'path' };
    const part = {}; part[map[id]] = e.target.value.trim(); GH.saveCfg(part);
  });
});
$('#ghsLogin').addEventListener('click', async () => {
  const pat = $('#ghsPat').value.trim();
  if (!pat) { toast('请输入 Personal Access Token', 'err'); $('#ghsMsg').textContent = '请先在上方填入 GitHub Personal Access Token'; return; }
  $('#ghsMsg').textContent = '正在验证 token…';
  try {
    const u = await GH.login(pat);
    $('#ghsMsg').textContent = '登录成功：' + u.login;
    refreshGhUI(); toast('GitHub 登录成功', 'ok');
  } catch (e) {
    $('#ghsMsg').textContent = '登录失败：' + e.message; toast('登录失败：' + e.message, 'err');
  }
});
$('#ghsLogout').addEventListener('click', () => { GH.logout(); refreshGhUI(); $('#ghsMsg').textContent = '已退出登录'; });
// 服务器模式：后端地址、OAuth 登录、登出
$('#ghsBackend').addEventListener('change', e => { try { localStorage.setItem('fmd.backend.url.v1', e.target.value.trim()); } catch (err) {} refreshGhUI(); });
$('#ghsServerLogin').addEventListener('click', () => {
  const base = $('#ghsBackend').value.trim().replace(/\/+$/, '');
  if (!base) { toast('请先填写后端地址', 'err'); $('#ghsMsg').textContent = '请先填写后端地址（如 https://fmd-api.your.workers.dev）'; return; }
  try { localStorage.setItem('fmd.backend.url.v1', base); } catch (e) {}
  const redirect = encodeURIComponent(location.origin + location.pathname);
  window.location.href = base + '/api/auth/login?redirect=' + redirect;
});
$('#ghsServerLogout').addEventListener('click', () => {
  GH.setServerSession('', '');
  refreshGhUI();
  $('#ghsMsg').textContent = '已退出服务器登录';
  toast('已退出服务器登录', 'ok');
});
$('#ghsPull').addEventListener('click', async () => {
  const btn = $('#ghsPull'); btn.disabled = true; $('#ghsMsg').textContent = '正在从 GitHub 拉取…';
  try {
    const n = await GH.pullAll((i, t) => { $('#ghsMsg').textContent = '拉取中 ' + i + '/' + t; });
    renderDocs();
    $('#ghsMsg').textContent = '已拉取 ' + n + ' 篇文章到本地文档库';
    toast('已拉取 ' + n + ' 篇', 'ok');
  } catch (e) { $('#ghsMsg').textContent = '拉取失败：' + e.message; toast('拉取失败：' + e.message, 'err'); }
  finally { refreshGhUI(); }
});
$('#ghsPush').addEventListener('click', async () => {
  if (!state.meta.title.trim() && !state.meta.slug.trim()) { toast('请先填写文章标题或 slug', 'err'); return; }
  const btn = $('#ghsPush'); btn.disabled = true; $('#ghsMsg').textContent = '发布中…';
  try {
    const slug = await GH.publishCurrent();
    $('#ghsMsg').textContent = '已发布：' + slug + '.md'; toast('已发布 ' + slug, 'ok');
  } catch (e) { $('#ghsMsg').textContent = '发布失败：' + e.message; toast('发布失败：' + e.message, 'err'); }
  finally { refreshGhUI(); }
});
$('#ghsPushAll').addEventListener('click', async () => {
  const btn = $('#ghsPushAll'); btn.disabled = true; $('#ghsMsg').textContent = '发布全部中…';
  try {
    const n = await GH.publishAll();
    $('#ghsMsg').textContent = '已发布全部 ' + n + ' 篇'; toast('已发布 ' + n + ' 篇', 'ok');
  } catch (e) { $('#ghsMsg').textContent = '发布失败：' + e.message; toast('发布失败：' + e.message, 'err'); }
  finally { refreshGhUI(); }
});
$('#ghsDel').addEventListener('click', () => {
  if (!state.meta.title.trim() && !state.meta.slug.trim()) { toast('请先填写文章标题或 slug', 'err'); return; }
  const name = (state.meta.slugAsName && state.meta.slug.trim()) ? state.meta.slug.trim() : (slugify(state.meta.title) || 'untitled');
  confirmBox('删除远程文章', `确定从 GitHub 删除「${name}.md」？此操作不可恢复。`, async () => {
    const btn = $('#ghsDel'); btn.disabled = true; $('#ghsMsg').textContent = '删除中…';
    try {
      const slug = await GH.deleteRemoteCurrent();
      $('#ghsMsg').textContent = '已从 GitHub 删除：' + slug + '.md';
      toast('已删除 ' + slug, 'ok');
    } catch (e) {
      $('#ghsMsg').textContent = '删除失败：' + e.message;
      toast('删除失败：' + e.message, 'err');
    } finally { refreshGhUI(); }
  });
});
// 启动时静默恢复登录态
if (GH.getToken()) { GH.fetchUser().then(refreshGhUI).catch(() => {}); }
// 启动时捕获 OAuth 回跳的 ?token=&login=，存入 localStorage 并清理地址栏
(function () {
  try {
    const params = new URLSearchParams(location.search);
    const t = params.get('token');
    if (t) {
      GH.setServerSession(t, params.get('login') || '');
      const url = new URL(location.href);
      url.searchParams.delete('token'); url.searchParams.delete('login');
      history.replaceState({}, '', url.pathname + url.search);
      refreshGhUI();
      toast('已通过服务器登录' + (params.get('login') ? ('：' + params.get('login')) : ''), 'ok');
    }
  } catch (e) {}
})();

/* 暴露给控制台调试 */
window.FireflyMD = { state, buildFrontMatter, buildFullDoc, render: MD, importText, renderPreview, GH };

})();
