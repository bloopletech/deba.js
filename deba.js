"use babel";
"use strict";

const Utils = {
  isPresent: function(text) {
    return text != "" && text.search(/^\s*$/) == -1;
  },
  escape: function(text) {
    /*
    From the Commonmark spec, version 0.29:
    An ASCII punctuation character is !, ", #, $, %, &, ', (, ), *, +, ,, -, ., / (U+0021–2F), :, ;, <, =, >, ?, @ (U+003A–0040), [, \, ], ^, _, ` (U+005B–0060), {, |, }, or ~ (U+007B–007E).

    Breaking this up into characters that need to be escaped all the time:
    * because it can mean emphasis and also can mean a list marker
    < because it can mean a HTML open tag or HTML close tag
    [ because it can mean a link title or image title
    \ because it can escape the following character
    _ because it can mean emphasis
    ` because it can mean a code fence
    ~ because it can mean a code fence

    Characters that need to be escaped if they are the start of a block (with optional leading whitespace):
    # because it can be a heading start
    + because it can be a list marker
    - because it can be a list marker
    = because it can be a heading start
    > because it can be a blockquote marker

    Characters that need to be escaped in certain situations:
    & when it is followed by some characters and then a semicolon
    . when it is preceded by a number, because then it can be a list item

    Characters that can be ignored:
    ! because it only has meaning before a '[' or after a '<', and both of those will be escaped
    " because it only has meaning in HTML attributes and link titles, both of which will be escaped
    $ because it has no special meaning
    % because it has no special meaning
    ' because it only has meaning in HTML attributes and link titles, both of which will be escaped
    ( because it only has meaning in links and images, both of which will be escaped
    ) because it only has meaning in links and images, both of which will be escaped
    , because it has no special meaning
    / because it only has meaning in a HTML close tag, which will be escaped
    : because it only has meaning in links and HTML tags, both of which will be escaped
    ; because it only has meaning in HTML entities, which will be escaped
    ? because it has no special meaning
    @ because it has no special meaning
    ] because it only has meaning in links and images, both of which will be escaped
    ^ because it has no special meaning
    { because it has no special meaning
    | because it has no special meaning
    } because it has no special meaning
    */

    //Escaping that needs to be done all the time.
    text = text.replace(/([*<\[\\_`~])/g, '\\$1');

    //Escaping that needs to be done at the start of a block.
    text = text.replace(/^(\s*?)([#+\-=>])/g, '$1\\$2');

    //Escaping that needs to happen in certain situations
    //Conditional escaping for the '&' that begins a HTML entity.
    text = text.replace(/(&.*?;)/g, '\\$1');
    //Conditional escaping for the '.' following a number that would start an ordinal list item.
    text = text.replace(/^(\s*\d+)\. /g, '$1\\. ');

    return text;
  },
  normalise: function(text) {
    return text.replace(/\s+/g, " ").trim();
  }
};

function Stringifier(segments) {
  this.segments = segments;
}

Stringifier.prototype.chunkUpSegments = function() {
  const chunks = [];
  let lastType = null;
  let currentChunk = [];

  for(const segment of this.segments.concat(null)) {
    if(lastType == null || segment == null || segment.constructor.name != lastType) {
      if(currentChunk.length) {
        chunks.push([lastType, currentChunk]);
        currentChunk = [];

        if(segment == null) break;
      }

      lastType = segment.constructor.name;
    }

    currentChunk.push(segment);
  }

  return chunks;
}

Stringifier.prototype.stringify = function() {
  const chunks = this.chunkUpSegments();
  const output = [];

  for(const chunk of chunks) {
    const type = chunk[0];
    const text = chunk[1].join("");

    if(type == "Span") output.push(Utils.normalise(text));
    else output.push(text);
  }

  return output.join("");
}

function Span(text, useRaw) {
  this.text = useRaw ? text : Utils.escape(text);
}

Span.prototype.toString = function() {
  return this.text;
}

function Pre(segments) {
  this.segments = segments;
}

Pre.prototype.toArray = function() {
  const nodes = this.segments.join("").split(/\n{2,}/g);

  var result = [];
  for(const node of nodes) {
    const normalised = Utils.normalise(node);
    if(Utils.isPresent(normalised)) result.push(normalised);
  }

  return result.length ? [result.join("\n\n") + "\n\n"] : [];
}

function Heading(segments, level) {
  this.segments = segments;
  this.level = level;
}

Heading.prototype.toArray = function() {
  return ["######".substr(-this.level) + " "].concat(this.segments).concat(["\n\n"]);
}

function ListItem(segments, last, index) {
  this.segments = segments;
  this.last = last;
  this.index = index;
}

ListItem.prototype.toArray = function() {
  return [this.prefix()].concat(this.segments).concat(["\n" + (this.last ? "\n" : "")]);
}

ListItem.prototype.prefix = function() {
  if(this.index == null) return "* ";
  else return this.index + ". ";
}

function DefinitionTerm(segments) {
  this.segments = segments;
}

DefinitionTerm.prototype.toArray = function() {
  return this.segments.concat([":\n"]);
}

function DefinitionDescription(segments, last) {
  this.segments = segments;
  this.last = last;
}

DefinitionDescription.prototype.toArray = function() {
  return this.segments.concat(["\n" + (this.last ? "\n" : "")]);
}

function Paragraph(segments) {
  this.segments = segments;
}

Paragraph.prototype.toArray = function() {
  return this.segments.concat(["\n\n"]);
}

function Document(extractor) {
  this.extractor = extractor;
  this.content = "";

  this.start();
}

Document.prototype.getContent = function() {
  return this.content;
}

Document.prototype.push = function(segment) {
  this.segments.push(segment);
}

Document.prototype.break = function() {
  this.finish();
  this.start(Array.prototype.slice.call(arguments));
}

Document.prototype.finish = function() {
  if(!this.isPresent()) return;

  if(this.extractor.isInBlockquote()) this.content += "> ";
  this.content += this.blockContent();
}

Document.prototype.start = function(args) {
  this.segments = [];
  this.args = args || [];
}

Document.prototype.isPresent = function() {
  for(const segment of this.segments) {
    if(segment instanceof Span && Utils.isPresent(segment.toString())) return true;
  }
  return false;
}

Document.prototype.blockContent = function() {
  const blockType = this.args.shift();
  this.args.unshift(this.segments);
  this.args.unshift(null);

  const block = new (Function.prototype.bind.apply(blockType, this.args));

  return (new Stringifier(block.toArray())).stringify();
}

function Extractor(input, options) {
  this.nodes = this.arrayify(input).map(this.convertNode);
  this.options = Object.assign({ images: true, links: true, excludeHidden: true }, options);

  if(!this.nodes.length) return;

  this.textProperty = ("innerText" in this.nodes[0] ? "innerText" : "textContent");
  this.domDocument = this.nodes[0].ownerDocument;
  this.isDomReal = !this.domDocument.hidden;

  this.pageBounds = this.getPageBounds();

  this.HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
  this.BLOCK_INITIATING_TAGS = ["address", "article", "aside", "body", "blockquote", "div", "dd", "dl", "dt", "figure",
    "footer", "header", "li", "main", "nav", "ol", "p", "pre", "section", "td", "th", "ul"];
  this.ENHANCERS = { b: "**", strong: "**", i: "*", em: "*" };
  this.SKIP_TAGS = ["head", "style", "script", "noscript"];
  this.BREAK_TAGS_QUERY = (this.HEADING_TAGS.concat(this.BLOCK_INITIATING_TAGS)).join(", ");
}

Extractor.prototype.getPageBounds = function() {
  if(!this.isDomReal || !this.options.excludeHidden) return null;

  let tallestHeight = 0;
  for(const element of this.domDocument.documentElement.querySelectorAll("*")) {
    const elementHeight = element.scrollHeight;
    if(elementHeight > tallestHeight) tallestHeight = elementHeight;
  }

  return {
    top: 0,
    right: this.domDocument.documentElement.scrollWidth,
    bottom: tallestHeight,
    left: 0
  };
}

Extractor.prototype.blocks = function() {
  return this.blocks;
}

Extractor.prototype.extract = function() {
  this.justAppendedBr = false;
  this.inBlockquote = false;
  this.groupWithNext = false;

  this.document = new Document(this);

  for(const node of this.nodes) {
    this.document.break(Paragraph);
    this.process(node);
    this.document.break(Paragraph);
  }

  return this.document.getContent().trim();
}

Extractor.prototype.arrayify = function(input) {
  if(Array.isArray(input)) return input;
  else return [input];
}

Extractor.prototype.convertNode = function(input) {
  var type = input.constructor.name;
  if(type == "Document" || type == "HTMLDocument") return input.documentElement;
  else if(type == "Window") return input.document.documentElement;
  else return input;
}

Extractor.prototype.process = function(node) {
  const nodeName = node.nodeName.toLowerCase();

  if(this.SKIP_TAGS.includes(nodeName)) return;

  if(this.options.exclude) {
    for(const selector of this.options.exclude) {
      if(node.matches(selector)) return;
    }
  }

  if(this.options.excludeHidden && !this.isElementVisible(node)) return;

  //Handle repeated brs by making a paragraph break
  if(nodeName == "br") {
    if(this.justAppendedBr) {
      this.justAppendedBr = false;

      this.document.break(Paragraph);

      return;
    }
    else {
      this.justAppendedBr = true;
    }
  }
  else if(this.justAppendedBr) {
    this.justAppendedBr = false;

    this.document.push("\n");
  }

  if(node.nodeType == 3) {
    this.document.push(new Span(node.textContent));

    return;
  }

  if(this.ENHANCERS[nodeName]) {
    if(!Utils.isPresent(node[this.textProperty])) return;

    var enhancer = new Span(this.ENHANCERS[nodeName], true);

    this.document.push(enhancer);
    this.processChildren(node);
    this.document.push(enhancer);

    return;
  }

  if(this.options.images && nodeName == "img") {
    this.document.push(new Span("![" + Utils.escape(node.alt) + "](" + node.src + ")", true));
    return;
  }

  if(this.options.links && nodeName == "a") {
    if(!Utils.isPresent(node[this.textProperty])) return;

    if(node.querySelectorAll(this.BREAK_TAGS_QUERY).length) {
      this.processChildren(node);
      return;
    }

    this.document.push(new Span("[", true));
    this.processChildren(node);
    this.document.push(new Span("](" + node.href + ")", true));

    return;
  }

  if(nodeName == "blockquote") {
    this.inBlockquote = true;

    this.document.break(Paragraph);
    this.processFlowContent(node);

    this.inBlockquote = false;

    return;
  }

  if(nodeName == "li") {
    let index = null;
    if(node.parentNode.nodeName.toLowerCase() == "ol") {
      index = 1;
      let sibling = node;
      while((sibling = sibling.previousElementSibling)) index++;
    }

    this.document.break(ListItem, node.nextElementSibling == null, index);
    this.processFlowContent(node);

    return;
  }

  if(nodeName == "dt") {
    this.document.break(DefinitionTerm);
    this.processFlowContent(node);
    return;
  }

  if(nodeName == "dd") {
    this.document.break(DefinitionDescription, node.nextElementSibling == null);
    this.processFlowContent(node);
    return;
  }

  if(nodeName == "pre") {
    this.document.break(Pre);
    this.processChildren(node);
    this.document.break(Paragraph);

    return;
  }

  if(nodeName == "textarea") {
    this.document.break(Pre);
    this.document.push(new Span(node.value));
    this.document.break(Paragraph);

    return;
  }

  //These tags terminate the current paragraph, if present, and start a new paragraph
  if(this.BLOCK_INITIATING_TAGS.includes(nodeName)) {
    if(this.groupWithNext) this.groupWithNext = false;
    else this.document.break(Paragraph);
    this.processChildren(node);
    this.document.break(Paragraph);

    return;
  }

  if(this.HEADING_TAGS.includes(nodeName)) {
    this.document.break(Heading, parseInt(nodeName[1]));
    this.processChildren(node);
    this.document.break(Paragraph);

    return;
  }

  //Pretend that the children of this node were siblings of this node (move them one level up the tree)
  this.processChildren(node);
}

Extractor.prototype.processFlowContent = function(node) {
  this.groupWithNext = true;
  this.processChildren(node);
  this.groupWithNext = false;
  this.document.break(Paragraph);
}

Extractor.prototype.processChildren = function(node) {
  for(const child of node.childNodes) this.process(child);
}

Extractor.prototype.isElementVisible = function(node) {
  //It's only possible to determine if an element is visible if we have access to a real browser layout engine.
  if(!this.isDomReal) return true;

  //Only elements can be hidden/visible; the concept doesn't make sense for other node types
  if(node.nodeType != 1) return true;

  //If an element doesn't have a width or a height and doesn't generate any boxes, then it's definitely hidden
  if(!node.offsetWidth && !node.offsetHeight && !node.getClientRects().length) return false;

  const window = node.ownerDocument.defaultView;
  const styles = window.getComputedStyle(node);

  const nodeBounds = node.getBoundingClientRect();

  return (nodeBounds.left < this.pageBounds.right && nodeBounds.right > this.pageBounds.left &&
    nodeBounds.top < this.pageBounds.bottom && nodeBounds.bottom > this.pageBounds.top);
}

Extractor.prototype.isInBlockquote = function() {
  return this.inBlockquote;
}

export {
  Utils,
  Stringifier,
  Span,
  Pre,
  Heading,
  ListItem,
  DefinitionTerm,
  DefinitionDescription,
  Paragraph,
  Document,
  Extractor
}

export default function(input, options) {
  return (new Extractor(input, options)).extract();
}
