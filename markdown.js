const marked = require('marked');

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: true,
  mangle: false
});

function convert(markdownText) {
  return marked(markdownText);
}

module.exports = {
  convert
};