/**
 * 智能粘贴：把客户邮件签名、名片文字、地址块拆成公司、地址、联系人、电话、邮箱、税号。
 * 纯规则识别，离线可用；识别不准的地方用户在确认框里改。
 */
export interface ContactParse {
  name: string;
  address: string;
  contact: string;
  title: string;
  phone: string;
  email: string;
  tax: string;
  country: string;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const URL_RE = /^(https?:\/\/|www\.)\S+$|^[\w-]+(\.[\w-]+)*\.(com|net|org|io|co|biz|info|shop|store|[a-z]{2})(\/\S*)?$/i;
/** 网站、社交账号、链接占位：整行跳过 */
const SKIP = /^(w|web|website|site|url|homepage|网址|主页|connect|follow(\s+us)?|find us|linkedin|twitter|x|facebook|instagram|youtube|wechat|微信|skype|teams)\b\s*[:：]?|^\[[^\]]*\]$/i;
const BYE = /^(best|kind|warm)?\s*regards\b|^thanks?\b|^thank you|^sincerely|^br,?$|^cheers|^yours\b|^(saludos|atentamente|cordialmente|cordialement|bien à vous|mit freundlichen|viele grüße|beste grüße|cumprimentos|atenciosamente|distinti saluti|cordiali saluti|met vriendelijke)|^(此致|祝好|顺祝|谢谢)/i;
/** 公司法律形式（强信号）：LLC、Ltd、GmbH、S.L.、有限公司… */
const LEGAL = /\b(l\.?l\.?c|ltd|limited|inc|incorporated|corp|corporation|co\.?|company|gmbh|ag|s\.?a\.?(s|c|rl)?|s\.?r\.?l|s\.?l|b\.?v|n\.?v|a\.?b|a\/s|aps|oy|plc|llp|pty|pte|jsc|ooo|kft|sp\.?\s?z\s?o\.?o|ltda|eireli|s\.?p\.?a)\b\.?|有限公司|公司|株式会社/i;
/** 公司名里常见的行业词（弱信号，「Import Manager」这种职位里也会有） */
const BIZ = /\b(trading|imports?|exports?|industr(y|ies)|group|enterprises?|holdings?|international|global|supply|supplies|wholesale|distribution|distributors?|solutions?|technolog(y|ies)|tech|systems?|labs?|laborator(y|ies)|agency|studios?|consulting|consultants|partners|associates|logistics|manufactur\w*|electronics?|ventures|capital|networks?|services|products|sourcing|stores?|shop|mart|market|foods?|motors|textiles?|furniture|hardware|packaging|apparel|fashion|retail|brands?|media|design|energy|paper|plastics?|metals?|steel|chemicals?|medical|pharma\w*|auto(motive)?|machinery|equipment|tools)\b/i;
const COMPANY = new RegExp(`${LEGAL.source}|${BIZ.source}`, 'i');
const TITLE = /\b(manager|director|head\s+of|head|chief|officer|president|vice\s+president|vp|ceo|cfo|cto|coo|cmo|owner|founder|co-?founder|partner|counsel|attorney|lawyer|engineer|designer|consultant|specialist|analyst|accountant|representative|rep|agent|secretary|administrator|assistant|executive|supervisor|coordinator|merchandiser|buyer|purchas\w*|procurement|sourcing|sales|marketing|operations|planner|technician|developer|lead|clerk|import|export|gerente|director[a]?|diretor[a]?|jefe|jefa|compras|ventas|comprador[a]?|directeur|directrice|responsable|acheteur|acheteuse|leiter|leiterin|geschäftsführer\w*|einkauf|verkauf|einkäufer\w*|responsabile|titolare)\b|经理|总监|采购|主管|总经理|业务|销售|老板/i;
const TAX = /\b(vat|ein|tax|tin|eori|cnpj|cpf|ruc|nif|nit|rfc|inn|trn|gst|abn|uen|cuit|siret|kvk|cr\s?no|c\.?r\.?)\b|税号/i;
const PHONE_LABEL = /^(tel|tel\.|phone|telephone|office|direct|dir|work|main|mobile|mob|cell|cellphone|hp|whats\s?app|wa|t|m|p|ph|o|d|电话|手机|座机)\b\.?\s*[:：]?\s*/i;
const FAX = /^(fax|f|传真)\b\.?\s*[:：]?\s*/i;
const PHONE = /^[+(（]?\d[\d\s()（）+\-./]{6,}\d(\s*(ext\.?|x)\s*\d+)?$/i;
/** 学位、头衔后缀：「Sarah Jenkins, Esq.」「John Lee, MBA」 */
const POSTNOM = /,?\s+(esq|ph\.?\s?d|mba|cpa|cfa|pmp|md|m\.d|jr|sr|ii|iii|p\.?e)\.?$/i;
/** 像地址的一行：有门牌 / 邮编数字，或街道、楼层等词，或国家、美国州名缩写 */
const STREET = /\b(street|st|road|rd|avenue|ave|boulevard|blvd|way|lane|ln|drive|dr|suite|ste|floor|fl|building|bldg|tower|plaza|district|zone|park|block|unit|room|box|calle|avenida|rua|rue|strasse|straße|str|via|plot|estate|square|sq|highway|hwy)\b\.?|路|街|号|区|市|省/i;
const US_STATE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(\s+\d{5}(-\d{4})?)?$/;

const LABELS: [RegExp, keyof ContactParse][] = [
  [/^(company(\s+name)?|customer|buyer|consignee|公司(名称)?|客户)\s*[:：]\s*/i, 'name'],
  [/^(attn\.?|attention|contact(\s+person)?|name|联系人|收件人)\s*[:：]\s*/i, 'contact'],
  [/^(address|addr\.?|add\.?|a|地址)\s*[:：]\s*/i, 'address'],
  [/^(e-?mail|mail|e|邮箱|电邮)\s*[:：]\s*/i, 'email'],
  [/^(tax\s*(id|no\.?|number)?|税号)\s*[:：]\s*/i, 'tax'],
  [/^(country|国家)\s*[:：]\s*/i, 'country'],
];

/** 常见国家：英文 → 中文（客户库的「国家」用中文） */
const COUNTRIES: [RegExp, string][] = [
  [/\b(usa|u\.s\.a\.?|united states( of america)?|us)\b/i, '美国'], [/\bcanada\b/i, '加拿大'], [/\bmexico\b/i, '墨西哥'],
  [/\b(uk|u\.k\.|united kingdom|england|great britain)\b/i, '英国'], [/\bgermany|deutschland\b/i, '德国'], [/\bfrance\b/i, '法国'],
  [/\bitaly|italia\b/i, '意大利'], [/\bspain|españa\b/i, '西班牙'], [/\bportugal\b/i, '葡萄牙'], [/\bnetherlands|holland\b/i, '荷兰'],
  [/\bbelgium\b/i, '比利时'], [/\bdenmark\b/i, '丹麦'], [/\bsweden\b/i, '瑞典'], [/\bnorway\b/i, '挪威'], [/\bfinland\b/i, '芬兰'],
  [/\bpoland\b/i, '波兰'], [/\bswitzerland\b/i, '瑞士'], [/\baustria\b/i, '奥地利'], [/\bireland\b/i, '爱尔兰'], [/\bgreece\b/i, '希腊'],
  [/\bczech\b/i, '捷克'], [/\bhungary\b/i, '匈牙利'], [/\bromania\b/i, '罗马尼亚'], [/\brussia\b/i, '俄罗斯'], [/\bukraine\b/i, '乌克兰'],
  [/\bturkey|türkiye\b/i, '土耳其'], [/\b(uae|u\.a\.e\.?|united arab emirates|dubai)\b/i, '阿联酋'], [/\bsaudi arabia\b/i, '沙特阿拉伯'],
  [/\bqatar\b/i, '卡塔尔'], [/\bkuwait\b/i, '科威特'], [/\bisrael\b/i, '以色列'], [/\begypt\b/i, '埃及'], [/\bsouth africa\b/i, '南非'],
  [/\bnigeria\b/i, '尼日利亚'], [/\bkenya\b/i, '肯尼亚'], [/\bmorocco\b/i, '摩洛哥'], [/\bindia\b/i, '印度'], [/\bpakistan\b/i, '巴基斯坦'],
  [/\bbangladesh\b/i, '孟加拉国'], [/\bsingapore\b/i, '新加坡'], [/\bmalaysia\b/i, '马来西亚'], [/\bthailand\b/i, '泰国'],
  [/\bvietnam|viet nam\b/i, '越南'], [/\bindonesia\b/i, '印度尼西亚'], [/\bphilippines\b/i, '菲律宾'], [/\bjapan\b/i, '日本'],
  [/\b(south )?korea\b/i, '韩国'], [/\baustralia\b/i, '澳大利亚'], [/\bnew zealand\b/i, '新西兰'], [/\bbrazil|brasil\b/i, '巴西'],
  [/\bargentina\b/i, '阿根廷'], [/\bchile\b/i, '智利'], [/\bperu\b/i, '秘鲁'], [/\bcolombia\b/i, '哥伦比亚'], [/\becuador\b/i, '厄瓜多尔'],
  [/\bhong kong\b/i, '中国香港'], [/\btaiwan\b/i, '中国台湾'],
];

export function countryOf(text: string): string {
  // 只看地址最后一段，避免把街道名里的单词当成国家
  const last = text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).pop() ?? '';
  for (const [re, cn] of COUNTRIES) if (re.test(last)) return cn;
  // 「New York, NY」「Los Angeles, CA 90001」：美国州名缩写
  if (US_STATE.test(last)) return '美国';
  return '';
}

/** 地址里没写国家时，按电话国家码推断（+1 美国 / 加拿大共用，不猜） */
const DIAL: [string, string][] = [
  ['852', '中国香港'], ['853', '中国澳门'], ['886', '中国台湾'], ['971', '阿联酋'], ['966', '沙特阿拉伯'], ['974', '卡塔尔'], ['965', '科威特'],
  ['972', '以色列'], ['234', '尼日利亚'], ['254', '肯尼亚'], ['212', '摩洛哥'], ['880', '孟加拉国'], ['351', '葡萄牙'], ['353', '爱尔兰'],
  ['358', '芬兰'], ['420', '捷克'], ['380', '乌克兰'], ['86', '中国'], ['44', '英国'], ['49', '德国'], ['33', '法国'], ['39', '意大利'],
  ['34', '西班牙'], ['31', '荷兰'], ['32', '比利时'], ['45', '丹麦'], ['46', '瑞典'], ['47', '挪威'], ['48', '波兰'], ['41', '瑞士'],
  ['43', '奥地利'], ['30', '希腊'], ['36', '匈牙利'], ['40', '罗马尼亚'], ['90', '土耳其'], ['20', '埃及'], ['27', '南非'], ['91', '印度'],
  ['92', '巴基斯坦'], ['65', '新加坡'], ['60', '马来西亚'], ['66', '泰国'], ['84', '越南'], ['62', '印度尼西亚'], ['63', '菲律宾'],
  ['81', '日本'], ['82', '韩国'], ['61', '澳大利亚'], ['64', '新西兰'], ['55', '巴西'], ['52', '墨西哥'], ['54', '阿根廷'], ['56', '智利'],
  ['51', '秘鲁'], ['57', '哥伦比亚'], ['7', '俄罗斯'],
];
const countryByPhone = (phone: string) => {
  const m = /^\s*(?:\+|00)\s*(\d{1,3})/.exec(phone);
  if (!m) return '';
  return DIAL.find(([code]) => m[1].startsWith(code))?.[1] ?? '';
};

const HONORIFIC = /^(mr|mrs|ms|miss|dr|sr|sra|herr|frau|m|mme)\.?\s+/i;
const isPersonName = (s: string) => {
  const n = s.replace(HONORIFIC, '');
  return n.length <= 40 && !/\d/.test(n) && !COMPANY.test(n) && /^[A-Z][a-zà-ÿ'’-]+(\s+[A-Z][a-zà-ÿ'’.-]*){1,3}$/.test(n);
};

/** 行首图标换成文字标签：📍 地址、📱☎ 电话、✉ 邮箱、🌐 网站；其它装饰图标去掉 */
const ICONS: [RegExp, string][] = [
  [/^[📍🏢🏠🏬]/u, 'Address: '], [/^[📱📞☎📲]/u, 'Tel: '], [/^[✉📧📩📨]/u, 'Email: '], [/^[🌐🔗💻]/u, 'Web: '],
];
const tidy = (x: string) => {
  let t = x.trim();
  for (const [re, lab] of ICONS) if (re.test(t)) t = lab + t.replace(/^[\p{Extended_Pictographic}\p{So}️‍\s]+[:：]?\s*/u, '');
  t = t.replace(/^[\p{Extended_Pictographic}\p{So}️‍]+\s*[:：]?\s*/u, '');
  // 「~ Michael Scott ~」「[ Dunder Mifflin ]」「-- John --」：去掉两头的装饰符号和括号
  t = t.replace(/^[-–—~*=_>#\s]+|[-–—~*=_<#\s]+$/g, '');
  const wrap = /^[[(（【{]\s*([^\]）)】}]*?)\s*[\])）】}]$/.exec(t);
  if (wrap && !/^\+?[\d\s-]+$/.test(wrap[1])) t = wrap[1];
  return t.trim();
};

/** 拆行：换行、竖线、圆点、「 / 」、破折号都当分隔；「Name [Title, Company]」「Title at Company」拆开 */
function splitLines(text: string): string[] {
  const out: string[] = [];
  const segs = text.replace(/\r/g, '').split(/\n|\s+[|｜]\s+|\s*[•▪●]\s*|\s+·\s+|\s+[—–]\s+|\s+-\s+(?=[A-Za-z])|\t/)
    // 「e: … / w: …」才按斜杠拆；「Einkauf / Purchasing」这种双语职位不拆
    .flatMap((x) => (/[:：@]/.test(x) ? x.split(/\s+\/\s+/) : [x]));
  for (const seg of segs) {
    const t = tidy(seg);
    if (!t) continue;
    // 「Emily Watson [HR Director, Nexus Retail Corp]」「John Lee (Purchasing, ABC Ltd)」
    const br = /^(.+?)\s*[[(（]([^\])）\d]+)[\])）]$/.exec(t);
    if (br && /[A-Za-z一-龥]/.test(br[1])) {
      out.push(br[1].trim(), ...br[2].split(/\s*[,，;]\s*/).map((x) => x.trim()).filter(Boolean));
      continue;
    }
    // 「Operations Specialist at GreenEnergy Solutions」「Buyer @ ABC Ltd」
    const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(t);
    if (at && TITLE.test(at[1]) && !/\d/.test(at[1]) && !EMAIL.test(t)) {
      out.push(at[1], at[2]);
      continue;
    }
    out.push(t);
  }
  return out;
}

const addressy = (s: string) => (/\d/.test(s) && !PHONE.test(s)) || STREET.test(s) || !!countryOf(s);

export function parseContact(text: string): ContactParse & { leftover: string[] } {
  const r: ContactParse = { name: '', address: '', contact: '', title: '', phone: '', email: '', tax: '', country: '' };
  const phones: string[] = [];
  const labelled: string[] = [];
  const lines = splitLines(text);

  const rest: string[] = [];
  for (const raw of lines) {
    let line = raw;
    // 邮箱可能和别的内容在同一行（如「Email: a@b.com  Tel: …」）
    const em = line.match(EMAIL);
    if (em) {
      if (!r.email) r.email = em[0];
      line = line.replace(em[0], '').replace(/[,;/\s]+$/, '').trim();
      if (!line || /^[\p{L}-]{0,8}\s*[:：]?$/u.test(line)) continue;
    }
    if (SKIP.test(line) || URL_RE.test(line) || BYE.test(line)) continue;
    const lab = LABELS.find(([re]) => re.test(line));
    if (lab) {
      const v = line.replace(lab[0], '').trim();
      if (!v) continue;
      if (lab[1] === 'address') labelled.push(v);
      else if (lab[1] === 'contact') {
        const [n, t] = v.replace(POSTNOM, '').split(/\s+[-–]\s+|\s*[,，]\s*/);
        r.contact ||= n;
        if (t && !r.title) r.title = t;
      } else if (!r[lab[1]]) r[lab[1]] = v;
      continue;
    }
    if (TAX.test(line) && /\d/.test(line)) {
      r.tax ||= line.replace(/^(tax\s*(id|no\.?|number)?|税号)\s*[:：]\s*/i, '').replace(/\s*[:：]\s*/, ' ').trim();
      continue;
    }
    if (FAX.test(line) && /\d{5,}/.test(line.replace(/\D/g, ''))) continue; // 传真不算电话
    // 标签后面必须整段是号码：「Office 502, Building B」不是电话
    const pl = line.replace(PHONE_LABEL, '').trim();
    if (PHONE_LABEL.test(line) && PHONE.test(pl)) {
      phones.push(pl);
      continue;
    }
    if (PHONE.test(line)) {
      phones.push(line);
      continue;
    }
    // 「Phone inquiries: +1 …」「Dir: …」「Office line: …」：冒号前随便写什么，冒号后是电话号码
    const kv = /^([^:：]{1,24})[:：]\s*(.+)$/.exec(line);
    if (kv && PHONE.test(kv[2]) && !/[@]/.test(kv[2])) {
      if (!/fax|传真/i.test(kv[1])) phones.push(kv[2]);
      continue;
    }
    rest.push(line);
  }

  const addr: string[] = [];
  /** 没认出是什么、也不像地址的行（多半是没有后缀的公司名） */
  const unknown: string[] = [];
  /** 人名是从一行单独的文字猜的（没有标签、没有职位） */
  let guessed = false;
  let prevAddr = false;
  for (let i = 0; i < rest.length; i++) {
    const line = rest[i];
    const next = rest[i + 1] ?? '';
    const words = line.split(/\s+/).length;
    const isTitle = TITLE.test(line) && !/\d/.test(line) && words <= 6 && !LEGAL.test(line);
    const isAddr = addressy(line);
    let kind: 'name' | 'title' | 'contact' | 'addr' | 'unknown';

    // 「John Miller - Purchasing Manager」「John Miller, Purchasing Manager」「Sarah Jenkins, Esq.」
    const parts = line.replace(POSTNOM, '').split(/\s+[-–]\s+|\s*[,，]\s*/);
    const person = isPersonName(parts[0]) && !countryOf(parts[0]) && !US_STATE.test(parts[0]) &&
      (parts.length > 1 ? TITLE.test(parts.slice(1).join(' ')) : !addr.length || TITLE.test(next));

    if (!r.name && !/^\d/.test(line) && LEGAL.test(line)) kind = 'name';
    else if (!r.contact && person && parts.length > 1) kind = 'contact';
    else if (isTitle && !BIZ.test(line.replace(TITLE, ''))) kind = 'title';
    else if (!r.contact && person) kind = 'contact';
    else if (!r.name && BIZ.test(line) && !isAddr && !isTitle) kind = 'name';
    else if (isTitle) kind = 'title';
    else if (isAddr || (prevAddr && !/[@]/.test(line))) kind = 'addr';
    else kind = 'unknown';

    if (kind === 'name') r.name = line;
    else if (kind === 'title') r.title ||= line;
    else if (kind === 'contact') {
      r.contact = parts[0].replace(HONORIFIC, '');
      if (parts.length > 1) r.title ||= parts.slice(1).join(', ');
      guessed = parts.length === 1 && !TITLE.test(next);
    } else if (kind === 'addr') addr.push(line);
    else unknown.push(line);
    prevAddr = kind === 'addr';
  }
  // 只有名字的一行（「Anna」）：和邮箱用户名对得上就是联系人
  const local = r.email.split('@')[0].toLowerCase().split(/[._-]/);
  const byMail = unknown.findIndex((x) => !r.contact && /^\p{Lu}[\p{L}'’-]+$/u.test(x) && local.includes(x.toLowerCase()));
  if (byMail >= 0) r.contact = unknown.splice(byMail, 1)[0];
  // 没认出公司：先用没归类的那行；否则猜成人名的那行（没有职位）其实多半是公司名
  if (!r.name && unknown.length) r.name = unknown.shift()!;
  else if (!r.name && guessed && !r.title) {
    r.name = r.contact;
    r.contact = '';
  }
  r.address = [...labelled, ...addr].join(', ').replace(/\s*,\s*,/g, ',');
  r.phone = [...new Set(phones)].join(' / ');
  r.country ||= countryOf(r.address) || countryByPhone(phones[0] ?? '');
  if (r.country) r.country = countryOf(r.country) || r.country;
  // 没归类的行原样给用户看，不悄悄丢掉
  return { ...r, leftover: unknown };
}

/** 粘贴的内容像不像一整块联系信息（而不只是一个地址）：用来决定是否自动弹出智能粘贴 */
export function looksLikeContact(text: string): boolean {
  if (text.trim().split(/\n/).length < 2) return false;
  const p = parseContact(text);
  return [p.email, p.phone, p.name && COMPANY.test(p.name) ? p.name : '', p.tax, p.contact].filter(Boolean).length >= 2;
}
