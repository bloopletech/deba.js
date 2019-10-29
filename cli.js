#!/usr/bin/env node

var path = require('path');
const deba = require(path.resolve(__dirname, "./deba.js"));

const { JSDOM } = require("jsdom");

function serialize(jsdom) {
  process.stdout.write(deba(jsdom.window.document) + "\n");
}

const arg = process.argv[2];

if(arg.startsWith("http:") || arg.startsWith("https:") || arg.startsWith("file:")) {
  JSDOM.fromURL(arg).then(serialize);
}
else {
  JSDOM.fromFile(arg).then(serialize);
}
