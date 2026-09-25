import { plainText, richAbstract, richTitle, truncatePlain } from './rich-text';

// Every "real corpus" string below is copied verbatim from a live record on the MongoDB server, not invented.
describe('rich-text', () => {
  describe('richTitle', () => {
    it('keeps the inline emphasis real titles actually carry', () => {
      expect(richTitle('Active learning with non-<i>ab initio</i> input features')).toBe(
        'Active learning with non-<i>ab initio</i> input features',
      );
      expect(richTitle('efficient CO<sub>2</sub> reduction catalysts')).toBe(
        'efficient CO<sub>2</sub> reduction catalysts',
      );
      expect(richTitle('<sup>18</sup>F-FDG PET/CT imaging')).toBe('<sup>18</sup>F-FDG PET/CT imaging');
    });

    it('maps JATS emphasis onto HTML that browsers actually render', () => {
      expect(richTitle('a <italic>Diaphorina citri</italic> model')).toBe(
        'a <em>Diaphorina citri</em> model',
      );
      expect(richTitle('a <bold>strong</bold> claim')).toBe('a <strong>strong</strong> claim');
    });

    it('drops every attribute, so nothing with a payload can reach the DOM', () => {
      expect(richTitle('<i onclick="alert(1)">x</i>')).toBe('<i>x</i>');
      expect(richTitle('<i class="x" style="color:red">x</i>')).toBe('<i>x</i>');
    });

    it('strips disallowed tags but keeps their text', () => {
      expect(richTitle('<script>evil()</script>Title')).toBe('evil()Title');
      expect(richTitle('<h4>Background</h4>Title')).toBe('BackgroundTitle');
      expect(richTitle('<a href="http://x.test">link</a>')).toBe('link');
    });

    it('leaves a plain title untouched', () => {
      expect(richTitle('Prediction of Breast Cancer Through Random Forest.')).toBe(
        'Prediction of Breast Cancer Through Random Forest.',
      );
    });

    it('renders the entity-encoded emphasis 14,450 PubMed titles are stored with', () => {
      expect(
        richTitle('The &lt;i&gt;Drosophila&lt;/i&gt; Connectome as a Computational Reservoir for Time-Series Prediction.'),
      ).toBe('The <i>Drosophila</i> Connectome as a Computational Reservoir for Time-Series Prediction.');
      expect(richTitle('Fast 3D UTE in vivo T&lt;sub&gt;1&lt;/sub&gt; mapping')).toBe(
        'Fast 3D UTE in vivo T<sub>1</sub> mapping',
      );
    });

    it('strips an encoded tag the title allowlist does not keep, as it would a raw one', () => {
      expect(
        richTitle(
          "&lt;p&gt;Converting 'cold' to 'hot' hepatocellular carcinoma for improved immunotherapy (Review)&lt;/p&gt;.",
        ),
      ).toBe("Converting 'cold' to 'hot' hepatocellular carcinoma for improved immunotherapy (Review).");
    });

    it('never touches an encoded angle bracket that is a comparison, not a tag', () => {
      expect(richTitle('survival at P&lt;0.05 and &lt;74 years')).toBe('survival at P&lt;0.05 and &lt;74 years');
      expect(richTitle('when x &lt; y and z &gt; 3')).toBe('when x &lt; y and z &gt; 3');
      expect(richTitle('survival at P<0.05 and <74 years')).toBe('survival at P<0.05 and <74 years');
    });

    it('does not revive an encoded tag it has no business emitting', () => {
      expect(richTitle('&lt;script&gt;evil()&lt;/script&gt;')).toBe('&lt;script&gt;evil()&lt;/script&gt;');
      expect(richTitle('&lt;i onclick="x"&gt;y&lt;/i&gt;')).toBe('&lt;i onclick="x"&gt;y</i>');
    });

    it('handles absent titles', () => {
      expect(richTitle(null)).toBe('');
      expect(richTitle(undefined)).toBe('');
      expect(richTitle('')).toBe('');
    });
  });

  describe('plainText', () => {
    it('strips tags and collapses the whitespace they leave behind', () => {
      expect(plainText('<h4>Background</h4>Rheumatoid arthritis is')).toBe(
        'Background Rheumatoid arthritis is',
      );
    });

    it('lets inline emphasis vanish without splitting the word it sits in', () => {
      expect(plainText('non-<i>ab initio</i> features')).toBe('non-ab initio features');
      expect(plainText('efficient CO<sub>2</sub> reduction catalysts')).toBe('efficient CO2 reduction catalysts');
      expect(plainText('<sup>18</sup>F-FDG PET/CT imaging')).toBe('18F-FDG PET/CT imaging');
    });

    it('strips entity-encoded tags too', () => {
      expect(plainText('The &lt;i&gt;Drosophila&lt;/i&gt; Connectome')).toBe('The Drosophila Connectome');
    });

    it('decodes the entities live titles carry, so a page title or citation never shows one', () => {
      expect(plainText('H&amp;E-based MSI/MMR testing with AI in colorectal cancer')).toBe(
        'H&E-based MSI/MMR testing with AI in colorectal cancer',
      );
      expect(plainText('Predicting Heat Meters&rsquo; Failures')).toBe('Predicting Heat Meters\u2019 Failures');
      expect(plainText('Spatiotemporal&nbsp;Prediction of COVID-19 Mortality&nbsp;')).toBe(
        'Spatiotemporal Prediction of COVID-19 Mortality',
      );
      expect(plainText('survival at P&lt;0.05 and &#8805;74 years')).toBe('survival at P<0.05 and \u226574 years');
    });

    it('leaves an entity it does not know as written', () => {
      expect(plainText('a &madeup; entity')).toBe('a &madeup; entity');
    });

    it('keeps the text between two comparison signs', () => {
      expect(plainText('moderate (0.5 < ICC ≤ 0.75) for first-order features, and ICC >0.9')).toBe(
        'moderate (0.5 < ICC ≤ 0.75) for first-order features, and ICC >0.9',
      );
    });

    it('handles absent input', () => {
      expect(plainText(null)).toBe('');
      expect(plainText(undefined)).toBe('');
    });
  });

  describe('truncatePlain', () => {
    it('returns short text unchanged, with no ellipsis', () => {
      expect(truncatePlain('short', 100)).toBe('short');
    });

    it('truncates on the plain form, so a cut can never land mid-tag', () => {
      const out = truncatePlain(`<h4>Background</h4>${'word '.repeat(80)}`, 40);
      expect(out).not.toContain('<');
      expect(out.endsWith('…')).toBe(true);
    });

    it('breaks on a word boundary when one is close to the limit', () => {
      expect(truncatePlain('alpha bravo charlie delta', 20)).toBe('alpha bravo charlie…');
    });

    it('hard-cuts when the nearest boundary would cost more than a fifth of the budget', () => {
      // slice(0, 14) is 'alpha beta gam'; the last space is at 10, so honouring it would throw
      // away 4 of the 14 characters asked for. Cutting mid-word keeps more of the text.
      expect(truncatePlain('alpha beta gamma delta', 14)).toBe('alpha beta gam…');
    });

    it('hard-cuts rather than losing a lot of text to a distant word boundary', () => {
      expect(truncatePlain(`${'a'.repeat(30)} tail`, 10)).toBe('aaaaaaaaaa…');
    });
  });

  describe('richAbstract', () => {
    it('keeps the structured-abstract headings Europe PMC supplies', () => {
      expect(richAbstract('<h4>Background</h4>Rheumatoid arthritis is an autoimmune disease')).toBe(
        '<h4>Background</h4>Rheumatoid arthritis is an autoimmune disease',
      );
    });

    it('remaps the in-body JATS <title>, whose text a browser would otherwise swallow whole', () => {
      expect(richAbstract('<title>Abstract</title><p>Body text</p>')).toBe(
        '<h4>Abstract</h4><p>Body text</p>',
      );
    });

    it('linkifies the bare repository URLs abstracts carry', () => {
      expect(richAbstract('Code at https://github.com/alienn233/ROSes-Finder')).toBe(
        'Code at <a href="https://github.com/alienn233/ROSes-Finder" target="_blank" ' +
          'rel="noopener nofollow">https://github.com/alienn233/ROSes-Finder</a>',
      );
    });

    it('leaves sentence-ending punctuation out of the href', () => {
      const out = richAbstract('available at https://github.com/pth1993/OSHeDA.');
      expect(out).toContain('href="https://github.com/pth1993/OSHeDA"');
      expect(out.endsWith('</a>.')).toBe(true);
    });

    it('cannot produce a nested or attacker-controlled anchor -- <a> never survives the allowlist', () => {
      const out = richAbstract('<a href="javascript:alert(1)">see http://x.test/y</a>');
      expect(out).not.toContain('javascript:');
      expect(out).toBe(
        'see <a href="http://x.test/y" target="_blank" rel="noopener nofollow">http://x.test/y</a>',
      );
    });

    it('keeps the text between two comparison signs instead of reading them as one tag', () => {
      const raw = 'without toxicity < grade 3 in most patients, and > grade 1 in <i>older</i> adults';
      expect(richAbstract(raw)).toBe(raw);
    });

    it('renders entity-encoded emphasis in an abstract as it does in a title', () => {
      expect(richAbstract('in &lt;i&gt;Drosophila&lt;/i&gt; larvae')).toBe('in <i>Drosophila</i> larvae');
    });

    it('handles absent abstracts', () => {
      expect(richAbstract(null)).toBe('');
      expect(richAbstract(undefined)).toBe('');
    });
  });
});
