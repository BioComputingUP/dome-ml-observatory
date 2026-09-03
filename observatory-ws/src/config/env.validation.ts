import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/** Ceiling on both Mongo query budgets. These exist to stop one slow query holding a connection
 *  open on a shared host, so an operator typo (500000 for 5000) must not silently disable them.
 *  60s is already far beyond any measured query -- the slowest observed was ~24s. */
const MAX_QUERY_BUDGET_MS = 60_000;

/**
 * Every env var this app reads, validated once at boot. Fails fast with the offending variable
 * named, rather than a NestJS app that starts fine and only breaks on the first request that
 * touches the misconfigured value -- see @nestjs/config's `validate` hook in configuration.ts.
 */
class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  MONGODB_URI!: string;

  @IsString()
  @IsNotEmpty()
  MONGODB_DB!: string;

  @IsString()
  @IsNotEmpty()
  MONGODB_COLLECTION!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  // Deliberately not @IsUrl-strict about localhost -- IsUrl rejects bare "http://localhost:4200"
  // without require_tld: false, and dev needs exactly that value (see .env.example).
  @IsOptional()
  @IsUrl({ require_tld: false })
  FRONTEND_URL?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(MAX_QUERY_BUDGET_MS)
  MONGO_MAX_TIME_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(MAX_QUERY_BUDGET_MS)
  MONGO_SEARCH_MAX_TIME_MS?: number;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }

  return validated;
}
