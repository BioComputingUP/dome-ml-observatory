import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import {
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { MongooseError, mongo } from 'mongoose';
import { OAI_VERBS } from './oai.query';
import { OaiService } from './oai.service';

const DESCRIPTION =
  'OAI-PMH 2.0 over the AI/ML methods papers (positives), in `oai_dc`. Datestamps are each ' +
  "record's `record_modified`, at second granularity, so `from=` harvests only what changed. " +
  'No sets. Identifiers are `oai:observatory.dome-ml.org:<record PID>`. `ListRecords` pages hold ' +
  '200 records, `ListIdentifiers` pages 1000 headers; follow `resumptionToken` to the end.';

// Limited by the 'oai' throttler only: a harvest is a long run of sequential requests and gets
// its own bucket, as /api/export does -- see app.module.ts.
@SkipThrottle({ default: true, export: true })
@ApiTags('oai-pmh')
@ApiTooManyRequestsResponse({
  description:
    'OAI-PMH rate limit exceeded -- this endpoint has its own budget. Back off and retry.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry after the Retry-After delay.',
})
@Controller('oai')
export class OaiController {
  constructor(private readonly oai: OaiService) {}

  @Get()
  @ApiOperation({ summary: 'OAI-PMH 2.0 request (GET).', description: DESCRIPTION })
  @ApiQuery({ name: 'verb', enum: OAI_VERBS, required: true })
  @ApiQuery({ name: 'metadataPrefix', required: false, example: 'oai_dc' })
  @ApiQuery({ name: 'identifier', required: false })
  @ApiQuery({ name: 'from', required: false, example: '2026-09-01' })
  @ApiQuery({ name: 'until', required: false })
  @ApiQuery({ name: 'resumptionToken', required: false })
  @ApiProduces('text/xml')
  @ApiOkResponse({ description: 'An OAI-PMH response; protocol errors are OAI error elements.' })
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    // The raw query, not a DTO: the global ValidationPipe would drop undeclared arguments, and the
    // protocol has to report an illegal argument as badArgument rather than ignore it.
    await this.answer(req.query, res);
  }

  @Post()
  @ApiOperation({ summary: 'OAI-PMH 2.0 request (POST, form-encoded).', description: DESCRIPTION })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiProduces('text/xml')
  @ApiOkResponse({ description: 'An OAI-PMH response; protocol errors are OAI error elements.' })
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    const body: unknown = req.body;
    const args =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    await this.answer(args, res);
  }

  private async answer(args: Readonly<Record<string, unknown>>, res: Response): Promise<void> {
    let xml: string;
    try {
      xml = await this.oai.respond(args);
    } catch (err) {
      // An outage is not an OAI protocol error, and a harvester understands a 503 with Retry-After;
      // the global MongoUnavailableFilter would answer in JSON, which no harvester parses.
      if (err instanceof MongooseError || err instanceof mongo.MongoError) {
        res.status(503).setHeader('Retry-After', '60');
        res.type('text/plain').send('Database temporarily unavailable -- please retry shortly.');
        return;
      }
      throw err;
    }
    res.status(200).setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.send(xml);
  }
}
