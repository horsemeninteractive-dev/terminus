import { RawOsmResponse } from '../src/services/osmFetcher';

/**
 * High-speed pure-JS parser for official OpenStreetMap API XML exports.
 */
export function parseOsmXml(xmlText: string): RawOsmResponse {
  const elements: RawOsmResponse['elements'] = [];

  // 1. Extract all nodes
  const nodeRegex = /<node\s+([^>]*?)(\/>|>(.*?)<\/node>)/gs;
  let match: RegExpExecArray | null;

  while ((match = nodeRegex.exec(xmlText)) !== null) {
    const attrsStr = match[1];
    const innerStr = match[3];

    const idMatch = /id="(\d+)"/.exec(attrsStr);
    const latMatch = /lat="([^"]+)"/.exec(attrsStr);
    const lonMatch = /lon="([^"]+)"/.exec(attrsStr);

    if (!idMatch || !latMatch || !lonMatch) continue;

    const id = parseInt(idMatch[1], 10);
    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);

    const tags: Record<string, string> = {};
    if (innerStr) {
      const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]*)"/g;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagRegex.exec(innerStr)) !== null) {
        tags[decodeXml(tagMatch[1])] = decodeXml(tagMatch[2]);
      }
    }

    elements.push({
      type: 'node',
      id,
      lat,
      lon,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
    });
  }

  // 2. Extract all ways
  const wayRegex = /<way\s+([^>]*?)>(.*?)<\/way>/gs;
  while ((match = wayRegex.exec(xmlText)) !== null) {
    const attrsStr = match[1];
    const innerStr = match[2];

    const idMatch = /id="(\d+)"/.exec(attrsStr);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);

    const nodes: number[] = [];
    const ndRegex = /<nd\s+ref="(\d+)"/g;
    let ndMatch: RegExpExecArray | null;
    while ((ndMatch = ndRegex.exec(innerStr)) !== null) {
      nodes.push(parseInt(ndMatch[1], 10));
    }

    const tags: Record<string, string> = {};
    const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]*)"/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(innerStr)) !== null) {
      tags[decodeXml(tagMatch[1])] = decodeXml(tagMatch[2]);
    }

    elements.push({
      type: 'way',
      id,
      nodes,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
    });
  }

  // 3. Extract relations
  const relationRegex = /<relation\s+([^>]*?)>(.*?)<\/relation>/gs;
  while ((match = relationRegex.exec(xmlText)) !== null) {
    const attrsStr = match[1];
    const innerStr = match[2];

    const idMatch = /id="(\d+)"/.exec(attrsStr);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);

    const members: Array<{ type: 'node' | 'way' | 'relation'; ref: number; role: string }> = [];
    const memberRegex = /<member\s+type="([^"]+)"\s+ref="(\d+)"\s+role="([^"]*)"/g;
    let memberMatch: RegExpExecArray | null;
    while ((memberMatch = memberRegex.exec(innerStr)) !== null) {
      members.push({
        type: memberMatch[1] as any,
        ref: parseInt(memberMatch[2], 10),
        role: memberMatch[3],
      });
    }

    const tags: Record<string, string> = {};
    const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]*)"/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(innerStr)) !== null) {
      tags[decodeXml(tagMatch[1])] = decodeXml(tagMatch[2]);
    }

    elements.push({
      type: 'relation',
      id,
      members,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
    });
  }

  return {
    version: 0.6,
    generator: 'official-osm-api',
    elements,
  };
}

function decodeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
