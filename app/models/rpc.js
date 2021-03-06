'use strict';

var request = require('request');

// init_opts = {
//   rpcuser,
//   rpcpassword,
//   ip,
//   port
// }s

module.exports = function(config) { // Saves config in scope
  return function (method, params, callback) {
    var opts_str = JSON.stringify({
      method: method,
      params: params
    });

    var url = 'http://' +
        config.rpcuser + ':' +
        config.rpcpassword + '@' +
        config.ip + ':' +
        config.port;

    request.post({
      url: url,
      body: opts_str

    }, function (error, response, body) {
      if (error) return callback(error);

      body = JSON.parse(body);
      // console.log(Date.now(), 'request.post' + opts_str);
      // console.log(Date.now(), 'rpc returns: ', JSON.stringify(body.result).substring(0, 420));
      if (body.error) return callback(body.error, body);
      callback(null, body.result);
    });
  };
};

