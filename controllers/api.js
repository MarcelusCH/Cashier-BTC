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
* api.js                                                 Required by btcz-pay.js
* ------------------------------------------------------------------------------
*
* Handles all bitcoinZ payment gateway API calls
* I.e. all calls responsible for invoicing and paying in BTCz
* or the exchange rate and gateway statistics calls.
*
* ==============================================================================
*/


let express = require('express')
let crypto = require('crypto')
let router = express.Router()
let config = require('../config')
let blockchain = require('../models/blockchain')
let storage = require('../models/storage')
let signer = require('../models/signer')
let logger = require('../utils/logger')
let rp = require('request-promise')



// -----------------------------------------------------------------------------
// Get payment request with optional parameters (as query ?)
// -----------------------------------------------------------------------------
router.get('/api/request_payment/', function (req, res) {

  // Mandatory query
  let expect = req.query.expect                 // Expected amount
  let currency = req.query.currency             // The currency code
  let seller = req.query.seller                 // The seller BTCz address
  let ipnPingback = req.query.ipnPingback       // The IPN pingback url

  // Optional query
  let message = req.query.message               // Simple message
  let customer = req.query.customerMail         // Customer eMail
  let cliSuccessURL = req.query.cliSuccessURL   // Success return URL
  let cliErrorURL = req.query.cliErrorURL       // Error return URL
  let SpeedSweep = req.query.SpeedSweep         // Speed Pay option
  let secret = req.query.secret                 // Secret phrase

  // Check if mandatory query are set
  if ((!expect) || (!currency) || (!seller) || (!ipnPingback)) {
    return res.send(JSON.stringify({'error': 'Mandatory query param not set'}))
  }

  // Check if the optional query are set
  if (!message) {message='na'}
  if (!customer) {customer='na'}
  if (!cliSuccessURL) {cliSuccessURL='na'}
  if (!cliErrorURL) {cliErrorURL='na'}
  if (!SpeedSweep) {SpeedSweep='0'}

  // Generate a secret phrase if not set
  if (!secret) {secret=crypto.randomBytes(20).toString('hex')}

  // redirect to the main router
  return res.redirect('/api/request_payment/'+expect+'/'+currency+'/'
                      +message+'/'+seller+'/'+customer+'/'
                      +encodeURIComponent(encodeURIComponent(ipnPingback))+'/'
                      +encodeURIComponent(encodeURIComponent(cliSuccessURL))+'/'
                      +encodeURIComponent(encodeURIComponent(cliErrorURL))+'/'
                      +SpeedSweep+'/'+secret)

}) // --------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// Get payment request full router (as param - main router)
// -----------------------------------------------------------------------------
router.get('/api/request_payment/:expect/:currency/:message/:seller/:customer/'
            +':ipnPingback/:cliSuccessURL/:cliErrorURL/:SpeedSweep/'
            +':secret/:time?', function (req, res) {

  // Set variables of request param
  let expect = req.params.expect                    // Expected amount
  let currency = req.params.currency                // The currency code
  let seller = req.params.seller                    // The seller BTCz address
  let ipnPingback = req.params.ipnPingback          // The IPN pingback url
  let message = req.params.message                  // Simple message
  let customer = req.params.customer                // Customer eMail
  let cliSuccessURL = req.params.cliSuccessURL      // Success return URL
  let cliErrorURL = req.params.cliErrorURL          // Error return URL
  let SpeedSweep = req.params.SpeedSweep            // Speed Pay option
  let secret = req.params.secret                    // Secret phrase
  let exchangeRate, btcToAsk, satoshiToAsk

  // Declare date now
  var ts = Date.now();
  if(req.params.time==1){
	   ts = Date.parse(new Date(new Date(ts).getTime() + 60 * 60 * 24 * 1000*7));
  }

  (async function () {

    // Check speed sweep and not more than x BTCZ
    if (SpeedSweep==1 && expect>config.speedSweep_max){
      return res.send(JSON.stringify({'error': 'To high amound for speed sweep'}))
    }

    // Check if address is valid
    if (!(signer.isAddressValid(seller))){
      return res.send(JSON.stringify({'error': 'Seller address not valide'}))
    }

    // Get client IP
    let clientIp = (req.headers['x-forwarded-for'] || '').split(',').pop() ||
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   req.connection.socket.remoteAddress

     let clientIp_t1 = req.headers['x-forwarded-for']
     let clientIp_t2 = req.connection.remoteAddress
     let clientIp_t3 = req.socket.remoteAddress
     let clientIp_t4 //= req.connection.socket.remoteAddress

    // Check maximum opend gateway by client (end if more as expected)
    clientIp=clientIp_t1 // Check/save the complete header...
    let gatewayOpenByIP = await storage.CountGatewayOpenByIP(clientIp)
    let totOpenByIP=gatewayOpenByIP.rows.length
    if (config.max_gateway_client>0 && totOpenByIP>config.max_gateway_client) {
      return res.send(JSON.stringify({'error': 'To many gateway open'}))
    } else {
      logger.log('/api/request_payment/', [ req.id, 'New gateway request by: '
                  +clientIp, 'Total open gateway: '+totOpenByIP, 'IP1: ' +clientIp_t1, 'IP2: ' +clientIp_t2, 'IP3: ' +clientIp_t3, 'IP4: ' +clientIp_t4])
    }

    // Get exchange rate
    switch (currency) {
      case 'AUD': exchangeRate = btczAud; break
      case 'GBP': exchangeRate = btczGbp; break
      case 'CAD': exchangeRate = btczCad; break
      case 'RUB': exchangeRate = btczRub; break
      case 'USD': exchangeRate = btczUsd; break
      case 'EUR': exchangeRate = btczEur; break
      case 'ZAR': exchangeRate = btczZar; break
      case 'JPY': exchangeRate = btczJpy; break
      case 'CHF': exchangeRate = btczChf; break
      case 'BTC': exchangeRate = btczBTC; break
      case 'BTCZ': exchangeRate = 1; break
      default:
        return res.send(JSON.stringify({'error': 'Bad currency'}))
    }

    // Set zatochi and unit.
    satoshiToAsk = Math.floor((expect / exchangeRate) * 100000000)
    btcToAsk = satoshiToAsk / 100000000

    // Generate payment address and set DB fields infos
    let PayAddress = signer.generateNewSegwitAddress()
    let addressData = {
      'timestamp': ts,
      'expect': expect,
      'currency': currency,
      'exchange_rate': exchangeRate,
      'btc_to_ask': btcToAsk,
      'message': message,
      'seller': seller,
      'customer': customer,
      'callback_url': decodeURIComponent(decodeURIComponent(ipnPingback)),
      'success_callback_url': decodeURIComponent(decodeURIComponent(cliSuccessURL)),
      'err_callback_url': decodeURIComponent(decodeURIComponent(cliErrorURL)),
      'WIF': PayAddress.WIF,
      'address': PayAddress.address,
      'doctype': 'address',
      'state': 0,
      'speed_sweep': SpeedSweep,
      'secret': secret,
      'ip' : clientIp,
      '_id': req.id
    }

    // If speed pay, add % to btcToAsk var
    if (SpeedSweep==1){
      btcToAsk=btcToAsk+((btcToAsk/100)*config.speed_sweep_fee)
      satoshiToAsk=satoshiToAsk+((satoshiToAsk/100)*config.speed_sweep_fee)
    }

    // Set payment info for QR
    let paymentInfo = {
      address: addressData.address,
      message: message,
      amount: satoshiToAsk
    }

    // Set API answer
    let answer = {
      'id': req.id,
      'secret': secret,
      'address': addressData.address,
      'link': signer.URI(paymentInfo),
      'qr': config.base_url_qr + '/generate_qr/' + encodeURIComponent(signer.URI(paymentInfo)),
      'qr_simple': config.base_url_qr + '/generate_qr/bitcoinz:' + addressData.address + '?amount=' + btcToAsk
    };

    // Get Seller's informations from db (if exist)
    let responseBody = await storage.getSellerPromise(seller)

    // If seller not exist in db, create it
    if (typeof responseBody.error !== 'undefined') {

      // Set seller info
      let sellerData = {
        'WIF': '',
        'address': seller,
        'timestamp': Date.now(),
        'seller': seller,
        '_id': seller,
        'doctype': 'seller'
      }

      // Store seller info in DB
      logger.log('/api/request_payment/', [ req.id, 'Create seller db entry: '+seller ])
      await storage.saveSellerPromise(seller, sellerData)
    } else { // seller exists
      logger.log('/api/request_payment/', [ req.id, 'Seller already exists: '+seller ])
    }

    // Store the payment adress info and import address in blockchain
    logger.log('/api/request_payment/', [ req.id, 'Create payment address: '+addressData.address ])
    await storage.saveAddressPromise(addressData)
    await blockchain.importaddress(addressData.address)

    // Return answer
    logger.log('/api/request_payment/', [ req.id, 'Return gateway id: '+req.id ])
    return res.send(JSON.stringify(answer))
  })().catch((error) => {
    logger.error('/api/request_payment/', [ req.id, error.message, error.stack ])
    return res.send(JSON.stringify({'error': 'API error, please contact the pay.btcz.app admin'}))
  })
}) // --------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// Check payment by the returned id from payment_request call
// -----------------------------------------------------------------------------
router.get('/api/check_payment/:_id', function (req, res) {

  // Get Gateway info by the id
  let PayAddress = [storage.getDocumentPromise(req.params._id)]
  Promise.all(PayAddress).then((values) => {
    let PayAddress = values[0].address
    let promises = [
      blockchain.getReceivedByAddress(PayAddress),
      storage.getDocumentPromise(req.params._id)
    ]

    Promise.all(promises).then((values) => {
      let received = values[0]
      let addressJson = values[1]

      // Check if return URL are valide
      let ErrCallback = addressJson.err_callback_url
      let SuccessCallback = addressJson.success_callback_url
      if (!signer.isUrlValid(ErrCallback)) {ErrCallback=''}
      if (!signer.isUrlValid(SuccessCallback)) {SuccessCallback=''}

      // Check if SpeedSweep and set extra fee
      let speed_sweep_fee = 0
      if (addressJson.speed_sweep==1){
        speed_sweep_fee=config.speed_sweep_fee
      }

      // Check if gateway is expired and not paid, return ExiredAnswer JSON.
      if (Date.now() > (addressJson.timestamp+(config.max_payment_valid*60000)) && addressJson.state != "5") {

        // If expired but state !=2, update state
        if (addressJson.state != "2") {
          rp({ uri: config.base_url+'/api/cancel/'+addressJson._id})
        }

        // Return Expired Gateway JSON
        let ExiredAnswer = {
          'error': 'gateway expired',
          'generated': addressJson.address,
          'btcz_expected': addressJson.btc_to_ask,
          'speed_sweep_fee': speed_sweep_fee,
          'btcz_actual': received[1].result,
          'btcz_unconfirmed': received[0].result,
          'currency': addressJson.currency,
          'amount': Math.round((addressJson.btc_to_ask * addressJson.exchange_rate) * 100) / 100,
          'timestamp_start' : addressJson.timestamp,
          'timestamp_now': Date.now(),
          'timestamp_stop' : addressJson.timestamp+(config.max_payment_valid*60000),
          'state': 2,
          'tx': addressJson.sweep_result,
          'err_callback_url': ErrCallback
        }
        return res.send(JSON.stringify(ExiredAnswer))
      }

      // If found in db (no storage error), return answer JSON.
      if (addressJson && addressJson.btc_to_ask && addressJson.doctype === 'address') {
        let answer = {
          'generated': addressJson.address,
          'btcz_expected': addressJson.btc_to_ask,
          'speed_sweep_fee': speed_sweep_fee,
          'btcz_actual': received[1].result,
          'btcz_unconfirmed': received[0].result,
          'currency': addressJson.currency,
          'amount': Math.round((addressJson.btc_to_ask * addressJson.exchange_rate) * 100) / 100,
          'timestamp_start' : addressJson.timestamp,
          'timestamp_now': Date.now(),
          'timestamp_stop' : addressJson.timestamp+(config.max_payment_valid*60000),
          'state': addressJson.state,
          'tx': addressJson.sweep_result
        }

        // Add success callback URL on state 5
        if (addressJson.state==5) {
          answer = {
            'generated': addressJson.address,
            'btcz_expected': addressJson.btc_to_ask,
            'speed_sweep_fee': speed_sweep_fee,
            'btcz_actual': received[1].result,
            'btcz_unconfirmed': received[0].result,
            'currency': addressJson.currency,
            'amount': Math.round((addressJson.btc_to_ask * addressJson.exchange_rate) * 100) / 100,
            'timestamp_start' : addressJson.timestamp,
            'timestamp_now': Date.now(),
            'timestamp_stop' : addressJson.timestamp+(config.max_payment_valid*60000),
            'state': addressJson.state,
            'tx': addressJson.sweep_result,
            'success_callback_url': SuccessCallback
          }
        }

        // Return answer JSON if not expired or paid
        return res.send(JSON.stringify(answer))
      }

      // Return error if nothing found in db
      return res.send(JSON.stringify({'error': 'Gateway not found'}))
    })
  })
}) // --------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// Cancel invoice
// -----------------------------------------------------------------------------
router.get('/api/cancel/:_id', function (req, res) {

  // Get gateway informations
  let row = [storage.getDocumentPromise(req.params._id)]
  Promise.all(row).then((values) => {

    let json = {
      '_id': req.params._id,
      '_rev': values[0]._rev,
      'state': 2,
      'timestamp': values[0].timestamp,
      'expect': values[0].expect,
      'currency': values[0].currency,
      'exchange_rate': values[0].exchange_rate,
      'btc_to_ask': values[0].btc_to_ask,
      'message': values[0].message,
      'seller': values[0].seller,
      'customer': values[0].customer,
      'callback_url': values[0].callback_url,
      'success_callback_url': values[0].success_callback_url,
      'err_callback_url': values[0].err_callback_url,
      'WIF': values[0].WIF,
      'address': values[0].address,
      'speed_sweep': values[0].speed_sweep,
      'secret': values[0].secret,
      'doctype': 'address',
      'processed' : 'expired',
      'sweep_result' : values[0].sweep_result,
      'ip' : values[0].ip
    }

    // Check if not paid
    if (values[0].state==0 || values[0].state==1){

      // Change gateway state
      logger.log('/api/cancel/', [req.id, 'Cancelled gateway: '+ req.params._id])
      storage.saveJobResultsPromise(json)

      // Set callback URL parameter
      let URLset = values[0].callback_url
      if (URLset.indexOf('?') !== -1) {
        URLset = URLset +'&secret='+values[0].secret+'&state=2'
      } else {
        URLset = URLset +'?secret='+values[0].secret+'&state=2'
      }

      // Fire server side pingback
      rp({uri: URLset}).then((result) => {
        logger.log('/api/cancel/', [req.id, 'Pingback expired done: ' , URLset])
      }).catch((error) => {
        logger.error('/api/cancel/', [req.id, 'Pingback expired fail: ' , URLset, error.message, error.stack])
      })
    }

  }).catch((error) => {
    logger.error('/api/cancel/', [ req.id, error.message, error.stack ])
    return res.send(JSON.stringify({error: error.message}))
  })
}) // --------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// Accept invoice (continue to barrecode template section)
// -----------------------------------------------------------------------------
router.get('/api/accept/:_id', function (req, res) {

  // Get gateway informations
  let row = [storage.getDocumentPromise(req.params._id)]
  Promise.all(row).then((values) => {

    let json = {
      '_id': req.params._id,
      '_rev': values[0]._rev,
      'state': 1,
      'timestamp': values[0].timestamp,
      'expect': values[0].expect,
      'currency': values[0].currency,
      'exchange_rate': values[0].exchange_rate,
      'btc_to_ask': values[0].btc_to_ask,
      'message': values[0].message,
      'seller': values[0].seller,
      'customer': values[0].customer,
      'callback_url': values[0].callback_url,
      'success_callback_url': values[0].success_callback_url,
      'err_callback_url': values[0].err_callback_url,
      'WIF': values[0].WIF,
      'address': values[0].address,
      'speed_sweep': values[0].speed_sweep,
      'secret': values[0].secret,
      'doctype': 'address',
      'processed' : values[0].processed,
      'sweep_result' : values[0].sweep_result,
      'ip' : values[0].ip
    }

    // Change gateway state to 1
    if (values[0].state==0){
      logger.log('/api/accept/', [req.id, 'Accepted gateway: '+ req.params._id])
      storage.saveJobResultsPromise(json)
    }

  }).catch((error) => {
    logger.error('/api/accept/', [ req.id, error.message, error.stack ])
    return res.send(JSON.stringify({error: error.message}))
  })
}) // --------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// Get exchage rate
// -----------------------------------------------------------------------------
router.get('/api/get_btcz_rate', function (req, res) {

  let answer = {
    'AUD': btczAud,
    'GBP': btczGbp,
    'CAD': btczCad,
    'RUB': btczRub,
    'USD': btczUsd,
    'EUR': btczEur,
    'ZAR': btczZar,
    'JPY': btczJpy,
    'CHF': btczChf,
    'BTC': btczBTC
  };

  res.send(JSON.stringify(answer))

}) // --------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// Get stats
// -----------------------------------------------------------------------------
router.get('/api/stats/CountGateway', function (req, res) {

  let gatewayTot = [storage.CountGateway()]
  Promise.all(gatewayTot).then((values) => {

    let answer = {
      'nb': JSON.parse(values).total_rows
    };

    res.send(JSON.stringify(answer))

  })

})

router.get('/api/stats/CountGatewayExpired', function (req, res) {

  let gatewayTot = [storage.CountGatewayExpired()]
  Promise.all(gatewayTot).then((values) => {

    let answer = {
      'nb': JSON.parse(values).total_rows
    };

    res.send(JSON.stringify(answer))

  })

})

router.get('/api/stats/CountGatewayPaid', function (req, res) {

  let gatewayTot = [storage.CountGatewayPaid()]
  Promise.all(gatewayTot).then((values) => {

    let answer = {
      'nb': JSON.parse(values).total_rows
    };

    res.send(JSON.stringify(answer))

  })

})
// -----------------------------------------------------------------------------


module.exports = router
