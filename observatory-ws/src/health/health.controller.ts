import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { CURRENT_SCHEMA_VERSION } from '../common/schema-version';

// Exempt from both throttlers -- BOTH have to be named. @SkipThrottle()'s default argument is
// `{ default: true }`, which skips only the throttler literally called 'default' and would leave
// health subject to 'export'. Confirmed the hard way: with a bare @SkipThrottle(), /api/health
// started returning 429 once the export bucket was spent.
//
// This is what swagger.ts has always claimed ("never rate-limited")
// and was not true until this decorator existed: the global guard applied here like everywhere
// else. It matters in practice -- the Docker HEALTHCHECK polls /api/health every 10s, and a
// liveness probe that can be rate-limited into failing would restart-loop a healthy container
// under load, which is the exact opposite of what a liveness check is for.
@SkipThrottle({ default: true, export: true })
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService)
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Liveness probe -- the Docker HEALTHCHECK target. Deliberately never touches Mongo: a VPN blip
   * taking the MongoDB server unreachable must not restart-loop this container, it should just make
   * /api/records fail per-request while the process itself stays up. Verified by the VPN-drop test.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe. Never touches the database.' })
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness probe -- does touch Mongo, on purpose, so a human (or a future orchestrator) can
   * distinguish "process is up" from "can actually serve real requests". Never wired to the
   * Docker HEALTHCHECK itself, which must stay liveness-only.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe -- confirms the database connection is live.' })
  @ApiServiceUnavailableResponse({
    description: 'The database connection is not ready or a ping failed.',
  })
  async readiness(): Promise<{
    status: 'ok';
    mongo: { db: string; collection: string; estimatedCount: number };
    schemaVersion: string;
  }> {
    const db = this.connection.db;
    if (!db || this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException('Mongo connection not ready');
    }

    const collectionName = this.config.get('mongo.collection', { infer: true });
    try {
      const estimatedCount = await db.collection(collectionName).estimatedDocumentCount();
      return {
        status: 'ok',
        mongo: {
          db: db.databaseName,
          collection: collectionName,
          estimatedCount,
        },
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
    } catch {
      throw new ServiceUnavailableException('Mongo ping failed');
    }
  }
}
