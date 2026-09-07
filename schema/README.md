# schema/

The versioned data model for DOME Observatory's records: what a document looks like, and the
controlled vocabularies its AI/ML enrichment fields draw from. This is the source of truth that
`observatory-ui` (and, from Phase 5, `observatory-ws`) build against — nothing here is generated
from the frontend or backend; they're generated *from* this.

Modelled on [`BioComputingUP/dome-schema`](https://github.com/BioComputingUP/dome-schema) (the
DOME Registry's own schema repo) — immutable versioned release folders, semver, a changelog — but
deliberately leaner: one record family (not two, since there's no user-account schema here), and
each release is one schema file with descriptions inline plus one real example, not four parallel
files. See "Why leaner than dome-schema" below.

## Layout

```
schema/
├── README.md            # this file
├── CHANGELOG.md          # every field/vocab change across versions, with its migration note
├── CURRENT               # one line: the current version, e.g. v1.1.0
├── validate.py           # dependency-free validator -- checks a record against a release's schema
└── releases/
    └── v1.1.0/           # immutable once published -- never edit a release in place
        ├── ai-ml-landscape.schema.json   # field-by-field shape, with descriptions inline
        ├── ai-ml-landscape.example.json  # one real record from the corpus (not fabricated)
        └── vocab/
            ├── domain.json               # EDAM topic branch: domain_tier1/2/3 + max_tags
            ├── modelling-branch.json     # learning_paradigm, model_family + max_tags
            └── model-type-seed.json      # 76 canonical model_type terms + aliases (open vocab)
```

## Where this data actually comes from

The corpus and its classification are produced by the sibling repository
[`dome-ml-observatory-triage`](https://github.com/BioComputingUP/dome-ml-observatory-triage) — its
`mongo_landscape_export/scripts/schema.py` is where the document shape is *authored*
(`SCHEMA_VERSION`, `build_document()`), and its `README.md` explains the pipeline. This `schema/`
folder is downstream of it: there is where the data and vocabularies are *built*; here is where
they're *published* as a stable, versioned contract for this repo's UI and backend to depend on.
That repository's `schema/check_alignment.py` checks the two (and the live database) agree; run it
before cutting a release here.

The controlled vocabularies (`vocab/`) are decided and maintained in `dome-ml-observatory-triage/curation_criteria/`
by the enrichment pipeline. When they change there, use the `schema-version` skill
(`.claude/skills/schema-version/SKILL.md`) to pull the update in here properly, rather than
hand-copying files.

## Versioning rules

Semver, decided by what changed:

- **Major** (`vX.0.0`) — a field removed, renamed, or its type changed. Existing consumers would
  break without changes.
- **Minor** (`vX.Y.0`) — a field added, or a vocabulary's term set changed in a way that adds new
  valid values. Existing consumers keep working; new capability is available.
- **Patch** (`vX.Y.Z`) — a description/documentation fix, or a vocab correction that doesn't
  change what's structurally valid (e.g. fixing a typo in a term's label).

Every bump gets a `CHANGELOG.md` entry with a migration note — even when "the migration" is just
"no action needed, this is additive."

## Updating

Use the `schema-version` skill rather than hand-editing:

> "sync the schema from dome-ml-observatory-triage" / "check for schema updates" / "cut a new schema version"

It pulls the latest from `dome-ml-observatory-triage`, diffs against `CURRENT`, proposes the right semver bump,
writes the changelog entry, publishes the new immutable release folder, moves `CURRENT`, re-syncs
`observatory-ui`'s vocab assets, and validates the result. Manual steps if you're not using the
skill:

1. Copy the updated schema/vocab source from `dome-ml-observatory-triage` into a **new**
   `releases/vX.Y.Z/` folder — never edit an existing release.
2. Update the example if the shape changed (`validate.py` will catch a stale example).
3. Add the `CHANGELOG.md` entry.
4. Update `CURRENT`.
5. Run `npm run sync-schema --prefix observatory-ui` (or just `npm run build-prod` from repo
   root, which runs it automatically — see `observatory-ui/package.json`'s `presync`/`prebuild`)
   to copy `vocab/` into `observatory-ui/src/assets/vocab/`.
6. `python3 schema/validate.py schema/releases/vX.Y.Z/ai-ml-landscape.example.json`

## Why leaner than dome-schema

`dome-schema` carries, per version: `*-entry-schema`, `*-entry-template`, `*-entry-annotated`,
`*-entry-example` — then repeats all four for a separate `*-user-*` family, plus a Dockerised
validator. That's right for the DOME Registry (two genuinely distinct record types: entries and
user accounts, entries authored by hand against a template). Observatory has one record family,
generated programmatically from a corpus, never hand-authored — so the template/annotated split
doesn't pull its weight: one schema file with descriptions inline covers both jobs, one real
example (not a fictionalised one) is more trustworthy than a synthetic one, and a ~90-line
stdlib script covers what the Docker validator does here.
