import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError, lastValueFrom } from 'rxjs';
import { MatomoInterceptor } from './matomo.interceptor';
import { AppConfig } from '../config/configuration';

const trackSpy = jest.fn();
const onSpy = jest.fn();

jest.mock('matomo-tracker', () =>
  jest.fn().mockImplementation(() => ({
    track: (...args: unknown[]): void => {
      trackSpy(...args);
    },
    on: (...args: unknown[]): void => {
      onSpy(...args);
    },
    removeAllListeners: jest.fn(),
  })),
);

function config(token: string) {
  return {
    get: jest.fn(() => ({
      url: 'https://matomo.example.org/matomo.php',
      siteId: '7',
      token,
      publicOrigin: 'https://observatory.dome-ml.org',
    })),
  } as unknown as ConfigService<AppConfig, true>;
}

function context(url = '/api/records?q=x', ip = '203.0.113.9'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url, ip, headers: { 'user-agent': 'curl/8' } }),
    }),
  } as unknown as ExecutionContext;
}

const handler = (value: unknown = { ok: true }): CallHandler => ({ handle: () => of(value) });

describe('MatomoInterceptor', () => {
  beforeEach(() => {
    trackSpy.mockReset();
    onSpy.mockReset();
  });

  it('is completely inert without a token -- the shipped default', async () => {
    const interceptor = new MatomoInterceptor(config(''));
    await lastValueFrom(interceptor.intercept(context(), handler()));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('reports the client IP and the public URL when a token is set', async () => {
    const interceptor = new MatomoInterceptor(config('secret'));
    await lastValueFrom(interceptor.intercept(context(), handler()));

    expect(trackSpy).toHaveBeenCalledTimes(1);
    expect(trackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action_name: 'API',
        url: 'https://observatory.dome-ml.org/api/records?q=x',
        // token_auth is what makes Matomo honour cip; without it every hit would be attributed
        // to this server rather than the caller.
        token_auth: 'secret',
        cip: '203.0.113.9',
        ua: 'curl/8',
      }),
    );
    // Matomo anonymises cip but never the User ID, so an IP sent as uid would be stored in full.
    const [payload] = trackSpy.mock.calls[0] as [Record<string, unknown>];
    expect(payload).not.toHaveProperty('uid');
  });

  it('does not count the Docker healthcheck, which polls /api/health every 10s', async () => {
    const interceptor = new MatomoInterceptor(config('secret'));
    await lastValueFrom(interceptor.intercept(context('/api/health'), handler()));
    await lastValueFrom(interceptor.intercept(context('/api/health/ready'), handler()));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('does not count crawler fetches of the sitemaps', async () => {
    const interceptor = new MatomoInterceptor(config('secret'));
    await lastValueFrom(interceptor.intercept(context('/api/sitemap'), handler()));
    await lastValueFrom(interceptor.intercept(context('/api/sitemaps/pages'), handler()));
    await lastValueFrom(interceptor.intercept(context('/api/sitemaps/records/3'), handler()));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('still counts a normal API route, including ones merely starting with those words', async () => {
    const interceptor = new MatomoInterceptor(config('secret'));
    await lastValueFrom(interceptor.intercept(context('/api/stats'), handler()));
    await lastValueFrom(interceptor.intercept(context('/api/records?q=health'), handler()));
    await lastValueFrom(interceptor.intercept(context('/api/healthcheck'), handler()));
    expect(trackSpy).toHaveBeenCalledTimes(3);
  });

  it('does not count a request that failed', async () => {
    const interceptor = new MatomoInterceptor(config('secret'));
    const failing: CallHandler = { handle: () => throwError(() => new Error('503')) };
    await expect(lastValueFrom(interceptor.intercept(context(), failing))).rejects.toThrow('503');
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('never lets a tracking failure affect the response', async () => {
    const interceptor = new MatomoInterceptor(config('secret'));
    trackSpy.mockImplementation(() => {
      throw new Error('matomo unreachable');
    });
    await expect(lastValueFrom(interceptor.intercept(context(), handler('payload')))).resolves.toBe(
      'payload',
    );
  });

  it('attaches an error listener, so a network blip cannot kill the process', () => {
    new MatomoInterceptor(config('secret'));
    expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
