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
