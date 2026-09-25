import { rankTextCandidates, TextCandidate } from './records.query';

const row = (
  id: string,
  title: string,
  score: number,
  citations: number | null = 0,
): TextCandidate => ({
  _id: id,
  score,
  publication_metadata: { title, citation_count: citations },
});

/**
 * The ranking, on the shapes that motivated it. The "dome" rows are the live top of the index on
 * 2026-09-25 in textScore order: a gold-nanoparticle dome first, DOME Copilot fourth.
 */
describe('rankTextCandidates', () => {
  const dome = [
    row('gold', 'The dome of gold nanolized for catalysis.', 7.1, 2),
    row('archytas', 'Design of robotic traverses on the Archytas Dome on the Moon', 6.7, 0),
    row(
      'shells',
      'Simulation Analysis and Optimization Design of Dome Structure in Filament Wound Composite Shells.',
      6.5,
      0,
    ),
    row(
      'copilot',
      'DOME Copilot: A resource to automate transparent reporting of artificial intelligence methods',
      6.5,
      0,
    ),
    row(
      'oct',
      'Quantification and Predictors of OCT-Based Macular Curvature and Dome-Shaped Configuration',
      6.3,
      18,
    ),
    // Two more acronym hits, and cited: "Dental, Oral, Medical Epidemiological (DOME)".
    row('osa', 'Obstructive Sleep Apnea and Periodontitis: Analytics of the DOME Records', 6.2, 14),
    row('bmi', 'Body Mass Index and Caries: Analytics of the DOME Records', 6.1, 12),
    row('abstract-only', 'Deep learning for retinal imaging', 5.9, 500),
  ];

  it('puts title hits before abstract-only ones, however cited', () => {
    expect(rankTextCandidates(dome, 'dome').at(-1)).toBe('abstract-only');
  });

  it('leads with the title that opens with the term, then the acronym hits, whatever case was typed', () => {
    for (const q of ['dome', 'DOME']) {
      const order = rankTextCandidates(dome, q);
      expect(order[0]).toBe('copilot');
      // "The dome of gold" opens with the term too (article skipped); the acronym hits follow.
      expect(order.slice(1, 4)).toEqual(['gold', 'osa', 'bmi']);
    }
  });

  it('skips a leading article when deciding what a title opens with', () => {
    const rows = [
      row('mid', 'Predicting random forest performance', 9, 0),
      row('article', 'A random forest classifier', 8, 0),
    ];
    expect(rankTextCandidates(rows, 'random forest')[0]).toBe('article');
  });

  it('lets citations lift a paper within its tier', () => {
    // 6.3 + log10(19) beats 6.7 + log10(1).
    const order = rankTextCandidates(dome, 'dome');
    expect(order.indexOf('oct')).toBeLessThan(order.indexOf('archytas'));
  });

  it('ranks a phrase in the title above the words apart, and both above the rest', () => {
    const rows = [
      row('abstract', 'Sepsis outcomes', 9, 0),
      row('apart', 'A random survival forest model', 8, 0),
      row('phrase', 'A random forest classifier', 7, 0),
    ];
    expect(rankTextCandidates(rows, 'random forest')).toEqual(['phrase', 'apart', 'abstract']);
  });

  it('counts a synonym spelling as a title hit', () => {
    const rows = [
      row('abstract', 'Sepsis prediction', 9, 0),
      row('spelled-out', 'Support vector machines for sepsis', 8, 0),
    ];
    expect(rankTextCandidates(rows, 'svm')[0]).toBe('spelled-out');
  });

  it('keeps the arrival order when nothing separates the rows -- what makes paging stable', () => {
    const rows = [row('a', 'Alpha', 5, 0), row('b', 'Beta', 5, 0), row('c', 'Gamma', 5, 0)];
    expect(rankTextCandidates(rows, 'transformer')).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a missing title, score or citation count', () => {
    const rows: TextCandidate[] = [
      { _id: 'x' },
      { _id: 'y', score: 0, publication_metadata: { title: null, citation_count: null } },
    ];
    expect(rankTextCandidates(rows, 'dome')).toEqual(['x', 'y']);
  });
});
