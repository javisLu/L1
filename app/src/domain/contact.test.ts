import { describe, expect, it } from 'vitest';
import { countryOf, looksLikeContact, parseContact } from './contact';

describe('smart paste: parseContact', () => {
  it('email signature: name, title, company, address, phones, email, website', () => {
    const p = parseContact(`Best regards,
John Miller
Purchasing Manager
ABC Trading LLC
123 Main St, Los Angeles, CA 90001, USA
Tel: +1 213 555 0100
WhatsApp: +1 213 555 0199
Email: john@abctrading-demo.com
www.abctrading-demo.com`);
    expect(p.contact).toBe('John Miller');
    expect(p.title).toBe('Purchasing Manager');
    expect(p.name).toBe('ABC Trading LLC');
    expect(p.address).toBe('123 Main St, Los Angeles, CA 90001, USA');
    expect(p.phone).toBe('+1 213 555 0100 / +1 213 555 0199');
    expect(p.email).toBe('john@abctrading-demo.com');
    expect(p.country).toBe('美国');
  });

  it('labelled block with VAT and multi-line address', () => {
    const p = parseContact(`Company: Nordhavn Supply ApS
Address: Havnegade 12
1058 Copenhagen K
Denmark
Attn: Mette Hansen
Phone: +45 33 12 34 56
E-mail: mette@nordhavn-demo.dk
VAT: DK12345678`);
    expect(p.name).toBe('Nordhavn Supply ApS');
    expect(p.address).toBe('Havnegade 12, 1058 Copenhagen K, Denmark');
    expect(p.contact).toBe('Mette Hansen');
    expect(p.phone).toBe('+45 33 12 34 56');
    expect(p.email).toBe('mette@nordhavn-demo.dk');
    expect(p.tax).toBe('VAT DK12345678');
    expect(p.country).toBe('丹麦');
  });

  it('company without a legal suffix: first line before the address', () => {
    const p = parseContact(`Casa Bonita
Calle Mayor 5, 28013 Madrid, Spain
+34 91 123 4567
ventas@casabonita-demo.es`);
    expect(p.name).toBe('Casa Bonita');
    expect(p.address).toBe('Calle Mayor 5, 28013 Madrid, Spain');
    expect(p.phone).toBe('+34 91 123 4567');
    expect(p.country).toBe('西班牙');
  });

  it('"Name - Title" on one line, pipes, a country line is not a person', () => {
    const p = parseContact(`David Kim - Sourcing Director
Global Ventures Pte. Ltd. | 10 Anson Road #20-01 | Singapore 079903
M: +65 9123 4567 | david@gv-demo.sg
Singapore`);
    expect(p.contact).toBe('David Kim');
    expect(p.title).toBe('Sourcing Director');
    expect(p.name).toBe('Global Ventures Pte. Ltd.');
    expect(p.phone).toBe('+65 9123 4567');
    expect(p.email).toBe('david@gv-demo.sg');
    expect(p.address).toContain('10 Anson Road');
    expect(p.contact).not.toBe('Singapore');
  });

  it('a job title with a business word ("Import Manager") is not the company', () => {
    const p = parseContact(`Best regards,
Maria Lopez
Import Manager
Casa Verde Imports S.L.
Calle Mayor 5, 28013 Madrid, Spain
Tel: +34 91 123 4567
maria@casaverde-demo.es
VAT: ESB12345678`);
    expect(p.name).toBe('Casa Verde Imports S.L.');
    expect(p.title).toBe('Import Manager');
    expect(p.contact).toBe('Maria Lopez');
    expect(p.address).toBe('Calle Mayor 5, 28013 Madrid, Spain');
    expect(p.tax).toBe('VAT ESB12345678');
  });

  // 以下是用户实测的签名格式
  it('website line is skipped; "Title | Company" on one line', () => {
    const p = parseContact(`John Doe
Senior Project Manager | Acme Corporation
Phone: +1 (555) 019-2834
Email: john.doe@acme.com
Website: acme.com`);
    expect(p).toMatchObject({ contact: 'John Doe', title: 'Senior Project Manager', name: 'Acme Corporation', phone: '+1 (555) 019-2834', email: 'john.doe@acme.com', address: '' });
  });

  it('bullet "•" separators, M: / E: / W: labels, company without legal suffix', () => {
    const p = parseContact(`Jane Smith • Marketing Director • InnoTech Solutions
M: +1 (555) 014-9988 • E: jane.smith@innotech.com • W: innotech.com`);
    expect(p).toMatchObject({ contact: 'Jane Smith', title: 'Marketing Director', name: 'InnoTech Solutions', phone: '+1 (555) 014-9988', email: 'jane.smith@innotech.com', address: '' });
  });

  it('A: address label, social links skipped, US state gives the country', () => {
    const p = parseContact(`Alex Mercer
Head of Design | Creative Spark Agency
P: +1 (555) 012-3456
A: 123 Innovation Way, Suite 400, New York, NY
Connect: [LinkedIn] | [Twitter] | [Portfolio]`);
    expect(p).toMatchObject({ contact: 'Alex Mercer', title: 'Head of Design', name: 'Creative Spark Agency', phone: '+1 (555) 012-3456', address: '123 Innovation Way, Suite 400, New York, NY', country: '美国' });
  });

  it('post-nominal "Esq.", "Counsel" title, fax is not a phone', () => {
    const p = parseContact(`Sarah Jenkins, Esq.
Corporate Legal Counsel
Global Finance Group
Tel: +1 (555) 017-7766
Fax: +1 (555) 017-7767
Address: 456 Financial District, Floor 22, London, UK`);
    expect(p).toMatchObject({ contact: 'Sarah Jenkins', title: 'Corporate Legal Counsel', name: 'Global Finance Group', phone: '+1 (555) 017-7766', address: '456 Financial District, Floor 22, London, UK', country: '英国' });
  });

  it('unknown company word ("Laboratories"), bare phone and website, country from dial code', () => {
    const p = parseContact(`Robert Chen
Chief Technology Officer
Quantum AI Laboratories
+86 138-1234-5678
robert.chen@quantumailabs.io
www.quantumailabs.io`);
    expect(p).toMatchObject({ contact: 'Robert Chen', title: 'Chief Technology Officer', name: 'Quantum AI Laboratories', phone: '+86 138-1234-5678', email: 'robert.chen@quantumailabs.io', address: '', country: '中国' });
  });

  it('company name with no recognisable word still goes to company, not address', () => {
    const p = parseContact(`Tom Becker
Einkauf / Purchasing
Müller & Söhne
Hauptstraße 12, 80331 München, Germany
T +49 89 1234567`);
    expect(p.contact).toBe('Tom Becker');
    expect(p.name).toBe('Müller & Söhne');
    expect(p.address).toBe('Hauptstraße 12, 80331 München, Germany');
    expect(p.phone).toBe('+49 89 1234567');
    expect(p.country).toBe('德国');
  });

  it('"Name [Title, Company]", t: / e: / w: separated by | and /', () => {
    const p = parseContact(`Emily Watson [HR Director, Nexus Retail Corp]
t: (415) 555-0143 | e: emily.watson@nexusretail.com / w: nexusretail.com`);
    expect(p).toMatchObject({ contact: 'Emily Watson', title: 'HR Director', name: 'Nexus Retail Corp', phone: '(415) 555-0143', email: 'emily.watson@nexusretail.com', address: '' });
  });

  it('"Title — Company" with an em dash, Dir: / Cell: phones, fax and web skipped', () => {
    const p = parseContact(`David Miller
Sales VP — Horizon Logistics Inc.
Dir: +1-555-987-6543
Cell: +1-555-123-4567
Fax: +1-555-987-6544
Web: horizonlogistics.com`);
    expect(p).toMatchObject({ contact: 'David Miller', title: 'Sales VP', name: 'Horizon Logistics Inc.', phone: '+1-555-987-6543 / +1-555-123-4567', address: '' });
  });

  it('"Title at Company", address before the title, "Phone inquiries:" label, LinkedIn skipped', () => {
    const p = parseContact(`Sincerely,
Amanda Ross
Office 502, Building B, 789 Tech Boulevard
Austin, TX 78701, United States
Operations Specialist at GreenEnergy Solutions
LinkedIn: @amanda-ross-green
Phone inquiries: +1 (512) 555-0199`);
    expect(p).toMatchObject({ contact: 'Amanda Ross', title: 'Operations Specialist', name: 'GreenEnergy Solutions', phone: '+1 (512) 555-0199',
      address: 'Office 502, Building B, 789 Tech Boulevard, Austin, TX 78701, United States', country: '美国' });
  });

  it('decorations "~ Name ~", "[ Company ]" and emoji labels', () => {
    const p = parseContact(`~ Michael Scott ~
Regional Manager
[ Dunder Mifflin Paper Company ]
📱: 570-555-0123
✉️: mscott@dundermifflin.com`);
    expect(p).toMatchObject({ contact: 'Michael Scott', title: 'Regional Manager', name: 'Dunder Mifflin Paper Company', phone: '570-555-0123', email: 'mscott@dundermifflin.com', address: '' });
  });

  it('Middle East: "Mr." honorific, P.O. Box, two phones', () => {
    const p = parseContact(`Mr. Ahmed Hassan
General Manager
Al Noor Trading LLC
P.O. Box 12345, Dubai, UAE
Tel: +971 4 123 4567
Mob: +971 50 123 4567
ahmed@alnoor-demo.ae`);
    expect(p).toMatchObject({ contact: 'Ahmed Hassan', title: 'General Manager', name: 'Al Noor Trading LLC', address: 'P.O. Box 12345, Dubai, UAE', phone: '+971 4 123 4567 / +971 50 123 4567', country: '阿联酋' });
  });

  it('Spanish closing and title, CNPJ is a tax number not a phone', () => {
    const p = parseContact(`Saludos cordiales,
Carlos Gómez
Gerente de Compras
Distribuidora del Sur S.A.
Av. Libertador 1234, Buenos Aires, Argentina
Tel.: +54 11 4567 8900
Móvil: +54 9 11 2345 6789
CNPJ: 12.345.678/0001-90`);
    expect(p).toMatchObject({ contact: 'Carlos Gómez', title: 'Gerente de Compras', name: 'Distribuidora del Sur S.A.', phone: '+54 11 4567 8900 / +54 9 11 2345 6789', tax: 'CNPJ 12.345.678/0001-90', country: '阿根廷' });
  });

  it('a lone first name that matches the email is the contact', () => {
    const p = parseContact(`Kind regards\nAnna\nanna@shop-demo.de`);
    expect(p).toMatchObject({ contact: 'Anna', name: '', email: 'anna@shop-demo.de' });
  });

  it('Chinese natural text: closing, name (title), "任职于" prefix, disclaimer', () => {
    const p = parseContact(`祝您工作顺利！
李明（业务厂长）
任职于苏州盛达精工机械制造有限公司
随时联系：18699887766
邮件：liming@shengdajinggong.cn
本邮件包含机密信息，如误发请删除`);
    expect(p).toMatchObject({ contact: '李明', title: '业务厂长', name: '苏州盛达精工机械制造有限公司', phone: '18699887766', email: 'liming@shengdajinggong.cn', address: '' });
    expect(p.leftover).toEqual([]);
  });

  it('English first name + Chinese name; bracketed translations stay with their line', () => {
    const p = parseContact(`Kevin 刘伟
高级产品经理 (Senior Product Manager) | ByteDance Ltd. (字节跳动)
移动电话/Mob: +86 135-0000-1111
邮箱/Email: liuwei.kevin@bytedance.com
Web: bytedance.com`);
    expect(p).toMatchObject({ contact: 'Kevin 刘伟', title: '高级产品经理 (Senior Product Manager)', name: 'ByteDance Ltd. (字节跳动)', phone: '+86 135-0000-1111', email: 'liuwei.kevin@bytedance.com', country: '中国' });
    expect(p.leftover).toEqual([]);
  });

  it('mixed punctuation: company，address on one line, Ext appended to the phone', () => {
    const p = parseContact(`王小红 Hong Wang（海外市场部总监 / Overseas Marketing Director）
宏图国际贸易(上海)有限公司，上海市浦东新区陆家嘴环路100号
Tel: +86(21)61234567 | Ext: 808 | MP: 13122334455 | Email:
h.wang@hongtutrade.com`);
    expect(p).toMatchObject({ contact: '王小红 Hong Wang', title: '海外市场部总监 / Overseas Marketing Director', name: '宏图国际贸易(上海)有限公司',
      address: '上海市浦东新区陆家嘴环路100号', phone: '+86(21)61234567 ext. 808 / 13122334455', email: 'h.wang@hongtutrade.com', country: '中国' });
    expect(p.leftover).toEqual([]);
  });

  it('two positions at two companies: the second goes to the note, both phones kept', () => {
    const p = parseContact(`Dr. Elizabeth Montgomery
VP of Research, BioTech Industries Inc.
Managing Director, GeneCore Solutions Ltd. (Subsidiary)

US Office: +1 (212) 555-0155 | UK Lab: +44 20 7946 0199
Email: e.montgomery@biotech-industries.com
Corporate Portal: biotech.com`);
    expect(p).toMatchObject({ contact: 'Elizabeth Montgomery', title: 'VP of Research', name: 'BioTech Industries Inc.', phone: '+1 (212) 555-0155 / +44 20 7946 0199',
      email: 'e.montgomery@biotech-industries.com', note: '另任：Managing Director, GeneCore Solutions Ltd. (Subsidiary)' });
    expect(p.leftover).toEqual([]);
  });

  it('company name over two lines, Ph. / M. phones, email after "Contact:"', () => {
    const p = parseContact(`Sincerely yours,
Arthur Pendragon
Chief Executive Officer
The Pendragon & Merlin
Consulting Group, LLC
Ph. (415) 555-9000
M. (415) 555-9001
Contact: arthur@pm-consulting.co.uk`);
    expect(p).toMatchObject({ contact: 'Arthur Pendragon', title: 'Chief Executive Officer', name: 'The Pendragon & Merlin Consulting Group, LLC', phone: '(415) 555-9000 / (415) 555-9001', email: 'arthur@pm-consulting.co.uk' });
    expect(p.leftover).toEqual([]);
  });

  it('one long line joined by commas, words joined by dots and underscores', () => {
    const p = parseContact('regards,tony.stark,director_of_engineering,stark_industries,phone:+13105550144,mail:tony@starkindustries.com,web:starkindustries.com');
    expect(p).toMatchObject({ contact: 'Tony Stark', title: 'Director of Engineering', name: 'Stark Industries', phone: '+13105550144', email: 'tony@starkindustries.com' });
    expect(p.leftover).toEqual([]);
  });

  it('Chinese labels', () => {
    const p = parseContact(`公司：深圳市某某贸易有限公司
联系人：王先生
电话：0755-12345678
手机：+86 139 0000 1111
地址：深圳市南山区科技园 8 号
邮箱：wang@demo.cn`);
    expect(p).toMatchObject({ name: '深圳市某某贸易有限公司', contact: '王先生', phone: '0755-12345678 / +86 139 0000 1111', address: '深圳市南山区科技园 8 号', email: 'wang@demo.cn' });
  });

  it('looksLikeContact: a plain address is not a contact block', () => {
    expect(looksLikeContact('123 Main St\nLos Angeles, CA 90001\nUSA')).toBe(false);
    expect(looksLikeContact('ABC Trading LLC\n123 Main St\njohn@abc-demo.com')).toBe(true);
    expect(looksLikeContact('single line')).toBe(false);
  });

  it('countryOf only reads the last part of the address', () => {
    expect(countryOf('1 Turkey Hill Rd, Austin, TX, USA')).toBe('美国');
    expect(countryOf('Dubai Silicon Oasis, Dubai, UAE')).toBe('阿联酋');
    expect(countryOf('somewhere')).toBe('');
  });
});
