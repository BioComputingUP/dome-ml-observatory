import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateXML, XMLFileInfo } from 'xmllint-wasm';

/** The vendored schemas: test-fixtures/xsd, with its README saying where each came from. */
const XSD_DIR = join(__dirname, '..', '..', 'test-fixtures', 'xsd');

function schemaFile(fileName: string): XMLFileInfo {
  return { fileName, contents: readFileSync(join(XSD_DIR, fileName), 'utf8') };
}

/**
 * libxml2's validation errors for `xml` against one vendored schema, empty when it is valid. Every
 * other schema in the folder is preloaded, so imports between them resolve offline.
 */
export async function xsdErrors(xml: string, schema: string): Promise<string[]> {
  const preload = readdirSync(XSD_DIR)
    .filter((f) => f.endsWith('.xsd') && f !== schema)
    .map(schemaFile);
  const result = await validateXML({
    xml: [{ fileName: 'document.xml', contents: xml }],
    schema: [schemaFile(schema)],
    preload,
  });
  return result.errors.map((e) => e.rawMessage);
}
