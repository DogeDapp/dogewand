'use strict';

var mongoose = require('mongoose');
var User = mongoose.model('User');
var Tip = mongoose.model('Tip');
var check = require('check-types');
var queue = require('../models/queue');
var coinstring = require('coinstring');
var utils = require('../../utils.js');
var _ = require('lodash');

exports.createTip = function (user, opts, callback) {
  var valid = check.every(
    check.map(opts, {
      uniqid: check.unemptyString,
      provider: check.unemptyString,
      name: check.unemptyString,
      amount: check.number
    })
  );

  if (!valid) return callback(new utils.NamedError('Such not compute.', 400)); // Check if input is ok

  var tip = {
    _id: mongoose.Types.ObjectId().toString(), // Make ObjectId out here to return it
    amount: opts.amount,
    tippee: {
      name: opts.name,
      provider: opts.provider,
      uniqid: opts.uniqid
    }
  };

  tip.tipper = _.find(user.accounts, function (account) {
    return account.provider === opts.provider; // Get account corresponding to provider of current tip
  });

  if (!tip.tipper) return callback(new utils.NamedError('Not signed in with ' + opts.provider, 401));

  tip.tipper._id = undefined; // Remove for consistency


  var new_balance = user.balance - opts.amount;
  if (new_balance >= 0) { // Insecure balance check to improve UX
    queue.pushCommand('Tip', 'create', [user, tip]);

    user.balance = new_balance; // This is temporary and will be reset in the queue
    return user.save(function () {
      callback(null, user, tip);
    });
  } else {
    return callback(new utils.NamedError('Not enough doge.', 402));
  }
};


exports.resolveTip = function (user, tip_id, callback) {
  if (!check.unemptyString(tip_id)) return callback(new Error('No tip_id supplied.'));
  Tip.findOne({ _id: tip_id }, function (err, tip) {
    if (err) return callback(err);
    if (!tip) return callback(new utils.NamedError('No tip found.', 401));

    var is_tipper = _.find(user.accounts, function (account) {
      return account.provider === tip.tipper.provider && account.uniqid === tip.tipper.uniqid; // Get account corresponding to provider of current tip
    });

    var is_tippee = _.find(user.accounts, function (account) {
      return account.provider === tip.tippee.provider && account.uniqid === tip.tippee.uniqid; // Get account corresponding to provider of current tip
    });


    // There are many different error states here.
    // These are re-checked in the model when the request is made
    if (!is_tippee && !is_tipper) return callback(new utils.NamedError('This is not your tip.', 403));
    if (tip.state === 'claimed') return callback(new utils.NamedError('Tip has already been claimed.', 403)); // This should be considered insecure
    if (tip.state === 'canceled') return callback(new utils.NamedError('Tip has been cancelled.', 403)); // The real checking happens in the model
    if (tip.state !== 'created') return callback(new Error('Tip error.'));

    queue.pushCommand('Tip', 'resolve', [user, tip]);

    user.balance = user.balance + tip.amount; // This is temporary and will be reset in the queue
    user.save(function (err, user) {
      return callback(err, user, tip);
    });
  });
};


exports.withdraw = function (user, address, amount, callback) {
  if (!check.positiveNumber(amount)) return callback(new utils.NamedError('Invalid amount.', 400));
  if (!coinstring.validate(0x1E, address)) return callback(new utils.NamedError('Not a valid dogecoin address.', 400));

  if (user.balance - amount < 0) {
    return callback(new utils.NamedError('Not enough dogecoin.', 402)); // insecure
  }

  var new_balance = user.balance - amount;
  if (new_balance >= 0) { // Insecure balance check to improve UX
    queue.pushCommand('User', 'withdraw', [user, address, amount]);

    user.balance = new_balance; // This is temporary and will be reset in the queue
    return user.save(function () {
      callback(null, user);
    });
  } else {
    return callback(new utils.NamedError('Not enough doge.', 402));
  }
};