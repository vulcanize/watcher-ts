//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/inspect-cid-template.handlebars';

/**
 * Writes the inspect-cid file generated from a template to a stream.
 * @param outStream A writable output stream to write the inspect-cid file to.
 */
export function exportInspectCID (outStream: Writable, subgraphPath: string): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const inspectCid = template({ subgraphPath });
  outStream.write(inspectCid);
}
