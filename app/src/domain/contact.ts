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
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
/** 公司法律形式（强信号）：LLC、Ltd、GmbH、S.L.、有限公司… */
const LEGAL = /\b(l\.?l\.?c|ltd|limited|inc|incorporated|corp|corporation|co\.?|company|gmbh|ag|s\.?a\.?(s|c|rl)?|s\.?r\.?l|s\.?l|b\.?v|n\.?v|a\.?b|a\/s|aps|oy|plc|llp|pty|pte|jsc|ooo|kft|sp\.?\s?z\s?o\.?o|ltda|eireli|s\.?p\.?a)\b\.?|有限公司|公司|株式会社/i;
/** 公司名里常见的行业词（弱信号，「Import Manager」这种职位里也会有） */
const BIZ = /\b(trading|imports?|exports?|industr(y|ies)|group|enterprises?|holdings?|international|supply|supplies|wholesale|distribution|distributors?)\b/i;
const COMPANY = new RegExp(`${LEGAL.source}|${BIZ.source}`, 'i');
const TITLE = /\b(manager|director|purchas\w*|procurement|buyer|sourcing|ceo|cfo|coo|owner|founder|president|sales|assistant|executive|head of|officer|supervisor|coordinator|merchandiser|logistics|import|export)\b|经理|总监|采购|主管/i;
const TAX = /\b(vat|ein|tax|tin|eori|cnpj|cpf|ruc|nif|nit|rfc|inn|trn|gst|abn|uen|cuit|siret|kvk|cr\s?no|c\.?r\.?)\b|税号/i;
const PHONE_LABEL = /^(tel|tel\.|phone|mobile|mob|cell|cellphone|whats\s?app|wa|fax|t|m|p|ph|电话|手机|座机|传真)\b\.?\s*[:：]?\s*/i;
const PHONE = /^[+(（]?\d[\d\s()（）+\-./]{6,}\d(\s*(ext\.?|x)\s*\d+)?$/i;

const LABELS: [RegExp, keyof ContactParse][] = [
  [/^(company(\s+name)?|customer|buyer|consignee|公司(名称)?|客户)\s*[:：]\s*/i, 'name'],
  [/^(attn\.?|attention|contact(\s+person)?|name|联系人|收件人)\s*[:：]\s*/i, 'contact'],
  [/^(address|addr\.?|add\.?|地址)\s*[:：]\s*/i, 'address'],
  [/^(e-?mail|mail|邮箱|电邮)\s*[:：]\s*/i, 'email'],
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
  return '';
}

const isPersonName = (s: string) =>
  s.length <= 40 && !/\d/.test(s) && !COMPANY.test(s) && /^(mr\.?|mrs\.?|ms\.?|dr\.?\s)?[A-Z][a-zà-ÿ'’-]+(\s+[A-Z][a-zà-ÿ'’.-]*){1,3}$/.test(s);

const cleanPhone = (s: string) => s.replace(PHONE_LABEL, '').trim();

export function parseContact(text: string): ContactParse {
  const r: ContactParse = { name: '', address: '', contact: '', title: '', phone: '', email: '', tax: '', country: '' };
  const phones: string[] = [];
  const addr: string[] = [];
  const lines = text
    .replace(/\r/g, '')
    .split(/\n|\s[|｜]\s|\t/)
    .map((x) => x.replace(/^[-–•·*>\s]+/, '').trim())
    .filter(Boolean);

  const rest: string[] = [];
  /** 人名是从一行单独的文字猜的（没有标签、没有职位） */
  let guessed = false;
  for (const raw of lines) {
    let line = raw;
    // 邮箱可能和别的内容在同一行（如「Email: a@b.com  Tel: …」）
    const em = line.match(EMAIL);
    if (em) {
      if (!r.email) r.email = em[0];
      line = line.replace(em[0], '').replace(/(e-?mail|mail|邮箱)\s*[:：]?\s*/i, '').replace(/[,;/\s]+$/, '').trim();
      if (!line) continue;
    }
    const lab = LABELS.find(([re]) => re.test(line));
    if (lab) {
      const v = line.replace(lab[0], '').trim();
      if (lab[1] === 'address') addr.push(v);
      else if (lab[1] === 'contact') {
        const [n, t] = v.split(/\s+[-–,]\s+|\s*[,，]\s*/);
        r.contact ||= n;
        if (t && !r.title) r.title = t;
      } else if (!r[lab[1]]) r[lab[1]] = v;
      continue;
    }
    if (URL_RE.test(line)) continue;
    if (PHONE_LABEL.test(line) && /\d{5,}/.test(line.replace(/\D/g, ''))) {
      const p = cleanPhone(line);
      if (p) phones.push(p);
      continue;
    }
    if (PHONE.test(line)) {
      phones.push(line);
      continue;
    }
    if (TAX.test(line) && /\d/.test(line)) {
      r.tax ||= line.replace(/^(tax\s*(id|no\.?|number)?|税号)\s*[:：]\s*/i, '').replace(/\s*[:：]\s*/, ' ').trim();
      continue;
    }
    rest.push(line);
  }

  for (let i = 0; i < rest.length; i++) {
    const line = rest[i];
    const shortTitle = TITLE.test(line) && !/\d/.test(line) && line.split(/\s+/).length <= 5;
    if (!r.name && !/^\d/.test(line) && (LEGAL.test(line) || (BIZ.test(line) && !shortTitle))) {
      r.name = line;
      continue;
    }
    // 「John Miller - Purchasing Manager」「John Miller, Purchasing Manager」
    const parts = line.split(/\s+[-–|]\s+|\s*[,，]\s*/);
    // 单独一行的人名：要么在地址之前（签名开头），要么下一行是职位；国家名不算
    const nameOk = isPersonName(parts[0]) && !countryOf(parts[0]) && (parts.length > 1 ? TITLE.test(parts.slice(1).join(' ')) : !addr.length || TITLE.test(rest[i + 1] ?? ''));
    if (!r.contact && nameOk) {
      r.contact = parts[0].replace(/^(mr|mrs|ms|dr)\.?\s+/i, '');
      if (parts.length > 1) r.title ||= parts.slice(1).join(', ');
      guessed = parts.length === 1 && !TITLE.test(rest[i + 1] ?? '');
      continue;
    }
    if (shortTitle) {
      r.title ||= line;
      continue;
    }
    if (/^(best|kind)?\s*regards|^thanks|^sincerely|^br,?$|^cheers/i.test(line)) continue;
    addr.push(line);
  }
  // 没有公司后缀时：猜成人名的那行（没有职位）其实多半是公司名；否则地址前面第一行当公司名
  if (!r.name && guessed && !r.title) {
    r.name = r.contact;
    r.contact = '';
  } else if (!r.name && addr.length > 1 && !/\d/.test(addr[0])) r.name = addr.shift()!;
  r.address = addr.join(', ').replace(/\s*,\s*,/g, ',');
  r.phone = [...new Set(phones)].join(' / ');
  r.country ||= countryOf(r.address);
  if (r.country) r.country = countryOf(r.country) || r.country;
  return r;
}

/** 粘贴的内容像不像一整块联系信息（而不只是一个地址）：用来决定是否自动弹出智能粘贴 */
export function looksLikeContact(text: string): boolean {
  if (text.trim().split(/\n/).length < 2) return false;
  const p = parseContact(text);
  return [p.email, p.phone, p.name && COMPANY.test(p.name) ? p.name : '', p.tax, p.contact].filter(Boolean).length >= 2;
}
