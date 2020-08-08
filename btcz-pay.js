/**
* ==============================================================================
* BTCz-Pay
* ==============================================================================
*
* Version 0.2.0 (production v1.0)
*
* Self-hosted bitcoinZ payment gateway
* https://github.com/MarcelusCH/BTCz-Pay
*
* ------------------------------------------------------------------------------
* btcz-pay.js                                                  Main nodejs start
* ------------------------------------------------------------------------------
*
* Load the application server and set options
* Set the WebApp needed path (css, js, images,...)
* Load the API controlers
* Load/set currency exchange rate refreshing
* Startup the application server
*
* ==============================================================================
*/

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
let express = require('express')
let morgan = require('morgan')
let uuid = require('uuid')
let bodyParser = require('body-parser')
let rp = require('request-promise')


let logger = require('./utils/logger')      // Load the logger module
let config = require('./config')            // Load configuration file
require('./smoke-test')                     // Checking DB & BtcZ node RPC
require('./deploy-design-docs')             // Checking design docs in Couchdb

morgan.token('id', function getId (req) {
  return req.id
})

let app = express()
app.use(function (req, res, next) {
  req.id = uuid.v4()
  next()
})

// Application options
app.use(morgan(':id :remote-addr - :remote-user [:date[clf]] \
    ":method :url HTTP/:http-version" :status :res[content-length] \
    ":referrer" ":user-agent"'))
app.set('trust proxy', 'loopback')


app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json(null))

// WebApp needed path
app.use('/qr', express.static('qr'))
app.use('/css', express.static('docs/css'))
app.use('/js', express.static('docs/js'))
app.use('/images', express.static('docs/images'))

// For EJS rendering
app.set('views', __dirname + '/docs');
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// Load API controlers
app.use(require('./controllers/api'))
app.use(require('./controllers/website'))

// Curencies exchange rate global variables
global.btczUsd = 7000
global.btczEur = 6000
global.btczZar = 6000
global.btczJpy = 6000
global.btczChf = 6000
global.btczRub = 6000
global.btczCad = 6000
global.btczGbp = 6000
global.btczAud = 6000
global.btczBTC = 6000

// Currency exchange rate update function
let updateExchangeRate = async function (pair) {

  let requestOptions = {
    method: 'GET',
    uri: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
    qs: {
      symbol: 'BTCZ',
      convert: pair,
    },
    headers: {
      'X-CMC_PRO_API_KEY': config.coinmarketcap_API
    },
    json: true,
    gzip: true
  };

  rp(requestOptions).then(response => {

    var json = JSON.stringify(response);
    var json = JSON.parse(json);
    logger.log('Get currency exchange rate',
                [pair, json.data['BTCZ'].quote[pair].price])

    switch (pair) {
      case 'AUD': global.btczAud = json.data['BTCZ'].quote[pair].price; break
      case 'GBP': global.btczGbp = json.data['BTCZ'].quote[pair].price; break
      case 'CAD': global.btczCad = json.data['BTCZ'].quote[pair].price; break
      case 'RUB': global.btczRub = json.data['BTCZ'].quote[pair].price; break
      case 'USD': global.btczUsd = json.data['BTCZ'].quote[pair].price; break
      case 'EUR': global.btczEur = json.data['BTCZ'].quote[pair].price; break
      case 'ZAR': global.btczZar = json.data['BTCZ'].quote[pair].price; break
      case 'JPY': global.btczJpy = json.data['BTCZ'].quote[pair].price; break
      case 'CHF': global.btczChf = json.data['BTCZ'].quote[pair].price; break
      case 'BTC': global.btczBTC = json.data['BTCZ'].quote[pair].price; break
    }

  }).catch((err) => {
    logger.error('updateExchangeRate', err.message)
  });

}

// Refresh each currency exchange rate by interval
let CurArray = ['USD', 'EUR', 'BTC', 'CHF', 'GBP', 'RUB', 'AUD', 'CAD', 'ZAR', 'JPY']
CurArray.forEach(function(value){
  updateExchangeRate(value)
  setInterval(() => updateExchangeRate(value),
                      config.marketrate_refresh * 60 * 1000)
})



// Startup server
let server = app.listen(config.port, '127.0.0.1', function () {
  logger.log('BOOTING UP', ['Listening on port %d', config.port])
})

module.exports = server
