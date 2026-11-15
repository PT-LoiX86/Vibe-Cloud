import { XMLParser } from "fast-xml-parser";

const arrayTags = new Set([
  "HOST",
  "DATASTORE",
  "NIC",
  "DISK",
  "USER",
  "GROUP",
  "VM",
  "IMAGE",
  "VMTEMPLATE",
]);

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  isArray: (tagName) => arrayTags.has(tagName),
});

export function parseOneXml(xmlString) {
  if (!xmlString || typeof xmlString !== "string") return {};
  return xmlParser.parse(xmlString);
}
