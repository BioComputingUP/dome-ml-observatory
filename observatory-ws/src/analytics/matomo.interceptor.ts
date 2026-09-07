import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import MatomoTracker from 'matomo-tracker';
import { AppConfig } from '../config/configuration';

/**
 * Reports API requests to the lab's self-hosted Matomo, mirroring what the sibling MobiDB service
 * does in its own `onResponse` hook -- same tracker library, same instance, so API usage across
 * the lab's services is measured the same way.
 *
 * This exists because the API is now worth measuring: /api/export makes the whole corpus
 * retrievable, and browser-side analytics see none of that traffic. Without it, the busiest and
 * most expensive use of the service would be the one thing invisible in the numbers.
 *
 * **Disabled unless MATOMO_TOKEN is set**, which is the shipped default. No tracker is
 * constructed, no host is contacted, and nothing changes for any deployment that does not opt in
 * -- including the offline sample stack. The token is required rather than optional because
 * without `token_auth` Matomo attributes every hit to this server's own IP instead of the
 * client's, which would make the data actively misleading rather than merely absent.
 */
@Injectable()
export class MatomoInterceptor implements NestInterceptor, OnModuleDestroy {
  private readonly logger = new Logger(MatomoInterceptor.name);
  private readonly tracker: MatomoTracker | null;
  private readonly token: string;
  private readonly publicOrigin: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const matomo = this.config.get('matomo', { infer: true });
    this.token = matomo.token;
    this.publicOrigin = matomo.publicOrigin;

    if (!this.token) {
      this.tracker = null;
      this.logger.log('MATOMO_TOKEN is unset -- API usage tracking is off');
      return;
    }

    this.tracker = new MatomoTracker(matomo.siteId, matomo.url);
    // Without a listener, the tracker's EventEmitter turns a network blip into an unhandled
    // 'error' event, which takes the whole process down. Analytics must never be able to do that.
    this.tracker.on('error', (err: unknown) => {
      this.logger.warn(`Matomo tracking failed (ignored): ${String(err)}`);
    });
    this.logger.log(`API usage tracking on, reporting to ${matomo.url} as site ${matomo.siteId}`);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.tracker) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();

    // Reported after the handler completes, so a request that 503s or 429s is not counted as a
    // served one. tap's next callback fires only on success.
    return next.handle().pipe(
      tap(() => {
        this.report(request);
      }),
    );
  }

  private report(request: Request): void {
    try {
      this.tracker?.track({
        action_name: 'API',
        url: `${this.publicOrigin}${request.originalUrl}`,
        token_auth: this.token,
        // req.ip already resolves X-Forwarded-For, because main.ts sets `trust proxy` -- the same
        // reason the rate limiter can key on it. Falling back to the socket address would report
        // nginx's own IP for every request.
        cip: request.ip,
        uid: request.ip,
        ua: request.headers['user-agent'],
      });
    } catch (err) {
      // Belt and braces alongside the 'error' listener: a synchronous throw here would otherwise
      // surface as a failed request for a call that already succeeded.
      this.logger.warn(`Matomo tracking threw (ignored): ${String(err)}`);
    }
  }

  onModuleDestroy(): void {
    this.tracker?.removeAllListeners();
  }
}
