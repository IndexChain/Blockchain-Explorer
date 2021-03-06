var express = require('express')
  , path = require('path')
  , bitcoinapi = require('bitcoin-node-api')
  , favicon = require('static-favicon')
  , logger = require('morgan')
  , cookieParser = require('cookie-parser')
  , bodyParser = require('body-parser')
  , settings = require('./lib/settings')
  , routes = require('./routes/index')
  , lib = require('./lib/explorer')
  , db = require('./lib/database')
  , locale = require('./lib/locale')
  , request = require('request');

var app = express();

// bitcoinapi
bitcoinapi.setWalletDetails(settings.wallet);
if (settings.heavy != true) {
  bitcoinapi.setAccess('only', ['getinfo', 'getnetworkhashps', 'getmininginfo','getdifficulty', 'getmasternodecount', 'listmasternodes', 'getconnectioncount',
    'getblockcount', 'getblockhash', 'getblock', 'getrawtransaction', 'getpeerinfo', 'gettxoutsetinfo']);
} else {
  // enable additional heavy api calls
  /*
    getvote - Returns the current block reward vote setting.
    getmaxvote - Returns the maximum allowed vote for the current phase of voting.
    getphase - Returns the current voting phase ('Mint', 'Limit' or 'Sustain').
    getreward - Returns the current block reward, which has been decided democratically in the previous round of block reward voting.
    getnextrewardestimate - Returns an estimate for the next block reward based on the current state of decentralized voting.
    getnextrewardwhenstr - Returns string describing how long until the votes are tallied and the next block reward is computed.
    getnextrewardwhensec - Same as above, but returns integer seconds.
    getsupply - Returns the current money supply.
    getmaxmoney - Returns the maximum possible money supply.
  */
  bitcoinapi.setAccess('only', ['getinfo', 'getstakinginfo', 'getnetworkhashps', 'getdifficulty', 'getmasternodecount', 'listmasternodes', 'getconnectioncount',
    'getblockcount', 'getblockhash', 'getblock', 'getrawtransaction','getmaxmoney', 'getvote',
    'getmaxvote', 'getphase', 'getreward', 'getnextrewardestimate', 'getnextrewardwhenstr',
    'getnextrewardwhensec', 'getsupply', 'gettxoutsetinfo']);
}
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, settings.favicon)));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.use('/api', bitcoinapi.app);

var addToHeader = function (req, res, next) {
    console.log("add to header called ... " + req.url);
    // res.header("charset", "utf-8")
    var allowedOrigins = ['https://win.win', 'http://localhost:3001', 'http://test.win.win', "https://localhost:3001", 'http://map.win.win', 'https://map.win.win', 'http://167.99.83.22','http://167.99.83.22:3001'];
    var origin = req.headers.origin;
    res.header("Access-Control-Allow-Origin", "http://localhost:3001");
    if(allowedOrigins.indexOf(origin) > -1){
        res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Credentials", true);
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    // res.header("Content-Type", "application/json");
    next();
};

app.use('/', addToHeader,  routes);
app.use('/ext/getmoneysupply', function(req,res){
  lib.get_supply(function(supply){
    res.send(' '+supply);
  });
});

app.use('/ext/getstats', function(req,res){
  var return_hash = { };
  db.get_stats(settings.coin, function(stats){

  db.get_walletscount(function(total_wallets_count){
     return_hash.total_wallets_count = total_wallets_count;

     db.get_active_wallets_count(function(active_wallets_count){
      return_hash.active_wallets_count = active_wallets_count;

      lib.get_supply(function(supply){
        return_hash.money_supply = supply;

        lib.get_masternodecount(function(masterNodesCount) {
          return_hash.masternode_count = masterNodesCount.total;

          lib.get_blockcount(function (blockcount) {
            return_hash.block_count = blockcount;

            db.get_address('WmXhHCV6PjXjxJdSXPeC8e4PrY8qTQMBFg', function(address){
              return_hash.dev_wallet_balance = (address.balance / 100000000);

              var coinsLocked = masterNodesCount.total * settings.coininfo.masternode_required;
              var coinsLockedPerc = coinsLocked / (stats.supply/100);

              return_hash.twins_locked = coinsLockedPerc.toFixed(2);

              blocks_count = req.query.blocks_count || 300
              
              db.get_last_txs(1, 0, function(txs){
                time_from = txs[0].timestamp;
                tx_blockindex = txs[0].blockindex - blocks_count;
                db.get_tx_blockindex(tx_blockindex, function(tx){
                  time_to = tx.timestamp;
                  return_hash.average_sec_per_block = (time_from - time_to) / blocks_count;
                  res.send(return_hash);
                });
              });
            });
          });
        });
      });
    });
  });
  });
});

app.use('/ext/getwalletscount', function(req,res){
  if (settings.display.richlist == true ) {
    db.get_walletscount(function(count){
      res.send({total_wallets_count: count});
    });
  }
});

app.use('/ext/getactivewalletscount', function(req,res){
  if (settings.display.richlist == true ) {
    db.get_active_wallets_count(function(count){
      res.send({active_wallets_count: count});
    });
  }
});

app.use('/ext/getaddress/:hash', function(req,res){
  db.get_address(req.param('hash'), function(address){
    if (address) {
      var a_ext = {
        address: address.a_id,
        sent: (address.sent / 100000000),
        received: (address.received / 100000000),
        balance: (address.balance / 100000000).toString().replace(/(^-+)/mg, ''),
        last_txs: address.txs,
      };
      res.send(a_ext);
    } else {
      res.send({ error: 'address not found.', hash: req.param('hash')})
    }
  });
});

app.use('/ext/getbalance/:hash', function(req,res){
  db.get_address(req.param('hash'), function(address){
    if (address) {
      res.send((address.balance / 100000000).toString().replace(/(^-+)/mg, ''));
    } else {
      res.send({ error: 'address not found.', hash: req.param('hash')})
    }
  });
});

app.use('/ext/get_masternode_rewards/:address/:since', function(req, res){
    db.get_masternode_rewards(req.params.since, req.params.address,function(rewards){
        if(rewards){
            res.json(rewards);
        } else {
            res.send({error: "something wrong", hash: req.params.address, since: req.params.since});
        }
    })
})
app.use('/ext/get_market_trades/:market/:since/:limit', function(req, res){
    db.get_market_trades(req.params.market, req.params.since, req.params.limit,function(trades){
        if(trades){
            var order_trades = [];
            var order_trades_string = "";
            // trades.sort(function(a,b) {
            //     a.timestamp = b.timestamp;
            // })
            for(var i in trades) {
                var obj = {
                    tid:trades[i].tid,
                    timestamp:new Date(trades[i].timestamp * 1000).toLocaleString('en-IL', { timeZone: 'UTC' }),
                    price:trades[i].price,
                    amount:trades[i].amount
                };
                order_trades_string += JSON.stringify(obj) + '</br>';
                order_trades.push(obj);
            }
            // res.json(trades);
            res.send(order_trades_string);
        } else {
            res.send({error: "something wrong", limit: req.params.limit, since: req.params.since});
        }
    })
})

app.use('/ext/getmasternodelockcount', function(req,res){
    lib.get_masternodecount(function(masterNodesCount) {
        var coinsLocked = masterNodesCount.total * settings.coininfo.masternode_required;
        res.send(coinsLocked.toString());
    });
});

app.use('/ext/getdistribution', function(req,res){
  db.get_richlist(settings.coin, function(richlist){
    db.get_stats(settings.coin, function(stats){
      db.get_distribution(richlist, stats, function(dist){
        res.send(dist);
      });
    });
  });
});

app.use('/ext/getlasttxs/:min', function(req,res){
  db.get_last_txs(settings.index.last_txs, (req.params.min * 100000000), function(txs){
    res.send({data: txs});
  });
});

app.use('/ext/connections', function(req,res){
  db.get_peers(function(peers){
    res.send({data: peers});
  });
});

// locals
app.set('title', settings.title);
app.set('symbol', settings.symbol);
app.set('coin', settings.coin);
app.set('locale', locale);
app.set('display', settings.display);
app.set('markets', settings.markets);
app.set('twitter', settings.twitter);
app.set('facebook', settings.facebook);
app.set('googleplus', settings.googleplus);
app.set('youtube', settings.youtube);
app.set('discordapp', settings.discordapp);
app.set('telegram', settings.telegram);
app.set('bitcointalk', settings.bitcointalk);
app.set('genesis_block', settings.genesis_block);
app.set('index', settings.index);
app.set('heavy', settings.heavy);
app.set('txcount', settings.txcount);
app.set('nethash', settings.nethash);
app.set('nethash_units', settings.nethash_units);
app.set('show_sent_received', settings.show_sent_received);
app.set('logo', settings.logo);
app.set('theme', settings.theme);
app.set('labels', settings.labels);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
