import { ArgumentsHost, Catch, ExceptionFilter, ServiceUnavailableException } from '@nestjs/common';
import { Response } from 'express';
import { MongooseError, mongo } from 'mongoose';

/**
 * Maps a Mongo-outage-or-overload error to a clean 503 instead of a generic, unhelpful 500 --
 * confirmed by two different real failure modes hitting this, not just one:
 *
 * - `MongooseError` (client-side): a buffered command timing out while disconnected -- the
 *   VPN-drop test in ROADMAP.md Phase 5.
 * - `mongo.MongoError` / its `MongoServerError` subclass (server-side, from the native MongoDB
 *   driver, NOT a MongooseError -- a completely separate class hierarchy from a different
 *   package): a query that genuinely exceeded `maxTimeMS` on the server, e.g. a free-text regex
 *   search on the database server's un-indexed collection whose bounded-count fallback (see count.service.ts)
 *   still has to scan nearly the whole collection when the match rate is low, so it can time out
 *   too. Confirmed live against the database server with `?q=transformer`: `MongoServerError: ... operation
 *   exceeded time limit, code: 50, codeName: 'MaxTimeMSExpired'` -- catching only MongooseError
 *   let this one straight through as a bare 500 with no useful message.
 *
 * Every other exception passes through unchanged; Nest's default filter still handles those.
 */
@Catch(MongooseError, mongo.MongoError)
export class MongoUnavailableFilter implements ExceptionFilter {
  catch(
    exception: MongooseError | InstanceType<typeof mongo.MongoError>,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = new ServiceUnavailableException(
      'Database temporarily unavailable -- please retry shortly.',
    ).getResponse();
    response.status(503).json(body);
  }
}
