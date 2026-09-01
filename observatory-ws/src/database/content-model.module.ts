import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { RECORD_SCHEMA_DEFINITION } from '../records/schemas/record.schema';
import { AppConfig } from '../config/configuration';

/**
 * The single place the 'Content' Mongoose model is registered. Every feature module that needs
 * @InjectModel('Content') (records, facets, stats) imports THIS module rather than each calling
 * MongooseModule.forFeatureAsync itself -- Nest treats a module class as a singleton across all
 * its importers, so the underlying `connection.model('Content', schema)` call happens exactly
 * once. Registering the same model name from two places independently would make Mongoose try to
 * compile it twice on the same connection and throw `OverwriteModelError`.
 */
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: 'Content',
        useFactory: (config: ConfigService<AppConfig, true>) => {
          const schema = RECORD_SCHEMA_DEFINITION;
          // the database server's real collection is also, coincidentally, named "Content" (confirmed
          // 2026-09-01) -- this stays driven by MONGODB_COLLECTION regardless, same as db/URI.
          schema.set('collection', config.get('mongo.collection', { infer: true }));
          return schema;
        },
        inject: [ConfigService],
      },
    ]),
  ],
  exports: [MongooseModule],
})
export class ContentModelModule {}
