import { ConfigService } from '@nestjs/config';
import { TermFrequencyService } from './term-frequency.service';
import { AppConfig } from '../config/configuration';

function fakeModel(exec: jest.Mock<Promise<number>, []>) {
  return {
    countDocuments: jest.fn(() => ({ maxTimeMS: jest.fn().mockReturnValue({ exec }) })),
  };
}

const fakeConfig = {
  get: jest.fn().mockReturnValue(20_000),
} as unknown as ConfigService<AppConfig, true>;

describe('TermFrequencyService', () => {
  it('counts each distinct word once, on the index, scoped to the positives', async () => {
    const exec = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(66)
      .mockResolvedValueOnce(44_261);
    const model = fakeModel(exec);
    const service = new TermFrequencyService(model as never, fakeConfig);

    const df = await service.lookup(['dome', 'cell', 'dome']);

    expect(df.get('dome')).toBe(66);
    expect(df.get('cell')).toBe(44_261);
    expect(model.countDocuments).toHaveBeenCalledTimes(2);
    // The partial index demands the positives predicate on every $text query, this one included.
    expect(model.countDocuments).toHaveBeenCalledWith({
      'llm_classification.classification': 'positive',
      $text: { $search: 'dome' },
    });
  });

  it('serves a repeated word from cache', async () => {
    const exec = jest.fn<Promise<number>, []>().mockResolvedValue(66);
    const model = fakeModel(exec);
    const service = new TermFrequencyService(model as never, fakeConfig);

    await service.lookup(['dome']);
    await service.lookup(['dome']);

    expect(model.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('records a failed lookup as infinitely common, once, and never throws', async () => {
    const exec = jest.fn<Promise<number>, []>().mockRejectedValue(new Error('IndexNotFound'));
    const model = fakeModel(exec);
    const service = new TermFrequencyService(model as never, fakeConfig);

    const first = await service.lookup(['dome']);
    await service.lookup(['dome']);

    expect(first.get('dome')).toBe(Number.POSITIVE_INFINITY);
    expect(model.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('applies the free-text budget', async () => {
    const exec = jest.fn<Promise<number>, []>().mockResolvedValue(1);
    const model = fakeModel(exec);
    const service = new TermFrequencyService(model as never, fakeConfig);

    await service.lookup(['dome']);

    const query = model.countDocuments.mock.results[0].value as { maxTimeMS: jest.Mock };
    expect(query.maxTimeMS).toHaveBeenCalledWith(20_000);
  });
});
