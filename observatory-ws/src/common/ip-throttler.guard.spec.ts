import { ExecutionContext } from '@nestjs/common';
import { IpThrottlerGuard } from './ip-throttler.guard';

/** generateKey is protected; this exposes it for the assertions below without loosening the class. */
class Probe extends IpThrottlerGuard {
  key(context: ExecutionContext, suffix: string, name: string): string {
    return this.generateKey(context, suffix, name);
  }
}

/** Only getClass/getHandler are read by the stock implementation, so that is all the fake needs --
 *  and the point of these tests is that this guard reads neither. */
function fakeContext(className: string, handlerName: string): ExecutionContext {
  return {
    getClass: () => ({ name: className }),
    getHandler: () => ({ name: handlerName }),
  } as unknown as ExecutionContext;
}

describe('IpThrottlerGuard.generateKey', () => {
  const guard = Object.create(Probe.prototype) as Probe;

  const records = fakeContext('RecordsController', 'search');
  const stats = fakeContext('StatsController', 'get');

  it('gives one bucket per IP per throttler, regardless of which route was hit', () => {
    // The whole point: the published limit is "per client IP", so spending it on /api/records has
    // to spend it for /api/stats too. The stock guard keys on class+handler and would not.
    expect(guard.key(records, '1.2.3.4', 'default')).toBe(guard.key(stats, '1.2.3.4', 'default'));
  });

  it('keeps different clients apart', () => {
    expect(guard.key(records, '1.2.3.4', 'default')).not.toBe(
      guard.key(records, '5.6.7.8', 'default'),
    );
  });

  it('keeps the export bucket separate from the default one', () => {
    // So a whole-corpus walk cannot starve ordinary search traffic, and vice versa.
    expect(guard.key(records, '1.2.3.4', 'default')).not.toBe(
      guard.key(records, '1.2.3.4', 'export'),
    );
  });

  it('does not put the raw client IP in the key', () => {
    expect(guard.key(records, '1.2.3.4', 'default')).not.toContain('1.2.3.4');
  });
});
