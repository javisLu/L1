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
