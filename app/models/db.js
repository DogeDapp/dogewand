'use strict';

var config = require('../../config/config')();
var pgutils = require('./pg-utils')(config.db);
var rpc = require('./rpc')(config.rpc);
var pg = require('pg');
var fs = require('fs');


exports.loadFunctions = function () {
  pg.connect(config.db, function (err, client, done) {
    client.query(fs.readFileSync(config.root + 'app/models/functions.sql'), function (err) {
      done(err);
    });
  });
};


exports.getUser = function (user_id, callback) {
  pgutils.query(function (client, done) {
    console.log('getuser');
    client.query(
      ['SELECT * FROM users',
      'INNER JOIN accounts ON accounts.user_id = users.user_id',
      'WHERE users.user_id = $1'].join('\n'),
      [ user_id ],
    function (err, result) {
      if (err) return done(err);

      var user = {
        user_id: result.rows[0].user_id,
        balance: parseInt(result.rows[0].balance, 10)
      };

      var accounts = result.rows.map(function (item) {
        delete item.user_id;
        delete item.balance;
        return item;
      });

      user.accounts = accounts;

      done(null, user);
    });
  }, callback);
};


// Need to have same provider as
exports.createTip = function (user_id, account_id, opts, callback) {
  pgutils.transaction(function (client, done) {

    client.query(
      ['SELECT * FROM accountInsertOrSelect($1, $2, $3)',
      'AS (account_id int, user_id int, uniqid text, provider text, display_name text)'].join('\n'),
      [ opts.uniqid, opts.provider, opts.display_name ],
    function (err, result) {
      if (err) return done(err);
      insertTip(result.rows[0].account_id);
    });

    function insertTip (tippee_id) {
      client.query(
        ['INSERT INTO tips (tipper_id, tippee_id, amount)',
        'VALUES ($1, $2, $3)',
        'RETURNING *;'].join('\n'),
        [ account_id, tippee_id, opts.amount ],
      function (err, result) {
        if (err) return done(err);
        updateBalance(result.rows[0].tip_id);
      });
    }

    function updateBalance (tip_id) {
      client.query(
        'UPDATE users SET balance = balance - $1 WHERE user_id = $2 RETURNING *',
        [ opts.amount, user_id ],
      function (err, result) {
        if (err) return done(err);
        done(null, result.rows[0].balance, tip_id);
      });
    }
  }, callback);
};



exports.resolveTip = function (tip_id, user_id, callback) {
  pgutils.transaction(function (client, done) {

    client.query(
      ['UPDATE tips t',
      'SET state = CASE WHEN t.tippee_id = a.account_id THEN \'claimed\'::tip_state',
                      'WHEN t.tipper_id = a.account_id THEN \'canceled\'::tip_state',
                      'END',
      'FROM accounts a WHERE user_id = $1 AND tip_id = $2 AND state = \'created\'::tip_state',
      'AND (t.tippee_id = a.account_id OR t.tipper_id = a.account_id)',
      'RETURNING *;'].join('\n'),
      [ user_id, tip_id ],
    function (err, result) {
      if (err) return done(err);
      if (!result.rowCount) return done(new Error('Resolve Error'));
      updateBalance(result.rows[0].amount);
    });

    function updateBalance (amount) {
      client.query(
        ['UPDATE users',
        'SET balance = balance + $1',
        'WHERE user_id = $2',
        'RETURNING balance;'].join('\n'),
        [ amount, user_id ],
      function (err, result) {
        if (err) return done(err);
        return done(null, result.rows[0]);
      });
    }
  }, callback);
};



exports.addDeposit = function (opts, callback) {
  pgutils.transaction(function (client, done) {

    var amount = Math.floor(opts.amount);

    client.query(
      ['INSERT INTO deposits (txid, address, amount)',
      'VALUES ($1, $2, $3)'].join('\n'),
      [ opts.txid, opts.address, amount ],
    function (err) {
      if (!err) {
        return updateBalance(amount, opts.address);
      }
      else if (err.code === '23505') { // If it is a unique key violation (very normal)
        done(null);
      }
      else {
        return done(err);
      }
    });

    function updateBalance (amount, address) {
      client.query(
        ['UPDATE users',
        'SET balance = balance + $1',
        'WHERE user_id = (',
          'SELECT user_id FROM user_addresses',
          'WHERE address = $2)'].join('\n'),
        [ amount, address ],
      function (err) {
        if (err) return done(err);
        return done(null);
      });
    }
  }, callback);
};


exports.withdraw = function (user_id, opts, callback) {
  pgutils.transaction(function (client, done) {

    var ret;

    client.query(
      ['UPDATE users',
      'SET balance = balance - $2',
      'WHERE user_id = $1',
      'RETURNING balance'].join('\n'),
      [ user_id, opts.amount ],
    function (err, result) {
      if (err) return done(err);
      ret.balance = result.rows[0].balance;
      return sendFunds();
    });

    function sendFunds () {
      rpc({
        method: 'send',
        params: [ opts.address, opts.amount ]
      }, function (err, result) {
        if (err) return done(err);
        return insertWithdrawal(result);
      });
    }

    function insertWithdrawal (txid) {
      client.query(
        ['INSERT INTO withdrawals (txid, amount, user_id)',
        'VALUES ($1, $2, $3)'].join('\n'),
        [ txid, user_id, opts.amount ],
      function (err, result) {
        if (err) return done(err);
        ret.withdrawal = result.rows;
        return done(ret);
      });
    }
  }, callback);
};


exports.auth = function (opts, callback) {
  pgutils.transaction(function (client, done) {

    client.query(
      ['SELECT * FROM accountinsertorupdate($1, $2, $3)',
      'AS (account_id int, user_id int, uniqid text, provider text, display_name text)'].join('\n'),
      [ opts.uniqid, opts.provider, opts.display_name ],
    function (err, result) {
      if (err) return done(err);
      var row = result.rows[0];
      if (!row.user_id) return insertUser(row.account_id); // If the account does not have a user make one
      return done(null, row.user_id);
    });

    function insertUser (account_id) {
      client.query(
        ['WITH u AS (',
          'INSERT INTO users (balance)',
          'VALUES (0)',
          'RETURNING user_id)',
        'UPDATE accounts',
        'SET user_id = (SELECT user_id FROM u)',
        'WHERE account_id = $1',
        'RETURNING user_id'].join('\n'),
        [ account_id ],
      function (err, result) {
        if (err) return done(err);
        var row = result.rows[0];
        return done(null, row.user_id);
      });
    }
  }, callback);
};


exports.mergeUsers = function (new_user, old_user, callback) {
  pgutils.transaction(function (client, done) {

    client.query(
      ['UPDATE users',
      'SET balance = balance + (',
        'SELECT balance FROM users',
        'WHERE user_id = $2)',
      'WHERE user_id = $1',
      'RETURNING *'].join('\n'),
      [ new_user, old_user ],
    function (err) {
      if (err) return done(err);
      return updateAccounts();
    });

    function updateAccounts () {
      client.query(
        ['UPDATE accounts',
        'SET user_id = $1',
        'WHERE user_id = $2'].join('\n'),
        [ new_user, old_user ],
      function (err) {
        if (err) return done(err);
        return updateAddresses();
      });
    }

    function updateAddresses () {
      client.query(
        ['UPDATE user_addresses',
        'SET user_id = $1',
        'WHERE user_id = $2'].join('\n'),
        [ new_user, old_user ],
      function (err) {
        if (err) return done(err);
        return deleteUser();
      });
    }

    function deleteUser () {
      client.query(
        ['DELETE FROM users',
        'WHERE user_id = $1'].join('\n'),
        [ old_user ],
      function (err) {
        if (err) return done(err);
        return done(null);
      });
    }
  }, callback);
};
