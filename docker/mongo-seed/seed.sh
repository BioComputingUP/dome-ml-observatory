#!/usr/bin/env bash
# Seeds a throwaway local MongoDB with the tracked 200-record sample so the whole stack runs
# with no network access to any real database. Idempotent: re-running replaces the collection.
set -euo pipefail

HOST="${SEED_MONGO_HOST:-mongo}"
DB="${SEED_MONGO_DB:-dome_observatory}"
COLL="${SEED_MONGO_COLLECTION:-Content}"
FIXTURE=/seed/sample-records.json

echo "Seeding ${HOST}/${DB}.${COLL} from $(basename "${FIXTURE}") ..."

mongoimport \
  --host "${HOST}" \
  --db "${DB}" \
  --collection "${COLL}" \
  --file "${FIXTURE}" \
  --jsonArray \
  --drop

# The same two indexes the real collection carries. Without them the backend still works -- it
# detects their absence at boot and uses the regex path -- but the seeded stack should exercise
# the same code path production does.
mongosh "mongodb://${HOST}:27017/${DB}" --quiet --eval '
  const c = db.getCollection("'"${COLL}"'");
  c.createIndex(
    { "publication_metadata.title": "text",
      "publication_metadata.abstract": "text",
      "publication_metadata.authors": "text" },
    { partialFilterExpression: { "llm_classification.classification": "positive" },
      weights: { "publication_metadata.title": 10,
                 "publication_metadata.authors": 5,
                 "publication_metadata.abstract": 1 },
      name: "positives_text" });
  c.createIndex(
    { "llm_classification.classification": 1, "publication_metadata.year": -1, _id: 1 },
    { name: "class_year_id" });
  print("documents: " + c.countDocuments({}));
  print("positives:  " + c.countDocuments({ "llm_classification.classification": "positive" }));
  print("indexes:   " + c.getIndexes().map(i => i.name).join(", "));
'

echo "Seed complete."
