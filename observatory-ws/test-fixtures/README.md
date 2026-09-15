# test-fixtures

Offline copies of external definitions the Jest specs validate against, so `npm test` needs no
network. Nothing here is shipped: it sits outside `src/`, so `nest build` never compiles or copies it.

| File | Source (fetched 2026-09-15) | Changed |
|---|---|---|
| `xsd/OAI-PMH.xsd` | http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd | no |
| `xsd/oai_dc.xsd` | http://www.openarchives.org/OAI/2.0/oai_dc.xsd | `schemaLocation` of its import points at the local copy |
| `xsd/oai-identifier.xsd` | http://www.openarchives.org/OAI/2.0/oai-identifier.xsd | no |
| `xsd/simpledc20021212.xsd` | https://www.dublincore.org/schemas/xmls/simpledc20021212.xsd | `schemaLocation` of its import points at the local copy |
| `xsd/xml.xsd` | https://www.w3.org/2001/03/xml.xsd | the `DOCTYPE` line removed (it names a DTD nothing here loads) |
| `xsd/sitemap.xsd`, `xsd/siteindex.xsd` | https://www.sitemaps.org/schemas/sitemap/0.9/ | no |
| `xsd/oai-pmh-all.xsd` | written here | a wrapper importing the three OAI schemas, so one validation covers a response and the `oai_dc` / `oai-identifier` blocks inside it |
| `schema-org-terms.json` | every `schema:` term in https://schema.org/version/latest/schemaorg-current-https.jsonld | reduced to a sorted list of names |

Refresh a file by fetching it again and re-applying the change in the table.
