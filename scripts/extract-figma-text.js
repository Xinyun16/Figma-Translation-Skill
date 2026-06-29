const TARGET_NODE_ID = "__TARGET_NODE_ID__";
const INCLUDE_TEXT_NODES = false;
const INCLUDE_INSTANCE_CHILDREN = true;
if (!TARGET_NODE_ID || TARGET_NODE_ID === "__TARGET_NODE_ID__") {
  return { ok: false, error: "Missing TARGET_NODE_ID" };
}

figma.skipInvisibleInstanceChildren = !INCLUDE_INSTANCE_CHILDREN;

const node = await figma.getNodeByIdAsync(TARGET_NODE_ID);
if (!node) {
  return { ok: false, error: "Target node not found", targetNodeId: TARGET_NODE_ID };
}

const textNodes = node.findAllWithCriteria({ types: ["TEXT"] });
const normalizedTexts = textNodes.map((textNode) => textNode.characters
  .replace(/\u00a0/g, " ")
  .replace(/[\u2028\u2029]/g, "\n")
  .replace(/\r\n?/g, "\n")
  .trim());

const uniqueTexts = [...new Set(normalizedTexts.filter(Boolean))];

const result = {
  ok: true,
  nodeId: node.id,
  nodeName: node.name,
  nodeType: node.type,
  textNodeCount: textNodes.length,
  uniqueTextCount: uniqueTexts.length,
  uniqueTexts,
};

if (INCLUDE_TEXT_NODES) {
  result.textNodes = textNodes.map((textNode, index) => ({
    id: textNode.id,
    name: textNode.name,
    characters: normalizedTexts[index],
  }));
}

return result;
