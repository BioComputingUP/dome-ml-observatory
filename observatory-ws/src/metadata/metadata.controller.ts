import { Controller, Get, NotFoundException, Param, ParseIntPipe, Res } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AppConfig } from '../config/configuration';
import { CatalogService } from './catalog.service';
import { MetadataService } from './metadata.service';
import { recordUrl } from './metadata-urls';
import { SitemapService } from './sitemap.service';
import {
  pagesSitemapUrl,
  recordsSitemapUrl,
  sitemapIndexXml,
  STATIC_PAGES,
  urlsetXml,
} from './sitemap';

/** Metadata changes with a load or a deploy, never per request; an hour's caching costs nothing. */
const CACHE_CONTROL = 'public, max-age=3600';

// Subject to the 'default' throttler only, like /api/records -- see app.module.ts.
@SkipThrottle({ export: true, oai: true })
@ApiTags('metadata')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded -- back off and retry. Shares the default per-IP budget.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller()
export class MetadataController {
  constructor(
    private readonly metadata: MetadataService,
    private readonly sitemap: SitemapService,
    private readonly catalog: CatalogService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('records/:pid/jsonld')
  @ApiOperation({
    summary: 'A record as schema.org / Bioschemas JSON-LD.',
    description:
      'Two nodes in one graph, kept apart because their licences differ: the Observatory record ' +
      '(CreativeWork, CC BY 4.0: screening verdict, vocabulary terms as EDAM / MeSH / ontology ' +
      'IRIs, PROV provenance) and the article it describes (ScholarlyArticle, from Europe PMC ' +
      'metadata under the article’s own licence, with its linked data and software as typed ' +
      'references). Also served for `Accept: application/ld+json` on the record page itself.',
  })
  @ApiProduces('application/ld+json')
  @ApiNotFoundResponse({ description: 'No record with that PID.' })
  async jsonld(@Param('pid') pid: string, @Res() res: Response): Promise<void> {
    const body = await this.metadata.jsonld(pid);
    const origin = this.config.get('publicOrigin', { infer: true });
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('Link', `<${recordUrl(origin, pid)}>; rel="describes"`);
    res.send(JSON.stringify(body));
  }

  @Get('records/:pid/linkset')
  @ApiOperation({
    summary: 'FAIR Signposting links for a record page, as an RFC 9264 linkset.',
    description:
      'cite-as, describedby (the JSON-LD, and for positives the OAI-PMH record), type, license ' +
      'and collection -- the same relations the record page sends as Link headers.',
  })
  @ApiProduces('application/linkset+json')
  @ApiNotFoundResponse({ description: 'No record with that PID.' })
  async linkset(@Param('pid') pid: string, @Res() res: Response): Promise<void> {
    const body = await this.metadata.linkset(pid);
    res.setHeader('Content-Type', 'application/linkset+json; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.send(JSON.stringify(body));
  }

  @Get('catalog')
  @ApiOperation({
    summary: 'The corpus as a DCAT 3 / schema.org dataset: catalogue, series, release, API.',
    description:
      'Built at each monthly corpus release and published with it. Counts, schema release, ' +
      'curation-criteria and vocabulary hashes, distributions and the data service.',
  })
  @ApiProduces('application/ld+json')
  @ApiOkResponse({ description: 'The JSON-LD document of the current release.' })
  @ApiNotFoundResponse({ description: 'No corpus release metadata has been published yet.' })
  catalogue(@Res() res: Response): void {
    const text = this.catalog.current();
    if (!text) throw new NotFoundException('No corpus release metadata has been published yet.');
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.send(text);
  }

  @Get('sitemap')
  @ApiOperation({
    summary: 'Sitemap index: the site’s pages and every chunk of positive record pages.',
    description: 'Public at /sitemap.xml, which nginx maps here.',
  })
  @ApiProduces('application/xml')
  async sitemapIndex(@Res() res: Response): Promise<void> {
    const chunks = await this.sitemap.chunks();
    const origin = this.config.get('publicOrigin', { infer: true });
    const xml = sitemapIndexXml([
      { loc: pagesSitemapUrl(origin) },
      ...chunks.map((chunk, i) => ({
        loc: recordsSitemapUrl(origin, i + 1),
        lastmod: chunk.lastmod,
      })),
    ]);
    this.sendXml(res, xml);
  }

  @Get('sitemaps/pages')
  @ApiOperation({ summary: 'The site’s own pages. Public at /sitemaps/pages.xml.' })
  @ApiProduces('application/xml')
  pages(@Res() res: Response): void {
    const origin = this.config.get('publicOrigin', { infer: true });
    this.sendXml(res, urlsetXml(STATIC_PAGES.map((path) => ({ loc: `${origin}${path}` }))));
  }

  @Get('sitemaps/records/:n')
  @ApiOperation({
    summary:
      'One chunk of up to 50,000 positive record pages. Public at /sitemaps/records-<n>.xml.',
  })
  @ApiProduces('application/xml')
  @ApiNotFoundResponse({ description: 'Past the last chunk.' })
  async records(@Param('n', ParseIntPipe) n: number, @Res() res: Response): Promise<void> {
    const urls = n >= 1 ? await this.sitemap.records(n) : undefined;
    if (!urls) throw new NotFoundException(`No sitemap chunk ${n}`);
    this.sendXml(res, urlsetXml(urls));
  }

  private sendXml(res: Response, xml: string): void {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.send(xml);
  }
}
