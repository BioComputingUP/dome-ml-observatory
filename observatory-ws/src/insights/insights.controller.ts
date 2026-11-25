import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InsightsService } from './insights.service';
import { DataOverview, ResourceDetail } from './data-insights';
import { JournalModelProfile, ModelsOverview } from './models-insights';

// Subject to the 'default' throttler only, like every other read-only table endpoint.
@SkipThrottle({ export: true, oai: true })
@ApiTags('insights')
@ApiTooManyRequestsResponse({
  description:
    'Rate limit exceeded -- back off and retry. The limit is per client IP over a rolling ' +
    'minute; see the Fair use section of this document for the current value.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('models')
  @ApiOperation({
    summary:
      'Model families, learning paradigms, model use and model types by year, with the journals ' +
      'and research domains that use each family more or less than the corpus does. Without ' +
      "`journal`, the overview; with it, that journal's family profile.",
  })
  @ApiQuery({ name: 'journal', required: false, description: 'An exact journal name.' })
  @ApiOkResponse({
    description:
      'ModelsOverview, or JournalModelProfile when `journal` is given. Every figure covers the ' +
      'enriched AI/ML methods papers only (`coverage.enriched` of `coverage.positive`); the ' +
      'enrichment so far ran on selected journals, not a random sample.',
  })
  @ApiNotFoundResponse({ description: 'No enriched paper from a journal by that exact name.' })
  models(@Query('journal') journal?: string): Promise<ModelsOverview | JournalModelProfile> {
    return journal?.trim() ? this.insights.journalProfile(journal) : this.insights.modelsOverview();
  }

  @Get('data')
  @ApiOperation({
    summary:
      'The data resources AI/ML methods papers link to, by year, with how each link was found ' +
      "(deposited or mentioned), each resource's designations (EMBL-EBI, ELIXIR, Global Core " +
      "Biodata Resource) and the model families used with it. With `resource`, one resource's detail.",
  })
  @ApiQuery({
    name: 'resource',
    required: false,
    description: 'A resource slug, as in data_links.resources[].resource (e.g. "pdb").',
  })
  @ApiOkResponse({
    description:
      'DataOverview, or ResourceDetail when `resource` is given. Data resources only: software ' +
      'registries, code hosts, ontologies and generic identifiers are listed in ' +
      '`scope.excludedKinds` and not ranked, and the automatic BioStudies supplementary-files ' +
      'record is counted in `scope.derivedBioStudies` and nowhere else.',
  })
  @ApiNotFoundResponse({
    description: 'No AI/ML methods paper links a data resource by that slug.',
  })
  data(@Query('resource') resource?: string): Promise<DataOverview | ResourceDetail> {
    return resource?.trim()
      ? this.insights.resourceDetail(resource.trim())
      : this.insights.dataOverview();
  }
}
