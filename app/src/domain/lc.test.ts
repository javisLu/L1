import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { allowed, amendmentText, docsRequired, expiryPlace, parseAmount, parseMT700, presentDays, reviewLc, sameParty, sampleMT700, softClauses, swiftDate, tolerance } from './lc';

const lcOrder = () => seed().orders[1]; // 2026-002，信用证付款，10-08 开船

describe('解析电文', () => {
  it('原始电文：:代号: 值，多行值接在一起', () => {
    const f = parseMT700(':20: LC2026118\n:31D: 261130CHINA\n:46A: +SIGNED INVOICE\n+PACKING LIST\n:48: 21/DAYS');
    expect(f['20']).toBe('LC2026118');
    expect(f['31D']).toBe('261130CHINA');
    expect(f['46A']).toBe('+SIGNED INVOICE\n+PACKING LIST');
    expect(presentDays(f['48'])).toBe(21);
  });

  it('银行打印件：代号后面跟英文栏目名，值在下一行', () => {
    const f = parseMT700('31D: Date and Place of Expiry\n   261130 IN CHINA\n32B: Currency Code, Amount\n   USD12345,60\n44C: Latest Date of Shipment: 261115');
    expect(swiftDate(f['31D'])).toBe('2026-11-30');
    expect(parseAmount(f['32B'])).toEqual({ cur: 'USD', amount: 12345.6 });
    expect(swiftDate(f['44C'])).toBe('2026-11-15');
  });

  it('粘贴时换行丢了、整段连成一行也能拆开（46A 里用 + 连着的单据也拆开）', () => {
    const one = '27: 1/1 40A: IRREVOCABLE 20: LC20231001 31D: DATE 231031 PLACE IN CHINA 50: ABC IMPORT COMPANY, NEW YORK, USA 59: XYZ EXPORT COMPANY, SHANGHAI, CHINA 32B: USD50,000.00 41A: AVAILABLE WITH BANK OF CHINA BY SIGHT PAYMENT 43P: ALLOWED 43T: NOT ALLOWED 44A: SHANGHAI PORT, CHINA 44B: NEW YORK PORT, USA 44C: 231020 45A: 1000 SETS OF ELECTRIC MOTORS, MODEL EM-200, AS PER CONTRACT NO. EM2023 46A: + COMMERCIAL INVOICE IN TRIPLICATE + FULL SET OF CLEAN ON BOARD BILL OF LADING + PACKING LIST 47A: + SHIPPING ADVICE MUST BE SENT TO APPLICANT WITHIN 48 HOURS AFTER SHIPMENT. 71B: ALL BANK CHARGES OUTSIDE USA ARE FOR BENEFICIARY ACCOUNT.';
    const f = parseMT700(one);
    expect(Object.keys(f).sort()).toEqual(['20', '27', '31D', '32B', '40A', '41A', '43P', '43T', '44A', '44B', '44C', '45A', '46A', '47A', '50', '59', '71B']);
    expect(f['20']).toBe('LC20231001');
    expect(swiftDate(f['31D'])).toBe('2023-10-31');
    expect(expiryPlace(f['31D'])).toBe('CHINA');
    expect(parseAmount(f['32B'])).toEqual({ cur: 'USD', amount: 50000 });
    expect(f['47A']).toContain('WITHIN 48 HOURS');
    expect(docsRequired(f).map((d) => [d.name, d.copies])).toEqual([['商业发票', '3 份'], ['海运提单', '全套'], ['装箱单', '']]);
    // 原始电文连成一行（:31D:261130CHINA）也行
    expect(parseMT700(':20:LC1 :31D:261130CHINA :44C:261115')).toEqual({ '20': 'LC1', '31D': '261130CHINA', '44C': '261115' });
    // 正文里的「48 HOURS」「10:30」不会被当成栏目
    expect(Object.keys(parseMT700(':47A: SEND ADVICE WITHIN 48 HOURS, CUT-OFF 10:30 AM'))).toEqual(['47A']);
  });

  it('金额、溢短装、分批转运的各种写法', () => {
    expect(parseAmount('USD 12,345.60')).toEqual({ cur: 'USD', amount: 12345.6 });
    expect(parseAmount('EUR12,345')).toEqual({ cur: 'EUR', amount: 12345 });
    expect(parseAmount('USD9090,')).toEqual({ cur: 'USD', amount: 9090 });
    expect(tolerance('10/10')).toEqual({ plus: 10, minus: 10 });
    expect(allowed('PROHIBITED')).toBe('Not Allowed');
    expect(allowed('ALLOWED')).toBe('Allowed');
    expect(allowed('CONDITIONAL')).toBe('');
    expect(sameParty('QINGDAO HENGYUAN INDUSTRIAL CO., LTD.\nNO. 18 HAIER ROAD', 'Qingdao Hengyuan Industrial Co., Ltd.')).toBe(true);
    expect(sameParty('QINGDAO HENGDA TRADING CO LTD', 'Qingdao Hengyuan Industrial Co., Ltd.')).toBe(false);
  });
});

describe('审证', () => {
  it('示例电文：装运期早于开船、转运不允许、提单 TO ORDER / 运费到付、软条款都能查出来', () => {
    const o = lcOrder();
    const f = parseMT700(sampleMT700(o, '2026-10-21'));
    const r = reviewLc(o, f, '2026-10-21');
    expect(r.find((x) => x.area === '受益人')?.level).toBe('ok');
    expect(r.find((x) => x.area === '金额')?.level).toBe('ok');
    expect(r.find((x) => x.area === '装运期')?.level).toBe('error');
    expect(r.find((x) => x.area === '转运')?.fix).toBeTruthy();
    expect(r.some((x) => x.area === '提单收货人')).toBe(true);
    expect(r.some((x) => x.area === '运费')).toBe(false);
    expect(r.some((x) => x.area === '有效期' && x.level === 'error')).toBe(false);
    const soft = softClauses(f);
    expect(soft.map((s) => s.name)).toContain('证书要申请人（买方）签发或会签');
    const docs = docsRequired(f);
    expect(docs.map((d) => d.name)).toEqual(['商业发票', '装箱单', '海运提单', ...(['CIF', 'CIP'].includes(o.terms.incoterm) ? ['保险单'] : []), '原产地证', '检验证书']);
    expect(docs[0]).toMatchObject({ can: true, copies: '3 份' });
    expect(docs[2].copies).toBe('全套');
    const letter = amendmentText(o, f, r, soft);
    expect(letter).toContain('please kindly amend the credit as follows');
    expect(letter).toContain('latest date of shipment');
    expect(letter).toContain('inspection certificate');
  });

  it('受益人不对、金额不够、币种不对、有效期在国外', () => {
    const o = lcOrder();
    const f = parseMT700(':59: SOMEONE ELSE TRADING CO\n:32B: USD100,00\n:31D: 261130LOS ANGELES');
    const r = reviewLc(o, f, '2026-09-20');
    expect(r.find((x) => x.area === '受益人')?.level).toBe('error');
    expect(r.find((x) => x.area === '金额')?.level).toBe('error');
    expect(r.find((x) => x.area === '到期地点')?.level).toBe('warn');
    expect(reviewLc(o, parseMT700(':32B: EUR9999,00'), '2026-09-20').find((x) => x.area === '金额')?.text).toContain('币种是 EUR');
  });

  it('一键按信用证改订单', () => {
    const o = lcOrder();
    const r = reviewLc(o, parseMT700(':43T: ALLOWED\n:43P: ALLOWED'), '2026-09-20');
    o.terms.transship = 'Not Allowed';
    o.terms.partial = 'Not Allowed';
    for (const x of reviewLc(o, parseMT700(':43T: ALLOWED\n:43P: ALLOWED'), '2026-09-20')) x.fix?.apply(o);
    expect(o.terms.transship).toBe('Allowed');
    expect(o.terms.partial).toBe('Allowed');
    expect(r).toBeTruthy();
  });
});
