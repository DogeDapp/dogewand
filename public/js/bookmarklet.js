var config = require('../../config/config')();

exports.loader =
'!function() {' +
  'var jsCode = document.createElement("script");' +
  'jsCode.setAttribute("src", "' + config.url + '");' +
  'document.body.appendChild(jsCode);' +
'}();';