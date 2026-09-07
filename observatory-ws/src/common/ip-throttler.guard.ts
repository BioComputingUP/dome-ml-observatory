import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

/**
 * Makes the published rate limit mean what it says.
 *
 * The stock ThrottlerGuard keys its counters on
 * `sha256(ClassName-handlerName-throttlerName-clientIp)`, so every route gets its OWN bucket. A
 * documented limit of "1200 requests per minute per client IP" would then really be 1200 per
 * minute *per endpoint*, and a client touching six endpoints could issue six times the advertised
 * rate without ever seeing a 429. That gap is invisible until someone measures it -- confirmed
 * directly: with the limit set to 5, /api/records returned 429 while /api/stats and /api/journals
 * still answered 200.
 *
 * Dropping the class and handler from the key gives one bucket per client IP per named throttler,
 * which is the contract swagger.ts, README.md and /download/api all state. The 'export' throttler
 * stays a separate bucket from 'default' because the name is still part of the key -- that
 * separation is deliberate, so a whole-corpus walk cannot starve ordinary search traffic.
 *
 * The IP is still hashed rather than stored raw, matching upstream: these keys live in the
 * in-memory store for the length of the window, and there is no reason for them to be readable.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected generateKey(_context: ExecutionContext, suffix: string, name: string): string {
    return createHash('sha256').update(`${name}-${suffix}`).digest('hex');
  }
}
